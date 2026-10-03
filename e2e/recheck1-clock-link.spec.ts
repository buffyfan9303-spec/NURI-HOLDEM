// recheck1 R1(2026-10-03) — 직원 클락 '장부 연동' 목록: 직원 창 밖 지난 마감 장부는 빼고 안내를 붙인다(서버 20261003i 가 그 연결을 42501 로 막는다).
//   업주(can_manage_pos)는 종전 그대로 전부. 목킹 — 운영 쓰기 0. 음성 대조: 수정 전 빌드(origin/main)에서 직원 FAIL.
import { test, expect } from './_fixtures';
import type { Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const dayAgo = (n: number) => new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - n * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
const sess = (date: string, closed: boolean, closedAt: string | null, title: string) => ({
  venue_id: MOCK_VENUE, session_date: date, game_seq: 1, title, buyin_amount: 30_000, card_amount: null, opened_at: `${date}T10:00:00+09:00`,
  reg_closed: closed, closed, closed_at: closedAt, operators: [], discounts: [], game_type: 'gtd', target_entries: 0, max_entries: 0,
});
const SESSIONS = [
  sess(MOCK_DAY, false, null, '오늘 메인'),
  sess(dayAgo(1), true, new Date(Date.now() - 4 * 3_600_000).toISOString(), '어제 심야'),
  sess(dayAgo(10), true, new Date(Date.now() - 10 * 86_400_000).toISOString(), '열흘 전'),
];

for (const staff of [true, false]) {
  test(`R1 1440 ${staff ? '직원' : '업주(양성)'} — 클락 장부 연동 목록 ${staff ? '창 밖 지난 마감 장부 없음 · 안내' : '전부'}`, async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page, {
      viewport: { width: 1440, height: 900 }, goto: false,
      ...(staff ? { perms: { can_manage_pos: false, can_access_ledger: true, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false },
        profile: { role: 'venue_staff', name: '직원', nickname: '직원' } } : {}),
      extra: async (p) => {
        await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
        await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? SESSIONS[0] : SESSIONS)));
      },
    });
    await page.goto('/');
    await openMyStore(page);
    await expect(page.locator('[data-mystore-rail]').first()).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-mystore-rail] [role=tab]').filter({ hasText: '클락' }).first().evaluate((b) => (b as HTMLElement).click());
    const pane = page.locator('[data-pane="clock"]');
    await expect(pane.getByText('장부(게임) 목록').first(), '클락 설정(전제)').toBeVisible({ timeout: 20_000 });
    await expect(pane.getByRole('button', { name: /어제 심야/ }), '창 안(4시간 전 마감)은 직원도 보인다').toBeVisible();
    await expect(pane.getByRole('button', { name: /오늘 메인/ }).first()).toBeVisible();
    await expect(pane.getByRole('button', { name: /열흘 전/ }), '열흘 전 마감 장부').toHaveCount(staff ? 0 : 1);
    await expect(pane.getByTestId('clk-link-staff-note')).toHaveCount(staff ? 1 : 0);
  });
}
