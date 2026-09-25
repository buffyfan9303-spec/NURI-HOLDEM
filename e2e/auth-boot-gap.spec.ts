// 인증 부팅 틈(2026-09-26) — **로그인된 손님**이 `?checkin=` 딥링크로 들어와도 로그인 창이 뜨던 결함.
//
// 원인: `AuthContext` bootProfile 이 `setUser` 는 startTransition(2026-09-18 d8b2a99 — 로그인 성공 프레임 LoAF 완화)
//   안에서, `setLoading(false)` 는 **밖에서** 불렀다. React 는 기본 레인(loading)을 트랜지션 레인(user)보다 먼저
//   렌더·커밋하므로 **'로딩 끝 · 사용자 없음'** 커밋이 한 번 생긴다. 그 커밋의 effect 들이 전부 '비로그인 확정' 으로 읽는다:
//     · App QR effect(`?checkin=`·`?buyin=`) → 로그인 창을 열고 의도를 보류(G1)
//     · ToolsPanel 대기 의도(로딩 중 누른 도구) → promptLogin(G3)
//   부팅 첫 조회(bootProfile)와 onAuthStateChange 조회 중 **어느 쪽이 먼저 오느냐**에 따라 틈이 생기거나 안 생긴다 —
//   그래서 하네스(location-consent·checkin-geo-retry)가 "스텁 세션은 로그인 창이 먼저 뜰 수 있다" 며 닫고 지나갔다.
//   이 스펙은 **두 번째 profiles 조회부터 지연**시켜 bootProfile 이 먼저 도착하는 순서를 확정한다.
//
// 측정: rAF 로 매 프레임 로그인 창 존재 + MutationObserver 로 '한 번이라도 붙었나' 를 센다. 수집 프레임 수를 단언해
//   0 프레임 거짓 통과를 막고, G2(로그아웃 딥링크는 여전히 로그인 창)로 탐지기 자체를 양성 대조한다.
// 음성 대조: AuthContext bootProfile 의 `setLoading(false)` 를 startTransition 밖으로 되돌리면 G1·G3 이 빨개진다.
// 운영 DB 에 쓰지 않는다 — check_in·설정·프로필은 route 로 가로채고 `_fixtures` 가드가 한 겹 더 막는다.
// 실행: E2E_BASE_URL=http://localhost:<포트> npx playwright test e2e/auth-boot-gap.spec.ts --project=mobile-chromium
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

const VENUE = '11111111-2222-3333-4444-555555555555';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
type Gap = { frames: number; loginFrames: number; mounted: number };

/** 문서 시작부터 매 프레임 로그인 창 존재를 적는다. 로그인 창 = password 입력을 가진 dialog 또는 aria-label 로그인/회원가입. */
async function installGapProbe(page: Page) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const SEL = '[role="dialog"] input[type="password"], [role="dialog"][aria-label="로그인"], [role="dialog"][aria-label="회원가입"]';
    const g = { frames: 0, loginFrames: 0, mounted: 0 };
    (window as unknown as { __gap: typeof g }).__gap = g;
    const tick = () => {
      g.frames++;
      if (document.querySelector(SEL)) g.loginFrames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new MutationObserver(() => { if (document.querySelector(SEL)) g.mounted++; })
      .observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
  });
}
const readGap = (page: Page) => page.evaluate(() => (window as unknown as { __gap: Gap }).__gap);

/** profiles 조회 순서 제어 — first 가 첫 조회(bootProfile)를 붙잡고, 두 번째부터는 laterMs 만큼 늦춘다. */
async function orderProfileReads(page: Page, first: Promise<void> = Promise.resolve(), laterMs = 1_500) {
  let n = 0;
  await page.route(/\/rest\/v1\/profiles\?/, async (r) => {
    n++;
    if (n === 1) await first; else await new Promise((res) => setTimeout(res, laterMs));
    return r.fallback();   // stubLogin 의 프로필 응답으로 넘긴다(route 는 나중 등록이 먼저 불린다)
  });
}

async function stubCheckin(page: Page) {
  const calls: unknown[] = [];
  await page.route(/\/rest\/v1\/app_settings\?.*checkin_geo_enabled/, (r) => r.fulfill(json({ value: 'off' })));
  await page.route(/\/rest\/v1\/rpc\/check_in/, (r) => {
    calls.push(JSON.parse(r.request().postData() ?? '{}'));
    return r.fulfill(json({ name: '검증 홀덤', points: 3, streak: 1 }));
  });
  return calls;
}

test('🔴 G1 로그인된 손님의 ?checkin= — 로그인 창이 한 프레임도 안 뜨고 바로 출석된다', async ({ page }) => {
  test.setTimeout(60_000);
  await installGapProbe(page);
  await stabilizeBackstack(page);
  await stubLogin(page);
  await orderProfileReads(page);
  const calls = await stubCheckin(page);
  await page.goto(`/?checkin=${VENUE}`);
  await expect.poll(() => calls.length, { timeout: 20_000, message: '로그인 세션인데 출석이 안 나갔다' }).toBe(1);
  await page.waitForTimeout(1_200);   // 늦게 붙는 로그인 창까지 기다린다
  const g = await readGap(page);
  expect(g.frames, `수집 프레임이 너무 적다(${g.frames}) — 측정 무효`).toBeGreaterThan(30);
  expect(g, '로그인된 세션인데 로그인 창이 떴다(부팅 틈: 로딩 끝·사용자 없음 커밋)').toMatchObject({ loginFrames: 0, mounted: 0 });
  expect(calls[0]).toEqual({ p_venue_id: VENUE });
});

test('G2 양성 대조 — 로그아웃 상태의 ?checkin= 은 여전히 로그인 창을 띄우고 출석은 0회', async ({ page }) => {
  test.setTimeout(60_000);
  await installGapProbe(page);
  await stabilizeBackstack(page);
  const calls = await stubCheckin(page);
  await page.goto(`/?checkin=${VENUE}`);
  await expect(page.getByRole('dialog', { name: '로그인' }), '비로그인 QR 인데 로그인 창이 안 떴다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_200);   // G1 과 같은 관찰 창
  const g = await readGap(page);
  expect(g.frames).toBeGreaterThan(30);
  expect(g.loginFrames, '탐지기가 로그인 창을 못 센다 — G1 의 0 은 무의미').toBeGreaterThan(0);
  expect(calls).toEqual([]);
});

test('🔴 G3 로딩 중에 누른 GTO 도구 — 세션이 확정되면 로그인 창 없이 도구가 열린다', async ({ page }) => {
  test.setTimeout(60_000);
  await installGapProbe(page);
  await stabilizeBackstack(page);
  await stubLogin(page);
  let release!: () => void;
  await orderProfileReads(page, new Promise<void>((res) => { release = res; }));   // 첫 조회를 붙잡아 '로딩 중' 창을 연다
  await page.goto('/?tab=tools');
  const card = page.locator('button[data-testid^="tool-"]').first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.evaluate((el) => (el as HTMLElement).click());   // 자동 스크롤 없이 누른다(ToolsPanel pendingTool 경로)
  release();
  await expect(page.getByRole('dialog').first(), '세션 확정 뒤 도구가 안 열렸다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_200);
  const g = await readGap(page);
  expect(g.frames).toBeGreaterThan(30);
  expect(g, '로딩 중 누른 도구가 로그인 창으로 바뀌었다(부팅 틈)').toMatchObject({ loginFrames: 0, mounted: 0 });
});

test('🔴 G4 만료 세션(갱신 거부)의 ?checkin= — 부팅 중 SIGNED_OUT 이 와도 로딩이 풀려 로그인 창이 뜬다', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  // 저장소에 **만료된** 세션 — supabase-js 가 부팅 중 갱신을 시도하고, 서버가 거부하면 SIGNED_OUT 을 낸다.
  await page.addInitScript(() => {
    const ref = 'idsxiqspecrucvfvtgbw';
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const uid = '00000000-0000-4000-8000-0000000000f2';
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: 1000 })}.stub`;
    try {
      localStorage.setItem('nuri:keep-signed-in', '1');
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: token, refresh_token: 'revoked', token_type: 'bearer', expires_in: 3600, expires_at: 1000,
        user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'expired@example.test' },
      }));
    } catch { /* noop */ }
  });
  await page.route(/\/auth\/v1\/token/, (r) => r.fulfill({ status: 400, contentType: 'application/json',
    body: JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }) }));
  const calls = await stubCheckin(page);
  await page.goto(`/?checkin=${VENUE}`);
  await expect(page.getByRole('dialog', { name: '로그인' }),
    '만료 세션이 부팅 중 로그아웃됐는데 로딩이 안 풀려 QR 이 멈췄다').toBeVisible({ timeout: 15_000 });
  expect(calls).toEqual([]);
});

test('🔴 G5 업주의 ?tab=my-store — 홈으로 한 번 튕기거나 자리 예약이 꺼지는 프레임이 없다', async ({ page }) => {
  // 같은 틈의 다른 증상: '로딩 끝 · 역할 없음' 커밋에서 탭 가드가 홈으로 보내고(pendingDeepTab 이 나중에 되살림)
  //   내 매장 자리 예약(pane-reserve)이 꺼져 푸터가 올라왔다가 떨어진다. 실측(수정 전 3/3): 홈 5~9프레임.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const f = { frames: 0, homeShown: 0, mystore: 0, collapse: 0 };
    let seenReserve = false;
    (window as unknown as { __tab: typeof f }).__tab = f;
    const tick = () => {
      f.frames++;
      const home = document.querySelector('[data-tab="home"]');
      if (home && getComputedStyle(home).display !== 'none') f.homeShown++;
      const reserve = !!document.querySelector('.pane-reserve[aria-busy="true"]');
      const m = document.querySelector('main[data-tab="my-store"]');
      const ms = !!m && getComputedStyle(m).display !== 'none';
      if (reserve) seenReserve = true;
      if (ms) f.mystore++;
      if (seenReserve && !reserve && !ms) f.collapse++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await stabilizeBackstack(page);
  await stubLogin(page, { role: 'venue_owner', approved: true, venue_id: VENUE, name: '검증업주', nickname: '검증업주' });
  await orderProfileReads(page);
  await page.goto('/?tab=my-store');
  await expect(page.locator('main[data-tab="my-store"]'), '업주인데 내 매장 판이 안 떴다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
  const f = await page.evaluate(() => (window as unknown as { __tab: { frames: number; homeShown: number; mystore: number; collapse: number } }).__tab);
  expect(f.frames, '측정 무효').toBeGreaterThan(30);
  expect(f.mystore, '내 매장 판 프레임이 없다 — 측정 무효').toBeGreaterThan(0);
  expect(f, '업주 딥링크가 부팅 틈에 홈으로 튕겼다').toMatchObject({ homeShown: 0, collapse: 0 });
});

// G6(2026-09-26 home-team) — 같은 틈의 네 번째 통로: App 의 친구 초대 `?ref=` effect 가 **마운트 1회**(deps [])라
//   부팅 첫 커밋의 user(항상 null)로 판단해 로그인된 사람에게 가입 시트를 띄웠다(AuthContext 수정 뒤에도 2/2 재현).
//   고침: `if (authLoading) return;` + deps [authLoading]. 한 번만 처리되는지는 record_referral 호출 수·주소 정리로 본다.
// 음성 대조(2026-09-26): 수정 전 빌드에서 G6 이 빨갛다(가입 시트 프레임 > 0).
async function stubReferral(page: Page) {
  const calls: unknown[] = [];
  await page.route(/\/rest\/v1\/rpc\/record_referral/, (r) => { calls.push(JSON.parse(r.request().postData() ?? '{}')); return r.fulfill(json(true)); });
  return calls;
}

test('🔴 G6 로그인된 사람의 ?ref= — 가입 시트가 한 프레임도 안 뜨고, 추천 연결은 정확히 1회 · 주소에서 ref 가 지워진다', async ({ page }) => {
  test.setTimeout(60_000);
  await installGapProbe(page);
  await stabilizeBackstack(page);
  await stubLogin(page);
  await orderProfileReads(page);
  const calls = await stubReferral(page);
  await page.goto('/?ref=NURI123');
  await expect.poll(() => calls.length, { timeout: 20_000, message: '로그인 세션인데 추천 연결이 안 나갔다' }).toBe(1);
  await page.waitForTimeout(1_500);   // 늦게 붙는 가입 시트 · 중복 실행까지 기다린다
  const g = await readGap(page);
  expect(g.frames, `수집 프레임이 너무 적다(${g.frames}) — 측정 무효`).toBeGreaterThan(30);
  expect(g, '로그인된 사람인데 가입 시트가 떴다(?ref effect 가 로딩을 안 본다)').toMatchObject({ loginFrames: 0, mounted: 0 });
  expect(calls, '추천 연결이 두 번 이상 나갔다(중복 실행)').toEqual([{ p_code: 'NURI123' }]);
  expect(new URL(page.url()).searchParams.get('ref'), '처리 뒤에도 주소에 ref 가 남았다(재실행 근거)').toBeNull();
});

test('G6b 양성 대조 — 로그아웃 상태의 ?ref= 는 가입 시트를 띄우고 추천 연결은 0회', async ({ page }) => {
  test.setTimeout(60_000);
  await installGapProbe(page);
  await stabilizeBackstack(page);
  const calls = await stubReferral(page);
  await page.goto('/?ref=NURI123');
  await expect(page.locator('[role="dialog"] input[type="password"]').first(), '비로그인 초대 링크인데 가입 시트가 안 떴다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_200);
  const g = await readGap(page);
  expect(g.frames).toBeGreaterThan(30);
  expect(g.loginFrames, '탐지기가 가입 시트를 못 센다 — G6 의 0 은 무의미').toBeGreaterThan(0);
  expect(calls).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('nuri:ref-code')), '추천 코드를 기억하지 않았다(가입 뒤 연결할 값)').toBe('NURI123');
});

// G7(2026-09-26 home-team) — 푸시 알림 부팅 링크 `?nl=/admin`: 권한(프로필)이 오기 전 **홈이 100~150ms 먼저 그려졌다가** 관리자로 바뀌었다
//   (AuthContext 수정 전엔 아예 '내 매장' 으로 갔다 — isAdmin=false 커밋). 고침: 알림 링크가 가리키는 권한 탭을 시작 탭으로 삼는다
//   (src/lib/notifBootTab.ts · `?tab=admin` 과 같은 pendingDeepTab 길). 권한이 없으면 탭 가드가 확인 뒤 홈으로 보낸다.
// 음성 대조(2026-09-26): 수정 전 빌드에서 G7 이 빨갛다(홈 프레임 > 0).
async function installPaneProbe(page: Page) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const f = { frames: 0, home: 0, admin: 0, mystore: 0 };
    (window as unknown as { __pane: typeof f }).__pane = f;
    const shown = (sel: string) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };
    const tick = () => {
      f.frames++;
      if (shown('[data-tab="home"]')) f.home++;
      if (shown('main[data-tab="admin"]')) f.admin++;
      if (shown('main[data-tab="my-store"]')) f.mystore++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const readPane = (page: Page) => page.evaluate(() => (window as unknown as { __pane: { frames: number; home: number; admin: number; mystore: number } }).__pane);

for (const width of [390, 1280]) {
  test(`🔴 G7 관리자의 ?nl=/admin(${width}) — 홈이 한 프레임도 안 그려지고 관리자 화면에 도착한다`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await installPaneProbe(page);
    await stabilizeBackstack(page);
    await stubLogin(page, { role: 'admin', name: '검증관리자', nickname: '검증관리자' });
    await orderProfileReads(page);
    await page.goto('/?nl=%2Fadmin');
    await expect(page.locator('main[data-tab="admin"]'), '관리자인데 관리자 화면이 안 떴다').toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    const f = await readPane(page);
    expect(f.frames, '측정 무효').toBeGreaterThan(30);
    expect(f.admin, '관리자 판 프레임 0 — 측정 무효').toBeGreaterThan(0);
    expect(f, '관리자 알림 링크 부팅에 홈·내 매장이 먼저 그려졌다').toMatchObject({ home: 0, mystore: 0 });
    expect(new URL(page.url()).searchParams.get('nl'), '알림 링크가 주소에 남았다').toBeNull();
  });
}

test('G7b 음성 — 일반 회원의 ?nl=/admin 은 권한 확인 뒤 홈에 도착하고 관리자 판은 0 프레임', async ({ page }) => {
  test.setTimeout(60_000);
  await installPaneProbe(page);
  await stabilizeBackstack(page);
  await stubLogin(page);
  await orderProfileReads(page);
  await page.goto('/?nl=%2Fadmin');
  await expect(page.locator('[data-tab="home"]'), '권한 없는 사람이 홈에 도착하지 않았다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_200);
  const f = await readPane(page);
  expect(f.frames).toBeGreaterThan(30);
  expect(f.home, '홈 프레임 0 — 측정 무효').toBeGreaterThan(0);
  expect(f, '일반 회원에게 관리자·내 매장 판이 보였다').toMatchObject({ admin: 0, mystore: 0 });
  expect(new URL(page.url()).searchParams.get('nl'), '알림 링크가 주소에 남았다(새로고침하면 다시 연다)').toBeNull();
});

test('G7c 업주의 ?nl=/admin(내 포스터 승인 알림) — 홈을 거치지 않고 내 매장에 도착한다 · 주소에 nl 이 남지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await installPaneProbe(page);
  await stabilizeBackstack(page);
  await stubLogin(page, { role: 'venue_owner', approved: true, venue_id: VENUE, name: '검증업주', nickname: '검증업주' });
  await orderProfileReads(page);
  await page.goto('/?nl=%2Fadmin');
  await expect(page.locator('main[data-tab="my-store"]'), '업주인데 내 매장에 도착하지 않았다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_200);
  const f = await readPane(page);
  expect(f.frames).toBeGreaterThan(30);
  expect(f.mystore, '내 매장 판 프레임 0 — 측정 무효').toBeGreaterThan(0);
  expect(f, '업주 알림 링크 부팅에 홈·관리자 판이 그려졌다').toMatchObject({ home: 0, admin: 0 });
  expect(new URL(page.url()).searchParams.get('nl'), '알림 링크가 주소에 남았다(새로고침하면 다시 연다)').toBeNull();
});
