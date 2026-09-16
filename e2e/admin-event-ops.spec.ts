// 관리자 → 이벤트 관리 (§6) — **화면이 진실을 말하는가**
//
// 잠그는 계약 넷
//   ① 서버에 RPC 가 아직 없을 때(PGRST202) '이벤트 0건' 이라고 말하지 않는다.
//      마이그레이션 20260912c 는 아직 운영 미적용이라 이게 **실제로 지금 일어나는 상태**다.
//      '0건' 으로 보이면 관리자는 없는 이벤트를 새로 만들려다 또 실패한다.
//   ② 조회 실패(403)도 '없음' 으로 위장하지 않는다.
//   ③ 진행 중과 **소진**을 구분해 보여준다(카드가 다 열리면 참여권도 이미 끊겨 있다 — 20260906c).
//   ④ 미개봉 당첨 **자리**는 관리자 화면에도 오지 않는다(서버가 집계만 준다 — 응답에 tier 가 없다).
//
// 세션은 가짜(로컬), 데이터는 page.route — 운영 DB 에 아무것도 보내지 않는다(_fixtures 가드).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-00000000ad11';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

const row = (o: Partial<Record<string, unknown>>) => ({
  id: 'c-1', slug: 'card-open-2026-09', title: '오픈 기념 이벤트', subtitle: null,
  status: 'live', createdAt: '2026-09-01T00:00:00Z', startsAt: '2026-09-01T00:00:00Z', endsAt: null,
  venueId: 'v-1', venueName: '로티아레나', ticketVenueId: null, ticketVenueName: null,
  voucherTitle: '로티아레나 매장이용권', voucherExpiresAt: null, issuedBy: UID, issuedByName: '운영자',
  venueQuota: 1000, venueApproved: true,
  totalCards: 100, openedCards: 12, remainCards: 88, prizeCards: 17, remainPrizeCards: 14,
  totalVouchers: 37, wonVouchers: 6, ticketsIssued: 40, ticketsUsed: 12,
  vouchersIssued: 6, vouchersUsed: 2,
  ...o,
});

/** 관리자 세션을 로컬에만 심고, 이벤트 목록 RPC 응답을 지정한다.
 *  `extra` 로 다른 RPC 의 응답도 지정할 수 있다(액션 실패 문구 검사용). */
async function bootAdmin(
  page: Page,
  list: { body: unknown; status?: number },
  extra: Array<{ fn: string; body: unknown; status?: number }> = [],
) {
  await page.setViewportSize({ width: 1280, height: 900 });   // 운영자 = PC 99%
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET'
    ? r.fulfill(json({
      id: UID, name: '운영자', nickname: '운영자', role: 'admin', approved: true, status: 'active',
      venue_id: null, activity_points: 0, created_at: '2026-01-01T00:00:00Z',
      agreed_to_terms: true, consented_legal_version: 2,
    }))
    : r.fallback()));
  for (const t of ['schedules', 'venues', 'community_posts', 'marketplace_notices', 'shouts', 'notifications', 'client_errors', 'community_ads', 'home_banners']) {
    await page.route(new RegExp(`/rest/v1/${t}\\?`), (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
  }
  // ⚠ app_settings 는 **단건(maybeSingle)** 조회라 `[]` 로 답하면 안 된다. 그리고 라우트가 없으면
  //   이 요청이 그대로 **운영으로 나간다**(이 파일의 라우트는 전부 패턴 매칭이라 빠뜨린 URL 은 실네트워크다).
  //   이벤트 메뉴 표시 스위치가 이 값을 읽는다(2026-09-12, 세 제어 분리).
  await page.route(/\/rest\/v1\/app_settings/, (r) => r.fulfill(json({ value: 'on' })));
  await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill(json([])));
  // ⚠ 이벤트 목록 RPC 는 포괄 rpc 라우트보다 **나중에** 등록해야 한다 —
  //   Playwright 의 route 는 나중에 등록한 것이 먼저 매치된다. 순서를 뒤집으면 포괄 라우트가
  //   전부 `[]` 로 답해 'PGRST202' · '403' · '행 4건' 테스트가 통째로 '0건' 화면을 보게 된다(실제로 겪음).
  await page.route(/\/rest\/v1\/rpc\/admin_list_event_campaigns/, (r) =>
    r.fulfill(json(list.body, list.status ?? 200)));
  for (const e of extra) {
    await page.route(new RegExp(`/rest/v1/rpc/${e.fn}`), (r) => r.fulfill(json(e.body, e.status ?? 200)));
  }

  await stabilizeBackstack(page);
  await page.goto('/?tab=admin');
  await dismissOverlays(page);
  const section = page.getByRole('button', { name: '이벤트 관리', exact: true }).first();
  await expect(section, '관리자 화면에 이벤트 관리 섹션이 없다 — 관리자로 안 들어갔을 수 있다')
    .toBeVisible({ timeout: 25_000 });
  await section.click();
  await page.waitForTimeout(700);
}

/** 관리자 화면 본문 — 이 탭만 data-tab 이 없어 '이벤트 관리' 를 품은 보이는 main 으로 잡는다 */
const adminPane = (page: Page) => page.locator('main').filter({ hasText: '이벤트 관리' }).first();

const PGRST202 = { code: 'PGRST202', message: 'Could not find the function public.admin_list_event_campaigns' };

test.describe('관리자 → 이벤트 관리', () => {
  test('🔴 RPC 미적용(PGRST202)은 "0건"이 아니라 "서버 미적용"으로 보인다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { body: PGRST202, status: 404 });

    await expect(adminPane(page).getByTestId('event-ops-rpc-missing'),
      'RPC 가 없는데 미적용 안내가 뜨지 않는다').toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('아직 만든 이벤트가 없습니다', { exact: false }),
      '조회할 방법이 없는 상태를 "이벤트 0건" 으로 위장했다').toHaveCount(0);
    // 서버 원문(함수 이름·SQL)을 화면에 그대로 뱉지 않는다 — 보안 표준 6번
    await expect(adminPane(page).getByText(/Could not find the function|public\.admin_list/),
      '서버 오류 원문이 화면에 노출됐다').toHaveCount(0);
  });

  test('🔴 조회 실패(403)도 "없음"으로 위장하지 않고, 서버 원문도 새지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    // ⚠ 실제로 새던 문자열 그대로 넣는다. 예전엔 throwRpc 가 `new Error(message)` 로 감싸며
    //   `code` 를 버려서 dbError 의 SQLSTATE 필터가 꺼졌고, 이 문장이 그대로 DOM 에 그려졌다.
    //   (그리고 isDenied 도 false 가 되어 '열람 권한이 없습니다' 대신 '불러오지 못했습니다' 가 떴다.)
    await bootAdmin(page, {
      body: { code: '42501', message: 'permission denied for function admin_list_event_campaigns' },
      status: 403,
    });
    const pane = adminPane(page);

    await expect(page.getByText('아직 만든 이벤트가 없습니다', { exact: false }),
      '403 인데 "이벤트 0건" 으로 위장했다').toHaveCount(0);
    // 권한 거부는 '못 불러옴'과 다른 세 번째 상태다 — 직원이 같은 버튼을 반복해 누르지 않게.
    await expect(pane.getByText('이벤트 목록 열람 권한이 없습니다'),
      '42501/403 인데 권한 안내가 아니라 일반 실패로 보인다 — code 가 버려졌다').toBeVisible({ timeout: 10_000 });
    // 🔴 보안 표준 6번 — 내부 식별자(함수·테이블 이름)가 화면에 나가면 안 된다
    await expect(pane.getByText(/permission denied|admin_list_event_campaigns/),
      '서버 오류 원문이 DOM 에 그대로 그려졌다').toHaveCount(0);
  });

  test('정말 0건일 때만 "0건" 이라고 말한다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { body: [] });
    await expect(adminPane(page).getByText('아직 만든 이벤트가 없습니다', { exact: false }))
      .toBeVisible({ timeout: 15_000 });
    await expect(adminPane(page).getByTestId('event-ops-rpc-missing')).toHaveCount(0);
  });

  test('🔴 진행 중 · 소진 · 준비 중 · 종료를 구분해 보여준다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { body: [
      row({ id: 'c-live', slug: 'live-1', title: '진행 중인 판' }),
      row({ id: 'c-sold', slug: 'sold-1', title: '소진된 판', openedCards: 100, remainCards: 0, remainPrizeCards: 0 }),
      row({ id: 'c-draft', slug: 'draft-1', title: '준비 중인 판', status: 'draft', totalCards: 0, openedCards: 0, remainCards: 0, prizeCards: 0, remainPrizeCards: 0, totalVouchers: 0 }),
      row({ id: 'c-end', slug: 'end-1', title: '끝난 판', status: 'ended' }),
    ] });

    const pane = adminPane(page);
    for (const [title, badge] of [['진행 중인 판', '진행 중'], ['소진된 판', '카드 소진'],
                                  ['준비 중인 판', '준비 중'], ['끝난 판', '종료']] as const) {
      const li = pane.locator('li').filter({ hasText: title }).first();
      await expect(li, `'${title}' 이 목록에 없다`).toBeVisible({ timeout: 15_000 });
      await expect(li.getByText(badge, { exact: true }).first(),
        `'${title}' 의 상태가 '${badge}' 로 표시되지 않는다 — 색만으로는 상태를 전달하지 않는다`).toBeVisible();
    }
    // 조치가 필요한 것은 목록에서 바로 보인다
    await expect(pane.getByText('카드판 미구성').first(),
      '카드가 0장인 초안인데 조치 안내가 없다').toBeVisible();
  });

  test('🔴 미개봉 당첨 자리는 관리자 화면에도 오지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { body: [row({})] });
    const pane = adminPane(page);
    await expect(pane.locator('li').filter({ hasText: '오픈 기념 이벤트' }).first()).toBeVisible({ timeout: 15_000 });
    // 서버 응답에 자리별 등급이 없으므로 화면에 '3번 카드 1등' 같은 문장이 생길 수 없다.
    await expect(pane.getByText(/\d+번 카드.*[1-4]등|[1-4]등.*\d+번/),
      '관리자 화면에 카드 자리별 등급이 나타났다 — 미개봉 당첨 위치 유출').toHaveCount(0);
    // 집계는 정상적으로 보인다(소실 아님)
    await expect(pane.getByText('카드 12/100 개봉', { exact: false })).toBeVisible();
  });


  test('🔴 액션 실패 토스트도 서버 원문을 그대로 뱉지 않는다 (errText → msgOf)', async ({ page }) => {
    test.setTimeout(90_000);
    // 목록은 정상, **검증 RPC 만** 42501 로 거절한다. 목록 카드가 아니라 **토스트** 경로를 태운다 —
    // 예전 errText 는 `e.message` 를 직접 썼고, 그 경로에는 dbError 필터가 전혀 걸려 있지 않았다.
    await bootAdmin(page, { body: [row({})] }, [{
      fn: 'admin_validate_event_campaign',
      body: { code: '42501', message: 'permission denied for function admin_validate_event_campaign' },
      status: 403,
    }]);
    const pane = adminPane(page);
    await pane.locator('li').filter({ hasText: '오픈 기념 이벤트' }).first()
      .getByRole('button', { name: '열기', exact: true }).click();
    await pane.getByRole('button', { name: '검증 실행', exact: true }).click();

    const toast = page.locator('[role="status"]').filter({ hasText: /권한|실패|검증/ }).first();
    await expect(toast, '실패 토스트가 뜨지 않는다 — 실패를 삼켰다').toBeVisible({ timeout: 10_000 });
    await expect(toast).toHaveText(/권한이 없습니다/);
    await expect(page.getByText(/permission denied|admin_validate_event_campaign/),
      '토스트에 서버 오류 원문이 그대로 나갔다(보안 표준 6번)').toHaveCount(0);
  });

  test('가로 넘침 없이 PC·모바일 폭에서 읽힌다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { body: [row({ title: '아주아주 긴 제휴 이벤트 이름이 들어와도 레이아웃이 깨지지 않아야 한다 테스트' })] });
    for (const w of [1280, 768, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(300);
      // 🔴 body 기준 — html{overflow-x:clip}(src/index.css:602) 때문에 documentElement 로 재면 **항상 0** 이다.
      //   증명(2026-09-16 운영 1280): body 에 width:3000px 자식 → documentElement.scrollWidth 1274(=clientWidth) · body.scrollWidth 3000.
      const over = await page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${w}px 에서 페이지가 가로로 ${over}px 넘친다`).toBeLessThanOrEqual(1);
    }
  });
});
