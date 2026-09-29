// 토스트 겹쳐 쌓기 — 오너 결정 #13(2026-09-29, 판단 위임): 되돌리기 토스트 3장이 390 화면 아래를 덮던 것.
//
// 채택안: 2장 이상이면 최신 토스트만 앞에, 나머지는 뒤에 겹친다(src/components/atoms/ToastView.tsx '겹쳐 쌓기').
//   장수 제한·합치기를 버린 이유는 앞 토스트의 되돌리기가 사라지거나(제한) 무엇을 되돌리는지 흐려지기(합치기) 때문이다.
// 계약(되돌리기 기능 보존이 핵심):
//   ① 3장이 떠도 더미 높이 ≤ 최신 1장 + 비침 2줄(작은 여유) — 종전은 3장 + 틈 2개
//   ② 되돌리기 버튼 3개가 **전부** 접근성 트리에 있다(스크린리더) — 접혀 있어도
//   ③ 손가락(누름 120ms)으로 더미를 누르면 펼쳐지고, 그 탭은 **아무것도 닫거나 되돌리지 않는다**
//      (실측 결함: 펼치는 탭의 click 이 펼쳐진 뒤 손가락 아래로 온 다른 토스트에 떨어져 그걸 닫았다)
//   ④ 펼친 뒤 가장 오래된 토스트의 되돌리기가 눌리고, 그 토스트의 동작이 서버에 간다
//   ⑤ 키보드 포커스(:focus-visible)만으로도 펼쳐져 오래된 되돌리기가 화면에 드러나고 Enter 로 실행된다
//   ⑥ 뜨고 빠지고 펼치는 동안 입력 제외 layout-shift 0 (D4 유지)
// 토스트 생산자는 클락 운영자의 일시정지/재개(각각 '실행취소' 5초) — 계정 없이 목킹 업주 + 상태 있는 가짜 clock_states.
// 음성 대조(2026-09-29 실행): ToastView.tsx 의 `k={collapsed ? … : 0}` 를 `k={0}` 으로 → ① FAIL · 항목 onClick 의 `justOpened()` 가드를
//   빼면 → ③ FAIL('펼치는 탭이 토스트를 닫았다') · onFocus 의 setFocusIn(true) 를 빼면 → ⑤ FAIL.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/toast-pile.spec.ts
import { test, expect } from './_fixtures';
import type { Page, Route, CDPSession } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

type Row = Record<string, unknown>;
const L = (sb: number) => ({ kind: 'level', sb, bb: sb * 2, ante: sb * 2, minutes: 20 });
const baseRow = (): Row => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: 'PILE',
  config: { title: 'PILE', startStack: 50_000, rebuyStack: 0, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 0, maxLevel: 3, earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [], levels: [L(100), L(200), L(300)] },
  current_index: 1, running: true, ends_at: new Date(Date.now() + 10 * 60_000).toISOString(), remaining_ms: 20 * 60_000,
  adj_entries: 12, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 3, live_stats: null, updated_at: new Date().toISOString(),
});
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function openClock(page: Page, w: number, h: number) {
  const srv = { row: baseRow(), patches: [] as Row[] };
  const handler = async (r: Route) => {
    const req = r.request();
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object');
    if (req.method() === 'GET') return r.fulfill(json(single ? srv.row : [srv.row]));
    if (req.method() === 'PATCH') { const b = req.postDataJSON() as Row; srv.patches.push(b); Object.assign(srv.row, b); return r.fulfill(json([srv.row])); }
    return r.abort();
  };
  await page.addInitScript(() => {
    (window as unknown as { __ls: { v: number; input: boolean }[] }).__ls = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) (window as unknown as { __ls: { v: number; input: boolean }[] }).__ls.push({ v: e.value, input: e.hadRecentInput }); })
      .observe({ type: 'layout-shift', buffered: true });
  });
  await bootOwner(page, { viewport: { width: w, height: h }, goto: true, extra: async (p) => { await p.route(/\/rest\/v1\/clock_states/, handler); } });
  await openMyStore(page);
  await page.getByRole('tablist', { name: '매장 단계 이동' }).getByRole('tab', { name: /클락/ }).click({ timeout: 30_000 });
  await page.getByTestId('clk-main-action').waitFor({ timeout: 30_000 });
  return srv;
}

/** 실제 손가락 — 누름 120ms(Playwright tap 은 0ms 라 터치 click 합성 타이밍을 못 재현한다). */
async function finger(cdp: CDPSession, page: Page, x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 토스트 더미 기하 — 보이는 토스트들의 합집합 높이, 되돌리기(실행취소) 버튼별 hit-test(오래된 것부터). */
const pileGeo = (page: Page) => page.evaluate(() => {
  const box = document.querySelector('div[aria-live="polite"].fixed')!;
  const cards = [...box.querySelectorAll<HTMLElement>('[role="status"]')].filter((e) => +getComputedStyle(e).opacity > 0.05);
  const rs = cards.map((e) => e.getBoundingClientRect());
  const btns = [...box.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent?.includes('실행취소'));
  const hits = btns.map((b) => { const q = b.getBoundingClientRect(); const h = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return !!h && (h === b || b.contains(h)); });
  const oldest = box.querySelector<HTMLElement>('[role="status"]');
  const o = oldest?.getBoundingClientRect();
  return {
    n: box.querySelectorAll('[role="status"]').length,
    union: rs.length ? Math.max(...rs.map((r) => r.bottom)) - Math.min(...rs.map((r) => r.top)) : 0,
    frontH: rs.length ? rs[rs.length - 1].height : 0,
    hits, oldestTop: o ? { x: o.left + o.width / 2, y: o.top + 3 } : null,
  };
});

/** 일시정지 → 재개 → 일시정지 — '실행취소' 토스트 3장(오래된 것 = 일시정지의 실행취소). */
async function threeToasts(page: Page, srv: { row: Row }) {
  for (const want of [false, true, false]) {
    await page.getByTestId('clk-main-action').click();
    await expect.poll(() => srv.row.running, { timeout: 5_000 }).toBe(want);
  }
  await expect.poll(async () => (await pileGeo(page)).n, { message: '실행취소 토스트 3장이 뜨지 않았다(측정 전제 없음)' }).toBe(3);
  await page.waitForTimeout(400);   // 진입 전환(0.32s) 정착
}

for (const [name, w, h] of [['390x844', 390, 844], ['1440x900', 1440, 900]] as [string, number, number][]) {
  test.describe(`토스트 겹쳐 쌓기 ${name}(#13)`, () => {
    test('🔴 ① 3장이 떠도 더미 높이가 1장 + 비침 수준 · ② 되돌리기 3개는 접근성 트리에 전부 있다 · ⑥ CLS 0', async ({ page }) => {
      test.setTimeout(120_000);
      const srv = await openClock(page, w, h);
      await page.evaluate(() => { (window as unknown as { __ls: unknown[] }).__ls.length = 0; });
      await threeToasts(page, srv);
      const g = await pileGeo(page);
      console.log(`[toast-pile ${name}]`, JSON.stringify(g));
      expect(g.union, `더미 높이 ${g.union.toFixed(0)}px — 최신 1장(${g.frontH.toFixed(0)}px)+비침 2줄을 넘는다(종전처럼 세로로 쌓였다)`).toBeLessThanOrEqual(g.frontH + 2 * 10 + 4);
      expect(g.hits.at(-1), '최신 토스트의 실행취소를 바로 누를 수 없다').toBe(true);
      await expect(page.getByRole('button', { name: '실행취소' }), '접힌 토스트의 되돌리기가 접근성 트리에서 빠졌다').toHaveCount(3);
      const ls = await page.evaluate(() => (window as unknown as { __ls: { v: number; input: boolean }[] }).__ls);
      expect(ls.filter((e) => !e.input).reduce((a, e) => a + e.v, 0), '입력과 무관한 layout-shift').toBe(0);
    });

    test('🔴 ③ 손가락으로 더미를 누르면 펼쳐지고 그 탭은 아무것도 닫지·되돌리지 않는다 · ④ 가장 오래된 되돌리기가 서버에 간다', async ({ page }) => {
      test.setTimeout(120_000);
      const srv = await openClock(page, w, h);
      const cdp = await page.context().newCDPSession(page);
      await threeToasts(page, srv);
      const g0 = await pileGeo(page);
      const patches0 = srv.patches.length;
      expect(g0.oldestTop).not.toBeNull();
      await finger(cdp, page, g0.oldestTop!.x, g0.oldestTop!.y);   // 더미 윗변(가장 오래된 토스트가 비치는 띠)
      await page.waitForTimeout(450);
      const g1 = await pileGeo(page);
      console.log(`[toast-pile ${name} open]`, JSON.stringify({ before: g0, after: g1 }));
      expect(g1.n, '펼치는 탭이 토스트를 닫았다').toBe(3);
      expect(srv.patches.length, '펼치는 탭이 되돌리기를 실행했다').toBe(patches0);
      expect(g1.hits, '펼친 뒤에도 가려진 실행취소가 있다').toEqual([true, true, true]);
      // ④ 가장 오래된 토스트 = 첫 일시정지의 실행취소 → 서버가 진행 상태로 돌아간다(지금은 정지)
      expect(srv.row.running).toBe(false);
      const oldest = page.locator('div[aria-live="polite"].fixed [role="status"]').first().getByRole('button', { name: '실행취소' });
      const b = (await oldest.boundingBox())!;
      await finger(cdp, page, b.x + b.width / 2, b.y + b.height / 2);
      await expect.poll(() => srv.row.running, { timeout: 5_000, message: '가장 오래된 실행취소가 서버에 가지 않았다' }).toBe(true);
    });

    test('🔴 ⑤ 키보드 포커스만으로 펼쳐지고 Enter 로 오래된 되돌리기가 실행된다', async ({ page }) => {
      test.setTimeout(120_000);
      const srv = await openClock(page, w, h);
      await threeToasts(page, srv);
      await page.keyboard.press('Shift');   // 마지막 입력을 키보드로 — 프로그램 포커스도 :focus-visible 이 된다
      const oldest = page.locator('div[aria-live="polite"].fixed [role="status"]').first().getByRole('button', { name: '실행취소' });
      await oldest.focus();
      await page.waitForTimeout(450);
      const g = await pileGeo(page);
      expect(g.hits[0], '키보드로 포커스한 오래된 실행취소가 여전히 다른 토스트에 가려져 있다').toBe(true);
      await page.keyboard.press('Enter');
      await expect.poll(() => srv.row.running, { timeout: 5_000, message: 'Enter 로 실행취소가 실행되지 않았다' }).toBe(true);
    });
  });
}
