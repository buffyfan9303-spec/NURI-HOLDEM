// 직원 출근·퇴근 버튼(owner-2026-09-30#staff-punch) — 직원 화면 최상단 · 상태별 버튼 잠금 · 한 번 확인 · 연타 1요청 · 되돌리기 · 업주 화면 반영.
//
// ⚠ 이 스펙의 서버는 **가짜**다(운영 DB 쓰기 0). 서버 쪽 보장(빈 칸일 때만 기록 · 동시 요청 1건 · 본인/소속 매장만)은
//   supabase/migrations/20260930b_staff_punch.sql 을 격리 postgres:17 에서 실행해 확인한다 — 여기서는 화면 계약만 잰다.
//   가짜 서버도 같은 의미(빈 칸일 때만)로 답하지만, 연타 단언은 **요청 수**(화면 잠금)로 한다 — 서버 의미에 기대지 않게.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY } from './_mockOwner';

const SHOT = process.env.PUNCH_SHOT_DIR;
const NONE = { can_access_ledger: false, can_manage_pos: false, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false };

interface Row { work_date: string; staff_name: string; start_hm: string | null; check_in: string | null; check_out: string | null; confirmed: boolean }
function fakeServer() {
  const s = {
    rows: [{ work_date: MOCK_DAY, staff_name: '김직원', start_hm: '14:00', check_in: null, check_out: null, confirmed: false }] as Row[],
    punchCalls: 0, undoCalls: [] as unknown[],
  };
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const install = async (page: Page) => {
    await page.route(/\/rest\/v1\/rpc\/my_punch_state/, (r) => r.fulfill(json(s.rows.map((x) => ({ work_date: x.work_date, check_in: x.check_in, check_out: x.check_out })))));
    await page.route(/\/rest\/v1\/rpc\/punch_my_shift/, async (r: Route) => {
      s.punchCalls += 1;
      const b = r.request().postDataJSON() as { p_kind: 'in' | 'out' };
      await new Promise((res) => setTimeout(res, 400)); // 느린 망 — 이 사이의 두 번째 탭이 새 요청을 만들면 안 된다
      const row = s.rows[0];
      let applied = false;
      if (b.p_kind === 'in' && row.check_in == null) { row.check_in = '09:03'; applied = true; }
      if (b.p_kind === 'out' && row.check_in != null && row.check_out == null) { row.check_out = '18:07'; applied = true; }
      return r.fulfill(json([{ work_date: row.work_date, check_in: row.check_in, check_out: row.check_out, applied }]));
    });
    await page.route(/\/rest\/v1\/rpc\/set_my_shift_time/, (r) => {
      const b = r.request().postDataJSON() as { p_field: 'check_in' | 'check_out'; p_value: string | null };
      s.undoCalls.push(b);
      s.rows[0][b.p_field] = b.p_value;
      return r.fulfill({ status: 204, body: '' });
    });
    await page.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(s.rows)) : r.fallback()));
  };
  return { s, install };
}

async function bootStaff(page: Page, width: number, srv: ReturnType<typeof fakeServer>) {
  await bootOwner(page, {
    viewport: { width, height: 900 }, perms: NONE,
    profile: { role: 'venue_staff', name: '김직원', nickname: '김직원' },
    extra: srv.install,
  });
  await openMyStore(page);
  const bar = page.locator('[data-tab="my-store"] [data-testid="staff-punch-bar"]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  return bar;
}

for (const w of [390, 1440]) {
  test(`직원 출근·퇴근 @${w}: 최상단 · 상태별 잠금 · 연타 1요청 · 3상태`, async ({ page }) => {
    const srv = fakeServer();
    const bar = await bootStaff(page, w, srv);
    const pin = bar.getByTestId('punch-in'), pout = bar.getByTestId('punch-out');
    await expect(bar).toHaveAttribute('data-phase', 'before');

    // 최상단: 내 매장 메뉴(모바일 '전체 메뉴' / PC 사이드바)와 섹션 판보다 위다.
    const nav = w >= 1024 ? page.locator('[data-mystore-secbar]') : page.getByTestId('mystore-menu-toggle');
    const [bb, nb] = [await bar.boundingBox(), await nav.boundingBox()];
    expect(bb && nb && bb.y + bb.height <= nb.y, `출퇴근 줄(${bb?.y})이 메뉴(${nb?.y})보다 위가 아니다`).toBeTruthy();

    await expect(pin).toBeEnabled();
    await expect(pout).toBeDisabled();
    if (SHOT) await page.screenshot({ path: `${SHOT}/punch-${w}-1-before.png` });

    // 한 번 확인: 출근을 누르면 확인 줄만 뜨고 요청은 아직 0 — 취소하면 그대로다.
    await pin.click();
    await expect(bar.getByTestId('punch-confirm-row')).toBeVisible();
    expect(srv.s.punchCalls, '확인 전에 요청을 보냈다').toBe(0);
    await bar.getByTestId('punch-cancel').click();
    await expect(bar.getByTestId('punch-confirm-row')).toHaveCount(0);
    await expect(bar).toHaveAttribute('data-phase', 'before');
    expect(srv.s.punchCalls).toBe(0);

    // 연타: 확인 버튼을 같은 프레임에 두 번 + 곧이어 한 번 더 — 요청은 하나여야 한다.
    await pin.click();
    const ok = bar.getByTestId('punch-confirm');
    await ok.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await ok.click({ force: true, timeout: 1000 }).catch(() => {});
    await expect(bar).toHaveAttribute('data-phase', 'on', { timeout: 10_000 });
    expect(srv.s.punchCalls, '연타가 요청을 두 번 보냈다').toBe(1);
    expect(srv.s.rows[0].check_in).toBe('09:03');
    await expect(bar.getByTestId('punch-status')).toContainText('09:03');
    await expect(pin).toBeDisabled();
    await expect(pout).toBeEnabled();
    await expect(bar.getByTestId('punch-undo')).toBeVisible();
    if (SHOT) await page.screenshot({ path: `${SHOT}/punch-${w}-2-on.png` });

    await pout.click();
    await bar.getByTestId('punch-confirm').evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await expect(bar).toHaveAttribute('data-phase', 'done', { timeout: 10_000 });
    expect(srv.s.punchCalls).toBe(2);
    expect(srv.s.rows[0].check_out).toBe('18:07');
    await expect(pin).toBeDisabled();
    await expect(pout).toBeDisabled();
    if (SHOT) await page.screenshot({ path: `${SHOT}/punch-${w}-3-done.png` });
  });
}

test('잘못 누른 출근 되돌리기 — 되돌리면 출근 버튼이 다시 열린다', async ({ page }) => {
  const srv = fakeServer();
  const bar = await bootStaff(page, 390, srv);
  await bar.getByTestId('punch-in').click();
  await bar.getByTestId('punch-confirm').click();
  await expect(bar).toHaveAttribute('data-phase', 'on', { timeout: 10_000 });
  await bar.getByTestId('punch-undo').click();
  await expect(bar).toHaveAttribute('data-phase', 'before', { timeout: 10_000 });
  expect(srv.s.undoCalls).toEqual([{ p_venue_id: expect.any(String), p_work_date: MOCK_DAY, p_field: 'check_in', p_value: null }]);
  await expect(bar.getByTestId('punch-in')).toBeEnabled();
  await expect(bar.getByTestId('punch-undo')).toHaveCount(0);
});

test('배정 없는 날 — 두 버튼 모두 잠기고 이유를 말한다', async ({ page }) => {
  const srv = fakeServer();
  srv.s.rows = [];
  const bar = await bootStaff(page, 390, srv);
  await expect(bar).toHaveAttribute('data-phase', 'none');
  await expect(bar.getByTestId('punch-in')).toBeDisabled();
  await expect(bar.getByTestId('punch-out')).toBeDisabled();
  await expect(bar.getByTestId('punch-status')).toContainText('배정된 근무가 없어요');
});

test('업주에게는 출퇴근 줄이 없다 · 직원이 찍은 기록이 업주 출근일지에 보인다', async ({ page }) => {
  const srv = fakeServer();
  srv.s.rows[0].check_in = '09:03'; // 직원이 방금 찍은 상태(같은 행)
  await bootOwner(page, { viewport: { width: 1440, height: 900 }, extra: srv.install });
  await openMyStore(page);
  const side = page.locator('[data-mystore-secbar]');
  await expect(side.getByRole('button', { name: '직원 관리', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-tab="my-store"] [data-testid="staff-punch-bar"]')).toHaveCount(0);
  await side.getByRole('button', { name: '직원 관리', exact: true }).click();
  const pane = page.locator('[data-pane="staff"]');
  await pane.getByRole('button', { name: /직원 출근일지/ }).click();
  await expect(pane.getByText('김직원', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(pane.getByText('09:03~—')).toBeVisible();
});

// 2026-09-30 — 인건비·정산·출근일지·출근 관리(StaffPayroll)·출근 스케줄을 지연 청크로 뺐다(청크 예산). 판이 그대로 열리고·닫히고·다시 열리는지,
//   한가할 때 미리 받은 뒤에는 '불러오는 중…' 폴백이 한 번도 안 뜨는지 잰다.
const FALLBACK_WATCH = () => {
  const w = window as unknown as { __fb: number; __fbWhat: string[] };
  w.__fb = 0; w.__fbWhat = [];
  new MutationObserver(() => {
    const hit = [...document.querySelectorAll('[data-tab="my-store"] p.py-16[aria-busy="true"]')].filter((e) => e.textContent?.includes('불러오는 중'));
    if (hit.length) { w.__fb += 1; w.__fbWhat.push(...hit.map((e) => `${e.closest('[data-pane]')?.getAttribute('data-pane')}:${e.outerHTML.slice(0, 120)}`)); }
  }).observe(document.body, { subtree: true, childList: true });
};
const chunkLoaded = (page: Page, name: string) =>
  page.waitForFunction((n) => performance.getEntriesByType('resource').some((e) => e.name.includes(`/${n}-`)), name, { timeout: 15_000 });

test('업주 직원 관리 — 지연 판 4개를 열고·닫고·다시 열어도 그대로이고 폴백이 번쩍이지 않는다', async ({ page }) => {
  const srv = fakeServer();
  await bootOwner(page, { viewport: { width: 1440, height: 900 }, extra: srv.install });
  await openMyStore(page);
  await chunkLoaded(page, 'StaffPayroll');
  await chunkLoaded(page, 'StaffSchedule');
  await page.evaluate(FALLBACK_WATCH);
  const side = page.locator('[data-mystore-secbar]');
  await side.getByRole('button', { name: '직원 관리', exact: true }).click();
  const pane = page.locator('[data-pane="staff"]');
  const items: [RegExp, (p: typeof pane) => ReturnType<typeof pane.locator>][] = [
    [/딜러 출근 스케줄/, (p) => p.getByText('김직원').first()],
    [/인건비 관리/, (p) => p.getByTestId('pay-rules').or(p.getByText('시급').first()).first()],
    [/인건비 정산/, (p) => p.locator('table, [role="alert"], p').first()],
    [/직원 출근일지/, (p) => p.getByText('김직원', { exact: true })],
  ];
  for (const [label, probe] of items) {
    const btn = pane.getByRole('button', { name: label });
    for (let round = 0; round < 2; round++) {
      await btn.click();
      await expect(btn).toContainText('접기');
      await expect(probe(pane)).toBeVisible({ timeout: 10_000 });
      await btn.click();
      await expect(btn).toContainText('펼치기');
    }
  }
  const fb = await page.evaluate(() => (window as unknown as { __fbWhat: string[] }).__fbWhat);
  expect(fb, '미리 받은 뒤에도 폴백이 떴다').toEqual([]);
});

test('직원 출근 관리 — 지연 판이 폴백 없이 열리고 맨 위 버튼과 같은 기록을 보인다', async ({ page }) => {
  const srv = fakeServer();
  srv.s.rows[0].check_in = '09:03';
  const bar = await bootStaff(page, 390, srv);
  await chunkLoaded(page, 'StaffPayroll');
  await page.evaluate(FALLBACK_WATCH);
  await bar.getByTestId('punch-fix').click();
  const pane = page.locator('[data-pane="attendance"]');
  await expect(pane.getByText('내 출근 관리', { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(pane.locator('input[type="time"]').first()).toHaveValue('09:03');
  expect(await page.evaluate(() => (window as unknown as { __fb: number }).__fb)).toBe(0);
});
