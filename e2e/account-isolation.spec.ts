// 계정 경계 — 로그아웃 → 같은 탭에서 다른 계정 로그인(공용 PC 카운터의 실제 동선) 뒤에도
// 이전 계정의 개인 데이터가 새 계정 화면에 남거나, 늦게 도착해 새 계정 값을 덮어쓰지 않는가.
//
// 조립: voucher-sheet-open.spec 의 가짜 세션 3종 세트(서명 없는 디코드 가능 JWT · /auth/v1/user · profiles 목킹)를
//   두 계정(A/B)으로 늘리고, route 가 Authorization 헤더로 응답을 가른다. 이전 계정(A)의 요청은 테스트가
//   풀어 줄 때까지 **붙잡아 두고**(gate), 새 계정(B)의 요청도 필요한 순간까지 붙잡아
//   '응답 전 화면'과 '늦은 응답 후 화면'을 각각 단언한다.
//   고정 지연(3초)이 아니라 gate 인 이유: 러너가 느리면 3초 안에 로그아웃→로그인이 못 끝나
//   옛 코드에서도 통과하는 거짓 통과가 된다. gate 는 러너 속도와 무관하게 순서를 고정한다.
//
// 옛 코드에서 왜 실패하는가:
//  · 내 정보(CustomerDashboardPage)는 keep-alive 라 user 가 A→null→B 로 바뀌어도 visitStats·badgeStats 가 남아
//    B 에게 A 의 '방문 5회'·'내 업적'이 보였고(③), A 세션으로 나간 조회가 늦게 오면 B 의 값을 A 값으로 덮었다(⑤ — reload 에 세대 가드 없음).
//  · 쪽지 패널(NotificationPanel)은 AppHeader 에 항상 마운트라 App 의 [user?.id] 리셋이 threads 에 닿지 않아
//    A 의 대화 상대·마지막 쪽지가 B 에게 보였다.
//  · 알림(App.tsx 알림 이펙트)은 취소 가드가 없어 A 의 늦은 알림이 B 의 목록·배지에 실렸다.
//  · 로그아웃이 sessionStorage 'nh_pw_otp' 를 지우지 않아 다음 계정의 보안 탭이 코드 입력 단계로 열렸다.
// 운영 DB 에는 쓰지 않는다 — 세션 발급·폐기는 route 가 위조하고, 나머지 변이는 _fixtures 가드가 끊는다.
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = () => Math.floor(Date.now() / 1000) + 3600;
/** 서명 없는 JWT — supabase-js 는 클라이언트에서 **디코드만** 한다(voucher-sheet-open.spec 의 근거 그대로). */
const jwtOf = (sub: string) => [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub, aud: 'authenticated', role: 'authenticated', exp: exp() }), 'e2e'].join('.');
function sessionOf(id: string, name: string) {
  return {
    access_token: jwtOf(id), refresh_token: 'e2e-' + name, token_type: 'bearer', expires_in: 3600, expires_at: exp(),
    user: {
      id, aud: 'authenticated', role: 'authenticated', email: `${name.toLowerCase()}@example.com`,
      app_metadata: {}, user_metadata: { name }, created_at: new Date().toISOString(),
    },
  };
}
const A = sessionOf('00000000-0000-4000-8000-00000000aaaa', 'AAA');
const B = sessionOf('00000000-0000-4000-8000-00000000bbbb', 'BBB');
const profileOf = (s: typeof A) => ({
  id: s.user.id, name: s.user.user_metadata.name, nickname: s.user.user_metadata.name,
  role: 'user', status: 'active', activity_points: 0, created_at: s.user.created_at,
});
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
/** 이 요청이 A 세션으로 나갔는가 — Authorization: Bearer <JWT> 로 가른다 */
const fromA = (r: Route) => (r.request().headers()['authorization'] ?? '').includes(A.access_token);
/** 테스트가 풀어 줄 때까지 응답을 붙잡는 문 */
function gate() {
  let release!: () => void;
  const p = new Promise<void>((r) => { release = r; });
  return { wait: () => p, release };
}

/** A 세션으로 부팅 — GoTrue·profiles·토큰 발급(→B)·로그아웃을 route 로 위조한다 */
async function bootAsA(page: Page) {
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(A)] as [string, string]);
  await stabilizeBackstack(page);
  await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(fromA(r) ? A.user : B.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json(profileOf(fromA(r) ? A : B))));
  await page.route(/\/auth\/v1\/token\?grant_type=password/, (r) => r.fulfill(json(B)));
  await page.route(/\/auth\/v1\/logout/, (r) => r.fulfill({ status: 204, body: '' }));
  // 나머지 조회는 가짜 토큰이라 운영 서버가 401 로 거절한다 — 무해(이 스펙이 보는 화면은 전부 위에서 목킹).
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'AAA 메뉴' }), 'A 로 부팅되지 않았다').toBeVisible({ timeout: 15_000 });
}

/** 헤더 아바타 메뉴 '로그아웃' → 헤더 '로그인' → AuthModal 이메일 로그인(B) */
async function switchToB(page: Page) {
  await page.getByRole('button', { name: 'AAA 메뉴' }).click();
  await page.getByRole('button', { name: '로그아웃' }).click();
  const login = page.getByRole('button', { name: '로그인' }).first();
  await expect(login, '로그아웃 뒤 헤더에 로그인 버튼이 없다').toBeVisible({ timeout: 10_000 });
  await login.click();
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.locator('input[type="email"]').fill(B.user.email);
  await dialog.locator('input[type="password"]').first().fill('e2e-password');
  await dialog.getByRole('button', { name: /^로그인$/ }).last().click();
  await expect(page.getByRole('button', { name: 'BBB 메뉴' }), 'B 로 로그인되지 않았다').toBeVisible({ timeout: 15_000 });
  // 성공 모핑 뒤 모달이 닫혀야 헤더를 다시 누를 수 있다
  await expect(dialog).toHaveCount(0, { timeout: 10_000 });
}

test.describe('계정 전환 — 이전 계정 데이터 격리', () => {
  test('🔴 내 정보 — 이전 계정의 방문·업적이 새 계정에게 보이지 않고, 늦게 온 이전 계정 응답이 덮지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    const holdA = { on: false };
    const gA = gate();
    const gB = gate();
    const VENUE = '11111111-1111-4111-8111-111111111111';
    // KST 날짜가 다른 체크인 5행 = '방문 5회'(countVisitDays 단위)
    const CHECKINS_A = [1, 2, 3, 4, 5].map((d) => ({ venue_id: VENUE, created_at: `2026-09-0${d}T03:00:00Z` }));
    // getMyVisitStats 와 getMyBadgeStats 가 같은 checkins 쿼리를 쓴다 — A 는 붙잡기 스위치, B 는 항상 붙잡는다
    await page.route(/\/rest\/v1\/checkins\?/, async (r) => {
      if (fromA(r)) { if (holdA.on) await gA.wait(); return r.fulfill(json(CHECKINS_A)); }
      await gB.wait();
      return r.fulfill(json([]));
    });
    await page.route(/\/rest\/v1\/schedule_reservations\?/, (r) => r.fulfill(json([])));
    await bootAsA(page);

    const openMe = async (menu: string) => {
      await page.getByRole('button', { name: menu }).click();
      await page.getByRole('button', { name: '내 정보 열기' }).click();
      await expect(page.locator('h1', { hasText: '내 정보' })).toBeVisible();
    };
    const closeMe = () => page.locator('header:has(h1:text-is("내 정보")) button[aria-label="닫기"]').click();
    // 아이덴티티 헤더 스탯 3열 중 '방문' 칸의 값(p 첫째 = 값, 둘째 = 라벨)
    const visitStat = page.locator('div:has(> p:text-is("방문")) > p:first-child');

    // ① A 의 수치가 실제로 그려진다 — 아래 단언이 '원래 안 그려지는 값' 덕에 통과하는 게 아니어야 한다
    await openMe('AAA 메뉴');
    await expect(visitStat).toHaveText('5회');
    await expect(page.getByText('내 업적')).toBeVisible();
    await closeMe();

    // ② A 의 두 번째 조회를 붙잡아 '비행 중'으로 만든 채 계정을 바꾼다(재열림마다 reload 가 다시 나간다)
    holdA.on = true;
    await openMe('AAA 메뉴');
    await closeMe();
    // P0-08: 비밀번호 OTP 마커는 로그아웃이 지운다(닫기 X 가 지우므로 닫은 뒤에 심는다)
    await page.evaluate(() => sessionStorage.setItem('nh_pw_otp', String(Date.now())));
    await switchToB(page);
    expect(await page.evaluate(() => sessionStorage.getItem('nh_pw_otp')),
      '로그아웃 뒤에도 nh_pw_otp 가 남아 다음 계정의 보안 탭이 이전 계정의 코드 입력 단계로 열린다').toBeNull();

    // ③ B 가 열면(B 의 응답은 아직 붙잡힌 상태) A 의 수치가 보이면 안 된다
    await openMe('BBB 메뉴');
    // .first() 는 헤더의 PC 전용(lg+) 이름 span(모바일에선 display:none)을 잡는다 — 보이는 것만 고른다.
    await expect(page.getByText('BBB').filter({ visible: true }).first()).toBeVisible();
    await expect(visitStat, 'B 의 응답이 오기 전인데 A 의 방문 수가 보인다(keep-alive 잔존 state)').toHaveText('—');
    await expect(page.getByText('내 업적'), 'A 의 업적 카드가 B 에게 남아 있다').toHaveCount(0);

    // ④ B 의 응답 → 0회
    gB.release();
    await expect(visitStat).toHaveText('0회');

    // ⑤ 뒤늦게 도착한 A 의 응답이 B 의 화면을 덮으면 안 된다
    gA.release();
    await page.waitForTimeout(1_000);
    await expect(visitStat, '늦게 온 A 의 응답이 B 의 방문 수를 덮었다(reload 세대 가드 없음)').toHaveText('0회');
  });

  test('🔴 쪽지 패널 — 이전 계정의 대화 목록이 새 계정에게 보이지 않고, 늦게 온 목록도 버린다', async ({ page }) => {
    test.setTimeout(90_000);
    const holdA = { on: false };
    const gA = gate();
    const gB = gate();
    const X1 = '33333333-3333-4333-8333-333333333333';
    const ROW_A = {
      id: 'm-a1', sender_id: X1, recipient_id: A.user.id, body: 'A만 봐야 할 쪽지',
      created_at: new Date().toISOString(), read_at: null, sender_deleted: false, recipient_deleted: false,
    };
    await page.route(/\/rest\/v1\/user_messages\?/, async (r) => {
      const req = r.request();
      // 스레드 목록(GET · created_at.desc)만 위조 — 읽음 PATCH·HEAD 카운트는 가드/서버로 보낸다
      if (req.method() !== 'GET' || !decodeURIComponent(req.url()).includes('order=created_at.desc')) return r.fallback();
      if (fromA(r)) { if (holdA.on) await gA.wait(); return r.fulfill(json([ROW_A])); }
      await gB.wait();
      return r.fulfill(json([]));
    });
    await page.route(/\/rest\/v1\/rpc\/get_public_profiles/, (r) => r.fulfill(json([{ id: X1, nickname: '상대A', name: '상대A', avatar_color: null }])));
    await bootAsA(page);

    const bell = page.locator('button[aria-label^="알림"]');
    const panel = page.getByRole('dialog', { name: '알림' });
    // 패널 바깥(좌측 여백 page-x 안쪽) 클릭 = 바깥 클릭 닫기
    const closePanel = async () => { await page.mouse.click(4, 400); await expect(panel).toHaveCount(0); };

    // ① A 의 목록이 실제로 그려진다
    await bell.click();
    await expect(page.getByText('상대A')).toBeVisible();
    await closePanel();
    // ② A 의 두 번째 조회를 붙잡은 채 계정을 바꾼다
    holdA.on = true;
    await bell.click();
    await closePanel();
    await switchToB(page);

    // ③ B 가 열면(B 의 응답은 아직 붙잡힌 상태) A 의 대화 상대가 보이면 안 된다
    await bell.click();
    await expect(panel).toBeVisible();
    await expect(page.getByText('상대A'), 'B 의 응답 전인데 A 의 대화 상대가 보인다(패널 state 잔존)').toHaveCount(0);
    await expect(page.getByText('쪽지를 불러오는 중…')).toBeVisible();
    // ④ B 의 응답 → 빈 목록
    gB.release();
    await expect(page.getByText('주고받은 쪽지가 없습니다')).toBeVisible();
    // ⑤ 늦게 온 A 의 목록은 버려진다
    gA.release();
    await page.waitForTimeout(1_000);
    await expect(page.getByText('상대A'), '늦게 온 A 의 목록이 B 의 패널에 실렸다').toHaveCount(0);
    await expect(page.getByText('주고받은 쪽지가 없습니다')).toBeVisible();
  });

  // App.tsx 의 알림 이펙트(getMyNotifications → setNotifications)에 alive 가드가 있는가 — P0-04.
  test('🔴 알림 — 계정 전환 직후 늦게 도착한 이전 계정의 알림이 새 계정 목록에 실리지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    const gA = gate();
    await page.route(/\/rest\/v1\/notifications\?/, async (r) => {
      if (!fromA(r)) return r.fulfill(json([]));
      await gA.wait();
      return r.fulfill(json([{
        id: 'n-a1', user_id: A.user.id, type: 'system', title: 'A 전용 알림', message: 'A 의 활동',
        read: false, link: null, created_at: new Date().toISOString(),
      }]));
    });
    await bootAsA(page);           // A 의 알림 조회가 붙잡힌 채 비행 중
    await switchToB(page);
    gA.release();                  // B 로 바뀐 뒤에야 A 의 응답이 도착한다
    await page.waitForTimeout(1_000);

    await page.locator('button[aria-label^="알림"]').click();
    const panel = page.getByRole('dialog', { name: '알림' });
    await expect(panel).toBeVisible();
    await panel.getByRole('tab', { name: '알림', exact: true }).click();   // [쪽지|알림] 세그먼트(SegmentedTabs = role=tab)
    await expect(page.getByText('A 전용 알림'), '늦게 온 A 의 알림이 B 의 목록에 실렸다').toHaveCount(0);
    await expect(page.getByText('새 알림이 없습니다')).toBeVisible();
  });
});

// ── 비로그인 로그인 랜딩 — 매장 회원가입 첫 클릭 ───────────────────────────────
// voucher-sheet-open.spec 이 실측·잠근 것과 같은 결함 유형(MO-C1): Suspense 경계가 조건 안에 있고 동기 setState 라
// 새 경계가 폴백(null)을 커밋하고 ~300ms 붙잡는다 — 화면 변화가 없어 '눌러도 안 열린다 → 두 번 누른다'.
test.describe('로그인 랜딩(비로그인)', () => {
  test('🔴 매장 회원가입 — 한 번의 클릭으로 가입 모달이 뜬다', async ({ page }) => {
    test.setTimeout(60_000);
    // 비로그인이 랜딩에 닿는 길: 헤더 아바타(로그인 전용)·탭바 5칸(캘린더) 어느 쪽도 비로그인 진입점이 아니다.
    // App 은 부팅 때 sessionStorage 'nh_pw_otp' 가 신선하면 내 정보를 연다(비밀번호 OTP 리로드 복귀) — 그 경로로 들어간다.
    await page.addInitScript(() => { try { sessionStorage.setItem('nh_pw_otp', String(Date.now())); } catch { /* 차단 환경 */ } });
    await stabilizeBackstack(page);
    await page.goto('/');
    const signup = page.getByRole('button', { name: /매장 회원가입/ });
    await expect(signup, '비로그인 랜딩이 뜨지 않았다').toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_500); // App warm() 이 AuthModal 청크를 데우는 시간 — '데워진 뒤에도 남는' 무반응을 본다

    // 프레임마다 '가입 모달이 떴는가'를 적는다 — 몇 번째 프레임에 떴는지가 곧 체감이다
    await page.evaluate(() => {
      const w = window as unknown as { __n: number; __at: number; __raf: number };
      w.__n = 0; w.__at = -1;
      const tick = () => {
        w.__n++;
        if (w.__at < 0 && document.querySelector('[role="dialog"] [data-testid="signup-email"]')) w.__at = w.__n;
        w.__raf = requestAnimationFrame(tick);
      };
      w.__raf = requestAnimationFrame(tick);
    });
    await signup.click();
    await page.waitForTimeout(1_500);
    const r = await page.evaluate(() => {
      const w = window as unknown as { __n: number; __at: number; __raf: number };
      cancelAnimationFrame(w.__raf);
      return { frames: w.__n, openedAtFrame: w.__at };
    });
    console.log('[업주 가입 모달 열림]', JSON.stringify(r));
    expect(r.openedAtFrame, '한 번 눌렀는데 가입 모달이 뜨지 않았다').toBeGreaterThan(0);
    // 폴백 스로틀에 걸리면 ~300ms(≈18프레임) 동안 아무것도 안 뜬다
    expect(r.openedAtFrame, '모달이 뜨기까지 프레임이 너무 많다(폴백 스로틀 의심 — Suspense 를 조건 안에 넣지 말 것)').toBeLessThanOrEqual(10);
  });
});
