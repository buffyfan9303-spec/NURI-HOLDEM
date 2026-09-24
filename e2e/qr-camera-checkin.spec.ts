// 앱 안 QR 스캐너의 jsQR 폴백 — **실제 카메라 프레임**에서 QR 을 읽어 결과 처리까지 가는가.
//
// 왜(2026-09-24): html5-qrcode(93KB gz)를 걷어내고 src/lib/qrCamera.ts(BarcodeDetector → 없으면 jsQR)로 바꿨다.
//   BarcodeDetector 가 없는 사파리(= iOS 의 모든 브라우저)에서는 jsQR 가 **출석의 주 경로**다.
//   그래서 BarcodeDetector 를 지워 폴백을 강제하고, Chromium 가짜 카메라(y4m, QR 이 찍힌 프레임)로 돌린다.
// 운영 DB 에 쓰지 않는다 — check_in·redeem RPC 는 route 로 가로채 **호출 인자만** 단언한다.
// 음성 대조(2026-09-24): decodeQrPixels 가 null 만 돌려주게 바꾸면 이 테스트가 빨개진다.
// 실행: E2E_BASE_URL=http://localhost:4304 npx playwright test e2e/qr-camera-checkin.spec.ts
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';
import { VENUE, fakeCamera, cameraArgs, forceJsQr, liveTracks, openedTracks, json } from './_fakeCamera';

test.use(cameraArgs(fakeCamera(`https://nuriholdem.com/?checkin=${VENUE}`)));

test('🔴 Q1 — 카메라 프레임의 출석 QR → check_in(p_venue_id) 1회 → 카메라 꺼짐', async ({ page }) => {
  test.setTimeout(60_000);
  const calls: Record<string, unknown>[] = [];
  await stabilizeBackstack(page);
  await stubLogin(page);
  await forceJsQr(page);
  await page.route(/\/rest\/v1\/app_settings\?.*checkin_geo_enabled/, (r) => r.fulfill(json({ value: 'off' })));
  await page.route(/\/rest\/v1\/rpc\/check_in/, (r) => {
    calls.push(JSON.parse(r.request().postData() ?? '{}'));
    return r.fulfill(json({ name: '검증 홀덤', points: 3, streak: 1 }));
  });
  const jsqr: string[] = [];
  page.on('request', (r) => { if (/jsqr|jsQR/.test(r.url())) jsqr.push(r.url()); });

  await page.goto('/');
  await page.locator('header').getByRole('button', { name: '이용권 · 출석', exact: true }).click();
  await page.getByRole('button', { name: 'QR 스캔하기' }).click();
  // 모달 등장 단언은 두지 않는다 — 가짜 카메라는 첫 프레임부터 QR 이라 스캔→출석→닫힘이 단언보다 빠르다(실측).

  await expect.poll(() => calls.length, { timeout: 20_000, message: '카메라 QR 을 못 읽었다(check_in 0회)' }).toBe(1);
  expect(calls[0]).toEqual({ p_venue_id: VENUE });
  expect(jsqr.length, 'jsQR 청크가 안 불렸다 — 폴백이 아니라 다른 경로로 읽었다').toBeGreaterThan(0);
  await expect(page.getByText('검증 홀덤 출석 완료', { exact: false })).toBeVisible();
  await page.waitForTimeout(800);
  expect(calls.length, '한 번 스캔에 check_in 이 두 번 이상 나갔다').toBe(1);
  expect(await openedTracks(page)).toBeGreaterThan(0);
  expect(await liveTracks(page), '스캔이 끝났는데 카메라가 켜져 있다').toBe(0);
});
