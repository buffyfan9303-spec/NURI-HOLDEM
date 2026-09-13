// N06 — 홈 이벤트 진입이 메인 배너(PosterCarousel) **안**에 있고, 독립 카드는 없다 (2026-09-13, 실행문 §7.1).
//
// 이 파일이 보는 것
//   ① 캠페인 0(현재 운영·로컬 상태) — 캐러셀 안에 'home-event-menu' 슬라이드 1개, 문구가 "진행 중" 을 말하지 않고, 누르면 이벤트 판이 열린다(§7.1-4).
//      캐러셀 바깥에 이벤트 카드가 **없다**(§7.1-10).
//   ② 조회 실패(500) — '불러오지 못했어요' 로 '없음' 과 갈라 말한다(§7.1-2).
//   ③ 참여 가능(live) — 'home-event-banner' 슬라이드에 제목·남은 카드 수(조회 성공 값만), 누르면 이벤트 판(§7.1-2·7).
//      soldout(카드 전부 열림)·ended 는 banner 가 아니라 menu 로 그린다(참여 가능 거짓 표시 금지).
//   ④ 늦은 응답으로 슬라이드 수가 변해도 캐러셀 프레임 높이가 튀지 않고, 점 수 = 슬라이드 수, aria-current 가 유효 범위(§7.1-8·9).
//   ⑤ 관리자 배너가 이미 ?event= 로 가면 이벤트 슬라이드를 넣지 않는다(중복 제거 §7.1-3) — 진입은 그 배너.
//   ⑥ 복제 슬라이드(무한 랩)는 aria-hidden·tabIndex -1 이고 testid 를 갖지 않는다 — '이전 배너' 첫 클릭이 마지막 장으로 랩한다.
// 운영 DB 에 쓰지 않는다 — event_board · home_banners 는 page.route 로 만든다(_fixtures 가드).
// 실행: E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/home-event-banner.spec.ts
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const EVENT_RPC = /\/rest\/v1\/rpc\/event_board/;
const BANNERS = /\/rest\/v1\/home_banners\?/;
const DIALOG = '[role="dialog"][aria-label="이벤트"]';
const j = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const liveBoard = (over: Record<string, unknown> = {}) => ({
  slug: 'open', title: '오픈 기념 카드 뽑기', subtitle: null, status: 'live', venueId: 'v1',
  startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
  voucherTitle: '이용권', cards: [{ idx: 0, opened: false }, { idx: 1, opened: false }, { idx: 2, opened: true }],
  myTickets: 2, remainByTier: {}, totalByTier: {}, voucherByTier: {}, ...over,
});

async function openHome(page: Page, opts: { board?: unknown | 'fail' | 'slow'; banners?: unknown[] } = {}) {
  await page.route(EVENT_RPC, async (r) => {
    if (opts.board === 'fail') return j(r, { message: 'boom' }, 500);
    if (opts.board === 'slow') { await new Promise((res) => setTimeout(res, 2500)); return j(r, liveBoard()); }
    return j(r, opts.board === undefined ? null : opts.board);
  });
  if (opts.banners) await page.route(BANNERS, (r) => j(r, opts.banners));
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
  await expect(page.getByTestId('home-banner-viewport')).toBeVisible({ timeout: 20_000 });
}

const vp = (page: Page) => page.getByTestId('home-banner-viewport');
const frameH = (page: Page) => page.getByTestId('home-banner-viewport').evaluate((el) => el.getBoundingClientRect().height);

test('🔴 ① 캠페인 0: 캐러셀 안 menu 슬라이드 1개 · "진행 중" 없음 · 누르면 이벤트 판 · 바깥 카드 없음', async ({ page }) => {
  await openHome(page, { board: null });
  await page.waitForTimeout(1500);
  const menu = page.getByTestId('home-event-menu');
  await expect(menu, 'menu 슬라이드는 정확히 하나(복제 슬라이드에는 testid 가 없다)').toHaveCount(1);
  expect(await menu.evaluate((el) => !!el.closest('[data-testid="home-banner-viewport"]')), '이벤트 진입이 캐러셀 밖에 있다').toBe(true);
  await expect(page.getByTestId('home-event-banner')).toHaveCount(0);
  const text = (await menu.textContent()) ?? '';
  // '지금 진행 중인 이벤트가 없어요' 는 사실을 말하는 문장이다 — 그 밖의 "진행 중"(참여 가능처럼 읽히는 표현)만 금지한다
  expect(text.replace('진행 중인 이벤트가 없어요', ''), '허위 "진행 중" 문구').not.toMatch(/진행 중/);
  expect(text).toContain('진행 중인 이벤트가 없어요');
  await expect(menu).toHaveAttribute('aria-label', /매장 이벤트/);
  // 캐러셀 밖(section 들)에 EVENT 칩·card-aura 이벤트 행이 없다
  const outside = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter((b) => /EVENT/.test(b.textContent ?? '') && !b.closest('[data-testid="home-banner-viewport"]')).length);
  expect(outside, '독립 이벤트 카드가 남아 있다').toBe(0);
  await menu.scrollIntoViewIfNeeded();
  await menu.click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });
});

test('🔴 ② 조회 실패는 "없음" 이 아니다 — 불러오지 못했어요 + 눌러서 다시', async ({ page }) => {
  await openHome(page, { board: 'fail' });
  await page.waitForTimeout(1500);
  const menu = page.getByTestId('home-event-menu');
  await expect(menu).toHaveCount(1);
  await expect(menu).toContainText('불러오지 못했어요');
  await expect(menu).not.toContainText('진행 중인 이벤트가 없어요');
});

test('🔴 ③ 참여 가능(live): banner 슬라이드 제목·남은 카드 2장 · 누르면 이벤트 판 · soldout/ended 는 menu', async ({ page }) => {
  await openHome(page, { board: liveBoard() });
  await page.waitForTimeout(1500);
  const banner = page.getByTestId('home-event-banner');
  await expect(banner).toHaveCount(1);
  await expect(page.getByTestId('home-event-menu')).toHaveCount(0);
  await expect(banner).toContainText('오픈 기념 카드 뽑기');
  await expect(banner).toContainText('참여권 2장');
  await expect(banner).toContainText('남은 카드 2장');
  await banner.click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  // soldout — 카드 전부 열림
  await page.unroute(EVENT_RPC);
  await page.route(EVENT_RPC, (r) => j(r, liveBoard({ cards: [{ idx: 0, opened: true }, { idx: 1, opened: true }] })));
  await page.evaluate(() => window.dispatchEvent(new Event('nuri:event-board-refresh')));
  await expect(page.getByTestId('home-event-menu')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByTestId('home-event-menu')).toContainText('카드가 모두 열렸어요');
  await expect(page.getByTestId('home-event-banner')).toHaveCount(0);
  // ended
  await page.unroute(EVENT_RPC);
  await page.route(EVENT_RPC, (r) => j(r, liveBoard({ status: 'ended' })));
  await page.evaluate(() => window.dispatchEvent(new Event('nuri:event-board-refresh')));
  await expect(page.getByTestId('home-event-menu')).toContainText('끝났어요', { timeout: 10_000 });
});

test('🔴 ④ 늦은 응답으로 슬라이드가 바뀌어도 프레임 높이가 튀지 않고 점 수·aria-current 가 유효하다', async ({ page }) => {
  await openHome(page, { board: 'slow' });
  await page.waitForTimeout(400);
  const h0 = await frameH(page);
  const dots0 = await page.getByTestId('home-banner-dots').locator('button[aria-label$="번째 배너"]').count();
  // pending 슬라이드가 이미 자리를 차지한다(늦게 끼어들어 밀지 않는다)
  await expect(page.getByTestId('home-event-menu')).toHaveCount(1);
  await expect(page.getByTestId('home-event-menu')).toContainText('불러오는 중');
  await expect(page.getByTestId('home-event-banner')).toHaveCount(1, { timeout: 10_000 });
  const h1 = await frameH(page);
  expect(Math.abs(h1 - h0), `배너 프레임 높이 ${h0}→${h1}`).toBeLessThanOrEqual(1);
  const dots1 = await page.getByTestId('home-banner-dots').locator('button[aria-label$="번째 배너"]').count();
  const n = await vp(page).evaluate((el) => el.firstElementChild!.children.length);
  expect(dots1, '점 수 = 원본 슬라이드 수').toBe(n / 2);
  expect(dots1).toBe(dots0);
  await expect(page.getByTestId('home-banner-dots').locator('button[aria-current="true"]')).toHaveCount(1);
});

test('🔴 ⑤ 관리자 배너가 이미 ?event= 로 가면 이벤트 슬라이드를 넣지 않는다(중복 제거) — 진입은 그 배너', async ({ page }) => {
  const banner = { id: 'hb1', title: '오픈 이벤트', subtitle: '카드 뽑기', image_url: '/nuri-logo.png', link_url: '/?event=1', active: true, sort_order: 1, starts_at: null, ends_at: null };
  await openHome(page, { board: liveBoard(), banners: [banner] });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('home-event-banner')).toHaveCount(0);
  await expect(page.getByTestId('home-event-menu')).toHaveCount(0);
  await expect(vp(page).getByRole('button', { name: '오픈 이벤트' }).first()).toBeVisible();
});

test('🔴 ⑥ 복제 슬라이드는 접근성 트리 밖이고 testid 가 없다 · 첫 "이전 배너" 가 마지막 장으로 랩한다', async ({ page }) => {
  await openHome(page, { board: null });
  await page.waitForTimeout(1500);
  const g = await vp(page).evaluate((el) => {
    const cards = Array.from(el.firstElementChild!.children) as HTMLElement[];
    const n = cards.length / 2;
    const dups = cards.slice(n);
    return { n, dupHidden: dups.every((c) => c.getAttribute('aria-hidden') === 'true' && c.tabIndex === -1), dupTestIds: dups.filter((c) => c.hasAttribute('data-testid')).length, widths: cards.map((c) => c.getBoundingClientRect().width) };
  });
  expect(g.dupHidden).toBe(true);
  expect(g.dupTestIds).toBe(0);
  expect(Math.max(...g.widths) - Math.min(...g.widths), '슬라이드 폭이 다르다(랩 경계가 깨진다)').toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: '이전 배너' }).click();
  await page.waitForTimeout(700);
  await expect(page.getByTestId('home-banner-dots').locator(`button[aria-label="${g.n}번째 배너"]`)).toHaveAttribute('aria-current', 'true');
});
