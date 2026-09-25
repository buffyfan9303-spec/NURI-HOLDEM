// 오너 2026-09-25 MYSTORE-FULL-AUDIT — 클락 C1·C2·C4·C5·C6·C7·C10 회귀(PC 1440×900 · 매장 TV 1920×1080).
//
// 출처: root-cause-debugger 프로브(scratchpad clkprobe/*.probe.ts)를 **단언형**으로 옮겼다. 계정 없이 목킹 업주로 연다(_mockOwner).
//   · clock_states 는 **상태 있는 가짜 서버**다 — PATCH 를 행에 병합하고, `ends_at=eq.` 조건(CAS)이 어긋나면 0행([])을 돌려준다
//     (PostgREST 와 같다). 그래서 저장 뒤의 재조회가 '서버 진실'을 보여 준다.
//   · 운영 DB 쓰기 0 — PATCH 는 여기서 받고 끝난다(_fixtures 가드가 한 겹 더 끊는다).
// 음성 대조(2026-09-25): 수정 전 빌드(scratch st2-pre, preview 4421)에서 같은 스펙이 C1·C2·C4·C5·C6·C7·C10 전부 FAIL,
//   수정 후 빌드(4420)에서 PASS — 보고에 명령과 결과를 적었다.
// 실행: E2E_BASE_URL=http://localhost:4420 npx playwright test e2e/clock-audit-fixes.spec.ts
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

type Row = Record<string, unknown>;
const L = (sb: number, minutes = 20) => ({ kind: 'level', sb, bb: sb * 2, ante: sb * 2, minutes });
const cfg = (levels: unknown[]) => ({
  title: 'AUDIT', startStack: 50_000, rebuyStack: 0, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0,
  regCloseLevel: 0, maxLevel: 3, earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [],
  levels,
});
const baseRow = (over: Row = {}): Row => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: 'AUDIT', config: cfg([L(100), L(200), L(300)]),
  current_index: 1, running: true, ends_at: new Date(Date.now() + 10 * 60_000).toISOString(), remaining_ms: 20 * 60_000,
  adj_entries: 12, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 3, live_stats: null, updated_at: new Date().toISOString(),
  ...over,
});
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');

/** 상태 있는 clock_states 서버. patches = 반영된 PATCH 본문, blocked = CAS 로 0행이 된 PATCH 수. */
function clockServer(row: Row) {
  const srv = { row, patches: [] as Row[], blocked: 0 };
  const handler = async (r: Route) => {
    const req = r.request();
    if (req.method() === 'GET') return r.fulfill(json(isSingle(r) ? srv.row : [srv.row]));
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON() as Row;
      const ends = new URL(req.url()).searchParams.get('ends_at');
      if (ends && ends.startsWith('eq.') && Date.parse(ends.slice(3)) !== Date.parse(String(srv.row.ends_at))) {
        srv.blocked++;
        return r.fulfill(json([]));                 // CAS 불일치 = 0행(PostgREST 와 같다)
      }
      srv.patches.push(body);
      Object.assign(srv.row, body);
      return r.fulfill(json([srv.row]));
    }
    return r.abort();
  };
  return { srv, handler };
}

async function openClock(page: Page, row: Row) {
  const { srv, handler } = clockServer(row);
  await bootOwner(page, { goto: true, extra: async (p) => { await p.route(/\/rest\/v1\/clock_states/, handler); } });
  await openMyStore(page);
  await page.getByRole('tablist', { name: '매장 단계 이동' }).getByRole('tab', { name: /클락/ }).click({ timeout: 30_000 });
  await page.getByTestId('clk-main-action').waitFor({ timeout: 30_000 });
  return srv;
}

test.describe('클락 운영자 PC', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('C1 — 일시정지 직후 [실행취소] 는 서버를 진행 상태로 되돌린다', async ({ page }) => {
    test.setTimeout(120_000);
    const srv = await openClock(page, baseRow());
    await page.getByTestId('clk-main-action').click();                        // 일시정지
    await expect.poll(() => srv.row.running, { timeout: 10_000 }).toBe(false);
    await page.getByRole('button', { name: '실행취소' }).first().click();
    await expect.poll(() => srv.row.running, { timeout: 10_000, message: '실행취소 뒤에도 서버가 정지 상태다(C1)' }).toBe(true);
    expect(Date.parse(String(srv.row.ends_at))).toBeGreaterThan(Date.now());
  });

  test('C1 — 재개 직후 [실행취소] 는 서버를 정지 상태로 되돌린다', async ({ page }) => {
    test.setTimeout(120_000);
    const srv = await openClock(page, baseRow({ running: false, ends_at: null, remaining_ms: 7 * 60_000 }));
    await page.getByTestId('clk-main-action').click();                        // 계속하기
    await expect.poll(() => srv.row.running, { timeout: 10_000 }).toBe(true);
    await page.getByRole('button', { name: '실행취소' }).first().click();
    await expect.poll(() => srv.row.running, { timeout: 10_000, message: '재개 실행취소가 서버에 아무것도 안 보냈다(C1)' }).toBe(false);
    expect(srv.row.ends_at).toBeNull();
  });

  test('C7 — 끝난 대회의 주 버튼은 비활성 · "대회 종료" · 누를 수 있는 다음 행동이 보인다', async ({ page }) => {
    test.setTimeout(120_000);
    const srv = await openClock(page, baseRow({ current_index: 2, running: false, ends_at: null, remaining_ms: 0 }));
    const main = page.getByTestId('clk-main-action');
    await expect(main).toHaveText(/대회 종료/);
    await expect(main).toBeDisabled();
    await expect(page.getByTestId('clk-finished-extend')).toBeVisible();
    expect(srv.patches).toEqual([]);
  });

  test('C10 — 끝난 대회에 레벨을 덧붙이면 첫 새 레벨에서 일시정지로 이어지고 [계속하기] 가 살아난다', async ({ page }) => {
    test.setTimeout(120_000);
    const srv = await openClock(page, baseRow({ current_index: 2, running: false, ends_at: null, remaining_ms: 0 }));
    await page.getByTestId('clk-finished-extend').click();
    const ed = page.getByTestId('clk-live-editor');
    await expect(ed).toBeVisible();
    await expect(ed.locator('[data-row-state="passed"]')).toHaveCount(3);     // 기존 레벨은 전부 지남(잠김)
    await ed.getByTestId('clk-live-add-level').click();
    await ed.getByTestId('clk-live-apply').click();
    await expect.poll(() => srv.patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const p = srv.patches[srv.patches.length - 1];
    expect((p.config as { levels: unknown[] }).levels).toHaveLength(4);
    expect(p).toMatchObject({ current_index: 3 });                            // 바뀐 칸만 간다 — running·ends_at 은 이미 정지값
    expect(srv.row).toMatchObject({ current_index: 3, running: false, ends_at: null, remaining_ms: 20 * 60_000 });
    expect(p).not.toHaveProperty('eliminations');                            // 탈락·엔트리 기록은 그대로
    expect(p).not.toHaveProperty('adj_entries');
    const main = page.getByTestId('clk-main-action');
    await expect(main).toHaveText(/계속하기/);
    await expect(main).toBeEnabled();
  });

  test('C10 — 진행 중: 지난 레벨은 잠기고, 뒤에 레벨을 붙이면 config 만 바뀐다', async ({ page }) => {
    test.setTimeout(120_000);
    const srv = await openClock(page, baseRow());                            // index 1 진행 중
    await page.getByTestId('clk-edit-structure').click();
    const ed = page.getByTestId('clk-live-editor');
    await expect(ed.locator('[data-level-row="0"] input').first()).toBeDisabled();       // 지난 레벨
    await expect(ed.locator('[data-level-row="1"]')).toHaveAttribute('data-row-state', 'current');
    await expect(ed.getByLabel('레벨 2 시간(분)')).toBeDisabled();                         // 진행 중 레벨 길이는 Min/Sec ± 로
    await ed.getByLabel('레벨 3 BB').fill('900');                                       // 앞으로 올 레벨 수정
    await ed.getByTestId('clk-live-add-level').click();
    await ed.getByTestId('clk-live-apply').click();
    await expect.poll(() => srv.patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    const p = srv.patches[srv.patches.length - 1];
    const lv = (p.config as { levels: { bb: number }[] }).levels;
    expect(lv).toHaveLength(4);
    expect(lv[2].bb).toBe(900);
    for (const k of ['current_index', 'running', 'ends_at', 'remaining_ms', 'eliminations', 'adj_entries']) expect(p).not.toHaveProperty(k);
  });

  test('C2 — 다른 기기가 멈춘 클락을 PC 워치독이 한 칸 올리지 않는다(CAS 0행 → 재조회)', async ({ page }) => {
    test.setTimeout(120_000);
    const T0 = Math.floor(Date.now() / 1000) * 1000 + 60_000;
    await page.clock.install({ time: T0 - 5_000 });
    const srv = await openClock(page, baseRow({ current_index: 0, ends_at: new Date(T0 + 20_000).toISOString(), remaining_ms: 20 * 60_000 }));
    await page.clock.pauseAt(T0 + 10_000);
    Object.assign(srv.row, { running: false, ends_at: null, remaining_ms: 10_000 });   // 리모컨이 정지 — realtime 은 이 PC 에 안 닿았다
    await page.clock.runFor(12_000);                                                   // 옛 경계(T0+20s)를 지난다 → 워치독
    await page.waitForTimeout(1500);
    expect(srv.row.current_index, 'PC 워치독이 멈춘 클락의 레벨을 올렸다(C2)').toBe(0);
    expect(srv.row.running).toBe(false);
    await expect(page.getByTestId('clk-main-action')).toHaveText(/계속하기/, { timeout: 10_000 });   // 재조회로 서버 진실(정지)
  });

  test('C5 — 일시정지는 누른 순간의 남은 시간을 얼린다(렌더 시점 아님)', async ({ page }) => {
    test.setTimeout(150_000);
    const T0 = Math.floor(Date.now() / 1000) * 1000 + 60_000;
    let curEnds = T0 + 600_000;
    await page.clock.install({ time: T0 - 30_000 });
    const srv = await openClock(page, baseRow({ current_index: 0, ends_at: new Date(curEnds).toISOString() }));
    const gains: number[] = [];
    for (const k of [0, 1]) {
      await page.clock.pauseAt(T0 + 10_000 * (k + 1) + (curEnds % 1000));     // 표시 초가 바뀌는 경계
      await page.clock.runFor(950);                                           // 경계 + 950ms 에서 누른다
      const clickAt = await page.evaluate(() => Date.now());
      const before = srv.patches.length;
      await page.getByTestId('clk-main-action').click();
      await page.clock.runFor(1_500);
      await page.waitForTimeout(600);
      const p = srv.patches.slice(before).find((b) => b.running === false);
      gains.push(Number(p?.remaining_ms) - (curEnds - clickAt));
      await page.getByTestId('clk-main-action').click();                      // 재개 → 새 endsAt
      await page.clock.runFor(1_500);
      await page.waitForTimeout(600);
      curEnds = Date.parse(String(srv.row.ends_at));
    }
    for (const g of gains) expect(Math.abs(g), `정지할 때 ${g}ms 를 돌려줬다(C5)`).toBeLessThanOrEqual(60);
  });
});

test.describe('매장 TV', () => {
  const TV = '00000000-0000-4000-8000-00000000e2e2';
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('C4 — DB 쓰기 없이 레벨 경계를 지나도 LEVEL·CURRENT 가 타이머를 따라온다', async ({ page }) => {
    test.setTimeout(120_000);
    const T0 = Date.parse('2026-09-25T12:00:00Z');
    const row = { ...baseRow({ venue_id: TV, current_index: 0, running: true, ends_at: new Date(T0 + 5_000).toISOString(), updated_at: new Date(T0).toISOString() }),
      config: cfg([L(100, 1), L(200, 1), L(300, 1)]) };
    await page.route(/\/rest\/v1\/clock_states/, (r) => r.fulfill(json([row])));
    await page.clock.install({ time: T0 });
    await page.goto(`/?display=${TV}&g=1&auto=0`);
    await page.getByTestId('clk-timer').waitFor({ timeout: 60_000 });
    await page.clock.pauseAt(T0 + 2_000);
    await expect(page.getByTestId('clk-level')).toHaveText('LEVEL 1');
    await page.clock.runFor(5_000);                                          // 5초 경계를 지난다(쓰기 0 · 폴링 30초 전)
    await expect(page.getByTestId('clk-level'), 'TV LEVEL 이 옛 레벨에 머문다(C4)').toHaveText('LEVEL 2', { timeout: 3_000 });
    await expect(page.getByTestId('clk-cur-blinds')).toContainText('200');
    await expect(page.getByTestId('clk-cur-blinds')).toContainText('400');
  });

  test('C6 — 재조회 두 번이 역순으로 도착해도 최신 값이 남는다', async ({ page }) => {
    test.setTimeout(120_000);
    const mk = (alive: number) => ({ ...baseRow({ venue_id: TV, running: false, ends_at: null, remaining_ms: 600_000 }),
      live_stats: { entries: 10, rebuys: 0, earlies: 0, addons: 0, alive, eliminations: 10 - alive, totalStack: 500000, avgStack: 0 } });
    let phase = 0;
    await page.route(/\/rest\/v1\/clock_states/, async (r) => {
      if (phase === 1) { phase = 2; await new Promise((res) => setTimeout(res, 1500)); return r.fulfill(json([mk(7)])); }  // 먼저 나간 옛 조회, 늦게 도착
      return r.fulfill(json([mk(phase === 0 ? 8 : 6)]));
    });
    await page.goto(`/?display=${TV}&g=1&auto=0`);
    const alive = page.getByTestId('clk-rails').locator('span.tabular-nums').first();
    await expect(alive).toHaveText('8', { timeout: 60_000 });
    phase = 1;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // 조회 #2(느림 · 7)
    await page.waitForTimeout(100);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // 조회 #3(빠름 · 6 = 최신)
    await page.waitForTimeout(2_500);
    await expect(alive, '늦게 도착한 옛 응답이 최신 값을 덮었다(C6)').toHaveText('6');
  });
});
