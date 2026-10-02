// 장부 전용 스타일을 전역 CSS 에서 빼 인라인 style·지연 CSS(ledgerLazy.css)로 옮긴 뒤에도 **값이 그대로**인지 잰다.
//   (2026-10-02 번들 예산 — 첫 화면 임계 경로 267.2/267 · CSS 35.1/35. 옛 값은 종전 Tailwind 유틸이 만들던 값이다.)
//
// 방법: 옛 유틸이 쓰던 **같은 식**을 프로브 요소에 넣어 계산 결과를 대조한다 — 폭 분기(lg 1024)가 어긋나면 달라진다.
//   ① 1440 — 레일 칸: 폭 18rem · 최소 20rem · 높이 = lg 식(탭바 무관). 비고 열 94px(≥1440)·게임 전환 칸 xl 규칙.
//   ② 1280 — 접힌 띠 48px, 누르면 펼친 띠: 쌓임 35 · 큰 그림자 · 폭 20rem. 세로 글자·비고 열은 종전 최소폭(4rem).
//   ③ 800 — lg 미만: 높이는 max(정산바·탭바) 식.
// 휴지통의 hover/터치 값은 ledger-mobile-summary.spec.ts ⑦ 이 잰다(같은 속성 data-ledger-trash).
// 전부 목킹(운영 쓰기 0).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const RAIL = '[data-mystore-rail]';
const SESSION = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: `${MOCK_DAY}T10:00:00+09:00`, operators: [], schedule_id: null, tournament_start: null,
};
const PLAYERS = ['김철수', '이영희'].map((n, i) => ({
  id: `dddddddd-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, name: n,
  visitor_type: null, note: null, sort_order: i,
}));

async function open(page: Page, w: number, h: number) {
  await bootOwner(page, {
    viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? SESSION : [SESSION]))));
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(PLAYERS))));
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json([]))));
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-testid="ledger-date"]').first(), '장부 보드가 안 열렸다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

// 옛 유틸이 풀던 식 그대로(프로브 높이를 재서 대조한다)
const H_LG = 'calc(100svh - var(--stack-top,6.0625rem) - var(--footer-reserve,0px) - 1.5rem)';
const H_SM = 'calc(100svh - var(--stack-top,6.0625rem) - max(var(--footer-reserve,0px), var(--tabbar-safe,0px)) - 1.5rem)';

const measure = (page: Page) => page.evaluate(({ hLg, hSm }) => {
  const box = document.querySelector('[data-ledger-workspace] > div:not(.min-w-0)') as HTMLElement | null;
  const probe = (css: string) => { const p = document.createElement('div'); p.style.cssText = `position:absolute;visibility:hidden;${css}`; (box?.parentElement ?? document.body).appendChild(p); const r = p.getBoundingClientRect(); p.remove(); return r.height; };
  const cs = box ? getComputedStyle(box) : null;
  const th = [...document.querySelectorAll('thead th')].find((e) => e.textContent?.trim().startsWith('비고') && e.getClientRects().length > 0) as HTMLElement | undefined;
  const sw = [...document.querySelectorAll('div.order-last.basis-full.min-w-0')].find((e) => e.getClientRects().length > 0) as HTMLElement | undefined;
  const swc = sw ? getComputedStyle(sw) : null;
  return {
    hasBox: !!box,
    h: box ? box.getBoundingClientRect().height : null, hLg: probe(`height:${hLg}`), hSm: probe(`height:${hSm}`),
    minH: cs?.minHeight ?? null, w: box ? box.getBoundingClientRect().width : null, remPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    noteMinW: th ? getComputedStyle(th).minWidth : null,
    sw: swc ? { order: swc.order, grow: swc.flexGrow, basis: swc.flexBasis === '0%' ? '0px' : swc.flexBasis, minW: swc.minWidth, basisRaw: swc.flexBasis, w: sw!.getBoundingClientRect().width } : null,
  };
}, { hLg: H_LG, hSm: H_SM });

test('① 1440 — 레일 칸 높이(lg 식)·폭 18rem·최소 20rem · 비고 열 94px · 전환 칸 xl 규칙', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 1440, 900);
  const m = await measure(page);
  console.log('[1440]', JSON.stringify(m));
  expect(m.hasBox, '레일 칸을 못 찾았다 — 빈 검사').toBe(true);
  expect(Math.abs(m.h! - m.hLg), '높이가 lg 식과 다르다').toBeLessThan(0.6);
  expect(m.w, '폭이 18rem 이 아니다').toBeCloseTo(18 * m.remPx, 0);
  expect(m.minH, '최소 높이가 20rem 이 아니다').toBe(`${20 * m.remPx}px`);
  expect(m.noteMinW, '≥1440 비고 열 최소폭이 94px 이 아니다').toBe('94px');
  if (m.sw) expect(m.sw, '≥1280 전환 칸 규칙(order 0 · grow 1 · basis 0 · min 16rem)').toMatchObject({ order: '0', grow: '1', basis: '0px', minW: `${16 * m.remPx}px` });
});

test('② 1280 — 접힌 띠 48px → 누르면 펼친 띠(쌓임 35 · 큰 그림자 · 20rem) · 세로 글자 · 비고 열 4rem', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 1280, 720);
  const m = await measure(page);
  console.log('[1280]', JSON.stringify(m));
  expect(m.hasBox, '레일 칸을 못 찾았다 — 빈 검사').toBe(true);
  expect(Math.abs(m.h! - m.hLg), '높이가 lg 식과 다르다').toBeLessThan(0.6);
  expect(m.w, '접힌 띠 폭이 48px 이 아니다').toBeCloseTo(48, 0);
  expect(m.noteMinW, '<1440 비고 열 최소폭이 4rem 이 아니다').toBe(`${4 * m.remPx}px`);
  const strip = page.locator('[data-voucher-strip]').first();
  await expect(strip, '접힌 띠 버튼이 없다').toBeVisible();
  const wm = await strip.locator('span[aria-hidden]').filter({ hasText: '이용권 실시간' }).evaluate((e) => getComputedStyle(e).writingMode);
  expect(wm, '띠의 세로 글자가 아니다').toBe('vertical-rl');
  await strip.evaluate((b) => (b as HTMLElement).click());
  const pop = page.locator('[data-ledger-workspace] > div:not(.min-w-0) > div.absolute');
  await expect(pop, '펼친 띠가 안 열렸다').toHaveCount(1, { timeout: 5_000 });
  const p = await pop.evaluate((e) => { const c = getComputedStyle(e); return { z: c.zIndex, w: c.width, shadow: c.boxShadow, remPx: parseFloat(getComputedStyle(document.documentElement).fontSize) }; });
  expect(p.z, '펼친 띠 쌓임이 35 가 아니다').toBe('35');
  expect(parseFloat(p.w), '펼친 띠 폭이 20rem 이 아니다').toBeCloseTo(20 * p.remPx, 0);
  expect(p.shadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px,? ?/g, '').trim(), '큰 그림자 값이 다르다').toBe('rgba(0, 0, 0, 0.25) 0px 25px 50px -12px');
});

test('③ 800 — lg 미만: 높이는 max(정산바·탭바) 식', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 800, 900);
  const m = await measure(page);
  console.log('[800]', JSON.stringify(m));
  expect(m.hasBox, '레일 칸을 못 찾았다 — 빈 검사').toBe(true);
  expect(Math.abs(m.h! - m.hSm), '높이가 lg 미만 식과 다르다').toBeLessThan(0.6);
});
