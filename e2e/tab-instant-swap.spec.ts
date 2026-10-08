// INSTANT-SWAP (오너 2026-10-08) — "대메뉴·소메뉴 등 콘텐츠 이동이 너무 느리다, 블러 처리되며 이동하는데 그 와중에 뒤에 살짝 네모칸이 보인다."
//
// 원인(프로덕션 빌드 · CDP 스크린캐스트 프레임 실측 · 390×844 / 1440×900 · 다크·라이트):
//   src/lib/tabCover.ts 6·7차의 '떠나는 판 퇴장 페이드' — 옛 판(복제본)이 새 판 **위**에 fixed 로 서서 0.999→0 으로 걷혔다.
//   누른 뒤 ~15ms 부터 260~430ms 까지 옛 판이 남았고, 그동안 두 판이 섞인 프레임이 이동마다 2~12장 나왔다.
//   겹친 글자·테두리가 이중 노출로 번져 '블러', 옛 판의 카드 상자가 새 판 위 반투명 '네모칸' 으로 보였다.
// 고침(8차): 판은 한 프레임에 바뀐다. 스왑 프레임 정적화(빠진 타일 방지)와 하위 탭 P2 스크롤만 남는다.
//
// 계약(메인 탭 순회 + 하위 탭 2종 · 모바일 390 · PC 1440):
//   ① 누른 뒤 500ms 동안 **판을 덮는 큰 투명도 애니**(대상 넓이 > 뷰포트 25%, keyframe 에 opacity)가 도는 프레임 0.
//   ② 떠나는 판 복제본(fixed + inert + aria-hidden, 뷰포트 25% 이상)이 있는 프레임 0.
//   ③ 목적지 판(메인: .tab-pane[data-tab]) 이 누른 뒤 **150ms 안**에 보인다(재방문 — 지연 청크 대기 제외).
//   공허 방지: 이동마다 rAF 표본 ≥ 10, 실제로 활성 판이 바뀌었는지 확인한다.
// 음성 대조(2026-10-08 실행): 옛 tabCover.ts(퇴장 페이드) 빌드에 이 스펙을 돌리면 ①② 가 메인·하위 모두 빨갛다.
// 실행: E2E_BASE_URL=http://localhost:4174 npx playwright test e2e/tab-instant-swap.spec.ts
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

type Probe = { frames: number; bigFade: number; clone: number; shownAt: number | null };

/** 누르기 전에 rAF 표본기를 건다 — 판 덮개 부류(큰 투명도 애니·복제본)와 목적지 판이 보인 시각을 적는다. */
async function arm(page: Page, destSel: string | null): Promise<void> {
  await page.evaluate((sel) => {
    const w = window as unknown as { __p: Probe & { t0: number; on: boolean } };
    const vw = innerWidth * innerHeight;
    w.__p = { frames: 0, bigFade: 0, clone: 0, shownAt: null, t0: performance.now(), on: true };
    const tick = () => {
      const p = w.__p;
      if (!p.on) return;
      p.frames++;
      const fades = document.getAnimations().filter((a) => {
        const ef = a.effect as KeyframeEffect | null;
        const t = ef?.target as Element | null | undefined;
        // 스크롤 구동 리빌(.reveal — animation-timeline: view())은 시간 애니가 아니다(스크롤 위치가 값을 정한다) — 문서 시간축만 본다.
        if (!t || !ef || a.playState !== 'running' || a.timeline !== document.timeline) return false;
        if (!ef.getKeyframes().some((k) => 'opacity' in k)) return false;
        const r = t.getBoundingClientRect();
        return r.width * Math.min(r.height, innerHeight) > vw * 0.25 && !t.closest('[role="dialog"], [aria-modal="true"]');
      });
      if (fades.length) p.bigFade++;
      const clones = [...document.querySelectorAll<HTMLElement>('[inert][aria-hidden="true"]')].filter((e) => {
        if (getComputedStyle(e).position !== 'fixed') return false;
        const r = e.getBoundingClientRect();
        return r.width * Math.min(r.height, innerHeight) > vw * 0.25;
      });
      if (clones.length) p.clone++;
      if (sel && p.shownAt === null) {
        const d = document.querySelector<HTMLElement>(sel);
        if (d && d.style.display !== 'none' && d.getClientRects().length) p.shownAt = performance.now() - p.t0;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, destSel);
}
async function collect(page: Page): Promise<Probe> {
  await page.waitForTimeout(500);
  return page.evaluate(() => { const w = window as unknown as { __p: Probe & { on: boolean } }; w.__p.on = false; const { frames, bigFade, clone, shownAt } = w.__p; return { frames, bigFade, clone, shownAt }; });
}
const activeTab = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((p) => p.style.display !== 'none')?.dataset.tab ?? '?');

/** 메인 탭 버튼을 누른다 — locator.click 은 대상까지 자동 스크롤해 측정을 오염시키므로 DOM click(이벤트 경로는 같다). */
async function pressMain(page: Page, label: string, pc: boolean): Promise<void> {
  await page.evaluate(([nm, isPc]) => {
    const sel = isPc ? '[data-stack-tabbar] [role="tab"], header nav button, header nav a, header button' : 'nav[aria-label="하단 내비게이션"] button';
    const e = [...document.querySelectorAll<HTMLElement>(sel)].find((x) => x.getClientRects().length && (x.textContent ?? '').trim().startsWith(nm));
    if (!e) throw new Error(`탭 버튼 없음: ${nm}`);
    e.click();
  }, [label, pc] as const);
}
async function pressSub(page: Page, bar: string): Promise<string> {
  return page.evaluate((sel) => {
    const bs = [...document.querySelectorAll<HTMLElement>(`${sel} button`)].filter((x) => x.getClientRects().length
      && x.getAttribute('aria-selected') !== 'true' && x.getAttribute('aria-pressed') !== 'true');
    const e = bs[0];
    if (!e) throw new Error(`하위 탭 없음: ${sel}`);
    e.click();
    return (e.textContent ?? '').trim();
  }, bar);
}

const MAIN = [['커뮤니티', 'community'], ['GTO', 'tools'], ['캘린더', 'calendar'], ['라이브', 'live'], ['홈', 'home']] as const;

for (const [w, h] of [[390, 844], [1440, 900]] as const) {
  const pc = w >= 1024;
  test.describe(`INSTANT-SWAP ${w}px`, () => {
    test.use({ viewport: { width: w, height: h }, ...(pc ? { isMobile: false, hasTouch: false, deviceScaleFactor: 1 } : {}) });

    test(`메인 탭 순회 — 판 덮개 0 · 목적지 판 150ms 안 (${w})`, async ({ page }) => {
      await page.goto('/');
      await page.waitForFunction(() => document.querySelectorAll('.tab-pane').length >= 2, null, { timeout: 15_000 });
      await page.waitForTimeout(1500);
      // 첫 바퀴 = 지연 청크·첫 방문(판정 안 함, 덮개 부류만 본다) · 둘째 바퀴 = 재방문(③까지 판정)
      const rows: string[] = [];
      for (const lap of [1, 2]) {
        for (const [label, tab] of MAIN) {
          await page.evaluate(() => window.scrollTo(0, 240));
          await page.waitForTimeout(250);
          await arm(page, `.tab-pane[data-tab="${tab}"]`);
          await pressMain(page, label, pc);
          const p = await collect(page);
          expect(await activeTab(page), `${label} 를 눌렀는데 활성 판이 안 바뀌었다(공허한 초록 방지)`).toBe(tab);
          expect(p.frames, '표본 프레임이 너무 적다').toBeGreaterThanOrEqual(10);
          if (p.bigFade || p.clone) rows.push(`lap${lap} ${label}: 큰 투명도 애니 ${p.bigFade}프레임 · 복제본 ${p.clone}프레임`);
          if (lap === 2 && (p.shownAt === null || p.shownAt > 150)) rows.push(`lap2 ${label}: 목적지 판이 ${String(p.shownAt)}ms 에 보였다(> 150)`);
          await page.waitForTimeout(400);
        }
      }
      expect(rows, '판 전환에 옛 판이 겹치는 연출이 돌아왔다(블러·네모칸 부류) 또는 전환이 느리다').toEqual([]);
    });

    test(`하위 탭(커뮤니티 섹션 · GTO 레인) — 판 덮개 0 (${w})`, async ({ page }) => {
      await page.goto('/');
      await page.waitForFunction(() => document.querySelectorAll('.tab-pane').length >= 2, null, { timeout: 15_000 });
      const rows: string[] = [];
      for (const [label, bar] of [['커뮤니티', '[data-community-secbar]'], ['GTO', '[data-tools-lanebar]']] as const) {
        await pressMain(page, label, pc);
        await page.locator(`${bar} button`).first().waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(1200);
        for (let i = 0; i < 3; i++) {
          await arm(page, null);
          const to = await pressSub(page, bar);
          const p = await collect(page);
          expect(p.frames).toBeGreaterThanOrEqual(10);
          if (p.bigFade || p.clone) rows.push(`${label} → ${to}: 큰 투명도 애니 ${p.bigFade}프레임 · 복제본 ${p.clone}프레임`);
          await page.waitForTimeout(400);
        }
      }
      expect(rows, '하위 탭 전환에 옛 판이 겹치는 연출이 돌아왔다(블러·네모칸 부류)').toEqual([]);
    });
  });
}
