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
