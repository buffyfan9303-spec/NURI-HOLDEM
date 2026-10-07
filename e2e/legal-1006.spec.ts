// 2026-10-06 법령 점검(security-1006/legal.md) 화면 계약 — 운영 DB 에는 쓰지 않는다(세션 위조 + REST/RPC 전부 route).
//   P2-1·P1-3 내 정보 → 보안 '마케팅 정보 수신' 토글: 서버 RPC 를 부르고 전송자·처리일·결과를 화면에 남긴다.
//   P2-8 ② 정지 계정으로 로그인 → 다른 기능은 막힌 채(user=null) '이용 제한 안내' 시트에서 탈퇴할 수 있다.
//   P2-2 정적 처리방침에 국외 이전받는 자 연락처 · P1-1 마케팅 동의서의 철회 경로.
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const ID = '00000000-0000-4000-8000-00000000cc01';
const S = {
  access_token: [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: ID, aud: 'authenticated', role: 'authenticated', exp: exp() }), 'e2e'].join('.'),
  refresh_token: 'e2e-ccc', token_type: 'bearer', expires_in: 3600, expires_at: exp(),
  user: { id: ID, aud: 'authenticated', role: 'authenticated', email: 'ccc@example.com', app_metadata: { provider: 'email' }, user_metadata: { name: 'CCC' }, created_at: new Date().toISOString() },
};
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function boot(page: Page, profile: Record<string, unknown>, rpcBodies: Record<string, unknown[]>) {
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } }, [KEY, JSON.stringify(S)] as [string, string]);
  await stabilizeBackstack(page);
  const state = { ...profile };
  await page.route(/\/rest\/v1\/(?!rpc\/)/, (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.fulfill(json([])) : r.abort()));
  await page.route(/\/rest\/v1\/rpc\//, async (r) => {
    const name = new URL(r.request().url()).pathname.split('/').pop()!;
    (rpcBodies[name] ??= []).push(r.request().postDataJSON());
    if (name === 'set_my_marketing_consent') { state.agreed_to_marketing = r.request().postDataJSON().p_on; return r.fulfill(json('2026-10-06T01:00:00+00:00')); }
    return r.fulfill(json(null));
  });
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json({ id: ID, name: 'CCC', nickname: 'CCC', role: 'user', approved: true, activity_points: 0, created_at: S.user.created_at, ...state })) : r.abort()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(S.user)));
  await page.route(/\/auth\/v1\/logout/, (r) => r.fulfill({ status: 204, body: '' }));
  await page.goto('/');
}

test.describe('법령 점검 2026-10-06', () => {
  test('보안 탭 마케팅 정보 수신 토글 — RPC 를 부르고 처리 결과(전송자·날짜·결과)를 화면에 남긴다', async ({ page }) => {
    const rpc: Record<string, unknown[]> = {};
    await boot(page, { status: 'active', agreed_to_terms: true, agreed_to_marketing: false }, rpc);
    await page.getByRole('button', { name: 'CCC 메뉴' }).click();
    await page.getByRole('button', { name: '내 정보 열기' }).click();
    await page.locator('[data-profile-tabbar]').getByRole('tab', { name: '보안', exact: true }).evaluate((b) => (b as HTMLElement).click());
    const sw = page.getByRole('switch', { name: '마케팅 정보 수신 동의' });
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(rpc.set_my_marketing_consent, '설정 토글이 서버 RPC 를 안 불렀다').toEqual([{ p_on: true }]);
    expect(rpc.record_my_legal_consent ?? [], '필수 동의·판 번호를 올리는 RPC 를 토글에 쓰면 안 된다').toEqual([]);
    const result = page.getByTestId('marketing-consent-result');
    await expect(result).toContainText('마케팅 정보 수신 동의가 처리되었습니다');
    await expect(result).toContainText('전송자 엔에이치홀딩스(NURI HOLDEM)');
    await expect(result).toContainText(/처리일 \d{4}-\d{2}-\d{2}/);
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(result).toContainText('수신 동의 철회가 처리되었습니다');
  });

  test('정지 계정 — 다른 기능은 막히고(비로그인 상태) 이용 제한 안내 시트에서 탈퇴·로그아웃할 수 있다', async ({ page }) => {
    const rpc: Record<string, unknown[]> = {};
    await boot(page, { status: 'suspended', suspended_until: new Date(Date.now() + 7 * 86_400_000).toISOString(), sanction_reason: '반복 도배', agreed_to_terms: true }, rpc);
    const sheet = page.getByTestId('sanctioned-sheet');
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(sheet).toContainText('이용이 일시 정지된 계정입니다');
    // critical-211 P2-2: 이메일이 없는 회원(카카오)도 사유를 받는다 — 메일이 아니라 앱 안 안내로
    await expect(sheet).toContainText('사유: 반복 도배.');
    await expect(page.getByRole('button', { name: 'CCC 메뉴' }), '제재 계정이 로그인 상태로 보이면 안 된다').toHaveCount(0);
    await expect(page.getByRole('button', { name: /회원 탈퇴하기/ })).toBeVisible();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(sheet).toHaveCount(0);
  });

  test('정적 처리방침·마케팅 동의서 — 국외 이전받는 자 연락처 · 설정에서 철회 · 동의 없이 처리하는 항목의 근거', async ({ page }) => {
    await page.goto('/legal/privacy.html');
    const doc = page.locator('.doc');
    await expect(doc).toContainText('연락처(개인정보 문의)');
    for (const c of ['privacy@vercel.com', 'privacyquestions@cloudflare.com', 'privacy@github.com', 'compliance@sentry.io', 'support@resend.com']) await expect(doc).toContainText(c);
    await expect(doc).toContainText('동의 없이 처리하는 개인정보와 그 근거');
    await expect(doc).toContainText('이용 제한(정지·영구정지) 중인 계정도 탈퇴할 수 있습니다');
    await page.goto('/legal/marketing.html');
    await expect(page.locator('.doc')).toContainText('내 정보 → 보안 → 마케팅 정보 수신');
  });
});
