// R5-03(2026-10-04) — 이용권 사용 요청을 보낸 뒤 홈 '참가 요청' 배너(myBuyinReqs)를 다시 읽는가.
// 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit5-regress-connect-1004.md#R5-03
// 이용권 사용(redeem_my_voucher_by_qr/phone)은 매장 장부에 '대기 바인 요청'을 만든다. 홈 배너는 그 요청을 읽는데
// 시트 두 경로(여러 장 보내기 · 지갑 1장 사용)는 성공 뒤 `nuri:buyin-request-sent` 를 안 쏴서 배너가 낡은 채로 남았다.
// 목 환경엔 websocket 이 없어 구독 갱신과 구분이 안 된다 → '재조회 RPC 호출 횟수'로 단언한다(R4-03 과 같은 방식).
// ⚠ 가짜 env 로 빌드한 서버에서만 의미가 있다(env 없으면 mock 모드라 page.route 가 안 먹는다).
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const KEYS = ['sb-idsxiqspecrucvfvtgbw-auth-token', 'sb-e2efake-auth-token'];
const UID = '00000000-0000-4000-8000-00000000c503';
const VENUE = '11111111-1111-4111-8111-11111111c503';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const SESSION = {
  access_token: [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: exp() }), 'e2e'].join('.'),
  refresh_token: 'e2e-r503', token_type: 'bearer', expires_in: 3600, expires_at: exp(),
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'r503@example.com', app_metadata: { provider: 'email' }, user_metadata: { name: 'R503' }, created_at: '2026-01-01T00:00:00Z' },
};
// ci_hash 가 있어야 verified(=!!ci_hash) — 지갑의 '사용하기' 버튼이 열린다.
const PROFILE = { id: UID, name: 'R503', nickname: 'R503', role: 'user', approved: true, status: 'active', activity_points: 0,
  agreed_to_terms: true, consented_legal_version: 2, ci_hash: 'e2e-ci', verified_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' };
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const voucherRow = (i: number) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE, venue: { name: 'R503 홀덤펍' }, used_venue: null, issued_by: VENUE, holder_user_id: UID, holder_name: 'R503',
  title: '웰컴 이용권', status: 'active', used_venue_id: null, used_at: null,
  created_at: new Date(Date.now() - i * 60_000).toISOString(), expires_at: null, issue_reason: 'welcome',
});

/** 홈까지 띄우고 이용권 시트를 연다. 재조회 카운터와 redeem 전송 카운터를 돌려준다. */
async function openSheet(page: Page) {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(([ks, v]) => {
    for (const k of ks) { try { localStorage.setItem(k, v); } catch { /* 차단 */ } }
    try { localStorage.setItem('nuri:identity-gate', 'on'); } catch { /* 차단 */ }
  }, [KEYS, JSON.stringify(SESSION)] as [string[], string]);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/(?!rpc\/)/, (r: Route) => (['GET', 'HEAD'].includes(r.request().method()) ? r.fulfill(json([])) : r.abort()));
  await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(PROFILE)) : r.abort()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(SESSION.user)));
  await page.route(/\/auth\/v1\/token/, (r) => r.fulfill(json(SESSION)));
  await page.route(/\/rest\/v1\/app_settings\?.*identity_voucher_enabled/, (r) => r.fulfill(json({ value: 'on' })));
  await page.route(/\/rest\/v1\/store_vouchers/, (r) => r.fulfill(json([0, 1, 2].map(voucherRow))));
  await page.route(/\/rest\/v1\/rpc\/find_user_by_phone/, (r) => r.fulfill(json([])));
  const c = { reads: 0, sends: 0 };
  await page.route(/\/rest\/v1\/rpc\/get_my_buyin_requests_current/, (r) => { c.reads++; return r.fulfill(json([])); });
  await page.route(/\/rest\/v1\/rpc\/redeem_my_voucher_by_phone/, (r) => { c.sends++; return r.fulfill(json('R503 홀덤펍')); });

  await page.goto('/');
  await page.locator('header').getByRole('button', { name: '이용권 · 출석', exact: true }).click({ timeout: 20_000 });
  await expect.poll(() => c.reads, { message: '로그인 직후 첫 조회(App 마운트)', timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  return c;
}

test('R5-03 시트 여러 장 보내기 성공 뒤 홈 바인 요청 배너를 다시 읽는다 (390)', async ({ page }) => {
  test.setTimeout(60_000);
  const c = await openSheet(page);
  const card = page.getByTestId('voucher-manual-card');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button').first().click();
  const sheet = page.getByTestId('voucher-send-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: '다음' }).click();
  await sheet.getByLabel('업주 전화번호').fill('010-1234-5678');
  await sheet.getByRole('button', { name: '받는 곳 확인' }).click();
  const send = sheet.getByTestId('voucher-send-confirm');
  await expect(send).toBeVisible({ timeout: 8_000 });
  await sheet.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(800);   // 첫 조회·focus 갱신이 가라앉은 뒤 기준선
  const before = c.reads;
  await send.click();
  await expect.poll(() => c.sends, { message: 'redeem_my_voucher_by_phone 이 나가야 한다(측정 유효성)', timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => c.reads - before, { message: '사용 요청 성공 뒤 get_my_buyin_requests_current 재조회 횟수', timeout: 5_000 }).toBeGreaterThanOrEqual(1);
});

test('R5-03 지갑 1장 사용 성공 뒤 홈 바인 요청 배너를 다시 읽는다 (390)', async ({ page }) => {
  test.setTimeout(60_000);
  const c = await openSheet(page);
  const use = page.getByRole('button', { name: '사용하기', exact: true }).first();
  await expect(use, '지갑 사용하기 버튼(본인인증 목 필요)').toBeVisible({ timeout: 15_000 });
  await use.click();
  await page.getByRole('button', { name: /매장 운영자 전화번호로 사용/ }).click();
  await page.getByPlaceholder('010-0000-0000').fill('010-1234-5678');
  await page.getByRole('button', { name: '받는 사람 확인', exact: true }).click();
  const confirm = page.getByRole('button', { name: /에 사용 확정$/ });
  await expect(confirm).toBeVisible({ timeout: 8_000 });
  await page.waitForTimeout(800);
  const before = c.reads;
  await confirm.click();
  await expect.poll(() => c.sends, { message: 'redeem_my_voucher_by_phone 이 나가야 한다(측정 유효성)', timeout: 10_000 }).toBe(1);
  await expect.poll(() => c.reads - before, { message: '사용 요청 성공 뒤 get_my_buyin_requests_current 재조회 횟수', timeout: 5_000 }).toBeGreaterThanOrEqual(1);
});
