// 라이브 카드 — 좌측 '생존/엔트리 · PLAYERS' 열이 값에 따라 잘리지 않는가.
//
// 오너 2026-09-08: "6/6 아래 players 가 있는데 만약 100/120 이런식이면 크기도 문제가 될 뿐더러
//                   아래 players 도 글자가 양 옆이 끊켜있어".
//
// 잠그는 것: 이 열 안의 **잎 텍스트가 제 부모보다 넓지 않은가**(scrollWidth > clientWidth = 잘림).
// 값을 6/6 · 87/213 · 100/120 세 가지로 갈아끼워 전부 확인한다 — 한 값만 재면 두 자리에서 통과하고
// 세 자리에서 깨지는 지금의 결함을 그대로 놓친다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';

const VENUE_ID = '11111111-1111-4111-8111-111111111111';
const iso = (d: Date) => d.toISOString().slice(0, 10);

const clockRow = (alive: number, entries: number) => ({
  venue_id: VENUE_ID, game_seq: 1, session_date: iso(new Date()),
  running: true, current_index: 0, remaining_ms: 540_000,
  ends_at: new Date(Date.now() + 540_000).toISOString(), updated_at: new Date().toISOString(),
  eliminations: entries - alive, adj_entries: 0, adj_rebuys: 0,
  live_stats: { alive, entries, buyInAmount: 1_000_000, avgStack: 68_000 },
  config: { levels: [{ kind: 'level', sb: 50_000, bb: 100_000, ante: 100_000, minutes: 20 }], regCloseLevel: 8 },
  title: '위클리 메인이벤트',
});

const scheduleRow = () => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  title: '위클리 메인이벤트', venue_id: VENUE_ID, pub_name: '누리홀덤 강남점',
  region: '서울 강남', address: '서울 강남구 테헤란로 1',
  date: iso(new Date()), start_time: '19:00:00', duration: '4시간',
  format: 'NLH', guaranteed: true, prize_pool: 10_000_000, prize_percent: null,
  is_competition: true, grade: 'daily', blinds: null,
  buy_in: { amount: 1_000_000, rebuy: 1_000_000, addon: 500_000 },
  display_order: 0, is_premium: false, owner_id: VENUE_ID, approved: true,
  unread_qna_count: 0, view_count: 12, premium_until: null, reg_close_time: '22:00:00',
});

async function seed(page: Page, alive: number, entries: number, withPoster = false) {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(/\/rest\/v1\/schedules\?/, (r) => r.fulfill(json(withPoster ? [scheduleRow()] : [])));
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{
    id: VENUE_ID, name: '누리홀덤 강남점', region: '서울 강남', address: '서울 강남구 테헤란로 1',
    approved: true, status: 'active', is_paid_ad: false, display_order: 1, follower_count: 10, rating: 4.8,
  }])));
  await page.route(/\/rest\/v1\/clock_states\?/, (r) => r.fulfill(json([clockRow(alive, entries)])));
}

/** 라이브 탭 첫 카드의 좌측 열 — 각 줄이 **열 안쪽 폭**을 넘는지 잰다.
 *  ⚠ 줄 자신의 scrollWidth 로는 못 잡는다. 이 열은 items-center + overflow-hidden 이라
 *    줄은 제 내용만큼 넓어지고(= 자기 기준으론 넘침 0) **열이** 그 줄을 좌우로 잘라낸다.
 *    그래서 비교 대상은 언제나 열의 clientWidth 다.
 *  ellipsis(truncate)가 걸린 줄은 '설계된 생략'이라 세지 않는다. */
const measure = (page: Page) => page.evaluate(() => {
  const col = document.querySelector<HTMLElement>('[data-live-players]');
  if (!col) return null;
  const inner = col.clientWidth;
  const rows = [...col.children].map((el) => {
    const s = getComputedStyle(el);
    return {
      text: (el.textContent || '').trim(),
      w: Math.round(el.getBoundingClientRect().width),
      scrollW: el.scrollWidth,
      ellipsis: s.textOverflow === 'ellipsis',
      font: `${s.fontSize}/${s.letterSpacing}`,
    };
  });
  const r = col.getBoundingClientRect();
  return { inner, rows, colW: Math.round(r.width), colH: Math.round(r.height) };
});

for (const [alive, entries] of [[6, 6], [87, 213], [100, 120]] as const) {
  test(`🔴 라이브 카드 ${alive}/${entries} — 좌측 열 글자가 잘리지 않는다`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await seed(page, alive, entries);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '라이브', exact: false }).first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const r = await measure(page);
    console.log(`[라이브 ${alive}/${entries}]`, JSON.stringify(r));
    expect(r, '라이브 카드 좌측 열을 못 찾았다').toBeTruthy();
    const clipped = r!.rows.filter((l) => !l.ellipsis && l.w - r!.inner > 1);
    expect(clipped.map((c) => `${c.text} ${c.w}>${r!.inner}`).join(' / '),
      '좌측 열이 줄을 좌우로 잘라내고 있다').toBe('');
  });
}

// ── 카드 탭이 어디로 가는가(오너 2026-09-08) ────────────────────────────────
// "라이브인 것을 누르면 포스터로 · 포스터 없이 라이브 장부만 쓰는 가게라면 그 매장 커뮤니티 메인홈으로".
// 예전엔 둘 다 관전 클락으로 갔다. 관전은 사라진 게 아니라 1행 끝 눈 아이콘으로 옮겼다 — 그것도 잠근다.
async function openLive(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '라이브', exact: false }).first().click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

test('🔴 포스터가 있으면 카드 탭 → 포스터', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, 87, 213, true);
  await openLive(page);
  await page.locator('[aria-label*="포스터 열기"]').first().click({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  // 포스터 상세만 가진 것으로 확인한다 — '블라인드' 탭(메인·블라인드·프라이즈·매장정보·Q&A).
  // 카드에도 있는 문자열(매장명 등)로 확인하면 모달이 안 열려도 통과한다.
  await expect(page.getByRole('tab', { name: '블라인드' })).toBeVisible({ timeout: 8_000 });
});

test('🔴 포스터가 없으면 카드 탭 → 그 매장 커뮤니티', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, 87, 213, false);
  await openLive(page);
  await page.locator('[aria-label*="매장 커뮤니티 열기"]').first().click({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  // 매장 페이지만 가진 행동 — 카드에는 없다(카드에도 있는 매장명으로 재면 안 열려도 통과한다).
  // 매장 페이지만 가진 행동 두 개 — QR 체크인·길찾기. 카드에는 없다.
  await expect(page.getByText('QR 체크인').first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('길찾기').first()).toBeVisible();
});

test('🔴 관전 클락은 눈 아이콘으로 남아 있다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await seed(page, 87, 213, true);
  await openLive(page);
  const eye = page.locator('[aria-label*="관전 클락 열기"]').first();
  await expect(eye).toBeVisible({ timeout: 10_000 });
  // 히트영역이 WCAG 2.5.8 AA(24×24) 를 넘는가 — 아이콘 자체는 12px 라 ::before 로 넓혔다.
  const hit = await eye.evaluate((el) => {
    const b = getComputedStyle(el, '::before');
    const r = el.getBoundingClientRect();
    const inset = (v: string) => Math.abs(parseFloat(v) || 0);
    return { w: r.width + inset(b.left) + inset(b.right), h: r.height + inset(b.top) + inset(b.bottom) };
  });
  console.log('[관전 히트영역]', JSON.stringify(hit));
  expect(hit.w).toBeGreaterThanOrEqual(24);
  expect(hit.h).toBeGreaterThanOrEqual(24);
});
