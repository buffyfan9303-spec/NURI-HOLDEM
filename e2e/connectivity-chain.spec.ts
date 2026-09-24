// e2e/connectivity-chain.spec.ts — 연결성 감사①(2026-09-24, root-cause-debugger 실측)의 결함 4건 회귀 가드.
//
// 부류: keep-alive 판의 재조회 신호가 `activeTab` 하나뿐이라 ① 구독이 닫혀 있던 탭에서 돌아온 경우 ② 같은 탭 위
//   오버레이(매장·상세)에서 바뀐 것을 따라오지 못했다. 거기에 카드 키보드 가로채기 1건.
//   H1 커뮤니티 → 홈 복귀: 그 사이 바뀐 일정을 다시 읽는다(App wantScheduleRealtime 상승 시 reloadSchedules)
//   H2 카드 안 매장명 버튼에서 Enter → **매장** 페이지(카드 onKeyDown 이 가로채 포스터 상세가 열렸다)
//   H3 라이브 → 매장 페이지에서 팔로우 → 닫기 → 단골 하트가 바로 따라온다(LiveGamesTab active 에 오버레이 반영)
//   H4 캘린더 → 상세에서 찜 → 닫기 → 캘린더 '찜한 게임' 이 바로 따라온다(ScheduleDetailModal onLikeChange → resVersion)
// 음성 대조: 수정 전 커밋(d8de4f95)의 격리 스냅샷에서 같은 스펙을 돌리면 4건 모두 빨개진다(보고서에 수치).
// ⚠ 운영 DB 쓰기 0 — 쓰기(팔로우·찜)는 page.route 로 로컬 응답. 로그인은 로컬 세션(stubLogin/bootOwner).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';
import { bootOwner, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const TODAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const VENUE_ID = '22222222-2222-4222-8222-222222222222';
const SID = 'bbbbbbbb-0000-4000-8000-000000000001';
const row = (title: string, over: Record<string, unknown> = {}) => ({
  id: SID, title, venue_id: VENUE_ID, pub_name: '연결 감사 홀덤펍', region: '서울', address: '서울 1',
  date: TODAY, start_time: '23:50:00', duration: '4시간', format: 'MTT', guaranteed: true,
  prize_pool: 10_000_000, prize_percent: null, is_competition: false, grade: null, blinds: null,
  buy_in: { amount: 100_000 }, display_order: 0, is_premium: false, owner_id: VENUE_ID, approved: true,
  unread_qna_count: 0, view_count: 1, premium_until: null, reg_close_time: '12LV', structure: {},
  rejected_at: null, reject_reason: null, ...over,
});
const VENUE_ROW = { id: VENUE_ID, name: '연결 감사 홀덤펍', region: '서울', address: '서울 1',
  approved: true, status: 'active', verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 3, rating: null };
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const gotoTab = (page: Page, t: string) => page.evaluate((x) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: x })), t);

async function mockSchedules(page: Page, st: { title: string; gets: number }) {
  await page.route(/\/rest\/v1\/schedules\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    st.gets += 1;
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill(json(single ? row(st.title) : [row(st.title)]));
  });
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill(json(single ? VENUE_ROW : [VENUE_ROW]));
  });
}

test('🔴 H1 — 커뮤니티에 있는 동안 바뀐 일정을 홈으로 돌아오면 따라잡는다', async ({ page }) => {
  test.setTimeout(90_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const st = { title: '옛 제목 대회', gets: 0 };
  await mockSchedules(page, st);
  await page.goto('/');
  await expect(page.locator('#home-schedule').getByText('옛 제목 대회').first()).toBeVisible({ timeout: 20_000 });
  await gotoTab(page, 'community');
  await expect(page.locator('main[data-tab="community"]'), '커뮤니티로 못 갔다 — 대조가 성립하지 않는다').toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  st.title = '새 제목 대회';           // 그 사이 서버에서 수정됨 — 커뮤니티에서는 일정 구독이 닫혀 있다
  const before = st.gets;
  await gotoTab(page, 'home');
  await expect(page.locator('#home-schedule').getByText('새 제목 대회').first(),
    `홈 복귀에 일정을 다시 안 읽었다(GET ${before} → ${st.gets}) — 커뮤니티에 있던 사이의 변경을 영영 못 본다`)
    .toBeVisible({ timeout: 15_000 });
  expect(st.gets, '복귀 재조회가 없다').toBeGreaterThan(before);
});

test('🔴 H2 — 카드 안 매장명에서 Enter 는 매장 페이지를 연다(포스터 상세가 아니다)', async ({ page }) => {
  test.setTimeout(90_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const st = { title: '키보드 대회', gets: 0 };
  await mockSchedules(page, st);
  await page.goto('/');
  const card = page.locator('#home-schedule article[role="button"]').filter({ hasText: '키보드 대회' }).first();
  await card.waitFor({ timeout: 20_000 });
  const venueBtn = card.locator('button').filter({ hasText: '연결 감사 홀덤펍' }).first();
  await expect(venueBtn, '카드 안 매장명 버튼을 못 찾았다 — 검사가 대상에 도달 못 했다').toBeVisible();
  await venueBtn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /매장 페이지/ }), 'Enter 가 매장 페이지를 열지 않았다').toBeVisible({ timeout: 10_000 });
  expect(await page.locator('[data-sched-panel]').count(), 'Enter 가 카드에 가로채여 포스터 상세가 열렸다').toBe(0);
  // 양성 대조 — 카드 자체에서 Enter 는 여전히 포스터 상세다
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /매장 페이지/ })).toBeHidden({ timeout: 10_000 });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-sched-panel]'), '카드 자체의 Enter 가 포스터 상세를 안 연다(가드가 과했다)').toBeVisible({ timeout: 10_000 });
});

test('🔴 H3 — 라이브에서 연 매장 페이지에서 팔로우하고 닫으면 단골 하트가 바로 따라온다', async ({ page }) => {
  test.setTimeout(90_000);
  const TITLE = '라이브 데일리';
  const CLOCK = {
    venue_id: MOCK_VENUE, game_seq: 1, session_date: MOCK_DAY, title: TITLE, running: true,
    current_index: 3, ends_at: null, remaining_ms: 7 * 60 * 1000,
    adj_entries: 24, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 6, live_stats: null,
    config: { title: TITLE, startStack: 30000, rebuyStack: 30000, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0,
      regCloseLevel: 12, maxLevel: 20, earlyDoubleLevel: 2, earlySingleLevel: 4, earlyDoubleMin: 40, earlySingleMin: 80, mysteryBounty: 0, prizes: [],
      levels: Array.from({ length: 20 }, (_, i) => ({ level: i + 1, sb: 100, bb: 200, ante: 200, minutes: 20, isBreak: false })) },
  };
  let followed = false; let favGets = 0;
  await bootOwner(page, {
    viewport: { width: 390, height: 844 }, clock: CLOCK, goto: false,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/venue_follows/, (r) => {
        const m = r.request().method(); const u = r.request().url();
        if (m === 'POST') { followed = true; return r.fulfill(json([], 201)); }
        if (m === 'DELETE') { followed = false; return r.fulfill(json([])); }
        if (/select=venue_id/.test(u) && !/venue_id=eq/.test(u)) favGets += 1;
        return r.fulfill(json(followed ? [{ venue_id: MOCK_VENUE, user_id: 'x' }] : []));
      });
    },
  });
  await page.goto('/?tab=live');
  const live = page.locator('div[data-tab="live"]');
  await expect(live).toBeVisible({ timeout: 20_000 });
  const venueBtn = live.getByRole('button', { name: /테스트 홀덤펍 매장/ }).first();
  await venueBtn.waitFor({ timeout: 20_000 });
  expect(await live.getByText('즐겨찾기').count(), '시작부터 단골 하트가 있다 — 대조가 성립하지 않는다').toBe(0);
  await venueBtn.click();
  const dlg = page.getByRole('dialog', { name: /매장 페이지/ });
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  await dlg.getByRole('button', { name: '매장 팔로우' }).click();
  await expect(dlg.getByRole('button', { name: '매장 팔로우' })).toHaveAttribute('aria-pressed', 'true');
  const getsBeforeClose = favGets;
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden({ timeout: 10_000 });
  await expect(live.getByText('즐겨찾기').first(), '매장 페이지를 닫았는데 라이브의 단골 하트가 안 따라왔다(탭을 왕복해야 보였다)')
    .toBeVisible({ timeout: 6_000 });
  expect(favGets, '닫는 순간 단골 목록을 다시 안 읽었다').toBeGreaterThan(getsBeforeClose);
});

test('🔴 H4 — 캘린더에서 연 상세에서 찜하고 닫으면 캘린더가 바로 따라온다', async ({ page }) => {
  test.setTimeout(90_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const st = { title: '캘린더 찜 대회', gets: 0 };
  await mockSchedules(page, st);
  let liked = false; let likeListGets = 0;
  await page.route(/\/rest\/v1\/schedule_likes/, (r) => {
    const m = r.request().method(); const u = r.request().url();
    if (m === 'POST') { liked = true; return r.fulfill(json([], 201)); }
    if (m === 'DELETE') { liked = false; return r.fulfill(json([{ schedule_id: SID }])); }
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    if (!/schedule_id=eq/.test(u)) likeListGets += 1;
    const rows = liked ? [{ schedule_id: SID }] : [];
    return r.fulfill(json(single ? (rows[0] ?? null) : rows));
  });
  const uid = await stubLogin(page);
  // toggleScheduleLike 는 저장 전에 auth.getUser() 로 uid 를 확인한다 — 로컬 세션이라 이 조회도 로컬로 답한다(운영 무접촉).
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json({ id: uid, aud: 'authenticated', role: 'authenticated', email: 'e2e@example.com', app_metadata: {}, user_metadata: {} })));
  await page.goto('/?tab=calendar');
  const cal = page.locator('[data-tab="calendar"]');
  await expect(cal).toBeVisible({ timeout: 20_000 });
  const open = cal.getByRole('button').filter({ hasText: '캘린더 찜 대회' }).first();
  await open.waitFor({ timeout: 20_000 });
  await expect(cal.getByText('찜한 게임'), '시작부터 찜한 게임이 있다 — 대조가 성립하지 않는다').toHaveCount(0);
  await open.click();
  const panel = page.locator('[data-sched-panel]');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const likeBtn = panel.getByRole('button', { name: /^찜/ }).first();
  // 재조회는 저장 성공 **직후**(닫기 전) 일어날 수 있다 — 기준은 누르기 전에 잡는다.
  const getsBeforeLike = likeListGets;
  await likeBtn.click();
  await expect(likeBtn).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => liked, { message: '찜 저장(로컬 응답)이 안 일어났다 — 검사가 대상에 도달 못 했다' }).toBe(true);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden({ timeout: 10_000 });
  await expect(cal.getByText('찜한 게임').first(), '상세에서 찜했는데 캘린더의 찜한 게임이 안 따라왔다(탭을 왕복해야 보였다)')
    .toBeVisible({ timeout: 6_000 });
  expect(likeListGets, '찜 뒤에 캘린더가 찜 목록을 다시 안 읽었다').toBeGreaterThan(getsBeforeLike);
});
