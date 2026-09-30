// 2026-09-28 사용자 화면 전수 점검(design-reviewer) 후속 — 누름면·대비·피드백 잠금.
//
// 판정은 상자 크기가 아니라 **elementFromPoint** 다(market-hit.spec 과 같은 조리법): 중심에서 위·아래로 0.5px 씩 나가며
// 그 요소(또는 자손·라벨 짝)가 잡히는 연속 길이. ::before 확장도 잡히고, 이웃이 덮은 곳은 빠진다 — "숫자는 맞는데 안 눌리는" 부류.
// 음성 대조(수정 전 빌드 8116f049): 헤더 아이콘 39 · 로그인 30.75 · 알림 세그먼트 26 · 모두 읽음 25.25 · 약관 탭 34.75 ·
//   매장명 26.25 · 주소 30.75 · 참가 예약 줄 22.25 · 예약하기 41.75 · 자동 로그인 줄 빈 곳 무반응 · 새로고침 표시 없음 ·
//   판매자 아바타 배경 투명(라이트 1.12:1) — 전부 FAIL.
// 실행: E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/tap-contrast-0928.spec.ts --project=mobile-chromium
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays, stubLogin } from './_session';
import { kstToday } from '../src/lib/kst';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** sel 로 찾은 보이는 요소들의 세로 실효 누름 길이(px). 라벨로 감싼 체크박스는 라벨까지 자기 것으로 센다. */
async function vhits(page: Page, sel: string, text?: string) {
  return page.evaluate(([sel, text]) => {
    const own = (t: Element, h: Element | null) => !!h && (t === h || t.contains(h));
    const run = (t: Element, x: number, cy: number, dy: number) => { let d = 0; while (d < 60 && own(t, document.elementFromPoint(x, cy + dy * (d + 0.5)))) d += 0.5; return d; };
    return [...document.querySelectorAll(sel)]
      .filter((e) => e.getClientRects().length && !e.closest('[inert],[aria-hidden="true"],[data-pane-leaving]') && (!text || (e.textContent ?? '').includes(text)))
      .map((t) => {
        (t as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
        const b = t.getBoundingClientRect(); const x = b.left + b.width / 2, cy = b.top + b.height / 2;
        return { label: ((t.getAttribute('aria-label') || t.textContent) ?? '').trim().slice(0, 12), box: +b.height.toFixed(2), w: +b.width.toFixed(2), h: run(t, x, cy, -1) + run(t, x, cy, 1) };
      });
  }, [sel, text ?? ''] as const);
}
const short = (rows: { label: string; h: number }[]) => rows.filter((r) => r.h < 43.5).map((r) => `${r.label} ${r.h}`);

for (const w of [360, 390]) {
  test(`헤더 아이콘·로그인 ${w} — 세로 누름면 44, 폭·제목은 그대로`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: w, height: 800 });
    await stabilizeBackstack(page);
    await page.goto('/');
    await dismissOverlays(page);
    await expect(page.locator('header button[aria-label="로그인"]')).toBeVisible({ timeout: 20_000 });
    const rows = [
      ...(await vhits(page, 'header button[aria-label$="모드로 전환"]')),
      ...(await vhits(page, 'header button[aria-label^="알림"]')),
      ...(await vhits(page, 'header button[aria-label="로그인"]')),
    ];
    console.log(`[tap0928 header ${w}] ${rows.map((r) => `${r.label} box=${r.w}×${r.box} hit=${r.h}`).join(' | ')}`);
    expect(rows.length, '헤더 버튼 3개를 다 못 찾았다').toBe(3);
    expect(short(rows)).toEqual([]);
    // 가로는 늘리지 않았다 — 보이는 원 38.25·로그인 폭 그대로(360 헤더 제목 잘림 재발 방지)
    expect(rows.slice(0, 2).map((r) => r.w)).toEqual([38.25, 38.25]);
    const cut = await page.locator('header [aria-current="page"]').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(cut, '헤더 제목이 잘렸다').toBeLessThanOrEqual(0);
  });
}

test('약관 시트 탭(UnderlineTabs sm) — 세로 누름면 44', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.locator('footer button', { hasText: '이용약관' }).first().evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('[data-legal-tabbar] [role=tab]').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);
  const rows = await vhits(page, '[data-legal-tabbar] [role=tab]');
  console.log(`[tap0928 legal] ${rows.map((r) => `${r.label} ${r.box}→${r.h}`).join(' | ')}`);
  expect(rows.length).toBe(4);
  expect(short(rows)).toEqual([]);
});

test('로그인 시트 — 자동 로그인 줄의 빈 곳을 눌러도 체크가 바뀐다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.locator('header button[aria-label="로그인"]').click();
  const box = page.getByTestId('auto-login');
  await expect(box).toBeVisible({ timeout: 15_000 });
  const before = await box.isChecked();
  // 시트가 올라오는 중에 좌표를 재면 누를 때 이미 다른 자리다 — 두 번 재서 같을 때까지 기다린다(병렬 부하에서 실제로 빗나갔다)
  const rowRect = () => box.evaluate((i) => { const row = i.closest('label')!.getBoundingClientRect(); return { x: row.right - 3, y: row.bottom - 3, h: row.height }; });
  await expect.poll(async () => { const a = await rowRect(); await page.waitForTimeout(150); const b = await rowRect(); return a.y === b.y && a.x === b.x; }, { timeout: 10_000 }).toBe(true);
  // 줄(44px) 오른쪽 끝·아래 가장자리 — 글자 밖의 빈 곳
  const r = await rowRect();
  expect(r.h).toBeGreaterThanOrEqual(43.5);
  await page.mouse.click(r.x, r.y);
  await expect(box).toBeChecked({ checked: !before });
});

// ── 일정 상세 ──────────────────────────────────────────────────────────────
const VENUE_ID = '33333333-3333-4333-8333-333333333309';
const TITLE = '누름면 점검 대회';
const SROW = {
  id: 'cccccccc-0000-4000-8000-000000000928', title: TITLE,
  venue_id: VENUE_ID, pub_name: '누리 누름면 홀덤펍', region: '서울', address: '서울 강남구 테헤란로 1',
  date: kstToday(Date.now()), start_time: '23:30:00', duration: '4시간', format: 'NLH',
  guaranteed: true, prize_pool: 10_000_000, prize_percent: null, is_competition: false, grade: null, blinds: null,
  buy_in: { amount: 100_000, gameType: '홀덤' }, display_order: 0, is_premium: false, owner_id: VENUE_ID, approved: true,
  unread_qna_count: 0, view_count: 1, premium_until: null, reg_close_time: '12LV 00:30', structure: null,
};
const VENUE = { id: VENUE_ID, name: '누리 누름면 홀덤펍', region: '서울', address: '서울 강남구 테헤란로 1', approved: true, status: 'active', is_paid_ad: false, display_order: 1, follower_count: 0, rating: null };

async function mockAll(page: Page, extra?: (url: string) => unknown) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const x = extra?.(url);
    if (x !== undefined) return x instanceof Promise ? x.then((b) => route.fulfill(json(b))) : route.fulfill(json(x));
    if (/\/rest\/v1\/schedules/.test(url)) return route.fulfill(json([SROW]));
    if (/\/rest\/v1\/venues/.test(url)) return route.fulfill(json([VENUE]));
    if (/\/rest\/v1\//.test(url)) return route.fulfill(json([]));
    if (/supabase\.co/.test(url)) return route.fulfill(json({}));
    return route.abort('blockedbyclient');
  });
}

for (const w of [360, 390]) {
  test(`일정 상세 ${w} — 매장명·주소·참가 예약 줄·예약하기 세로 44`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: w, height: 844 });
    await mockAll(page);
    await page.goto('/');
    const card = page.locator('[data-testid="home-schedule"] article[role=button]').filter({ hasText: TITLE }).first();
    await card.waitFor({ timeout: 20_000 });
    await card.locator('h3').evaluate((h: HTMLElement) => h.click());
    const dlg = page.getByRole('dialog').filter({ hasText: TITLE }).last();
    await expect(dlg.locator('a[href*="map.kakao.com"]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(900);
    const rows = [
      ...(await vhits(page, '[role=dialog] button', '누리 누름면 홀덤펍')).slice(0, 1),
      ...(await vhits(page, '[role=dialog] a[href*="map.kakao.com"]')),
      ...(await vhits(page, '[role=dialog] button[aria-expanded]', '참가 예약')),
      ...(await vhits(page, '[role=dialog] button', '예약하기')).filter((r) => r.label === '예약하기'),
    ];
    console.log(`[tap0928 sched ${w}] ${rows.map((r) => `${r.label} ${r.box}→${r.h}`).join(' | ')}`);
    expect(rows.length, '대상 4개를 다 못 찾았다').toBe(4);
    expect(short(rows)).toEqual([]);
  });
}

test('라이브 새로고침 — 누르면 도는 표시 → 완료 표시 → 원래 글자, 폭 불변', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  let slow = false;
  await mockAll(page, (url) => (/\/rest\/v1\/clock_states/.test(url) && slow ? new Promise((r) => setTimeout(() => r([]), 700)) : undefined));
  await page.goto('/?tab=live');
  const btn = page.getByTestId('live-refresh');
  await expect(btn).toBeVisible({ timeout: 20_000 });
  const w0 = await btn.evaluate((b) => b.getBoundingClientRect().width);
  slow = true;
  await btn.evaluate((b: HTMLElement) => b.click());
  await expect(btn).toHaveAttribute('data-state', 'busy');
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  expect(await btn.evaluate((b) => b.getBoundingClientRect().width)).toBeCloseTo(w0, 1);
  await expect(btn).toHaveAttribute('data-state', 'done', { timeout: 5_000 });
  await expect(btn.locator('[aria-live]')).toHaveText('목록을 새로 불러왔습니다');
  await expect(btn).toHaveAttribute('data-state', 'idle', { timeout: 5_000 });
});

// ── 로그인 상태: 알림 패널 세그먼트·모두 읽음 ────────────────────────────────
test('알림 패널 — 쪽지/알림·전체/안읽음·모두 읽음 세로 44', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const uid = await stubLogin(page);
  const now = Date.now();
  const notifs = [0, 1].map((i) => ({ id: `n${i}`, type: 'system', title: `점검 알림 ${i}`, message: '본문', link: null, read: false, created_at: new Date(now - i * 60e3).toISOString(), user_id: uid }));
  await page.route(/\/rest\/v1\/notifications\?/, (r) => (r.request().method() === 'HEAD'
    ? r.fulfill({ status: 200, headers: { 'content-range': `0-1/${notifs.length}` } }) : r.fulfill(json(notifs))));
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.locator('header button[aria-label^="알림"]').click();
  await expect(page.locator('[data-notif-tabbar] [role=tab]').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-notif-tabbar] [role=tab]', { hasText: '알림' }).evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('[data-notif-actions] button', { hasText: '모두 읽음' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(600);
  const rows = [
    ...(await vhits(page, '[data-notif-tabbar] [role=tab]')),
    ...(await vhits(page, '[data-notif-actions] [role=tab]')),
    ...(await vhits(page, '[data-notif-actions] button', '모두 읽음')).filter((r) => r.label === '모두 읽음'),
  ];
  console.log(`[tap0928 notif] ${rows.map((r) => `${r.label} ${r.box}→${r.h}`).join(' | ')}`);
  expect(rows.length).toBe(5);
  expect(short(rows)).toEqual([]);
});

// ── 장터: 색이 없는 매물(운영 3건 전부 null 이었다)의 판매자 아바타 ─────────────────
test('장터 상세 판매자 아바타 — seller_avatar_color 가 null 이어도 라이트에서 글자 대비 4.5 이상', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { try { localStorage.setItem('nuri-theme', 'light'); } catch { /* 차단 */ } });
  const row = {
    id: '11111111-1111-4111-8111-111111110928', title: '색 없는 매물', category: 'pokerGear', description: 't', price: 10_000, condition: 'B',
    status: 'on_sale', images: [], region: '서울', shipping_available: false, pickup_only: true, seller_id: '00000000-0000-4000-8000-0000000000e9',
    seller_name: '판매자', seller_avatar_color: null, seller_trade_count: 0, seller_verified: false, created_at: new Date().toISOString(),
    view_count: 0, like_count: 0, comment_count: 0,
  };
  await page.route(/\/rest\/v1\/marketplace_listings\?/, (r) => r.fulfill(json(r.request().headers()['accept']?.includes('pgrst.object') ? row : [row])));
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '장터', exact: true }).first().click({ timeout: 15_000 });
  await page.getByText('색 없는 매물').first().click({ timeout: 15_000 });
  const av = page.getByRole('dialog').locator('div.rounded-full', { hasText: /^판$/ }).first();
  await expect(av).toBeVisible({ timeout: 15_000 });
  const m = await av.evaluate((el) => {
    const p = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const L = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const cs = getComputedStyle(el); const bg = p(cs.backgroundColor), fg = p(cs.color);
    const a = bg.length > 3 ? bg[3] : 1; const l1 = L(fg), l2 = L(bg);
    return { bg: cs.backgroundColor, alpha: a, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
  });
  console.log(`[tap0928 market avatar] bg=${m.bg} a=${m.alpha} ratio=${m.ratio.toFixed(2)}`);
  expect(m.alpha, `아바타 배경이 투명하다(${m.bg}) — 흰 이니셜이 라이트 지면에 묻힌다`).toBe(1);
  expect(m.ratio).toBeGreaterThanOrEqual(4.5);
});
