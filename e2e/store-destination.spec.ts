// 대시보드 이동이 '어느 날짜·어느 게임' 을 데려가는가 — 픽스처로 착지를 실측한다.
//
// 왜 이 스펙이 필요한가 (2026-09-07 추적):
//   StoreDashboard 의 prop 이 `onGoto(section: string)` 하나뿐이라 문맥이 통째로 버려졌다.
//   '지난 장부 3건이 미마감이에요' 를 눌러도 **오늘** 장부가 열렸다 — 미마감 장부는 정의상 지난 날짜인데.
//   순수 함수 쪽은 storeDestination.test.ts 가 지키고, 여기서는 **그 함수가 실제로 배선돼 있는지**를 잰다.
//   (매핑이 맞아도 prop 을 안 넘기면 사용자에게는 고쳐지지 않은 것이다.)
//
// 운영 데이터 안전: _fixtures 가 POST/PATCH/DELETE 와 변이 RPC 를 네트워크 단에서 끊는다.
//   이 스펙은 거기에 더해 '미마감 지난 장부' 조회 **응답만** 갈아끼운다 — 쓰기는 하지 않는다.
import { test, expect } from './_fixtures';
import { type Page, type Route } from '@playwright/test';
import { loginAs } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

// 오늘과 확실히 다른 과거 + 사이드2. 메인(1)으로 뭉개지거나 오늘로 떨어지면 즉시 드러난다.
const STALE_DATE = '2026-08-11';
const STALE_GAME = 3;

test.describe('대시보드 → 게임 판 착지', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 없음 — 내 매장은 로그인해야 열린다');

  test('🔴 지난 미마감 장부 CTA 는 그 날짜·그 게임의 장부로 착지한다', async ({ page }) => {
    // listStaleOpenSessions 의 조회만 결정적으로 만든다(closed=eq.false 가 이 쿼리의 지문).
    await page.route(
      (url) => url.pathname.endsWith('/rest/v1/ledger_sessions') && url.search.includes('closed=eq.false'),
      (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ session_date: STALE_DATE, game_seq: STALE_GAME, title: 'E2E 사이드' }]),
      }),
    );

    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
    test.skip(await store.count() === 0, '이 계정에는 내 매장 탭이 없다');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });

    // '지금 할 일' 은 미마감 장부가 있으면 그것을 최우선으로 고른다(StoreDashboard 우선순위).
    const cta = page.getByTestId('todo-cta');
    await expect(cta).toBeVisible({ timeout: 20_000 });
    await cta.click();

    // 착지 확인 — 장부의 날짜가 오늘이 아니라 그 미마감 날짜여야 한다.
    const dateInput = page.getByTestId('ledger-date');
    await expect(dateInput).toBeVisible({ timeout: 20_000 });
    await expect(dateInput, '미마감 장부를 눌렀는데 오늘 장부가 열렸다 — onGoto 가 날짜를 버리고 있다')
      .toHaveValue(STALE_DATE, { timeout: 20_000 });

    // 게임까지 따라왔는가 — 같은 날 메인/사이드가 둘이면 날짜만으로는 부족하다(F01).
    const chipBar = page.locator('text=/사이드\\s*2/').first();
    await expect(chipBar, `사이드2(game_seq=${STALE_GAME}) 로 착지하지 않았다 — 게임이 메인으로 뭉개졌다`)
      .toBeVisible({ timeout: 20_000 });
  });

  test('정산 이동은 스크롤이 아니라 정산 마감 버튼을 지목한다', async ({ page }) => {
    // 오늘 '열린' 장부가 있어야 정산 마감 버튼이 그려진다. 라이브 DB 에 장부를 만드는 것은 쓰기라
    // 할 수 없으므로 **오늘 세션 조회만** 픽스처로 바꾼다(session_date=eq.<오늘> 인 질의만 가로챈다 —
    // 미마감 지난 장부 조회(closed=eq.false)는 그대로 통과시켜야 다른 화면이 정상 동작한다).
    const today = new Date().toLocaleDateString('en-CA');
    await page.route(
      (url) => url.pathname.endsWith('/rest/v1/ledger_sessions') && url.search.includes(`session_date=eq.${today}`),
      (route) => {
        const single = (route.request().headers()['accept'] ?? '').includes('pgrst.object');
        const row = {
          venue_id: null, session_date: today, game_seq: 1, title: 'E2E 정산 확인용',
          buyin_amount: 100000, card_amount: null, game_type: 'gtd', target_entries: 0, max_entries: 0,
          is_addon: false, addon_stack: 0, reg_closed: false, closed: false, discounts: [],
          opened_at: new Date(Date.now() - 3600_000).toISOString(), // '시작된' 장부여야 보드(정산바)가 뜬다
          early_double_min: 0, early_single_min: 0, tournament_start: null, schedule_id: null,
        };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
      },
    );
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
    test.skip(await store.count() === 0, '이 계정에는 내 매장 탭이 없다');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });

    // 게임 스텝 바의 '정산' — 장부가 열려 있어야 마감 버튼이 존재한다.
    const settleStep = page.getByRole('button', { name: '정산' }).first();
    test.skip(await settleStep.count() === 0, '이 계정/화면에 정산 스텝이 없다');

    const before = await page.evaluate(() => window.scrollY);
    await settleStep.click();
    await page.waitForTimeout(4000); // 장부 판 마운트 + 세션 로드

    const settleBtn = page.getByTestId('ledger-settle');
    if (await settleBtn.count() === 0) {
      // 장부 '보드'(정산바가 있는 화면)는 세션 한 건만으로 뜨지 않는다 — 게임 목록·바인 조회가 함께 걸려 있어
      // 픽스처로 재현하려면 결합된 질의 여러 개를 동시에 갈아끼워야 한다. 그 표면을 넓히는 대신 여기서 멈춘다.
      // ⇒ 정산 포커스 동작은 **실계정·실장부에서 수동 확인이 남아 있다**(숨기지 않고 skip 으로 남긴다).
      test.skip(true, '오늘 장부 보드가 열리지 않았다 — 정산 마감 버튼이 없어 지목 대상이 없다(실계정 확인 필요)');
    }
    await expect(settleBtn).toBeFocused({ timeout: 10_000 });

    // 문서 맨 아래로 끌고 가는 예전 동작이 남아 있지 않은지 — 정산바는 fixed 라 스크롤할 이유가 없다.
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before), `정산 이동이 페이지를 ${after - before}px 끌었다 — 정산바는 fixed 라 스크롤할 대상이 아니다`)
      .toBeLessThan(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 오늘 보드 착지 — 세션·매장·장부를 **전부 목킹**한다(운영 DB 를 건드리지 않는다. settle-pane.spec 과 같은 조리법:
//   가짜 세션 3종(디코드 가능한 JWT · profiles 객체 · 권한 RPC 3종 true) + 응답만 갈아끼우기).
//
// 잠그는 결함(2026-09-10 감사 F01·F02·F06):
//   · 대시보드의 '오늘' CTA(미수금·장부 보기·바인 요청 전체 관리·빠른 작업 장부)가 bare 'ledger' 로 가서
//     resolveDest 가 시드를 만들지 않고 goStep 이 ledgerSeed 를 지워 장부가 **목록 모드**로 열렸다 —
//     사장님이 오늘 날짜·게임을 다시 골라야 했다(단계 바 '장부'는 09-07 에 고쳐졌는데 카드는 그대로였다).
//   · 알림 /my-store/ledger(🙋 손님 바인 요청) 딥링크도 같은 목록 모드 착지.
//   · 대시보드의 '오늘'이 브라우저 로컬 TZ 라 KST 보다 뒤진 기기에서 **어제** 장부를 '오늘'로 읽어 '미시작'.
const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ee';
const VENUE = '33333333-3333-4333-8333-333333333333';
/** ⚠ 앱의 '오늘'은 **KST**(kstToday)다. UTC 날짜를 쓰면 한국 새벽에 픽스처만 하루 어긋난다. */
const DAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
/** 서명 없는 JWT — supabase-js 는 클라이언트에서 디코드만 한다. 아무 문자열이면 만료를 못 읽어 세션을 버린다. */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com',
          app_metadata: {}, user_metadata: { name: '업주' }, created_at: new Date().toISOString() },
};
/** 오늘(KST) 메인 — **시작된**(opened_at) 장부. 대시보드가 이걸 '진행중'으로 읽어야 오늘 CTA 들이 뜬다. */
const sessionRow = () => ({
  venue_id: VENUE, session_date: DAY, game_seq: 1,
  buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0,
  title: '데일리 메인', discounts: [], early_double_min: 0, early_single_min: 0,
  reg_closed: false, closed: false, opened_at: new Date(Date.now() - 3_600_000).toISOString(),
  tournament_start: null, schedule_id: null,
});
const buyinRow = (i: number, name: string, over: Record<string, unknown> = {}) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE, session_date: DAY, game_seq: 1, player_name: name, entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${DAY}T12:00:00Z`, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0,
  ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
  ...over,
});

async function bootOwner(page: Page, opts: { notifications?: unknown[]; staleFail?: boolean } = {}) {
  await page.setViewportSize({ width: 1280, height: 900 }); // 매장 운영은 PC 99%
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  // 읽기만 갈아끼운다 — 쓰기(알림 읽음 PATCH 등)는 page 라우트가 먼저 잡으므로 fallback 으로 넘겨
  //   _fixtures 의 컨텍스트 가드가 예전처럼 끊게 둔다(스텁이 200 을 주면 가드가 무력화된 것처럼 보인다).
  const restGet = (body: unknown) => (r: Route) => (r.request().method() === 'GET' ? r.fulfill(json(body)) : r.fallback());
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  // getMyProfile 은 .single() — 객체 하나여야 한다(배열이면 user.id 가 비는 반쪽 로그인).
  await page.route(/\/rest\/v1\/profiles\?/, restGet({
    id: UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active',
    venue_id: VENUE, activity_points: 0, created_at: FAKE.user.created_at,
  }));
  await page.route(/\/rest\/v1\/venues\?/, restGet([{
    id: VENUE, name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1', owner_id: UID,
    approved: true, status: 'active', verification_status: 'verified',
    is_paid_ad: false, display_order: 1, follower_count: 3, rating: 4.5,
  }]));
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers)/, (r) => r.fulfill(json(true)));
  // 장부 세션: **오늘(KST) 을 묻는 질의만** 시작된 장부를 돌려준다. 다른 날짜(로컬 TZ 가 어긋난 기기가 묻는
  //   어제 등)·미마감·범위 조회는 빈 결과 — 그래야 '어느 날짜를 물었는가'가 화면 차이로 드러난다.
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const url = r.request().url();
    if (opts.staleFail && url.includes('closed=eq.false')) {
      return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"injected"}' });
    }
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    const hit = url.includes(`session_date=eq.${DAY}`);
    return r.fulfill(json(single ? (hit ? sessionRow() : null) : (hit ? [sessionRow()] : [])));
  });
  // 미수 1건 — 대시보드 '오늘 N만원 미수금' CTA 가 뜨는 조건(오늘 CTA 중 픽스처가 가장 가벼운 것).
  await page.route(/\/rest\/v1\/ledger_buyins\?/, restGet([buyinRow(1, '김철수'), buyinRow(2, '박민수', { is_unpaid: true })]));
  await page.route(/\/rest\/v1\/ledger_players\?/, restGet([]));
  await page.route(/\/rest\/v1\/notifications\?/, restGet(opts.notifications ?? []));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/** '내 매장' 은 ≥lg 에서 role=tab, 모바일에서 button — 폭과 무관하게 보이는 button 요소로 잡는다. */
const openMyStore = (page: Page) => page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });

test.describe('오늘 보드 착지(목킹 세션)', () => {
  test('🔴 대시보드 미수금 CTA → 오늘(KST) 장부 보드에 착지한다(목록 모드가 아니다)', async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page);
    await openMyStore(page);
    const cta = page.getByTestId('unpaid-cta');
    await expect(cta, '미수금 CTA 가 없다 — 오늘 세션이 "시작됨"으로 읽히지 않았다').toBeVisible({ timeout: 20_000 });
    await cta.click();
    // 목록 모드에는 ledger-date 가 없다 — 보드에 앉았는지, 그리고 오늘(KST)인지.
    const dateInput = page.getByTestId('ledger-date');
    await expect(dateInput, '장부가 목록 모드로 열렸다 — 오늘 CTA 가 날짜를 버리고 있다(bare "ledger")').toBeVisible({ timeout: 20_000 });
    await expect(dateInput).toHaveValue(DAY);
  });

  test('🔴 알림 /my-store/ledger(🙋 손님 바인 요청) → 오늘(KST) 장부 보드에 착지한다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page, { notifications: [{
      id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: UID, type: 'system',
      title: '🙋 손님 바인 요청', message: '김철수 님이 데일리 메인 바인을 요청했어요',
      read: false, created_at: new Date().toISOString(), link: '/my-store/ledger',
    }] });
    await page.locator('button[aria-label^="알림"]').first().click();
    // 패널은 [쪽지|알림] 세그먼트(role=tab)이고 기본이 쪽지다.
    await page.getByRole('tab', { name: '알림', exact: true }).click();
    await page.getByText('🙋 손님 바인 요청').first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
    const dateInput = page.getByTestId('ledger-date');
    await expect(dateInput, '알림 딥링크가 장부 목록 모드에 떨어졌다 — 사장님이 오늘을 다시 골라야 한다').toBeVisible({ timeout: 20_000 });
    await expect(dateInput).toHaveValue(DAY);
  });

  // F07 — '지금 할 일' 1·2순위 근거(미마감·순위 미입력) 조회 실패가 빈 배열로 위장되는 결함.
  //   대시보드 쪽(두 조회를 core 로 편입 → LoadErrorCard + 재시도)은 고쳤지만, src/api/ledger.ts 의
  //   listStaleOpenSessions·getPosterOpsSummaries 가 `const { data } = …` 로 error 를 버리고 [] 를 돌려주는
  //   동안은 실패가 화면까지 오지 않는다. 그 두 함수가 getLedgerSession 처럼 `if (error) throw error` 로
  //   바뀌면 fixme 를 지운다 — 그때 이 스펙이 그대로 게이트가 된다.
  test.fixme('🔴 미마감 조회가 실패하면 "오늘 운영 완료"가 아니라 오류·다시 시도가 보인다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page, { staleFail: true });
    await openMyStore(page);
    await expect(page.getByRole('button', { name: /다시 시도/ }).first(), '조회 실패인데 재시도 버튼이 없다').toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('todo-cta'), '실패를 빈 상태로 위장해 거짓 CTA 를 권했다').toHaveCount(0);
  });
});

// ── 기기 시간대가 KST 보다 뒤일 때 ──────────────────────────────────────────
// 장부·서버는 전부 KST(kstToday · ledger_business_date)인데 StoreDashboard 의 오늘은 브라우저 로컬 TZ 였다.
// 정산 단계만 VenueManageTab 에서 우회했고(settle-pane.spec), 대시보드의 오늘 세션 조회·'미시작' 배지·
// 순위 입력 목적지·단계 완료 판정은 그대로 로컬 날짜였다 — 해외·시계 오설정·CI(UTC) 에서 어제 장부를 '오늘'로.
// ⚠ 호놀룰루(UTC-10)는 KST 19시 이전에만 날짜가 하루 뒤진다 — 그 시간대 밖에서는 이 스펙이 구분력 없이 통과한다(settle-pane 과 같은 한계).
test.describe('기기 시간대가 KST 보다 뒤여도', () => {
  test.use({ timezoneId: 'Pacific/Honolulu' });
  test('🔴 대시보드 "오늘 장부"는 장부(KST) 기준 날짜를 읽는다 — 어제를 오늘로 보지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page);
    await openMyStore(page);
    const band = page.locator('button').filter({ hasText: '오늘 장부' }).first();
    await expect(band).toBeVisible({ timeout: 20_000 });
    await expect(band, '로컬 날짜(어제)로 세션을 물어 "미시작"이 떴다 — 오늘은 KST 여야 한다').toContainText('진행중', { timeout: 20_000 });
    await expect(band).not.toContainText('미시작');
  });
});
