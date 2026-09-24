// 관리자 배너(home_banners)가 이벤트·브랜드 슬라이드보다 늦게 도착하면 캐러셀이 첫 장이 아니라
// 스냅이 붙잡고 있던 장(이벤트/브랜드)에서 시작하던 결함(2026-09-24 home-team 후보 → 확정).
// 재현: home_banners 응답만 지연 → 배너 도착 뒤 보이는 장이 '1번째 배너'(관리자 배너 A)여야 한다.
// 운영 DB 에 쓰지 않는다 — event_board · home_banners 는 page.route 로 만든다.
import { test, expect } from './_fixtures';
import type { Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const j = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const banner = (id: string, title: string, sort: number) => ({ id, title, subtitle: null, image_url: '/nuri-logo.png', link_url: null, active: true, sort_order: sort, starts_at: null, ends_at: null });

for (const delay of [0, 1500]) {
  test(`🔴 관리자 배너가 ${delay}ms 늦게 와도 첫 화면은 1번째 배너다`, async ({ page }) => {
    await page.route(/\/rest\/v1\/rpc\/event_board/, (r) => j(r, null));
    await page.route(/\/rest\/v1\/home_banners\?/, async (r) => {
      if (delay) await new Promise((res) => setTimeout(res, delay));
      await j(r, [banner('a', '배너 A', 1), banner('b', '배너 B', 2)]);
    });
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissOverlays(page);
    const vp = page.getByTestId('home-banner-viewport');
    await expect(vp.getByRole('button', { name: '배너 A' }).or(vp.locator('[aria-label="배너 A"]')).first()).toBeAttached({ timeout: 20_000 });
    await page.waitForTimeout(600);
    const s = await vp.evaluate((el) => {
      const w = el.clientWidth;
      const kids = [...el.firstElementChild!.children] as HTMLElement[];
      // 복제 세트(aria-hidden)는 같은 그림이다 — 원본 세트의 같은 자리 라벨로 읽는다(랩이 0 ↔ half 를 오간다).
      const i = Math.round(el.scrollLeft / w) % (kids.length / 2);
      return { left: el.scrollLeft, w, label: kids[i]?.getAttribute('aria-label') };
    });
    expect(s.label, `scrollLeft=${s.left} w=${s.w}`).toBe('배너 A');
    await expect(page.getByTestId('home-banner-dots').locator('button[aria-label="1번째 배너"]')).toHaveAttribute('aria-current', 'true');
  });
}
