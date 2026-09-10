// 본인인증 모바일 리다이렉트 복귀(AUTH-09)
//
// 채널이 모바일에서 전면 리다이렉트로 동작하면 requestIdentityVerification 의 프로미스는 페이지 이탈로 사라지고,
// redirectUrl 로 ?identityVerificationId=… 가 붙어 돌아온다. 예전엔 그 값을 읽는 코드가 없어 인증 결과가 유실됐다.
//
// 잠그는 것 둘:
//  ① 성공 복귀 — identityVerificationId 를 기존 서버 검증(verify-identity)에 **정확히 한 번** 넘기고 주소에서 지운다.
//     새로고침해도 다시 검증하지 않는다(서버는 인증 ID 일회성이라 두 번째는 실패 토스트가 된다).
//  ② 실패 복귀(code=…) — 서버를 부르지 않고, Supabase PKCE 의 ?code= 로 오인해 '로그인 실패' 토스트를 띄우지 않는다.
// 운영 DB 에는 쓰지 않는다 — verify-identity 는 page.route 가 대신 답한다(가드보다 페이지 라우트가 먼저 잡는다).
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000a9';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'idv@example.com',
          app_metadata: {}, user_metadata: { name: 'E2E' }, created_at: new Date().toISOString() },
};

/** 가짜 로그인 + 미인증 프로필 + verify-identity 목킹. 반환: 서버가 받은 identityVerificationId 목록 */
async function boot(page: Page): Promise<string[]> {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/auth\/v1\/token/, (r) => r.fulfill(json(FAKE))); // 검증 뒤 refreshSession → 프로필 재조회
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: 'E2E', nickname: 'E2E', role: 'user', status: 'active',
    activity_points: 0, created_at: FAKE.user.created_at,
  })));
  const calls: string[] = [];
  await page.route(/\/functions\/v1\/verify-identity/, async (r) => {
    try { calls.push(JSON.parse(r.request().postData() || '{}').identityVerificationId); } catch { calls.push('?'); }
    await r.fulfill(json({ ok: true, name: null }));
  });
  return calls;
}

test('🔴 성공 복귀 — identityVerificationId 를 서버 검증에 한 번만 넘기고 주소에서 지운다', async ({ page }) => {
  test.setTimeout(60_000);
  const calls = await boot(page);
  await page.goto('/?identityVerificationId=identity-verification-e2e&transactionType=IDENTITY_VERIFICATION');
  await page.waitForLoadState('networkidle');
  await expect.poll(() => calls, { message: '복귀 URL 의 인증 ID 가 서버 검증으로 넘어가지 않았다' }).toEqual(['identity-verification-e2e']);
  expect(new URL(page.url()).searchParams.has('identityVerificationId'), '복귀 파라미터가 주소에 남아 있다').toBe(false);

  // 새로고침 — 파라미터가 지워졌으니 다시 검증하지 않는다(1회 소비)
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  expect(calls, '새로고침에 같은 인증 ID 를 두 번 검증했다').toHaveLength(1);
});

test('🔴 실패 복귀(code=…) — 서버를 부르지 않고, PKCE ?code= 로 오인한 로그인 실패 토스트도 없다', async ({ page }) => {
  test.setTimeout(60_000);
  const calls = await boot(page);
  await page.goto('/?identityVerificationId=identity-verification-e2e&code=FAILURE_TYPE_PG&message=%EC%9D%B8%EC%A6%9D%EC%9D%B4%20%EC%B7%A8%EC%86%8C%EB%90%98%EC%97%88%EC%8A%B5%EB%8B%88%EB%8B%A4');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  expect(calls, '실패 복귀인데 서버 검증을 불렀다').toEqual([]);
  const url = new URL(page.url());
  expect(url.searchParams.has('code') || url.searchParams.has('identityVerificationId'), '실패 복귀 파라미터가 주소에 남아 있다').toBe(false);
  // App.tsx 의 OAuth 콜백 처리가 ?code= 를 보고 띄우는 문장들 — 하나도 없어야 한다
  await expect(page.getByText(/로그인에 실패했습니다|로그인을 시작한 브라우저와 달라/)).toHaveCount(0);
});
