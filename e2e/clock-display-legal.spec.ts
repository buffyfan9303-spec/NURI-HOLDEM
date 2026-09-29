// 관전 클락(ClockDisplay) 법정 고지 — 오너 결정 #18(2026-09-29): TV 전체화면이 **아닐 때만** 한 줄.
//
// 왜: 이 화면은 매장 TV 송출 전용이 아니다. 라이브 카드 눈 아이콘 · 일정 '관전 클락' · 비로그인 `/?display=` 로
//   일반 이용자가 들어오는데, 화면 전체를 덮는 fixed 판이라 앱 푸터(사업자 정보·19세·1336)가 전혀 안 보였다.
// 계약: ① 비전체화면 — 사업자번호·1336 이 든 한 줄이 화면 안에 있고, 그 자리를 다른 것이 덮지 않으며(hit-test),
//         보드(스테이지)의 어떤 요소와도 겹치지 않는다(사각형 교차 0). 클락이 없는 상태에서도 같다.
//       ② 전체화면(⛶) — 한 줄이 없다. 해제하면 다시 나온다.
// 판정은 새 testid 가 아니라 **문구(사업자번호·1336)** 로 잡는다 — 수정 전 빌드는 '재료 없음'이 곧 결함이다.
// 음성 대조: ClockDisplay 의 고지 줄 조건 `{!fs && (` 에서 `!fs &&` 를 빼면 ② 가 실패한다.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/clock-display-legal.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { TV_VENUE as VENUE, serveClock } from './_clock';

const LEVELS = [
  { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
  { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
];
const ROW = {
  venue_id: VENUE, game_seq: 1, session_date: null, title: '금요 딥스택 100K GTD',
  config: {
    title: '금요 딥스택 100K GTD', startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false, earlyBonus: 5_000, doubleEarlyBonus: 10_000,
    regCloseLevel: 3, maxLevel: 26, earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100, mysteryBounty: 0,
    prizes: [{ place: '1st', amount: 400 }, { place: '2nd', amount: 150 }], levels: LEVELS,
  },
  current_index: 0, running: true, ends_at: new Date(Date.now() + 9 * 60_000).toISOString(), remaining_ms: 0,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
  live_stats: { entries: 42, rebuys: 6, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
};

/** 클락 루트(fixed 판) 안의 법정 고지 줄 — 문구로 찾는다. 기하와 가림·겹침을 함께 잰다. */
async function legal(page: Page) {
  return page.evaluate(() => {
    const close = document.querySelector('button[aria-label="닫기"][title="닫기"]');
    const root = close?.closest('.fixed') as HTMLElement | null;
    if (!root) return { root: false } as const;
    const line = Array.from(root.querySelectorAll('p')).find((p) => /525-20-02937/.test(p.textContent ?? '') && /1336/.test(p.textContent ?? ''));
    if (!line) return { root: true, line: false } as const;
    const r = line.getBoundingClientRect();
    const cs = getComputedStyle(line);
    // 가림 — 줄의 여러 점에서 맨 위 요소가 줄 자신(또는 자손)인가
    const pts = [0.1, 0.5, 0.9].map((fx) => [r.left + r.width * fx, r.top + r.height / 2] as const);
    const covered = pts.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !(h && (h === line || line.contains(h))); }).length;
    // 겹침 — 줄 밖의 보이는 잎 요소 중 사각형이 줄과 교차하는 것(보드 숫자·버튼·QR·광고 전부)
    const overlaps: string[] = [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el === line || line.contains(el) || el.contains(line)) continue;
      if (el.children.length && !(el instanceof HTMLImageElement)) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const ix = Math.min(b.right, r.right) - Math.max(b.left, r.left);
      const iy = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
      if (ix > 0.5 && iy > 0.5) overlaps.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 20)}" ${Math.round(b.top)}-${Math.round(b.bottom)}`);
    }
    return {
      root: true, line: true, text: line.textContent ?? '', top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight,
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.5, covered, overlaps,
    };
  });
}

test.describe('관전 클락 — 법정 고지 한 줄(#18)', () => {
  for (const [name, w, h] of [['폰 390x844', 390, 844], ['PC 1280x800', 1280, 800], ['TV 1920x1080(창)', 1920, 1080]] as [string, number, number][]) {
    test(`🔴 ${name} · 비전체화면 — 사업자 정보·19세·1336 한 줄이 보이고 보드와 겹치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await serveClock(page, ROW);
      await page.goto(`/?display=${VENUE}&g=1&auto=0`);
      await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const m = await legal(page);
      console.log(`[clock-legal ${name}]`, JSON.stringify(m));
      expect(m.root, '클락 루트를 못 찾았다(측정 대상 없음)').toBe(true);
      expect(m.line, '관전 클락에 법정 고지 줄이 없다 — 일반 이용자가 사업자 정보·19세·1336 을 못 본다').toBe(true);
      if (!m.line) return;
      expect(m.text).toContain('만 19세 미만');
      expect(m.visible).toBe(true);
      expect(m.top, '고지 줄이 화면 위로 벗어났다').toBeGreaterThanOrEqual(0);
      expect(m.bottom, '고지 줄이 화면 아래로 잘린다').toBeLessThanOrEqual(m.vh + 0.5);
      expect(m.covered, '고지 줄 위를 다른 요소가 덮는다').toBe(0);
      expect(m.overlaps, '고지 줄이 보드 요소와 겹친다').toEqual([]);
    });
  }

  test('🔴 클락이 없는 매장(진행 중 없음)에서도 고지 줄이 있다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(/\/rest\/v1\/clock_states/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByText('진행 중인 클락이 없습니다')).toBeVisible({ timeout: 20_000 });
    const m = await legal(page);
    expect(m.line, '빈 상태 관전 클락에 법정 고지 줄이 없다').toBe(true);
    if (!m.line) return;
    expect(m.covered).toBe(0);
    expect(m.overlaps).toEqual([]);
  });

  test('🔴 전체화면(TV 송출)에서는 고지 줄이 없고, 해제하면 돌아온다', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await serveClock(page, ROW);
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: '전체화면' }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement), { message: '전체화면에 들어가지 못했다(측정 전제 없음)' }).toBe(true);
    await page.waitForTimeout(300);
    const inFs = await legal(page);
    expect(inFs.root).toBe(true);
    expect(inFs.line, '전체화면(TV 송출)인데 법정 고지 줄이 보드 아래에 남아 있다').toBe(false);
    // TV 송출 화면은 종전과 픽셀이 같아야 한다 — 스테이지(컨테이너) = 화면 전체.
    const st = await page.evaluate(() => { const b = document.querySelector('[data-testid="clk-timer"]')!.closest('[style*="--clk-bg"]')!.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
    expect(st, '전체화면 스테이지가 화면 전체가 아니다(TV 보드 크기가 바뀐다)').toEqual([0, 0, 1920, 1080]);
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect.poll(async () => (await legal(page)).line, { message: '전체화면을 해제했는데 고지 줄이 돌아오지 않는다' }).toBe(true);
  });
});
