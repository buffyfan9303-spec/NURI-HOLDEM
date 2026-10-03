// 내 매장 C1(2026-10-02, PLAN-1002c-remaining.md#C1) — 감사(audit-mystore-ui-1002) 중·하 잔여 + B1 검토 후속 5건의 회귀 게이트. 전부 목킹(운영 쓰기 0).
//
//   a) 1920 매장 설정 하위탭 줄이 판 끝(1896)까지 가고 카드는 1220 에서 끝나 '위험 구역' 탭이 홀로 섰다 → 줄도 카드와 같은 960 상자.
//   b) 매장 A→B 전환 순간 A 의 '바인 대기' 줄이 사라지며 셸 전체가 47px 위로 튀었다 → 전환 대기 동안 그 자리를 붙잡는다.
//   c) 전환 중 잠긴(inert) 셸에 '못 누름' 표시가 없었다 → 흐리게.
//   d) 펼친 레일 밖 표의 빈 + 칸을 누르면 레일이 닫히면서 결제창까지 열렸다(클릭 관통) → 첫 클릭은 닫기만.
//   e) 1920 대시보드 '오늘 게임' 표에서 게임 이름과 [장부] 버튼이 1500px 넘게 떨어졌다(W-3) → 표 읽기 폭 960.
//   D-2 · D-3 · D-4 · D-7 · V-2 · P-2 — 감사 표 그대로(각 테스트 이름에 ID).
//
// 음성 대조: origin/main(f2a7c0bf) 빌드에서 FAIL, 수정 빌드에서 PASS(보고서 C1 참고).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, regularsOf, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const RAIL = '[data-mystore-rail]';
const VENUE_B = '44444444-4444-4444-8444-444444444444';

// 데일리 펍 — 15게임 중 1~10 마감, 11~15 진행. 손님 3명·바인 1회씩(빈 + 칸이 남는다).
const TITLES = Array.from({ length: 15 }, (_, i) => `데일리 ${i + 1}부`);
const sessions = TITLES.map((t, i) => ({
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: i + 1, title: t, buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${MOCK_DAY}T10:00:00+09:00`, operators: [], reg_closed: i < 10, closed: i < 10, closed_at: i < 10 ? `${MOCK_DAY}T20:00:00+09:00` : null,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${MOCK_DAY}T01:00:00Z`,
}));
const NAMES = ['김철수', '이영희', '박민수'];
const players = (seq: number) => NAMES.map((n, i) => ({ id: `ffffffff-0000-4000-8000-${String(seq * 10 + i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: seq, name: n, visitor_type: i % 2 ? 'regular' : 'new', note: null, sort_order: i }));
const buyinsOf = (seq: number) => NAMES.map((n, i) => ({
  id: `eeeeeeee-0000-4000-8000-${String(seq * 10 + i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: seq, player_name: n, entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T11:00:00+09:00`, is_split: false, cash_amount: 30_000, card_amount: 0, transfer_amount: 0,
  ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
}));

interface Opts { vouchers?: boolean; twoVenues?: boolean; permDelayB?: number; barDelayB?: number }
async function boot(page: Page, w: number, h: number, o: Opts = {}) {
  const writes: string[] = [];
  // client_errors(오류 보고) 는 _fixtures 가드가 끊는다 — 목 업주 화면의 기존 보고(수정 전·후 같음)라 쓰기 집계에서 뺀다.
  page.on('request', (r) => { if (/supabase\.co\/rest\//.test(r.url()) && !['GET', 'HEAD'].includes(r.method()) && !/\/rpc\/|\/client_errors/.test(r.url())) writes.push(`${r.method()} ${r.url().slice(0, 100)}`); });
  await bootOwner(page, {
    viewport: { width: w, height: h },
    ...(o.vouchers ? { appSettings: { identity_voucher_enabled: 'on' } } : {}),
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      const byVenue = (rows: (seq: number | null) => unknown[]) => async (r: Route) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = r.request().url();
        if (!u.includes(`venue_id=eq.${MOCK_VENUE}`)) return r.fulfill(json(single(r) ? null : []));
        const m = /game_seq=eq\.(\d+)/.exec(u);
        const got = rows(m ? Number(m[1]) : null);
        return r.fulfill(json(single(r) ? (got[0] ?? null) : got)).catch(() => {});
      };
      await p.route(/\/rest\/v1\/ledger_sessions\?/, byVenue((s) => (s ? sessions.filter((x) => x.game_seq === s) : sessions)));
      await p.route(/\/rest\/v1\/ledger_players\?/, byVenue((s) => (s ? players(s) : [])));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, byVenue((s) => (s ? buyinsOf(s) : TITLES.flatMap((_, i) => buyinsOf(i + 1)))));
      await p.route(/\/rest\/v1\/rpc\/venue_regulars/, (r) => r.fulfill(json(regularsOf(TITLES.flatMap((_, i) => buyinsOf(i + 1))))));
      if (o.vouchers) await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
      if (o.twoVenues) {
        await p.route(/\/rest\/v1\/rpc\/my_member_venues/, (r) => r.fulfill(json([{ id: MOCK_VENUE, name: '테스트 홀덤펍', relation: 'owner' }, { id: VENUE_B, name: '둘째 매장', relation: 'coowner' }])));
        await p.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers|can_manage_venue_staff|can_manage_venue_schedules|can_manage_schedule)($|\?)/, async (r) => {
          const vid = (r.request().postDataJSON() as { p_venue_id?: string } | null)?.p_venue_id;
          if (vid === VENUE_B && o.permDelayB) await sleep(o.permDelayB);
          return r.fulfill(json(true)).catch(() => {});
        });
        // A 매장만 '바인 대기' 3건 — B 는 0건(바가 없다)
        //   barDelayB — B 의 라이브 바 응답(바인 대기·클락)을 늦춘다(권한보다 늦게 오는 순서).
        await p.route(/\/rest\/v1\/ledger_buyin_requests\?/, async (r) => {
          if (r.request().method() !== 'GET') return r.fallback();
          if (r.request().url().includes(`venue_id=eq.${VENUE_B}`) && o.barDelayB) await sleep(o.barDelayB);
          if (!r.request().url().includes(`venue_id=eq.${MOCK_VENUE}`)) return r.fulfill(json([])).catch(() => {});
          const rows = [1, 2, 3].map((i) => ({ id: `aaaaaaaa-0000-4000-8000-00000000000${i}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, player_name: `대기${i}`, user_id: null, note: null, status: 'pending', created_at: `${MOCK_DAY}T02:00:00Z`, requested_game_seq: null, voucher_id: null }));
          return r.fulfill(json(rows));
        });
        if (o.barDelayB) await p.route(/\/rest\/v1\/clock_states\?/, async (r) => {
          if (r.request().method() !== 'GET' || !r.request().url().includes(`venue_id=eq.${VENUE_B}`)) return r.fallback();
          await sleep(o.barDelayB!);
          return r.fulfill(json(single(r) ? null : [])).catch(() => {});
        });
      }
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL).first(), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  return { writes };
}
const railStep = (page: Page, label: string) => page.locator(`${RAIL} [role=tab]`).filter({ hasText: label }).first().evaluate((b) => (b as HTMLElement).click());
const sideMenu = (page: Page, re: RegExp) => page.evaluate((src) => {
  const rx = new RegExp(src);
  const pick = () => [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => x.getClientRects().length && rx.test((x.textContent ?? '').trim()));
  let b = pick();
  if (!b) { [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => /고급 기능 모두 보기/.test(x.textContent ?? ''))?.click(); b = pick(); }
  b?.click(); return !!b;
}, re.source);
const openMore = (page: Page) => page.evaluate(() => {
  const b = [...document.querySelectorAll<HTMLElement>('[data-pane="dashboard"] button[aria-expanded]')].find((x) => /^더 보기/.test((x.textContent ?? '').trim()));
  b?.click();
});

// ── a) 1920 매장 설정 하위탭 줄 = 카드 폭 ─────────────────────────────────────────────────────
test('1920 — a) 매장 설정 하위탭 줄 오른쪽 끝이 카드(960 상자) 오른쪽 끝과 맞는다', async ({ page }) => {
  test.setTimeout(120_000);
  const { writes } = await boot(page, 1920, 1080);
  expect(await sideMenu(page, /매장 설정/), '매장 설정 메뉴를 못 찾았다').toBe(true);
  const bar = page.getByRole('tablist', { name: '매장 설정 하위탭' });
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const tl = document.querySelector('[role=tablist][aria-label="매장 설정 하위탭"]')!.getBoundingClientRect();
    const tabs = [...document.querySelectorAll<HTMLElement>('[role=tablist][aria-label="매장 설정 하위탭"] [role=tab]')].map((t) => t.getBoundingClientRect());
    const pane = [...document.querySelectorAll<HTMLElement>('[data-pane]')].find((p) => p.getClientRects().length && p.style.display !== 'none')!.getBoundingClientRect();
    return { barR: Math.round(tl.right), lastTabR: Math.round(Math.max(...tabs.map((t) => t.right))), paneR: Math.round(pane.right), paneW: Math.round(pane.width), tabs: tabs.length };
  });
  console.log('[a 1920]', JSON.stringify(r));
  expect(r.tabs, '하위탭을 못 찾았다 — 빈 검사').toBeGreaterThanOrEqual(3);
  expect(r.paneW, '카드 상자가 960 상한이 아니다(이 검사의 전제)').toBeLessThanOrEqual(962);
  expect(Math.abs(r.barR - r.paneR), '하위탭 줄이 카드보다 오른쪽으로 길다').toBeLessThanOrEqual(2);
  expect(r.lastTabR, "'위험 구역' 탭이 카드 오른쪽 밖에 홀로 선다").toBeLessThanOrEqual(r.paneR + 2);
  expect(writes).toEqual([]);
});

// ── b·c) 매장 전환: 셸 세로 위치 고정 + 잠김 흐림 ──────────────────────────────────────────────
for (const [W, H] of [[1440, 900], [390, 844]] as const) {
  test(`${W} — b·c) 매장 A→B 전환 대기 동안 셸이 위로 튀지 않고, 잠긴 셸은 흐리다`, async ({ page }) => {
    test.setTimeout(120_000);
    const { writes } = await boot(page, W, H, { twoVenues: true, permDelayB: 1500 });
    await expect(page.getByLabel('관리할 매장 선택'), '매장 고르개가 없다(이 검사의 전제)').toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/바인 대기/).first(), 'A 매장 바인 대기가 먼저 보여야 한다(이 검사의 전제)').toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      const W8 = window as unknown as { __f: unknown[]; __stop: boolean };
      W8.__f = []; W8.__stop = false;
      const t0 = performance.now();
      const tick = () => {
        const busyEl = document.querySelector<HTMLElement>('main[data-tab=my-store] [aria-busy="true"][inert]');
        const shell = document.querySelector<HTMLElement>('[data-mystore-rail]') ?? document.querySelector<HTMLElement>('[data-testid=mystore-menu-toggle]');
        W8.__f.push({ t: Math.round(performance.now() - t0), busy: !!busyEl, op: busyEl ? +getComputedStyle(busyEl).opacity : 1,
          top: shell ? Math.round(shell.getBoundingClientRect().top + scrollY) : null });
        if (!W8.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByLabel('관리할 매장 선택').selectOption(VENUE_B);
    await page.waitForTimeout(2600);
    await page.evaluate(() => { (window as unknown as { __stop: boolean }).__stop = true; });
    const f = await page.evaluate(() => (window as unknown as { __f: { t: number; busy: boolean; op: number; top: number | null }[] }).__f);
    const busy = f.filter((x) => x.busy);
    const tops = busy.map((x) => x.top).filter((x): x is number => x != null);
    const before = f[0].top!;
    const late = busy.filter((x) => x.t - busy[0].t > 500);
    console.log(`[b·c ${W}] frames=${f.length} busy=${busy.length} top 전=${before} 대기중 ${Math.min(...tops)}~${Math.max(...tops)} 끝=${f[f.length - 1].top} 흐림(500ms 뒤)=${late.length ? Math.max(...late.map((x) => x.op)) : '-'}`);
    expect(busy.length, '전환 대기 프레임을 못 봤다 — 빈 검사').toBeGreaterThan(30);
    expect(tops.length, '셸 위치를 못 쟀다 — 빈 검사').toBe(busy.length);
    expect(Math.max(...tops.map((t) => Math.abs(t - before))), 'b) 전환 대기 중 셸이 세로로 튀었다(앞 매장 바 자리가 사라짐)').toBeLessThanOrEqual(1);
    expect(late.length, '대기가 500ms 넘게 이어진 프레임이 없다 — 빈 검사').toBeGreaterThan(10);
    expect(Math.max(...late.map((x) => x.op)), 'c) 잠긴 셸이 흐려지지 않았다(누를 수 없음 표시 없음)').toBeLessThan(0.8);
    expect(f[f.length - 1].busy, '끝까지 대기 중이다').toBe(false);
    const opEnd = await page.evaluate(() => +getComputedStyle(document.querySelector<HTMLElement>('main[data-tab=my-store] [data-mystore-secpanel]')!.closest('.lg\\:flex')!).opacity);
    expect(opEnd, 'c) 정착 뒤에도 셸이 흐리다').toBe(1);
    expect(writes).toEqual([]);
  });
}

// ── b 후속) 정착 순간에도 셸이 튀지 않는다 — 두 지연 순서(권한 늦음 · 바 응답 늦음) ─────────────────
//   review-mystore-c1-1002 §2-b: 대기 중 이동은 없앴지만 앞 매장 바 자리를 'B 본문이 나오는 순간'(권한 늦음) 또는
//   '본문이 보인 지 1.3초 뒤'(바 늦음)에 접어서, 이동이 입력 500ms 밖으로 밀려 CLS 로 잡혔다(1440 0.024 · 390 0.059).
//   매장 고르개는 실제 키 입력(ArrowDown)으로 바꾼다 — selectOption 은 사용자 입력이 아니라 입력 직후 이동까지 CLS 로 센다.
for (const [W, H] of [[1440, 900], [390, 844]] as const) for (const [nm, o] of [['권한 늦음', { permDelayB: 1500 }], ['바 늦음', { permDelayB: 250, barDelayB: 1600 }]] as const) {
  test(`${W} — b) 매장 A→B 전환이 정착할 때(${nm}) 셸이 튀지 않는다(CLS 0), 비운 바 자리는 다음 이동 때 접힌다`, async ({ page }) => {
    test.setTimeout(120_000);
    const { writes } = await boot(page, W, H, { twoVenues: true, ...o });
    const pick = page.getByLabel('관리할 매장 선택');
    await expect(pick, '매장 고르개가 없다(이 검사의 전제)').toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/바인 대기/).first(), 'A 매장 바인 대기가 먼저 보여야 한다(이 검사의 전제)').toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const W8 = window as unknown as { __f: unknown[]; __stop: boolean; __ls: unknown[] };
      W8.__f = []; W8.__stop = false; W8.__ls = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] };
        const el = (n?: Node) => (n?.nodeType === 1 ? n as Element : n?.parentElement ?? null);
        // body: 이동한 요소가 전부 판 본문 안(B 대시보드가 제 데이터로 자라는 것) — 셸 이동과 따로 센다.
        W8.__ls.push({ t: Math.round(s.startTime), v: s.value, input: s.hadRecentInput, body: (s.sources ?? []).length > 0 && (s.sources ?? []).every((x) => !!el(x.node)?.closest('[data-mystore-secpanel]')),
          src: (s.sources ?? []).map((x) => el(x.node)?.outerHTML?.slice(0, 80) ?? '?').join(' | ') }); } }).observe({ type: 'layout-shift' });
      const tick = () => {
        const shell = document.querySelector<HTMLElement>('[data-mystore-rail]') ?? document.querySelector<HTMLElement>('[data-testid=mystore-menu-toggle]');
        const busy = !!document.querySelector('main[data-tab=my-store] [aria-busy="true"][inert]');
        const loading = !!document.querySelector('[data-mystore-secpanel] .pane-reserve[aria-busy="true"]');
        W8.__f.push({ t: Math.round(performance.now()), busy, loading, top: shell ? Math.round(shell.getBoundingClientRect().top + scrollY) : null });
        if (!W8.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await pick.focus();
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press('ArrowDown');
    await expect(pick, '키 입력으로 B 매장을 못 골랐다(이 검사의 전제)').toHaveValue(VENUE_B);
    await page.waitForTimeout(3200);
    await page.evaluate(() => { (window as unknown as { __stop: boolean }).__stop = true; });
    const { f, ls } = await page.evaluate(() => { const w = window as unknown as { __f: { t: number; busy: boolean; loading: boolean; top: number | null }[]; __ls: { t: number; v: number; input: boolean; body: boolean; src: string }[] }; return { f: w.__f, ls: w.__ls }; });
    const before = f[0].top!;
    const settled = f.slice(Math.max(0, f.findIndex((x) => x.busy))).filter((x) => !x.busy && !x.loading);
    const late = ls.filter((x) => x.t > t0 && !x.input);
    // ⚠ 본문 안 이동(B 대시보드 '오늘 장부' 확인 중 107px → 미시작 48px)은 전환과 무관한 대시보드 자체 로딩이라 따로 기록만 한다(기준 빌드에도 같은 값).
    const cls = late.filter((x) => !x.body).reduce((s, x) => s + x.v, 0);
    console.log(`[b ${W} ${nm}] frames=${f.length} 정착 프레임=${settled.length}(첫 ${settled[0] ? settled[0].t - Math.round(t0) : '-'}ms) top 전=${before} 끝=${f[f.length - 1].top} 셸 CLS=${cls.toFixed(4)} 입력 밖 이동=${JSON.stringify(late.map((x) => ({ t: x.t - Math.round(t0), v: +x.v.toFixed(4), body: x.body, src: x.src })))}`);
    expect(f.length, '프레임을 못 쟀다 — 빈 검사').toBeGreaterThan(60);
    expect(f.some((x) => x.busy), '전환 대기 프레임을 못 봤다 — 빈 검사').toBe(true);
    expect(settled.length, 'B 본문이 정착한 프레임을 못 봤다 — 빈 검사').toBeGreaterThan(30);
    expect(Math.max(...f.map((x) => Math.abs((x.top ?? before) - before))), 'b) 전환~정착 사이 셸이 세로로 튀었다').toBeLessThanOrEqual(1);
    expect(cls, 'b) 입력 500ms 밖 셸 레이아웃 이동(CLS)이 생겼다 — 앞 매장 바 자리를 정착 시점에 접음').toBe(0);
    // 붙잡은 자리는 영원히 남지 않는다 — 다음 섹션 이동(사용자 입력)에서 접힌다.
    await expect(page.locator('[data-livebar-hold]'), 'B 에는 바가 없는데 붙잡은 자리를 못 봤다(이 검사의 전제)').toHaveCount(1);
    if (W < 1024) { await page.getByTestId('mystore-menu-toggle').click(); await page.waitForTimeout(450); }
    await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button, [data-main-enter] button')].find((b) => b.getClientRects().length && /매장 설정/.test(b.textContent ?? ''))?.click(); });
    await expect(page.locator('[data-livebar-hold]'), '섹션을 옮겨도 비운 바 자리가 남아 있다').toHaveCount(0, { timeout: 5_000 });
    expect(writes).toEqual([]);
  });
}

// ── d) 펼친 레일 밖 + 칸: 첫 클릭은 닫기만 ─────────────────────────────────────────────────────
test('1280 — d) 레일을 펼친 채 표의 빈 + 칸을 누르면 레일만 닫히고 결제창은 안 열린다', async ({ page }) => {
  test.setTimeout(120_000);
  const { writes } = await boot(page, 1280, 800, { vouchers: true });
  await railStep(page, '장부');
  await expect(page.locator('[data-ledger-workspace="strip"]'), '접힌 띠 구간이 아니다(이 검사의 전제)').toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('[data-pane="ledger"] table').first()).toBeVisible({ timeout: 20_000 });
  const aside = page.locator('aside[aria-label="매장이용권 실시간 내역"]');
  const plusAt = () => page.evaluate(() => {
    const a = document.querySelector('aside[aria-label="매장이용권 실시간 내역"]')?.getBoundingClientRect();
    const c = [...document.querySelectorAll<HTMLElement>('[data-pane="ledger"] table button')].filter((b) => b.getClientRects().length && !(b as HTMLButtonElement).disabled && /^\+$/.test((b.textContent ?? '').trim()))
      .map((b) => b.getBoundingClientRect()).find((r) => r.top > 0 && r.bottom < innerHeight - 140 && (!a || r.right < a.left - 4));
    return c ? { x: c.left + c.width / 2, y: c.top + c.height / 2 } : null;
  });
  await page.locator('[data-voucher-strip]').first().evaluate((b) => (b as HTMLElement).click());
  await expect(aside, '레일이 펼쳐지지 않았다').toBeVisible();
  await page.waitForTimeout(400);
  const p1 = await plusAt();
  expect(p1, '레일 밖 빈 + 칸을 못 찾았다 — 빈 검사').not.toBeNull();
  await page.mouse.click(p1!.x, p1!.y);
  await page.waitForTimeout(600);
  const dlg1 = await page.locator('[role=dialog]:visible').count();
  console.log('[d 1280] 첫 클릭 뒤 결제창', dlg1, '레일', await aside.isVisible());
  await expect(aside, '레일이 닫히지 않았다').toBeHidden();
  expect(dlg1, 'd) 레일을 닫는 클릭이 결제창까지 열었다(클릭 관통)').toBe(0);
  // 양성 대조: 레일이 닫힌 뒤 같은 + 칸을 다시 누르면 결제창이 열린다(삼키기는 한 번뿐)
  const p2 = await plusAt();
  await page.mouse.click(p2!.x, p2!.y);
  await expect(page.locator('[role=dialog]:visible').first(), '레일이 닫힌 뒤 + 칸이 결제창을 못 연다').toBeVisible({ timeout: 5_000 });
  expect(writes).toEqual([]);
});

// ── d 후속) 터치 태블릿: 레일 펼친 채 표를 스와이프한 직후의 탭은 먹히지 않는다 ─────────────────────
//   review-mystore-c1-1002 §2-d: 스와이프는 pointerdown 만 있고 click 이 없어서, '첫 클릭 삼키기' 리스너가 800ms 남아
//   바로 다음 탭(+ 칸)을 먹었다(0/3 열림). Playwright tap 은 누름 0ms 라 CDP 터치로 실제 손가락 순서를 보낸다.
test.describe(() => {
  test.use({ hasTouch: true });
  test('1280 터치 — d) 레일 펼친 채 표를 스와이프하면 레일만 닫히고, 바로 다음 탭은 결제창을 연다', async ({ page }) => {
    test.setTimeout(120_000);
    const { writes } = await boot(page, 1280, 800, { vouchers: true });
    await railStep(page, '장부');
    await expect(page.locator('[data-ledger-workspace="strip"]'), '접힌 띠 구간이 아니다(이 검사의 전제)').toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-pane="ledger"] table').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    const aside = page.locator('aside[aria-label="매장이용권 실시간 내역"]');
    const dlg = () => page.locator('[role=dialog]:visible').count();
    const plusAt = () => page.evaluate(() => {
      const a = document.querySelector('aside[aria-label="매장이용권 실시간 내역"]')?.getBoundingClientRect();
      const c = [...document.querySelectorAll<HTMLElement>('[data-pane="ledger"] table button')].filter((b) => b.getClientRects().length && !(b as HTMLButtonElement).disabled && /^\+$/.test((b.textContent ?? '').trim()))
        .map((b) => b.getBoundingClientRect()).find((r) => r.top > 80 && r.bottom < innerHeight - 160 && (!a || a.width === 0 || r.right < a.left - 4));
      return c ? { x: c.left + c.width / 2, y: c.top + c.height / 2 } : null;
    });
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const tap = async (x: number, y: number) => { await touch('touchStart', x, y); await sleep(90); await touch('touchEnd'); };
    const openRail = async () => { await page.locator('[data-voucher-strip]').first().evaluate((b) => (b as HTMLElement).click()); await expect(aside, '레일이 펼쳐지지 않았다').toBeVisible(); await page.waitForTimeout(400); };

    // 대조(터치 탭): 레일 펼친 채 + 칸을 탭하면 레일만 닫히고 결제창은 안 열린다 — 마우스와 같은 '첫 탭은 닫기만'.
    await openRail();
    const p0 = await plusAt();
    expect(p0, '레일 밖 빈 + 칸을 못 찾았다 — 빈 검사').not.toBeNull();
    await tap(p0!.x, p0!.y);
    await page.waitForTimeout(600);
    await expect(aside, '탭으로 레일이 닫히지 않았다').toBeHidden();
    expect(await dlg(), 'd) 레일을 닫는 탭이 결제창까지 열었다(관통)').toBe(0);

    // 본 검사: 레일 펼친 채 표 위를 세로로 스와이프(click 이 생기지 않는 누름) → 250ms 뒤 + 칸 탭
    await openRail();
    const p = await plusAt();
    expect(p, '스와이프할 표 위치를 못 찾았다 — 빈 검사').not.toBeNull();
    await touch('touchStart', p!.x + 60, p!.y);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', p!.x + 60, p!.y - i * 25); await sleep(16); }
    await touch('touchEnd');
    await expect(aside, '스와이프로 레일이 닫히지 않았다(이 검사의 전제)').toBeHidden();
    expect(await dlg(), '스와이프가 결제창을 열었다').toBe(0);
    await sleep(250);
    const q = await plusAt();
    expect(q, '스와이프 뒤 + 칸을 못 찾았다 — 빈 검사').not.toBeNull();
    await tap(q!.x, q!.y);
    await page.waitForTimeout(600);
    const n = await dlg();
    console.log('[d 터치 1280] 스와이프 250ms 뒤 탭 → 결제창', n);
    expect(n, 'd) 스와이프 직후 탭이 삼켜졌다(결제창이 안 열림)').toBeGreaterThan(0);
    expect(writes).toEqual([]);
  });
});

// ── e·D-3·D-4) PC 대시보드 ────────────────────────────────────────────────────────────────────
test('1920 — e) 오늘 게임 표에서 게임 이름과 [장부] 버튼 거리가 읽기 폭 안이다(W-3)', async ({ page }) => {
  test.setTimeout(120_000);
  const { writes } = await boot(page, 1920, 1080);
  await expect(page.locator('#today-games-h')).toBeVisible({ timeout: 20_000 });
  const d = await page.evaluate(() => {
    const row = document.querySelector('[aria-labelledby="today-games-h"] tbody tr')!;
    const th = row.querySelector('th')!; const rg = document.createRange(); rg.selectNodeContents(th);
    const btn = [...row.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === '장부')!;
    return Math.round(btn.getBoundingClientRect().left - rg.getBoundingClientRect().right);
  });
  console.log('[e 1920] 이름↔[장부]', d);
  expect(d, '거리를 못 쟀다').toBeGreaterThan(0);
  expect(d, 'e) 게임 이름과 [장부] 버튼이 판 끝까지 떨어졌다').toBeLessThanOrEqual(900);
  expect(writes).toEqual([]);
});

test('1440 — D-3·D-4) 카드 격자: 빈 카드는 옆 카드만큼 늘지 않고, 마지막 줄에 카드 1장이 홀로 남지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  const { writes } = await boot(page, 1440, 900, { vouchers: true });
  await expect(page.locator('#today-games-h')).toBeVisible({ timeout: 20_000 });
  await openMore(page);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-pane="dashboard"] section.card-aura')].filter((s) => s.getClientRects().length && s.parentElement?.classList.contains('grid'));
    const grid = cards[0]?.parentElement;
    if (!grid) return null;
    const G = grid.getBoundingClientRect();
    const box = (t: string) => { const c = cards.find((s) => (s.querySelector('button')?.textContent ?? '').includes(t)); return c ? c.getBoundingClientRect() : null; };
    const rows = new Map<number, DOMRect[]>();
    for (const c of cards) { const b = c.getBoundingClientRect(); const k = Math.round(b.top); rows.set(k, [...(rows.get(k) ?? []), b]); }
    const last = [...rows.entries()].sort((a, b) => a[0] - b[0]).pop()![1];
    const res = box('다가오는 예약'), reg = box('고객·단골');
    return { titles: cards.map((c) => (c.querySelector('button')?.textContent ?? '').trim().slice(0, 8)), n: cards.length, cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, gridW: Math.round(G.width),
      lastRowN: last.length, lastRowW: Math.round(last.reduce((s, b) => s + b.width, 0)),
      res: res && { top: Math.round(res.top), h: Math.round(res.height) }, reg: reg && { top: Math.round(reg.top), h: Math.round(reg.height) } };
  });
  console.log('[D-3·D-4 1440]', JSON.stringify(r));
  expect(r, '카드 격자를 못 찾았다').not.toBeNull();
  expect(r!.n, '카드를 몇 장 못 셌다 — 빈 검사').toBeGreaterThanOrEqual(6);
  expect(r!.cols, '3열이 아니다(이 검사의 전제)').toBe(3);
  expect(r!.n % 3, '카드 수가 3으로 나눠 1 남지 않는다(이 검사의 전제 — 손님 유형 카드 포함 10장)').toBe(1);
  expect(r!.lastRowN, '마지막 줄 카드 수').toBe(1);
  expect(r!.lastRowW, 'D-3 마지막 줄 카드 1장이 한 칸만 차지하고 나머지가 빈다').toBeGreaterThanOrEqual(r!.gridW - 2);
  expect(r!.res && r!.reg, '다가오는 예약·고객·단골 카드를 못 찾았다').toBeTruthy();
  expect(r!.res!.top, '두 카드가 같은 줄이 아니다(이 검사의 전제)').toBe(r!.reg!.top);
  expect(r!.res!.h, 'D-4 빈 상태 카드(다가오는 예약)가 옆 카드 높이로 늘었다').toBeLessThan(r!.reg!.h - 40);
  expect(writes).toEqual([]);
});

// ── D-2·D-7·P-2) 모바일 390 ────────────────────────────────────────────────────────────────────
test('390 — D-2·D-7) 오늘 장부 라벨 윗줄이 맞고, 오늘 게임 표는 진행 중만 먼저 보인다(마감 더 보기)', async ({ page }) => {
  test.setTimeout(120_000);
  const { writes } = await boot(page, 390, 844);
  await expect(page.locator('#today-games-h')).toBeVisible({ timeout: 20_000 });
  const lab = await page.evaluate(() => {
    const spans = [...document.querySelectorAll<HTMLElement>('[data-pane="dashboard"] span.block')];
    const a = spans.find((s) => s.textContent?.trim() === '완납 매출'); const b = document.querySelector<HTMLElement>('[data-testid="dash-kpi-buyins"]');
    return a && b ? Math.round(a.getBoundingClientRect().top - b.getBoundingClientRect().top) : null;
  });
  console.log('[D-2 390] 완납 매출 − 총 바인 라벨 top', lab);
  expect(lab, 'KPI 라벨을 못 찾았다').not.toBeNull();
  expect(Math.abs(lab!), "D-2 '완납 매출' 라벨이 옆 '총 바인' 라벨보다 내려가 있다").toBeLessThanOrEqual(1);
  const rows = () => page.locator('[aria-labelledby="today-games-h"] tbody tr').count();
  const n0 = await rows();
  console.log('[D-7 390] 처음 행 수', n0);
  expect(n0, 'D-7 모바일 오늘 게임 표가 마감 게임까지 15줄 전부 펼쳐져 있다').toBe(5);
  await page.getByTestId('dash-games-fold').click();
  await expect.poll(rows, { message: "'마감 더 보기' 를 눌러도 전부 안 나온다" }).toBe(15);
  expect(writes).toEqual([]);
});

test('390 — P-2) 내 매장 링크: 입력칸과 [중복 확인]·[저장]이 한 줄이다', async ({ page }) => {
  test.setTimeout(120_000);
  const { writes } = await boot(page, 390, 844);
  await page.getByTestId('mystore-menu-toggle').click();
  await page.waitForTimeout(450);
  await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('[data-main-enter] button')].find((b) => b.getClientRects().length && /매장 설정/.test(b.textContent ?? ''))?.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('[role=tab]')].find((b) => b.getClientRects().length && (b.textContent ?? '').trim() === '매장 페이지')?.click(); });
  const input = page.locator('input[placeholder="예: roti-arena"]');
  await expect(input, '내 매장 링크 입력칸이 없다').toBeVisible({ timeout: 20_000 });
  const r = await input.evaluate((el) => {
    const row = el.parentElement!;
    const btns = [...row.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    const i = el.getBoundingClientRect();
    return { inputMid: Math.round(i.top + i.height / 2), btnMids: btns.map((b) => Math.round(b.top + b.height / 2)), inputW: Math.round(i.width) };
  });
  console.log('[P-2 390]', JSON.stringify(r));
  expect(r.btnMids.length, '버튼을 못 찾았다').toBe(2);
  for (const m of r.btnMids) expect(Math.abs(m - r.inputMid), 'P-2 [중복 확인]·[저장]이 입력칸과 다른 줄로 떨어졌다').toBeLessThanOrEqual(2);
  expect(r.inputW, '입력칸이 너무 좁다').toBeGreaterThanOrEqual(120);
  expect(writes).toEqual([]);
});

// ── V-2) 1440 이용권 판: 이용 내역 · 전송 두 칸 ─────────────────────────────────────────────────
test('1440 — V-2) 이용권 판에서 이용 내역과 전송 폼이 나란히 선다', async ({ page }) => {
  test.setTimeout(120_000);
  const { writes } = await boot(page, 1440, 900, { vouchers: true });
  await railStep(page, '이용권');
  const issue = page.getByTestId('voucher-issue');
  await expect(issue, '전송 폼이 없다(이 검사의 전제)').toBeVisible({ timeout: 20_000 });
  const r = await page.evaluate(() => {
    const iss = document.querySelector<HTMLElement>('[data-testid="voucher-issue"]')!.getBoundingClientRect();
    const feed = [...document.querySelectorAll<HTMLElement>('[data-pane="voucher"] p')].find((p) => /이용 내역/.test(p.textContent ?? ''))!.closest('.card-aura')!.getBoundingClientRect();
    return { feedTop: Math.round(feed.top), issTop: Math.round(iss.top), feedR: Math.round(feed.right), issL: Math.round(iss.left), feedW: Math.round(feed.width) };
  });
  console.log('[V-2 1440]', JSON.stringify(r));
  expect(Math.abs(r.feedTop - r.issTop), 'V-2 전송 폼이 이용 내역 아래로 떨어져 있다').toBeLessThanOrEqual(2);
  expect(r.issL, '두 칸이 겹친다').toBeGreaterThan(r.feedR);
  expect(writes).toEqual([]);
});
