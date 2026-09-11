// NURI SPOT — 브라우저에서 실제로 서는가 (2026-09-11 오너 지시)
//
// 계약 테스트(gtoContract.test.ts)는 소스 문자열을 읽어 IA·등급을 잠근다.
// 그것만으로는 "빌드에는 들어갔는데 화면에는 안 뜬다"·"글자가 잘린다"를 못 잡는다.
// 이 스펙은 프로덕션 번들을 띄워 다음을 확인한다:
//   ① GTO 홈 첫 화면에서 **NURI SPOT · 차트 · 트레이너 셋이 함께** 읽힌다
//   ② 스팟 화면이 열리고 분석·내 스팟 두 축이 선다(토론은 게시판 몫이라 도구에 없다)
//   ③ 카드를 넣으면 등급 배지와 수치가 뜨고, **solver 를 자칭하지 않는다**
//   ④ 액션 타임라인에 행이 쌓인다
//   ⑤ 5개 뷰포트에서 가로 스크롤 0 · 터치 영역 44px
//   ⑥ 기존 #tool=gto · #tool=replay 딥링크가 살아 있다
//
// ⚠ 로그인은 stubLogin 으로 로컬에서만 만든다(운영 DB 무접촉). _fixtures 가 비-GET 을 끊는다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

async function openTools(page: Page, hash = '') {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.goto(`/?tab=tools${hash}`);
  if (hash) {
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
    await expect(page.getByRole('dialog').first(), `${hash} 딥링크가 안 열린다`).toBeVisible({ timeout: 20_000 });
    return;
  }
  await dismissOverlays(page);
  await expect(page.locator('[data-tools-lanebar]')).toBeVisible({ timeout: 20_000 });
}

/** 스팟 도구를 열고 다이얼로그를 돌려준다 */
async function openSpot(page: Page) {
  await openTools(page);
  await page.getByTestId('spot-hero').getByRole('button', { name: '새 스팟 분석' }).click();
  const dlg = page.getByRole('dialog').first();
  await expect(dlg, 'NURI SPOT 이 안 열린다').toBeVisible({ timeout: 20_000 });
  await expect(dlg.getByText('NURI SPOT', { exact: true })).toBeVisible({ timeout: 15_000 });
  return dlg;
}

test.describe('GTO 홈 — NURI SPOT 이 대표로 선다', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 첫 화면에서 NURI SPOT · 차트 · 트레이너 셋이 함께 읽힌다', async ({ page }) => {
    await openTools(page);
    const hero = page.getByTestId('spot-hero');
    await expect(hero, '대표 카드가 없다').toBeVisible();
    await expect(hero.getByText('핸드 분석 · 리플레이 · 토론')).toBeVisible();
    await expect(hero.getByRole('button', { name: '새 스팟 분석' })).toBeVisible();
    await expect(hero.getByRole('button', { name: '내 스팟' })).toBeVisible();

    // 대표 카드가 첫 화면을 다 먹지 않는다 — 차트·트레이너 진입점이 스크롤 없이 함께 보여야 한다
    const box = await hero.boundingBox();
    expect(box, '대표 카드 박스를 못 읽었다').not.toBeNull();
    expect(box!.height, `대표 카드가 ${box!.height}px 로 첫 화면을 먹는다`).toBeLessThan(200);

    await expect(page.locator('[data-testid="tool-range"]'), '프리플랍 레인지 차트가 사라졌다').toBeVisible();
    await expect(page.locator('[data-testid="tool-trainer"]'), '프리플랍 트레이너가 사라졌다').toBeVisible();
    await expect(page.locator('[data-testid="tool-spot"]'), '카탈로그에도 스팟이 있어야 한다').toBeVisible();
  });

  test('🔴 레인은 여전히 5갈래 · 칩 6개 — 기존 계약을 깨지 않았다', async ({ page }) => {
    await openTools(page);
    const bar = page.locator('[data-tools-lanebar]');
    for (const label of ['전체', '전략 탐색', '트레이너', '핸드 리뷰', '토너먼트 랩', '규칙 · 수학']) {
      await expect(bar.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.locator('[data-tools-lanepanel] section')).toHaveCount(5);
  });

  test('🔴 기존 핸드 분석·리플레이 딥링크가 살아 있다', async ({ page }) => {
    await stubLogin(page);
    await stabilizeBackstack(page);
    for (const k of ['gto', 'replay', 'spot']) {
      await page.goto(`/?tab=tools#tool=${k}`);
      await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
      await expect(page.getByRole('dialog').first(), `#tool=${k} 가 안 열린다`).toBeVisible({ timeout: 20_000 });
    }
  });
});

test.describe('NURI SPOT — 분석 흐름', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 두 축(분석 · 내 스팟)만 선다 — 토론 축은 도구에 없다', async ({ page }) => {
    const dlg = await openSpot(page);
    for (const t of ['분석', '내 스팟']) {
      await expect(dlg.getByRole('tab', { name: t, exact: true }), `${t} 축이 없다`).toBeVisible();
    }
    // 오너 지시(2026-09-11): "절대 저 탭에서 뭔가 대화를 하게 하면 안 되고
    //   모든 대화는 커뮤니티 메뉴에서 해야 해." → 토론 축 자체가 없어야 한다.
    await expect(dlg.getByRole('tab', { name: '스팟 토론', exact: true }),
      '도구 안에 토론 축이 남아 있다').toHaveCount(0);
    await expect(dlg.getByRole('tab'), '축은 둘뿐이어야 한다').toHaveCount(2);

    await dlg.getByRole('tab', { name: '내 스팟', exact: true }).click();
    await expect(dlg.getByText(/저장한 스팟이 없어요|로그인하면 스팟을/)).toBeVisible({ timeout: 10_000 });
  });

  test('🔴 도구 안에서는 대화를 할 수 없다 — 입력·댓글·투표가 전혀 없다', async ({ page }) => {
    const dlg = await openSpot(page);
    // 대화 UI 의 흔적이 하나라도 있으면 안 된다. 모든 대화는 커뮤니티에서만.
    await expect(dlg.locator('textarea[placeholder*="댓글"]')).toHaveCount(0);
    await expect(dlg.getByRole('button', { name: /^(등록|댓글 달기|답글)$/ })).toHaveCount(0);
    await expect(dlg.getByPlaceholder(/댓글|답글|의견/)).toHaveCount(0);
    // 게시판으로 **가는 길**은 남아 있어야 한다(길까지 없애면 토론을 구경할 수도 없다)
    await expect(dlg.getByRole('button', { name: /게시판 토론/ }), '게시판으로 가는 길이 없다').toBeVisible();
  });

  test('🔴 카드를 넣으면 리포트가 등급과 수치를 보여준다 — solver 를 자칭하지 않는다', async ({ page }) => {
    const dlg = await openSpot(page);
    const report = dlg.getByLabel('스팟 리포트');
    await expect(report, '리포트 영역이 없다').toBeVisible();

    // 내 카드 2장 — CardGridPicker 의 data-card 훅으로 정확히 집는다(라벨 문구에 결합하지 않는다)
    await dlg.locator('button[data-card="As"]').click();
    await dlg.locator('button[data-card="Ks"]').click();
    await page.waitForTimeout(900);

    // 등급 배지가 뜬다(어떤 등급이든) — 그리고 절대 solver 가 아니다
    await expect(report.locator('[data-source-badge]').first()).toBeVisible({ timeout: 10_000 });
    await expect(report.locator('[data-source-badge="exact_solver"]'),
      '검증된 솔버 데이터가 없는데 솔버 등급을 자칭한다').toHaveCount(0);
    // ⚠ 본문에는 '솔버 기준 등급은 사용하지 않습니다' 라는 **고지**가 있다 — 그건 자칭이 아니다.
    //   자칭 여부는 등급 배지 하나로만 판정한다.
    const badge = report.locator('[data-source-badge]').first();
    await expect(badge).not.toHaveText('솔버 기준');
    await expect(await badge.getAttribute('data-source-badge')).not.toBe('exact_solver');
    await expect(report.getByText(/데이터 버전/)).toBeVisible();
    // 등급이 무엇이든 근거 문장이 함께 있어야 한다(빈 배지 금지)
    expect((await badge.getAttribute('title'))?.length ?? 0).toBeGreaterThan(20);
  });

  test('🔴 액션 타임라인에 행이 쌓이고 지워진다', async ({ page }) => {
    const dlg = await openSpot(page);
    await expect(dlg.getByText('액션 순서')).toBeVisible();
    await expect(dlg.getByText('아직 액션이 없습니다.')).toBeVisible();

    await dlg.getByRole('button', { name: '액션 추가' }).click();
    await page.waitForTimeout(300);
    await expect(dlg.getByText('아직 액션이 없습니다.'), '액션을 추가했는데 빈 상태 그대로다').toHaveCount(0);
    await expect(dlg.getByText('프리플랍', { exact: true }).first()).toBeVisible();

    // 삭제 버튼(aria-label 로 잡는다 — 라벨 텍스트에 결합하지 않는다)
    await dlg.getByRole('button', { name: /삭제$/ }).first().click();
    await page.waitForTimeout(300);
    await expect(dlg.getByText('아직 액션이 없습니다.')).toBeVisible();
  });

  test('🔴 입력 4단계가 서고 현재 단계가 표시된다', async ({ page }) => {
    const dlg = await openSpot(page);
    const bar = dlg.getByRole('group', { name: '입력 단계' });
    for (const s of ['게임', '자리·스택', '카드·액션', '내 선택']) {
      await expect(bar.getByRole('button', { name: new RegExp(s) })).toBeVisible();
    }
    await bar.getByRole('button', { name: /자리·스택/ }).click();
    await expect(dlg.getByText('내 자리').first()).toBeVisible();
    await expect(dlg.getByText('유효 스택').first()).toBeVisible();
  });
});

test.describe('NURI SPOT — 단계 바', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 412, height: 915 }); });

  test('🔴 현재 단계 칩은 잘리지 않는다 — 체크가 붙어 넓어져도', async ({ page }) => {
    const dlg = await openSpot(page);
    // 4단계로 간 **뒤에** 액션을 고른다 → 완료 체크가 붙어 칩이 넓어진다.
    // 여기서 실제 회귀가 났다: step 만 보고 스크롤을 맞춰서, 나중에 넓어진 칩이 잘린 채 남았다.
    await dlg.locator('button[data-card="As"]').click();
    await dlg.locator('button[data-card="Ks"]').click();
    const bar = dlg.getByRole('group', { name: '입력 단계' });
    await bar.getByRole('button', { name: /내 선택/ }).click();
    await dlg.getByRole('button', { name: '레이즈', exact: true }).first().click();
    await page.waitForTimeout(900);   // smooth 스크롤이 끝날 시간

    const cut = await bar.evaluate((el) => {
      const cur = el.querySelector('[aria-current="step"]');
      if (!cur) return { err: '현재 단계 칩이 없다' };
      const b = el.getBoundingClientRect(), c = cur.getBoundingClientRect();
      // 좌우로 삐져나온 양(px). 반올림 오차 1px 은 봐준다.
      return { over: Math.round(Math.max(0, c.right - b.right) + Math.max(0, b.left - c.left)) };
    });
    expect(cut.err ?? null, '현재 단계 칩을 못 찾았다').toBeNull();
    expect(cut.over, `현재 단계 칩이 ${cut.over}px 잘려 있다`).toBeLessThanOrEqual(1);
  });
});

test.describe('NURI SPOT — 뷰포트 매트릭스', () => {
  for (const vp of VIEWPORTS) {
    test(`🔴 ${vp.name} — 가로 스크롤 0 · 터치 영역 44px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const dlg = await openSpot(page);
      await page.waitForTimeout(500);

      const over = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.doc, `문서가 ${over.doc}px 넘친다`).toBeLessThanOrEqual(1);
      expect(over.body, `body 가 ${over.body}px 넘친다`).toBeLessThanOrEqual(1);

      // 주요 조작 버튼의 **실제 히트 영역**을 잰다(.tap-y-44 가 ::before 로 넓히므로 박스만 보면 틀린다)
      const small = await dlg.locator('button[role="tab"], [data-testid="spot-hero"] button, button:has-text("액션 추가")')
        .evaluateAll((els) => els.map((e) => {
          const r = e.getBoundingClientRect();
          if (r.height <= 0) return null;
          const x = Math.round(r.left + r.width / 2);
          const hits = (y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
          let top = r.top, bottom = r.bottom;
          for (let d = 1; d <= 12; d++) { if (!hits(Math.round(r.top) - d)) break; top = r.top - d; }
          for (let d = 1; d <= 12; d++) { if (!hits(Math.round(r.bottom) + d)) break; bottom = r.bottom + d; }
          return { t: (e.textContent ?? '').trim().slice(0, 10), h: Math.round(bottom - top) };
        }).filter((x): x is { t: string; h: number } => !!x && x.h < 44));
      expect(small, `44px 미만 조작 대상: ${JSON.stringify(small)}`).toEqual([]);

      await page.screenshot({ path: `docs/bugshots/spot-${vp.name}.png` });
    });
  }
});
