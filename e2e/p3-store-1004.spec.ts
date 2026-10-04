// 4회차 점검 P3 묶음(store-team, 2026-10-04) — 가짜 서버·운영 쓰기 0.
//  ① FN4-01: 모바일 내 매장 › 매장 설정 › 매장 페이지 '+ 시즌 시작' 종료 날짜 칸이 화면 밖으로 잘림(390 에서 right=418).
//  ② 직원 모바일 문구 "왼쪽 메뉴의 출근 관리" — 모바일엔 왼쪽 메뉴가 없다('전체 메뉴' 안). PC 는 그대로.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

const NONE = { can_access_ledger: false, can_manage_pos: false, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false };

async function openMenu(page: Page) {
  const grid = page.locator('[data-tab="my-store"] [data-main-enter] .grid').first();
  await expect(async () => {
    if (!(await grid.isVisible())) await page.getByTestId('mystore-menu-toggle').click();
    await expect(grid).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

for (const w of [390, 360, 320]) {
  test(`시즌 시작 폼 @${w}: 시작·종료 날짜 칸이 둘 다 화면 안`, async ({ page }) => {
    await bootOwner(page, { viewport: { width: w, height: 900 } });
    await openMyStore(page);
    await openMenu(page);
    await page.locator('[data-tab="my-store"] [data-main-enter] .grid').getByRole('button', { name: '매장 설정', exact: true }).click();
    await page.getByRole('tab', { name: '매장 페이지', exact: true }).click(); // 설정의 첫 하위탭 — 이미 선택돼 있어도 안전
    const start = page.getByRole('button', { name: '+ 시즌 시작' });
    await start.scrollIntoViewIfNeeded({ timeout: 20_000 });
    await start.click();
    const dates = page.locator('section').filter({ has: page.getByRole('heading', { name: '시즌 리그' }) }).locator('input[type="date"]');
    await expect(dates).toHaveCount(2, { timeout: 15_000 });
    const rects = await dates.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; }));
    console.log(`[시즌 폼 @${w}]`, JSON.stringify(rects), 'innerWidth', await page.evaluate(() => window.innerWidth));
    for (const [i, r] of rects.entries()) {
      expect(r.l, `날짜 칸 ${i} 왼쪽이 화면 밖`).toBeGreaterThanOrEqual(0);
      expect(r.r, `날짜 칸 ${i} 오른쪽(${r.r})이 화면 폭(${w}) 밖으로 잘림`).toBeLessThanOrEqual(w);
    }
  });
}

for (const w of [390, 1440]) {
  test(`직원 '내 스케줄·출퇴근' 안내 문구 @${w}: 폭에 맞는 메뉴 이름`, async ({ page }) => {
    await bootOwner(page, { viewport: { width: w, height: 900 }, profile: { role: 'venue_staff' }, perms: NONE });
    await openMyStore(page);
    const card = page.locator('[data-tab="my-store"] div').filter({ has: page.getByText('내 스케줄·출퇴근', { exact: true }) }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const text = await card.evaluate((e) => (e as HTMLElement).innerText);
    console.log(`[직원 문구 @${w}]`, JSON.stringify(text));
    if (w >= 1024) expect(text).toContain('왼쪽 메뉴');
    else { expect(text).not.toContain('왼쪽 메뉴'); expect(text).toContain('전체 메뉴'); }
    expect(text).toContain('출근 관리');
  });
}
