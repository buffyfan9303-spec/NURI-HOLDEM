// 5단계 '정산' — 판으로 열리는가, 그날 숫자를 말하는가.
//
// 오너 2026-09-08: "5번 정산을 누르면 그날 정산이 나와야 하는데 왜 장부로 이동되는지 모르겠어.
//                   정산 탭을 활성화 … 그날 정산을 총체적으로 마무리".
//
// 잠그는 것: 단계 바의 '정산'을 누르면 **장부가 아니라 정산 판**이 열리고, 거기에
//   완납 매출 · 미수 · 손님 구성 · 순위가 실제 값으로 뜬다.
//
// 세션·매장·장부는 전부 목킹한다(운영 DB 를 건드리지 않는다). 금액 계산 자체는
// src/lib/ledgerSettlement.test.ts 가 단위로 못 박고, 여기서는 '화면에 닿는가'만 본다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ff';
const VENUE = '22222222-2222-4222-8222-222222222222';
/** ⚠ 앱의 '오늘'은 **KST 기준**(kstToday)이다. 여기서 UTC 날짜를 쓰면 한국 새벽(=UTC 전날)에
 *  픽스처만 하루 어긋나 '이 날짜에 연 장부가 없습니다'가 뜬다 — 2026-09-08 07:23 KST 에 실제로 그랬다. */
const DAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

/** 서명 없는 JWT — supabase-js 는 클라이언트에서 디코드만 한다(검증은 서버 몫).
 *  아무 문자열로 두면 getSession() 이 만료를 못 읽어 세션을 통째로 버린다. */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
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

const sessionRow = (gameSeq: number, over: Record<string, unknown> = {}) => ({
  venue_id: VENUE, session_date: DAY, game_seq: gameSeq,
  buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0,
  title: gameSeq === 1 ? '데일리 메인' : '사이드', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  ...over,
});
/** 비분납 현금은 **기록 시점 스냅샷**(cash_amount)이 정본이다 — 0 으로 두면 매출이 0 이 된다. */
const buyinRow = (i: number, name: string, over: Record<string, unknown> = {}) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE, session_date: DAY, game_seq: 1, player_name: name, entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${DAY}T12:00:00Z`, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0,
  ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
  ...over,
});
const playerRow = (i: number, name: string, visitor: string) => ({
  id: `dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE, session_date: DAY, game_seq: 1, name, visitor_type: visitor, note: null, sort_order: i,
});

async function openSettle(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 }); // 매장 운영은 PC 99%(CLAUDE.md)
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);

  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  // ⚠ getMyProfile 은 .single() 이라 **객체 하나**를 기대한다. 배열로 주면 user 는 truthy 인데
  //   user.id 만 undefined 인 반쪽 로그인이 된다(2026-09-08 에 이걸로 한참 헤맸다).
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active',
    venue_id: VENUE, activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{
    id: VENUE, name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1', owner_id: UID,
    approved: true, status: 'active', verification_status: 'verified',
    is_paid_ad: false, display_order: 1, follower_count: 3, rating: 4.5,
  }])));
  // 매장 권한 RPC 셋 — 토큰이 가짜라 서버가 401 을 주면 '매장 권한을 불러오지 못했습니다'로 막힌다.
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers)/, (r) => r.fulfill(json(true)));
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => r.fulfill(json([sessionRow(1)])));
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => r.fulfill(json([
    buyinRow(1, '김철수'), buyinRow(2, '김철수'), buyinRow(3, '이영희'),
    buyinRow(4, '박민수', { is_unpaid: true }),
  ])));
  await page.route(/\/rest\/v1\/ledger_players\?/, (r) => r.fulfill(json([
    playerRow(1, '김철수', 'regular'), playerRow(2, '이영희', 'new'), playerRow(3, '박민수', 'new'),
  ])));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
  await page.waitForTimeout(2000);

  const settle = page.getByRole('tab', { name: /정산/ });
  await expect(settle, '단계 바에 정산 탭이 없다').toBeVisible({ timeout: 15_000 });
  await settle.click();
  await page.waitForTimeout(2500);
}

test('🔴 정산 단계 — 장부가 아니라 정산 판이 열리고 그날 숫자를 말한다', async ({ page }) => {
  test.setTimeout(90_000);
  await openSettle(page);

  // 정산 판인가 — 장부에는 없고 정산 판에만 있는 문구
  await expect(page.getByRole('heading', { name: '기준 엔트리 대비' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: '머니인 순위' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '손님 구성' })).toBeVisible();

  // 그날 숫자 — 현금 3건 30만 + 미수 1건 10만
  const kpis = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of document.querySelectorAll('section p')) {
      const label = el.textContent?.trim() ?? '';
      if (['완납 매출', '미수금', '총 엔트리', '참여 인원'].includes(label)) {
        out[label] = el.nextElementSibling?.textContent?.trim() ?? '';
      }
    }
    return out;
  });
  console.log('[정산 KPI]', JSON.stringify(kpis));
  expect(kpis['완납 매출']).toBe('30만');
  expect(kpis['미수금']).toBe('10만');
  expect(kpis['참여 인원']).toBe('3명');
});

// ── 기기 시간대가 KST 보다 뒤일 때 ──────────────────────────────────────────
// 장부·서버는 전부 **KST**(kstToday · ledger_business_date) 기준인데, StoreDashboard 의 오늘은
// localToday() = **브라우저 로컬 TZ** 다. 그래서 정산 단계가 대시보드 날짜를 그대로 쓰면
// 한국 자정~오전 9시를 UTC 로 보는 기기·해외·시계 오설정에서 **하루 전 장부**를 연다.
// 실제로 CI(UTC 러너)에서 정산 판이 '이 날짜에 연 장부가 없습니다' 로 떠 이 스펙이 깨졌다.
test.describe('기기 시간대가 KST 보다 뒤여도', () => {
  test.use({ timezoneId: 'Pacific/Honolulu' }); // UTC-10 — 로컬 오늘이 KST 오늘보다 하루 뒤진다
  test('🔴 정산 판은 장부(KST) 기준 날짜를 연다', async ({ page }) => {
    test.setTimeout(90_000);
    await openSettle(page);
    const shown = await page.getByLabel('정산할 날짜').inputValue();
    console.log('[정산일]', shown, '· KST 오늘', DAY);
    expect(shown, '기기 시간대를 따라가 하루 전 장부를 열었다').toBe(DAY);
    await expect(page.getByRole('heading', { name: '기준 엔트리 대비' })).toBeVisible({ timeout: 10_000 });
  });
});
