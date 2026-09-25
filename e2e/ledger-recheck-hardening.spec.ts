// MYSTORE-RECHECK(오너 2026-09-25) — 운영 적용된 20260925g 서버 강화에 화면을 맞췄는가.
//   ① 취소 비밀번호 오답: 서버가 errcode 42501 + '(N번 더 틀리면 10분 동안 잠깁니다)' 로 거절한다 → 화면은 그 문장을 **그대로** 보여야 한다
//      (종전 msgOf 는 42501 을 '이 계정에는 권한이 없습니다' 로 뭉갰다). 5회째는 hint LEDGER_PW_LOCKED → 쉬운 말(10분 잠금).
//   ② delete_ledger_session 이 p_password 를 받는다 → 비밀번호 설정 매장에서 바인 있는 장부를 지울 때 모달이 비밀번호를 묻고 실어 보낸다.
//      미설정 매장의 업주는 종전처럼 비밀번호 칸 없이 바로(p_password null).
// 운영 DB 에 쓰지 않는다 — RPC 는 전부 page.route 로 받아 기록만 한다(_fixtures 가드가 한 겹 더 끊는다).
// 음성 대조: ledger.ts ledgerErrorText 의 42501 한글 분기를 지우면 ① 이 '권한이 없습니다' 로 실패하고,
//   deleteLedgerSession 의 p_password 를 지우면 ② 의 p_password 검사가 실패한다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ed';
const VENUE = '55555555-5555-4555-8555-555555555555';
const kst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const DAY = kst();
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const pgErr = (message: string, code: string, hint: string | null = null) =>
  ({ status: 400, contentType: 'application/json', body: JSON.stringify({ message, code, details: null, hint }) });
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
const SESSION = {
  venue_id: VENUE, session_date: DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리 메인',
  discounts: [{ label: '1레벨', amount: 50_000 }],
  early_double_min: 20, early_single_min: 40, reg_closed: false, closed: false,
  opened_at: `${DAY}T10:00:00Z`, tournament_start: `${DAY}T19:00:00Z`, schedule_id: null, operators: [],
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
type Calls = { reduce: string[]; del: (string | null)[] };

async function openBoard(page: Page, calls: Calls, o: { hasPw: boolean }) {
  await page.setViewportSize({ width: 1280, height: 900 });
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
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    const u = r.request().url();
    if (/game_seq=eq\./.test(u) && /session_date=eq\./.test(u)) return r.fulfill(json(SESSION));
    return r.fulfill(json([SESSION]));
  });
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => r.fulfill(json([BUYIN])));
  await page.route(/\/rest\/v1\/ledger_players\?/, (r) => r.fulfill(json([PLAYER])));
  await page.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/customer_aliases\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(o.hasPw)));
  // 감액 RPC — 1회째 오답(남은 횟수 문구·42501), 2회째 잠금(hint LEDGER_PW_LOCKED). 서버 20260925g 의 실제 모양.
  await page.route(/\/rest\/v1\/rpc\/update_ledger_buyin_reduce/, (r) => {
    const a = r.request().postDataJSON() as { p_password: string };
    calls.reduce.push(a.p_password);
    if (calls.reduce.length === 1) return r.fulfill(pgErr('비밀번호가 올바르지 않습니다 (4번 더 틀리면 10분 동안 잠깁니다)', '42501'));
    return r.fulfill(pgErr('취소 비밀번호를 5번 틀려 10분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요', '42501', 'LEDGER_PW_LOCKED'));
  });
  await page.route(/\/rest\/v1\/rpc\/delete_ledger_session/, (r) => {
    const a = r.request().postDataJSON() as { p_password: string | null };
    calls.del.push(a.p_password ?? null);
    return r.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
  const store = page.locator('[data-tab="my-store"]');
  await expect(store).toBeVisible({ timeout: 20_000 });
  await store.locator('button:visible').filter({ hasText: /^장부$/ }).first().click({ timeout: 20_000 });
  await expect(store.locator('td button:visible').filter({ hasText: /^현/ }).first()).toBeVisible({ timeout: 25_000 });
  return store;
}

/** HoldToConfirmButton — 0.7초 꾹(포인터 down → 대기 → up) */
async function hold(page: Page, sel: ReturnType<Page['locator']>) {
  const box = await sel.boundingBox();
  if (!box) throw new Error('hold target has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(950);
  await page.mouse.up();
}

test('🔴 오답 문구의 남은 횟수가 그대로 보이고, 5회째는 10분 잠금 안내가 뜬다', async ({ page }) => {
  test.setTimeout(180_000);
  const calls: Calls = { reduce: [], del: [] };
  const store = await openBoard(page, calls, { hasPw: true });
  await store.locator('td button:visible').filter({ hasText: /^현/ }).first().click({ timeout: 20_000 });
  await page.getByRole('button', { name: /가게지원/ }).click();
  const sheet = page.getByTestId('ledger-reduce-pw');
  await expect(sheet).toBeVisible({ timeout: 10_000 });

  await sheet.getByLabel('취소 비밀번호').fill('0000');
  await sheet.getByRole('button', { name: '수정 확정' }).click();
  await expect(page.getByText('비밀번호가 올바르지 않습니다 (4번 더 틀리면 10분 동안 잠깁니다)').first(), '남은 횟수 문장이 사라졌다(42501 이 권한 문구로 뭉개짐)').toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('이 계정에는 권한이 없습니다')).toHaveCount(0);
  await expect(sheet).toBeVisible();

  await sheet.getByLabel('취소 비밀번호').fill('0001');
  await sheet.getByRole('button', { name: '수정 확정' }).click();
  await expect(page.getByText(/10분 동안 잠겼습니다/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/맞는 비밀번호를 넣어도/).first()).toBeVisible();
  expect(calls.reduce).toEqual(['0000', '0001']);
});

test('🔴 비밀번호 설정 매장: 바인 있는 장부 삭제는 취소 비밀번호를 묻고 p_password 로 보낸다', async ({ page }) => {
  test.setTimeout(180_000);
  const calls: Calls = { reduce: [], del: [] };
  const store = await openBoard(page, calls, { hasPw: true });
  await store.getByRole('button', { name: '목록으로' }).click();
  await store.getByRole('button', { name: `${DAY} 메인 장부 삭제` }).click({ timeout: 15_000 });

  const pw = page.getByLabel('취소 비밀번호');
  await expect(pw, '비밀번호 칸이 없다 — 빈 값으로 보내면 서버가 오답으로 세어 잠금 카운터가 오른다').toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('바인 기록이 있는 장부라 취소 비밀번호가 필요합니다')).toBeVisible();
  const holdBtn = page.getByRole('button', { name: '꾹 눌러 영구 삭제' });
  await expect(holdBtn).toBeDisabled();
  await hold(page, holdBtn);
  expect(calls.del, '비밀번호 없이 삭제 RPC 가 나갔다').toEqual([]);

  await pw.fill('4321');
  await expect(holdBtn).toBeEnabled();
  await hold(page, holdBtn);
  await expect.poll(() => calls.del.length, { timeout: 10_000 }).toBe(1);
  expect(calls.del).toEqual(['4321']);
});

test('비밀번호 미설정 매장의 업주는 종전처럼 비밀번호 칸 없이 바로 삭제된다(p_password null)', async ({ page }) => {
  test.setTimeout(180_000);
  const calls: Calls = { reduce: [], del: [] };
  const store = await openBoard(page, calls, { hasPw: false });
  await store.getByRole('button', { name: '목록으로' }).click();
  await store.getByRole('button', { name: `${DAY} 메인 장부 삭제` }).click({ timeout: 15_000 });
  const holdBtn = page.getByRole('button', { name: '꾹 눌러 영구 삭제' });
  await expect(holdBtn).toBeEnabled({ timeout: 10_000 });   // 잃는 수치가 오면 바로 누를 수 있다
  await expect(page.getByLabel('취소 비밀번호')).toHaveCount(0);
  await hold(page, holdBtn);
  await expect.poll(() => calls.del.length, { timeout: 10_000 }).toBe(1);
  expect(calls.del).toEqual([null]);
});
