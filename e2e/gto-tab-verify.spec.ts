// GTO 탭 재구성 — **브라우저에서 실제로 그려지는가** (2026-09-11 오너 지시)
//
// 계약 테스트(src/components/features/tools/gtoContract.test.ts)는 소스를 읽어 IA·문구를 잠근다.
// 그것만으로는 "빌드에 들어갔지만 화면에는 안 뜬다" 를 못 잡는다 — 실제로 한 번 그런 상태였다.
// 이 스펙은 프로덕션 번들을 브라우저에 띄워 다음을 확인한다:
//   ① 4갈래 흐름이 칩·소제목으로 서고, 각 갈래가 자기 도구만 보여준다
//   ② #tool= 딥링크가 살아 있다(공유 링크 하위호환)
//   ③ 전략 결과 옆 **출처 배지**가 눈에 보인다 — solver 아님을 스크롤 없이 읽을 수 있다
//   ④ 무거운 도구 번들은 열기 전에는 안 받는다(lazy)
//   ⑤ 가로 스크롤 0 · 터치 영역 44px · 보이는 포커스 링 — 5개 뷰포트 전부
//
// ⚠ 로그인은 stubLogin 으로 **로컬에서만** 만든다(운영 DB 무접촉). 서버 권한 검증 용도가 아니다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

/** 오너가 지정한 검증 뷰포트 5종 */
const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '375x812', width: 375, height: 812 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
];

/**
 * ⚠ 딥링크(hash)로 들어갈 때는 dismissOverlays 를 부르지 않는다 —
 *   그 헬퍼는 `[role="dialog"]` 안의 '닫기' 를 누르는데, 도구 창이 바로 그 모양이라
 *   검사하려던 창을 스스로 닫는다(청크가 늦게 오면 통과, 빨리 오면 실패하는 간헐 실패였다).
 *   재동의 게이트는 stubLogin 이 현재 약관 버전을 심어 애초에 뜨지 않는다.
 */
async function openTools(page: Page, hash = '') {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.goto(`/?tab=tools${hash}`);
  if (hash) {
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
    await expect(page.getByRole('dialog').first(), `${hash} 딥링크로 도구가 열리지 않았다`)
      .toBeVisible({ timeout: 20_000 });
    return;
  }
  await dismissOverlays(page);
  await expect(page.locator('[data-tools-lanebar]')).toBeVisible({ timeout: 20_000 });
}

test.describe('GTO 탭 — 4갈래 흐름이 화면에 선다', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 375, height: 812 }); });

  // 2026-09-14 오너 결정 "분류를 합쳐서 한 줄로": 토너먼트 랩이 규칙 · 대회에 합쳐져 칩 5개(전체 + 4갈래)다.
  test('🔴 레인 칩 5개(전체 + 4갈래)가 서고, 갈래를 고르면 그 갈래만 남는다', async ({ page }) => {
    await openTools(page);
    const bar = page.locator('[data-tools-lanebar]');
    for (const label of ['전체', '규칙 · 대회', '전략 탐색', '트레이너', '핸드 리뷰']) {
      await expect(bar.getByRole('button', { name: label, exact: true }), `레인 칩 '${label}' 이 없다`).toBeVisible();
    }
    await expect(bar.getByRole('button'), '칩 수가 다르다 — 갈래가 늘거나 줄었다').toHaveCount(5);
    // 360px 에서도 칩이 **한 줄**이다 — 합친 이유가 이것이다(두 줄이면 다시 고아 줄바꿈이 난다).
    // 375 에서는 합치기만으로도 한 줄이라 검사가 안 울린다 — 실측(2026-09-14): 360 바 326px vs 칩 px-2.5 337.9 / px-2 316.6.
    await page.setViewportSize({ width: 360, height: 812 });
    const tops = await bar.getByRole('button').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
    expect(tops, '레인 칩이 360px 에서 두 줄로 접혔다').toHaveLength(1);
    await page.setViewportSize({ width: 375, height: 812 });
    // '전체' 에서는 4개 섹션이 전부 보인다 — 빈 섹션을 만들지 않는다
    const panel = page.locator('[data-tools-lanepanel]');
    await expect(panel.locator('section')).toHaveCount(4);

    // '자주 쓰는 도구'(오너 지시 2026-09-14) — '전체' 에서 카탈로그 위에 4개, 카탈로그에는 같은 카드가 없다(중복 0)
    const featured = page.getByTestId('tools-featured');
    await expect(featured, "'자주 쓰는 도구' 섹션이 없다").toBeVisible();
    for (const k of ['spot', 'range', 'pushfold', 'gto']) {
      await expect(featured.locator(`[data-testid="tool-${k}"]`), `tool-${k} 가 자주 쓰는 도구에 없다`).toBeVisible();
      await expect(page.locator(`[data-testid="tool-${k}"]`), `tool-${k} 가 두 번 그려졌다`).toHaveCount(1);
    }

    // 한 갈래를 고르면 섹션이 하나만 남고, '자주 쓰는 도구'는 사라지며 그 도구는 제 갈래로 돌아온다
    await bar.getByRole('button', { name: '전략 탐색', exact: true }).click();
    await expect(panel.locator('section')).toHaveCount(1);
    await expect(featured, '갈래를 골랐는데 자주 쓰는 도구가 위에 남아 있다').toHaveCount(0);
    // 전략 탐색 갈래의 도구가 실제로 그 안에 있다
    for (const k of ['range', 'pushfold', 'aggro', 'rvr']) {
      await expect(panel.locator(`[data-testid="tool-${k}"]`), `tool-${k} 가 전략 탐색에 없다`).toBeVisible();
    }
    // 다른 갈래 도구는 걸러졌다
    await expect(panel.locator('[data-testid="tool-icm"]')).toHaveCount(0);
  });

  test('🔴 캘린더로 이관한 자금 도구 2종은 GTO 카탈로그에 없다 — 그래도 딥링크는 연다', async ({ page }) => {
    await openTools(page);
    await expect(page.locator('[data-testid="tool-bankroll"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="tool-variance"]')).toHaveCount(0);

    // 하위호환: 예전 공유 링크(#tool=bankroll)는 그대로 열려야 한다.
    // ⚠ 여기서 dismissOverlays 를 부르면 안 된다 — 그 헬퍼는 `[role="dialog"]` 안의 '닫기' 를 누르는데
    //   도구 창이 바로 그 모양이라, 청크가 빨리 오면 검사하려던 창을 스스로 닫는다(전체 스위트 부하에서 재현).
    //   openTools(hash) 가 쓰는 것과 같은 방식으로 마운트 마커만 기다린다.
    await page.goto('/?tab=tools#tool=bankroll');
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
    await expect(page.getByRole('dialog').first(),
      '이관했다고 딥링크까지 죽으면 공유 링크가 깨진다').toBeVisible({ timeout: 20_000 });
  });

  test('🔴 매장 운영 5종도 GTO 카탈로그에 없다', async ({ page }) => {
    await openTools(page);
    for (const k of ['chip', 'sim', 'blindgen', 'payout', 'endtime']) {
      await expect(page.locator(`[data-testid="tool-${k}"]`), `${k} 가 GTO 탭으로 돌아왔다`).toHaveCount(0);
    }
  });
});

test.describe('GTO 도구 — 출처 배지가 눈에 보인다', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 375, height: 812 }); });

  // [딥링크 키, 기대 배지 kind, 배지에 들어갈 라벨]
  const CASES: [string, string, string][] = [
    ['range', 'chart', '자체 제작 학습 차트'],
    ['pushfold', 'nash', '자체 Nash 모델'],
  ];

  for (const [key, kind, label] of CASES) {
    test(`🔴 #tool=${key} — '${label}' 배지가 결과 옆에 보인다`, async ({ page }) => {
      await openTools(page, `#tool=${key}`);
      const dialog = page.getByRole('dialog').first();
      await expect(dialog).toBeVisible({ timeout: 20_000 });

      const badge = dialog.locator(`[data-source-badge="${kind}"]`).first();
      await expect(badge, `${key} 에 ${kind} 배지가 화면에 없다`).toBeVisible({ timeout: 15_000 });
      await expect(badge).toContainText(label);
      // 근거를 읽을 수 있어야 한다(모바일은 길게 눌러 title 확인)
      const hint = await badge.getAttribute('title');
      expect((hint ?? '').length > 20, '배지에 근거 설명이 없다').toBeTruthy();
      // 'solver' 라고 말하지 않는다 — 이 앱에 solver 데이터는 없다
      await expect(dialog.locator('[data-source-badge="solver"]')).toHaveCount(0);
    });
  }

  test('🔴 푸시·폴드 차트는 자체 데이터가 재현 불가임을 화면에 적어 둔다', async ({ page }) => {
    await openTools(page, '#tool=pushfold');
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText('생성기 재현 필요').first()).toBeVisible({ timeout: 15_000 });
  });

  test('🔴 레인지 차트 배지가 100bb 기준임을 함께 말한다', async ({ page }) => {
    await openTools(page, '#tool=range');
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-source-badge="chart"]').first()).toContainText('100bb');
  });

  test('🔴 어느 도구도 화면에 solver 배지를 띄우지 않는다', async ({ page }) => {
    await stubLogin(page);
    await stabilizeBackstack(page);
    for (const k of ['range', 'pushfold', 'rvr', 'aggro']) {
      await page.goto(`/?tab=tools#tool=${k}`);
      await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
      await expect(page.getByRole('dialog').first(), `#tool=${k} 가 안 열린다`).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('[data-source-badge="solver"]'), `${k} 가 solver 를 자칭한다`).toHaveCount(0);
    }
  });
});

test.describe('GTO — 무거운 데이터는 첫 화면 임계 경로에 없다 (lazy)', () => {
  // 도구들은 ToolsPanel 청크 안에 함께 있다(도구별 lazy 가 아니다 — 열 때마다 왕복이 생겨 더 느리다).
  // 그리고 App.tsx:1300 warm() 이 **첫 화면을 그린 뒤 idle 에** 이 청크를 미리 받아 둔다(의도된 동작).
  // 그래서 '언젠가 받는가' 는 계약이 아니다. 계약은 **첫 화면이 서기 전에는 안 받는다** 이다.
  test('🔴 첫 화면이 서기 전에는 GTO 청크를 받지 않는다 — idle 예열은 그 뒤다', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/\/assets\/.*\.js(\?|$)/.test(u)) chunks.push(u.split('/').pop() ?? u);
    });
    await stubLogin(page);
    await stabilizeBackstack(page);
    // 마운트 마커가 DOM 에 **들어간 순간**을 페이지 시계(performance.now)로 찍는다.
    // ⚠ 2026-09-14 실측: 종전에는 waitForSelector 가 마커를 **발견한** 시점까지의 요청을 임계 경로로 셌는데,
    //   waitForSelector 는 폴링이라 마커가 이미 떠 있어도 다음 폴까지 수십 ms 가 비고, 그 사이 idle 예열
    //   (App.tsx warm — 일정 도착 뒤 requestIdleCallback)이 먼저 시작하면 정상 동작이 회귀로 잡혔다
    //   (HEAD 기준선 빌드에서도 20회 중 3회 실패 — 앱이 아니라 측정의 경쟁이었다). 리소스 타이밍의 startTime 을
    //   마커 삽입 시각과 비교하면 경쟁이 없다. 계약은 그대로다: 첫 화면이 서기 **전에** GTO 청크를 받지 않는다.
    await page.addInitScript(() => {
      const w = window as unknown as { __firstScreenAt?: number; __preloadAtMark?: string[] };
      const mark = () => {
        if (!document.querySelector('button[aria-label^="알림"]')) return false;
        w.__firstScreenAt = performance.now();
        // ⚠ modulepreload 는 마커 **시점**의 것만 센다 — Vite 의 동적 import 헬퍼가 idle 예열 때 의존 청크의
        //   modulepreload 링크를 나중에 DOM 에 넣으므로, 평가 시점에 읽으면 정상 예열이 회귀로 잡힌다.
        w.__preloadAtMark = [...document.querySelectorAll('link[rel="modulepreload"]')].map((l) => (l as HTMLLinkElement).href);
        return true;
      };
      // ⚠ init script 시점엔 <html> 이 아직 없을 수 있다(documentElement=null) — Document 노드를 관찰한다.
      if (!mark()) new MutationObserver((_, o) => { if (mark()) o.disconnect(); }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/');
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
    const critical = await page.evaluate(() => {
      const w = window as unknown as { __firstScreenAt?: number; __preloadAtMark?: string[] };
      const t0 = w.__firstScreenAt ?? 0;
      const gto = /ToolsPanel|GtoDeep|useDeepGto/i;
      // ① 첫 화면 시점의 정적 그래프·프리로드에 실리지 않았다(임계 경로의 본체)
      const preloaded = (w.__preloadAtMark ?? []).map((h) => h.split('/').pop() ?? '').filter((n) => gto.test(n));
      // ② 마커가 DOM 에 들어가기 전에 시작된 GTO 청크 요청이 없다
      const early = performance.getEntriesByType('resource')
        .filter((e) => gto.test(e.name) && e.startTime < t0).map((e) => e.name.split('/').pop() ?? e.name);
      return { t0, preloaded, early };
    });
    expect(critical.t0, '첫 화면 마커 시각을 못 찍었다').toBeGreaterThan(0);
    expect(critical.preloaded, `GTO 청크가 modulepreload 에 실렸다: ${critical.preloaded.join(', ')}`).toEqual([]);
    expect(critical.early, `첫 화면이 서기 전에 GTO 청크를 받았다: ${critical.early.join(', ')}`).toEqual([]);

    // idle 예열이 실제로 돈다(도구 탭을 눌렀을 때 스피너를 안 보게 하는 장치) — 죽어 있으면 그것도 회귀다
    await expect.poll(() => chunks.some((c) => /ToolsPanel/i.test(c)), {
      message: 'idle 예열이 죽었다 — GTO 탭 첫 진입에서 Suspense 폴백이 보인다', timeout: 20_000,
    }).toBe(true);
  });
});

test.describe('GTO 탭 — 뷰포트 매트릭스', () => {
  for (const vp of VIEWPORTS) {
    test(`🔴 ${vp.name} — 가로 스크롤 0 · 터치 영역 44px · 보이는 포커스`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openTools(page);

      // ① 가로 스크롤이 없다
      const over = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.doc, `문서가 ${over.doc}px 가로로 넘친다`).toBeLessThanOrEqual(1);
      expect(over.body, `body 가 ${over.body}px 가로로 넘친다`).toBeLessThanOrEqual(1);

      // ② 44px 터치 영역 — **박스 높이가 아니라 실제로 손가락이 닿는 범위**를 잰다.
      //    이 앱은 보이는 칩은 34px 로 두고 `.tap-y-44::before { inset: -6px 0 }` 로 위아래 6px 씩
      //    넓힌다(src/index.css:796). 그래서 getBoundingClientRect 만 보면 전부 미달로 잘못 읽힌다.
      //    elementFromPoint 로 위아래 끝을 눌러 보고, 그 점이 이 요소로 오면 잡히는 것이다.
      const small = await page.locator('[data-tools-lanebar] button, [data-testid^="tool-"]').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          if (r.height <= 0) return null;
          const x = Math.round(r.left + r.width / 2);
          const hits = (y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
          // 박스 위/아래로 얼마나 더 잡히는지 — 최대 12px 까지만 본다(44 - 34 = 10 이면 충분)
          let top = r.top, bottom = r.bottom;
          for (let d = 1; d <= 12; d++) { if (!hits(Math.round(r.top) - d)) break; top = r.top - d; }
          for (let d = 1; d <= 12; d++) { if (!hits(Math.round(r.bottom) + d)) break; bottom = r.bottom + d; }
          return { t: (e.textContent ?? '').trim().slice(0, 12), h: Math.round(bottom - top) };
        }).filter((x): x is { t: string; h: number } => !!x && x.h < 44));
      expect(small, `44px 미만 터치 대상: ${JSON.stringify(small)}`).toEqual([]);

      // ③ 키보드 포커스가 보인다 — outline 또는 box-shadow 로 표시된다
      const card = page.locator('[data-testid="tool-range"]');
      await card.focus();
      const focus = await card.evaluate((el) => {
        const s = getComputedStyle(el);
        return { outline: s.outlineStyle, w: parseFloat(s.outlineWidth) || 0, shadow: s.boxShadow };
      });
      const ok = (focus.outline !== 'none' && focus.w >= 1) || (focus.shadow !== 'none' && focus.shadow !== '');
      expect(ok, `포커스 표시가 없다: ${JSON.stringify(focus)}`).toBe(true);
    });
  }
});
