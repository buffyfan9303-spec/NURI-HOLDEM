// 클락 END → 순위 저장이 **서버로 무엇을 보내는가** (2026-09-11 장부 점검 수정)
//
// 잠그는 것
//   ① 장부 자동완성 이름 '실명(닉네임)' 이 닉네임·실명 칸으로 갈려서 나간다.
//      예전엔 통째로 닉네임 칸에 들어가 그 선수 계정에 안 붙었고, 공개 순위표가 닉네임 칸을 가리지 않아
//      2026-09-10 에 서버가 막은 실명 노출이 이 경로로 되돌아왔다.
//   ② 대회 이름은 클락 제목이 아니라 **연결된 장부의 제목**이다.
//      예전엔 클락 제목으로 저장해 장부의 '순위 미입력' 판정이 못 알아봤고, 업주가 한 번 더 입력해 두 벌 등재됐다.
//
// 운영 DB 에는 쓰지 않는다: 업주 세션은 로컬 스텁, 장부·클락·순위는 page.route, 저장 RPC 는 가로채 페이로드만 본다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ee';
const VENUE = '33333333-3333-4333-8333-333333333333';
const DAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const LEDGER_TITLE = '수요일 딥스택';      // 장부 제목 — 순위 event_name 은 반드시 이것이어야 한다
const CLOCK_TITLE = '클락만 아는 제목';    // 클락 config.title — 예전 코드는 이걸 event_name 으로 썼다

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: {}, user_metadata: { name: '업주' }, created_at: new Date().toISOString() },
};
const sessionRow = () => ({
  venue_id: VENUE, session_date: DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: LEDGER_TITLE, discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: new Date(Date.now() - 3_600_000).toISOString(), tournament_start: null, schedule_id: null,
});
const level = (sb: number, bb: number) => ({ kind: 'level', sb, bb, ante: bb, minutes: 20 });
/** 장부에 연결된(session_date 있음) 클락 — END 를 누르면 순위 입력 모달이 뜨는 조건 */
const clockRow = () => ({
  venue_id: VENUE, game_seq: 1, session_date: DAY, title: LEDGER_TITLE,
  config: {
    title: CLOCK_TITLE, startStack: 50000, rebuyStack: 70000, addonStack: 0, isAddon: false,
    earlyBonus: 5000, doubleEarlyBonus: 10000, regCloseLevel: 12, maxLevel: 18,
    earlyDoubleLevel: 1, earlySingleLevel: 4, earlyDoubleMin: 20, earlySingleMin: 80, mysteryBounty: 0,
    prizes: [{ place: '1위', amount: 400 }, { place: '2위', amount: 200 }, { place: '3위', amount: 100 }],
    levels: [level(100, 200), level(200, 400), level(300, 600)],
  },
  current_index: 0, running: false, ends_at: null, remaining_ms: 0,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null,
  updated_at: new Date().toISOString(),
});
const buyinRow = (i: number, name: string) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`, venue_id: VENUE, session_date: DAY, game_seq: 1,
  player_name: name, entry_no: 1, payment_method: 'cash', is_unpaid: false, buyin_at: `${DAY}T12:00:00Z`, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
});

/** venue_rankings_public 이 돌려주는 행 — rowToEntry(rankings.ts) 가 읽는 컬럼만 */
const rankRow = (position: number, nickname: string, event_name: string) =>
  ({ venue_id: VENUE, ranking_date: DAY, position, nickname, real_name: '', prize: null, event_name });

async function bootOwnerAtClock(page: Page, saved: { body: unknown }[], prev: unknown[] = []) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } }, [KEY, JSON.stringify(FAKE)] as [string, string]);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
  const restGet = (body: unknown) => (r: Route) => (r.request().method() === 'GET' ? r.fulfill(json(body)) : r.fallback());
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, restGet({ id: UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active', venue_id: VENUE, activity_points: 0, created_at: FAKE.user.created_at }));
  await page.route(/\/rest\/v1\/venues\?/, restGet([{ id: VENUE, name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1', owner_id: UID, approved: true, status: 'active', verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 3, rating: 4.5 }]));
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers|can_manage_venue)/, (r) => r.fulfill(json(true)));
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const hit = r.request().url().includes(`session_date=eq.${DAY}`);
    return r.fulfill(json(isSingle(r) ? (hit ? sessionRow() : null) : (hit ? [sessionRow()] : [])));
  });
  await page.route(/\/rest\/v1\/clock_states\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    return r.fulfill(json(isSingle(r) ? clockRow() : [clockRow()]));
  });
  await page.route(/\/rest\/v1\/clock_presets\?/, restGet([]));
  await page.route(/\/rest\/v1\/ledger_buyins\?/, restGet([buyinRow(1, '홍길동(길동)'), buyinRow(2, '박민수')]));
  await page.route(/\/rest\/v1\/ledger_players\?/, restGet([]));
  await page.route(/\/rest\/v1\/notifications\?/, restGet([]));
  await page.route(/\/rest\/v1\/rpc\/venue_rankings_public/, (r) => r.fulfill(json(prev)));   // 그날 이미 저장된 순위(기본 [])
  // 저장 RPC — 운영으로 보내지 않고 페이로드만 받는다(_fixtures 가드보다 page 라우트가 먼저 잡는다)
  await page.route(/\/rest\/v1\/rpc\/save_venue_rankings/, (r) => {
    saved.push({ body: r.request().postDataJSON() });
    return r.fulfill(json(null));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
  await page.getByRole('tablist', { name: '매장 단계 이동' }).getByRole('tab', { name: /클락/ }).click({ timeout: 20_000 });
}

test('🔴 클락 END 순위 저장 — 이름은 갈라서, 대회 이름은 장부 제목으로 나간다', async ({ page }) => {
  test.setTimeout(90_000);
  const saved: { body: unknown }[] = [];
  await bootOwnerAtClock(page, saved);

  await page.getByRole('button', { name: '토너 종료' }).click({ timeout: 20_000 });
  const modal = page.getByRole('dialog').filter({ hasText: '입상 순위 입력' });
  await expect(modal, '장부에 연결된 클락인데 순위 입력 모달이 안 떴다').toBeVisible({ timeout: 10_000 });

  const inputs = modal.locator('input[list="clk-finish-players"]');
  await inputs.nth(0).fill('홍길동(길동)');   // 장부 자동완성이 주는 합성 표기
  await inputs.nth(1).fill('박민수');          // 비회원 자유 입력
  await modal.getByRole('button', { name: /순위 저장/ }).click();
  await expect.poll(() => saved.length, { message: '저장 RPC 가 나가지 않았다', timeout: 10_000 }).toBe(1);

  const body = saved[0].body as { p_venue_id: string; p_date: string; p_event: string; p_entries: { nickname: string; realName: string }[] };
  expect(body.p_venue_id).toBe(VENUE);
  expect(body.p_date).toBe(DAY);

  // ① 합성 표기가 갈려서 나간다 — 실명은 닉네임 칸에 절대 없다
  expect(body.p_entries[0]).toEqual({ nickname: '길동', realName: '홍길동' });
  expect(body.p_entries[1]).toEqual({ nickname: '박민수', realName: '' });
  for (const e of body.p_entries) {
    expect(e.nickname, '닉네임 칸에 괄호가 있다 — 합성 표기가 통째로 들어갔다').not.toContain('(');
    expect(e.nickname, '닉네임 칸에 실명이 들어갔다(공개 순위표 마스킹 우회)').not.toBe('홍길동');
  }

  // ② 대회 이름 = 장부 제목. 클락 제목이면 장부가 '순위 미입력'이라 우겨 두 벌 등재된다
  expect(body.p_event).toBe(LEDGER_TITLE);
  expect(body.p_event).not.toBe(CLOCK_TITLE);
});

test("🔴 그날 순위가 이미 기본 칩('')으로 저장돼 있으면 '' 로 저장한다 — 경고가 센 수와 서버가 지우는 수가 같다", async ({ page }) => {
  test.setTimeout(90_000);
  const saved: { body: unknown }[] = [];
  // 순위 화면 기본 칩으로 먼저 저장된 메인 순위 2명 — 메인은 '' 도 정상값이다(rankingGame.ts 머리말)
  await bootOwnerAtClock(page, saved, [rankRow(1, '기존1', ''), rankRow(2, '기존2', '')]);

  const confirms: string[] = [];
  page.on('dialog', (d) => { confirms.push(d.message()); void d.accept(); });

  await page.getByRole('button', { name: '토너 종료' }).click({ timeout: 20_000 });
  const modal = page.getByRole('dialog').filter({ hasText: '입상 순위 입력' });
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.locator('input[list="clk-finish-players"]').nth(0).fill('박민수');
  await modal.getByRole('button', { name: /순위 저장/ }).click();
  await expect.poll(() => saved.length, { timeout: 10_000 }).toBe(1);

  const body = saved[0].body as { p_event: string; p_entries: { nickname: string }[] };
  // 서버는 p_event 한 이름만 지운다 — 기존 행이 '' 에 있으니 '' 로 저장해야 실제로 교체된다
  expect(body.p_event).toBe('');
  // 경고문은 서버가 지울 수(2명)를 말했고, 잔여(다른 이름) 경고는 없다.
  // (END 경로라 저장 뒤 '토너 종료' 확인창이 하나 더 뜬다 — 교체 경고만 골라 본다)
  const warn = confirms.filter((m) => m.includes('이미 저장된 순위'));
  expect(warn, `교체 경고가 정확히 한 번 떠야 한다: ${JSON.stringify(confirms)}`).toHaveLength(1);
  expect(warn[0]).toContain('2명');
  expect(warn[0]).not.toContain('교체되지 않고');
});
