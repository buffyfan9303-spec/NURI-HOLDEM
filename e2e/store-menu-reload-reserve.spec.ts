// 11회차 M11-02 — 내 매장 1440 레일 메뉴(직원 관리·매장 설정)에서 새로고침하면
// 본문이 그려진 뒤 인증 등급 배너(VenueVerificationCard part="grade")가 늦게 끼어들어 본문이 72px 밀렸다.
// 배너 칸에 `reserve` 가 없어 조회(getAllVenues)가 끝나는 순간 자리가 생기던 것이 원인.
// 본문 판([data-pane])의 y 가 새로고침 뒤 정착할 때까지 변하지 않아야 한다(대시보드는 이미 reserve 라 대조군).
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const extra = async (p: Page) => {
  await p.route(/\/rest\/v1\/rpc\/(get_my_venue_staff|get_my_venue_invites|get_ledger_access_user_ids|get_voucher_viewer_ids|get_schedule_manager_ids)/, (r: Route) => r.fulfill(json([])));
};

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

for (const lbl of ['직원 관리', '매장 설정', '대시보드']) {
  test(`내 매장 1440 · ${lbl}에서 새로고침해도 본문이 밀리지 않는다`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      const S: { ys: number[]; cls: number } = { ys: [], cls: 0 };
      (window as unknown as { __Q: typeof S }).__Q = S;
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) S.cls += e.value; })
          .observe({ type: 'layout-shift', buffered: true });
      } catch { /* 미지원 */ }
      const tick = () => {
        // 보이는 본문 판(display:none 아닌 [data-pane])의 위쪽 y — 위에 뭔가 끼어들면 이 값이 바뀐다.
        const pane = [...document.querySelectorAll('[data-tab="my-store"] [data-pane]')].find((e) => (e as HTMLElement).getClientRects().length > 0 && e.getBoundingClientRect().height > 40);
        if (pane) S.ys.push(Math.round(pane.getBoundingClientRect().top * 10) / 10);
        if (S.ys.length < 600) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, goto: false, extra });
    await page.goto('/');
    await openMyStore(page);
    await page.waitForTimeout(1500);
    await page.evaluate((l) => {
      const b = [...document.querySelectorAll('[data-tab="my-store"] button')].find((x) => x.className.includes('group/nav') && (x.textContent || '').trim() === l) as HTMLElement;
      b.click();
    }, lbl);
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForTimeout(3500);
    const Q = await page.evaluate(() => (window as unknown as { __Q: { ys: number[]; cls: number } }).__Q);
    expect(Q.ys.length, '본문 판이 한 번도 안 잡힘').toBeGreaterThan(20);
    const spread = Math.max(...Q.ys) - Math.min(...Q.ys);
    console.log(`[M11-02] ${lbl} frames=${Q.ys.length} y=${Q.ys[0]}→${Q.ys[Q.ys.length - 1]} spread=${spread} cls=${Q.cls.toFixed(4)}`);
    expect(spread, `본문 y 가 ${Q.ys[0]}→${Q.ys[Q.ys.length - 1]} 로 움직임`).toBeLessThanOrEqual(1);
  });
}
