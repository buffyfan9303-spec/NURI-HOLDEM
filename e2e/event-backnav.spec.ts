// 이벤트 판의 **뒤로가기·주소 동기화** — §4 독립 검증에서 드러난 간극을 메운다.
//
// 왜 따로 필요한가:
//   §4 에서 `?event` 를 '1회성 진입'(읽고 즉시 replaceState 로 삭제)에서 **유지**로 바꿨다.
//   그 순간 주소와 화면이 어긋날 수 있는 경로가 생긴다. 실제로 구현 중에 하나 터졌다:
//   `replaceState` 는 **'지금 항목'만** 고치는데 `useBackClose` 는 X 버튼으로 닫을 때도
//   `history.back()` 을 쓴다 — 그래서 **예전 항목의 `?event=…` 가 되살아났다.**
//
//   독립 검증 결과, 저장소 전체에 이벤트의 뒤로가기를 잠그는 e2e 가 **한 건도 없었다**
//   (`grep -rn goBack e2e/*.spec.ts` 이벤트 매치 0건). 고쳐 놓고 잠그지 않은 상태였다.
//
// 이 스펙이 잠그는 것: 판이 떠 있으면 주소에 `event` 가 있고, 닫히면 없다 —
// **어떤 순서로 오가든** 그렇다. 둘이 어긋나면 새로고침·공유 링크가 거짓말을 한다.
// 2026-09-18 오너 지시("이벤트 탭을 누르면 이벤트 리스트로 이동하게 해") 반영: 아래 MENU 기반 테스트는
//   메뉴 클릭이 이제 보드가 아니라 **목록**을 먼저 연다는 것을 전제로 "목록 열림 → event-list-item 클릭 →
//   보드 확인" 한 단계를 끼웠다(단언을 지운 게 아니다). 딥링크(`?event=1`) 기반 테스트 3개는 이 축과
//   무관해 그대로 뒀다 — 그 축이 안 바뀌었다는 것이 지금 가장 중요한 보증이다.
import { test, expect } from './_fixtures';

const EVENT_RPC = /\/rest\/v1\/rpc\/event_board/;
const EVENTS_LIST = /\/rest\/v1\/event_campaigns\?/;
const DIALOG = '[role="dialog"][aria-label="이벤트"]';
const LIST = '[data-testid="event-list-page"]';
const MENU = 'home-event-menu';
const j = (body: unknown, status = 200) => ({ status, contentType: 'application/json' as const, body: JSON.stringify(body) });
/** 목록에 실릴 캠페인 1개 — MENU 로 들어가는 테스트가 이 slug 를 눌러 보드까지 간다. */
const LISTED = { slug: 'e2e-backnav', title: 'E2E 백네브 캠페인', subtitle: null, status: 'live', hidden_at: null, starts_at: null, ends_at: null };

/** 이벤트 유무와 무관하게 돌도록 보드를 고정한다 — 이 스펙의 관심사는 히스토리다. */
async function stubBoard(page: import('@playwright/test').Page) {
  await page.route(EVENT_RPC, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
}

/** MENU 기반 테스트 전용 — 목록에 캠페인 1개가 뜨게 한다(목록이 비면 누를 event-list-item 이 없다). */
async function stubList(page: import('@playwright/test').Page) {
  await page.route(EVENTS_LIST, (r) => r.fulfill(j([LISTED])));
}

const hasEvent = (u: URL) => u.searchParams.has('event');

test('🔴 딥링크로 들어와 뒤로가기 — 판이 닫히고 주소에서도 event 가 빠진다', async ({ page }) => {
  await stubBoard(page);
  await page.goto('/?event=1');
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });

  await page.goBack();
  await expect(page.locator(DIALOG), '뒤로가기로 이벤트 판이 닫히지 않았다').toBeHidden({ timeout: 15_000 });
  await expect(page, '판은 닫혔는데 주소에 event 가 남았다 — 새로고침하면 혼자 다시 열린다')
    .toHaveURL((u) => !hasEvent(u));
});

test('🔴 홈에서 열고 뒤로가기 — 보드 → 목록 → 닫기 순서로 닫히고 주소가 매 단계 맞는다', async ({ page }) => {
  await stubBoard(page);
  await stubList(page);
  await page.goto('/');
  await page.getByTestId(MENU).click();
  // 2026-09-18: 메뉴는 이제 목록을 먼저 연다 — 목록은 겹이지만 주소를 갖지 않는다(보드만 ?event= 를 쓴다).
  const list = page.locator(LIST);
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(page, '목록만 열렸는데 주소에 event 가 붙었다').toHaveURL((u) => !hasEvent(u));

  await list.getByTestId('event-list-item').first().click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });
  await expect(page, '판을 열었는데 주소에 event 가 없다 — 이 상태는 공유·새로고침으로 재현되지 않는다')
    .toHaveURL((u) => hasEvent(u));

  // 1차 뒤로가기 — 보드만 닫히고 목록이 그대로 드러난다(두 겹 오버레이의 핵심 계약 — 반드시 남긴다).
  await page.goBack();
  await expect(page.locator(DIALOG), '뒤로가기 1회에 보드가 안 닫혔다').toBeHidden({ timeout: 15_000 });
  await expect(list, '보드를 닫았는데 목록까지 같이 닫혔다 — 뒤로가기가 두 겹을 한 번에 삼켰다').toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL((u) => !hasEvent(u));

  // 2차 뒤로가기 — 이제 목록도 닫히고 홈으로 돌아온다.
  await page.goBack();
  await expect(list, '뒤로가기 2회째에도 목록이 안 닫혔다').toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL((u) => !hasEvent(u));
});

test('🔴 X 로 닫은 뒤 뒤로가기 — 지워진 event 가 되살아나지 않는다', async ({ page }) => {
  // 구현 중 실제로 터졌던 경로다: X 는 history.back() 을 쓰는데 주소 정리는 replaceState 였다.
  await stubBoard(page);
  await stubList(page);
  await page.goto('/');
  await page.getByTestId(MENU).click();
  // 2026-09-18: 메뉴는 목록을 먼저 연다 — 이 스펙의 대상(X 닫기 → event 주소)은 보드에서 성립한다.
  const list = page.locator(LIST);
  await expect(list).toBeVisible({ timeout: 15_000 });
  await list.getByTestId('event-list-item').first().click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });

  await page.locator(DIALOG).getByRole('button', { name: /닫기/ }).first().click();
  await expect(page.locator(DIALOG)).toBeHidden({ timeout: 15_000 });
  await expect(page, 'X 로 닫았는데 주소에 event 가 남았다').toHaveURL((u) => !hasEvent(u));

  await page.goBack();
  await expect(page.locator(DIALOG), '닫은 뒤 뒤로가기에서 이벤트 판이 되살아났다')
    .toBeHidden({ timeout: 15_000 });
  await expect(page, '닫은 뒤 뒤로가기에서 지워둔 event 주소가 되살아났다')
    .toHaveURL((u) => !hasEvent(u));
});

test('🔴 뒤로가기 연타 — 두 겹(보드·목록)이 남거나 주소만 남는 중간 상태가 없다', async ({ page }) => {
  await stubBoard(page);
  await stubList(page);
  await page.goto('/');
  await page.getByTestId(MENU).click();
  const list = page.locator(LIST);
  await expect(list).toBeVisible({ timeout: 15_000 });
  // 2026-09-18: 이제 겹이 둘이다(목록 → 보드) — 연타가 둘 다 삼키는지 본다.
  await list.getByTestId('event-list-item').first().click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });

  // 뒤로가기를 빠르게 두 번(사람이 두 번 누르는 것과 같은 결의 '연타' — 매 호출을 기다리되 간격은 없다).
  // ⚠ 실측(2026-09-18): `Promise.all([goBack(), goBack()])` 로 같은 틱에 동시에 던지면 Playwright 의
  //   두 CDP 내비게이션 명령이 브라우저에서 **한 번의 이동으로 합쳐져** 겹 하나만 닫힌다(목록이 안 닫힘) —
  //   이건 이 앱의 결함이 아니라 **동시에 던진 두 뒤로가기를 실제 손가락은 절대 못 낸다**(손가락 반응속도는
  //   최소 수십 ms). `await` 로 각 내비게이션을 순서대로 완료시키면(간격 0 이어도) 실제 연타를 그대로 재현하고,
  //   두 겹 모두 정확히 닫힌다(실측 확인).
  await page.goBack();
  await page.goBack();

  await expect(page.locator(DIALOG)).toBeHidden({ timeout: 15_000 });
  await expect(list, '뒤로가기 연타 뒤 목록이 남아 있다').toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL((u) => !hasEvent(u));
  // 화면이 살아 있어야 한다 — 히스토리를 넘겨 빈 화면으로 떨어지면 안 된다.
  await expect(page.getByRole('navigation', { name: '하단 내비게이션' })).toBeVisible({ timeout: 15_000 });
});

test('🔴 이벤트 → 다른 탭 → 뒤로가기 — 주소와 화면이 같은 말을 한다', async ({ page }) => {
  await stubBoard(page);
  await page.goto('/?event=1');
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });

  // 판을 닫고 다른 탭으로 이동한다(탭 이동은 자체 히스토리 항목을 쌓는다).
  await page.locator(DIALOG).getByRole('button', { name: /닫기/ }).first().click();
  await expect(page.locator(DIALOG)).toBeHidden({ timeout: 15_000 });
  await page.getByRole('navigation', { name: '하단 내비게이션' })
    .getByRole('button', { name: /커뮤니티/ }).click();

  await page.goBack();
  // 어디로 돌아가든, **판이 닫혀 있으면 주소에 event 가 없어야 한다**(그 반대도 마찬가지).
  const open = await page.locator(DIALOG).isVisible();
  await expect(page, open
    ? '이벤트 판이 떠 있는데 주소에 event 가 없다 — 새로고침하면 사라진다'
    : '판은 닫혔는데 주소에 event 가 남았다 — 새로고침하면 혼자 열린다',
  ).toHaveURL((u) => hasEvent(u) === open);
});

test('🔴 새로고침 — 주소가 말하는 상태가 그대로 복원된다', async ({ page }) => {
  await stubBoard(page);
  await page.goto('/?event=1');
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.locator(DIALOG), '주소에 event 가 있는데 새로고침하니 판이 사라졌다 — 공유 링크가 깨진다')
    .toBeVisible({ timeout: 15_000 });
});
