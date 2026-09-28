// 내 매장 연동 수정(2026-09-28, store-team) — 전 빌드 FAIL · 후 빌드 PASS 로 재는 스펙.
//
//  B1 영업일 단일 원천 — 자정을 넘긴 토너(어제 장부가 안 닫힘)에서 대시보드가 '미시작'이 되고 손님 바인 요청이 사라지던 결함
//  B4 대시보드 '오늘 장부' KPI 가 메인 한 판만 세던 결함(사이드 매출 누락)
//  A1 장부 시작 폼의 포스터 **수동 선택**이 스택을 안 옮기던 결함
//  D1 클락 시각이 기기 시계 기준이던 결함(기기 +5분이면 ends_at 이 5분 밀린다)
//  D2 낡은 화면의 정지가 조건 없이 저장돼 다른 기기의 정지·재개를 덮던 결함
//
// ⚠ 목킹 세션(_mockOwner)이라 서버 인가의 근거가 아니다 — 화면·요청 모양만 잰다. 쓰기는 이 스펙이 직접 받아 준다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE, MOCK_UID, STORAGE_KEY, FAKE_SESSION } from './_mockOwner';

/** 브라우저 시계를 미래(다음 날 00:30)로 옮기면 _mockOwner 의 1시간짜리 가짜 세션이 만료돼 로그아웃된다 — 그 시각 기준으로 다시 심는다. */
async function sessionValidAt(page: Page, atMs: number) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(atMs / 1000) + 6 * 3600;
  const jwt = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: MOCK_UID, aud: 'authenticated', role: 'authenticated', exp }), 'e2e'].join('.');
  const s = { ...FAKE_SESSION, access_token: jwt, expires_at: exp };
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } }, [STORAGE_KEY, JSON.stringify(s)] as [string, string]);
}

type Row = Record<string, unknown>;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const session = (date: string, seq: number, over: Row = {}): Row => ({
  venue_id: MOCK_VENUE, session_date: date, game_seq: seq, title: seq === 1 ? '메인' : `사이드${seq - 1}`,
  buyin_amount: 100_000, card_amount: null, target_entries: 0, game_type: 'gtd', max_entries: 0, is_addon: false, addon_stack: 0,
  operators: [], discounts: [], early_double_min: 0, early_single_min: 0, tournament_start: null,
  opened_by: null, opened_at: `${date}T10:00:00Z`, reg_closed: false, closed: false, schedule_id: null, voucher_issued: 0,
  ...over,
});
const buyin = (date: string, seq: number, name: string, cash: number): Row => ({
  id: `${seq}-${name}`, venue_id: MOCK_VENUE, session_date: date, game_seq: seq, player_name: name, entry_no: 1,
  payment_method: 'cash', is_unpaid: false, is_split: false, cash_amount: cash, card_amount: 0, transfer_amount: 0,
  ticket_count: 0, unpaid_amount: 0, discount_index: 0, discount_level: 0, early_override: null,
  buyin_at: `${date}T11:00:00Z`, created_by: null, request_id: null,
});

/** ledger_sessions / ledger_buyins GET 을 행 목록으로 답한다(단건·목록·기간 조회 모두 url 필터로 거른다). */
async function serveLedger(page: Page, sessions: Row[], buyins: Row[]) {
  const pick = (rows: Row[], url: URL) => rows.filter((row) => {
    for (const [k, v] of url.searchParams) {
      if (!(k in row)) continue;
      const val = String(row[k]);
      if (v.startsWith('eq.') && val !== v.slice(3)) return false;
      if (v.startsWith('gte.') && val < v.slice(4)) return false;
      if (v.startsWith('lte.') && val > v.slice(4)) return false;
      if (v.startsWith('in.(') && !v.slice(4, -1).split(',').includes(val)) return false;
    }
    return true;
  });
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const rows = pick(sessions, new URL(r.request().url()));
    return r.fulfill(json(isSingle(r) ? (rows[0] ?? null) : rows));
  });
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    return r.fulfill(json(pick(buyins, new URL(r.request().url()))));
  });
}

test.describe('B1 영업일 — 자정을 넘긴 토너', () => {
  test('00:30 에 어제 장부가 열려 있으면 대시보드는 그 장부(진행중)와 그날 바인 요청을 보여 준다', async ({ page }) => {
    const Y = MOCK_DAY;                             // 어제(영업일)
    const T = Date.parse(`${addDays(Y, 1)}T00:30:00+09:00`);
    await bootOwner(page, {
      viewport: { width: 1280, height: 900 }, goto: false,
      extra: async (p) => {
        await serveLedger(p, [session(Y, 1)], [buyin(Y, 1, '손님A', 100_000)]);
        await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(Y)));
        await p.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => {
          if (r.request().method() !== 'GET') return r.fallback();
          const u = r.request().url();
          const hit = u.includes(Y) ? [{ id: 'req-1', venue_id: MOCK_VENUE, session_date: Y, player_name: '늦은손님', user_id: null, note: null,
            status: 'pending', created_at: new Date(T).toISOString(), requested_game_seq: 1, voucher_id: null }] : [];
          return r.fulfill(json(hit));
        });
      },
    });
    await sessionValidAt(page, T);
    await page.clock.install({ time: T });
    await page.goto('/');
    await openMyStore(page);
    const band = page.getByTestId('dash-kpi-buyins').locator('xpath=ancestor::button[1]');
    await expect(band, '자정 뒤 대시보드가 어제 영업일 장부를 못 본다(B1)').toContainText('진행중', { timeout: 20_000 });
    await expect(band).toContainText('10');
    await expect(page.getByText(/바인 대기\s*1\s*건/).first(), '어제 영업일 바인 요청이 대기열에서 사라졌다(B1)').toBeVisible({ timeout: 15_000 });
  });
});

test.describe('B4 대시보드 KPI = 그날 전 게임 합산', () => {
  test('메인 10만 + 사이드 5만 → 완납 매출 15만원 · 바인 2회 · 게임 2개 합산', async ({ page }) => {
    const D = MOCK_DAY;
    await bootOwner(page, {
      viewport: { width: 1280, height: 900 },
      extra: async (p) => {
        await serveLedger(p, [session(D, 1), session(D, 2, { buyin_amount: 50_000 })],
          [buyin(D, 1, '손님A', 100_000), buyin(D, 2, '손님B', 50_000)]);
        await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(D)));
      },
    });
    await openMyStore(page);
    const band = page.getByTestId('dash-kpi-buyins').locator('xpath=ancestor::button[1]');
    await expect(band).toContainText('진행중', { timeout: 20_000 });
    await expect(band, '대시보드 KPI 가 사이드 게임 매출을 빼먹었다(B4)').toContainText(/15\s*만원/, { timeout: 15_000 });
    await expect(page.getByTestId('dash-kpi-games')).toHaveText('게임 2개 합산');
  });
});

test.describe('A1 포스터 수동 선택 = 자동 연동과 같은 상속', () => {
  test('시작 폼에서 포스터를 고르면 포스터의 스타팅 스택이 들어온다', async ({ page }) => {
    const D = MOCK_DAY;
    const poster = (id: string, title: string, stack: number) => ({
      id, title, venue_id: MOCK_VENUE, pub_name: '테스트 홀덤펍', region: '서울', date: D, start_time: '19:00:00', approved: true,
      owner_id: '00000000-0000-4000-8000-0000000000ee', buy_in: { amount: 100_000, startStack: stack }, guaranteed: true,
      display_order: 1, promotions: [], side_events: [], ranking_prizes: [],
    });
    await bootOwner(page, {
      viewport: { width: 1280, height: 900 },
      extra: async (p) => {
        await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() === 'GET'
          ? r.fulfill(json([poster('p-1', '데일리A', 25_000), poster('p-2', '데일리B', 30_000)])) : r.fallback()));
        await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(D)));
      },
    });
    await openMyStore(page);
    await page.getByRole('tablist', { name: '매장 단계 이동' }).getByRole('tab', { name: /장부/ }).click({ timeout: 30_000 });
    const sel = page.locator('select').filter({ has: page.locator('option', { hasText: '연결 안 함 / 직접 입력' }) }).first();
    await expect(sel).toBeVisible({ timeout: 20_000 });
    await sel.selectOption('p-2');
    // 라벨 연결(<label>)은 이번에 같이 고쳤다 — 전 빌드와 같은 잣대로 재려고 글자 옆 입력칸으로 찾는다.
    const stack = page.locator("xpath=//span[normalize-space(text())='스타팅 스택']/following-sibling::div//input").first();
    await expect(stack, '포스터 수동 선택이 스타팅 스택을 안 옮겼다(A1)').toHaveValue('30000', { timeout: 10_000 });
  });
});

// ── 클락 ─────────────────────────────────────────────────────────────────────
const L = (sb: number, minutes = 20) => ({ kind: 'level', sb, bb: sb * 2, ante: sb * 2, minutes });
const cfg = { title: 'SKEW', startStack: 50_000, rebuyStack: 0, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0,
  regCloseLevel: 0, maxLevel: 3, earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [],
  levels: [L(100), L(200), L(300)] };
const clockRow = (over: Row = {}): Row => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: 'SKEW', config: cfg, current_index: 0, running: false, ends_at: null,
  remaining_ms: 20 * 60_000, adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null,
  updated_at: new Date().toISOString(), ...over,
});

/** 상태 있는 clock_states 서버 — PATCH 의 CAS 필터(ends_at eq/is.null · running eq)를 PostgREST 처럼 평가한다. */
function clockServer(row: Row) {
  const srv = { row, patches: [] as Row[], blocked: 0 };
  const handler = async (r: Route) => {
    const req = r.request();
    if (req.method() === 'GET') return r.fulfill(json(isSingle(r) ? srv.row : [srv.row]));
    if (req.method() === 'PATCH') {
      const q = new URL(req.url()).searchParams;
      const ends = q.get('ends_at'); const running = q.get('running');
      const endsOk = !ends || (ends === 'is.null' ? srv.row.ends_at == null
        : ends.startsWith('eq.') && Date.parse(ends.slice(3)) === Date.parse(String(srv.row.ends_at)));
      const runOk = !running || running === `eq.${String(srv.row.running)}`;
      if (!endsOk || !runOk) { srv.blocked++; return r.fulfill(json([])); }
      const body = req.postDataJSON() as Row;
      srv.patches.push(body);
      Object.assign(srv.row, body);
      return r.fulfill(json([srv.row]));
    }
    return r.abort();
  };
  return { srv, handler };
}
async function openClock(page: Page, row: Row, extra?: (p: Page) => Promise<void>) {
  const { srv, handler } = clockServer(row);
  await bootOwner(page, { viewport: { width: 1280, height: 900 }, goto: false, extra: async (p) => { await p.route(/\/rest\/v1\/clock_states/, handler); await extra?.(p); } });
  return { srv, go: async () => {
    await page.goto('/');
    await openMyStore(page);
    await page.getByRole('tablist', { name: '매장 단계 이동' }).getByRole('tab', { name: /클락/ }).click({ timeout: 30_000 });
    await page.getByTestId('clk-main-action').waitFor({ timeout: 30_000 });
  } };
}

test.describe('D1 서버 기준 시각', () => {
  test('기기 시계가 5분 빠른 PC 가 시작해도 ends_at 은 서버 시각 + 남은 시간이다', async ({ page }) => {
    test.setTimeout(120_000);
    const SERVER = Math.floor(Date.now() / 1000) * 1000;
    const SKEW = 5 * 60_000;
    const { srv, go } = await openClock(page, clockRow(), async (p) => {
      // 서버 시각 = 러너의 실제 시각. 브라우저 시계는 그보다 5분 빠르게 설치한다(아래 install).
      await p.route(/\/rest\/v1\/rpc\/server_now/, (r) => r.fulfill(json(new Date().toISOString())));
    });
    await page.clock.install({ time: SERVER + SKEW });
    await go();
    await page.waitForTimeout(1500);                       // 오프셋 측정(첫 serverNow 호출)이 끝날 시간
    await page.getByTestId('clk-main-action').click();
    await expect.poll(() => srv.patches.find((b) => b.running === true)?.ends_at, { timeout: 10_000 }).toBeTruthy();
    const ends = Date.parse(String(srv.patches.find((b) => b.running === true)!.ends_at));
    const expected = Date.now() + 20 * 60_000;             // 서버(러너) 기준 지금 + 1레벨 20분
    expect(Math.abs(ends - expected), `ends_at 이 서버 기준에서 ${Math.round((ends - expected) / 1000)}초 어긋났다(D1)`).toBeLessThan(5_000);
  });
});

test.describe('D2 낡은 화면의 조작은 덮어쓰지 않는다', () => {
  test('다른 기기가 이미 멈춘 클락을 옛 화면에서 멈추면 0행 → 다시 읽는다(정지 시간 보존)', async ({ page }) => {
    test.setTimeout(120_000);
    const endsAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const { srv, go } = await openClock(page, clockRow({ running: true, ends_at: endsAt, remaining_ms: 0 }));
    await go();
    await expect(page.getByTestId('clk-main-action')).not.toHaveText(/계속하기/, { timeout: 10_000 });
    Object.assign(srv.row, { running: false, ends_at: null, remaining_ms: 600_000 });   // 폰이 먼저 정지 — realtime 은 안 닿았다
    await page.getByTestId('clk-main-action').click();
    await page.waitForTimeout(2_000);
    expect(srv.row.remaining_ms, '옛 화면의 정지가 다른 기기가 멈춘 남은 시간을 덮었다(D2)').toBe(600_000);
    expect(srv.blocked).toBeGreaterThan(0);
    await expect(page.getByTestId('clk-main-action')).toHaveText(/계속하기/, { timeout: 10_000 });
  });
});
