// 카카오 로그인(OIDC) — 오너 2026-10-07: "카카오 로그인을 했다고 본인인증을 안 해도 되는 건 아니고 기존 이메일 로그인과 똑같은 평가".
//
// 빌드가 둘이다(공개 스위치는 빌드 때 박힌다):
//   · 기본 빌드(VITE_KAKAO_LOGIN_ENABLED 없음) — CI 와 같다. '스위치 꺼짐' 케이스만 돈다.
//   · 켬 빌드 — VITE_KAKAO_LOGIN_ENABLED=true 로 빌드하고 E2E_KAKAO_LOGIN=on 으로 돌린다. '켬' 케이스가 돈다.
//     본인인증 띠 비교는 PORTONE_CONFIGURED 빌드에서만 뜬다 — 켬 빌드에 VITE_PORTONE_STORE_ID·VITE_PORTONE_CHANNEL_KEY(공개 식별자,
//     더미 값 가능)를 같이 주고 E2E_PORTONE=on 으로 돌린다. 없으면 그 케이스는 skip 한다(거짓 통과 대신 NOT_RUN).
// 운영 DB 에 쓰지 않는다 — 엣지 함수·토큰 교환·프로필은 전부 page.route 로 가로챈다(카카오 서버에도 안 간다).
import { createHash } from 'node:crypto';
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const ON = process.env.E2E_KAKAO_LOGIN === 'on';
const PORTONE = process.env.E2E_PORTONE === 'on';
const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000010a7';
const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: 4102444800 }), 'e2e'].join('.');

/** provider 만 다른 세션 — 카카오는 이메일이 없다 */
function session(provider: 'kakao' | 'google' | 'email') {
  const email = provider === 'kakao' ? null : `${provider}@example.test`;
  return {
    access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600 * 24, expires_at: 4102444800,
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider, providers: [provider] },
            user_metadata: { name: '홍길동' }, created_at: '2026-10-07T00:00:00Z' },
  };
}
/** 트리거(handle_new_user)가 만드는 첫 프로필 — provider 와 무관하게 같다(리허설 P1). email 만 다르다. */
function profile(provider: 'kakao' | 'google' | 'email', over: Record<string, unknown> = {}) {
  return {
    id: UID, email: provider === 'kakao' ? null : `${provider}@example.test`, name: '홍길동', nickname: '홍길동',
    role: 'user', approved: true, venue_id: null, avatar_color: '#8B5CF6', avatar_url: null, status: 'active', suspended_until: null,
    agreed_to_terms: false, agreed_to_privacy: false, agreed_to_anti_gambling: false, agreed_to_marketing: false,
    consented_legal_version: null, terms_agreed_at: null, activity_points: 0, badges: [], ci_hash: null, verified_at: null,
    created_at: '2026-10-07T00:00:00Z', ...over,
  };
}
async function stubSession(page: Page, provider: 'kakao' | 'google' | 'email', over: Record<string, unknown> = {}) {
  await page.addInitScript(([k, v]) => {
    try { localStorage.setItem('nuri:keep-signed-in', '1'); localStorage.setItem(k, v); } catch { /* 차단 환경 */ }
  }, [KEY, JSON.stringify(session(provider))] as [string, string]);
  await page.route(/\/auth\/v1\/user/, (r) => json(r, session(provider).user));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => json(r, profile(provider, over)));
  await page.route(/\/rest\/v1\/rpc\/claim_daily_login_point/, (r) => json(r, 10));
}
const consentGate = (page: Page) =>
  page.locator('[role="dialog"]').filter({ has: page.getByRole('heading', { name: '서비스 이용 동의' }) }).first();

async function openLogin(page: Page) {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '로그인' }).first().click();
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test('스위치 꺼짐(기본) — 로그인·가입 어디에도 카카오 버튼이 0개다', async ({ page }) => {
  test.skip(ON, '켬 빌드에서는 돌지 않는다');
  const dialog = await openLogin(page);
  await expect(dialog.getByRole('button', { name: /Google로/ }), '대조: 구글 버튼은 보인다(창이 제대로 열렸다)').toBeVisible();
  await expect(dialog.getByTestId('kakao-login')).toHaveCount(0);
  await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '가입하기' })).toBeVisible();
  await expect(dialog.getByTestId('kakao-login')).toHaveCount(0);
});

test('🔴 켬 — 로그인·일반 가입 양쪽에 카카오 버튼이 있고 구글 버튼과 같은 크기다', async ({ page }) => {
  test.skip(!ON, '켬 빌드(E2E_KAKAO_LOGIN=on)에서만');
  const dialog = await openLogin(page);
  const kakao = dialog.getByTestId('kakao-login');
  await expect(kakao).toBeVisible();
  await expect(kakao).toHaveText('카카오 로그인');
  const [g, k] = await Promise.all([dialog.getByRole('button', { name: /Google로/ }).boundingBox(), kakao.boundingBox()]);
  expect(k!.height).toBeCloseTo(g!.height, 0);
  expect(k!.width).toBeCloseTo(g!.width, 0);
  expect(await kakao.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(254, 229, 0)'); // #FEE500
  await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(dialog.getByTestId('kakao-login')).toBeVisible();
});

test('🔴 켬 — 버튼 → 카카오 → /auth/kakao → signInWithIdToken(kakao) → 이메일 가입과 같은 동의 게이트(닉네임 확인 포함)', async ({ page, baseURL }) => {
  test.skip(!ON, '켬 빌드(E2E_KAKAO_LOGIN=on)에서만');
  test.setTimeout(60_000);
  const fnBodies: Record<string, string>[] = [];
  let tokenBody: Record<string, unknown> | null = null;
  let kauthHits = 0;
  await page.route(/\/functions\/v1\/kakao-oidc-exchange/, async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200 });
    const b = r.request().postDataJSON() as Record<string, string>;
    fnBodies.push(b);
    if (b.action === 'start') return json(r, { url: `https://kauth.kakao.com/oauth/authorize?state=${b.state}` });
    return json(r, { id_token: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln' });
  });
  // 카카오 인가 화면 대신 바로 우리 콜백으로 돌려보낸다(동의했다고 치고)
  await page.route(/^https:\/\/kauth\.kakao\.com\//, (r) => {
    kauthHits++;
    const state = new URL(r.request().url()).searchParams.get('state');
    return r.fulfill({ status: 302, headers: { location: `${baseURL}/auth/kakao?code=E2E_KAKAO_CODE_123&state=${state}` } });
  });
  await page.route(/\/auth\/v1\/token\?grant_type=id_token/, (r) => { tokenBody = r.request().postDataJSON(); return json(r, session('kakao')); });
  await page.route(/\/auth\/v1\/user/, (r) => json(r, session('kakao').user));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => json(r, profile('kakao')));
  await page.route(/\/rest\/v1\/rpc\/claim_daily_login_point/, (r) => json(r, 10));

  const dialog = await openLogin(page);
  await dialog.getByTestId('kakao-login').click();

  const gate = consentGate(page);
  await expect(gate, '카카오로 들어왔는데 동의 게이트가 안 떴다').toBeVisible({ timeout: 20_000 });
  // 흐름 검사
  expect(kauthHits, '카카오 인가 주소로 가지 않았다').toBe(1);
  expect(fnBodies.map((b) => b.action)).toEqual(['start', 'exchange']);
  expect(fnBodies[0].nonceHash).toMatch(/^[0-9a-f]{64}$/);
  expect(fnBodies[1].code).toBe('E2E_KAKAO_CODE_123');
  expect(tokenBody, 'signInWithIdToken 이 불리지 않았다').not.toBeNull();
  expect(tokenBody!.provider).toBe('kakao');
  expect(tokenBody!.id_token).toBe('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln');
  // Supabase 는 원문 nonce 를 sha256 hex 로 바꿔 id_token 의 nonce 와 비교한다 — 카카오에 보낸 해시와 같아야 한다
  expect(createHash('sha256').update(String(tokenBody!.nonce)).digest('hex')).toBe(fnBodies[0].nonceHash);
  await expect.poll(() => new URL(page.url()).pathname, { message: '콜백 주소(code)가 주소창에 남았다' }).toBe('/');
  expect(new URL(page.url()).search).toBe('');

  // 같은 게이트 — 필수 4개 전엔 못 넘어가고, 닉네임은 카카오 이름이 그대로 '확정' 되지 않고 확인 칸에 뜬다
  const nick = gate.getByTestId('social-nickname').locator('input');
  await expect(nick).toHaveValue('홍길동');
  const go = gate.getByRole('button', { name: '동의하고 시작' });
  await expect(go).toBeDisabled();
  for (const label of [/만 19세 이상/, /서비스 이용약관/, /개인정보 수집·이용/, /불법 환전·사행성/]) {
    await gate.locator('label').filter({ hasText: label }).first().locator('input[type="checkbox"]').check();
  }
  await expect(go).toBeEnabled();
  await nick.fill('가');          // 1자 — 가입 폼과 같은 2~20자 규칙
  await expect(go, '규칙에 안 맞는 닉네임인데 시작 버튼이 열려 있다').toBeDisabled();
});

test('🔴 켬 — 카카오 취소(error=access_denied) → 취소 안내, 원문 없음, 주소 정리', async ({ page }) => {
  test.skip(!ON, '켬 빌드(E2E_KAKAO_LOGIN=on)에서만');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/auth/kakao?error=access_denied&error_description=ZZPWN%20010-0000-0000');
  await expect(page.getByText('카카오 로그인을 취소했거나 필수 항목에 동의하지 않았습니다').first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('body').innerText()).not.toContain('ZZPWN');
  // 공용 OAuth 오류 effect 는 비켜선다 — 문장이 두 개 뜨지 않는다
  await expect(page.getByText('로그인이 취소되었거나 앱이 아직 승인되지 않았습니다')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
});

// ── 같은 평가: 로그인 방법만 다른 세 세션 ─────────────────────────────────────────────
for (const provider of ['kakao', 'google'] as const) {
  test(`같은 게이트 — ${provider} 첫 로그인(동의 미이행)에 같은 동의 게이트·같은 필수 항목`, async ({ page }) => {
    test.setTimeout(45_000);
    await stubSession(page, provider);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const gate = consentGate(page);
    await expect(gate).toBeVisible({ timeout: 15_000 });
    const labels = (await gate.locator('label').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /\[필수\]/.test(s));
    expect(labels).toEqual([
      '[필수]만 19세 이상입니다.',
      '[필수]서비스 이용약관에 동의합니다.',
      '[필수]개인정보 수집·이용에 동의합니다. (개인정보보호법 §15)',
      '[필수]불법 환전·사행성 행위 금지 서약에 동의합니다. (게임산업법)',
    ]);
    await expect(gate.getByTestId('social-nickname').locator('input')).toHaveValue('홍길동');
    await expect(gate.getByRole('button', { name: '동의하고 시작' })).toBeDisabled();
  });
}

for (const provider of ['kakao', 'email'] as const) {
  test(`같은 본인인증 관문 — ${provider} 회원(동의 완료·미인증)에 본인인증 띠가 뜬다`, async ({ page }) => {
    test.skip(!PORTONE, 'PORTONE 공개 식별자로 빌드하고 E2E_PORTONE=on 일 때만 — 그 밖의 빌드는 띠가 원래 안 뜬다');
    test.setTimeout(45_000);
    const agreed = { agreed_to_terms: true, agreed_to_privacy: true, agreed_to_anti_gambling: true, consented_legal_version: 3 };
    await stubSession(page, provider, agreed);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissOverlays(page);
    const nudge = page.getByRole('button', { name: /휴대폰 본인인증이 필요합니다/ });
    await expect(nudge, `${provider} 미인증인데 본인인증 띠가 없다`).toBeVisible({ timeout: 15_000 });
    await expect(consentGate(page), '동의를 마쳤는데 동의 게이트가 떴다').toHaveCount(0);
  });

  test(`대조 — ${provider} 회원이 본인인증(ci_hash)을 마치면 띠가 없다`, async ({ page }) => {
    test.skip(!PORTONE, '위와 같은 빌드에서만 의미가 있다(띠가 원래 안 뜨는 빌드면 거짓 통과)');
    test.setTimeout(45_000);
    await stubSession(page, provider, { agreed_to_terms: true, consented_legal_version: 3, ci_hash: 'e2e-hash', verified_at: '2026-10-07T00:00:00Z' });
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissOverlays(page);
    await expect(page.getByRole('button', { name: '알림' }).or(page.locator('button[aria-label^="알림"]')).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await expect(page.getByRole('button', { name: /휴대폰 본인인증이 필요합니다/ })).toHaveCount(0);
  });
}
