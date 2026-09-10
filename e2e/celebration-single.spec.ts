// 승급 축하는 **한 겹**이고 **계정 경계**를 넘지 않는다.
//
// 왜: LevelUpWatcher(519c8af) 와 TierCelebration(f4a1b7c) 이 같은 임계표를 각자 보고 있어 승급 한 번에
//   z-90 다이얼로그가 두 겹 떠서 두 번 닫아야 했고, 컨페티도 캔버스 140조각 + CSS 18조각이 같이 돌았다.
//   또 LevelUpWatcher 의 '마지막 본 레벨' 키가 전역(nuri:level-seen)이라 같은 기기에서 다른 계정으로
//   로그인하면 이전 계정과 비교해 가짜 LEVEL UP 이 떴다. 같은 뿌리의 계정 경계 결함이 알림에도 있었다 —
//   이전 계정으로 나간 늦은 알림·쪽지 응답이 새 계정의 배지·패널에 실렸다(P0-04·P0-02).
//
// 잠그는 것:
//  ① 임계 통과 시 role=dialog 1개 · canvas 1개 · aria-modal · 뒤로가기로 닫히고 앱 안에 남는다
//  ② prefers-reduced-motion 이면 캔버스 컨페티를 마운트하지 않는다
//  ③ 전역 키만 있는(다른 계정이 남긴) 기기에서 새 계정에 가짜 승급이 뜨지 않는다
//  ④ A 로그아웃 → B 로그인 뒤 도착한 A 의 알림·쪽지 응답이 B 에게 보이지 않는다
// 세션은 **가짜**(voucher-sheet-open.spec 조리법) — 응답만 갈아끼우고 운영 DB 에는 쓰지 않는다.
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID_A = '00000000-0000-4000-8000-00000000000a';
const UID_B = '00000000-0000-4000-8000-00000000000b';
/** 서명 없는 JWT — supabase-js 는 클라이언트에서 디코드만 한다. 아무 문자열이면 만료를 못 읽어 세션을 버린다. */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub: string) => [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const session = (id: string, name: string) => ({
  access_token: jwt(id), refresh_token: `e2e-fake-${name}`, token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id, aud: 'authenticated', role: 'authenticated', email: `${name.toLowerCase()}@example.com`,
    app_metadata: {}, user_metadata: { name }, created_at: new Date().toISOString(),
  },
});
const profile = (id: string, name: string, points: number) => ({
  id, name, nickname: name, role: 'user', status: 'active', activity_points: points, created_at: new Date().toISOString(),
});
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

/** 활동점수 150 = 4번째 등급(rank 3). 저장된 rank 0 보다 크므로 승급으로 감지돼야 한다. */
async function bootAsRankUp(page: Page, seed: Record<string, string>) {
  const FAKE = session(UID_A, 'AAA');
  await page.addInitScript(([k, v, s]) => {
    try { localStorage.setItem(k, v); for (const [sk, sv] of Object.entries(s)) localStorage.setItem(sk, sv); } catch { /* 차단 환경 */ }
  }, [KEY, JSON.stringify(FAKE), seed] as [string, string, Record<string, string>]);
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json(profile(UID_A, 'AAA', 150))));
  await page.goto('/');
}

const CELEBRATIONS = '[role="dialog"][aria-label="레벨 업"], [role="dialog"][aria-label="등급 승급 축하"]';

test.describe('승급 축하 — 한 겹', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 375, height: 812 }); });

  test('🔴 임계 통과 — dialog 1개 · canvas 1개 · aria-modal · 뒤로가기가 축하만 닫는다', async ({ page }) => {
    test.setTimeout(60_000);
    await stabilizeBackstack(page); // 새 탭은 history.length=1 이라 back 이 앱을 벗어난다
    // 전역 키(옛 LevelUpWatcher)도 함께 심는다 — 두 감지기가 살아 있으면 여기서 2겹이 된다.
    await bootAsRankUp(page, { [`nuri:tier-rank:${UID_A}`]: '0', 'nuri:level-seen': '1' });

    const dlg = page.getByRole('dialog', { name: '레벨 업' });
    await expect(dlg, '승급인데 축하가 뜨지 않았다').toBeVisible({ timeout: 20_000 });
    await expect(page.locator(CELEBRATIONS), '같은 승급에 축하 다이얼로그가 2겹이다').toHaveCount(1);
    await expect(dlg.locator('canvas'), '캔버스 컨페티가 1개여야 한다').toHaveCount(1);
    await expect(dlg, '전면 오버레이인데 aria-modal 이 없다(뒤 화면을 계속 읽는다)').toHaveAttribute('aria-modal', 'true');

    await page.waitForLoadState('networkidle');
    await page.goBack();
    await expect(dlg, '뒤로가기로 축하가 닫히지 않았다').toHaveCount(0);
    expect(new URL(page.url()).pathname, '뒤로가기가 앱 밖으로 나갔다').toBe('/');
    await expect(page.locator('button[aria-label^="알림"]'), '앱이 살아 있어야 한다').toBeVisible();
  });

  test('🔴 prefers-reduced-motion — 캔버스 컨페티를 마운트하지 않는다', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootAsRankUp(page, { [`nuri:tier-rank:${UID_A}`]: '0' });
    const dlg = page.getByRole('dialog', { name: '레벨 업' });
    await expect(dlg).toBeVisible({ timeout: 20_000 });
    // CSS 규칙은 캔버스 rAF 에 닿지 않는다 — 140조각이 3.5초 떨어지면 '깜빡임 0' 계약 위반.
    await expect(dlg.locator('canvas'), '동작 줄이기인데 캔버스 컨페티가 돈다').toHaveCount(0);
  });

  test('🔴 계정 경계 — 다른 계정이 남긴 전역 키로는 가짜 LEVEL UP 이 뜨지 않는다', async ({ page }) => {
    test.setTimeout(60_000);
    // 이 계정의 키는 없고 옛 전역 키(레벨 1)만 있다 → 전역 키를 보면 Lv4 > 1 로 오탐한다.
    await bootAsRankUp(page, { 'nuri:level-seen': '1' });
    await expect(page.locator('button[aria-label^="알림"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator(CELEBRATIONS), '이전 계정의 기록과 비교해 가짜 승급이 떴다').toHaveCount(0);
  });
});

test('🔴 계정 전환 — A 로 나간 늦은 알림·쪽지 응답이 B 의 배지·패널에 실리지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  const FAKE_A = session(UID_A, 'AAA');
  const FAKE_B = session(UID_B, 'BBB');
  const isA = (r: Route) => (r.request().headers()['authorization'] ?? '').includes(FAKE_A.access_token);
  // A 의 응답은 테스트가 풀어 줄 때까지 붙잡는다 — 타이머가 아니라 게이트라 순서가 결정적이다.
  let releaseA!: () => void;
  const gateA = new Promise<void>((res) => { releaseA = res; });
  const seenB = { notifications: false };

  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE_A)] as [string, string]);
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(isA(r) ? FAKE_A.user : FAKE_B.user)));
  await page.route(/\/auth\/v1\/logout/, (r) => r.fulfill({ status: 204, body: '' }));
  await page.route(/\/auth\/v1\/token\?grant_type=password/, (r) => r.fulfill(json(FAKE_B)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json(isA(r) ? profile(UID_A, 'AAA', 0) : profile(UID_B, 'BBB', 0))));
  await page.route(/\/rest\/v1\/rpc\/get_public_profiles/, (r) => r.fulfill(json([{ id: 'X1', nickname: '상대A', name: '상대A', avatar_color: null }])));
  await page.route(/\/rest\/v1\/notifications\?/, async (r) => {
    if (!isA(r)) { seenB.notifications = true; return r.fulfill(json([])); }
    await gateA;
    return r.fulfill(json([{
      id: 'n1', user_id: UID_A, type: 'system', title: 'A 전용 알림', message: 'A 의 활동', read: false,
      link: null, avatar_text: null, avatar_color: null, created_at: new Date().toISOString(),
    }]));
  });
  await page.route(/\/rest\/v1\/user_messages\?/, async (r) => {
    if (!isA(r)) return r.fulfill(json([]));
    await gateA;
    return r.fulfill(json([{
      id: 'm1', sender_id: 'X1', recipient_id: UID_A, body: 'A만 봐야 할 쪽지', created_at: new Date().toISOString(),
      read_at: null, sender_deleted: false, recipient_deleted: false,
    }]));
  });

  await page.goto('/');
  const bell = page.locator('button[aria-label^="알림"]');
  await expect(bell, 'A 로 부팅되지 않았다').toBeVisible({ timeout: 20_000 });
  // A 로 패널을 한 번 연다 — 쪽지 조회(A)가 게이트에 걸려 비행 중이 된다.
  await bell.click();
  const panel = page.getByRole('dialog', { name: '알림' });
  await expect(panel).toBeVisible();
  // 모바일에서는 패널 아래 스크림(fixed inset-0 sm:hidden)이 벨을 덮는다 — 바깥(스크림) 클릭으로 닫는다(account-isolation 과 동일).
  await page.mouse.click(4, 400);
  await expect(panel).toHaveCount(0);

  // 로그아웃 → B 로그인(로그인 화면은 auth-smoke 와 같은 셀렉터)
  // ⚠ visible 필터: PC 전용 내비에도 같은 라벨이 있어 .first() 가 숨은 쪽을 잡으면 클릭이 무한 대기한다.
  await page.getByRole('button', { name: 'AAA 메뉴' }).click();
  await page.getByRole('button', { name: '로그아웃' }).filter({ visible: true }).first().click();
  const loginBtn = page.getByRole('button', { name: '로그인' }).filter({ visible: true }).first();
  await expect(loginBtn, '로그아웃이 되지 않았다').toBeVisible({ timeout: 10_000 });
  await loginBtn.click();
  const form = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
  await expect(form).toBeVisible({ timeout: 10_000 });
  await form.locator('input[type="email"]').fill('bbb@example.com');
  await form.locator('input[type="password"]').first().fill('e2e-password');
  await form.getByRole('button', { name: /^로그인$/ }).last().click();
  await expect(bell, 'B 로 로그인되지 않았다').toBeVisible({ timeout: 20_000 });
  await expect.poll(() => seenB.notifications, { message: 'B 의 알림 조회가 나가지 않았다' }).toBe(true);

  // B 로 패널을 열어 B 의 쪽지 조회([])가 끝난 다음에야 A 의 늦은 응답을 풀어 준다.
  await bell.click();
  await expect(panel.getByText('주고받은 쪽지가 없습니다')).toBeVisible({ timeout: 10_000 });
  releaseA();
  await page.waitForTimeout(800);

  await expect(panel.getByText('상대A'), 'A 의 쪽지 상대가 B 에게 보인다').toHaveCount(0);
  await expect(bell, 'A 의 미읽음이 B 의 배지에 실렸다').toHaveAttribute('aria-label', '알림 0개');
  await panel.getByRole('tab', { name: '알림' }).click();
  await expect(panel.getByText('A 전용 알림'), 'A 의 알림이 B 의 패널에 보인다').toHaveCount(0);
  await expect(panel.getByText('새 알림이 없습니다')).toBeVisible();
});
