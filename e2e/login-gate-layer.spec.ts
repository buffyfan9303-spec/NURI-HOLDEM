// FULL-ERROR-SWEEP-A(2026-09-25) 잔여 — 로그인 시트가 **어떤 모달 위에서 열려도 맨 위**에 온다.
//
// 결함: 장터 매물 상세(sheet Modal, z-[60])에서 비로그인으로 찜을 누르면 로그인 시트(같은 z-[60])가
//   App 의 DOM 앞순위라 매물 상세 **뒤에 깔렸다** — CTA 세로 중심열 히트 0/46(390·360 실측, 캡처 sweepA/like-gate-390.png).
//   post-login-gate 의 게시글 상세는 page 변형(z-[55])이라 우연히 통과했고, listing-login-resume 은
//   dialog **개수**만 세서 '뒤에 깔린 시트' 를 통과시켰다.
// 고침: Modal 원자의 `layer="gate"`(z-[65]) — 전역 이벤트로 아무 데서나 뜨는 게이트 시트(로그인·본인인증)가
//   콘텐츠 모달(60) 위, 확인창(70)·토스트(120) 아래에 놓인다. 매물 상세만 땜질하지 않는다.
//
// 잠그는 것 — post-login-gate 와 같은 자(elementFromPoint 로 CTA 세로 중심열 히트 비율 ≥ 0.9):
//   ① 🔴 장터 찜(sheet z-60 위) — 수정 전 0/46 FAIL → 후 PASS. 매물 상세는 닫히지 않는다(복귀 계약).
//   ② 🟢 일정 상세 Q&A '이 대회 후기 쓰기'(page z-55 위) — 양성 대조. 전에도 후에도 PASS 여야 한다(층을 올려도 page 경로가 안 깨진다).
//      (일정 상세의 찜은 promptLogin 이 아니라 안내 토스트만 띄운다 — 이 스펙의 대상이 아니다.)
//   ③ 🟢 장터 '판매자에게 연락' → '로그인 필요' 안내 → 로그인 — 안내창이 먼저 닫히는 종전 계약 유지.
// 비로그인 · 목킹 GET 만 — 운영 DB 에 쓰지 않는다(_fixtures 가드).
// 실행: E2E_BASE_URL=http://localhost:4510 npx playwright test e2e/login-gate-layer.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';
import { mockSchedules } from './_schedules';

const listingRow = {
  id: '11111111-1111-4111-8111-1111111111c3', title: '층 검사 매물 포커칩', category: 'chip', description: '테스트',
  price: 50_000, condition: 'A', status: 'on_sale', images: [], region: '서울', shipping_available: false, pickup_only: true,
  seller_id: '00000000-0000-4000-8000-0000000000e3', seller_name: '판매자', seller_avatar_color: '#5A6175',
  seller_trade_count: 0, seller_verified: false, created_at: new Date().toISOString(), view_count: 0, like_count: 0, comment_count: 0,
};
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

const authDialog = (p: Page) => p.locator('[role="dialog"]').filter({ has: p.locator('input[type="email"]') });
const listingDialog = (p: Page) => p.locator('[role="dialog"]').filter({ has: p.getByRole('button', { name: '판매자에게 연락' }) });

/** 로그인 시트의 'Google로 계속하기' 가 실제로 눌리는가 — 세로 중심열을 elementFromPoint 로 훑는다. */
async function measureCta(page: Page) {
  const cta = page.getByRole('button', { name: 'Google로 계속하기' });
  await expect(cta, '로그인 시트가 뜨지 않았다').toBeVisible({ timeout: 10_000 });
  // 진입 애니메이션이 끝난 자리에서 잰다(움직이는 중엔 프레임마다 rect 가 다르다)
  await page.waitForFunction(() => {
    return [...document.querySelectorAll('[role="dialog"]')]
      .every((el) => el.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
  }, undefined, { timeout: 5_000 });
  const m = await cta.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let hit = 0, rows = 0;
    for (let y = Math.floor(r.top); y < Math.ceil(r.bottom); y++) {
      rows++;
      const h = document.elementFromPoint(cx, y + 0.5);
      if (h && (h === el || el.contains(h))) hit++;
    }
    const center = document.elementFromPoint(cx, r.top + r.height / 2);
    const cover = center && !(center === el || el.contains(center))
      ? (center.closest('[role="dialog"]')?.getAttribute('aria-label') ?? center.tagName) : null;
    return { hit, rows, ratio: rows ? hit / rows : 0, cover };
  });
  expect(m.ratio, `CTA 세로 중심열 히트 ${m.hit}/${m.rows} — 덮은 것: ${m.cover ?? '없음'}`).toBeGreaterThanOrEqual(0.9);
  expect(m.cover, `CTA 중심을 '${m.cover}' 가 덮고 있다`).toBeNull();
}

async function openListing(page: Page, width: number) {
  test.setTimeout(90_000);
  await page.setViewportSize({ width, height: 844 });
  await page.route(/\/rest\/v1\/marketplace_listings\?/, (r) => r.fulfill(json([listingRow])));
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '장터', exact: true }).first().click({ timeout: 15_000 });
  await page.getByRole('button', { name: /층 검사 매물 포커칩/ }).first().click({ timeout: 15_000 });
  await expect(listingDialog(page)).toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(400);
}

for (const width of [390, 360]) {
  test(`🔴 ① ${width} 장터 찜(비로그인) — 로그인 시트가 매물 상세 위에 온다`, async ({ page }) => {
    await openListing(page, width);
    await page.getByRole('button', { name: '찜하기' }).click();
    await expect(authDialog(page), '로그인 모달이 뜨지 않았다').toHaveCount(1, { timeout: 10_000 });
    await measureCta(page);
    await expect(listingDialog(page), '로그인 유도가 매물 상세를 닫아 버렸다(복귀 불가)').toHaveCount(1);
  });
}

test('🟢 ② 390 일정 상세 후기 쓰기(비로그인, page 위) — 양성 대조: 층을 올려도 그대로 위에 온다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSchedules(page);
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  const card = page.locator('[data-tab="home"] article').first();
  await expect(card, '홈에 일정 카드가 0건 — 목킹이 안 먹혔다').toBeVisible({ timeout: 15_000 });
  await card.click();
  const detail = page.locator('[role="dialog"][aria-label="전체화면 보기"]');
  await expect(detail).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await detail.getByRole('tab', { name: 'Q&A' }).first().click();
  await detail.getByRole('button', { name: /이 대회 후기 쓰기/ }).first().click();
  await expect(authDialog(page), '로그인 모달이 뜨지 않았다').toHaveCount(1, { timeout: 10_000 });
  await measureCta(page);
  await expect(detail, '로그인 유도가 일정 상세를 닫아 버렸다').toHaveCount(1);
});

test('🟢 ③ 390 장터 "판매자에게 연락" → 로그인 필요 안내 → 로그인 — 안내창은 닫히고 시트는 위에 온다', async ({ page }) => {
  await openListing(page, 390);
  await page.getByRole('button', { name: '판매자에게 연락' }).click();
  const gate = page.locator('[role="dialog"]').filter({ hasText: '채팅은 로그인 후 이용 가능합니다' }).last();
  await expect(gate).toBeVisible({ timeout: 10_000 });
  await gate.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(authDialog(page), '로그인 모달이 뜨지 않았다').toHaveCount(1, { timeout: 10_000 });
  await expect(gate, '채팅 안내 모달이 로그인 모달 뒤에 남았다').toHaveCount(0);
  await measureCta(page);
  await expect(listingDialog(page), '매물 상세가 닫혔다').toHaveCount(1);
});
