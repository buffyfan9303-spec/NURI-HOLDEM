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
import { pinBeforeGeoRequired } from './_geoClock';
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

// critical L3(20261004d) — 이용권 시트 카메라로 위치 확인 출석 매장 QR 을 찍었는데 서버가 동의 없음으로 거부 →
//   토스트가 아니라 App 의 재시도 시트(대체 경로 안내)가 **맨 위에** 뜬다(이용권 시트는 닫힌다).
test('🔴 Q2 — 위치 확인 출석 매장 거부(geo_consent_required) → 이용권 시트가 닫히고 재시도 시트가 맨 위에(대체 경로)', async ({ page }) => {
  test.setTimeout(60_000);
  await pinBeforeGeoRequired(page); // 아래 '시행일 전 힌트라 다시 묻지 않고' 가정 — 시행일 뒤에는 동의 시트가 먼저 뜬다
  const calls: Record<string, unknown>[] = [];
  await stabilizeBackstack(page);
  await stubLogin(page);
  await forceJsQr(page);
  await page.route(/\/rest\/v1\/app_settings\?.*checkin_geo_enabled/, (r) => r.fulfill(json({ value: 'on' })));
  await page.route(/\/rest\/v1\/venues\?.*select=checkin_geo_required/, (r) => r.fulfill(json({ checkin_geo_required: true })));
  // 이미 '동의 안 함'(현재 판)을 고른 손님 — 시행일 전 힌트라 다시 묻지 않고 좌표 없이 보낸다 → 서버(시행일 뒤)가 거부
  await page.route(/\/rest\/v1\/rpc\/get_my_location_consent/, (r) => r.fulfill(json({ state: 'denied', terms_version: 3 })));
  await page.route(/\/rest\/v1\/rpc\/check_in/, (r) => {
    calls.push(JSON.parse(r.request().postData() ?? '{}'));
    return r.fulfill(json({ code: 'geo_consent_required', error: '위치 확인 출석 매장이라 위치정보 이용에 동의해야 이 매장에서 출석할 수 있습니다. 동의하지 않아도 매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다' }));
  });
  await page.goto('/');
  await page.locator('header').getByRole('button', { name: '이용권 · 출석', exact: true }).click();
  await page.getByRole('button', { name: 'QR 스캔하기' }).click();
  await expect.poll(() => calls.length, { timeout: 20_000, message: '카메라 QR 을 못 읽었다(check_in 0회)' }).toBe(1);
  expect(calls[0]).toEqual({ p_venue_id: VENUE });
  const retry = page.getByTestId('checkin-geo-retry');
  await expect(retry, '거부됐는데 재시도 시트가 안 떴다(토스트만?)').toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('checkin-geo-retry-alt')).toHaveText('동의하기 어렵거나 위치를 켤 수 없어도 매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다');
  await page.waitForTimeout(600); // 이용권 시트 퇴장 모션
  const top = await page.getByTestId('checkin-geo-retry-btn').evaluate((b) => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === b || b.contains(hit));
  });
  expect(top, '재시도 시트 버튼이 다른 시트에 가려졌다').toBe(true);
});
