// 앱 안 QR 스캐너의 jsQR 폴백 — **실제 카메라 프레임**에서 QR 을 읽어 결과 처리까지 가는가.
//
// 왜(2026-09-24): html5-qrcode(93KB gz)를 걷어내고 src/lib/qrCamera.ts(BarcodeDetector → 없으면 jsQR)로 바꿨다.
//   BarcodeDetector 가 없는 사파리(= iOS 의 모든 브라우저)에서는 jsQR 가 **출석·이용권 사용의 주 경로**다.
//   그래서 BarcodeDetector 를 지워 폴백을 강제하고, Chromium 가짜 카메라(y4m, QR 이 찍힌 프레임)로 돌린다.
// 운영 DB 에 쓰지 않는다 — check_in·redeem RPC 는 route 로 가로채 **호출 인자만** 단언한다.
// 음성 대조(2026-09-24): decodeQrPixels 가 null 만 돌려주게 바꾸면 이 테스트가 빨개진다.
// 실행: E2E_BASE_URL=http://localhost:4304 npx playwright test e2e/qr-camera-voucher.spec.ts
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';
import { VENUE, fakeCamera, cameraArgs, forceJsQr, liveTracks, openedTracks, json } from './_fakeCamera';

test.use(cameraArgs(fakeCamera(`NURIV-VENUE:${VENUE}`)));

test('🔴 V1 — 카메라 프레임의 매장 이용권 QR → 확인 → redeem_my_voucher_by_qr(인자) → 카메라 꺼짐', async ({ page }) => {
  test.setTimeout(60_000);
  const calls: Record<string, unknown>[] = [];
  await stabilizeBackstack(page);
  const uid = await stubLogin(page, { verified_at: '2026-01-01T00:00:00Z', ci_hash: 'e2e' });
  await forceJsQr(page);
  await page.route(/\/rest\/v1\/app_settings\?.*identity_voucher_enabled/, (r) => r.fulfill(json({ value: 'on' })));
  await page.route(/\/rest\/v1\/store_vouchers\?/, (r) => r.fulfill(json([{
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', venue_id: VENUE, venue: { name: '검증 홀덤' }, issued_by: uid,
    holder_user_id: uid, holder_name: '검증계정', title: '검증 이용권', status: 'active',
    used_venue_id: null, used_venue: null, used_at: null, created_at: '2026-09-01T00:00:00Z', expires_at: null, issue_reason: 'grant',
  }])));
  await page.route(/\/rest\/v1\/rpc\/redeem_my_voucher_by_qr/, (r) => {
    calls.push(JSON.parse(r.request().postData() ?? '{}'));
    return r.fulfill(json('검증 홀덤'));
  });

  const jsqr: string[] = [];
  page.on('request', (r) => { if (/jsqr|jsQR/.test(r.url())) jsqr.push(r.url()); });

  await page.goto('/');
  await page.locator('header').getByRole('button', { name: '이용권 · 출석', exact: true }).click();
  await page.getByRole('button', { name: '사용하기' }).first().click();
  await page.getByRole('button', { name: /매장 QR 스캔해서 사용/ }).click();

  // 스캔만으로는 실행하지 않는다(Q1) — 확인 단계가 떠야 하고, 그때까지 RPC 0회
  const confirm = page.getByRole('button', { name: '이용권 1장 사용', exact: true });
  await expect.poll(async () => (await openedTracks(page)) > 0 && (await liveTracks(page)) === 0,
    { timeout: 20_000, message: '카메라 QR 을 못 읽었다(스캐너가 안 닫힘)' }).toBe(true);
  await expect(confirm, '이용권 QR 인데 확인 단계가 안 떴다').toBeVisible();
  expect(calls, '확인 전에 사용 RPC 가 나갔다').toEqual([]);
  expect(jsqr.length, 'jsQR 청크가 안 불렸다 — 폴백이 아니라 다른 경로로 읽었다').toBeGreaterThan(0);
  await confirm.click();
  await expect.poll(() => calls.length, { timeout: 10_000 }).toBe(1);
  expect(calls[0]).toMatchObject({ p_voucher_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', p_venue_id: VENUE });
});
