// 권한별 내 매장 메뉴 — 관리자(마스터) 계정에도 **직원 쪽 탭**(출근 관리·직원 관리)이 보이고,
// 그 이동이 다른 하위 탭과 같은 단일 전환 장치(goSubTab → handOffSubPanel → html[data-tab-swap])를 탄다.
//
// 오너 2026-09-28: "마스터 계정에 직원 탭 보이게 + 그 이동도 부드러운 모션".
//   판정은 role 기준이다(이메일 하드코딩 없음). 서버 판정: can_manage_venue_staff = admin ∪ 대표 업주 ∪ 승인 공동운영자
//   (20260926c), get_my_venue_staff 는 can_manage_pos 로 거른다 — 관리자는 둘 다 통과한다.
//
// ⚠ 이 스펙은 **화면 게이트**만 잰다. 목킹 세션의 권한은 하네스의 boolean 이라 서버 인가의 근거가 아니다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_UID, MOCK_VENUE } from './_mockOwner';

const ALL = { can_access_ledger: true, can_manage_pos: true, can_view_vouchers: true, can_manage_venue_staff: true, can_manage_venue_schedules: true };
const NONE = { can_access_ledger: false, can_manage_pos: false, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false };

/** 지금 폭에서 보이는 내 매장 메뉴 라벨 — PC 는 사이드바, 모바일은 '전체 메뉴' 를 펼친 목록. */
async function navLabels(page: Page, pc: boolean): Promise<string[]> {
  await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
  if (pc) {
    const bar = page.locator('[data-mystore-secbar]');
    await expect(bar.getByRole('button').first()).toBeVisible({ timeout: 20_000 });
    return (await bar.getByRole('button').allInnerTexts()).map((s) => s.trim());
  }
  await openMenu(page);
  return (await page.locator('[data-tab="my-store"] [data-main-enter] .grid button').allInnerTexts()).map((s) => s.trim());
}

/** 모바일 '전체 메뉴' 를 펼친다. 첫 부팅 직후엔 판이 한 번 다시 그려져 펼침 상태가 날아갈 수 있어(실측 24회 중 1회)
 *  '펼쳐질 때까지' 누른다 — 펼친 목록이 보이는 것 자체가 단언이다. */
async function openMenu(page: Page) {
  const grid = page.locator('[data-tab="my-store"] [data-main-enter] .grid').first();
  await expect(async () => {
    if (!(await grid.isVisible())) await page.getByTestId('mystore-menu-toggle').click();
    await expect(grid).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

for (const w of [1280, 390, 360]) {
  const pc = w >= 1024;
  test.describe(`내 매장 권한별 메뉴 @${w}`, () => {
    test('관리자(role=admin): 출근 관리·직원 관리가 보이고, 이동은 하위 탭 전환 장치를 탄다', async ({ page }) => {
      await bootOwner(page, { viewport: { width: w, height: 900 }, profile: { role: 'admin', venue_id: null }, perms: ALL });
      await openMyStore(page);
      const labels = await navLabels(page, pc);
      expect(labels, '관리자 메뉴에 직원 쪽 탭이 없다').toEqual(expect.arrayContaining(['출근 관리', '직원 관리']));

      for (const [label, pane] of [['직원 관리', 'staff'], ['출근 관리', 'attendance']] as const) {
        const grid = page.locator('[data-tab="my-store"] [data-main-enter] .grid');
        if (!pc) await openMenu(page);
        // html[data-tab-swap] 은 handOffSubPanel(goSubTab 의 유일한 입구)이 판 교체 동안만 켠다 — 다른 경로로 바뀌면 안 켜진다.
        await page.evaluate(() => {
          const g = window as unknown as { __swap: boolean; __mo?: MutationObserver };
          g.__swap = false;
          g.__mo?.disconnect();
          g.__mo = new MutationObserver(() => { if (document.documentElement.hasAttribute('data-tab-swap')) g.__swap = true; });
          g.__mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tab-swap'] });
        });
        const scope = pc ? page.locator('[data-mystore-secbar]') : grid;
        await scope.getByRole('button', { name: label, exact: true }).click();
        await expect(page.locator(`[data-pane="${pane}"]`), `${label} 판이 안 열렸다`).toBeVisible({ timeout: 15_000 });
        expect(await page.evaluate(() => (window as unknown as { __swap: boolean }).__swap),
          `${label} 이동이 하위 탭 전환 장치(data-tab-swap)를 타지 않았다`).toBe(true);
      }
    });

    test('관리자: 출근 관리 = 직원 화면 미리보기(내 근무 정보 + 출퇴근) · 쓰기 버튼 없음', async ({ page }) => {
      // 관리자 이름(목킹 '업주')으로 오늘 배정이 있어도 — 직원 본인이 아니므로 출퇴근을 남길 수 없어야 한다.
      await bootOwner(page, {
        viewport: { width: w, height: 900 }, profile: { role: 'admin', venue_id: null }, perms: ALL,
        extra: async (p) => {
          await p.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET'
            ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ work_date: MOCK_DAY, staff_name: '업주', start_hm: '18:00', check_in: null, check_out: null, confirmed: true }]) })
            : r.fallback()));
        },
      });
      await openMyStore(page);
      await navLabels(page, pc);
      const scope = pc ? page.locator('[data-mystore-secbar]') : page.locator('[data-tab="my-store"] [data-main-enter] .grid');
      await scope.getByRole('button', { name: '출근 관리', exact: true }).click();
      const pane = page.locator('[data-pane="attendance"]');
      await expect(pane.getByText('내 근무 정보'), '관리자에게 직원 본인 화면(내 근무 정보)이 없다').toBeVisible({ timeout: 15_000 });
      await expect(pane.getByText(/직원 화면 미리보기/)).toBeVisible();
      await expect(pane.getByText(/\(오늘\)/), '오늘 배정 행이 안 그려졌다(픽스처 무효)').toBeVisible();
      await expect(pane.getByRole('button', { name: /지금 (출근|퇴근)/ }), '관리자에게 출퇴근 쓰기 버튼이 보인다').toHaveCount(0);
      await expect(pane.locator('input[type="time"]').first()).toBeDisabled();
      await expect(pane.getByTestId('shift-locked-note')).toContainText('관리자 계정은 보기만');
    });

    test('스케줄 위임 직원(can_manage_schedule 만 참): 출근 스케줄 문이 열리고 스케줄만 보인다', async ({ page }) => {
      await bootOwner(page, {
        viewport: { width: w, height: 900 }, profile: { role: 'venue_staff' }, perms: NONE,
        extra: async (p) => { await p.route(/\/rest\/v1\/rpc\/can_manage_schedule($|\?)/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: 'true' })); },
      });
      await openMyStore(page);
      await navLabels(page, pc);
      const scope = pc ? page.locator('[data-mystore-secbar]') : page.locator('[data-tab="my-store"] [data-main-enter] .grid');
      // 권한 판정(RPC)은 첫 그림 뒤에 도착한다 — 문이 생길 때까지 기다린다.
      const door = scope.getByRole('button', { name: '출근 스케줄', exact: true });
      await expect(door, '스케줄 위임 직원에게 스케줄로 가는 문이 없다').toBeVisible({ timeout: 15_000 });
      expect((await scope.getByRole('button').allInnerTexts()).map((t) => t.trim())).not.toContain('직원 관리');
      await door.click();
      const pane = page.locator('[data-pane="staff"]');
      await expect(pane).toBeVisible({ timeout: 15_000 });
      await expect(pane.getByText('구성원 목록')).toHaveCount(0);
      await expect(pane.getByText('인건비 관리', { exact: false })).toHaveCount(0);
    });

    test('일반 직원(role=venue_staff, 권한 0): 출근 관리는 보이고 직원 관리·매장 설정은 없다', async ({ page }) => {
      await bootOwner(page, { viewport: { width: w, height: 900 }, profile: { role: 'venue_staff' }, perms: NONE });
      await openMyStore(page);
      const labels = await navLabels(page, pc);
      expect(labels).toContain('출근 관리');
      expect(labels).not.toContain('직원 관리');
      expect(labels).not.toContain('매장 설정');
    });
  });
}

test('공동운영자(대표 아님): 카카오 링크 칸은 읽기 전용 — venues_update(대표·관리자)와 같은 선', async ({ page }) => {
  await bootOwner(page, {
    viewport: { width: 1280, height: 900 }, perms: ALL,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/list_venue_owners/, (r) => r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ user_id: 'aaaaaaaa-0000-4000-8000-000000000001', nickname: '대표', name: '대표', is_primary: true, status: 'approved' },
          { user_id: MOCK_UID, nickname: '업주', name: '업주', is_primary: false, status: 'approved' }]) }));
    },
  });
  await openMyStore(page);
  await page.locator('[data-mystore-secbar]').getByRole('button', { name: '매장 설정', exact: true }).click();
  const kakao = page.locator('[data-pane="page"] input[placeholder^="https://open.kakao.com"]');
  await expect(kakao).toBeVisible({ timeout: 15_000 });
  await expect(kakao, '대표가 아닌 공동운영자가 카카오 링크를 고칠 수 있다(저장 시 부분 저장)').toHaveAttribute('readonly', '');
  await expect(page.locator('[data-pane="page"]').getByText('카카오톡 링크는 대표 업주만 바꿀 수 있어요.')).toBeVisible();
});

test('대표 업주: 카카오 링크 칸은 그대로 편집 가능(양성 대조)', async ({ page }) => {
  await bootOwner(page, { viewport: { width: 1280, height: 900 }, perms: ALL });
  await openMyStore(page);
  await page.locator('[data-mystore-secbar]').getByRole('button', { name: '매장 설정', exact: true }).click();
  const kakao = page.locator('[data-pane="page"] input[placeholder^="https://open.kakao.com"]');
  await expect(kakao).toBeVisible({ timeout: 15_000 });
  await expect(kakao).not.toHaveAttribute('readonly', '');
});

// ⑥ 매장 전환기(오너 2026-09-28) — 두 매장에 속한 사람은 상단에서 고른다. 늦게 온 이전 매장 응답이 새 매장 화면에 섞이면 안 된다.
const VENUE_B = '44444444-4444-4444-8444-444444444444';
const MEMBER = [{ id: MOCK_VENUE, name: '테스트 홀덤펍', relation: 'owner' }, { id: VENUE_B, name: '둘째 매장', relation: 'coowner' }];
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

for (const w of [1280, 390]) {
  test(`매장 전환기 @${w}: 두 매장 소속이면 고를 수 있고, A 의 늦은 권한 응답이 B 화면에 섞이지 않는다`, async ({ page }) => {
    await bootOwner(page, {
      viewport: { width: w, height: 900 }, perms: ALL,
      extra: async (p) => {
        await p.route(/\/rest\/v1\/rpc\/my_member_venues/, (r) => r.fulfill(json(MEMBER)));
        // A(MOCK_VENUE) 권한은 늦게(업주 전권), B 는 즉시(권한 0 — 출근 관리만). 매장 id 는 요청 본문에 있다.
        await p.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers|can_manage_venue_staff|can_manage_venue_schedules|can_manage_schedule)($|\?)/, async (r) => {
          const vid = (r.request().postDataJSON() as { p_venue_id?: string } | null)?.p_venue_id;
          if (vid === VENUE_B) return r.fulfill(json(false));
          await new Promise((res) => setTimeout(res, 1500));
          return r.fulfill(json(true)).catch(() => {});
        });
      },
    });
    await openMyStore(page);
    const pick = page.getByLabel('관리할 매장 선택');
    await expect(pick, '두 매장 소속인데 전환기가 없다').toBeVisible({ timeout: 15_000 });
    await expect(pick.locator('option')).toHaveCount(2);
    await pick.selectOption(VENUE_B);
    await page.waitForTimeout(2500); // A 의 늦은 응답(1.5s)이 도착하고도 남을 시간
    const labels = await navLabels(page, w >= 1024);
    expect(labels, 'B(권한 0) 화면에 A(업주) 메뉴가 섞였다').not.toContain('직원 관리');
    expect(labels).toContain('출근 관리');
    await expect(pick).toHaveValue(VENUE_B);
  });
}

test('매장 전환기: 한 매장만 속하면 전환기가 없다(종전 그대로)', async ({ page }) => {
  await bootOwner(page, {
    viewport: { width: 1280, height: 900 }, perms: ALL,
    extra: async (p) => { await p.route(/\/rest\/v1\/rpc\/my_member_venues/, (r) => r.fulfill(json(MEMBER.slice(0, 1)))); },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-secbar]').getByRole('button').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('관리할 매장 선택')).toHaveCount(0);
});

// ④ 20260928b — get_my_venue_staff 의 email 이 null(관리자 외)이어도 목록 줄이 빈 칸으로 남지 않는다.
test('직원 목록: 이메일이 null 이고 아이디도 없으면 보조 줄을 그리지 않는다', async ({ page }) => {
  await bootOwner(page, {
    viewport: { width: 1280, height: 900 }, perms: ALL,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/get_my_venue_staff/, (r) => r.fulfill(json([
        { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: '김딜러', nickname: null, email: null, avatar_color: null, staff_title: null, is_active: true },
      ])));
      // 구성원 목록은 초대 목록과 Promise.all 이다 — 초대 조회가 401 이면 목록 전체가 오류 카드가 된다.
      await p.route(/\/rest\/v1\/rpc\/get_my_venue_invites/, (r) => r.fulfill(json([])));
      for (const fn of ['get_ledger_access_user_ids', 'get_voucher_access_user_ids', 'get_schedule_access_user_ids']) {
        await p.route(new RegExp(`/rest/v1/rpc/${fn}`), (r) => r.fulfill(json([])));
      }
    },
  });
  await openMyStore(page);
  await page.locator('[data-mystore-secbar]').getByRole('button', { name: '직원 관리', exact: true }).click();
  const row = page.locator('[data-pane="staff"] li').filter({ hasText: '김딜러' });
  await expect(row).toBeVisible({ timeout: 15_000 });
  const emptyLines = await row.locator('p').evaluateAll((ps) => ps.filter((x) => (x.textContent ?? '').trim() === '').length);
  expect(emptyLines, '이메일 null 로 빈 보조 줄이 남았다').toBe(0);
  await expect(row).not.toContainText('null');
});
