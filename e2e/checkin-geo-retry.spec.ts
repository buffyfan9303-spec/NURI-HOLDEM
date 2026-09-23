// CHECKIN-GEO 재시도 시트 — QR 출석 딥링크에서 위치를 못 얻으면 토스트가 아니라 시트가 뜨고,
// 시트의 버튼(= 사용자 제스처)으로 다시 부르면 위치를 실어 check_in 이 나간다. 서버 거부는 종전 토스트.
//
// 운영 DB 에 쓰지 않는다 — app_settings·check_in 을 route 로 가로챈다(_fixtures 가드가 한 겹 더 막는다).
// 음성 대조(2026-09-24 확인): App.tsx runCheckin 의 catch 를 옛 한 줄 토스트로 되돌리면 G1 이 빨개진다.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/checkin-geo-retry.spec.ts
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

const VENUE = '11111111-2222-3333-4444-555555555555';

async function setup(page: Page, checkInReply: { status: number; body: unknown }) {
  const calls: Record<string, unknown>[] = [];
  await stabilizeBackstack(page);
  await stubLogin(page);
  // 운영 스위치 켜짐(checkin_geo_enabled='on') — maybeSingle 이라 객체 한 개로 준다
  await page.route(/\/rest\/v1\/app_settings\?.*checkin_geo_enabled/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: 'on' }) }));
  await page.route(/\/rest\/v1\/rpc\/check_in/, (r) => {
    calls.push(JSON.parse(r.request().postData() ?? '{}'));
    return r.fulfill({ status: checkInReply.status, contentType: 'application/json', body: JSON.stringify(checkInReply.body) });
  });
  return calls;
}

test('🔴 G1 — 위치 권한 거부 → 시트, 버튼 → 좌표를 실어 check_in 1회', async ({ page }) => {
  test.setTimeout(60_000);
  const calls = await setup(page, { status: 200, body: { name: '검증 홀덤', points: 3, streak: 1 } });
  // 하네스 Chromium 은 권한을 안 주면 프롬프트가 **응답 없이 대기**한다(실측: 20s 동안 오류도 성공도 없음 — 스펙상
  //   timeout 은 권한 허용 뒤부터 센다). 그래서 거부를 직접 흉내 낸다: 첫 호출은 PERMISSION_DENIED(1), 이후는 성공.
  await page.addInitScript(() => {
    const w = window as unknown as { __geoDeny: boolean };
    w.__geoDeny = true;
    const geo = {
      getCurrentPosition(ok: PositionCallback, bad?: PositionErrorCallback | null) {
        if (w.__geoDeny) { bad?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError); return; }
        ok({ coords: { latitude: 37.5, longitude: 127.0, accuracy: 20 }, timestamp: Date.now() } as GeolocationPosition);
      },
      watchPosition() { return 0; }, clearWatch() {},
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo });
  });
  await page.goto(`/?checkin=${VENUE}`);
  const sheet = page.getByTestId('checkin-geo-retry');
  await expect(sheet, '위치 실패인데 재시도 시트가 안 떴다').toBeVisible({ timeout: 20_000 });
  expect(calls, '위치를 못 얻었는데 check_in 이 나갔다').toEqual([]);
  await expect(sheet).toContainText('위치 권한');

  // 하네스 한정(2026-09-24 실측): 스텁 세션에서는 로그인 창이 시트 **위에** 떠 있어 버튼 클릭을 가로챈다.
  //   실제 흐름에서는 로그인 성공이 그 창을 닫은 뒤 보류 의도가 재개된다 — 여기서는 손으로 닫는다.
  const login = page.getByRole('dialog', { name: '로그인' });
  if (await login.isVisible()) await login.getByRole('button', { name: '닫기' }).click();
  await expect(login).toHaveCount(0);
  await expect(sheet, '로그인 창을 닫자 위치 시트도 사라졌다').toBeVisible();
  await page.evaluate(() => { (window as unknown as { __geoDeny: boolean }).__geoDeny = false; }); // 사용자가 권한을 켰다
  await page.getByTestId('checkin-geo-retry-btn').click();
  await expect.poll(() => calls.length, { timeout: 10_000 }).toBe(1);
  expect(calls[0]).toMatchObject({ p_venue_id: VENUE, p_lat: 37.5, p_lng: 127.0, p_accuracy: 20 });
  await expect(page.getByText('검증 홀덤 출석 완료!', { exact: false })).toBeVisible();
  await expect(sheet).toHaveCount(0);
});

test('🔴 G2 — 위치는 얻었는데 서버가 거부 → 시트 없이 서버 문구 토스트(종전 그대로)', async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.5, longitude: 127.0, accuracy: 20 });
  const calls = await setup(page, { status: 400, body: { code: 'P0001', message: '매장에서 너무 멀어요' } });
  await page.goto(`/?checkin=${VENUE}`);
  await expect.poll(() => calls.length, { timeout: 20_000 }).toBe(1);
  await expect(page.getByText('매장에서 너무 멀어요')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('checkin-geo-retry'), '서버 거부인데 위치 시트가 떴다').toHaveCount(0);
});
