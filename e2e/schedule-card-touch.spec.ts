// e2e/schedule-card-touch.spec.ts — 시간표형 일정 줄(홈 일정 · 일정 탐색)의 **터치** 목적지 (FULL-ERROR-SWEEP-A ① · 2026-09-25)
//
// 🔴 왜 따로 있나: `schedule-card-clicks` 는 마우스 클릭이다. 이 결함은 **터치에서만** 난다 —
//   Chromium 터치 보정이 터치 사각형(최소 20px)에 걸린 '응답 요소'(네이티브 button 등) 쪽으로 touchstart 부터 옮기고,
//   카드(article)는 매장 button 의 조상이라 후보에서 빠진다. 그래서 제목을 눌러도 매장 페이지가 열렸다.
//   Playwright `click()` 은 마우스라 절대 못 잡는다 → CDP `Input.dispatchTouchEvent` 로 반경 있는 손가락을 보낸다.
// 수정 전 빌드에서 '제목 → 상세' 가 FAIL(매장 페이지가 열린다), 수정 후 PASS 를 확인했다(2026-09-25, 390/360 · 홈/일정 탐색).
// 운영 데이터를 안 쓴다(단일 route 핸들러 · 실네트워크 0).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { kstToday } from '../src/lib/kst';

test.use({ hasTouch: true });

const VENUE_ID = '33333333-3333-4333-8333-333333333333';
const TITLE = '터치 목적지 검사 대회';
const ROW = {
  id: 'cccccccc-0000-4000-8000-000000000001', title: TITLE,
  venue_id: VENUE_ID, pub_name: '누리 터치 홀덤펍', region: '서울', address: '서울 어딘가 1',
  date: kstToday(Date.now()), start_time: '23:30:00', duration: '4시간', format: 'NLH',
  guaranteed: true, prize_pool: 10_000_000, prize_percent: null, is_competition: false, grade: null, blinds: null,
  buy_in: { amount: 100_000, gameType: '홀덤' }, display_order: 0, is_premium: false, owner_id: VENUE_ID, approved: true,
  unread_qna_count: 0, view_count: 1, premium_until: null, reg_close_time: '12LV 00:30', structure: null,
};
const VENUE = { id: VENUE_ID, name: '누리 터치 홀덤펍', region: '서울', address: '서울 어딘가 1', approved: true, status: 'active', is_paid_ad: false, display_order: 1, follower_count: 0, rating: null };

async function mockAll(page: Page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/rest\/v1\/schedules/.test(url)) return json([ROW]);
    if (/\/rest\/v1\/venues/.test(url)) return json([VENUE]);
    if (/\/rest\/v1\/rpc\//.test(url)) return json([]);
    if (/\/rest\/v1\//.test(url)) return json([]);
    if (/supabase\.co/.test(url)) return json({});
    return route.abort('blockedbyclient');
  });
}

const CARD = { home: '[data-testid="home-schedule"] article[data-layout="timetable"]', browse: 'main[data-tab="browse"] article[data-layout="timetable"]' } as const;

async function open(page: Page, where: keyof typeof CARD, width: number) {
  await page.addInitScript(() => { try { localStorage.setItem('nuri-theme', 'dark'); } catch { /* 저장소 차단 */ } });
  await mockAll(page);
  await page.setViewportSize({ width, height: 844 });
  await page.goto(where === 'home' ? '/' : '/?tab=browse');
  const card = page.locator(CARD[where]).filter({ hasText: TITLE }).first();
  await card.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(900);
  return card;
}

/** 실제 손가락: 반경 r 의 터치를 90ms 누르고 뗀다(Playwright tap 은 반경 0 · 마우스 click 은 보정 자체가 없다). */
async function finger(page: Page, x: number, y: number, r: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: r, radiusY: r, force: 1, id: 1 }] });
  await page.waitForTimeout(90);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const venueDialog = (page: Page) => page.getByRole('dialog', { name: /매장 페이지/ });
const detail = (page: Page) => page.locator('[data-sched-panel]');

for (const width of [390, 360]) {
  for (const where of ['home', 'browse'] as const) {
    // 제목 중앙(반경 8)과 제목 아래쪽(y 80% · 반경 4) — 아래쪽이 결함 지점이다(매장 링크와 3px 사이).
    for (const [label, fy, r] of [['중앙', 0.5, 8], ['아래쪽', 0.8, 4]] as const) {
      test(`🔴 ${width} ${where} 제목 ${label} 터치 → 일정 상세 (매장 페이지가 아니다)`, async ({ page }) => {
        const card = await open(page, where, width);
        const h3 = card.locator('h3').first();
        const box = await h3.boundingBox();
        expect(box, '제목을 못 찾았다').not.toBeNull();
        await finger(page, box!.x + Math.min(box!.width / 2, 40), box!.y + box!.height * fy, r);
        // 먼저 '어디로 갔는지' 를 말한다 — 결함 상태에서는 매장 페이지가 열리므로 그 사실을 실패 메시지로 남긴다.
        await page.waitForTimeout(1500); // 두 화면 다 startTransition 으로 늦게 뜰 수 있다 — 기다렸다 센다
        await expect(venueDialog(page), '제목을 터치했는데 매장 페이지가 열렸다 — 터치 보정이 매장 링크로 샜다').toHaveCount(0);
        await expect(detail(page), '제목을 터치했는데 일정 상세가 안 열렸다').toBeVisible({ timeout: 10_000 });
      });
    }

    test(`🟢 ${width} ${where} 매장명 터치 → 매장 페이지 · 히트 박스 ≥ 24px (AA)`, async ({ page }) => {
      const card = await open(page, where, width);
      const venue = card.getByTestId('schedule-venue-link');
      await expect(venue, '매장 링크가 없다(venue_id 픽스처 확인)').toHaveCount(1);
      const box = await venue.boundingBox();
      expect(box).not.toBeNull();
      // 실제 박스(의사요소 아님) — 제목·③줄과 겹치지 않으면서 WCAG 2.2 SC 2.5.8 AA 24px
      expect(box!.height, `매장 링크 히트 박스 ${box!.height.toFixed(2)}px < 24`).toBeGreaterThanOrEqual(24);
      await finger(page, box!.x + Math.min(box!.width / 2, 40), box!.y + box!.height / 2, 8);
      await expect(venueDialog(page), '매장명을 터치했는데 매장 페이지가 안 열렸다').toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1200);
      await expect(detail(page), '매장명을 터치했는데 일정 상세까지 열렸다').toHaveCount(0);
    });
  }
}
