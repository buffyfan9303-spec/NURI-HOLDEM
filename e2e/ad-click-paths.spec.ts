// 웹 전체의 광고성 요소 — **클릭 목적지가 있는가** (2026-09-11 오너 지시)
//
// 오너 지시: "커뮤니티 광고만 고치고 끝내지 말고 웹 전체에서 AD·광고·Sponsored·프로모션으로
// 표시되는 요소를 검색하라. 실제 게재 중인 광고는 반드시 명확한 클릭 목적지가 있어야 한다."
//
// 이 스펙이 잠그는 것
//   ① 실제 게재물은 '누를 수 있는 것처럼 보이는데 아무 일도 안 나는' 상태가 아니다(죽은 버튼 금지).
//   ② 광고 자리 placeholder(광고 문의)는 게재물이 아니다 — 실제 광고로 세지 않는다.
//   ③ 외부 링크는 http/https 만, 새 창이면 noopener.
//   ④ 유료 노출 카드도 키보드로 열린다.
//
// 운영 DB 에는 쓰지 않는다(page.route + _fixtures 가드).
import { test, expect } from './_fixtures';
import { type Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const BANNERS_REST = /\/rest\/v1\/home_banners\?/;
const SCHEDULES_REST = /\/rest\/v1\/schedules\?/;

/** 유료 노출(부스트) 일정 — 상단 고정되는 그 카드다. rowToSchedule(src/api/schedules.ts:86) 이 읽는 필드만. */
const schedRow = (id: string, title: string) => {
  const d = new Date(Date.now() + 3 * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
  return {
    id, title, venue_id: null, pub_name: '테스트펍', region: '서울', address: null,
    date: d, start_time: '19:00:00', duration: '25/15', format: 'MTT',
    guaranteed: true, prize_pool: 1000000, reg_close_time: '16LV',
    buy_in: { amount: 50000 }, seats: null, structure: null, description: null,
    side_events: null, ranking_prizes: null, partners: null, promotions: null,
    payment_methods: null, rules: null, poster_url: null, poster_color: null,
    display_order: 1, is_premium: true, premium_until: null,
    owner_id: null, unread_qna_count: 0, approved: true, view_count: 0,
  };
};

const banner = (id: string, title: string, linkUrl: string | null) => ({
  id, title, subtitle: '부제', image_url: '/favicon.png', link_url: linkUrl,
  sort_order: 0, starts_at: null, ends_at: null, active: true,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
});

test.describe('광고성 요소 — 클릭 목적지 점검', () => {
  test('🔴 링크 없는 홈 배너는 버튼이 아니다 — 눌러도 아무 일 없는 죽은 버튼을 만들지 않는다', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(BANNERS_REST, (r: Route) => r.fulfill(json([banner('b-dead', '링크 없는 배너', null)])));
    await page.goto('/');
    await dismissOverlays(page);

    const slide = page.locator('[aria-label="링크 없는 배너"]').first();
    await expect(slide, '배너가 캐러셀에 없다').toBeVisible({ timeout: 20_000 });
    const info = await slide.evaluate((el) => ({ tag: el.tagName, cursor: getComputedStyle(el).cursor }));
    expect(info.tag, '목적지가 없는데 <button> 으로 그렸다 — 손 모양 커서가 거짓말을 한다').not.toBe('BUTTON');
    expect(info.cursor).not.toBe('pointer');
  });

  test('🔴 링크 있는 홈 배너는 버튼이고, 내부 경로는 같은 탭으로 이동한다', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(BANNERS_REST, (r: Route) => r.fulfill(json([banner('b-live', '살아있는 배너', '/?tab=browse')])));
    await page.goto('/');
    await dismissOverlays(page);

    const slide = page.locator('[aria-label="살아있는 배너"]').first();
    await expect(slide).toBeVisible({ timeout: 20_000 });
    await expect(slide).toHaveJSProperty('tagName', 'BUTTON');
    await slide.click();
    await expect(page).toHaveURL(/tab=browse/, { timeout: 10_000 });
  });

  test('🔴 위험한 scheme 의 배너 링크는 열리지 않는다', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(BANNERS_REST, (r: Route) => r.fulfill(json([banner('b-evil', '위험 배너', 'javascript:window.__pwned=1')])));
    await page.goto('/');
    await dismissOverlays(page);

    const slide = page.locator('[aria-label="위험 배너"]').first();
    await expect(slide).toBeVisible({ timeout: 20_000 });
    const before = page.url();
    await slide.click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(page.url(), '위험 링크로 이동했다').toBe(before);
  });

  test('🔴 유료 노출 매장 카드(AD 배지)는 카드 전체가 매장 상세로 간다', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=community');
    await dismissOverlays(page);
    const bar = page.locator('[data-community-secbar]');
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await bar.getByRole('button', { name: '홀덤펍', exact: true }).click();
    await page.waitForTimeout(1200);

    // AD 배지가 붙은 매장 카드가 있으면 그 루트가 버튼이어야 한다(배지만 클릭되는 구조 금지).
    const adBadge = page.locator('[data-tab="community"] span', { hasText: /^AD$/ }).first();
    if (await adBadge.count() === 0) test.skip(true, '지금 유료 노출 매장이 없다');
    const root = adBadge.locator('xpath=ancestor::button[1]');
    await expect(root, 'AD 배지가 버튼 안에 있지 않다 — 카드 전체가 클릭 대상이 아니다').toHaveCount(1);
  });

  test('🔴 유료 노출(TOP) 일정 카드가 키보드로 열린다', async ({ page }) => {
    // 운영 일정이 0건이라 실데이터로는 확인할 수 없다 — 부스트 일정을 주입해 **실제로** 검증한다.
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(SCHEDULES_REST, (r: Route) => r.fulfill(json([schedRow('s-top', '유료 노출 대회')])));
    await page.goto('/?tab=browse');
    await dismissOverlays(page);

    const card = page.locator('[data-tab="browse"] article').filter({ hasText: '유료 노출 대회' }).first();
    await expect(card, '주입한 일정이 목록에 없다').toBeVisible({ timeout: 20_000 });
    await expect(card).toHaveAttribute('role', 'button');   // 보조기기가 클릭 대상으로 읽는다
    await expect(card).toHaveAttribute('tabindex', '0');    // 탭 순회에 들어온다

    // 실제로 키보드로 열려야 한다 — 속성만 붙이고 동작이 없으면 의미가 없다
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[role="dialog"]'), 'Enter 로 포스터 상세가 안 열린다').toBeVisible({ timeout: 10_000 });
  });

  test("🔴 '광고 문의' placeholder 는 게재물이 아니다 — 실제 AD 로 세지 않는다", async ({ page }) => {
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissOverlays(page);
    await page.getByRole('button', { name: /내 정보|프로필|로그인/ }).first().click().catch(() => {});
    await page.waitForTimeout(1200);

    const inquiry = page.getByText('광고 문의', { exact: true }).first();
    if (await inquiry.count() === 0) test.skip(true, '이 화면에 광고 문의 항목이 없다');
    // 문의는 mailto 링크 — 목적지가 분명하고, AD 배지를 달지 않는다
    const href = await inquiry.locator('xpath=ancestor::a[1]').getAttribute('href');
    expect(href, '광고 문의에 목적지가 없다').toMatch(/^mailto:/);
    await expect(inquiry.locator('xpath=ancestor::a[1]').getByText('AD', { exact: true }), 'placeholder 에 AD 배지가 붙었다').toHaveCount(0);
  });
});
