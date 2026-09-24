// LEDGER-REDUCE-PASSWORD(오너 2026-09-24) — "직원이 장부 금액을 0으로 고치는 것도 취소 비밀번호로 막아."
//
// 기존 현금 10만 바인을 고칠 때:
//   · 가게지원(매출 0)으로 바꾸면 직접 UPDATE 를 보내지 않고 **비밀번호 시트**가 뜬다.
//     틀린 비밀번호는 서버 문구로 거절되고 시트가 남는다 → 맞는 비밀번호면 update_ledger_buyin_reduce 로 저장된다.
//   · 같은 금액의 카드로 바꾸는 것은 시트 없이 지금처럼 저장된다(PATCH 1회).
// 운영 DB 에 쓰지 않는다 — PATCH·RPC 는 전부 page.route 로 받아 기록만 한다(_fixtures 가드가 한 겹 더 끊는다).
// 음성 대조: ledger.ts updateBuyinFields 의 `throw new Error(REDUCE_NEEDS_PW)`(사전 판정)를 지우고
//   PATCH 목이 성공을 돌려주면 ① 이 '시트가 안 뜨고 PATCH 가 나갔다' 로 실패한다.
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

const BUYIN = {
  id: 'bbbbbbbb-0000-4000-8000-000000000001', venue_id: VENUE, session_date: DAY, game_seq: 1, player_name: '김철수', entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${DAY}T10:05:00Z`, created_by: UID, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0,
  discount_level: 0, discount_index: 0, early_override: 'none', request_id: null,
};
type Calls = { patch: unknown[]; rpc: { p_password: string; p_fields: Record<string, unknown> }[] };

async function openBoard(page: Page, calls: Calls, o: { hasPw: boolean; manage: boolean }) {
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
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_manage_venue|can_view_vouchers)/, (r) =>
    r.fulfill(json(o.manage || /can_access_ledger/.test(r.request().url()))));
  // getLedgerSession 은 .maybeSingle() 이라 **객체 하나**, getLedgerRange 는 배열이다(URL 연산자로 가른다).
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    const u = r.request().url();
    if (/game_seq=eq\./.test(u) && /session_date=eq\./.test(u)) return r.fulfill(json(SESSION));
    return r.fulfill(json([SESSION]));
  });
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => {
    if (r.request().method() === 'PATCH') { calls.patch.push(r.request().postDataJSON()); return r.fulfill(json([{ ...BUYIN, ...r.request().postDataJSON() }])); }
    return r.fulfill(json([BUYIN]));
  });
  await page.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(o.hasPw)));
  await page.route(/\/rest\/v1\/rpc\/update_ledger_buyin_reduce/, (r) => {
    const a = r.request().postDataJSON() as Calls['rpc'][number];
    calls.rpc.push(a);
    if (o.hasPw && a.p_password !== '4321') return r.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ message: '비밀번호가 올바르지 않습니다', code: 'P0001', details: null, hint: null }) });
    return r.fulfill({ status: 204, body: '' });
  });
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
  // 기존 현금 셀('현' + 시각)이 그려지면 보드가 산 것이다(이름 텍스트는 숨은 목록에도 있어 첫 매치가 hidden 일 수 있다).
  await expect(store.locator('td button:visible').filter({ hasText: /^현/ }).first()).toBeVisible({ timeout: 25_000 });
  return store;
}

/** 기존 현금 셀('현' + 시각)을 눌러 결제 모달을 연다 */
async function openCell(page: Page, o = { hasPw: true, manage: true }) {
  const calls: Calls = { patch: [], rpc: [] };
  await page.setViewportSize({ width: 1280, height: 900 });
  const store = await openBoard(page, calls, o);
  await store.locator('td button:visible').filter({ hasText: /^현/ }).first().click({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /가게지원/ })).toBeVisible({ timeout: 15_000 });
  return calls;
}

test('🔴 현금 10만 → 가게지원(매출 0) 은 취소 비밀번호 없이 저장되지 않는다', async ({ page }) => {
  test.setTimeout(180_000);
  const calls = await openCell(page);
  await page.getByRole('button', { name: /가게지원/ }).click();

  const sheet = page.getByTestId('ledger-reduce-pw');
  await expect(sheet, '감액 수정인데 비밀번호 시트가 뜨지 않았습니다').toBeVisible({ timeout: 10_000 });
  expect(calls.patch, '비밀번호 없이 ledger_buyins 직접 UPDATE 가 나갔습니다').toEqual([]);

  // 틀린 비밀번호 — 서버 문구 그대로, 시트는 남는다
  await sheet.getByLabel('취소 비밀번호').fill('0000');
  await sheet.getByRole('button', { name: '수정 확정' }).click();
  await expect(page.getByText('비밀번호가 올바르지 않습니다').first()).toBeVisible({ timeout: 10_000 });
  await expect(sheet).toBeVisible();

  // 맞는 비밀번호 — RPC 로 저장되고 모달이 닫힌다
  await sheet.getByLabel('취소 비밀번호').fill('4321');
  await sheet.getByRole('button', { name: '수정 확정' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 10_000 });
  expect(calls.rpc.map((c) => c.p_password)).toEqual(['0000', '4321']);
  expect(calls.rpc[1].p_fields).toMatchObject({ payment_method: 'support', cash_amount: 0 });
  expect(calls.patch).toEqual([]);
});

test('같은 금액의 카드로 바꾸는 수정은 시트 없이 지금처럼 저장된다', async ({ page }) => {
  test.setTimeout(180_000);
  const calls = await openCell(page);
  await page.getByRole('button', { name: /카드 완납/ }).click();
  await expect.poll(() => calls.patch.length, { timeout: 10_000 }).toBe(1);
  await expect(page.getByTestId('ledger-reduce-pw')).toHaveCount(0);
  expect(calls.patch[0]).toMatchObject({ payment_method: 'card', card_amount: 100_000 });
  expect(calls.rpc).toEqual([]);
});

// 오너 결정(2026-09-24): 비밀번호 미설정 매장 — 업주·공동사장은 시트 없이 RPC 로 저장, 직원은 안내만.
test('비밀번호 미설정 매장의 업주는 시트 없이 감액 수정이 저장된다', async ({ page }) => {
  test.setTimeout(180_000);
  const calls = await openCell(page, { hasPw: false, manage: true });
  await page.getByRole('button', { name: /가게지원/ }).click();
  await expect.poll(() => calls.rpc.length, { timeout: 10_000 }).toBe(1);
  await expect(page.getByTestId('ledger-reduce-pw')).toHaveCount(0);
  expect(calls.rpc[0].p_fields).toMatchObject({ payment_method: 'support', cash_amount: 0 });
  expect(calls.patch).toEqual([]);
});

test('🔴 비밀번호 미설정 매장의 직원은 감액 수정을 저장할 수 없다', async ({ page }) => {
  test.setTimeout(180_000);
  const calls = await openCell(page, { hasPw: false, manage: false });
  await page.getByRole('button', { name: /가게지원/ }).click();
  await expect(page.getByText('취소 비밀번호가 설정되지 않은 매장은 업주만 금액을 줄일 수 있습니다').first()).toBeVisible({ timeout: 10_000 });
  expect(calls.rpc).toEqual([]);
  expect(calls.patch).toEqual([]);
});
