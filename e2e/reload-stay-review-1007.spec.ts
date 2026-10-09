// PR #208(새로고침하면 보던 화면에 머문다) design-review 지적 반영 — 원문: Documents/누리홀덤_영상분석_0930/reload-stay-1007/design-review.md
//   P2-1 여러 매장 업주: B 매장 장부에서 새로고침하면 **B 매장** 그대로(섹션만 살고 매장이 A 로 돌아가면 다른 매장 장부에 적는다)
//        · 남긴 매장이 서버 목록(my_member_venues) 밖이면 대표 매장 + 대시보드
//   P2-2 글 상세를 보다가 새로고침하면 그 글 그대로(?post= 가 열린 동안만 주소에 남는다) · 뒤로가기로 닫으면 주소에서 빠진다
//        · 그 사이 지워진 글이면 안내 + 커뮤니티, 주소에서 빠진다
//   P2-3 새로고침 정적 셸이 '홈'(제목·홈 골격·탭바 강조)을 그리지 않는다 — 홈에서 새로고침하면 종전대로 홈 셸
//   P3-3 홈에서 새로고침한 뒤 처음 연 커뮤니티는 새로고침 **전** 섹션이 아니라 기본 섹션(지연 모듈도 부팅 판정을 따른다)
//   P3-1 게시판·장터 분류 칩이 새로고침 뒤 그대로
// 음성 대조(2026-10-07): 수정 전 빌드(e28251ad · 공개 anon env)에서 7건 전부 FAIL —
//   P2-1 ① 고르개 A + 새로고침 뒤 A 매장 권한·장부 조회 24건 · ② 목록 밖인데 '게임 진행' 유지 · P2-2 ① 주소에 ?post 없음 · ② 안내 없음
//   · P2-3 셸 '홈' 3/3 프레임 · P3-3 '장터'로 열림 · P3-1 '전체'로 돌아감. 수정 후 7/7 PASS.
// 실행: E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/reload-stay-review-1007.spec.ts
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_VENUE_NAME } from './_mockOwner';
import { mockPosts } from './_mocks';

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const click = (page: Page, sel: string) => page.evaluate((s) => { document.querySelector<HTMLElement>(s)?.click(); }, sel);
const M390 = { width: 390, height: 844 };
const NAV = (l: string) => `nav[aria-label="하단 내비게이션"] button[aria-label^="${l}"]`;

// ── P2-1 여러 매장 업주 ───────────────────────────────────────────────────────────────────────────
const B = '44444444-4444-4444-8444-444444444444';
const B_NAME = '두번째 매장';
type VFrame = { v: string | null; a: string | null; pane: boolean };

async function multiStore(page: Page, list: { ids: string[] }) {
  // 매 프레임 — 매장 고르개 값 · 사이드바의 현재 섹션 · 내 매장 판 표시
  await page.addInitScript(() => {
    const w = window as unknown as { __vf: VFrame[] };
    w.__vf = [];
    const tick = () => {
      const sel = document.querySelector<HTMLSelectElement>('#mystore-venue-pick');
      const act = [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] [data-mystore-active]')].find((x) => x.getClientRects().length > 0);
      const pane = [...document.querySelectorAll<HTMLElement>('.tab-pane[data-tab="my-store"]')].some((m) => m.getClientRects().length > 0);
      w.__vf.push({ v: sel ? sel.value : null, a: act ? (act.textContent ?? '').trim() : null, pane });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/my_member_venues/, (r) => json(r, [
        { id: MOCK_VENUE, name: MOCK_VENUE_NAME, relation: 'owner' }, { id: B, name: B_NAME, relation: 'owner' },
      ].filter((v) => list.ids.includes(v.id))));
    },
  });
  await openMyStore(page);
  const pick = page.locator('#mystore-venue-pick');
  await expect(pick).toBeVisible({ timeout: 20_000 });
  await pick.selectOption(B);
  await expect(pick).toHaveValue(B);
  const game = page.locator('[data-mystore-secbar] button').filter({ hasText: /^게임 진행$/ }).first();
  await expect(game).toBeVisible({ timeout: 20_000 });
  await game.click();
  await expect(page.locator('[data-mystore-secbar] [data-mystore-active]').first()).toHaveText('게임 진행');
  await page.waitForTimeout(800);
}

/** 새로고침 뒤 권한·장부 조회가 어느 매장을 물었는가(요청 주소·본문의 매장 id). */
function watchVenueRequests(page: Page) {
  const seen: { url: string; a: boolean; b: boolean }[] = [];
  page.on('request', (req) => {
    if (!/\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers|can_manage_venue_staff|can_manage_venue_schedules|can_manage_schedule)|\/ledger_|\/clock_states/.test(req.url())) return;
    const s = req.url() + (req.postData() ?? '');
    seen.push({ url: req.url().replace(/^.*\/v1\//, '').slice(0, 60), a: s.includes(MOCK_VENUE), b: s.includes(B) });
  });
  return seen;
}

test('P2-1 ① 1440 여러 매장 업주 — B 매장 › 게임 진행에서 새로고침하면 B 매장 그대로 · A 매장은 한 프레임도 · 한 번도 묻지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  await multiStore(page, { ids: [MOCK_VENUE, B] });
  const seen = watchVenueRequests(page);
  seen.length = 0;
  await page.reload();
  const pick = page.locator('#mystore-venue-pick');
  await expect(pick).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  const f = await page.evaluate(() => (window as unknown as { __vf: VFrame[] }).__vf);
  const vals = [...new Set(f.filter((x) => x.v !== null).map((x) => x.v))];
  const secs = [...new Set(f.filter((x) => x.a !== null).map((x) => x.a))];
  console.log('[P2-1 ①]', JSON.stringify({ frames: f.length, vals, secs, reqA: seen.filter((s) => s.a).map((s) => s.url), reqB: seen.filter((s) => s.b).length }));
  await expect(pick, '새로고침했더니 매장이 대표 매장(A)으로 돌아갔다 — 다른 매장 장부가 열린다').toHaveValue(B);
  expect(vals, '매장 고르개가 B 가 아닌 매장을 보인 프레임이 있다').toEqual([B]);
  expect(secs, '섹션이 처음부터 게임 진행이 아니다').toEqual(['게임 진행']);
  expect(seen.filter((s) => s.b).length, '전제: B 매장 권한·장부를 조회했다').toBeGreaterThan(0);
  expect(seen.filter((s) => s.a).map((s) => s.url), '새로고침 뒤 A 매장 권한·장부를 조회했다(늦은 응답이 B 화면에 섞일 자리)').toEqual([]);
});

test('P2-1 ② 1440 남긴 매장이 내 매장 목록에서 빠졌으면 — 대표 매장의 대시보드', async ({ page }) => {
  test.setTimeout(90_000);
  const list = { ids: [MOCK_VENUE, B] };
  await multiStore(page, list);
  list.ids = [MOCK_VENUE]; // 그 사이 B 매장 소속이 해제됐다
  const seen = watchVenueRequests(page);
  seen.length = 0;
  await page.reload();
  await expect(page.locator('[data-mystore-secbar] [data-mystore-active]').first()).toHaveText('대시보드', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  const f = await page.evaluate(() => (window as unknown as { __vf: VFrame[] }).__vf);
  console.log('[P2-1 ②]', JSON.stringify({ secs: [...new Set(f.filter((x) => x.a !== null).map((x) => x.a))], reqB: seen.filter((s) => s.b).map((s) => s.url) }));
  await expect(page.locator('#mystore-venue-pick'), '매장 하나뿐인데 고르개가 떴다').toHaveCount(0);
  expect([...new Set(f.filter((x) => x.a !== null).map((x) => x.a))], '목록 밖 매장의 섹션(게임 진행)이 한 프레임이라도 보였다').toEqual(['대시보드']);
  expect(seen.filter((s) => s.b).map((s) => s.url), '목록 밖 B 매장을 조회했다').toEqual([]);
});

// ── P2-2 글 상세 ─────────────────────────────────────────────────────────────────────────────────
const PID = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const postRow = (n: number, title: string) => ({
  id: PID(n), user_id: `u-${n}`, user_name: `작성자${n}`, user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${n} `.repeat(20), created_at: `2026-09-0${n}T00:00:00Z`, like_count: 0, comment_count: 0, view_count: 0,
  category: 'free', title, images: [], badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
});
async function installPosts(page: Page, rows: { list: ReturnType<typeof postRow>[] }) {
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r) => json(r, []));
  await page.route(/\/rest\/v1\/community_posts\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const url = r.request().url();
    if (/[?&]id=eq\./.test(url)) {
      const id = /id=eq\.([^&]+)/.exec(url)![1];
      const hit = rows.list.filter((p) => p.id === id);
      const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
      return single ? (hit[0] ? json(r, hit[0]) : r.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: '0 rows' }) })) : json(r, hit);
    }
    if (/bumped_until=gt\./.test(url) || /created_at=lt\.|or=\(/.test(url)) return json(r, []);
    if (/[?&]limit=/.test(url) && !/limit=50/.test(url)) return json(r, []);
    return json(r, rows.list);
  });
}
const postDialog = (page: Page) => page.locator('[role="dialog"]').filter({ has: page.locator('[data-pd-root]') }).first();
async function openPostOnBoard(page: Page, title: string) {
  await page.goto('/');
  await page.locator(NAV('커뮤니티')).click();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  await click(page, '[data-testid="sec-tab-board"]');
  await expect(page.locator('[data-board-loaded="done"]')).toHaveCount(1, { timeout: 15_000 });
  await page.getByText(title).filter({ visible: true }).first().click();
  await expect(postDialog(page)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

test('P2-2 ① 390 글 상세를 보다가 새로고침하면 그 글 그대로 · 뒤로가기로 닫으면 주소에서 빠지고 다시 새로고침해도 안 열린다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(M390);
  await installPosts(page, { list: [postRow(3, '셋째 글 제목'), postRow(2, '둘째 글 제목'), postRow(1, '첫째 글 제목')] });
  await openPostOnBoard(page, '둘째 글 제목');
  expect(new URL(page.url()).searchParams.get('post'), '열린 글이 주소에 없다(새로고침·공유가 같은 글로 못 간다)').toBe(PID(2));
  await page.reload();
  await expect(postDialog(page), '새로고침했더니 글 상세가 닫혔다').toBeVisible({ timeout: 20_000 });
  await expect(postDialog(page).locator('[data-pd-title]').first()).toHaveText('둘째 글 제목');
  await expect(page.locator('.tab-pane[data-tab="community"]'), '상세 밑의 판이 커뮤니티가 아니다').toBeAttached();
  // 닫기(뒤로가기) — 주소에서 빠지고, 그 밑은 커뮤니티
  await page.goBack();
  await expect(postDialog(page)).toBeHidden({ timeout: 10_000 });
  await expect(page).toHaveURL((u) => !u.searchParams.has('post'));
  await expect(page.locator('[data-community-secbar]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(postDialog(page), '닫은 글이 새로고침에 다시 열렸다').toHaveCount(0);
});

test('P2-2 ② 390 보던 글이 그 사이 지워졌으면 — 안내 · 커뮤니티 · 주소에서 빠진다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(M390);
  const rows = { list: [postRow(3, '셋째 글 제목'), postRow(2, '둘째 글 제목'), postRow(1, '첫째 글 제목')] };
  await installPosts(page, rows);
  await openPostOnBoard(page, '둘째 글 제목');
  rows.list = rows.list.filter((p) => p.id !== PID(2));
  await page.reload();
  await expect(page.getByText('삭제되었거나 찾을 수 없는 글입니다').first()).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL((u) => !u.searchParams.has('post'));
  await expect(page.locator('[data-community-secbar]')).toBeVisible();
  await expect(postDialog(page)).toHaveCount(0);
});

// ── P2-3 정적 셸 ─────────────────────────────────────────────────────────────────────────────────
type SFrame = { boot: string | null; title: boolean; pill: boolean; skel: boolean } | null;
async function recordShell(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sf: SFrame[] };
    w.__sf = [];
    const shown = (el: Element | null | undefined) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const tick = () => {
      const shell = document.querySelector('#root > div[aria-hidden="true"]');
      if (!shell) w.__sf.push(null);
      else w.__sf.push({
        boot: document.documentElement.getAttribute('data-boot-tab'),
        title: shown([...shell.querySelectorAll('header span')].find((s) => s.children.length === 0 && (s.textContent ?? '').trim() === '홈')),
        pill: shown(shell.querySelector('nav .pill-active')),
        skel: shown(shell.querySelector('.skeleton')),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function throttledReload(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.reload();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.waitForTimeout(1000);
  return page.evaluate(() => (window as unknown as { __sf: SFrame[] }).__sf.filter((x) => x !== null)) as Promise<NonNullable<SFrame>[]>;
}

test('P2-3 390 커뮤니티에서 새로고침 — 정적 셸이 홈 제목·홈 골격·홈 칸 강조를 그리지 않는다(CPU 4배) · 홈에서 새로고침하면 종전대로 홈 셸', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(M390);
  await mockPosts(page, 12);
  await recordShell(page);
  await page.goto('/');
  await page.locator(NAV('커뮤니티')).click();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  const s = await throttledReload(page);
  await expect(page.locator('.tab-pane[data-tab="community"]')).toBeVisible({ timeout: 20_000 });
  console.log('[P2-3 커뮤니티]', JSON.stringify({ shellFrames: s.length, home: s.filter((x) => x.title || x.pill || x.skel).length, boot: [...new Set(s.map((x) => x.boot))] }));
  expect(s.length, '전제: 정적 셸 프레임을 잡았다').toBeGreaterThan(0);
  expect(s.filter((x) => x.title).length, "정적 셸 제목에 '홈' 이 보인 프레임").toBe(0);
  expect(s.filter((x) => x.pill).length, '정적 셸 탭바가 홈 칸을 강조한 프레임').toBe(0);
  expect(s.filter((x) => x.skel).length, '정적 셸에 홈 골격이 보인 프레임').toBe(0);
  // 양성 대조 — 홈에서 새로고침하면 셸은 종전대로 홈이다(중립화가 홈 부팅까지 지우지 않는다)
  await page.locator(NAV('홈')).click();
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  const h = await throttledReload(page);
  console.log('[P2-3 홈]', JSON.stringify({ shellFrames: h.length, home: h.filter((x) => x.title && x.pill && x.skel).length }));
  expect(h.length).toBeGreaterThan(0);
  expect(h.every((x) => x.boot === null && x.title && x.pill && x.skel), '홈에서 새로고침했는데 홈 셸이 아니다').toBe(true);
});

// ── P3-3 지연 모듈 ───────────────────────────────────────────────────────────────────────────────
test('P3-3 390 커뮤니티 장터를 보다가 홈으로 가서 새로고침 → 커뮤니티를 처음 열면 기본 섹션(새로고침 전 섹션이 아니다)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(M390);
  await page.goto('/');
  await page.locator(NAV('커뮤니티')).click();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  const def = (await page.locator('[data-community-secbar] [aria-pressed="true"]').first().textContent())?.trim();
  await click(page, '[data-testid="sec-tab-market"]');
  await expect(page.locator('[data-testid="sec-tab-market"]')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
  await page.locator(NAV('홈')).click();
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500); // 유휴 프리마운트까지 — 지연 모듈이 실린 뒤에 연다
  await page.locator(NAV('커뮤니티')).click();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  const now = (await page.locator('[data-community-secbar] [aria-pressed="true"]').first().textContent())?.trim();
  console.log('[P3-3]', JSON.stringify({ def, now }));
  expect(now, '홈에서 새로고침했는데 커뮤니티가 새로고침 전 섹션(장터)으로 열렸다').toBe(def);
});

// ── P3-1 분류 칩 ─────────────────────────────────────────────────────────────────────────────────
test('P3-1 390 게시판 분류 칩 · 장터 분류 칩 — 새로고침 뒤 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(M390);
  await mockPosts(page, 12);
  await page.goto('/');
  await page.locator(NAV('커뮤니티')).click();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  // 게시판 › 핸드 분석
  await click(page, '[data-testid="sec-tab-board"]');
  const hand = page.locator('[data-board-cat-rail] button').filter({ hasText: /^핸드 분석$/ });
  await expect(hand).toBeVisible({ timeout: 15_000 });
  await hand.evaluate((b: HTMLElement) => b.click());
  await expect(hand).toHaveAttribute('aria-pressed', 'true');
  // 장터 › 용품
  await click(page, '[data-testid="sec-tab-market"]');
  const gear = page.locator('[data-market-catbar] button').filter({ hasText: /^용품$/ });
  await expect(gear).toBeVisible({ timeout: 15_000 });
  await gear.evaluate((b: HTMLElement) => b.click());
  await expect(gear).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('[data-testid="sec-tab-market"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  await expect(page.locator('[data-market-catbar] button[aria-pressed="true"]'), '장터 분류가 전체로 돌아갔다').toHaveText('용품');
  await click(page, '[data-testid="sec-tab-board"]');
  await expect(page.locator('[data-board-cat-rail] button[aria-pressed="true"]').first(), '게시판 분류가 전체로 돌아갔다').toHaveText('핸드 분석', { timeout: 15_000 });
});

// ── P2-L(재판정 88ba7824) 법정 푸터 — 지연 탭 청크가 끝나지 않아도 푸터는 DOM 에 있고 스크롤로 닿는다 ──────────────
// 푸터를 `{paneShown && …}` 로 그리면 폴백(LazyFallback)이 끝나지 않는 동안 사업자 정보·19세·1336 이 영원히 빠진다(법정 상시 노출 위반).
// 음성 대조(2026-10-07): 수정 전 빌드(88ba7824) hang·abort 모두 FAIL(푸터 없음) — 수정 후 PASS. 하네스: rejudge-88ba7824/zz-dr208c.spec.ts
test.describe('P2-L 법정 푸터 — 지연 탭 청크 상태와 무관', () => {
  test.use({ serviceWorkers: 'block' });
  for (const mode of ['hang', 'abort'] as const) {
    test(`P2-L 390 커뮤니티 청크 ${mode} — 직접 진입해도 사업자번호·19세·1336 이 DOM 에 있고 스크롤로 닿는다`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(M390);
      await mockPosts(page, 12);
      const hit: string[] = [];
      await page.route(/\/assets\/CommunityTab-[^/]+\.js/, (r) => {
        hit.push(r.request().url());
        return mode === 'abort' ? r.abort() : new Promise(() => { /* 영원히 대기 */ });
      });
      await page.goto('/?tab=community', { waitUntil: 'commit' }).catch(() => {});
      await expect.poll(() => hit.length, { message: '전제: 커뮤니티 청크 요청이 가로채였다', timeout: 20_000 }).toBeGreaterThan(0);
      await page.waitForTimeout(5000);
      if (mode === 'hang') {
        await expect(page.locator('.pane-reserve[aria-busy="true"][aria-label="불러오는 중"]'), '전제: 끝나지 않는 폴백 상태다').toHaveCount(1);
      }
      const footer = page.locator('footer[data-testid="business-footer"]');
      await expect(footer, '법정 푸터가 DOM 에 없다').toHaveCount(1);
      const st = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const ft = document.querySelector('[data-testid="business-footer"]');
        const txt = ft?.textContent ?? '';
        return { reachable: ft ? ft.getBoundingClientRect().top < innerHeight : false, bizno: txt.includes('525-20-02937'), age: txt.includes('19세'), helpline: txt.includes('1336') };
      });
      console.log(`[P2-L ${mode}]`, JSON.stringify(st));
      expect(st.reachable, '끝까지 스크롤해도 푸터가 화면에 닿지 않는다').toBe(true);
      expect(st.bizno, '사업자등록번호').toBe(true);
      expect(st.age, '만 19세 미만 고지').toBe(true);
      expect(st.helpline, '도박문제 상담 1336').toBe(true);
    });
  }
});
