// 장부 옆 이용권 실시간 레일 — 오너 1b(2026-10-02): "직원이 장부를 보며 옆에서 이용권 발급·전송·사용이 **새로고침 없이** 들어오는지 본다."
//
// 재는 것(전부 목킹 — 운영 쓰기 0, Realtime 소켓도 가짜 서버):
//   ① 1440×900 — 레일이 **표 오른쪽**에 펼쳐져 있고(표 아래가 아니다), 바인 칸이 9칸 이상 보인다(판 폭 상한 해제).
//   ② 다른 탭에서 발급 → 서버가 store_vouchers INSERT 를 흘리면 **3초 안에** 레일에 그 손님이 뜬다.
//      30초 폴링으로는 3초 안에 못 뜬다 — 구독 경로가 살아 있어야만 통과한다(음성 대조: 구독을 끊으면 빨개진다).
//   ③ 구독 필터가 **이 매장**(venue_id=eq.<이 매장>)이다 — 다른 매장 이벤트가 섞이지 않는 서버 쪽 경계.
//   ④ 소켓이 끊겼다 다시 붙으면(재연결) 이벤트 없이도 놓친 발급을 다시 읽어 레일에 그린다.
//   ⑤ 1280×720 — 접힌 띠(48px)에 새 이용권 배지가 뜨고, 누르면 펼쳐져 그 손님이 보인다. 표 바인 10칸은 그대로.
//   ⑥ 전체화면 1366×768 — 레일이 오른쪽에 있고 같은 발급이 3초 안에 뜬다.
import { test, expect } from './_fixtures';
import type { Page, WebSocketRoute } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const RAIL = '[data-mystore-rail]';
const ASIDE = 'aside[aria-label="매장이용권 실시간 내역"]';
const SESSION = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: `${MOCK_DAY}T10:00:00Z`, tournament_start: null, schedule_id: null, operators: [],
};
const PLAYERS = Array.from({ length: 14 }, (_, i) => ({
  id: `ffffffff-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
  name: `손님${i + 1}`, visitor_type: null, note: null, sort_order: i,
}));
const voucher = (i: number, holder: string, minsAgo: number) => ({
  id: `vv000000-0000-4000-8000-${String(i).padStart(12, '0')}`, venue_id: MOCK_VENUE, issued_by: '00000000-0000-4000-8000-0000000000ee',
  holder_user_id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`, holder_name: holder, title: '데일리 참가권', status: 'active',
  used_venue_id: null, used_at: null, created_at: new Date(Date.now() - minsAgo * 60_000).toISOString(),
  expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), issue_reason: 'event', event_campaign_id: null, used_for: null,
  venue: { name: '테스트 홀덤펍' }, used_venue: null,
});

type Chan = { topic: string; id: number; table?: string; event?: string; filter?: string };
async function open(page: Page, w: number, h: number) {
  const st = { vouchers: [voucher(1, '기존손님', 30), voucher(2, '어제손님', 600)], socks: [] as { ws: WebSocketRoute; chans: Chan[] }[], listGets: 0 };
  let nextId = 7000;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    const sock = { ws, chans: [] as Chan[] };
    st.socks.push(sock);
    ws.onMessage((raw) => {
      let m: unknown[];
      try { m = JSON.parse(String(raw)); } catch { return; }
      const [joinRef, ref, topic, event, payload] = m as [string | null, string | null, string, string, Record<string, unknown>];
      if (event === 'phx_join') {
        const cfg = (payload?.config ?? {}) as { postgres_changes?: Record<string, unknown>[] };
        const pgc = (cfg.postgres_changes ?? []).map((c) => ({ ...c, id: nextId++ } as Record<string, unknown>));
        for (const p of pgc) sock.chans.push({ topic, id: p.id as number, table: p.table as string, event: p.event as string, filter: p.filter as string | undefined });
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pgc } }]));
      } else if (event === 'phx_leave') {
        sock.chans = sock.chans.filter((c) => c.topic !== topic);
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      } else {
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
  await bootOwner(page, {
    viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        return r.fulfill(json(single ? SESSION : [SESSION]));
      });
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(PLAYERS)) : r.fallback()));
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        // 레일 조회는 이 매장으로 좁혀 나가야 한다 — 다른 매장 것을 받아 거르는 구조가 아니다.
        if (!r.request().url().includes(`venue_id=eq.${MOCK_VENUE}`)) return r.fulfill(json([]));
        st.listGets++;
        return r.fulfill(json(st.vouchers));
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().click();
  await expect(page.locator('[data-testid="ledger-date"]').first(), '장부 보드가 안 열렸다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  /** 다른 탭(다른 기기)에서 발급 → 서버가 커밋하고 이 매장 필터 구독에 INSERT 를 흘린다. */
  const issueElsewhere = (row: ReturnType<typeof voucher>) => {
    st.vouchers = [row, ...st.vouchers];
    let sent = 0;
    for (const s of st.socks) for (const c of s.chans) {
      if (c.table !== 'store_vouchers' || c.filter !== `venue_id=eq.${MOCK_VENUE}`) continue;
      s.ws.send(JSON.stringify([null, null, c.topic, 'postgres_changes', {
        ids: [c.id], data: { type: 'INSERT', schema: 'public', table: 'store_vouchers', commit_timestamp: new Date().toISOString(), columns: [{ name: 'id', type: 'uuid' }], record: row, old_record: null, errors: null },
      }]));
      sent++;
    }
    return sent;
  };
  return { st, issueElsewhere };
}

const layout = (page: Page) => page.evaluate((asideSel) => {
  const vis = (e: Element | null) => !!e && e.getClientRects().length > 0;
  const t = [...document.querySelectorAll('[data-pane="ledger"] table')].find(vis);
  const wrap = t?.closest('.overflow-auto') as HTMLElement | null;
  const W = wrap?.getBoundingClientRect();
  const th = t ? [...t.querySelectorAll('thead th')] : [];
  const pl = th.find((x) => x.textContent?.trim() === '플레이어')?.getBoundingClientRect();
  const tot = th.find((x) => x.textContent?.trim() === '총바인')?.getBoundingClientRect();
  const bins = th.filter((x) => /^\d+바인$/.test(x.textContent?.trim() ?? '')).map((x) => x.getBoundingClientRect());
  const full = pl && tot ? bins.filter((r) => r.left >= pl.right - 1 && r.right <= tot.left + 1).length : 0;
  const rail = [...document.querySelectorAll(asideSel)].find(vis)?.getBoundingClientRect();
  const strip = [...document.querySelectorAll('[data-voucher-strip]')].find(vis)?.getBoundingClientRect();
  return { tableRight: W?.right ?? null, tableBottom: W?.bottom ?? null, bins: full, rail: rail ? { left: rail.left, top: rail.top, w: rail.width } : null, strip: strip ? { left: strip.left, w: strip.width } : null };
}, ASIDE);

test.describe('장부 옆 이용권 실시간 레일(오너 1b)', () => {
  test('① 1440 — 레일이 표 오른쪽 · 바인 9칸+ / ② 다른 탭 발급 3초 안 표시 / ③ 매장 필터 / ④ 재연결 따라잡기', async ({ page }) => {
    test.setTimeout(120_000);
    const { st, issueElsewhere } = await open(page, 1440, 900);
    const rail = page.locator(ASIDE);
    await expect(rail, '1440 에서 레일이 펼쳐져 있지 않다').toBeVisible();
    await expect(rail).toContainText('기존손님');
    const L = await layout(page);
    console.log('[1440]', JSON.stringify(L));
    expect(L.rail, '레일을 못 쟀다').not.toBeNull();
    expect(L.rail!.left, '레일이 표 오른쪽에 있지 않다(표 아래로 내려갔다)').toBeGreaterThanOrEqual((L.tableRight ?? 1e9) - 1);
    expect(L.bins, '레일을 펼친 채 바인 칸이 9칸 미만이다(판 폭 상한이 안 풀렸다)').toBeGreaterThanOrEqual(9);

    // ③ 구독이 이 매장 필터로 걸렸다(다른 매장 INSERT 는 서버가 이 채널에 보내지 않는다)
    const filters = st.socks.flatMap((s) => s.chans).filter((c) => c.table === 'store_vouchers').map((c) => c.filter ?? '(없음)');
    expect(filters, '이용권 구독이 없다').toContain(`venue_id=eq.${MOCK_VENUE}`);

    // ② 다른 탭에서 발급 → 3초 안에(폴링 30초 전에) 레일에 뜬다
    const sent = issueElsewhere(voucher(3, '새손님_실시간', 0));
    expect(sent, '흘려 보낼 매장 필터 채널이 없다 — 빈 검사').toBeGreaterThan(0);
    await expect(rail.getByText('새손님_실시간'), '다른 탭 발급이 3초 안에 레일에 뜨지 않았다(새로고침 필요)').toBeVisible({ timeout: 3_000 });

    // ④ 소켓 끊김 → 재연결(SUBSCRIBED 재진입) → 이벤트 없이도 놓친 발급을 다시 읽는다
    st.vouchers = [voucher(4, '끊긴동안손님', 0), ...st.vouchers];
    const before = st.listGets;
    for (const s of st.socks) s.ws.close();
    await expect(rail.getByText('끊긴동안손님'), '재연결 뒤 끊긴 동안의 발급을 따라잡지 못했다').toBeVisible({ timeout: 15_000 });
    expect(st.listGets, '재연결 뒤 레일이 다시 읽지 않았다').toBeGreaterThan(before);
  });

  test('⑤ 1280 — 접힌 띠 + 새 이용권 배지 → 누르면 펼침 · 표 바인 10칸 유지', async ({ page }) => {
    test.setTimeout(120_000);
    const { issueElsewhere } = await open(page, 1280, 720);
    const strip = page.locator('[data-voucher-strip]');
    await expect(strip, '1280 에서 접힌 띠가 없다').toBeVisible();
    const L = await layout(page);
    console.log('[1280]', JSON.stringify(L));
    expect(L.strip!.w, '띠 폭이 48px 이 아니다').toBeLessThanOrEqual(52);
    expect(L.strip!.left, '띠가 표 오른쪽에 있지 않다').toBeGreaterThanOrEqual((L.tableRight ?? 1e9) - 1);
    expect(L.bins, '띠를 둔 채 바인 칸이 10칸이 아니다').toBe(10);
    await expect(strip.locator('[data-voucher-fresh]'), '아무 일도 없는데 새 배지가 떠 있다').toHaveCount(0);
    issueElsewhere(voucher(5, '띠손님', 0));
    await expect(strip.locator('[data-voucher-fresh]'), '접힌 띠에 새 이용권 배지가 3초 안에 뜨지 않았다').toHaveText('1', { timeout: 3_000 });
    await strip.evaluate((b) => (b as HTMLElement).click());
    const rail = page.locator('aside[aria-label="매장이용권 실시간 내역"]');
    await expect(rail.getByText('띠손님'), '펼친 레일에 새 손님이 없다').toBeVisible();
    const L2 = await layout(page);
    expect(L2.bins, '레일을 펼쳤더니 표가 접혔다(덮어야 한다)').toBe(10);
    await page.locator('[data-voucher-collapse]').evaluate((b) => (b as HTMLElement).click());
    await expect(strip, '접기를 눌렀는데 띠로 돌아가지 않았다').toBeVisible();
    await expect(strip.locator('[data-voucher-fresh]'), '펼쳐 본 뒤에도 배지가 남았다').toHaveCount(0);
  });

  test('⑥ 전체화면 1366×768 — 레일 오른쪽 · 다른 탭 발급 3초 안 표시', async ({ page }) => {
    test.setTimeout(120_000);
    const { issueElsewhere } = await open(page, 1366, 768);
    await page.locator('[data-testid="ledger-fullscreen"]').first().evaluate((b) => (b as HTMLElement).click());
    const fs = page.locator('[data-ledger-fullscreen]');
    await expect(fs, '전체화면이 안 열렸다').toBeVisible();
    const rail = fs.locator(ASIDE);
    await expect(rail).toBeVisible();
    const r = await page.evaluate(() => {
      const host = document.querySelector('[data-ledger-fullscreen]')!;
      const t = host.querySelector('table')?.closest('.overflow-auto')?.getBoundingClientRect();
      const a = host.querySelector('aside')?.getBoundingClientRect();
      return { tableRight: t?.right ?? 0, railLeft: a?.left ?? 0 };
    });
    expect(r.railLeft, '전체화면 레일이 표 오른쪽이 아니다').toBeGreaterThanOrEqual(r.tableRight - 1);
    issueElsewhere(voucher(6, '전체화면손님', 0));
    await expect(rail.getByText('전체화면손님'), '전체화면에서 다른 탭 발급이 3초 안에 뜨지 않았다').toBeVisible({ timeout: 3_000 });
  });
});
