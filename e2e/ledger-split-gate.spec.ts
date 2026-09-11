// 장부 분납 입력 게이트 — 합계가 '단가 − 할인' 과 맞지 않으면 저장할 수 없다 (2026-09-11)
//
// 왜 이 스펙이 생겼나
//   splitMismatch() 는 2026-08 부터 정의·문서·단위테스트가 모두 있었는데 **프로덕션 호출부가 0곳**이었다.
//   그래서 10만 게임에 현금 4만 + 카드 4만을 넣어도 그대로 저장됐고, buyinFinance 가 그 8만을
//   value 로 받아 **엔트리 0.8** 로 셌다. 미수 칸은 0이라 사라진 2만은 장부 어디에도 흔적이 없다.
//   단위테스트는 이 부류를 못 잡는다 — 틀린 것은 식이 아니라 '아무도 안 불렀다'는 사실이었다.
//   그래서 여기서는 **사람이 실제로 막히는가**를 화면에서 확인한다.
//
// 운영 DB 에 쓰지 않는다 — 세션·매장·장부는 전부 page.route 로 만들고, 저장 버튼은 **누르지 않는다**
// (눌릴 수 있는지/없는지만 본다). 변이 요청은 _fixtures 가드가 한 겹 더 끊는다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ed';
const VENUE = '55555555-5555-4555-8555-555555555555';
const kst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const DAY = kst();
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }),
             b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
             'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'owner2@example.com',
          app_metadata: {}, user_metadata: { name: '업주' }, created_at: new Date().toISOString() },
};

/** 10만 바인 · 1레벨 5만 할인 — 오너 예시와 같은 판(장부의 세 수: 1회 · 0.5 · 2). */
const SESSION = {
  venue_id: VENUE, session_date: DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리 메인',
  discounts: [{ label: '1레벨', amount: 50_000 }],
  early_double_min: 20, early_single_min: 40, reg_closed: false, closed: false,
  opened_at: `${DAY}T10:00:00Z`, tournament_start: `${DAY}T19:00:00Z`, schedule_id: null,
};
const PLAYER = {
  id: 'ffffffff-0000-4000-8000-000000000001',
  venue_id: VENUE, session_date: DAY, game_seq: 1, name: '김철수', visitor_type: 'regular', note: null, sort_order: 1,
};

async function openBoard(page: Page) {
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active',
    venue_id: VENUE, activity_points: 0, created_at: FAKE.user.created_at,
    agreed_to_terms: true, consented_legal_version: 2,
  })));
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{
    id: VENUE, name: '테스트 홀덤', region: '서울', address: '서울 강남구 1', owner_id: UID,
    approved: true, status: 'active', verification_status: 'verified',
    is_paid_ad: false, display_order: 1, follower_count: 0, rating: 4.5,
  }])));
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_manage_venue|can_view_vouchers)/, (r) => r.fulfill(json(true)));
  // getLedgerSession 은 .maybeSingle() 이라 **객체 하나**, getLedgerRange 는 배열이다(URL 연산자로 가른다).
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    const u = r.request().url();
    if (/game_seq=eq\./.test(u) && /session_date=eq\./.test(u)) return r.fulfill(json(SESSION));
    return r.fulfill(json([SESSION]));
  });
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/ledger_players\?/, (r) => r.fulfill(json([PLAYER])));
  await page.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/customer_aliases\?/, (r) => r.fulfill(json([])));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
  const store = page.locator('[data-tab="my-store"]');
  await expect(store).toBeVisible({ timeout: 20_000 });
  // 단계 바의 '장부' — 게임 진행 5단계 중 2단계.
  await store.locator('button:visible').filter({ hasText: /^장부$/ }).first().click({ timeout: 20_000 });
  // 보드가 살았는가 — 손님 이름이 행으로 그려지면 셀을 누를 수 있다.
  await expect(store.getByText('김철수').first()).toBeVisible({ timeout: 25_000 });
  return store;
}

/** 만 단위 입력칸 — 라벨 텍스트로 찾는다(AmountRow 는 label + input 한 쌍). */
const amount = (page: Page, label: string) =>
  page.locator('label').filter({ hasText: new RegExp(`^${label}`) }).locator('input[type="number"]').first();

test('🔴 분납 합계가 받을 금액과 다르면 저장할 수 없다 — 사라지는 돈을 만들지 않는다', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const store = await openBoard(page);

  // 빈 셀('+')을 눌러 결제 모달을 연다.
  await store.locator('button:visible').filter({ hasText: /^\+$/ }).first().click({ timeout: 20_000 });
  await page.getByText('분납 / 할인 상세 입력').click({ timeout: 15_000 });

  const save = page.locator('button:visible').filter({ hasText: /^저장$/ }).last();

  // ── ① 부족: 10만 게임에 현금 4만 + 카드 4만 = 8만 (예전엔 그대로 저장됐다)
  await amount(page, '현금').fill('4');
  await amount(page, '카드').fill('4');
  await expect(page.getByText('2만원 부족합니다')).toBeVisible({ timeout: 10_000 });
  await expect(save, '합계가 2만원 모자란데 저장이 열려 있습니다 — 엔트리가 0.8 로 기록됩니다').toBeDisabled();

  // ── ② 한 번에 미수로 — 부족분을 정본 경로(미수)로 옮기면 저장이 열린다
  await page.getByRole('button', { name: /부족분 2만원을 미수로 잡기/ }).click();
  await expect(amount(page, '미수')).toHaveValue('2');
  await expect(page.getByText('2만원 부족합니다')).toHaveCount(0);
  await expect(save, '합계를 맞췄는데도 저장이 막혀 있습니다').toBeEnabled();

  // ── ③ 초과: 오입력도 같은 게이트에 걸린다(자르지 않고 숫자로 드러낸다)
  await amount(page, '미수').fill('0');
  await amount(page, '카드').fill('0');
  await amount(page, '현금').fill('12');   // 12만 → 받을 금액 10만보다 2만 많다
  await expect(page.getByText('2만원 초과입니다')).toBeVisible({ timeout: 10_000 });
  await expect(save, '합계가 2만원 넘치는데 저장이 열려 있습니다').toBeDisabled();

  // 저장은 끝까지 누르지 않는다 — 이 스펙은 게이트만 검사하고 운영 데이터를 만들지 않는다.
  await page.screenshot({ path: 'test-results/split-gate.png', fullPage: false });
});
