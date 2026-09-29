// #12(2026-09-29) 외치기 가격표(shop_skus) 조회 실패 — 시트가 가격표 높이만큼 줄어들던 것.
//
// 예전: 실패하면 자리표시를 걷고 가격표 자리를 통째로 비웠다 → 시트 윗변이 내려앉았다(정상 대비 약 −210px 보고).
// 지금: 자리표시와 같은 틀(같은 높이)에 '가격표를 불러오지 못했어요 · 다시 불러오기' 를 겹친다.
//   정상 경로(가격표 도착)의 시트 크기는 그대로다 — 그래서 fillHeight(늘 88vh) 같은 시트 전체 변경은 쓰지 않았다.
// 운영 DB 에 쓰지 않는다(외치기 조회 5종을 가로챈다 · 구매는 누르지 않는다).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner } from './_mockOwner';
import { dismissOverlays } from './_session';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
// 운영 모양 — 외치기 활성 4등급(2열 2줄 · 2026-09-29 실측)
const SKUS = [
  { key: 'shout_basic', kind: 'shout', label: '외치기', descr: '20초 1회 방송 · 대기열 순서대로', price: 50, duration_hours: 0, duration_seconds: 20, tier_rank: 1, sort: 1 },
  { key: 'shout_gold', kind: 'shout', label: '하이라이트', descr: '20초 1회 방송 · 색을 골라 눈에 띄게', price: 150, duration_hours: 0, duration_seconds: 20, tier_rank: 2, sort: 2 },
  { key: 'shout_long', kind: 'shout', label: '롱', descr: '40초 1회 방송', price: 250, duration_hours: 0, duration_seconds: 40, tier_rank: 3, sort: 3 },
  { key: 'shout_reserve', kind: 'shout', label: '예약', descr: '고른 시각에 20초 방송', price: 200, duration_hours: 0, duration_seconds: 20, tier_rank: 4, sort: 4 },
];

async function openComposer(page: Page, skus: { fail: boolean }) {
  await bootOwner(page, {
    viewport: { width: 390, height: 844 },
    goto: false,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/community_shouts/, (r: Route) => r.fulfill(json([])));
      await p.route(/\/rest\/v1\/shop_skus/, (r: Route) => (skus.fail ? r.fulfill(json({ message: 'boom' }, 500)) : r.fulfill(json(SKUS))));
      await p.route(/\/rest\/v1\/rpc\/shout_rules/, (r: Route) => r.fulfill(json([{ cost: 50, cooldown_minutes: 10, daily_cap: 3, max_len: 60, min_len: 2, ttl_hours: 0 }])));
      await p.route(/\/rest\/v1\/rpc\/my_point_balance/, (r: Route) => r.fulfill(json([{ total: 9000, spent: 100, available: 8900 }])));
      await p.route(/\/rest\/v1\/rpc\/shout_queue_info/, (r: Route) => r.fulfill(json([{ next_free_at: null, waiting: 0 }])));
    },
  });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await page.getByTestId('shout-idle').getByRole('button', { name: /외치기/ }).click();
  const sheet = page.getByRole('dialog', { name: '외치기' });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  return sheet;
}

/** 시트 높이 — 진입 애니메이션이 끝나 두 번 연속 같은 값이 나올 때까지 */
async function settledHeight(page: Page) {
  let prev = -1;
  for (let i = 0; i < 40; i++) {
    const h = await page.getByRole('dialog', { name: '외치기' }).evaluate((el) => el.getBoundingClientRect().height);
    if (Math.abs(h - prev) < 0.5) return h;
    prev = h;
    await page.waitForTimeout(120);
  }
  return prev;
}

test('🔴 가격표 조회 실패 — 시트 높이는 정상과 같고, 안내와 다시 불러오기가 그 자리에 선다', async ({ page }) => {
  // 정상 경로 기준값 — 같은 컨텍스트(쓰기 차단 가드 공유)의 다른 탭, 같은 뷰포트
  const okPage = await page.context().newPage();
  const okSheet = await openComposer(okPage, { fail: false });
  await expect(okSheet.getByRole('button', { name: /하이라이트/ })).toBeVisible();
  const okH = await settledHeight(okPage);
  await okPage.close();

  const skus = { fail: true };
  const sheet = await openComposer(page, skus);
  const alert = sheet.getByTestId('shout-tiers-error');
  await expect(alert, '가격표 실패를 알리지 않는다').toBeVisible({ timeout: 10_000 });
  const failH = await settledHeight(page);
  expect(Math.abs(failH - okH), `실패 시트 ${failH}px vs 정상 ${okH}px — 시트가 줄었다`).toBeLessThan(1);

  // 다시 불러오기 → 가격표가 돌아온다(높이 그대로)
  skus.fail = false;
  await alert.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(sheet.getByRole('button', { name: /하이라이트/ })).toBeVisible({ timeout: 10_000 });
  await expect(alert).toHaveCount(0);
  const backH = await settledHeight(page);
  expect(Math.abs(backH - okH)).toBeLessThan(1);
});
