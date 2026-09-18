// 이벤트 상시 진입(§4) — **광고를 내리는 것과 문을 잠그는 것은 다른 결정이다.**
//
// 2026-09-12 이전: 홈의 이벤트 칸은 `eventBannerVisible`(live · 시작함 · 카드 남음) 하나에 묶여 있었고,
//   그 판정이 꺼지는 순간 홈에서 이벤트로 가는 길이 통째로 사라졌다. `?event=1` 을 아는 사람만 들어갈 수 있었다.
//   이벤트가 0개일 때 · 조회가 실패했을 때 · 카드가 다 열렸을 때 · 비로그인일 때 — 넷 다 그랬다.
//
// 이 스펙이 잠그는 것:
//   ① 네 상태 전부에서 홈에 진입 칸이 남고, 눌러서 이벤트 판까지 간다.
//   ② PC GNB 에도 상시 칸이 있다(모바일 하단 5칸은 건드리지 않는다).
//   ③ 이벤트 판의 '로그인하고 참여하기'는 판을 **닫지 않는다** — 닫으면 로그인 왕복 스냅샷이
//      `kind:'tab'` 으로 덮여 돌아왔을 때 홈에 떨어진다(복원 종류만 추가하면 소용없는 바로 그 순서 문제).
// 2026-09-18 오너 지시("이벤트 탭을 누르면 이벤트 리스트로 이동하게 해") 반영: 슬러그 없이 여는 진입
//   (홈 메뉴·PC GNB)은 이제 곧장 보드가 아니라 **목록**을 먼저 연다. 아래는 그 진입점들을 "목록 열림 확인 →
//   event-list-item 클릭 → 보드 확인" 2단계로 갱신했다 — 단언을 지운 게 아니라 한 단계를 끼웠다.
//   딥링크(`?event=1`) 축은 안 바뀌었다(App.tsx openEvent — 실제 문자열 인자는 종전대로 보드 직행) — 그 테스트(맨 아래
//   로그인 보존 테스트)는 그대로 둔다.
import { test, expect } from './_fixtures';

const EVENT_RPC = /\/rest\/v1\/rpc\/event_board/;
const EVENTS_LIST = /\/rest\/v1\/event_campaigns\?/;
const MENU = 'home-event-menu';
const DIALOG = '[role="dialog"][aria-label="이벤트"]';
const LIST = '[data-testid="event-list-page"]';

const j = (body: unknown, status = 200) => ({ status, contentType: 'application/json' as const, body: JSON.stringify(body) });

/** 카드가 다 열린(소진) 보드 — 광고는 내려가지만 결과는 볼 수 있어야 한다. */
const SOLD_OUT = {
  slug: 'card-open-2026-09', title: '오픈 기념 이벤트', subtitle: null, status: 'live',
  venueId: '00000000-0000-0000-0000-000000000000', startsAt: null, endsAt: null,
  voucherTitle: '매장이용권',
  cards: [{ idx: 1, opened: true, tier: 1, count: 1, by: '누군가' }, { idx: 2, opened: true, tier: null, count: null, by: '누군가' }],
  myTickets: 0, remainByTier: {}, totalByTier: { 1: 1, none: 1 }, voucherByTier: { 1: 1 },
};
/** 목록에 실릴 캠페인 1개 — 아래 '소진' 케이스가 이 slug 를 눌러 위 SOLD_OUT 보드로 간다. */
const LISTED = { slug: SOLD_OUT.slug, title: SOLD_OUT.title, subtitle: null, status: 'live', hidden_at: null, starts_at: null, ends_at: null };

test('🔴 상시 진입 — 캠페인이 하나도 없어도 목록이 그 사실을 말한다(비로그인)', async ({ page }) => {
  await page.route(EVENTS_LIST, (r) => r.fulfill(j([])));
  await page.route(EVENT_RPC, (r) => r.fulfill(j(null)));
  await page.goto('/');
  // 이 스펙은 전부 비로그인으로 돈다(_fixtures 는 세션을 심지 않는다) — '비로그인' 케이스가 따로 없는 이유다.
  const menu = page.getByTestId(MENU);
  await expect(menu, '홈의 이벤트 진입 칸이 사라졌다 — 목록으로 가는 길이 없다').toBeVisible({ timeout: 15_000 });

  await menu.click();
  await expect(page.locator(LIST), '진입 칸을 눌렀는데 목록이 안 열린다').toBeVisible({ timeout: 15_000 });
  // 목록 자체가 빈 상태 답을 말한다 — 캠페인 0개는 보드가 아니라 여기서 갈린다(listEvents 는 board 를 거치지 않는다).
  await expect(page.locator(LIST).getByText('진행 중인 이벤트가 없어요')).toBeVisible({ timeout: 15_000 });
});

test('🔴 상시 진입 — 목록 조회 실패는 "없음" 과 다른 말을 한다', async ({ page }) => {
  await page.route(EVENTS_LIST, (r) => r.fulfill(j({ message: 'boom' }, 500)));
  await page.route(EVENT_RPC, (r) => r.fulfill(j(null)));
  await page.goto('/');
  await page.getByTestId(MENU).click();
  const list = page.locator(LIST);
  await expect(list, '진입 칸을 눌렀는데 목록이 안 열린다').toBeVisible({ timeout: 15_000 });
  await expect(list.getByText(/불러오지 못|다시/).first(), '목록 조회가 실패했는데 안내가 없다').toBeVisible({ timeout: 15_000 });
});

test('🔴 상시 진입 — 목록에서 고른 캠페인이 소진이어도 보드까지 도달한다', async ({ page }) => {
  await page.route(EVENTS_LIST, (r) => r.fulfill(j([LISTED])));
  await page.route(EVENT_RPC, (r) => r.fulfill(j(SOLD_OUT)));
  await page.goto('/');
  const menu = page.getByTestId(MENU);
  await expect(menu, '홈의 이벤트 진입 칸이 사라졌다').toBeVisible({ timeout: 15_000 });

  await menu.click();
  const list = page.locator(LIST);
  await expect(list, '진입 칸을 눌렀는데 목록이 안 열린다').toBeVisible({ timeout: 15_000 });
  // 목록 열림 확인 → event-list-item 클릭 → 보드 확인 (2026-09-18 오너 지시로 진입이 2단계가 됐다).
  await list.getByTestId('event-list-item').first().click();
  await expect(page.locator(DIALOG), '목록에서 캠페인을 골랐는데 보드가 안 열린다').toBeVisible({ timeout: 15_000 });
  // 판은 빈 화면이 아니라 **답**을 말한다(소진).
  await expect(page.locator(DIALOG).getByText(/모두 열렸어요/).first()).toBeVisible({ timeout: 15_000 });
});

test('🔴 PC GNB — 이벤트 칸은 상태와 무관하게 늘 있다 · 누르면 목록 → 보드', async ({ page }) => {
  await page.route(EVENTS_LIST, (r) => r.fulfill(j([LISTED])));
  await page.route(EVENT_RPC, (r) => r.fulfill(j(null)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const gnb = page.locator('[data-stack-tabbar]');
  const evt = gnb.getByRole('tab', { name: /이벤트/ });
  await expect(evt, 'PC GNB 에 상시 이벤트 칸이 없다').toBeVisible({ timeout: 15_000 });
  await evt.click();
  // 2026-09-18 오너 지시: GNB '이벤트' 도 슬러그 없이 부르므로 목록이 먼저 열린다.
  const list = page.locator(LIST);
  await expect(list, 'GNB 이벤트를 눌렀는데 목록이 안 열린다').toBeVisible({ timeout: 15_000 });
  await expect(evt, '목록이 떠 있는데 GNB 활성 표시가 이벤트가 아니다').toHaveAttribute('aria-selected', 'true');
  await list.getByTestId('event-list-item').first().click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });
  await expect(evt, '보드가 떠 있는데 GNB 활성 표시가 이벤트가 아니다').toHaveAttribute('aria-selected', 'true');
});

test('🔴 하단 5칸은 그대로다 — 이벤트는 홈 칸으로 접힌다(browse 선례)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: '하단 내비게이션' });
  await expect(bar).toBeVisible({ timeout: 15_000 });
  const before = await bar.getByRole('button').allInnerTexts();
  expect(before.length, `하단 탭바가 ${before.length}칸이다 — 5칸 계약이 깨졌다`).toBe(5);
  expect(before.join('|'), '하단 탭바에 이벤트 칸이 생겼다 — 여긴 건드리지 않기로 한 자리다').not.toMatch(/이벤트/);
});

test('🔴 이벤트 판의 로그인 버튼은 판을 닫지 않는다 — 닫으면 로그인 왕복 뒤 홈에 떨어진다', async ({ page }) => {
  // 비로그인 + 참여 가능한 보드라야 '로그인하고 참여하기' 가 뜬다 — 실제 캠페인 유무와 무관하게 고정한다.
  await page.route(EVENT_RPC, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...SOLD_OUT, cards: [{ idx: 1, opened: false, tier: null, count: null, by: null }], remainByTier: { 1: 1 } }),
  }));
  await page.goto('/?event=1');
  const dlg = page.locator(DIALOG);
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  const login = dlg.getByRole('button', { name: '로그인하고 참여하기' });
  await expect(login).toBeVisible({ timeout: 15_000 });
  await login.click();
  // 로그인 창이 뜨고 — 그 **뒤에** 이벤트 판이 그대로 살아 있어야 한다.
  await expect(page.getByText(/로그인|이메일/).first()).toBeVisible({ timeout: 15_000 });
  await expect(dlg, '로그인 창을 열면서 이벤트 판이 닫혔다 — 이 순간의 화면 스냅샷이 홈으로 덮인다')
    .toBeVisible();
  // 그리고 주소에도 이벤트가 남아 있다(구글 왕복은 origin 으로 돌아오지만, 이메일 경로는 이 주소 그대로다).
  await expect(page).toHaveURL((u) => u.searchParams.has('event'));
});
