// PROFILE-MENU-JANK(오너 신고 2026-09-24) — "프로필 누르면 내 정보에 보안 쪽까지 메뉴 다 왔다갔다 해보면 살짝 끊긴다".
//
// 원인(root-cause-debugger 실측): 겉 래퍼만 hidden 이고 안쪽 판(대시보드·프로필·설정·보안)은 탭마다 조건부 재마운트였다.
//   · 대시보드(1913px) 복귀마다 재마운트 → 누른 뒤 커밋까지 멈춤 + 빈 상태 카드 animate-fade-in 재재생
//   · 보안 탭은 들어갈 때마다 약관 동의 이력(legal_consents)을 다시 불러 '불러오는 중…'→목록으로 높이가 튀었다(895→1180px)
// 고친 뒤 계약: 한 번 연 판은 hidden 으로 남는다(열려 있는 동안). 닫으면 비운다. 계정이 바뀌면 판째 새로 만든다.
//
// 🔴 개발 서버(StrictMode)는 마운트 이펙트를 두 번 돌려 요청이 2배로 찍힌다 — 그래서 '정확히 1회' 가 아니라
//   **첫 보안 진입 뒤로는 늘지 않는다** 로 단언한다(프로덕션 빌드·개발 서버 양쪽에서 같은 뜻).
// 운영 DB 에는 쓰지 않는다 — 세션은 route 로 위조하고 모든 REST/RPC 는 페이지 route 가 가로챈다.
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const jwtOf = (sub: string) => [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub, aud: 'authenticated', role: 'authenticated', exp: exp() }), 'e2e'].join('.');
function sessionOf(id: string, name: string) {
  return {
    access_token: jwtOf(id), refresh_token: 'e2e-' + name, token_type: 'bearer', expires_in: 3600, expires_at: exp(),
    user: { id, aud: 'authenticated', role: 'authenticated', email: `${name.toLowerCase()}@example.com`,
      app_metadata: {}, user_metadata: { name }, created_at: new Date().toISOString() },
  };
}
const A = sessionOf('00000000-0000-4000-8000-00000000aa01', 'AAA');
const B = sessionOf('00000000-0000-4000-8000-00000000bb01', 'BBB');
const profileOf = (s: typeof A) => ({ id: s.user.id, name: s.user.user_metadata.name, nickname: s.user.user_metadata.name,
  role: 'user', approved: true, status: 'active', activity_points: 0, created_at: s.user.created_at });
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const fromA = (r: Route) => (r.request().headers()['authorization'] ?? '').includes(A.access_token);
const consentOf = (tag: string) => [{ id: `c-${tag}`, legal_version: `${tag}-2026-09-01`, agreed_at: '2026-09-01T03:00:00Z', source: 'settings',
  agreed_to_terms: true, agreed_to_privacy: true, agreed_to_anti_gambling: true, agreed_to_marketing: false }];

async function boot(page: Page, calls: { A: number; B: number }) {
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } }, [KEY, JSON.stringify(A)] as [string, string]);
  await stabilizeBackstack(page);
  // 나중에 등록한 route 가 먼저 돈다 — 포괄 목킹을 먼저, 개별 목킹을 뒤에.
  await page.route(/\/rest\/v1\/(?!rpc\/)/, (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.fulfill(json([])) : r.abort()));
  await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(profileOf(fromA(r) ? A : B))) : r.abort()));
  await page.route(/\/rest\/v1\/legal_consents\?/, (r) => { const a = fromA(r); calls[a ? 'A' : 'B']++; return r.fulfill(json(consentOf(a ? 'A' : 'B'))); });
  await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(fromA(r) ? A.user : B.user)));
  await page.route(/\/auth\/v1\/token\?grant_type=password/, (r) => r.fulfill(json(B)));
  await page.route(/\/auth\/v1\/logout/, (r) => r.fulfill({ status: 204, body: '' }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'AAA 메뉴' })).toBeVisible({ timeout: 20_000 });
}

const tabBtn = (page: Page, name: string) => page.locator('[data-profile-tabbar]').getByRole('tab', { name, exact: true });
/** 탭 누르기 — locator.click 의 자동 스크롤이 판 스크롤을 건드리지 않게 DOM click 으로 누른다 */
async function goTab(page: Page, name: string) {
  await tabBtn(page, name).evaluate((b) => (b as HTMLElement).click());
  await expect(tabBtn(page, name)).toHaveAttribute('aria-selected', 'true');
}
async function openMe(page: Page, menu: string) {
  await page.getByRole('button', { name: menu }).click();
  await page.getByRole('button', { name: '내 정보 열기' }).click();
  await expect(page.locator('h1', { hasText: '내 정보' })).toBeVisible();
}
const closeMe = (page: Page) => page.locator('header:has(h1:text-is("내 정보")) button[aria-label="닫기"]').click();
const nickInput = (page: Page) => page.getByPlaceholder('닉네임 입력 (2~20자)');
const withdrawPw = (page: Page) => page.getByPlaceholder('현재 비밀번호');

test.describe('PROFILE-MENU-JANK — 내 정보 하위 탭 keep-alive', () => {
  test('🔴 4탭 두 바퀴: 약관 이력은 첫 보안 진입 뒤 다시 안 부르고, 대시보드는 재마운트·fade-in 재생이 없다 · 닫으면 비우고 · 계정 전환 뒤 이전 계정 판이 안 남는다', async ({ page }) => {
    test.setTimeout(120_000);
    const calls = { A: 0, B: 0 };
    await boot(page, calls);
    await openMe(page, 'AAA 메뉴');

    // 대시보드 빈 상태 카드(fade-in) — 없으면 아래 '재생 0' 단언이 공짜로 통과한다
    const fades = page.locator('[data-profile-panel] .animate-fade-in');
    await expect(fades.first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800); // 첫 등장 fade-in 이 끝나게
    await page.evaluate(() => { (window as unknown as { __keep: Element[] }).__keep = [...document.querySelectorAll('[data-profile-panel] .animate-fade-in')]; });

    let afterFirstSec = -1;
    for (let round = 1; round <= 2; round++) {
      await goTab(page, '프로필');
      await goTab(page, '설정');
      if (round === 1) await nickInput(page).fill('AAA수정'); // 탭 왕복에도 입력이 남아야 한다(기존 동작)
      await goTab(page, '보안');
      await expect(page.getByText('약관 버전 A-2026-09-01')).toBeVisible();
      if (round === 1) afterFirstSec = calls.A;
      // 대시보드 복귀 — 누른 직후 다음 프레임에 도는 fade-in 이 있으면 재마운트(재재생)다
      const replay = await tabBtn(page, '대시보드').evaluate(async (b) => {
        (b as HTMLElement).click();
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const keep = (window as unknown as { __keep: Element[] }).__keep;
        const running = document.getAnimations().filter((a) => {
          const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
          return !!el && !!el.closest('[data-profile-panel]') && el.classList.contains('animate-fade-in') && a.playState === 'running';
        }).length;
        return { running, detached: keep.filter((n) => !n.isConnected).length, kept: keep.length };
      });
      expect(replay.kept, '대시보드 fade-in 노드를 못 잡았다(대조 무효)').toBeGreaterThan(0);
      expect(replay.detached, `${round}바퀴: 대시보드 노드가 새로 만들어졌다(탭마다 재마운트)`).toBe(0);
      expect(replay.running, `${round}바퀴: 대시보드 복귀마다 빈 상태 fade-in 이 다시 재생된다`).toBe(0);
    }
    expect(afterFirstSec, '보안 탭이 약관 이력을 한 번도 부르지 않았다(대조 무효)').toBeGreaterThan(0);
    expect(calls.A, '보안 탭에 다시 들어갈 때마다 약관 동의 이력을 다시 불렀다(판 재마운트)').toBe(afterFirstSec);
    await goTab(page, '설정');
    await expect(nickInput(page), '설정 입력이 탭 왕복에 사라졌다').toHaveValue('AAA수정');

    // 탈퇴 확인 비밀번호를 친 채 닫았다 다시 열면 — 판은 비워져 입력이 남지 않는다(열림 = 새 판)
    await goTab(page, '보안');
    await page.getByRole('button', { name: /회원 탈퇴하기/ }).click();
    await withdrawPw(page).fill('secret-A');
    await closeMe(page);
    await openMe(page, 'AAA 메뉴');
    await goTab(page, '보안');
    await expect(page.getByText('약관 버전 A-2026-09-01')).toBeVisible();
    await expect(withdrawPw(page), '닫았다 다시 열었는데 탈퇴 확인 비밀번호 입력이 남아 있다').toHaveCount(0);
    expect(calls.A, '다시 열면 약관 이력을 새로 불러야 한다(열 때 1회)').toBeGreaterThan(afterFirstSec);

    // 계정 전환 — A 가 설정·보안에 입력을 남긴 채 로그아웃 → B 로그인
    await goTab(page, '설정');
    await nickInput(page).fill('AAA남김');
    await goTab(page, '보안');
    await page.getByRole('button', { name: /회원 탈퇴하기/ }).click();
    await withdrawPw(page).fill('secret-A2');
    await closeMe(page);
    await page.getByRole('button', { name: 'AAA 메뉴' }).click();
    await page.getByRole('button', { name: '로그아웃' }).click();
    const login = page.getByRole('button', { name: '로그인' }).first();
    await expect(login).toBeVisible({ timeout: 10_000 });
    await login.click();
    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.locator('input[type="email"]').fill(B.user.email);
    await dialog.locator('input[type="password"]').first().fill('e2e-password');
    await dialog.getByRole('button', { name: /^로그인$/ }).last().click();
    await expect(page.getByRole('button', { name: 'BBB 메뉴' })).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });

    await openMe(page, 'BBB 메뉴');
    await goTab(page, '보안');
    await expect(page.getByText('약관 버전 B-2026-09-01')).toBeVisible();
    await expect(page.getByText('약관 버전 A-2026-09-01'), 'B 의 화면에 A 의 약관 동의 이력이 남아 있다').toHaveCount(0);
    await expect(withdrawPw(page), 'B 의 보안 탭에 A 가 친 탈퇴 확인 비밀번호 칸이 남아 있다').toHaveCount(0);
    await goTab(page, '설정');
    await expect(nickInput(page), 'B 의 설정에 A 의 닉네임 입력이 남아 있다').toHaveValue('BBB');
    expect(calls.B).toBeGreaterThan(0);
  });
});
