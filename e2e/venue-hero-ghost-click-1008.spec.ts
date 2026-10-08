// e2e/venue-hero-ghost-click-1008.spec.ts — 매장 페이지 hero 탭의 유령 클릭(2026-10-08, #233/UP-12 가 만든 회귀)
//
// 증상: 포스터 1장 매장에서 hero 를 탭하면 일정 상세가 열린다(#233). 그런데 **두 번째 탭부터** 상세 위로
// 'ImageLightbox 포스터 확대 보기' 가 함께 열렸다(운영 실측 3/3, audit12/live-motion-1008.md '3차').
// 원인: VenuePage HeroSection.onTouchEnd 가 preventDefault 없이 상세를 열었다. 브라우저는 touchend 뒤에 같은 좌표로
// click 을 합성하는데, 청크가 데워진 두 번째 탭부터는 상세가 그 click 보다 먼저 그려져 손가락 아래의
// ScheduleDetailModal '포스터 확대 보기' 버튼이 click 을 받았다.
//
// 🔴 Playwright click/tap 은 누름이 0ms 라 이 부류를 못 잰다 — CDP Input.dispatchTouchEvent 로 실제 손가락(110ms)을 보낸다.
// ⚠ 운영 무접촉: 매장 목록·일정은 page.route 로 대체하고, 쓰기는 _fixtures 가드가 끊는다.
// 음성 대조: HeroSection.onTouchEnd 의 `if (e.cancelable) e.preventDefault();` 를 지우면 ① 이 3회 중 두 번째부터 빨개진다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';
import { kstDay } from './_schedules';

const VENUE_ID = '88888888-1008-4008-8008-888888888888';
const VENUE_NAME = '유령클릭 검증 홀덤';
const TITLE = '목킹 포스터 대회';
// 같은 오리진 정적 파일 — 이미지 네트워크 목이 필요 없고, 매장 사진 URL = 일정 poster_url 이라 사진 하나가 대회 하나를 가리킨다.
const POSTER_A = '/icon-192.png';
const POSTER_B = '/icon-512.png';

const venueRow = (images: string[]) => ({
  id: VENUE_ID, name: VENUE_NAME, region: '서울', address: '서울 어딘가 1',
  approved: true, status: 'active', verification_status: 'verified', is_paid_ad: false, display_order: 1,
  follower_count: 3, rating: null, kind: 'venue', images,
});

const scheduleRow = () => ({
  id: 'e2e-ghost-schedule-1', title: TITLE, venue_id: VENUE_ID, pub_name: VENUE_NAME, region: '서울', address: '서울 어딘가 1',
  date: kstDay(1), start_time: '20:00:00', duration: '6시간', format: 'MTT', guaranteed: true,
  prize_pool: 1_000_000, prize_percent: null, is_competition: false, grade: null, blinds: null, reg_close_time: null,
  buy_in: { amount: 30_000 }, seats: null, structure: null, description: null, side_events: null, ranking_prizes: null,
  partners: null, promotions: null, payment_methods: null, rules: null, poster_url: POSTER_A, poster_color: null,
  display_order: 1, is_premium: false, premium_until: null, owner_id: 'e2e-mock-owner', unread_qna_count: 0,
  approved: true, view_count: 0, rejected_at: null, reject_reason: null,
});

/** JSON 목 — 단건(Accept: object+json)이면 객체, 아니면 배열 */
async function mockJson(page: Page, pattern: RegExp, rows: Record<string, unknown>[]) {
  await page.route(pattern, (route) => {
    const single = /vnd\.pgrst\.object\+json/.test(route.request().headers()['accept'] ?? '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? (rows[0] ?? null) : rows) });
  });
}

async function openVenue(page: Page, images: string[]) {
  await stabilizeBackstack(page);
  await mockJson(page, /\/rest\/v1\/venues\?/, [venueRow(images)]);
  await mockJson(page, /\/rest\/v1\/schedules\?/, [scheduleRow()]);
  await page.goto(`/?venue=${VENUE_ID}`);
  await expect(page.getByRole('dialog', { name: /매장 페이지/ })).toBeVisible({ timeout: 20_000 });
  await dismissOverlays(page);
  const hero = page.locator('img[alt$="사진 1"]').first();
  await expect(hero).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => hero.evaluate((el) => (el as HTMLImageElement).complete), { timeout: 15_000 }).toBe(true);
  return hero;
}

type Cdp = Awaited<ReturnType<ReturnType<Page['context']>['newCDPSession']>>;
const touch = (cdp: Cdp, type: string, x?: number, y?: number) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y }] } as never);

/** 실제 손가락 탭 — 110ms 누르고 뗀다 */
async function fingerTap(page: Page, cdp: Cdp, x: number, y: number) {
  await touch(cdp, 'touchStart', x, y);
  await page.waitForTimeout(110);
  await touch(cdp, 'touchEnd');
}

const zoomButton = (page: Page) => page.getByRole('button', { name: '포스터 확대 보기' });
const lightbox = (page: Page) => page.getByRole('dialog', { name: /포스터 확대 보기$/ });

async function heroCenter(hero: ReturnType<Page['locator']>) {
  const box = (await hero.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('매장 hero 탭 — 합성 click 이 상세 위 포스터 확대를 열지 않는다', () => {
  test.setTimeout(60_000); // 부팅 + 매 회차 700ms 대기 + 스와이프 — 기본 30초를 빠듯하게 넘는다
  test('① 포스터 1장: 열기→Esc→다시 탭 3회 — 상세만 열리고 확대는 안 열린다', async ({ page }) => {
    const hero = await openVenue(page, [POSTER_A]);
    const cdp = await page.context().newCDPSession(page);
    const { x, y } = await heroCenter(hero.locator('xpath=../..')); // img → 트랙 → 터치 핸들러가 달린 hero 컨테이너
    const baseDialogs = await page.locator('[role="dialog"]').count();

    for (let round = 1; round <= 3; round++) {
      await fingerTap(page, cdp, x, y);
      // 상세가 열렸다 — '포스터 확대 보기' 버튼은 상세에만 있다
      await expect(zoomButton(page), `${round}회차: 탭했는데 일정 상세가 안 열렸다`).toBeVisible({ timeout: 10_000 });
      // 합성 click 은 touchend 직후(수 ms)에 온다 — 가드(400ms)를 넘겨 기다린 뒤에 확대가 없는지 본다
      await page.waitForTimeout(700);
      expect(await lightbox(page).count(), `${round}회차: 상세 위로 포스터 확대(ImageLightbox)가 함께 열렸다 — 유령 클릭`).toBe(0);
      await expect(page.getByText('두 손가락으로 확대')).toHaveCount(0);
      expect(await page.locator('[role="dialog"]').count(), `${round}회차: 열린 dialog 가 상세 1개만 늘어야 한다`).toBe(baseDialogs + 1);

      await page.keyboard.press('Escape');
      await expect(zoomButton(page), `${round}회차: Esc 로 상세가 안 닫혔다`).toHaveCount(0, { timeout: 10_000 });
    }
  });

  test('② 포스터 2장: 탭하면 상세만 열린다 / 왼쪽으로 쓸면 다음 사진으로 넘어가고 상세는 안 열린다', async ({ page }) => {
    const hero = await openVenue(page, [POSTER_A, POSTER_B]);
    const cdp = await page.context().newCDPSession(page);
    const { x, y } = await heroCenter(hero.locator('xpath=../..')); // img → 트랙 → 터치 핸들러가 달린 hero 컨테이너
    const track = hero.locator('xpath=..');
    // 3.5초 자동 슬라이드가 있어 지금 몇 번째 사진인지는 모른다 — 읽어서 상대적으로 판정한다(수동 조작 뒤 6초는 자동이 멈춘다)
    const slideIdx = async () => {
      const t = await track.evaluate((el) => (el as HTMLElement).style.transform);
      return Math.abs(Math.round(parseFloat(/translateX\((-?[\d.]+)%\)/.exec(t)![1]) / 100)); // abs: 첫 사진은 -0 이 나와 toBe(0) 와 어긋난다
    };
    // 실제 손가락처럼 작은 걸음으로 — 크게 두 번 뛰면 크롬이 제스처로 못 읽는다
    const swipe = async (dx: number) => {
      await touch(cdp, 'touchStart', x - dx / 2, y);
      await page.waitForTimeout(60);
      for (let i = 1; i <= 12; i++) {
        await touch(cdp, 'touchMove', x - dx / 2 + (dx * i) / 12, y);
        await page.waitForTimeout(16);
      }
      await touch(cdp, 'touchEnd');
    };

    // 스와이프 — 상세가 열리지 않고 슬라이드만 넘어간다(판정 경로는 그대로)
    const cur = await slideIdx();
    await swipe(-200);
    await expect.poll(slideIdx, { message: '왼쪽으로 쓸었는데 다음 사진으로 안 넘어갔다' }).toBe((cur + 1) % 2);
    await page.waitForTimeout(500);
    await expect(zoomButton(page), '스와이프가 일정 상세를 열었다').toHaveCount(0);
    await swipe(200);
    await expect.poll(slideIdx, { message: '오른쪽으로 쓸었는데 이전 사진으로 안 돌아왔다' }).toBe(cur);
    // 일정은 첫 사진(POSTER_A)만 가리킨다 — 첫 사진에서 탭한다
    if (cur !== 0) {
      await swipe(200);
      await expect.poll(slideIdx).toBe(0);
    }

    for (let round = 1; round <= 2; round++) {
      await fingerTap(page, cdp, x, y);
      await expect(zoomButton(page), `${round}회차: 2장 hero 탭이 상세를 안 열었다`).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(700);
      expect(await lightbox(page).count(), `${round}회차: 2장 hero 에서도 확대가 같이 열렸다`).toBe(0);
      await page.keyboard.press('Escape');
      await expect(zoomButton(page)).toHaveCount(0, { timeout: 10_000 });
    }
  });
});
