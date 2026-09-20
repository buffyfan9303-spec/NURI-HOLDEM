// 이용권 **발급** 권한이 서버와 같은 선을 긋는다 (2026-09-20 · E2-E/F)
//
// 🔴 무엇이 문제였나 — 두 곳이 **반대 방향으로** 틀려 있었다.
//   ① 너무 넓음: `caps.voucher = idOn && (manageOk || voucherView)` 하나로 카드 노출과 **발급 액션**을
//      둘 다 게이트했다. 그래서 이용권 **열람권만** 가진 직원에게 출석 명단의 '이용권 보내기' 와
//      CRM 보내기가 보였고, 누르면 서버가 거절했다 — 누를 수 있는 척하는 죽은 버튼.
//   ② 너무 좁음: `VoucherManageModal` 은 `user.role === 'venue_owner' && user.venueId === venueId` 로
//      **클라이언트 역할**을 직접 판정했다. 서버는 그보다 넓다.
//
// 서버 정본(라이브 `pg_proc` 직접 조회, 2026-09-20):
//   issue_voucher 첫 줄 = `if not can_manage_pos(p_venue_id) then raise exception ...`
//   can_manage_pos = admin ∪ venues.owner_id ∪ venue_owners(status='approved')  ← **승인 공동운영자 포함**
// 오너 결정(2026-09-20): "공동운영자에게 발급 줘. UI도 이에 맞춰서." → UI 를 서버에 맞춘다.
//
// ⚠ 이 스펙은 **화면 게이트**만 잰다. 목킹 세션의 권한은 하네스가 하드코딩한 boolean 이라
//   여기 통과를 'RLS·서버 인가가 옳다' 의 근거로 쓰면 안 된다. 서버 판정은 언제나 issue_voucher 다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

const IDENTITY_ON = { identity_voucher_enabled: 'on' };
const RAIL = '[data-mystore-rail]';

/** 이용권 판으로 들어가 발급 섹션이 보이는지 본다. */
async function openVoucherPane(page: Page) {
  await openMyStore(page);
  await expect(page.locator('[data-tab="my-store"]'), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  // 🔴 S1(2026-09-20) 이후 이용권 진입점은 **두 벌**이다 — 모바일 탭(`lg:hidden`)과 PC 우측 버튼
  //   (`hidden lg:inline-flex`). breakpoint 로 한쪽이 `display:none` 이라 `.first()` 로 잡으면
  //   PC(1440)에서 **숨은 모바일 탭**을 집어 "element is not visible" 로 120초 타임아웃이 났다(실측).
  //   → 지금 화면에서 **실제로 보이는** 것만 고른다. 보이는 것이 2개면 그것도 결함이므로 실패시킨다.
  const all = page.locator(`${RAIL} button`).filter({ hasText: '이용권' });
  const n = await all.count();
  if (n === 0) return false;
  const visible = all.filter({ visible: true });
  const vn = await visible.count();
  expect(vn, `이용권 진입점이 화면에 ${vn}개 보인다 — breakpoint 로 정확히 하나여야 한다`).toBe(1);
  await visible.first().click();
  await page.waitForTimeout(2000);
  return true;
}

const issueSection = (page: Page) => page.getByRole('button', { name: /매장이용권 발급/ });

test.describe('이용권 발급 권한 — 서버 can_manage_pos 와 같은 선', () => {
  test('🔴 발급 권한(can_manage_pos)이 있으면 발급 섹션이 보인다 — 공동운영자 포함 (양성 대조)', async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, appSettings: IDENTITY_ON });
    const opened = await openVoucherPane(page);
    expect(opened, '이용권 칸이 없다 — 이 검사가 아무것도 재지 않았다').toBe(true);
    await expect(issueSection(page),
      '발급 권한이 있는데 발급 섹션이 없다 — 서버는 허용하는데 화면이 막았다').toBeVisible({ timeout: 15_000 });
  });

  test('🔴 열람권만 있으면 발급 섹션이 안 보인다 — 죽은 버튼을 그리지 않는다', async ({ page }) => {
    test.setTimeout(120_000);
    // can_manage_pos=false(발급 불가) + can_view_vouchers=true(열람만) — 권한 직원 프로필.
    await bootOwner(page, {
      viewport: { width: 1440, height: 900 },
      appSettings: IDENTITY_ON,
      perms: { can_manage_pos: false, can_view_vouchers: true },
      // ⚠ role 은 'venue_staff' 여야 한다. 'user' 로 두면 **'내 매장' 탭 자체가 안 뜬다** —
      //   탭 노출은 AuthContext 의 role 문자열로 게이트돼 서버 권한과 무관하다(2026-09-20 조사 E2EF-3).
      //   그 상태로 검사하면 '발급 섹션이 없다' 가 아무것도 안 잰 초록이 된다.
      profile: { role: 'venue_staff' },
    });
    const opened = await openVoucherPane(page);
    // 열람권이 있으면 이용권 칸 자체는 보여야 한다(목록은 볼 수 있다).
    expect(opened, '열람권이 있는데 이용권 칸이 통째로 사라졌다 — 열람까지 막은 것이다').toBe(true);
    await expect(issueSection(page),
      '열람권만 있는데 발급 섹션이 보인다 — 누르면 서버가 거절하는 죽은 버튼이다').toHaveCount(0);
  });

  test('🔴 킬스위치가 꺼져 있으면 이용권 칸 자체가 없다', async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, appSettings: {} });
    await openMyStore(page);
    await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator(`${RAIL} button`).filter({ hasText: '이용권' }),
      '킬스위치가 꺼졌는데 이용권 칸이 보인다').toHaveCount(0);
  });

  test('🔴 고지 문구가 서버 권한과 같은 범위를 말한다', async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, appSettings: IDENTITY_ON });
    const opened = await openVoucherPane(page);
    expect(opened).toBe(true);
    // 종전 '업주 전용' 배지는 서버(공동운영자 포함)와 어긋난 문구였다.
    await expect(page.getByText('발급 · 업주 전용', { exact: false }),
      "'업주 전용' 배지가 남아 있다 — 서버는 승인 공동운영자도 허용한다").toHaveCount(0);
    await expect(page.getByText(/업주\s*·\s*공동운영자/).first(),
      '발급 범위를 말하는 배지가 없다').toBeVisible({ timeout: 15_000 });
  });
});
