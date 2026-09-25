// 오너 2026-09-25 MYSTORE-FULL-AUDIT — 장부 화면 D1·D2·D3·D5·D8·D9 회귀(PC 1280×900, 목킹 업주 · 운영 DB 쓰기 0).
//
//   D1 다른 접수대의 바인 취소(DELETE)가 이 화면에 닿는다 — realtime 을 Phoenix 프로토콜로 흉내 내고,
//      **필터 걸린 바인딩에는 DELETE 를 보내지 않는다**(Supabase 실제 동작: "Delete events are not filterable").
//   D2 늦게 도착한 앞 게임 세션 응답이 지금 게임의 세션(제목·단가)을 덮지 않는다.
//   D3 비밀번호가 생겼는데 화면이 모르는 상태 → 서버 거절 문구로 입력칸이 나타난다.
//   D5 직원 목록 RPC 에 매장 id 를 넘긴다.
//   D8 대기열 재조회가 역순 도착해도 최신(빈 대기열)이 남는다.
//   D9 비밀번호 미설정 매장 업주의 취소 문구 · 확정 연타는 RPC 1회.
// 음성 대조(2026-09-25): 수정 전 빌드(4421)에서 D1·D2·D3·D5·D8·D9 FAIL, 수정 후(4420) PASS — 보고에 기록.
// 실행: E2E_BASE_URL=http://localhost:4420 npx playwright test e2e/ledger-audit-fixes.spec.ts
import { test, expect } from './_fixtures';
import type { Page, WebSocketRoute } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ed';
const VENUE = '55555555-5555-4555-8555-555555555555';
const DAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'owner3@example.com', app_metadata: {}, user_metadata: { name: '업주' }, created_at: new Date().toISOString() },
};
const session = (seq: number, title: string, amount: number) => ({
  venue_id: VENUE, session_date: DAY, game_seq: seq, buyin_amount: amount, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title, discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: `${DAY}T10:00:00Z`, tournament_start: null, schedule_id: null,
});
const MAIN = session(1, '메인게임', 100_000);
const SIDE = session(2, '사이드게임', 50_000);
const PLAYER = { id: 'ffffffff-0000-4000-8000-000000000001', venue_id: VENUE, session_date: DAY, game_seq: 1, name: '김철수', visitor_type: 'regular', note: null, sort_order: 1 };
const BUYIN = {
  id: 'bbbbbbbb-0000-4000-8000-000000000001', venue_id: VENUE, session_date: DAY, game_seq: 1, player_name: '김철수', entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${DAY}T10:05:00Z`, created_by: UID, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: 'none', request_id: null,
};
const REQ = { id: 'rrrrrrrr-0000-4000-8000-000000000001', venue_id: VENUE, session_date: DAY, player_name: '대기손님', user_id: null, note: null, status: 'pending', created_at: `${DAY}T10:10:00Z`, requested_game_seq: null, voucher_id: null };

interface Opts {
  hasPw?: boolean;
  /** 테스트가 응답을 바꿔 끼우는 훅 */
  sessionDelay?: { seq: number; ms: number } | null;
  pending?: () => Promise<unknown[]>;
  cancel?: () => Promise<{ status: number; body: unknown }>;
}
type Chan = { topic: string; id: number; table?: string; event?: string; filter?: string };

async function openBoard(page: Page, o: Opts = {}) {
  const st = {
    buyins: [BUYIN] as unknown[], buyinGets: 0, staffArgs: [] as unknown[], cancelCalls: 0,
    sessionDelay: o.sessionDelay ?? null, socks: [] as { ws: WebSocketRoute; chans: Chan[] }[],
  };
  let nextId = 5000;
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
      } else {
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } }, [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active', venue_id: VENUE, activity_points: 0,
    created_at: FAKE.user.created_at, agreed_to_terms: true, consented_legal_version: 2,
  })));
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{ id: VENUE, name: '테스트 홀덤', region: '서울', address: '서울 강남구 1', owner_id: UID, approved: true, status: 'active', verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 0, rating: 4.5 }])));
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_manage_venue|can_view_vouchers)/, (r) => r.fulfill(json(true)));
  await page.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => {
    const u = r.request().url();
    const seq = /game_seq=eq\.(\d+)/.exec(u)?.[1];
    if (seq && /session_date=eq\./.test(u)) {
      const d = st.sessionDelay;
      if (d && d.seq === Number(seq)) { st.sessionDelay = null; await new Promise((res) => setTimeout(res, d.ms)); }
      return r.fulfill(json(seq === '2' ? SIDE : MAIN));
    }
    return r.fulfill(json([MAIN, SIDE]));
  });
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => {
    st.buyinGets++;
    const seq = /game_seq=eq\.(\d+)/.exec(r.request().url())?.[1];
    return r.fulfill(json(seq === '2' ? [] : st.buyins));
  });
  await page.route(/\/rest\/v1\/ledger_players\?/, (r) => {
    const seq = /game_seq=eq\.(\d+)/.exec(r.request().url())?.[1];
    return r.fulfill(json(seq === '2' ? [] : [PLAYER]));
  });
  await page.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(!!o.hasPw)));
  await page.route(/\/rest\/v1\/rpc\/get_my_venue_staff/, (r) => { st.staffArgs.push(r.request().postDataJSON()); return r.fulfill(json([])); });
  await page.route(/\/rest\/v1\/rpc\/cancel_ledger_buyin/, async (r) => {
    st.cancelCalls++;
    const res = o.cancel ? await o.cancel() : { status: 204, body: '' };
    return r.fulfill(res.status === 204 ? { status: 204, body: '' } : json(res.body, res.status));
  });
  await page.route(/\/rest\/v1\/ledger_buyin_requests\?/, async (r) => r.fulfill(json(o.pending ? await o.pending() : [])));
  await page.route(/\/rest\/v1\/customer_aliases\?/, (r) => r.fulfill(json([])));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
  const store = page.locator('[data-tab="my-store"]');
  await expect(store).toBeVisible({ timeout: 20_000 });
  await store.locator('button:visible').filter({ hasText: /^장부$/ }).first().click({ timeout: 20_000 });
  await expect(store.locator('td button:visible').filter({ hasText: /^현/ }).first()).toBeVisible({ timeout: 25_000 });
  /** 서버가 DELETE 를 커밋한 것처럼 흘린다 — **필터 걸린 바인딩에는 가지 않는다**(Supabase 실제 동작). */
  const pushDelete = (table: string, old: Record<string, unknown>) => {
    for (const s of st.socks) for (const c of s.chans) {
      if (c.table !== table || c.filter || (c.event !== '*' && c.event !== 'DELETE')) continue;
      s.ws.send(JSON.stringify([null, null, c.topic, 'postgres_changes', {
        ids: [c.id], data: { type: 'DELETE', schema: 'public', table, commit_timestamp: new Date().toISOString(), columns: [{ name: 'id', type: 'uuid' }], record: null, old_record: old, errors: null },
      }]));
    }
  };
  return { store, st, pushDelete };
}

test.describe('장부 화면', () => {
  test.setTimeout(180_000);

  test('D1 — 다른 접수대가 바인을 취소하면 이 화면이 다시 읽어 칸이 비워진다', async ({ page }) => {
    const { store, st, pushDelete } = await openBoard(page);
    const before = st.buyinGets;
    st.buyins = [];                                              // 옆 창구에서 취소됨(서버에서 지워짐)
    pushDelete('ledger_buyins', { id: BUYIN.id });
    await expect.poll(() => st.buyinGets, { timeout: 8_000, message: 'DELETE 알림이 재조회를 부르지 않았다(D1)' }).toBeGreaterThan(before);
    await expect(store.locator('td button:visible').filter({ hasText: /^현/ })).toHaveCount(0, { timeout: 8_000 });
  });

  test('D2 — 앞 게임(메인) 세션의 늦은 응답이 지금 게임(사이드) 세션을 덮지 않는다', async ({ page }) => {
    const { store, st } = await openBoard(page);
    st.sessionDelay = { seq: 1, ms: 2_000 };
    await page.evaluate(() => window.dispatchEvent(new Event('online')));     // reloadSession(메인) — 2초 늦게 도착
    await page.waitForTimeout(150);
    // 보드 GameSwitcher — 칩 바 버튼('사이드1· 사이드게임')과 글자가 달라 exact 텍스트로 가른다.
    await store.getByText('사이드1 · 사이드게임', { exact: true }).click();
    // 세션 머리(보드 상단 '현금 N만원')가 **세션 state** 를 그대로 그린다 — 칩 바·게임 목록은 다른 출처라 여기로 잰다.
    await expect(store.getByText(/현금 5만원/).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2_600);                                          // 늦은 메인 응답 도착 뒤
    await expect(store.getByText(/현금 10만원/), '늦은 메인 응답이 사이드 세션(단가)을 덮었다(D2)').toHaveCount(0);
    await expect(store.getByText(/현금 5만원/).first()).toBeVisible();
  });

  test('D3 — 비밀번호가 생긴 줄 모르는 화면도 서버 거절 뒤 입력칸을 연다', async ({ page }) => {
    const { store } = await openBoard(page, {
      hasPw: false,
      cancel: async () => ({ status: 400, body: { message: '비밀번호가 올바르지 않습니다', code: 'P0001', details: null, hint: null } }),
    });
    await store.locator('td button:visible').filter({ hasText: /^현/ }).first().click();
    await page.getByRole('button', { name: /결제 취소/ }).click();
    await page.getByRole('button', { name: '취소 확정' }).click();
    await expect(page.getByLabel('취소 비밀번호'), '서버가 비밀번호로 거절했는데 입력칸이 안 나온다(D3)').toBeEnabled({ timeout: 8_000 });
  });

  test('D5 — 직원 목록 RPC 에 이 매장 id 를 넘긴다', async ({ page }) => {
    const { st } = await openBoard(page);
    await expect.poll(() => st.staffArgs.length, { timeout: 10_000 }).toBeGreaterThan(0);
    for (const a of st.staffArgs) expect((a as { p_venue_id: string | null }).p_venue_id, 'p_venue_id 가 비었다(D5)').toBe(VENUE);
  });

  test('D8 — 대기열 재조회가 역순 도착해도 최신(빈 대기열)이 남는다', async ({ page }) => {
    let n = 0;
    let armed = false;
    const { store } = await openBoard(page, {
      pending: async () => {
        n++;
        // 무장된 **다음 한 번**만 느린 옛 응답(아직 대기 중이던 때) — 부팅 중 조회 횟수에 기대지 않는다.
        if (armed) { armed = false; await new Promise((res) => setTimeout(res, 1_800)); return [REQ]; }
        return [];
      },
    });
    const base = n;
    armed = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));     // 재조회 #2(느림, 옛 값)
    await page.waitForTimeout(150);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));     // 재조회 #3(빠름, 최신 = 빈 대기열)
    await page.waitForTimeout(2_500);
    expect(n).toBeGreaterThanOrEqual(base + 2);
    expect(armed, '느린 옛 조회가 실제로 나가지 않았다 — 검사가 공허하다').toBe(false);
    await expect(store.getByText('대기손님'), '늦게 도착한 옛 대기열이 되살아났다(D8)').toHaveCount(0);
  });

  test('D9 — 비밀번호 미설정 매장 업주: "비밀번호 없이 취소됩니다" · 확정 연타는 RPC 1회', async ({ page }) => {
    const { store, st } = await openBoard(page, {
      hasPw: false,
      cancel: async () => { await new Promise((res) => setTimeout(res, 800)); return { status: 204, body: '' }; },
    });
    await store.locator('td button:visible').filter({ hasText: /^현/ }).first().click();
    await page.getByRole('button', { name: /결제 취소/ }).click();
    await expect(page.getByText('비밀번호 없이 취소됩니다', { exact: false })).toBeVisible();
    await expect(page.getByText('업주 비밀번호를 입력하세요')).toHaveCount(0);   // 입력칸이 없는데 입력하라는 모순
    const confirm = page.getByRole('button', { name: '취소 확정' });
    await confirm.click();
    await confirm.click({ force: true, timeout: 2_000 }).catch(() => { /* 이미 닫혔거나 비활성 — 둘 다 정상 */ });
    await page.waitForTimeout(1_500);
    expect(st.cancelCalls, '확정 연타가 취소 RPC 를 두 번 보냈다(D9)').toBe(1);
  });

  test('D9 — 비밀번호 매장: 확정 연타는 RPC 1회(응답 대기 중 버튼 잠김)', async ({ page }) => {
    const { store, st } = await openBoard(page, {
      hasPw: true,
      cancel: async () => { await new Promise((res) => setTimeout(res, 800)); return { status: 204, body: '' }; },
    });
    await store.locator('td button:visible').filter({ hasText: /^현/ }).first().click();
    await page.getByRole('button', { name: /결제 취소/ }).click();
    await page.getByLabel('취소 비밀번호').fill('1234');
    const confirm = page.getByRole('button', { name: '취소 확정' });
    await confirm.click();
    await confirm.click({ force: true, timeout: 2_000 }).catch(() => { /* 이미 닫혔거나 비활성 — 둘 다 정상 */ });
    await page.waitForTimeout(1_500);
    expect(st.cancelCalls, '확정 연타가 취소 RPC 를 두 번 보냈다(D9)').toBe(1);
  });
});
