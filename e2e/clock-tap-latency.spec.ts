// 클락 +/− 즉시 반응·연타 합산·에코 되돌림 0 (오너 2026-09-24 CLOCK-TAP-LAG)
//
// 오너: "엔트리를 올리거나 하면 올라가는 게 버벅버벅, 내려가는 것도 버벅버벅."
//
// 실측 원인(이 스펙이 잡는 것)
//   ① 저장마다 **realtime 에코**(clock_states UPDATE) → reloadState() → GET → setState(서버값).
//      연타 중에는 그 GET 이 '앞선 탭까지만 반영된' 행을 돌려줘 화면 숫자가 **뒤로 갔다가 다시 온다**(되돌림).
//   ② 탭마다 전 행 upsert 가 **병렬로** 나가 서버 도착 순서가 뒤섞일 수 있다(마지막 도착이 이긴다).
//
// 조건: 서버 왕복 300ms(REST 라우트 지연) · CPU 4× · 실제 터치(CDP Input.dispatchTouchEvent — Playwright click 은 누름 0ms).
// realtime 은 page.routeWebSocket 으로 Phoenix(vsn 2.0.0) 프로토콜을 흉내 내 **저장 뒤 에코를 실제로 보낸다**.
// 운영 DB 쓰기 0 — 모든 REST·WS 가 이 파일 안의 가짜 서버에서 끝난다.
import { test, expect } from './_fixtures';
import type { Page, Route, WebSocketRoute, CDPSession } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const RTT = 300;
// 사람 손 연타 간격(≈4탭/초). 40ms 처럼 왕복보다 훨씬 빠르면 재조회 스탬프가 우연히 합쳐 줘서 되돌림이 안 보인다(실측).
const GAP = Number(process.env.TAP_GAP ?? 250);
const RAIL = '[data-mystore-rail]';

const level = (sb: number, bb: number) => ({ kind: 'level', sb, bb, ante: bb, minutes: 20 });
function clockRow() {
  return {
    venue_id: MOCK_VENUE, game_seq: 1, session_date: MOCK_DAY, title: '수요 딥스택',
    config: {
      title: '수요 딥스택', startStack: 50_000, rebuyStack: 70_000, addonStack: 30_000, isAddon: true,
      earlyBonus: 5_000, doubleEarlyBonus: 10_000, regCloseLevel: 12, maxLevel: 18,
      earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
      prizes: [], levels: [level(100, 200), level(200, 400), level(300, 600)],
    },
    current_index: 0, running: false, ends_at: null, remaining_ms: 20 * 60_000,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null,
    updated_at: new Date().toISOString(),
  };
}
const sessionRow = () => ({
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: true, addon_stack: 30_000, title: '수요 딥스택', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: new Date(Date.now() - 3_600_000).toISOString(), tournament_start: null, schedule_id: null,
});
const buyinRow = (i: number, name: string) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
  player_name: name, entry_no: 1, payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T03:00:00Z`, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
});

type Chan = { topic: string; ids: number[]; table?: string };
/** 가짜 서버 — clock_states 한 행 + realtime 에코. */
async function fakeServer(page: Page, init: Record<string, unknown> = clockRow()) {
  const srv = { row: init, writes: [] as Record<string, unknown>[], echoes: 0, gets: 0, ledgerEcho: () => {},
    buyins: [buyinRow(1, '홍길동'), buyinRow(2, '박민수')] };
  const sockets: { ws: WebSocketRoute; chans: Chan[] }[] = [];
  let nextId = 1000;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const push = (table: string) => {
    for (const s of sockets) for (const c of s.chans) {
      if (c.table !== table) continue;
      if (table === 'clock_states') srv.echoes++;
      s.ws.send(JSON.stringify([null, null, c.topic, 'postgres_changes', {
        ids: c.ids, data: { type: 'UPDATE', schema: 'public', table, commit_timestamp: new Date().toISOString(), columns: [], record: table === 'clock_states' ? srv.row : {}, old_record: {}, errors: null },
      }]));
    }
  };
  srv.ledgerEcho = () => push('ledger_buyins');
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const sock = { ws, chans: [] as Chan[] };
    sockets.push(sock);
    ws.onMessage((raw) => {
      let m: unknown[];
      try { m = JSON.parse(String(raw)); } catch { return; }
      const [joinRef, ref, topic, event, payload] = m as [string | null, string | null, string, string, Record<string, unknown>];
      if (event === 'phx_join') {
        const cfg = (payload?.config ?? {}) as { postgres_changes?: Record<string, unknown>[] };
        const pgc = (cfg.postgres_changes ?? []).map((c) => ({ ...c, id: nextId++ } as Record<string, unknown>));
        for (const p of pgc) sock.chans.push({ topic, ids: [p.id as number], table: p.table as string | undefined });
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pgc } }]));
      } else if (event === 'heartbeat' || event === 'phx_leave' || event === 'access_token') {
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
  const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
  const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
  await page.route(/\/rest\/v1\/clock_states/, async (r) => {
    const m = r.request().method();
    // 요청 본문·응답 시점은 **도착 순서대로** 처리한다(병렬 요청은 병렬로 지연된다 — 진짜 서버처럼)
    await wait(RTT / 2);
    if (m === 'GET') { srv.gets++; const snap = srv.row; await wait(RTT / 2); return r.fulfill(json(isSingle(r) ? snap : [snap])); }
    if (m === 'POST' || m === 'PATCH') {
      const b = r.request().postDataJSON();
      const body = (Array.isArray(b) ? b[0] : b) as Record<string, unknown>;
      srv.writes.push({ method: m, ...body });
      srv.row = { ...srv.row, ...body };
      setTimeout(() => push('clock_states'), 20);   // 커밋 직후 WAL → realtime 에코
      await wait(RTT / 2);
      // PATCH 는 mustAffect(.select()) 라 반영 행을 돌려받아야 성공이다 — 0행이면 앱이 실패로 본다
      return r.fulfill(m === 'PATCH' ? json([srv.row]) : { status: 201, contentType: 'application/json', body: '' });
    }
    return r.fallback();
  });
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    return r.fulfill(json(isSingle(r) ? sessionRow() : [sessionRow()]));
  });
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => (r.request().method() === 'GET'
    ? r.fulfill(json(srv.buyins)) : r.fallback()));
  return srv;
}

async function openClock(page: Page, w: number, h: number) {
  let srv!: Awaited<ReturnType<typeof fakeServer>>;
  await bootOwner(page, { viewport: { width: w, height: h }, clock: clockRow(), extra: async (p) => { srv = await fakeServer(p); } });
  await openMyStore(page);
  await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
  const ok = await page.evaluate((sel) => {
    const b = [...document.querySelectorAll<HTMLElement>(`${sel} button`)].find((x) => getComputedStyle(x).display !== 'none' && x.textContent?.trim() === '클락');
    b?.click(); return !!b;
  }, RAIL);
  expect(ok, '레일에 «클락» 칸이 없다').toBe(true);
  await expect(page.getByTestId('clk-main-action')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => statValue(page, 'Entries'), { timeout: 15_000, message: '장부 연동 값(2명)이 안 들어왔다' }).toBe(2);
  await page.waitForTimeout(1500);
  return srv;
}

const statValue = (page: Page, label: string) => page.evaluate((l) => {
  const s = [...document.querySelectorAll<HTMLElement>('span')].find((x) => x.firstChild?.textContent?.trim() === l && x.querySelector('b'));
  return s ? Number(s.querySelector('b')!.textContent) : NaN;
}, label);

/** 스테퍼 버튼 중심(뷰포트 좌표). which 0=＋ 1=－ */
const btnCenter = (page: Page, label: string, which: 0 | 1) => page.evaluate(([l, i]) => {
  const s = [...document.querySelectorAll<HTMLElement>('span')].find((x) => x.firstChild?.textContent?.trim() === l && x.querySelector('b'))!;
  const b = s.parentElement!.querySelectorAll<HTMLButtonElement>('button')[i as number];
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [label, which] as const);

async function touchTap(cdp: CDPSession, x: number, y: number, holdMs: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, holdMs));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 값 변화를 페이지 안에서 시각과 함께 기록한다(클릭 시각도 같은 시계로). */
const arm = (page: Page, label: string) => page.evaluate((l) => {
  const w = window as unknown as { __log: { t: number; v?: number; click?: true }[]; __armed?: boolean };
  w.__log = [];
  if (w.__armed) return;
  w.__armed = true;
  const s = [...document.querySelectorAll<HTMLElement>('span')].find((x) => x.firstChild?.textContent?.trim() === l && x.querySelector('b'))!;
  const b = s.querySelector('b')!;
  new MutationObserver(() => w.__log.push({ t: performance.now(), v: Number(b.textContent) }))
    .observe(b, { childList: true, characterData: true, subtree: true });
  document.addEventListener('click', () => w.__log.push({ t: performance.now(), click: true }), true);
}, label);
const readLog = (page: Page) => page.evaluate(() => (window as unknown as { __log: { t: number; v?: number; click?: true }[] }).__log);

for (const [W, H] of [[1440, 900], [390, 844]] as const) {
  test(`🔴 ${W}px — 지연 ${RTT}ms·CPU 4× 에서 엔트리 탭이 즉시 반영되고, 연타 20회가 정확히 합산되며 에코가 되돌리지 않는다`, async ({ page }) => {
    test.setTimeout(120_000);
    const srv = await openClock(page, W, H);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    // ① 단발 탭 지연 — 5회, 탭 사이 1.5s(에코·재조회가 다 끝난 뒤)
    await arm(page, 'Entries');
    for (let i = 0; i < 5; i++) {
      const c = await btnCenter(page, 'Entries', 0);
      await touchTap(cdp, c.x, c.y, 80);
      await page.waitForTimeout(1500);
    }
    const log1 = await readLog(page);
    const lat: number[] = [];
    let lastClick = -1;
    for (const e of log1) {
      if (e.click) lastClick = e.t;
      else if (lastClick >= 0) { lat.push(e.t - lastClick); lastClick = -1; }
    }
    const vals1 = log1.filter((e) => e.v !== undefined).map((e) => e.v!);
    console.log(`[${W}] 단발 탭→숫자 변화 ms: ${lat.map((x) => x.toFixed(1)).join(', ')} · 값 ${vals1.join('→')}`);
    expect(lat.length, '탭 5회 중 숫자가 바뀐 횟수').toBe(5);
    expect.soft(Math.max(...lat), `탭→숫자 변화가 100ms 를 넘었다: ${lat.join(', ')}`).toBeLessThanOrEqual(100);
    expect(await statValue(page, 'Entries')).toBe(7);

    // ② 연타 20회(누름 40ms · 간격 40ms) — 합산 정확 · 숫자가 뒤로 가지 않음 · 최종 서버값 일치
    const before = await statValue(page, 'Entries');
    const w0 = srv.writes.length; const e0 = srv.echoes;
    await arm(page, 'Entries');
    const c = await btnCenter(page, 'Entries', 0);
    for (let i = 0; i < 20; i++) { await touchTap(cdp, c.x, c.y, 40); await page.waitForTimeout(GAP); }
    await page.waitForTimeout(3500);   // 저장·에코·재조회가 전부 가라앉을 때까지
    const log2 = await readLog(page);
    const vals = log2.filter((e) => e.v !== undefined).map((e) => e.v!);
    const backs = vals.filter((v, i) => i > 0 && v < vals[i - 1]).length;
    const clicks = log2.filter((e) => e.click).length;
    console.log(`[${W}] 연타: 클릭 ${clicks} · 값 ${vals.join('→')} · 되돌림 ${backs} · 쓰기 ${srv.writes.length - w0} · 에코 ${srv.echoes - e0} · GET ${srv.gets}`);
    expect(clicks, '터치 20회가 클릭 20회가 되지 않았다(하네스 문제)').toBe(20);
    expect.soft(backs, `연타 중 숫자가 뒤로 갔다(에코 되돌림): ${vals.join('→')}`).toBe(0);
    expect.soft(await statValue(page, 'Entries'), '화면 최종값').toBe(before + 20);
    expect.soft(srv.row.adj_entries, '서버 최종 adj_entries').toBe(before + 20 - 2);
    expect.soft((srv.row.live_stats as { entries?: number } | null)?.entries, '서버 live_stats.entries(TV 가 읽는 값)').toBe(before + 20);
    // 보드(ClockStage)는 뒤따라 그리지만 **같은 값에 도착**해야 한다
    await expect.soft(page.getByTestId('clk-rails').first(), '운영자 미리보기 보드가 최종 엔트리에 도착하지 않았다').toContainText(`/ ${before + 20}`);
    // 바뀐 칸만 보낸다 — 엔트리 연타가 레벨·타이머·탈락 칸을 다시 쓰지 않는다(다른 기기 변경 보존)
    const extra = srv.writes.slice(w0).flatMap((w) => Object.keys(w)).filter((k) => !['method', 'adj_entries', 'live_stats', 'updated_at'].includes(k));
    expect.soft([...new Set(extra)], '엔트리 연타 저장에 다른 칸이 실렸다').toEqual([]);

    // ③ 내려가기 — 연타 10회
    await arm(page, 'Entries');
    const m = await btnCenter(page, 'Entries', 1);
    for (let i = 0; i < 10; i++) { await touchTap(cdp, m.x, m.y, 40); await page.waitForTimeout(GAP); }
    await page.waitForTimeout(3500);
    const vals3 = (await readLog(page)).filter((e) => e.v !== undefined).map((e) => e.v!);
    const ups = vals3.filter((v, i) => i > 0 && v > vals3[i - 1]).length;
    console.log(`[${W}] 내림 연타: 값 ${vals3.join('→')} · 역행 ${ups}`);
    expect.soft(ups, `내림 연타 중 숫자가 위로 튀었다: ${vals3.join('→')}`).toBe(0);
    expect(await statValue(page, 'Entries')).toBe(before + 10);
    expect(srv.row.adj_entries).toBe(before + 10 - 2);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
}

// ── 장부 ↔ 클락 동시 편집 — 장부에 바인이 들어오는 사이 클락에서 + 연타 ──
//   장부 몫(derived)과 수기 보정(adj)은 다른 칸이다. 둘 다 살아남아야 하고, TV 스냅샷(live_stats)은 둘의 합이어야 한다.
test('🔴 1440px — 장부 바인 추가와 클락 엔트리 + 연타가 겹쳐도 장부 몫·보정·TV 스냅샷이 모두 맞는다', async ({ page }) => {
  test.setTimeout(120_000);
  const srv = await openClock(page, 1440, 900);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const c = await btnCenter(page, 'Entries', 0);
  for (let i = 0; i < 10; i++) {
    if (i === 4) { srv.buyins.push(buyinRow(3, '김철수')); srv.ledgerEcho(); }   // 접수대에서 바인 1건
    await touchTap(cdp, c.x, c.y, 40); await page.waitForTimeout(GAP);
  }
  await page.waitForTimeout(3500);
  console.log(`[concurrent] 화면 ${await statValue(page, 'Entries')} · adj ${srv.row.adj_entries} · live_stats.entries ${(srv.row.live_stats as { entries?: number }).entries}`);
  expect.soft(await statValue(page, 'Entries'), '화면 = 장부 3명 + 보정 10').toBe(13);
  expect.soft(srv.row.adj_entries, '보정 칸에 장부 몫이 섞이면 안 된다').toBe(10);
  expect.soft((srv.row.live_stats as { entries?: number }).entries, 'TV 스냅샷 = 장부 + 보정').toBe(13);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

// ── 휴대폰 리모컨(?remote=) — 예전엔 저장 중 탭을 **버렸다**(busyRef). 같은 저장기를 쓰는지 본다. ──
test(`🔴 리모컨 — 지연 ${RTT}ms·CPU 4× 연타 20회가 하나도 버려지지 않고 TV 스냅샷(live_stats)까지 합산된다`, async ({ page }) => {
  test.setTimeout(120_000);
  const LS = { entries: 2, rebuys: 0, earlies: 0, earliesRaw: 0, addons: 0, alive: 2, eliminations: 0, totalStack: 100_000, avgStack: 50_000, buyInAmount: 100_000 };
  let srv!: Awaited<ReturnType<typeof fakeServer>>;
  await bootOwner(page, { viewport: { width: 390, height: 844 }, goto: false, extra: async (p) => { srv = await fakeServer(p, { ...clockRow(), live_stats: LS }); } });
  await page.goto(`/?remote=${MOCK_VENUE}&g=1`);
  const plus = page.getByRole('button', { name: '엔트리 더하기' });
  await expect(plus).toBeEnabled({ timeout: 20_000 });
  const value = () => plus.evaluate((b) => Number(b.parentElement!.querySelectorAll('span')[1].textContent));
  await expect.poll(value, { timeout: 15_000 }).toBe(2);
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await plus.evaluate((b) => {
    const w = window as unknown as { __log: number[] }; w.__log = [];
    const v = b.parentElement!.querySelectorAll('span')[1];
    new MutationObserver(() => w.__log.push(Number(v.textContent))).observe(v, { childList: true, characterData: true, subtree: true });
  });
  const box = (await plus.boundingBox())!;
  for (let i = 0; i < 20; i++) { await touchTap(cdp, box.x + box.width / 2, box.y + box.height / 2, 40); await page.waitForTimeout(GAP); }
  await page.waitForTimeout(3500);
  const vals = await page.evaluate(() => (window as unknown as { __log: number[] }).__log);
  const backs = vals.filter((v, i) => i > 0 && v < vals[i - 1]).length;
  console.log(`[remote] 값 ${vals.join('→')} · 되돌림 ${backs} · 쓰기 ${srv.writes.length}`);
  expect.soft(backs, `리모컨 연타 중 숫자가 뒤로 갔다: ${vals.join('→')}`).toBe(0);
  expect.soft(await value(), '리모컨 화면 최종값(탭이 버려지면 모자란다)').toBe(22);
  expect.soft(srv.row.adj_entries, '서버 adj_entries').toBe(20);
  expect.soft((srv.row.live_stats as { entries?: number }).entries, 'TV 가 읽는 live_stats.entries').toBe(22);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
