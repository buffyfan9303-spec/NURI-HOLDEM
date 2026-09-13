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
import { test, expect } from './_fixtures';

const EVENT_RPC = /\/rest\/v1\/rpc\/event_board/;
const DIALOG = '[role="dialog"][aria-label="이벤트"]';
const MENU = 'home-event-menu';

/** 이벤트 유무와 무관하게 돌도록 보드를 고정한다 — 이 스펙의 관심사는 히스토리다. */
async function stubBoard(page: import('@playwright/test').Page) {
  await page.route(EVENT_RPC, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
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

test('🔴 홈에서 열고 뒤로가기 — 홈으로 돌아오고 주소가 깨끗하다', async ({ page }) => {
  await stubBoard(page);
  await page.goto('/');
  await page.getByTestId(MENU).click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });
  await expect(page, '판을 열었는데 주소에 event 가 없다 — 이 상태는 공유·새로고침으로 재현되지 않는다')
    .toHaveURL((u) => hasEvent(u));

  await page.goBack();
  await expect(page.locator(DIALOG)).toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL((u) => !hasEvent(u));
});

test('🔴 X 로 닫은 뒤 뒤로가기 — 지워진 event 가 되살아나지 않는다', async ({ page }) => {
  // 구현 중 실제로 터졌던 경로다: X 는 history.back() 을 쓰는데 주소 정리는 replaceState 였다.
  await stubBoard(page);
  await page.goto('/');
  await page.getByTestId(MENU).click();
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

test('🔴 뒤로가기 연타 — 판이 남거나 주소만 남는 중간 상태가 없다', async ({ page }) => {
  await stubBoard(page);
  await page.goto('/');
  await page.getByTestId(MENU).click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 15_000 });

  // 두 번을 기다리지 않고 던진다 — 한 틱 뒤 재동기화가 경합에서도 수렴하는지 본다.
  await Promise.all([page.goBack(), page.goBack().catch(() => {})]);

  await expect(page.locator(DIALOG)).toBeHidden({ timeout: 15_000 });
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
