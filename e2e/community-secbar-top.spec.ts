// audit10 P2-2(2026-10-07) — 커뮤니티 하위탭 바가 **자기 상자 위**를 칠하지 않는다 · 붙은 상태에서 헤더와 바 사이에 틈이 없다.
//
// 증상: 미인증 로그인 회원의 '휴대폰 본인인증이 필요합니다' 띠(바로 위)의 글자 아래 절반이 가려졌다(360·390 다크·라이트).
// 원인: 바의 ::before 가 위로 16px 를 지면색으로 칠했다(2026-06 '갭 비침' 덮개). 붙은 상태에서는 바 윗변이 불투명 z-50 헤더
//   밑면보다 위라 그 덮개가 할 일이 없고, 안 붙은 상태(스크롤 0)에서는 위에 있는 실제 내용을 덮는다.
// 그 띠는 PORTONE 설정 빌드 + 미인증 로그인에서만 떠서 여기서는 **바가 상자 밖을 칠하는 높이**로 잰다(띠 유무와 무관한 원인 판정).
// 덮개가 막던 것(붙은 바 위로 본문 비침)은 ②가 잰다 — 스크롤을 한 칸씩 내리며 붙은 프레임마다 바 바로 위 한 줄이 헤더인가.
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { dismissOverlays } from './_session';
import { mockPosts } from './_mocks';

async function openBoard(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => { try { localStorage.setItem('nuri:board-view', 'feed'); } catch { /* 차단 환경 */ } });
  await mockPosts(page, 30);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  // 자동 스크롤 없는 클릭(측정 오염 방지 — CLAUDE.md 참고 메모)
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="sec-tab-board"]')?.click());
  await expect(page.locator('[data-testid="sec-tab-board"]')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
}

/** 바가 자기 상자 위로 칠하는 높이(px) — ::before/::after 중 위로 삐져나온 쪽. 0 이어야 한다. */
const paintAbove = (page: Page) => page.evaluate(() => {
  const bar = document.querySelector<HTMLElement>('[data-community-secbar]')!;
  let above = 0;
  for (const pe of ['::before', '::after'] as const) {
    const cs = getComputedStyle(bar, pe);
    if (cs.content === 'none' || cs.display === 'none') continue;
    const h = parseFloat(cs.height) || 0;
    const t = parseFloat(cs.top);
    if (h > 0 && Number.isFinite(t) && t < 0) above = Math.max(above, Math.min(-t, h));
  }
  return above;
});

for (const { width, height } of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
  test(`🔴 P2-2 ${width} — 스크롤 0 에서 하위탭 바가 바로 위 내용을 덮지 않는다(상자 밖 칠하기 0)`, async ({ page }) => {
    await openBoard(page, width, height);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('[data-community-secbar]')!;
      return { barTop: bar.getBoundingClientRect().top, stickyTop: parseFloat(getComputedStyle(bar).top), y: window.scrollY };
    });
    expect(m.y).toBe(0);
    const above = await paintAbove(page);
    expect(above, `바가 자기 위 ${above}px 를 칠한다 — 바로 위 본인인증 띠 글자가 가려진다(barTop ${m.barTop})`).toBe(0);
  });
}

// ② 덮개를 걷어도 붙은 바 위로 본문이 비치지 않는다 — 펼친 헤더(스크롤 < 40)·접힌 헤더(≥ 56) 전 구간을 4px 씩 내리며
//    바가 붙은 프레임마다 바 바로 위 1px 줄(좌·중·우)이 헤더(또는 PC 탭 바)이고 커뮤니티 판의 내용이 아니다.
for (const { width, height } of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 1440, height: 900 }]) {
  test(`P2-2 ${width} — 붙은 하위탭 바와 헤더 사이에 본문이 비치는 틈이 없다(펼침·접힘 전 구간)`, async ({ page }) => {
    await openBoard(page, width, height);
    const r = await page.evaluate(async () => {
      const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const bar = document.querySelector<HTMLElement>('[data-community-secbar]')!;
      const pane = bar.closest('main') as HTMLElement;
      const bad: string[] = [];
      let stuckFrames = 0; let shrunkStuck = 0; let openStuck = 0;
      for (let y = 0; y <= 400; y += 4) {
        window.scrollTo(0, y);
        window.dispatchEvent(new Event('scroll'));
        await raf();
        const top = bar.getBoundingClientRect().top;
        const stickyTop = parseFloat(getComputedStyle(bar).top);
        if (Math.abs(top - stickyTop) > 0.5) continue;           // 아직 안 붙음 — 위는 정상 흐름 내용
        stuckFrames += 1;
        if (document.documentElement.dataset.headerShrunk === '1') shrunkStuck += 1; else openStuck += 1;
        for (const x of [8, window.innerWidth / 2, window.innerWidth - 8]) {
          const el = document.elementFromPoint(x, top - 1);
          if (!el || pane.contains(el)) bad.push(`y=${y} x=${Math.round(x)} top=${top.toFixed(2)} → ${el ? el.tagName + '.' + (el.className || '').toString().slice(0, 40) : 'null'}`);
        }
      }
      return { bad, stuckFrames, shrunkStuck, openStuck };
    });
    expect(r.stuckFrames, '바가 한 번도 붙지 않았다 — 측정 대상이 없다(거짓 통과 방지)').toBeGreaterThan(10);
    if (width < 768) {
      expect(r.openStuck, '펼친 헤더에서 붙은 프레임이 없다').toBeGreaterThan(0);
      expect(r.shrunkStuck, '접힌 헤더에서 붙은 프레임이 없다').toBeGreaterThan(0);
    }
    expect(r.bad, '붙은 바 바로 위로 커뮤니티 본문이 비친다').toEqual([]);
  });
}
