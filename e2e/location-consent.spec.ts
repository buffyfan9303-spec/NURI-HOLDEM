// LOCATION-READY(2026-09-26) — 출석 위치 확인의 '위치정보 이용 동의'(선택): 거절 · 수락 · 닫기 · 철회 · 열람.
//
// 위치정보법 제15조①(동의 없이 수집·이용 금지) · 제24조(철회·일시중지·열람) — 화면 쪽 계약:
//   · 동의 기록이 없으면 출석 전에 시트로 묻는다. 거절·닫기면 좌표 없이 출석이 **된다**(매장 id 만 전송).
//   · 수락하면 동의(약관 제2판)를 저장하고 좌표를 실어 check_in.
//   · 내 정보 › 보안에서 동의 상태를 보고, 철회하고, 이용 내역을 연다.
// 운영 DB 에 쓰지 않는다 — app_settings·RPC 를 route 로 가로챈다(_fixtures 가드가 한 겹 더 막는다).
// 음성 대조: checkins.ts 의 `&& await ensureLocationConsent()` 를 지우면 L1·L3 이 빨개진다(좌표가 나간다·시트가 안 뜬다).
// 실행: E2E_BASE_URL=http://localhost:4660 npx playwright test e2e/location-consent.spec.ts --project=mobile-chromium
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

const VENUE = '11111111-2222-3333-4444-555555555555';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const SHOT = process.env.LOC_SHOT_DIR;

interface Calls { checkIn: Record<string, unknown>[]; setConsent: Record<string, unknown>[]; logReads: number }

async function setup(page: Page, consent: Record<string, unknown>, loggedIn = true): Promise<Calls> {
  const calls: Calls = { checkIn: [], setConsent: [], logReads: 0 };
  let cur = consent;
  await stabilizeBackstack(page);
  if (loggedIn) await stubLogin(page);
  await page.route(/\/rest\/v1\/app_settings\?.*checkin_geo_enabled/, (r) => r.fulfill(json({ value: 'on' })));
  await page.route(/\/rest\/v1\/rpc\/get_my_location_consent/, (r) => r.fulfill(json(cur)));
  await page.route(/\/rest\/v1\/rpc\/set_my_location_consent/, (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}');
    calls.setConsent.push(body);
    cur = body.p_granted
      ? { state: 'granted', terms_version: body.p_terms_version, granted_at: '2026-09-26T01:00:00Z', revoked_at: null }
      : { state: 'denied', terms_version: body.p_terms_version, granted_at: '2026-09-26T01:00:00Z', revoked_at: '2026-09-26T02:00:00Z' };
    return r.fulfill(json(cur));
  });
  await page.route(/\/rest\/v1\/rpc\/get_my_location_access_log/, (r) => {
    calls.logReads++;
    return r.fulfill(json([
      { used_at: '2026-09-26T02:00:00Z', purpose: 'self_view', acquired_via: 'none', recipient: null },
      { used_at: '2026-09-26T01:05:00Z', purpose: 'checkin_radius', acquired_via: 'device_gps', recipient: null },
    ]));
  });
  await page.route(/\/rest\/v1\/rpc\/check_in/, (r) => {
    calls.checkIn.push(JSON.parse(r.request().postData() ?? '{}'));
    return r.fulfill(json({ name: '검증 홀덤', points: 3, streak: 1 }));
  });
  return calls;
}


async function openSheet(page: Page) {
  await page.goto(`/?checkin=${VENUE}`);
  const sheet = page.getByTestId('location-consent-sheet');
  // (2026-09-26 AuthContext 부팅 틈 수정 뒤 — 로그인된 세션에 로그인 창이 먼저 뜨던 하네스 우회를 뺐다. auth-boot-gap G1)
  await expect(sheet, '동의 기록이 없는데 동의 시트가 안 떴다').toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: '로그인' }), '로그인된 세션인데 로그인 창이 떴다').toHaveCount(0);
  return sheet;
}

test('🔴 L1 거절 — 동의 안 함을 저장하고, 좌표 없이 출석이 된다', async ({ page }) => {
  test.setTimeout(60_000);
  const calls = await setup(page, { state: 'unset' });
  const sheet = await openSheet(page);
  expect(calls.checkIn, '동의를 묻기 전에 check_in 이 나갔다').toEqual([]);
  await expect(sheet).toContainText('동의하지 않아도 출석할 수 있어요');
  if (SHOT) await page.screenshot({ path: `${SHOT}/after-consent-sheet.png` });
  await page.getByTestId('location-consent-decline').click();
  await expect.poll(() => calls.checkIn.length, { timeout: 10_000 }).toBe(1);
  expect(calls.setConsent).toEqual([{ p_granted: false, p_terms_version: 2 }]);
  expect(calls.checkIn[0], '거절했는데 좌표가 나갔다').toEqual({ p_venue_id: VENUE });
  await expect(page.getByText('검증 홀덤 출석 완료!', { exact: false })).toBeVisible();
});

test('🔴 L2 수락 — 동의(제2판)를 저장하고 좌표를 실어 check_in', async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.5, longitude: 127.0, accuracy: 20 });
  const calls = await setup(page, { state: 'unset' });
  await openSheet(page);
  await page.getByTestId('location-consent-agree').click();
  await expect.poll(() => calls.checkIn.length, { timeout: 10_000 }).toBe(1);
  expect(calls.setConsent).toEqual([{ p_granted: true, p_terms_version: 2 }]);
  expect(calls.checkIn[0]).toMatchObject({ p_venue_id: VENUE, p_lat: 37.5, p_lng: 127.0, p_accuracy: 20 });
  await expect(page.getByTestId('location-consent-sheet')).toHaveCount(0);
});

test('🔴 L3 닫기 — 저장하지 않고 이번 출석만 좌표 없이', async ({ page }) => {
  test.setTimeout(60_000);
  const calls = await setup(page, { state: 'unset' });
  const sheet = await openSheet(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => calls.checkIn.length, { timeout: 10_000 }).toBe(1);
  expect(calls.setConsent, '닫기만 했는데 동의 여부를 저장했다').toEqual([]);
  expect(calls.checkIn[0]).toEqual({ p_venue_id: VENUE });
});

test('🔴 L4 이미 동의 안 함 — 다시 묻지 않고 좌표 없이 출석', async ({ page }) => {
  test.setTimeout(60_000);
  const calls = await setup(page, { state: 'denied', terms_version: 2 });
  await page.goto(`/?checkin=${VENUE}`);
  await expect.poll(() => calls.checkIn.length, { timeout: 20_000 }).toBe(1);
  expect(calls.checkIn[0]).toEqual({ p_venue_id: VENUE });
  await expect(page.getByTestId('location-consent-sheet')).toHaveCount(0);
});

test('🔴 L5 내 정보 › 보안 — 상태 · 이용 내역 열람 · 철회', async ({ page }) => {
  test.setTimeout(60_000);
  const calls = await setup(page, { state: 'granted', terms_version: 2, granted_at: '2026-09-26T01:00:00Z', revoked_at: null });
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: '로그인' }), '로그인된 세션인데 로그인 창이 떴다').toHaveCount(0);
  await page.getByRole('button', { name: '검증계정 메뉴' }).click();
  await page.getByRole('button', { name: '내 정보 열기' }).click();
  await expect(page.locator('h1', { hasText: '내 정보' })).toBeVisible();
  const tab = page.locator('[data-profile-tabbar]').getByRole('tab', { name: '보안', exact: true });
  await tab.evaluate((b) => (b as HTMLElement).click());
  const card = page.getByTestId('location-privacy-card');
  await expect(card.getByTestId('location-consent-state')).toContainText('동의함 · 제2판');
  expect(calls.logReads, '탭을 여는 것만으로 이용 내역(열람 기록)을 불렀다').toBe(0);

  await card.getByTestId('location-log-open').click();
  const list = card.getByTestId('location-log-list');
  await expect(list).toContainText('출석 위치 확인');
  await expect(list).toContainText('제3자 제공 없음');
  expect(calls.logReads).toBe(1);
  if (SHOT) { await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOT}/after-profile-security.png` }); }

  await card.getByTestId('location-consent-revoke').click();
  await expect(card.getByTestId('location-consent-state')).toContainText('동의하지 않음');
  expect(calls.setConsent).toEqual([{ p_granted: false, p_terms_version: 2 }]);
  await expect(list, '철회했는데 삭제된 이용 내역이 화면에 남았다').toHaveCount(0);
  await expect(card.getByTestId('location-consent-grant')).toBeVisible();
});

// ── 🔴 2026-09-26 design-reviewer: 동의 시트와 로그인 시트(둘 다 게이트 z-65)가 한 프레임에 같이 보이면 안 된다 ──
// 매 rAF 마다 [로그인/회원가입 dialog 보임, 동의 시트 보임] 을 기록해 **둘 다 보인 프레임 수**를 센다.
// 음성 대조(2026-09-26): 이 수정 전 빌드에서 L6 은 293/304 프레임, L7 은 로그인 퇴장 프레임이 겹쳐 빨갛다.
async function recordFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: [number, number, number][] };
    w.__frames = [];
    const vis = (el: Element | null | undefined) => {
      if (!el) return false;
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.height > 0 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
    };
    const tick = () => {
      const login = [...document.querySelectorAll('[role="dialog"]')].find((d) => /로그인|회원가입/.test(d.getAttribute('aria-label') ?? ''));
      const sheet = document.querySelector('[data-testid="location-consent-sheet"]');
      w.__frames.push([Math.round(performance.now()), vis(login) ? 1 : 0, vis(sheet) ? 1 : 0]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const frameStats = (page: Page) => page.evaluate(() => {
  const f = (window as unknown as { __frames: [number, number, number][] }).__frames;
  return { total: f.length, both: f.filter((x) => x[1] && x[2]).length, sheet: f.filter((x) => x[2]).length, login: f.filter((x) => x[1]).length };
});

test('🔴 L6 로그인된 딥링크 — 로그인 시트 없이 동의 시트만 뜬다(로그인·겹침 0프레임)', async ({ page }) => {
  test.setTimeout(60_000);
  await recordFrames(page);
  const calls = await setup(page, { state: 'unset' });
  await page.goto(`/?checkin=${VENUE}`);
  // 2026-09-26 AuthContext 부팅 틈 수정 뒤 — 로그인된 세션엔 로그인 시트가 **아예** 뜨지 않아야 한다(예전 하네스는 닫고 지나갔다).
  //   로그인 시트와 겹치는지 자체는 L7(실제 로그인 → 퇴장 중)이 잰다.
  const sheet = page.getByTestId('location-consent-sheet');
  await expect(sheet, '동의 시트가 안 떴다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200); // 올라오는 모션 + 늦게 붙는 로그인 창까지 프레임을 더 모은다
  const st = await frameStats(page);
  expect(st.total, '프레임을 거의 못 모았다(측정 무효)').toBeGreaterThan(60);
  expect(st.sheet, '동의 시트 프레임 0 — 대조 무효').toBeGreaterThan(0);
  expect(st.login, `로그인된 세션인데 로그인 시트 프레임 ${st.login}`).toBe(0);
  expect(st.both, `로그인과 동의 시트가 같이 보인 프레임 ${st.both}/${st.total}`).toBe(0);
  await page.getByTestId('location-consent-decline').click();
  await expect.poll(() => calls.checkIn.length, { timeout: 10_000 }).toBe(1);
  expect(calls.checkIn[0]).toEqual({ p_venue_id: VENUE });
});

test('🔴 L7 로그인 안 된 딥링크 — 로그인 → 로그인 시트 퇴장이 끝난 뒤에 동의 시트(겹침 0프레임)', async ({ page }) => {
  test.setTimeout(60_000);
  await recordFrames(page);
  const calls = await setup(page, { state: 'unset' }, false);
  const uid = '00000000-0000-4000-8000-0000000000f1';
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, aud: 'authenticated', role: 'authenticated', exp })}.stub`;
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'verify@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  await page.route(/\/auth\/v1\/token\?grant_type=password/, (r) => r.fulfill(json({ access_token: token, refresh_token: 'stub', token_type: 'bearer', expires_in: 3600, expires_at: exp, user })));
  await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({ id: uid, email: 'verify@example.test', name: '검증계정', nickname: '검증계정', role: 'user', approved: true, status: 'active', agreed_to_terms: true, consented_legal_version: 2, activity_points: 10, badges: [] })));
  await page.route(/\/rest\/v1\/rpc\/claim_daily_login_point/, (r) => r.fulfill(json(10)));

  await page.goto(`/?checkin=${VENUE}`);
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
  await expect(dialog, '비로그인 딥링크인데 로그인 시트가 안 떴다').toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('location-consent-sheet')).toHaveCount(0);
  await dialog.locator('input[type="email"]').fill('verify@example.test');
  await dialog.locator('input[type="password"]').first().fill('e2e-password');
  await dialog.getByRole('button', { name: /^로그인$/ }).last().click();
  await expect(page.getByTestId('location-consent-sheet'), '로그인 뒤 동의 시트가 안 떴다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const st = await frameStats(page);
  expect(st.login, '로그인 시트 프레임 0 — 대조 무효').toBeGreaterThan(0);
  expect(st.both, `로그인과 동의 시트가 같이 보인 프레임 ${st.both}/${st.total}`).toBe(0);
  await page.getByTestId('location-consent-decline').click();
  await expect.poll(() => calls.checkIn.length, { timeout: 10_000 }).toBe(1);
  expect(calls.checkIn[0]).toEqual({ p_venue_id: VENUE });
});

test('🔴 L8 동의 시트 버튼 높이 ≥ 44px(동의 · 동의하지 않고 출석 · 약관 전문)', async ({ page }) => {
  test.setTimeout(60_000);
  await setup(page, { state: 'unset' });
  await page.goto(`/?checkin=${VENUE}`);
  await expect(page.getByTestId('location-consent-sheet')).toBeVisible({ timeout: 20_000 });
  for (const id of ['location-consent-agree', 'location-consent-decline', 'location-consent-terms']) {
    const h = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().height);
    expect(h, `${id} 높이 ${h}px`).toBeGreaterThanOrEqual(44);
  }
});
