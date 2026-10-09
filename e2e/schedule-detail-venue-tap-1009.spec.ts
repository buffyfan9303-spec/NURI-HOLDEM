// e2e/schedule-detail-venue-tap-1009.spec.ts — 대회 상세 시트의 매장 이름 링크 누름면(오픈 점검 M-01, P3).
//
// 결함: 매장 이름 버튼(24px)에 공용 tap-44 를 붙여 누름면이 **위로** 20px 늘었다 → 바로 위 대회 제목(25px)의 아래 절반을
//   누르면 매장 페이지가 열렸다(390, CDP 터치 2/2 재현).
// 계약 ① 제목 아래 절반(55·70·85·95%)의 elementFromPoint 는 제목이다(매장 버튼이 아니다).
//      ② 매장 버튼의 실제 누름면은 세로 44px 이상이다(아래로 넓힌다).
//      ③ 매장 버튼 누름면과 그 아래 주소 링크 누름면이 겹치지 않는다.
//      ④ 양성 대조 — 매장 이름 **아래** 확장부를 실제 손가락(CDP 터치 100ms)으로 누르면 매장 페이지가 열린다.
// 음성 대조(2026-10-09): origin/main(4d9253e8) 같은 목에서 ①은 네 점 모두 'venue' → 실패, ④는 열리지 않음 → 실패(scratchpad sched.cjs).
// ⚠ 제목 맨 아래 2~3px 는 Chrome 터치 보정(가까운 클릭 대상으로 끌어감)이 매장 버튼으로 보낼 수 있다 — 확장부를 없애도 같다(감사 m01 음성 대조).
//   그래서 터치 단언은 제목 가운데(50%)만 하고, 나머지는 elementFromPoint 로 잰다.
// ⚠ 운영 DB 무접촉 — 일정·매장은 page.route 로 답한다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack } from './_session';
import { kstDay } from './_schedules';

const SID = '00000000-0000-4000-8000-0000000000f1';
const VID = '00000000-0000-4000-8000-0000000000f2';
const TITLE = '로티 단독 깐부전';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');

async function open(page: Page) {
  await stabilizeBackstack(page);
  const v = { id: VID, name: '로티아레나', kind: 'venue', approved: true, status: 'active', region: '경기', address: '남양주시 다산동 6087', description: '소개',
    images: [], image_url: null, follower_count: 0, is_paid_ad: false, display_order: 1, verification_status: 'verified', created_at: '2026-10-01T00:00:00Z' };
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    const url = r.request().url();
    if (r.request().method() !== 'GET' || (url.includes('id=eq.') && !url.includes(`id=eq.${VID}`))) return r.fallback();
    return r.fulfill(json(single(r) ? v : [v]));
  });
  const s = { id: SID, title: TITLE, venue_id: VID, pub_name: '로티아레나', region: '경기', address: '남양주시 다산동 6087 한강프라자 4층', date: kstDay(2),
    start_time: '19:00:00', duration: '5시간', format: 'MTT', guaranteed: true, prize_pool: 1_000_000, buy_in: { amount: 100_000 }, approved: true, display_order: 1,
    is_premium: false, premium_until: null, owner_id: '00000000-0000-4000-8000-0000000000ee', unread_qna_count: 0, view_count: 0, is_competition: false, grade: null };
  await page.route(/\/rest\/v1\/schedules\?/, (r) => r.request().method() === 'GET' ? r.fulfill(json(single(r) ? s : [s])) : r.fallback());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?s=${SID}`);
  await expect(page.locator('h1', { hasText: TITLE })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800); // 시트 진입 모션이 끝난 뒤 잰다
}

async function touch(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 6, radiusY: 6 }] });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const venueOpen = (page: Page) => page.getByRole('dialog', { name: /매장 페이지/ });

test('🔴 M-01 대회 상세 — 제목을 누르면 매장이 열리지 않고, 매장 이름 누름면은 아래로 44px', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  const m = await page.evaluate((title) => {
    const h1 = [...document.querySelectorAll('h1')].find((h) => h.textContent?.includes(title))!;
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('로티아레나'))!;
    const addr = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('한강프라자'));
    const x = btn.getBoundingClientRect().left + 30;
    const who = (y: number) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return '-';
      if (btn.contains(el)) return 'venue';
      if (addr?.contains(el)) return 'addr';
      if (h1.contains(el)) return 'title';
      return el.tagName.toLowerCase();
    };
    let venue = 0, addrH = 0, overlap = false, prev = '';
    for (let y = 0; y < innerHeight; y += 0.25) {
      const w = who(y);
      if (w === 'venue') venue += 0.25;
      if (w === 'addr') addrH += 0.25;
      if ((prev === 'venue' && w === 'addr') || (prev === 'addr' && w === 'venue')) overlap = true; // 맞닿아 바로 바뀌면 경계가 겹친 것
      prev = w;
    }
    const hr = h1.getBoundingClientRect();
    return {
      title: { top: hr.top, bottom: hr.bottom }, btn: { top: btn.getBoundingClientRect().top, bottom: btn.getBoundingClientRect().bottom },
      lower: [0.55, 0.7, 0.85, 0.95].map((f) => who(hr.top + hr.height * f)),
      venue, addr: addrH, overlapEdge: overlap, hasAddr: !!addr, x, titleMidY: hr.top + hr.height / 2, belowY: btn.getBoundingClientRect().bottom + 10,
    };
  }, TITLE);
  console.log(`[m01] ${JSON.stringify(m)}`);
  expect(m.lower, '제목 아래 절반이 매장 버튼 누름면에 덮였다').toEqual(['title', 'title', 'title', 'title']);
  expect(m.venue, `매장 이름 누름면 ${m.venue}px — 44 미만`).toBeGreaterThanOrEqual(43.75);
  expect(m.hasAddr, '주소 링크가 그려지지 않았다(목 확인)').toBe(true);
  expect(m.addr, '주소 링크 누름면').toBeGreaterThanOrEqual(43.75);
  expect(m.overlapEdge, '매장 이름과 주소 링크 누름면이 맞닿아 겹친다').toBe(false);

  // 실제 손가락: 제목 가운데 → 매장 안 열림
  await touch(page, m.x, m.titleMidY);
  await page.waitForTimeout(1200);
  await expect(venueOpen(page), '제목 가운데를 눌렀는데 매장 페이지가 열렸다').toHaveCount(0);
});

test('🟢 M-01 양성 대조 — 매장 이름 아래 확장부를 누르면 매장 페이지가 열린다', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  const p = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('로티아레나'))!;
    const r = btn.getBoundingClientRect();
    return { x: r.left + 30, y: r.bottom + 10 };
  });
  await touch(page, p.x, p.y);
  await expect(venueOpen(page), '매장 이름 아래 10px 을 눌렀는데 매장 페이지가 열리지 않았다(누름면이 아래로 안 넓어졌다)').toBeVisible({ timeout: 10_000 });
});
