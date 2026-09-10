// 외부 반출 버튼이 화면에서 사라졌는가 — 오너 지시(2026-09-09):
//   "외부 반출 기능은 제거한다 — CSV 다운로드·XLSX/JSON 내보내기·전체 일정 ICS·Google Calendar 보내기".
//   유지: 공유 링크·단건 상세 링크.
//
// 잠그는 것 둘:
//   ① 대회 상세 — '기기 캘린더'(구글 캘린더 / iOS .ics)·'캘린더에 추가' 버튼 0개, '공유 링크' 버튼은 1개(유지).
//   ② 매장 통계(매출·손님 + 고객 분석) — CSV·엑셀 버튼 0개. 패널이 **실제로 그려진 뒤** 센다 —
//      로딩 실패 카드 위에서 0개를 세면 아무것도 증명하지 못한다.
//
// 운영 DB 에는 쓰지 않는다 — 세션·매장·장부는 전부 page.route 로 만들고, 변이는 _fixtures 가드가 끊는다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';
import { type Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ee';
const VENUE = '33333333-3333-4333-8333-333333333333';
const SCHED = '44444444-4444-4444-8444-444444444444';
/** 앱의 '오늘'은 KST(kstToday) — settle-pane.spec 과 같은 이유로 UTC 날짜를 쓰지 않는다. */
const kst = (offsetDays: number) => new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** 대회 한 건 — 며칠 뒤 승인된 포스터. ?s= 딥링크는 목록(schedules)에서 찾으므로 목록 응답에 넣는다. */
const scheduleRow = () => ({
  id: SCHED, title: '테스트 데일리 메인', venue_id: VENUE, pub_name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1',
  date: kst(3), start_time: '19:00:00', duration: '5시간', format: 'MTT', guaranteed: true, prize_pool: 1_000_000,
  buy_in: { amount: 60_000 }, approved: true, display_order: 1, is_premium: false, premium_until: null,
  owner_id: UID, unread_qna_count: 0, view_count: 0, is_competition: false, grade: null,
});

test('🔴 대회 상세 — 캘린더 반출 버튼은 0개, 공유 링크는 1개', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 }); // 유저는 모바일 99%
  await page.route(/\/rest\/v1\/schedules\?/, (r) => r.fulfill(json([scheduleRow()])));
  // Playwright 새 페이지는 history 가 비어 모달이 열리자마자 닫힌다 — _session 의 shim 으로 막는다.
  await stabilizeBackstack(page);
  await page.goto(`/?s=${SCHED}`);

  const share = page.getByRole('button', { name: '공유 링크' });
  await expect(share, '대회 상세가 열리지 않았거나 공유 링크가 사라졌다(유지 대상)').toBeVisible({ timeout: 20_000 });
  await expect(share).toHaveCount(1);
  await expect(page.getByRole('button', { name: /기기 캘린더|캘린더에 추가/ }), '캘린더 반출 버튼이 남아 있다').toHaveCount(0);
  await expect(page.getByRole('button', { name: /CSV|엑셀/ })).toHaveCount(0);
});

// ── 매장 통계 ────────────────────────────────────────────────────────────────
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** 서명 없는 JWT — supabase-js 는 클라이언트에서 디코드만 한다(아무 문자열이면 만료를 못 읽어 세션을 버린다). */
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com',
          app_metadata: {}, user_metadata: { name: '업주' }, created_at: new Date().toISOString() },
};
const DAY = kst(0);
const sessionRow = () => ({
  venue_id: VENUE, session_date: DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리 메인', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
});
const buyinRow = (i: number, name: string) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE, session_date: DAY, game_seq: 1, player_name: name, entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${DAY}T12:00:00Z`, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0,
  ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
});
const playerRow = (i: number, name: string) => ({
  id: `dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE, session_date: DAY, game_seq: 1, name, visitor_type: 'regular', note: null, sort_order: i,
});

async function openStats(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 }); // 매장 운영은 PC 99%
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  // getMyProfile 은 .single() — 객체 하나여야 한다(배열이면 user.id 가 비는 반쪽 로그인).
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active',
    venue_id: VENUE, activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{
    id: VENUE, name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1', owner_id: UID,
    approved: true, status: 'active', verification_status: 'verified',
    is_paid_ad: false, display_order: 1, follower_count: 3, rating: 4.5,
  }])));
  // 매장 권한 RPC — 토큰이 가짜라 서버는 401 을 준다. 통계(매출·손님)는 can_manage_pos 가 연다.
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_manage_venue|can_view_vouchers)/, (r) => r.fulfill(json(true)));
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => r.fulfill(json([sessionRow()])));
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => r.fulfill(json([buyinRow(1, '김철수'), buyinRow(2, '이영희')])));
  await page.route(/\/rest\/v1\/ledger_players\?/, (r) => r.fulfill(json([playerRow(1, '김철수'), playerRow(2, '이영희')])));
  await page.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/customer_aliases\?/, (r) => r.fulfill(json([])));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // '내 매장'은 폭에 따라 role 이 바뀐다 — 보이는 버튼으로 찾는다.
  await page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
  await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
  // 대시보드의 '최근 7일 추세' 카드가 통계로 가는 실제 진입점(owner-layout-verify 와 같은 경로).
  // 섹션 나비는 접힌 메뉴 안이라 폭 0 일 수 있어 카드를 먼저, 없으면 나비의 '매출·손님'.
  // 셀렉터는 배지 문구가 아니라 data-testid 다 — 2026-09-11 문구가 '통계·AI'→'통계·운영 분석' 으로 바뀌었다.
  const entry = page.locator('button:has([data-testid="dash-stats-link"])').or(page.locator('button:visible').filter({ hasText: '매출·손님' }));
  await entry.first().click({ timeout: 20_000 });
}

test('🔴 매장 통계·고객 분석 — CSV·엑셀 반출 버튼이 0개', async ({ page }) => {
  test.setTimeout(90_000);
  await openStats(page);

  const store = page.locator('[data-tab="my-store"]');
  // 두 패널이 실제로 그려졌는가 — 통계 제목 + 고객 분석 제목(둘 다 예전에 CSV 버튼을 달고 있던 자리).
  await expect(store.getByRole('heading', { name: '통계', exact: true }), '통계 패널이 안 열렸다').toBeVisible({ timeout: 25_000 });
  await expect(store.getByRole('heading', { name: '고객 분석' }), '고객 분석 패널이 안 열렸다').toBeVisible({ timeout: 25_000 });
  // 실패 카드 위에서 세면 의미가 없다 — 재시도 버튼이 없어야 '그려진 상태'다.
  await expect(store.getByRole('button', { name: /다시 시도/ })).toHaveCount(0);

  await expect(store.getByRole('button', { name: /CSV|엑셀|내보내기/ }), 'CSV·엑셀 반출 버튼이 남아 있다').toHaveCount(0);
});
