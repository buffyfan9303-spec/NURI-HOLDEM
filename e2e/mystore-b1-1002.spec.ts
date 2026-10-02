// 내 매장 B1(2026-10-02, PLAN-1002c-remaining.md#B1) — 기존 결함 4건의 회귀 게이트. 전부 목킹(운영 쓰기 0).
//
//   ① 1024~1366 장부 우측 이용권 레일을 펼치면 장부 도구 줄([+ 유저 추가]·정렬·[클락]·[세션 정보 수정]·[이용권]·[전체화면])을 덮었다.
//      (review-store-ledger-1002b.md §4 — 덮인 [+ 유저 추가] 자리를 누르면 레일 안에 맞아 아무 일도 없었다)
//   ② 1920 에서 클락 미리보기가 1612×907 로 늘고(W-1), 한 줄짜리 입력칸이 1500~1600px(W-2), 라벨과 토글이 1580px 떨어졌다(W-3).
//   ③ 장부 첫 진입(데일리 펍: 메인 마감·사이드 진행)에서 마감된 메인 보드가 한 번 그려졌다가 진행 게임으로 옮겨 갔다(M-5).
//   ④ 매장 A→B 전환 동안 사이드 메뉴·단계 바까지 '불러오는 중…' 빈 화면(450~950ms) — review-store-motion-1002.md F-2/F-3 매장 전환.
//      셸(사이드 메뉴·단계 바)은 남고 본문만 기다린다. 늦게 온 A 응답은 B 화면에 남지 않는다.
//
// 음성 대조: origin/main(f2f24b5c) 빌드에서 ①②③④ FAIL, 수정 빌드에서 PASS(보고서 store-b1 참고).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const RAIL = '[data-mystore-rail]';
const VENUE_B = '44444444-4444-4444-8444-444444444444';

// 데일리 펍 — 15게임 중 1~10 마감, 11~15 진행(ledger-daily-pub 과 같은 모양). 손님 3명·바인 1회씩.
const TITLES = Array.from({ length: 15 }, (_, i) => `데일리 ${i + 1}부`);
const sessions = TITLES.map((t, i) => ({
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: i + 1, title: t, buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${MOCK_DAY}T10:00:00+09:00`, operators: [], reg_closed: i < 10, closed: i < 10, closed_at: i < 10 ? `${MOCK_DAY}T20:00:00+09:00` : null,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${MOCK_DAY}T01:00:00Z`,
}));
const NAMES = ['김철수', '이영희', '박민수'];
const players = (seq: number) => NAMES.map((n, i) => ({ id: `ffffffff-0000-4000-8000-${String(seq * 10 + i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: seq, name: n, visitor_type: null, note: null, sort_order: i }));
const buyins = (seq: number) => NAMES.map((n, i) => ({
  id: `eeeeeeee-0000-4000-8000-${String(seq * 10 + i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: seq, player_name: n, entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T11:00:00+09:00`, is_split: false, cash_amount: 30_000, card_amount: 0, transfer_amount: 0,
  ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
}));

interface Opts { lat?: number; vouchers?: boolean; twoVenues?: boolean; permDelayB?: number; pendingDelayA?: number }
async function boot(page: Page, w: number, h: number, o: Opts = {}) {
  const writes: string[] = [];
  page.on('request', (r) => { if (/supabase\.co\/rest\//.test(r.url()) && !['GET', 'HEAD'].includes(r.method()) && !/\/rpc\//.test(r.url())) writes.push(`${r.method()} ${r.url().slice(0, 100)}`); });
  await bootOwner(page, {
    viewport: { width: w, height: h },
    ...(o.vouchers ? { appSettings: { identity_voucher_enabled: 'on' } } : {}),
    extra: async (p) => {
      const lag = () => (o.lat ? sleep(o.lat) : Promise.resolve());
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = r.request().url();
        if (!u.includes(`venue_id=eq.${MOCK_VENUE}`)) return r.fulfill(json(single(r) ? null : []));
        await lag();
        const m = /game_seq=eq\.(\d+)/.exec(u);
        const rows = m ? sessions.filter((s) => s.game_seq === Number(m[1])) : sessions;
        return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows)).catch(() => {});
      });
      await p.route(/\/rest\/v1\/ledger_players\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = r.request().url();
        if (!u.includes(`venue_id=eq.${MOCK_VENUE}`)) return r.fulfill(json([]));
        await lag();
        const m = /game_seq=eq\.(\d+)/.exec(u);
        return r.fulfill(json(m ? players(Number(m[1])) : [])).catch(() => {});
      });
      await p.route(/\/rest\/v1\/ledger_buyins\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = r.request().url();
        if (!u.includes(`venue_id=eq.${MOCK_VENUE}`)) return r.fulfill(json([]));
        await lag();
        const m = /game_seq=eq\.(\d+)/.exec(u);
        return r.fulfill(json(m ? buyins(Number(m[1])) : [])).catch(() => {});
      });
      if (o.vouchers) await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
      if (o.twoVenues) {
        await p.route(/\/rest\/v1\/rpc\/my_member_venues/, (r) => r.fulfill(json([{ id: MOCK_VENUE, name: '테스트 홀덤펍', relation: 'owner' }, { id: VENUE_B, name: '둘째 매장', relation: 'coowner' }])));
        await p.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers|can_manage_venue_staff|can_manage_venue_schedules|can_manage_schedule)($|\?)/, async (r) => {
          const vid = (r.request().postDataJSON() as { p_venue_id?: string } | null)?.p_venue_id;
          if (vid === VENUE_B && o.permDelayB) await sleep(o.permDelayB);
          return r.fulfill(json(true)).catch(() => {});
        });
        // A 매장 '바인 대기' — 늦게 오는 A 응답(전환 뒤 도착)이 B 셸에 남으면 안 된다.
        let firstA = true;
        await p.route(/\/rest\/v1\/ledger_buyin_requests\?/, async (r) => {
          if (r.request().method() !== 'GET') return r.fallback();
          const u = r.request().url();
          if (!u.includes(`venue_id=eq.${MOCK_VENUE}`)) return r.fulfill(json([]));
          const late = !firstA && o.pendingDelayA; firstA = false;
          if (late) await sleep(late as number);
          const rows = [1, 2, 3].map((i) => ({ id: `aaaaaaaa-0000-4000-8000-00000000000${i}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, player_name: `대기${i}`, user_id: null, note: null, status: 'pending', created_at: `${MOCK_DAY}T02:00:00Z`, requested_game_seq: null, voucher_id: null }));
          return r.fulfill(json(rows)).catch(() => {});
        });
      }
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
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

// ── ① 펼친 레일이 장부 도구 줄을 덮지 않는다 ──────────────────────────────────────────────
for (const [W, H] of [[1024, 768], [1280, 800], [1366, 768]] as const) {
  test(`${W} — ① 펼친 이용권 레일이 장부 도구 줄을 덮지 않는다`, async ({ page }) => {
    test.setTimeout(120_000);
    const { writes } = await boot(page, W, H, { vouchers: true });
    await railStep(page, '장부');
    await expect(page.locator('[data-ledger-workspace="strip"]'), '1024~1439 인데 접힌 띠가 아니다(이 검사의 전제)').toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-pane="ledger"] table').first(), '장부 표가 안 열렸다').toBeVisible({ timeout: 20_000 });
    await page.locator('[data-voucher-strip]').first().evaluate((b) => (b as HTMLElement).click());
    const aside = page.locator('aside[aria-label="매장이용권 실시간 내역"]');
    await expect(aside, '레일이 펼쳐지지 않았다').toBeVisible();
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const vis = (e: Element) => e.getClientRects().length > 0;
      const pane = document.querySelector('[data-pane="ledger"]')!;
      const btn = (rx: RegExp) => [...pane.querySelectorAll<HTMLElement>('button')].find((b) => vis(b) && rx.test((b.getAttribute('aria-label') ?? '') + ' ' + (b.textContent ?? '').trim()));
      const tools: Record<string, HTMLElement | undefined> = {
        '+ 유저 추가': btn(/\+ 유저 추가/), '가나다': btn(/^ ?가나다$/), '세션 정보 수정': btn(/세션 정보 수정/), '클락': btn(/^ ?클락$/),
        '이용권 확인': document.querySelector<HTMLElement>('[data-testid="ledger-voucher-jump"]') ?? undefined,
        '전체화면': document.querySelector<HTMLElement>('[data-testid="ledger-fullscreen"]') ?? undefined,
      };
      const out: Record<string, string> = {};
      for (const [k, el] of Object.entries(tools)) {
        if (!el || !vis(el)) { out[k] = 'missing'; continue; }
        const b = el.getBoundingClientRect();
        const pts = [[b.left + 3, b.top + b.height / 2], [b.left + b.width / 2, b.top + b.height / 2], [b.right - 3, b.top + b.height / 2]];
        out[k] = pts.every(([x, y]) => { const hit = document.elementFromPoint(x, y); return !!hit && (hit === el || el.contains(hit)); }) ? 'ok' : `covered@${Math.round(b.left)},${Math.round(b.top)}`;
      }
      const a = document.querySelector('aside[aria-label="매장이용권 실시간 내역"]')!.getBoundingClientRect();
      return { out, rail: { w: Math.round(a.width), h: Math.round(a.height), top: Math.round(a.top) } };
    });
    console.log(`[①${W}]`, JSON.stringify(r));
    const checked = Object.values(r.out).filter((v) => v !== 'missing').length;
    expect(checked, '도구를 하나도 못 찾았다 — 빈 검사').toBeGreaterThanOrEqual(5);
    expect(Object.entries(r.out).filter(([, v]) => v.startsWith('covered')), '펼친 레일이 장부 도구를 덮었다').toEqual([]);
    expect(r.rail.w, '펼친 레일 폭이 20rem(340px) 근처가 아니다').toBeGreaterThan(300);
    expect(r.rail.h, '레일이 너무 낮아 쓸 수 없다').toBeGreaterThanOrEqual(240);
    // 펼친 채 도구를 바로 누를 수 있다 — [+ 유저 추가] 한 번으로 추가 입력이 열린다(종전: 레일 안에 맞아 무반응)
    const add = page.locator('[data-pane="ledger"] button', { hasText: '+ 유저 추가' }).first();
    const bb = (await add.boundingBox())!;
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await expect(page.locator('[data-pane="ledger"] input[placeholder*="이름"]').first(), '[+ 유저 추가] 를 한 번 눌렀는데 입력이 안 열렸다').toBeVisible({ timeout: 5_000 });
    expect(writes, '운영 쓰기가 나갔다').toEqual([]);
  });
}

// ── ② 1920: 클락 미리보기·입력칸 읽기 폭 상한 ─────────────────────────────────────────────
test('1920 — ② 클락 미리보기·한 줄 입력칸·라벨↔토글 거리 상한(W-1·W-2·W-3)', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page, 1920, 1080, { vouchers: true });
  const wideInputs = () => page.evaluate(() => {
    const pane = [...document.querySelectorAll<HTMLElement>('[data-pane]')].find((p) => p.getClientRects().length && p.style.display !== 'none');
    if (!pane) return [] as { id: string; w: number }[];
    return [...pane.querySelectorAll<HTMLElement>('input, textarea')]
      .filter((e) => e.getClientRects().length && !['checkbox', 'radio', 'range', 'file', 'hidden', 'color'].includes((e as HTMLInputElement).type))
      .map((e) => ({ id: `${pane.dataset.pane}:${e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? e.id ?? e.tagName}`, w: Math.round(e.getBoundingClientRect().width) }));
  });
  const seen: { id: string; w: number }[] = [];
  // 클락(W-1 · 클락 단계 입력칸)
  await sideMenu(page, /게임 진행/); await page.waitForTimeout(500);
  await railStep(page, '클락');
  const prev = page.locator('[aria-label="클락 화면 미리보기"]').first();
  await expect(prev, '클락 화면 미리보기가 없다').toBeVisible({ timeout: 20_000 });
  const pb = (await prev.boundingBox())!;
  console.log('[②미리보기]', Math.round(pb.width), Math.round(pb.height));
  expect(pb.width, 'W-1 1920 클락 미리보기가 판 폭만큼 늘어난다').toBeLessThanOrEqual(962);
  seen.push(...await wideInputs());
  // 대시보드 · 직원 · 매장 설정(매장 페이지 · POS)
  for (const re of [/^대시보드$/, /직원 관리/, /매장 설정/]) { await sideMenu(page, re); await page.waitForTimeout(1500); seen.push(...await wideInputs()); }
  for (const tab of ['POS·결제', '매장 페이지']) {
    await page.evaluate((t) => { [...document.querySelectorAll<HTMLElement>('[role=tab], button')].find((b) => b.getClientRects().length && (b.textContent ?? '').trim() === t)?.click(); }, tab);
    await page.waitForTimeout(1500); seen.push(...await wideInputs());
    if (tab === 'POS·결제') {
      // W-3 — '매장 알림 수신' 라벨과 그 토글의 가로 거리
      const gap = await page.evaluate(() => {
        const pane = document.querySelector<HTMLElement>('[data-pane="pos"]');
        const lab = pane && [...pane.querySelectorAll<HTMLElement>('*')].find((e) => e.children.length === 0 && /매장 알림 수신/.test(e.textContent ?? '') && e.getClientRects().length);
        if (!lab) return null;
        let row: HTMLElement | null = lab;
        while (row && row !== pane && !row.querySelector('[role=switch], input[type=checkbox], button[aria-pressed]')) row = row.parentElement;
        const ctl = row?.querySelector<HTMLElement>('[role=switch], input[type=checkbox], button[aria-pressed]');
        if (!ctl) return null;
        // 라벨 상자(블록 p)는 줄 끝까지 차므로 **글자** 상자로 잰다
        const rg = document.createRange(); rg.selectNodeContents(lab);
        return Math.round(ctl.getBoundingClientRect().left - rg.getBoundingClientRect().right);
      });
      console.log('[②W-3 라벨↔토글]', gap);
      expect(gap, 'W-3 매장 알림 수신 라벨/토글을 못 찾았다 — 빈 검사').not.toBeNull();
      expect(gap!, 'W-3 라벨과 토글이 화면 반대편에 있다').toBeLessThanOrEqual(900);
    }
  }
  console.log('[②입력칸]', JSON.stringify(seen));
  expect(seen.length, '입력칸을 하나도 못 쟀다 — 빈 검사').toBeGreaterThanOrEqual(5);
  expect(seen.filter((s) => s.w > 962), 'W-2 1920 에서 한 줄 입력칸이 읽기 폭(≈960px)을 넘는다').toEqual([]);
});

// ── ③ 장부 첫 진입: 마감된 메인 보드가 한 번도 그려지지 않는다 ───────────────────────────────
for (const [W, H] of [[1440, 900], [1366, 768]] as const) {
  test(`${W} — ③ 장부 첫 진입에 마감 메인 보드가 끼지 않고 진행 게임에 바로 선다`, async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page, W, H, { lat: 250 });
    // 보드 제목 카드(세션 요약)의 제목이 DOM 에 들어온 순서를 전부 기록한다(그려지기 전 단계까지 — 프레임 표본보다 엄격하다)
    await page.evaluate(() => {
      const W8 = window as unknown as { __titles: string[] };
      W8.__titles = [];
      const grab = () => {
        for (const s of document.querySelectorAll<HTMLElement>('[data-pane="ledger"] .card-aura > div > span.font-bold')) {
          const t = (s.textContent ?? '').trim();
          if (/^데일리 \d+부$/.test(t) && W8.__titles[W8.__titles.length - 1] !== t) W8.__titles.push(t);
        }
      };
      new MutationObserver(grab).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await railStep(page, '장부');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __titles: string[] }).__titles.slice(-1)[0] ?? null),
      { message: '진행 중 마지막 게임(데일리 15부)에 서지 않았다', timeout: 15_000 }).toBe('데일리 15부');
    await page.waitForTimeout(800);
    const titles = await page.evaluate(() => (window as unknown as { __titles: string[] }).__titles);
    console.log(`[③${W}]`, JSON.stringify(titles));
    expect(titles.length, '보드 제목을 하나도 못 잡았다 — 빈 검사').toBeGreaterThan(0);
    expect(titles, '마감된 메인(데일리 1부) 보드가 진입 중에 그려졌다(깜빡임)').toEqual(['데일리 15부']);
  });
}

// ── ④ 매장 A→B 전환: 셸 유지 · 본문만 대기 · A 늦은 응답 무시 ───────────────────────────────
for (const [W, H] of [[1440, 900], [1366, 768]] as const) {
  test(`${W} — ④ 매장 전환 동안 사이드 메뉴·단계 바가 남고, 늦게 온 A 응답이 B 에 남지 않는다`, async ({ page }) => {
    test.setTimeout(120_000);
    const { writes } = await boot(page, W, H, { twoVenues: true, permDelayB: 700, pendingDelayA: 1500 });
    await expect(page.getByLabel('관리할 매장 선택'), '매장 고르개가 없다(이 검사의 전제)').toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/바인 대기/).first(), 'A 매장 바인 대기가 먼저 보여야 한다(이 검사의 전제)').toBeVisible({ timeout: 15_000 });
    // A 의 '바인 대기' 재조회를 하나 띄워 둔다(1.5초 뒤 도착) — 포커스 재조회 경로
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.evaluate(() => {
      const W8 = window as unknown as { __f: unknown[]; __stop: boolean };
      W8.__f = []; W8.__stop = false;
      const vis = (s: string) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().height > 0; };
      const tick = () => {
        const pane = document.querySelector('[data-mystore-secpanel]');
        W8.__f.push({ t: Math.round(performance.now()), side: vis('[data-mystore-secbar]'), rail: vis('[data-mystore-rail]'),
          busy: !!pane?.querySelector('[aria-busy="true"]') || /불러오는 중/.test(pane?.textContent ?? ''),
          bare: !pane && /불러오는 중/.test(document.querySelector('main[data-tab=my-store]')?.textContent ?? ''),
          pendA: /바인 대기\s*3\s*건/.test(document.querySelector('main[data-tab=my-store]')?.textContent ?? '') });
        if (!W8.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByLabel('관리할 매장 선택').selectOption(VENUE_B);
    await page.waitForTimeout(2600);
    await page.evaluate(() => { (window as unknown as { __stop: boolean }).__stop = true; });
    const f = await page.evaluate(() => (window as unknown as { __f: { side: boolean; rail: boolean; busy: boolean; bare: boolean; pendA: boolean }[] }).__f);
    const miss = f.filter((x) => !x.side || !x.rail).length;
    console.log(`[④${W}] frames=${f.length} 셸없음=${miss} 본문대기=${f.filter((x) => x.busy).length} A대기잔존(끝)=${f.slice(-10).some((x) => x.pendA)}`);
    expect(f.length, '프레임을 못 모았다 — 빈 검사').toBeGreaterThan(30);
    expect(f.some((x) => x.busy), '본문 대기 상태를 한 번도 못 봤다 — 전환이 일어나지 않은 빈 검사').toBe(true);
    expect(miss, '매장 전환 중 사이드 메뉴·단계 바가 사라진 프레임이 있다').toBe(0);
    // 끝 상태: B 화면 — A 의 늦은 '바인 대기 3건' 이 남지 않고, 사이드 메뉴·단계 바·본문이 다 선다
    expect(f.slice(-10).some((x) => x.pendA), '늦게 온 A 매장 바인 대기가 B 화면에 남았다').toBe(false);
    await expect(page.locator('[data-mystore-secpanel] [aria-busy="true"]'), 'B 권한이 왔는데 본문이 계속 대기 중이다').toHaveCount(0);
    expect(writes, '운영 쓰기가 나갔다').toEqual([]);
  });
}
