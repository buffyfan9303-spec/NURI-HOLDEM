// 장터 매물 — 비로그인 손님의 '판매자에게 연락'·찜은 로그인 모달로 유도하고, 매물 상세는 그대로 남는다.
//
// 왜: 예전엔 '로그인 필요 · 닫기'만 띄우고 찜은 토스트만 내서, 손님이 헤더까지 가서 로그인하고
//   매물을 다시 찾아야 했다. 다른 쓰기 진입점(댓글·예약·체크인)은 promptLogin 으로 로그인 모달을 띄우고
//   열려 있던 상세로 돌아온다 — 장터만 그 흐름에서 빠져 있었다(F05).
// 잠그는 것: ① 버튼 한 번 → 로그인 모달(이메일 입력칸을 가진 다이얼로그) ② 매물 상세는 닫히지 않는다.
// 비로그인 스모크 — 운영 DB 에는 쓰지 않는다(목록은 page.route, 조회수 RPC 는 _fixtures 가드가 끊는다).
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const listingRow = {
  id: '11111111-1111-4111-8111-1111111111c2', title: '테스트 매물 포커테이블', category: 'table', description: '테스트',
  price: 300_000, condition: 'B', status: 'on_sale', images: [], region: '서울', shipping_available: false, pickup_only: true,
  seller_id: '00000000-0000-4000-8000-0000000000e2', seller_name: '판매자', seller_avatar_color: '#5A6175',
  seller_trade_count: 0, seller_verified: false, created_at: new Date().toISOString(), view_count: 0, like_count: 0, comment_count: 0,
};
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** 로그인 모달(이메일 입력칸을 가진 다이얼로그) — backstack.spec 과 같은 로케이터 */
const authDialog = (p: Page) => p.locator('[role="dialog"]').filter({ has: p.locator('input[type="email"]') });
/** 매물 상세 — 하단 CTA '판매자에게 연락'을 가진 다이얼로그 */
const listingDialog = (p: Page) => p.locator('[role="dialog"]').filter({ has: p.getByRole('button', { name: '판매자에게 연락' }) });

async function openListing(page: Page) {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route(/\/rest\/v1\/marketplace_listings\?/, (r) => r.fulfill(json([listingRow])));
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '장터', exact: true }).first().click({ timeout: 15_000 });
  await page.getByRole('button', { name: /테스트 매물 포커테이블/ }).first().click({ timeout: 15_000 });
  await expect(listingDialog(page)).toHaveCount(1, { timeout: 15_000 });
}

test('🔴 비로그인 "판매자에게 연락" — 로그인 모달로 이어지고 매물 상세는 남는다', async ({ page }) => {
  await openListing(page);
  await page.getByRole('button', { name: '판매자에게 연락' }).click();
  // Modal 원자는 포털이 아니라 인라인이라 채팅 안내 모달이 매물 상세 dialog **안에** 중첩된다 —
  // hasText 필터는 바깥 상세까지 잡으므로 가장 안쪽(last)을 집는다.
  const gate = page.locator('[role="dialog"]').filter({ hasText: '채팅은 로그인 후 이용 가능합니다' }).last();
  await expect(gate).toBeVisible({ timeout: 10_000 });
  await gate.getByRole('button', { name: '로그인', exact: true }).click();

  await expect(authDialog(page), '로그인 모달이 뜨지 않았다').toHaveCount(1, { timeout: 10_000 });
  await expect(gate, '채팅 안내 모달이 로그인 모달 뒤에 남았다').toHaveCount(0);
  await expect(listingDialog(page), '로그인 유도가 매물 상세를 닫아 버렸다(복귀 불가)').toHaveCount(1);
});

test('🔴 비로그인 찜 — 토스트만이 아니라 로그인 모달로 이어진다', async ({ page }) => {
  await openListing(page);
  await page.getByRole('button', { name: '찜하기' }).click();
  await expect(authDialog(page), '로그인 모달이 뜨지 않았다').toHaveCount(1, { timeout: 10_000 });
  await expect(listingDialog(page), '매물 상세가 닫혔다').toHaveCount(1);
});
