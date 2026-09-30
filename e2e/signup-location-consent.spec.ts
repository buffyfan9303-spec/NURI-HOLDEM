// 가입 때 '위치정보 이용 동의(선택)'(오너 2026-09-27 요청 4) — 위치정보법 제15조①·제18조①.
//
// 화면 계약:
//   · 가입 화면에 "주변 매장을 찾으려면 위치정보가 필요합니다" 칸이 있고, 필수 동의·'전체 동의'와 **분리된** 선택 체크 + 약관 전문 보기가 있다.
//   · 동의(체크) → 가입이 만든 세션으로 set_my_location_consent(p_granted true, p_terms_version 2) 한 번. 출석 때 다시 묻지 않는다(get → granted v2).
//   · 거절(체크 안 함) → 가입은 **성공**하고 위치 동의 RPC 는 0번(기록하지 않는다 — 출석 때 시트가 묻는다).
//   · '전체 동의'를 눌러도 위치 동의는 켜지지 않는다(별도 동의).
// 운영 DB 에 쓰지 않는다 — GoTrue 가입·프로필·RPC 를 route 로 위조한다(_fixtures 가 미목킹 쓰기를 끊는다).
// 음성 대조: 23ec3007 빌드는 가입 화면에 위치 칸이 없어 S1·S2 가 첫 단언에서 빨갛다.
// 실행: E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/signup-location-consent.spec.ts --project=mobile-chromium
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '00000000-0000-4000-8000-0000000051a1';
const EMAIL = 'signup-loc@example.test';
const exp = Math.floor(Date.now() / 1000) + 3600;
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, aud: 'authenticated', role: 'authenticated', email: EMAIL, exp })}.e2e`;
const USER = { id: UID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: {}, user_metadata: { name: '위치가입' },
  identities: [{ id: UID, provider: 'email' }], created_at: new Date().toISOString() };
const SESSION = { access_token: TOKEN, refresh_token: 'e2e-signup', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: USER };
const PROFILE = { id: UID, email: EMAIL, name: '위치가입', nickname: '위치가입', role: 'user', approved: true, status: 'active',
  agreed_to_terms: true, agreed_to_marketing: false, consented_legal_version: 2, activity_points: 0, badges: [], avatar_color: '#6B7280', avatar_url: null };

type Calls = { signup: Record<string, unknown>[]; setConsent: Record<string, unknown>[] };
async function setup(page: Page, w: number, scheme: 'dark' | 'light'): Promise<Calls> {
  const calls: Calls = { signup: [], setConsent: [] };
  await page.setViewportSize({ width: w, height: 800 });
  await page.addInitScript((s) => { try { localStorage.setItem('nuri-theme', s); } catch { /* 차단 */ } }, scheme);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/rpc\/is_nickname_available/, (r) => r.fulfill(json(true)));
  await page.route(/\/auth\/v1\/signup/, (r) => { calls.signup.push(JSON.parse(r.request().postData() ?? '{}')); return r.fulfill(json(SESSION)); });
  await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(USER)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(PROFILE)) : r.abort()));
  await page.route(/\/rest\/v1\/rpc\/claim_daily_login_point/, (r) => r.fulfill(json(0)));
  await page.route(/\/rest\/v1\/rpc\/set_my_location_consent/, (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}');
    calls.setConsent.push(body);
    return r.fulfill(json({ state: body.p_granted ? 'granted' : 'denied', terms_version: body.p_terms_version, granted_at: '2026-09-27T01:00:00Z', revoked_at: null }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '로그인' }).first().click();
  const dlg = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '회원가입' }) }).last();
  await dlg.getByRole('button', { name: '회원가입' }).click();
  return calls;
}

async function fill(page: Page) {
  await page.getByPlaceholder('2~20자 (커뮤니티·순위·이용권에 표시)').fill('위치가입');
  await page.getByTestId('signup-email').fill(EMAIL);
  const pw = page.locator('input[autocomplete="new-password"]');
  await pw.nth(0).fill('Nuri!2345pw');
  await pw.nth(1).fill('Nuri!2345pw');
  // 필수 넷만 — '전체 동의'는 쓰지 않는다(선택 항목까지 켜진다)
  for (const label of ['만 19세 이상', '서비스 이용약관에 동의', '개인정보 수집·이용에 동의', '사행성 행위 금지 서약']) {
    await page.locator('label', { hasText: label }).first().click();
  }
}

test.describe('SIGNUP-LOCATION — 가입 때 위치정보 이용 동의(선택)', () => {
  test('S1 동의 — 위치 칸·전문 보기가 보이고, 가입 뒤 제2판 동의를 한 번 적는다', async ({ page }) => {
    test.setTimeout(90_000);
    const calls = await setup(page, 390, 'dark');
    const box = page.getByTestId('signup-location-consent');
    await expect(box, '가입 화면에 위치정보 안내·동의 칸이 없다').toBeVisible({ timeout: 15_000 });
    await expect(box).toContainText('주변 매장을 찾으려면 위치정보가 필요합니다');
    await expect(box).toContainText('[선택]');
    await expect(box).toContainText('저장·전송하지 않습니다'); // 라이브 '가까운 순' 안내와 같은 말
    await box.scrollIntoViewIfNeeded();
    if (process.env.SLC_SHOT) await page.screenshot({ path: `${process.env.SLC_SHOT}/signup-390-dark.png` });
    // 약관 전문 보기 → 위치기반서비스 약관이 열린다
    await page.getByTestId('signup-location-terms').click();
    await expect(page.getByText('제3조(서비스 내용)')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByText('제3조(서비스 내용)')).toHaveCount(0);
    // '전체 동의'는 위치 동의를 켜지 않는다(별도 동의)
    await page.getByText('전체 동의 (필수 + 선택 포함)').click();
    await expect(page.getByTestId('signup-location-check')).not.toBeChecked();
    await page.getByText('전체 동의 (필수 + 선택 포함)').click(); // 되돌린다
    await fill(page);
    await page.getByTestId('signup-location-check').check();
    await page.getByRole('button', { name: '가입하기' }).click();
    await expect(page.getByText('가입 완료!', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => calls.setConsent.length, { timeout: 10_000 }).toBe(1);
    expect(calls.setConsent[0]).toEqual({ p_granted: true, p_terms_version: 2 });
    expect(calls.signup.length).toBe(1);
    await page.waitForTimeout(1500);
    expect(calls.setConsent.length, '위치 동의를 두 번 적었다').toBe(1);
  });

  test('S2 거절(체크 안 함) — 가입은 성공하고 위치 동의 RPC 는 0번', async ({ page }) => {
    test.setTimeout(90_000);
    const calls = await setup(page, 360, 'light');
    await expect(page.getByTestId('signup-location-consent'), '가입 화면에 위치정보 안내·동의 칸이 없다').toBeVisible({ timeout: 15_000 });
    await page.getByTestId('signup-location-consent').scrollIntoViewIfNeeded();
    if (process.env.SLC_SHOT) await page.screenshot({ path: `${process.env.SLC_SHOT}/signup-360-light.png` });
    await fill(page);
    await expect(page.getByTestId('signup-location-check')).not.toBeChecked();
    await page.getByRole('button', { name: '가입하기' }).click();
    await expect(page.getByText('가입 완료!', { exact: false }), '위치 동의를 거절했더니 가입이 안 됐다').toBeVisible({ timeout: 15_000 });
    expect(calls.signup.length).toBe(1);
    await page.waitForTimeout(2000);
    expect(calls.setConsent, '거절했는데 위치 동의를 적었다').toEqual([]);
  });
});
