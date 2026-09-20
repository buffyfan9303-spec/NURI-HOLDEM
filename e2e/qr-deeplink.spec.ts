// Q6(2026-09-21) — **QR 딥링크는 한 번 파싱되고 한 갈래만 실행된다.**
//
// 무엇이 문제였나: `?checkin`·`?buyin`·`?signup` 을 App 의 **서로 다른 effect 세 개**가 각자 읽어서,
//   `src/lib/qrPayload.ts` 의 '혼합 의도 거부' 가 **URL 진입에서는 통째로 우회**됐다.
//   로그인 상태의 `?checkin=A&buyin=B` 는 두 변이 경로를 **둘 다** 시작했고,
//   `?checkin=A&signup=1` 은 출석과 가입 모달을 같이 열었다.
//   단위 테스트(`qrPayload.test.ts`)는 파서만 본다 — 그 파서를 **안 거치는** 통로가 있었다는 것이
//   바로 이 결함이라, 단위 테스트만으로는 영원히 못 잡는다. 그래서 이 스펙은 **실제 URL 진입**에서
//   나가는 **RPC 횟수**를 센다.
//
// 음성 대조: App.tsx 의 단일 분기를 예전처럼 `?checkin` / `?buyin` / `?signup` 세 effect 로 되돌리면
//   아래 '혼합' 케이스들이 빨개진다(RPC 가 나가거나 가입 폼이 열린다).
//
// 운영 DB 에 쓰지 않는다 — 변이 RPC 는 전부 route 로 가로채고, `_fixtures` 가드도 한 겹 더 막는다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack } from './_session';

const VENUE_A = '11111111-2222-3333-4444-555555555555';
const VENUE_B = '99999999-8888-7777-6666-555555555555';

/** 변이 RPC 호출을 세고 전부 가로챈다 — 하나라도 나가면 그 자체가 결함이다. */
async function countMutations(page: Page) {
  const calls: string[] = [];
  await page.route(/\/rest\/v1\/rpc\/(check_in|request_buyin)/, (r) => {
    calls.push(/check_in/.test(r.request().url()) ? 'check_in' : 'request_buyin');
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  return calls;
}

/** 로그인 창(또는 가입 폼)이 떠 있는가. AuthModal 은 이메일/비밀번호 폼을 가진 다이얼로그다. */
async function loginVisible(page: Page): Promise<boolean> {
  return page.locator('[role="dialog"]').filter({ hasText: /로그인|회원가입|이메일/ }).first()
    .isVisible().catch(() => false);
}

/** 앱이 부팅을 마치고 QR effect 가 돌 시간을 준다(authLoading 종료 뒤에 판단한다). */
async function settle(page: Page) {
  await expect(page.getByRole('navigation', { name: '하단 내비게이션' })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
}

// ── 혼합 의도 — 어느 쪽도 실행하지 않는다 ───────────────────────────────────────
for (const [name, query] of [
  ['checkin+buyin', `?checkin=${VENUE_A}&buyin=${VENUE_B}`],
  ['checkin+signup', `?checkin=${VENUE_A}&signup=1`],
  ['buyin+signup', `?buyin=${VENUE_A}&signup=1`],
  ['세 개 전부', `?checkin=${VENUE_A}&buyin=${VENUE_B}&signup=1`],
] as const) {
  test(`🔴 Q6 혼합(${name}) — 출석·바인 RPC 0회, 가입 폼도 안 열린다`, async ({ page }) => {
    const calls = await countMutations(page);
    await stabilizeBackstack(page);
    await page.goto(`/${query}`);
    await settle(page);

    expect(calls, `혼합 주소인데 변이 RPC 가 나갔다 — ${JSON.stringify(calls)}`).toEqual([]);
    expect(await loginVisible(page), '혼합 주소인데 로그인·가입 창이 열렸다').toBe(false);
    // QR 키는 주소에서 지워진다 — 새로고침·뒤로가기로 같은 시도가 되살아나면 안 된다.
    await expect(page, 'QR 키가 주소에 남았다').toHaveURL((u) =>
      !u.searchParams.has('checkin') && !u.searchParams.has('buyin') && !u.searchParams.has('signup'));
  });
}

// ── 같은 키 중복 · 잘못된 값 ────────────────────────────────────────────────────
for (const [name, query] of [
  ['같은 키 중복(checkin)', `?checkin=${VENUE_A}&checkin=${VENUE_B}`],
  ['같은 키 중복(buyin)', `?buyin=${VENUE_A}&buyin=${VENUE_B}`],
  ['signup=2', '?signup=2'],
  ['game=12x', `?buyin=${VENUE_A}&game=12x`],
  ['game 단독', '?game=2'],
  ['빈 값', '?checkin='],
  ['출석에 game', `?checkin=${VENUE_A}&game=2`],
] as const) {
  test(`🔴 Q6 무효(${name}) — 아무것도 실행하지 않는다`, async ({ page }) => {
    const calls = await countMutations(page);
    await stabilizeBackstack(page);
    await page.goto(`/${query}`);
    await settle(page);

    expect(calls, `무효 주소인데 변이 RPC 가 나갔다 — ${JSON.stringify(calls)}`).toEqual([]);
    expect(await loginVisible(page), '무효 주소인데 로그인·가입 창이 열렸다').toBe(false);
  });
}

// ── 단일 의도는 **그대로 동작한다** — 위 거부가 과잉이 아님을 보인다 ─────────────────
test('🔴 Q6 단일 출석 QR(비로그인) — 로그인 창이 뜨고 출석 RPC 는 0회다', async ({ page }) => {
  const calls = await countMutations(page);
  await stabilizeBackstack(page);
  await page.goto(`/?checkin=${VENUE_A}`);
  await settle(page);

  // 비로그인이면 '하려던 일' 을 적어 두고 로그인부터 — 여기서 RPC 가 나가면 서버가 거절할 뿐이지만
  // 손님에게는 이유 없는 실패 토스트로 보인다.
  expect(calls, `비로그인인데 출석 RPC 가 나갔다 — ${JSON.stringify(calls)}`).toEqual([]);
  expect(await loginVisible(page), '단일 출석 QR 인데 로그인 창이 안 열렸다 — 손님이 갈 곳이 없다').toBe(true);
  // 의도는 저장되고 주소는 정리된다(카카오·구글 왕복에서 쿼리가 사라져도 이어서 처리하기 위해).
  const intent = await page.evaluate(() => { try { return localStorage.getItem('nuri:qr-intent'); } catch { return null; } });
  expect(intent, '보류 의도가 저장되지 않았다 — OAuth 왕복에서 출석이 증발한다').toContain(VENUE_A);
  await expect(page).toHaveURL((u) => !u.searchParams.has('checkin'));
});

test('🔴 Q6 단일 가입 QR(비로그인) — 가입 폼이 열리고 변이 RPC 는 0회다', async ({ page }) => {
  const calls = await countMutations(page);
  await stabilizeBackstack(page);
  await page.goto('/?signup=1');
  await settle(page);

  expect(calls, `가입 QR 인데 변이 RPC 가 나갔다 — ${JSON.stringify(calls)}`).toEqual([]);
  expect(await loginVisible(page), '가입 QR 인데 가입 폼이 안 열렸다').toBe(true);
  // 🔴 가입 QR 은 **출석 의도를 만들지 않는다** — 예전엔 별도 effect 라 이 구별이 없었다.
  const intent = await page.evaluate(() => { try { return localStorage.getItem('nuri:qr-intent'); } catch { return null; } });
  expect(intent, '가입 QR 이 출석·바인 보류 의도를 남겼다').toBeNull();
});

// ── 오래 남은 보류 의도 — 새 QR 주소가 오면 **먼저 버린다** ──────────────────────
for (const [name, query] of [
  ['무효 주소', '?signup=2'],
  ['혼합 주소', `?checkin=${VENUE_A}&buyin=${VENUE_B}`],
  ['정상 가입 주소', '?signup=1'],
] as const) {
  test(`🔴 Q6 stale 의도 + ${name} — 옛 출석이 되살아나지 않는다`, async ({ page }) => {
    const calls = await countMutations(page);
    await stabilizeBackstack(page);
    // 30분 안에 스캔해 둔 옛 출석 의도를 심는다(로그인 왕복을 하다 만 손님의 상태).
    await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
      ['nuri:qr-intent', JSON.stringify({ kind: 'checkin', venueId: VENUE_B, gameSeq: null, at: Date.now() })] as [string, string]);
    await page.goto(`/${query}`);
    await settle(page);

    expect(calls, `옛 보류 의도가 되살아나 RPC 가 나갔다 — ${JSON.stringify(calls)}`).toEqual([]);
    const intent = await page.evaluate(() => { try { return localStorage.getItem('nuri:qr-intent'); } catch { return null; } });
    expect(intent, `새 QR 주소가 왔는데 옛 의도가 남아 있다 — 나중에 로그인하면 실행된다 (${intent})`).toBeNull();
  });
}

// ── 다른 쿼리·hash 는 보존한다 ─────────────────────────────────────────────────
test('🔴 Q6 — QR 키만 지우고 다른 query·hash 는 그대로 둔다', async ({ page }) => {
  await countMutations(page);
  await stabilizeBackstack(page);
  // ⚠ 동행 파라미터로 `tab` 을 쓰지 마라 — **앱이 자기 딥링크로 소비하며 스스로 지운다**(`App.tsx:1013`).
  //   그러면 QR 정리 탓이 아닌데도 이 검사가 빨개진다(2026-09-21에 실제로 그랬다).
  //   앱이 건드리지 않는 키(`utm_source`)로 잰다. 포스터 QR 에 실제로 붙을 법한 값이기도 하다.
  await page.goto(`/?checkin=${VENUE_A}&utm_source=poster#top`);
  await settle(page);

  await expect(page, 'QR 키가 안 지워졌다').toHaveURL((u) => !u.searchParams.has('checkin'));
  const url = new URL(page.url());
  expect(url.searchParams.get('utm_source'), 'QR 정리가 다른 쿼리까지 지웠다').toBe('poster');
  expect(url.hash, 'QR 정리가 hash 까지 지웠다').toBe('#top');
});
