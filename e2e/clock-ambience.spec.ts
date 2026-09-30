// 클락 모션 테마(2026-09-30) — 기존 테마 픽셀 보존 + 모션 테마 층 배선.
//
// 🔴 PR #58 검토에서 잡힌 회귀: 스테이지 루트에 isolation:isolate 를 **항상** 걸었더니, ClockStage 의 타이머 bloom(-z-10)이
//   루트 배경 밑에서 위로 올라와 기존 10종 전부 타이머 뒤가 밝아졌다(1920 기본 테마 d>16 픽셀 38,718).
//   그래서 isolation 은 모션 테마일 때만 건다(ambience/ambiencePresets.ts ambIsolation).
//   여기서는 속성 이름이 아니라 **화면**을 본다 — 기존 테마에서 bloom 을 지워도 픽셀이 하나도 안 바뀌어야 한다(= 가려져 있다).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { TV_VENUE as VENUE, serveClock } from './_clock';
import { bootOwner, MOCK_VENUE, openMyStore } from './_mockOwner';

function row() {
  const title = '금요 딥스택 100K GTD';
  return {
    venue_id: VENUE, game_seq: 1, session_date: null, title,
    config: {
      title, startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false, earlyBonus: 5_000, doubleEarlyBonus: 10_000,
      regCloseLevel: 3, maxLevel: 26, earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100, mysteryBounty: 0,
      prizes: [{ place: '1st', amount: 400 }, { place: '2nd', amount: 150 }],
      levels: [{ kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 }, { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 }],
    },
    // 멈춘 클락 — 초가 흐르지 않아야 두 장의 스크린샷이 같다
    current_index: 0, running: false, ends_at: null, remaining_ms: 14 * 60_000 + 7_000,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
    live_stats: { entries: 42, rebuys: 6, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
  };
}

// 타이머 bloom — ClockStage 타이머 블록(타이머의 부모)의 -z-10 자식. 속성을 새로 붙이지 않고 구조로 찾는다.
//   (evaluate 로 넘기는 함수는 직렬화되므로 바깥 도우미를 쓰지 못한다 — 선택자 문자열로 넘긴다)
const BLOOM = ':scope > [class*="-z-10"]';

/** bloom 을 지우기 전후 그 자리 스크린샷이 같은가(= 루트 배경 밑에 가려져 있다). */
async function bloomHidden(page: Page) {
  const timer = page.getByTestId('clk-timer').first();
  const box = await timer.evaluate((el, sel) => { const b = el.parentElement?.querySelector(sel); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, BLOOM);
  expect(box, 'bloom 을 못 찾았다 — ClockStage 타이머 구조가 바뀌었으면 이 스펙의 BLOOM 을 고쳐라(거짓 통과 방지)').not.toBeNull();
  const vp = page.viewportSize()!;
  const x = Math.max(0, box!.x), y = Math.max(0, box!.y);
  const clip = { x, y, width: Math.min(vp.width - x, box!.width), height: Math.min(vp.height - y, box!.height) };
  const a = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  await timer.evaluate((el, sel) => { (el.parentElement!.querySelector(sel) as HTMLElement).style.display = 'none'; }, BLOOM);
  const b = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  return Buffer.compare(a, b) === 0;
}

async function openTv(page: Page, preset: string | null) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await serveClock(page, row());
  await page.route(/\/rest\/v1\/venues\?[^ ]*select=page_config/, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ page_config: preset ? { clockTheme: { version: 1, palette: { preset }, background: { kind: 'gradient', preset } } } : {} }),
  }));
  await page.goto(`/?display=${VENUE}&g=1&auto=0`);
  await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}


test.describe('클락 모션 테마 — 기존 테마 보존', () => {
  for (const preset of [null, 'carbon', 'aura-gold']) {
    test(`${preset ?? '(테마 없음)'}: 타이머 bloom 이 루트 배경 밑에 가려져 있다(지워도 픽셀 0 변화) · 모션 층 없음`, async ({ page }) => {
      await openTv(page, preset);
      expect(await bloomHidden(page), 'bloom 이 보인다 — 스테이지 루트에 쌓임 맥락(isolation 등)이 기존 테마에도 걸렸다').toBe(true);
      await expect(page.getByTestId('clk-ambience')).toHaveCount(0);
    });
  }

  test('운영자 스테이지(기본 테마): 같은 bloom 이 가려져 있다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, clock: { ...row(), venue_id: MOCK_VENUE } });
    await openMyStore(page);
    await page.locator('[aria-label="매장 단계 이동"] [role=tab]').filter({ hasText: '클락' }).first().click();
    await expect(page.getByTestId('clk-main-action')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('clk-timer').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    expect(await bloomHidden(page), 'bloom 이 보인다 — 운영자 스테이지 루트에 쌓임 맥락이 기존 테마에도 걸렸다').toBe(true);
  });

  test('모션 테마(aurora-lake): 층이 깔리고 루트가 쌓임 맥락을 가진다', async ({ page }) => {
    await openTv(page, 'aurora-lake');
    const amb = page.getByTestId('clk-ambience');
    await expect(amb).toHaveAttribute('data-motion', 'aurora-lake', { timeout: 20_000 });
    await expect(amb).toHaveCSS('opacity', '1', { timeout: 5_000 }); // 첫 그림 뒤 서서히 보인다(0 에 머물면 층이 안 그려진 것)
    expect(await amb.evaluate((el) => getComputedStyle(el.closest('[data-amb-root]')!).isolation)).toBe('isolate');
  });
});
