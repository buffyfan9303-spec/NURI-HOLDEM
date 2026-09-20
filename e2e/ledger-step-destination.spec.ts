// '2. 장부' 와 '오늘 장부' 가 **오늘 보드**로 간다 — 목록도, 직전에 보던 다른 날짜도 아니다.
//
// 🔴 오너가 2026-09-07 에 이미 한 번 지적한 것이다:
//   "단계를 눌렀는데 장부 탭으로 간 게 아니다" → `VenueManageTab.onPick` 에
//   `date: ledgerSeed?.date ?? kstToday()` 폴백을 넣어 고쳤다.
//   **그런데 대시보드 경로에서만 그 수정이 무력화돼 있었다.**
//   `StoreDashboard` 의 `stepInfo.ledger.dest` 가 오늘 장부 미시작일 때 `date: undefined` 를 주는데,
//   객체 자체는 truthy 라 `if (fromDash) return onGotoStore(fromDash)` 가 **먼저 잡아채** 폴백을 건너뛰었다.
//
// 그 뒤가 더 나쁘다: 시드가 없으면 `goStep('ledger')` 이 `setLedgerSeed(null)` 만 하는데
// `NuriPosLedger` 의 시드 effect 는 `if (!seed) return` 이라 **아무것도 안 한다**.
// 내 매장은 keep-alive 라 직전에 보던 **다른 날짜 보드가 그대로 남는다** —
// '오늘 장부' 를 눌렀는데 지난달 숫자를 보게 된다. 이동 버그가 아니라 **수치 오인** 위험이다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

const RAIL = '[data-mystore-rail]';
const DATE = '[data-testid="ledger-date"]';
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

async function openStore(page: Page) {
  await bootOwner(page, { viewport: { width: 1440, height: 900 } });
  await openMyStore(page);
  await expect(page.locator('[data-tab="my-store"]'), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
}
const step = (page: Page, name: string) => page.locator(`${RAIL} [role=tab]`).filter({ hasText: name }).first();

test.describe("장부 목적지 — '오늘' 을 약속했으면 오늘로 간다", () => {
  test('🔴 대시보드에서 단계 바 「장부」를 처음 눌러도 오늘 보드로 간다(목록 아님)', async ({ page }) => {
    test.setTimeout(120_000);
    await openStore(page);
    // 요약(대시보드)에 있는 상태에서 누른다 — 이 경로가 깨져 있었다.
    await expect(step(page, '요약'), '요약 칸이 없다').toHaveCount(1);
    await step(page, '요약').click();
    await page.waitForTimeout(800);

    await step(page, '장부').click();
    await page.waitForTimeout(2500);

    await expect(page.locator(DATE),
      "대시보드에서 '장부' 를 눌렀는데 보드가 아니라 목록이 열렸다 — 오너가 2026-09-07 에 지적한 그 버그다")
      .toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(DATE), '보드는 열렸는데 오늘 날짜가 아니다').toHaveValue(kstToday());
  });

  test('🔴 다른 날짜 보드를 보다 요약으로 나갔다 「장부」로 돌아오면 **오늘**이다 (묵은 보드 금지)', async ({ page }) => {
    test.setTimeout(150_000);
    await openStore(page);
    await step(page, '장부').click();
    await page.waitForTimeout(2500);
    await expect(page.locator(DATE), '장부 보드가 안 열렸다 — 이 검사가 아무것도 재지 않았다').toHaveCount(1, { timeout: 15_000 });

    // 과거 날짜로 옮긴다 — 여기서 남는 상태가 문제의 씨앗이었다.
    const past = '2026-09-01';
    await page.locator(DATE).fill(past);
    await page.waitForTimeout(1500);
    await expect(page.locator(DATE)).toHaveValue(past);

    // 요약으로 나갔다가 다시 '장부'
    await step(page, '요약').click();
    await page.waitForTimeout(1200);
    await step(page, '장부').click();
    await page.waitForTimeout(2500);

    const now = await page.locator(DATE).inputValue().catch(() => '(보드 아님)');
    expect(now, `'장부' 로 돌아왔는데 ${now} 가 떴다 — 직전에 보던 날짜가 그대로 남아 오늘 숫자로 오인된다`)
      .toBe(kstToday());
  });

  test("🔴 KPI '오늘 장부' 밴드도 같은 계약이다", async ({ page }) => {
    test.setTimeout(150_000);
    await openStore(page);
    // 먼저 과거 보드를 만든다
    await step(page, '장부').click();
    await page.waitForTimeout(2500);
    await expect(page.locator(DATE)).toHaveCount(1, { timeout: 15_000 });
    await page.locator(DATE).fill('2026-09-01');
    await page.waitForTimeout(1200);
    await step(page, '요약').click();
    await page.waitForTimeout(1200);

    const band = page.getByRole('button', { name: /오늘 장부/ }).first();
    if (!(await band.count())) { console.log("'오늘 장부' KPI 밴드를 못 찾음 — BLOCKED(데이터/권한)"); test.skip(); }
    await band.click();
    await page.waitForTimeout(2500);
    const now = await page.locator(DATE).inputValue().catch(() => '(보드 아님)');
    expect(now, `'오늘 장부' 를 눌렀는데 ${now} 가 떴다`).toBe(kstToday());
  });
});
