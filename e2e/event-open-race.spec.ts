// UP-01(2026-10-08) — 카드 열기 요청 중의 경합. 운영 카드를 열지 않는다: open_event_card 를 **지연 목**으로 붙든다.
//
// 결함(origin/main 20d43f6c): 요청 중에도 '다른 카드' 가 눌려 시트가 닫혔고(closeSheet 가 pick/result 를 비움),
//   늦게 온 성공 응답은 그릴 시트가 없어 사라졌다 — 서버는 이미 참여권을 쓰고 경품을 지급했는데 화면은 아무 말이 없다.
//   그 상태에서 B 를 고르면 A 의 응답이 B 시트에 그려져 **A 의 경품이 B 번호로** 보였다.
// 계약: ① 요청 중엔 시트를 닫지 못한다 ② 판이 닫혀도 결과를 '<번호>번 카드 결과' 로 알린다 ③ 더블 클릭에도 RPC 1회.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner } from './_mockOwner';
import { MOCK_EVENT_SLUG, mockEventBoard, mockEventCampaigns } from './_mocks';

const DIALOG = '[role="dialog"][aria-label="이벤트"]';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** 로그인 + 참여권 3장 보드 + 손으로 풀어 주는 open_event_card. */
async function setup(page: Page) {
  const held: Route[] = [];
  await bootOwner(page, {
    viewport: { width: 390, height: 844 }, goto: false,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/event_campaigns\?/, (r) => r.fulfill(json(mockEventCampaigns())));
      await p.route(/\/rest\/v1\/rpc\/event_board/, (r) => r.fulfill(json({ ...mockEventBoard(12), myTickets: 3 })));
      await p.route(/\/rest\/v1\/rpc\/open_event_card/, (r) => { held.push(r); });
    },
  });
  await page.goto(`/?event=${MOCK_EVENT_SLUG}`);
  const dlg = page.locator(DIALOG);
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  const release = (i: number, idx: number) =>
    held[i].fulfill(json({ idx, tier: 1, voucherCount: 3, voucherTitle: '매장이용권' }));
  return { held, dlg, release };
}

test('🔴 요청 중 \'다른 카드\' 는 시트를 닫지 못하고, 늦은 결과는 그 카드 시트에 그려진다', async ({ page }) => {
  const { held, dlg, release } = await setup(page);
  await dlg.getByRole('button', { name: '1번 카드 열기', exact: true }).click();
  await page.getByTestId('event-sheet-open').click();
  await expect.poll(() => held.length).toBe(1);

  // 요청 중 닫기 시도 — DOM click 은 disabled 버튼에 아무 일도 하지 않는다(버튼이 살아 있으면 시트가 닫힌다).
  await page.getByTestId('event-sheet-cancel').evaluate((b: HTMLButtonElement) => b.click());
  await expect(page.getByText('1번 카드를 여시겠습니까?'), '요청 중에 시트가 닫혔다 — 늦은 결과를 볼 곳이 사라진다').toBeVisible();

  await release(0, 1);
  await expect(page.getByText('지갑에 바로 들어갔습니다'), '서버가 확정한 결과가 화면에 안 나왔다').toBeVisible({ timeout: 5_000 });
});

test('🔴 요청 중 판을 닫아도 결과를 \'n번 카드 결과\' 로 알린다', async ({ page }) => {
  const { held, dlg, release } = await setup(page);
  await dlg.getByRole('button', { name: '4번 카드 열기', exact: true }).click();
  await page.getByTestId('event-sheet-open').click();
  await expect.poll(() => held.length).toBe(1);

  await page.goBack();
  await expect(dlg).toBeHidden({ timeout: 15_000 });
  await release(0, 4);
  await expect(page.getByText(/4번 카드 결과: 1등 당첨/), '판을 닫은 사이 확정된 당첨이 아무 안내 없이 사라졌다').toBeVisible({ timeout: 5_000 });
});

test('🔴 \'찢기\' 더블 클릭 — open_event_card 는 1회만 나간다', async ({ page }) => {
  const { held, dlg, release } = await setup(page);
  await dlg.getByRole('button', { name: '2번 카드 열기', exact: true }).click();
  // 같은 틱 두 번 — 렌더 사이 간격 없이 DOM click 두 번(사람 손가락보다 가혹한 조건).
  await page.getByTestId('event-sheet-open').evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect.poll(() => held.length).toBe(1);
  await page.waitForTimeout(300);
  expect(held.length, '찢기 더블 클릭이 카드 열기를 두 번 보냈다').toBe(1);
  await release(0, 2);
  await expect(page.getByText('지갑에 바로 들어갔습니다')).toBeVisible({ timeout: 5_000 });
});
