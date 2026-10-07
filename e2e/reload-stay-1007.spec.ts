// 새로고침하면 보던 화면에 머문다 — 오너 2026-10-07: "커뮤니티-게시판에서 새로고침을 하면 홈으로 넘어가. 다른 페이지에서도 이건 있으면 안 돼.
//   새로고침하면 홈이 아니라 그 페이지에 남아 있어야 해." (구현: src/lib/reloadTab.ts — navigation type 'reload' + 창별 sessionStorage)
//   ① 최상위 탭·하위 탭이 그대로다 ② **첫 프레임부터** 그 탭이다 — rAF 로 모든 프레임을 적어 홈 판(main[data-tab=home])이 0 프레임,
//      하위 탭 알약이 첫 칸에서 미끄러져 오지 않는다(알약과 활성 칸의 거리가 처음부터 끝까지 같다)
//   ③ 새로고침이 아닌 진입(주소로 새로 들어옴·다른 사이트에서 돌아옴)은 종전대로 홈(오너 2026-09-04) ④ 권한 없는 계정은 내 매장 → 홈.
// 음성 대조: origin/main 095079f6 빌드에서 ①② 계열 FAIL(내 매장 탭만 PR #203 이 살렸다 — 하위 섹션은 대시보드), ③④ 는 두 빌드 모두 PASS(종전 동작 고정).
// 실행: E2E_BASE_URL=http://localhost:4173 E2E_SUPABASE_URL=https://e2efake.supabase.co npx playwright test e2e/reload-stay-1007.spec.ts
//   (가짜 env 빌드: VITE_SUPABASE_URL=https://e2efake.supabase.co VITE_SUPABASE_ANON_KEY=e2e-fake-anon-key npx vite build --outDir <임시>)
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore, MOCK_UID, MOCK_VENUE } from './_mockOwner';
import { mockPosts } from './_mocks';

type Frame = { panes: string[]; nav: string | null; act: string | null; dx: number | null };
type Probe = { act: string; pill?: string };

/** 매 프레임 — 보이는 최상위 판 · 하단 탭바의 현재 칸 · 하위 탭의 활성 칸 글자 · 알약과 활성 칸의 가로 거리. CLS 도 함께. */
async function recordFrames(page: Page, probe: Probe | null) {
  await page.addInitScript((p) => {
    const w = window as unknown as { __f: Frame[]; __cls: number };
    w.__f = []; w.__cls = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* 미지원 */ }
    const tick = () => {
      const panes = [...document.querySelectorAll<HTMLElement>('.tab-pane[data-tab]')].filter((m) => m.getClientRects().length > 0).map((m) => m.dataset.tab ?? '');
      const nav = document.querySelector('nav[aria-label="하단 내비게이션"] [aria-current="page"]')?.getAttribute('aria-label') ?? null;
      let act: string | null = null; let dx: number | null = null;
      if (p) {
        const a = [...document.querySelectorAll<HTMLElement>(p.act)].find((x) => x.getClientRects().length > 0);
        act = a ? (a.textContent ?? '').trim() : null;
        const pill = p.pill ? [...document.querySelectorAll<HTMLElement>(p.pill)].find((x) => x.getClientRects().length > 0) : null;
        if (a && pill && getComputedStyle(pill).opacity !== '0') dx = Math.round(pill.getBoundingClientRect().left - a.getBoundingClientRect().left);
      }
      w.__f.push({ panes, nav, act, dx });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, probe);
}

/** 새로고침하고 정착할 때까지 기다린 뒤 프레임 기록을 돌려준다.
 *  ⚠ CPU 4배 감속으로 부팅한다(design-review P3-4, 2026-10-07). 감속 없이 재면 CLS 가 **러너 부하에 따라** 갈렸다 — 데이터가 첫 페인트 전에
 *    오면 0, 뒤에 오면 그 칸만큼 밀린다(관리자 1회차 0.131 / 2회차 0 · workers 3). 늘 느린 길로 부팅해 그 밀림을 매번 재는 쪽으로 고정했다
 *    (임계 0.1 은 그대로). 이 감속에서 관리자 운영 지표 격자가 늦게 끼어들어 0.102 를 냈고, 격자 자리를 미리 잡아 고쳤다(AdminTab StatsPanel). */
async function reloadAndRead(page: Page, tab: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    await page.reload();
    await expect(page.locator(`.tab-pane[data-tab="${tab}"]`), `새로고침했더니 ${tab} 이 아니다(홈으로 갔다)`).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  return page.evaluate(() => ({ f: (window as unknown as { __f: Frame[] }).__f, cls: (window as unknown as { __cls: number }).__cls }));
}

/** 첫 프레임부터 그 탭 · 홈 판 0 프레임 · (하위 탭) 처음 보인 순간부터 그 칸 · 알약이 미끄러지지 않는다. */
function expectStayed(r: { f: Frame[]; cls: number }, tab: string, label: string, sub?: string, navLabel?: string) {
  const react = r.f.filter((x) => x.panes.length > 0);
  const shell = r.f.findIndex((x) => x.panes.length > 0);
  console.log(`[${label}] frames=${r.f.length} shellFrames=${shell} cls=${r.cls.toFixed(4)} first=${JSON.stringify(react[0])}`);
  expect(react.length, '앱 판이 한 번도 안 그려졌다(전제)').toBeGreaterThan(0);
  expect(r.f.filter((x) => x.panes.includes('home')).length, `${label}: 새로고침 중 홈 판이 보인 프레임`).toBe(0);
  expect(react[0].panes, `${label}: 첫 앱 프레임이 ${tab} 이 아니다`).toEqual([tab]);
  if (navLabel) expect(r.f.filter((x) => x.nav !== null && x.nav !== navLabel).map((x) => x.nav), `${label}: 하단 탭바가 다른 칸을 가리킨 프레임`).toEqual([]);
  if (sub) {
    const seen = r.f.filter((x) => x.act !== null);
    expect(seen.length, `${label}: 하위 탭이 안 보였다(전제)`).toBeGreaterThan(0);
    expect([...new Set(seen.map((x) => x.act))], `${label}: 하위 탭이 처음부터 '${sub}' 가 아니다`).toEqual([sub]);
    const dxs = [...new Set(r.f.filter((x) => x.dx !== null).map((x) => x.dx))];
    expect(dxs.length, `${label}: 알약이 미끄러졌다(활성 칸과의 거리 ${JSON.stringify(dxs)})`).toBeLessThanOrEqual(1);
  }
  expect(r.cls, `${label}: 새로고침 부팅 CLS`).toBeLessThan(0.1);
}

/** 장터 공지·매물을 고정한다(빈 목록 즉시 응답). 운영 데이터로 두면 공지가 첫 페인트 뒤에 오는 회차만 그 높이(실측 210px)가 끼어들어
 *  CLS 가 0.21 로 튀었다(전량 e2e 부하 1회 · 공지 1.5초 지연 재현 0.178). 그 늦은 공지 밀림은 새로고침 복원과 무관한 직접 진입 부류라
 *  따로 다루고, 이 스펙은 같은 데이터에서 복원이 밀림을 만들지 않는지만 본다(게시판 글을 mockPosts 로 고정하는 것과 같은 이유). */
const pinMarket = (page: Page) => page.route(/\/rest\/v1\/marketplace_(notices|listings)\?/, (r) => (r.request().method() === 'GET'
  ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.fallback()));
const click = (page: Page, sel: string) => page.evaluate((s) => { document.querySelector<HTMLElement>(s)?.click(); }, sel);
const gotoTab = (page: Page, t: string) => page.evaluate((x) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: x })), t);
const M390 = { width: 390, height: 844 };
const SECBAR = { act: '[data-community-secbar] [aria-pressed="true"]', pill: '[data-community-secbar] [data-sliding-pill]' };

// ── 커뮤니티 하위 탭 ───────────────────────────────────────────────────────────────────────────
for (const c of [{ sec: 'board', label: '게시판' }, { sec: 'market', label: '장터' }, { sec: 'live', label: '실시간' }]) {
  test(`① 390 커뮤니티 · ${c.label} 에서 새로고침하면 그 하위 탭 그대로 · 첫 프레임부터`, async ({ page }) => {
    test.setTimeout(90_000);
    await recordFrames(page, SECBAR);
    await mockPosts(page, 12);
    await pinMarket(page);
    await bootOwner(page, { viewport: M390 });
    await page.locator('nav[aria-label="하단 내비게이션"] button[aria-label="커뮤니티"]').click();
    await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
    await click(page, `[data-testid="sec-tab-${c.sec}"]`);
    await expect(page.locator(`[data-testid="sec-tab-${c.sec}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600);
    const want = (await page.locator(`[data-testid="sec-tab-${c.sec}"]`).textContent())?.trim() ?? '';
    const r = await reloadAndRead(page, 'community');
    expectStayed(r, 'community', `커뮤니티·${c.label}`, want, '커뮤니티');
  });
}

test('① 390 커뮤니티 · 순위 · 명예의 전당 — 순위판까지 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  await recordFrames(page, { act: '[data-sec="rank"] button[aria-current="true"]', pill: '[data-sec="rank"] [data-sliding-pill]' });
  await bootOwner(page, { viewport: M390 });
  await page.locator('nav[aria-label="하단 내비게이션"] button[aria-label="커뮤니티"]').click();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  await click(page, '[data-testid="sec-tab-rank"]');
  const hall = page.locator('[data-sec="rank"] button').filter({ hasText: /^명예의 전당$/ });
  await expect(hall).toBeVisible({ timeout: 20_000 });
  await hall.evaluate((b: HTMLElement) => b.click());
  await expect(hall).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(600);
  const r = await reloadAndRead(page, 'community');
  expectStayed(r, 'community', '커뮤니티·순위·명예의 전당', '명예의 전당', '커뮤니티');
});

// ── 라이브 · GTO · 일정 탐색 ─────────────────────────────────────────────────────────────────────
test('① 390 라이브에서 새로고침하면 라이브', async ({ page }) => {
  test.setTimeout(90_000);
  await recordFrames(page, null);
  await bootOwner(page, { viewport: M390 });
  await page.locator('nav[aria-label="하단 내비게이션"] button[aria-label^="라이브"]').click();
  await expect(page.locator('.tab-pane[data-tab="live"]')).toBeVisible({ timeout: 20_000 });
  const r = await reloadAndRead(page, 'live');
  expectStayed(r, 'live', '라이브');
});

test('① 390 GTO · 트레이너 분류에서 새로고침하면 그 분류 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  await recordFrames(page, { act: 'main[data-tab="tools"] [data-lane][aria-pressed="true"]' });
  await bootOwner(page, { viewport: M390 });
  await page.locator('nav[aria-label="하단 내비게이션"] button[aria-label="GTO"]').click();
  await expect(page.locator('[data-lane="train"]')).toBeVisible({ timeout: 20_000 });
  await click(page, '[data-lane="train"]');
  await expect(page.locator('[data-lane="train"]')).toHaveAttribute('aria-pressed', 'true');
  const want = (await page.locator('[data-lane="train"]').textContent())?.trim() ?? '';
  const r = await reloadAndRead(page, 'tools');
  expectStayed(r, 'tools', 'GTO·트레이너', want, 'GTO');
});

test('① 390 일정 탐색에서 새로고침하면 일정 탐색', async ({ page }) => {
  test.setTimeout(90_000);
  await recordFrames(page, null);
  await bootOwner(page, { viewport: M390 });
  await gotoTab(page, 'browse');
  await expect(page.locator('main[data-tab="browse"]')).toBeVisible({ timeout: 20_000 });
  const r = await reloadAndRead(page, 'browse');
  expectStayed(r, 'browse', '일정 탐색');
});

// ── 내 정보(전면 페이지) · 하위 탭 ──────────────────────────────────────────────────────────────
test('① 390 내 정보 · 설정 탭에서 새로고침하면 내 정보 설정 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  const me = '[role="dialog"][aria-label^="내 정보"]';
  await recordFrames(page, { act: `${me} [role="tab"][aria-selected="true"]` });
  await bootOwner(page, { viewport: M390, profile: { role: 'user', venue_id: null } }); // 일반 회원
  await page.locator('nav[aria-label="하단 내비게이션"] button[aria-label="커뮤니티"]').click();
  await page.locator('header button[aria-label$=" 메뉴"]').click(); // 헤더 아바타 → 드롭다운 '내 정보 열기'
  await expect(page.locator('header button[aria-label="내 정보 열기"]')).toBeAttached();
  await click(page, 'header button[aria-label="내 정보 열기"]');
  const tab = page.locator(`${me} [role="tab"]`).filter({ hasText: /^설정$/ });
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await page.waitForTimeout(600);
  const r = await reloadAndRead(page, 'community');
  await expect(page.locator(me), '새로고침했더니 내 정보가 닫혔다').toBeVisible({ timeout: 20_000 });
  const r2 = await page.evaluate(() => (window as unknown as { __f: Frame[] }).__f);
  expectStayed({ f: r2, cls: r.cls }, 'community', '내 정보·설정', '설정');
  // 닫으면(뒤로가기) 그 밑의 탭으로 — 앱 밖으로 나가지 않는다
  await page.goBack();
  await expect(page.locator(me)).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('main[data-tab="community"]')).toBeVisible();
});

// ── 내 매장(1440) · 하위 섹션 ───────────────────────────────────────────────────────────────────
test('① 1440 내 매장 · 매장 설정 › 게임 프리셋에서 새로고침하면 그 섹션·하위 탭 그대로(대시보드를 거치지 않는다)', async ({ page }) => {
  test.setTimeout(90_000);
  await recordFrames(page, { act: '[data-mystore-secbar] [data-mystore-active]' });
  await bootOwner(page);
  await openMyStore(page);
  const set = page.locator('[data-mystore-secbar] button').filter({ hasText: /^매장 설정$/ });
  await expect(set).toBeVisible({ timeout: 20_000 });
  await set.click();
  const presets = page.locator('main[data-tab="my-store"] [role="tab"][data-tab-id="presets"]');
  await expect(presets).toBeVisible({ timeout: 20_000 });
  await presets.click();
  await expect(presets).toHaveAttribute('aria-selected', 'true');
  await page.waitForTimeout(600);
  const r = await reloadAndRead(page, 'my-store');
  expectStayed(r, 'my-store', '내 매장·매장 설정', '매장 설정');
  await expect(page.locator('main[data-tab="my-store"] [role="tab"][data-tab-id="presets"]'), '설정 하위 탭이 첫 칸으로 돌아갔다').toHaveAttribute('aria-selected', 'true');
});

test('① 1440 관리자 · 회원 관리에서 새로고침하면 그 섹션 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  await recordFrames(page, { act: '[data-admin-secbar] [data-admin-active]' });
  await bootOwner(page, { profile: { role: 'admin' } });
  await page.getByRole('tab', { name: '관리자 설정', exact: true }).first().click();
  const users = page.locator('[data-admin-secbar] button').filter({ hasText: /^회원 관리$/ });
  await expect(users).toBeVisible({ timeout: 20_000 });
  await users.click();
  await expect(users).toHaveAttribute('data-admin-active', 'true');
  await page.waitForTimeout(600);
  const r = await reloadAndRead(page, 'admin');
  expectStayed(r, 'admin', '관리자·회원 관리', '회원 관리');
});

// ── 종전 동작 고정(두 빌드 모두 PASS 여야 한다) ─────────────────────────────────────────────────
test('③ 390 새로고침이 아닌 진입 — 주소로 새로 들어오거나 다른 사이트에서 돌아오면 홈(오너 2026-09-04)', async ({ page }) => {
  test.setTimeout(90_000);
  await mockPosts(page, 12);
  await bootOwner(page, { viewport: M390 });
  await page.locator('nav[aria-label="하단 내비게이션"] button[aria-label="커뮤니티"]').click();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  await click(page, '[data-testid="sec-tab-board"]');
  await expect(page.locator('[data-testid="sec-tab-board"]')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
  await page.goto('/');
  await expect(page.locator('main[data-tab="home"]'), '주소로 새로 들어왔는데 홈이 아니다').toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main[data-tab="community"]')).toBeHidden();
  // 다시 커뮤니티로 가 본 뒤, 다른 사이트에 갔다가 뒤로가기로 돌아온다
  await page.locator('nav[aria-label="하단 내비게이션"] button[aria-label="커뮤니티"]').click();
  await expect(page.locator('main[data-tab="community"]')).toBeVisible({ timeout: 20_000 });
  await page.goto('about:blank');
  await page.goBack();
  await page.waitForTimeout(1500);
  const shown = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tab-pane[data-tab]')].filter((m) => m.getClientRects().length > 0).map((m) => m.dataset.tab));
  const navType = await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type);
  console.log('[③ 돌아옴]', navType, JSON.stringify(shown));
  // bfcache 로 되살아난 페이지는 떠나기 전 그대로다(새로 부팅하지 않는다) — 그건 이 변경과 무관한 브라우저 동작이라 부팅한 경우만 판정한다.
  if (navType === 'back_forward') expect(shown, '다른 사이트에서 돌아왔는데 홈이 아니다').toEqual(['home']);
});

test('④ 1440 권한이 사라진 계정 — 내 매장에서 새로고침하면 홈', async ({ page }) => {
  test.setTimeout(90_000);
  let role = 'venue_owner';
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: MOCK_UID, name: '업주', nickname: '업주', role, approved: true, status: 'active', venue_id: role === 'user' ? null : MOCK_VENUE, activity_points: 0, created_at: '2026-01-01T00:00:00Z', consented_legal_version: 3 }),
      })));
    },
  });
  await openMyStore(page);
  await expect(page.locator('main[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
  role = 'user';
  await page.reload();
  await expect(page.locator('main[data-tab="home"]'), '권한이 없는데 홈으로 가지 않았다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  await expect(page.locator('main[data-tab="my-store"]')).toHaveCount(0);
});
