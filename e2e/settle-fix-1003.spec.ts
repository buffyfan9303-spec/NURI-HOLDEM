// 더미 1003 정산 검증 후속(2026-10-03) 회귀 게이트. 전부 목킹(운영 쓰기 0).
//   원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\dummy-1003\REPORT.md (D2·D3)
//         C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-mystore-followup-1003.md '재검토 314b8b4c' (대안 A · 라이브 위젯 이동)
//
//   D3  '오늘 운영 완료'는 오늘 모든 게임(사이드 포함) 마감 AND 미수 0 일 때만 — 단계 바 '정산' 칩 ✓ 와 같은 판정.
//   D2  이용권 관리 '이용 내역'에 전송 취소가 보이고, 내역의 전송·취소·사용 수가 유형별 표 합계와 같다.
//   A   xl(≥1280)에서 밀린 순위 보조 줄이 CTA 옆 칩 — '지금 할 일' 칸 72px 유지, 정착 이동 0. 1024 는 종전(다음 줄).
//   B   클락 켠 매장 재방문 — '라이브 운영 현황'이 정착 때 끼어들며 아래를 밀던 이동(1440 175 · 390 263px) 제거.
//       격자 측정은 '최근 7일 추세' 카드 윗변(고정 요소)으로 한다 — 첫 div.grid 는 클락 세계에서 위젯 안 격자로 바뀐다(오탐).
//
// 음성 대조: 수정 전 빌드(origin/main 4e21f889)에서 D3·D2·A(1440/1280)·B FAIL, 수정 빌드에서 PASS.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

type R = Record<string, unknown>;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const DELAY = 4000;   // 대시보드는 '내 매장' 누르기 전 숨은 채 조회를 시작한다 — 누름 뒤까지 '확인 중'이 보이게
const dayAgo = (n: number) => new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - n * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
const SID = (i: number) => `99999999-9999-4999-8999-${String(i).padStart(12, '0')}`;

const sess = (date: string, o: R = {}): R => ({
  venue_id: MOCK_VENUE, session_date: date, game_seq: 1, title: '메인', buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${date}T10:00:00+09:00`, operators: [], reg_closed: true, closed: true, closed_at: `${date}T22:00:00+09:00`,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${date}T01:00:00Z`, clock_snapshot: null, ...o,
});
/** 현금 완납 n건. unpaid 를 주면 마지막 1건을 '미수 unpaid 원' 분납 행으로 바꾼다(buyinFinance 분납 갈래: 미수 = unpaid_amount). */
const buys = (date: string, seq: number, n: number, unpaid = 0): R[] => Array.from({ length: n }, (_, i) => {
  const last = unpaid > 0 && i === n - 1;
  return {
    id: `eeeeeeee-${String(seq).padStart(4, '0')}-4000-8000-${date.replace(/-/g, '')}${String(i).padStart(4, '0')}`, venue_id: MOCK_VENUE, session_date: date, game_seq: seq,
    player_name: `손님${i}`, entry_no: 1, payment_method: 'cash', is_unpaid: last, buyin_at: `${date}T11:00:00+09:00`, is_split: last,
    cash_amount: last ? 0 : 30_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: last ? unpaid : 0, discount_level: 0, discount_index: 0, early_override: null,
  };
});
const schedRow = (id: string, date: string, title: string): R => ({
  id, title, venue_id: MOCK_VENUE, pub_name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1', date, start_time: '19:00:00',
  duration: '', format: 'tournament', guaranteed: 1_000_000, prize_pool: null, buy_in: { amount: 30_000 }, seats: 40, structure: null, description: '',
  side_events: [], ranking_prizes: [], partners: [], promotions: [], payment_methods: [], rules: [], poster_url: null, poster_color: null, display_order: 1,
  is_premium: false, premium_until: null, owner_id: '00000000-0000-4000-8000-0000000000ee', unread_qna_count: 0, approved: true, view_count: 0,
});

/** PostgREST 필터 흉내(eq·lt·lte·gt·gte·is.null·not.is.null) */
function pick(rows: R[], url: string) {
  const q = new URL(url).searchParams;
  let out = rows;
  for (const k of ['venue_id', 'session_date', 'game_seq', 'closed', 'schedule_id']) {
    for (const v of q.getAll(k)) {
      if (v === 'not.is.null') { out = out.filter((r) => r[k] != null); continue; }
      if (v === 'is.null') { out = out.filter((r) => r[k] == null); continue; }
      const m = /^(eq|lt|lte|gt|gte)\.(.*)$/.exec(v); if (!m) continue;
      const [, op, b] = m;
      out = out.filter((r) => { const a = String(r[k]); return op === 'eq' ? a === b : op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : a >= b; });
    }
  }
  return out;
}

interface World { sessions: R[]; buyins: R[]; schedules?: R[]; clock?: unknown; rankToday?: boolean }
const merge = (...ws: World[]): World => ({ sessions: ws.flatMap((w) => w.sessions), buyins: ws.flatMap((w) => w.buyins), schedules: ws.flatMap((w) => w.schedules ?? []), clock: ws.find((w) => w.clock)?.clock, rankToday: ws.some((w) => w.rankToday) });
const hist = (days: number, n = 15): World => {
  const s: R[] = []; const b: R[] = [];
  for (let i = 1; i <= days; i++) { s.push(sess(dayAgo(i))); b.push(...buys(dayAgo(i), 1, n)); }
  return { sessions: s, buyins: b };
};
/** 밀린 순위(마감·포스터 연결·순위 없음) n건 */
const pend = (n: number): World => ({
  sessions: Array.from({ length: n }, (_, i) => sess(dayAgo(1 + i * 2), { title: `밀린 메인${i + 1}`, schedule_id: SID(i) })),
  buyins: [],
  schedules: Array.from({ length: n }, (_, i) => schedRow(SID(i), dayAgo(1 + i * 2), `밀린 메인${i + 1}`)),
});
const clockOn: World = { sessions: [], buyins: [], clock: {
  venue_id: MOCK_VENUE, game_seq: 1, session_date: MOCK_DAY, title: '메인',
  config: { title: '메인', startStack: 50_000, rebuyStack: 50_000, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 3, maxLevel: 10,
    earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [],
    levels: [{ kind: 'level', sb: 100, bb: 200, ante: 200, minutes: 20 }, { kind: 'level', sb: 200, bb: 400, ante: 400, minutes: 20 }] },
  current_index: 1, running: false, ends_at: null, remaining_ms: 10 * 60_000, adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0,
  live_stats: { entries: 20, rebuys: 0, alive: 20, avgStack: 50_000, totalStack: 1_000_000, buyInAmount: 30_000 } } };
/** 오늘 메인(+사이드) — closed/unpaid 를 게임마다 */
const today = (games: { seq: number; closed: boolean; unpaid?: number }[]): World => ({
  sessions: games.map((g) => sess(MOCK_DAY, { game_seq: g.seq, title: g.seq === 1 ? '메인' : `사이드${g.seq - 1}`,
    ...(g.closed ? {} : { closed: false, reg_closed: false, closed_at: null }) })),
  buyins: games.flatMap((g) => buys(MOCK_DAY, g.seq, 4, g.unpaid ?? 0)),
  rankToday: true,
});

async function boot(page: Page, W: number, H: number, world: World, delay: number) {
  const sorted = [...world.sessions].sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)) || Number(a.game_seq) - Number(b.game_seq));
  await bootOwner(page, {
    viewport: { width: W, height: H }, goto: false, clock: world.clock,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      const serve = (rows: () => R[]) => async (r: Route) => {
        if (r.request().method() !== 'GET') return r.fallback();
        if (delay) await sleep(delay);
        const got = pick(rows(), r.request().url());
        return r.fulfill(json(single(r) ? (got[0] ?? null) : got)).catch(() => {});
      };
      await p.route(/\/rest\/v1\/ledger_sessions\?/, serve(() => sorted));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, serve(() => world.buyins));
      await p.route(/\/rest\/v1\/ledger_players\?/, serve(() => []));
      await p.route(/\/rest\/v1\/schedules\?/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? (world.schedules?.[0] ?? null) : (world.schedules ?? []))));
      if (world.rankToday) await p.route(/\/rest\/v1\/rpc\/venue_rankings_public/, (r) => r.fulfill(json([
        { id: 'r1', venue_id: MOCK_VENUE, ranking_date: MOCK_DAY, position: 1, nickname: '손님0', real_name: null, prize: null, event_name: '메인' },
        { id: 'r2', venue_id: MOCK_VENUE, ranking_date: MOCK_DAY, position: 2, nickname: '손님1', real_name: null, prize: null, event_name: '메인' }])));
    },
  });
}

type Box = { y: number; h: number; cy: number } | null;
type F = { t: number; badge: string; slot: { kind: string; h: number } | null; trend: number | null; rank: Box; cta: Box; liveRes: boolean; live: boolean };
const SAMPLER = () => {
  Date.prototype.getHours = function () { return 14; };   // '지금 할 일' 정오 분기 고정
  const w = window as unknown as { __f: unknown[] }; w.__f = [];
  const box = (e: Element | null | undefined) => {
    if (!e || !e.getClientRects().length) return null;
    const b = e.getBoundingClientRect(); return { y: +(b.top + scrollY).toFixed(1), h: +b.height.toFixed(1), cy: +(b.top + b.height / 2 + scrollY).toFixed(1) };
  };
  const tick = () => {
    const pane = document.querySelector<HTMLElement>('[data-pane="dashboard"]');
    const band = pane && [...pane.querySelectorAll<HTMLElement>('button')].find((b) => b.getClientRects().length && (b.querySelector('span > span')?.textContent ?? '').trim() === '오늘 장부');
    if (pane && band) {
      const slot = pane.querySelector<HTMLElement>('[data-testid="todo-reserve"]') ?? pane.querySelector<HTMLElement>('[data-testid="todo-card"]');
      const trend = [...pane.querySelectorAll<HTMLElement>('section.card-aura')].find((s) => s.getClientRects().length && (s.querySelector(':scope > button span')?.textContent ?? '').trim() === '최근 7일 추세');
      w.__f.push({
        t: performance.now(),
        badge: (band.querySelector('span > span:nth-child(2)')?.textContent ?? '').trim(),
        slot: slot ? { kind: slot.getAttribute('data-testid') ?? '', h: +slot.getBoundingClientRect().height.toFixed(1) } : null,
        trend: trend ? +(trend.getBoundingClientRect().top + scrollY).toFixed(1) : null,
        rank: box(pane.querySelector('[data-testid="todo-rank"]')), cta: box(pane.querySelector('[data-testid="todo-cta"]')),
        // 위젯 유무는 문구로 — 수정 전 빌드에도 같은 기준으로 잰다(음성 대조가 testid 부재로 먼저 넘어지지 않게)
        liveRes: !!pane.querySelector('[data-testid="live-reserve"]'),
        live: [...pane.querySelectorAll('section')].some((s) => s.getClientRects().length && (s.textContent ?? '').trimStart().startsWith('라이브 운영 현황')),
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const frames = async (page: Page) => {
  const f = await page.evaluate(() => (window as unknown as { __f: F[] }).__f);
  const t0 = (f[0]?.t ?? 0) + 300;   // 누름 직후 셸 자리잡기(입력 면제) 제외 — D1·E3 와 같은 기준
  return f.filter((x) => x.t >= t0);
};
const spanOf = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
const settledPane = (page: Page) => page.waitForFunction(() => {
  const pane = document.querySelector('[data-pane="dashboard"]');
  const band = pane && [...pane.querySelectorAll('button')].find((b) => b.getClientRects().length && (b.querySelector('span > span')?.textContent ?? '').trim() === '오늘 장부');
  return !!band && (band.querySelector('span > span:nth-child(2)')?.textContent ?? '').trim() !== '확인 중' && !pane!.querySelector('[data-testid="todo-reserve"]');
}, null, { timeout: 30_000 });

// ── D3: '오늘 운영 완료' = 모든 게임 마감 AND 미수 0 — '정산' 칩과 한 판정 ─────────────────────────────
const D3: { name: string; world: World; cta: string; settled: boolean; title?: RegExp; land?: RegExp }[] = [
  // 더미 정산 실측(메인 미수 8만 · 사이드 미수 3만, 둘 다 마감) — 수정 전 '오늘 운영 완료'
  { name: '전부 마감 · 미수 남음', world: merge(hist(3), today([{ seq: 1, closed: true, unpaid: 80_000 }, { seq: 2, closed: true, unpaid: 30_000 }])), cta: '미수 회수', settled: false, title: /^미수 11만원이 남았어요$/, land: /바인 4 · 매출 \d+만 · 미수 8만/ },
  { name: '메인 마감 · 사이드만 열림', world: merge(hist(3), today([{ seq: 1, closed: true }, { seq: 2, closed: false }])), cta: '장부 보기', settled: false, title: /^아직 열린 게임 1개$/ },
  { name: '메인 미수 0 · 사이드에만 미수', world: merge(hist(3), today([{ seq: 1, closed: true }, { seq: 2, closed: true, unpaid: 30_000 }])), cta: '미수 회수', settled: false, title: /^미수 3만원이 남았어요$/, land: /바인 4 · 매출 \d+만 · 미수 3만/ },
  // 양성 대조 — 진짜 다 끝난 날은 여전히 '오늘 운영 완료' 이고 칩도 ✓
  { name: '전부 마감 · 미수 0(양성)', world: merge(hist(3), today([{ seq: 1, closed: true }, { seq: 2, closed: true }])), cta: '주간 리포트', settled: true, title: /^오늘 운영 완료$/ },
];
for (const c of D3) {
  test(`D3 1440 ${c.name} — 할 일 '${c.cta}' · 정산 칩 ${c.settled ? '✓' : '미완료'} (한 판정)`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, 1440, 900, c.world, 0);
    await page.goto('/');
    await openMyStore(page);
    const pane = page.locator('[data-pane="dashboard"]');
    const cta = pane.getByTestId('todo-cta');
    await expect(cta, `지금 할 일이 '${c.cta}' 가 아니다`).toHaveText(c.cta, { timeout: 25_000 });
    const title = (await pane.getByTestId('todo-card').locator('p').first().textContent())?.trim() ?? '';
    console.log(`[D3 ${c.name}] 할 일='${title}' / '${await cta.textContent()}'`);
    if (c.title) expect(title).toMatch(c.title);
    if (!c.settled) expect(title, "미수·열린 게임이 남았는데 '오늘 운영 완료'").not.toContain('운영 완료');
    const chip = page.getByRole('tab', { name: /정산/ }).first();
    await expect(chip).toBeVisible();
    const label = (await chip.getAttribute('aria-label')) ?? '';
    expect(label.includes('(완료)'), `정산 칩(${label})과 할 일 카드의 판정이 갈렸다`).toBe(c.settled);
    if (c.land) {
      // 미수가 있는 첫 게임의 장부로 간다 — 메인만 열면 사이드에만 남은 미수가 0 으로 보인다
      await cta.click();
      await expect(page.getByText(c.land).first(), "'미수 회수'가 미수가 있는 게임 장부로 가지 않았다").toBeVisible({ timeout: 10_000 });
    }
  });
}

// ── D2: 이용권 관리 '이용 내역' — 전송 취소가 보이고 수가 유형별 표와 맞다 ───────────────────────────────
test('D2 1440 — 이용 내역의 전송·전송 취소·사용 합이 유형별 표 합계(9·1·8)와 같다', async ({ page }) => {
  test.setTimeout(120_000);
  const at = (h: number) => `2026-10-03T0${h}:00:00Z`;
  const row = (id: string, who: string, created: string, status: string, usedAt: string | null, usedFor: string | null = null) => ({
    id, venue_id: MOCK_VENUE, issued_by: 'x', holder_user_id: null, holder_name: who, title: '매장이용권', status,
    used_venue_id: usedAt ? MOCK_VENUE : null, used_at: usedAt, created_at: created, expires_at: null, issue_reason: 'grant', event_campaign_id: null,
    used_for: usedFor, venue: { name: '테스트 홀덤펍' }, used_venue: usedAt ? { name: '테스트 홀덤펍' } : null,
  });
  const rows = [
    ...[0, 1, 2].map((i) => row(`a${i}`, '강도윤', at(1), i === 0 ? 'revoked' : 'used', i === 0 ? null : at(5))),
    ...[0, 1, 2].map((i) => row(`b${i}`, '서하린', at(2), 'used', at(6))),
    ...[0, 1, 2].map((i) => row(`c${i}`, '오지후', at(3), 'used', at(7), i === 2 ? 'addon' : 'buyin')),
  ];
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(rows)) : r.fallback()));
      await p.route(/\/rest\/v1\/rpc\/voucher_holder_stats/, (r) => r.fulfill(json([{ holder_count: 3, active_count: 0, used_count: 8 }])));
      await p.route(/\/rest\/v1\/rpc\/voucher_holder_profiles/, (r) => r.fulfill(json([])));
      await p.route(/\/rest\/v1\/rpc\/voucher_issue_approved/, (r) => r.fulfill(json(true)));
      await p.route(/\/rest\/v1\/rpc\/get_voucher_quota/, (r) => r.fulfill(json(21)));
      await p.route(/\/rest\/v1\/rpc\/venue_voucher_reason_stats/, (r) => r.fulfill(json([
        { reason_key: 'grant', issued: 9, held: 0, used: 8, expired: 0, revoked: 1, other_status: 0, holders: 3 }])));
    },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-rail]').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('button:visible', { hasText: /이용권\s*·\s*QR/ }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.getByTestId('voucher-feed'), '이용 내역이 그려지지 않았다').toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /보유자 현황·통계/ }).click();   // 유형별 표는 이 접힘 안에 있다
  await expect(page.getByTestId('voucher-reason-stats'), '유형별 표가 그려지지 않았다').toBeVisible({ timeout: 15_000 });
  const got = await page.evaluate(() => {
    const feed = { issued: 0, used: 0, revoked: 0, rows: 0 };
    for (const li of document.querySelectorAll('[data-testid="voucher-feed"] > li')) {
      feed.rows++;
      const kind = (li.querySelector('span')?.textContent ?? '').trim();
      const nb = [...li.querySelectorAll('b')].find((b) => /^×\d+$/.test((b.textContent ?? '').trim()));   // 줄 textContent 는 ×N 뒤에 시각이 붙는다
      const n = nb ? Number((nb.textContent ?? '').trim().slice(1)) : 1;
      const rv = li.querySelector('[data-testid="voucher-feed-revoked"]')?.textContent?.trim() ?? '';
      if (kind.endsWith('사용')) feed.used += n;
      else { feed.issued += n; feed.revoked += rv === '전송 취소' ? n : Number(/취소 (\d+)/.exec(rv)?.[1] ?? 0); }
    }
    const t = document.querySelector('[data-testid="voucher-reason-stats"]')!;
    const cols = [...t.querySelectorAll('thead th[data-col]')].map((th) => th.getAttribute('data-col'));
    const foot = [...t.querySelectorAll('tfoot td')].map((td) => Number(td.textContent));
    const table = Object.fromEntries(cols.map((c, i) => [c, foot[i]]));
    return { feed, table };
  });
  console.log(`[D2] 내역 ${JSON.stringify(got.feed)} · 표 ${JSON.stringify(got.table)}`);
  expect(got.feed.rows, '내역 줄을 못 읽었다 — 빈 검사').toBeGreaterThan(2);
  expect(got.table.issued, '표 합계를 못 읽었다 — 빈 검사').toBe(9);
  expect(got.feed.issued, '내역 전송 장수 ≠ 표 전송').toBe(got.table.issued);
  expect(got.feed.used, '내역 사용 장수 ≠ 표 사용').toBe(got.table.used);
  expect(got.feed.revoked, '내역에 전송 취소가 없다(표는 전송 취소 1)').toBe(got.table.revoked);
});

// ── A: xl 에서 밀린 순위는 CTA 옆 칩 — 칸 72px · 정착 이동 0. 1024 는 다음 줄(종전) ─────────────────────────
const W_DATA = hist(13);   // 밀린 순위 0 — 지난 회차 '그대로 열기'
const W_PEND = merge(hist(13), pend(1), { sessions: [], buyins: [], schedules: [schedRow(SID(90), MOCK_DAY, '오늘 메인 포스터')] });
for (const [W, H] of [[1440, 900], [1280, 900]] as const) for (const [wn, world, rank] of [['밀린 0', W_DATA, false], ['오늘 포스터 + 밀린 1', W_PEND, true]] as const) {
  test(`A ${W} ${wn} — '지금 할 일' 칸 72px 그대로 · ${rank ? '순위 칩이 CTA 와 같은 줄 · ' : ''}정착 이동 0`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(SAMPLER);
    await boot(page, W, H, world, DELAY);
    await page.goto('/');
    await openMyStore(page);
    await settledPane(page);
    await page.waitForTimeout(800);
    const fs = await frames(page);
    const chk = fs.filter((x) => x.badge === '확인 중' && x.slot);
    const set = fs.filter((x) => x.badge !== '확인 중' && x.slot?.kind === 'todo-card');
    const last = set[set.length - 1];
    const trends = fs.map((x) => x.trend).filter((v): v is number => v != null);
    console.log(`[A ${W} ${wn}] 확인중=${chk.length}(칸 ${chk[chk.length - 1]?.slot?.h}) 정착=${set.length}(칸 ${last?.slot?.h}) 순위=${JSON.stringify(last?.rank)} CTA=${JSON.stringify(last?.cta)} 7일 y폭=${spanOf(trends).toFixed(1)}`);
    expect(chk.length, `'확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
    expect(set.length, '정착 카드 프레임을 못 봤다 — 빈 검사').toBeGreaterThan(5);
    expect(trends.length, "'최근 7일 추세'를 못 쟀다 — 빈 검사").toBeGreaterThan(10);
    expect(last!.slot!.h, `${W}: 할 일 칸이 72px 를 넘는다(빈 띠 · 대안 A 미적용)`).toBeLessThanOrEqual(76);
    expect(Math.abs(chk[chk.length - 1].slot!.h - last!.slot!.h), '확인 중 자리 ≠ 정착 카드 높이').toBeLessThanOrEqual(1);
    expect(spanOf(trends), `${W}: 정착에 '최근 7일 추세'가 움직였다`).toBeLessThanOrEqual(3);
    if (rank) {
      expect(last!.rank, '순위 칩이 없다(전제)').not.toBeNull();
      expect(Math.abs(last!.rank!.cy - last!.cta!.cy), '순위 칩이 CTA 와 같은 줄이 아니다').toBeLessThanOrEqual(4);
      await page.locator('[data-pane="dashboard"] [data-testid="todo-rank"]').getByRole('button', { name: '순위 입력' }).click();
      await expect(page.locator('[data-pane="ranking"] input[type="date"]').first(), '칩이 밀린 대회 순위 입력으로 가지 않았다').toHaveValue(dayAgo(1), { timeout: 10_000 });
    }
  });
}
test(`A 1024 오늘 포스터 + 밀린 1 — 1280 미만은 종전대로 보조 줄이 CTA 아래 다음 줄 · 정착 이동 0`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(SAMPLER);
  await boot(page, 1024, 768, W_PEND, DELAY);
  await page.goto('/');
  await openMyStore(page);
  await settledPane(page);
  await page.waitForTimeout(800);
  const fs = await frames(page);
  const last = fs.filter((x) => x.slot?.kind === 'todo-card').pop();
  const trends = fs.map((x) => x.trend).filter((v): v is number => v != null);
  console.log(`[A 1024] 칸 ${last?.slot?.h} 순위=${JSON.stringify(last?.rank)} CTA=${JSON.stringify(last?.cta)} 7일 y폭=${spanOf(trends).toFixed(1)}`);
  expect(last?.rank, '보조 줄이 없다(전제)').toBeTruthy();
  expect(last!.rank!.y, '1024 에서 보조 줄이 CTA 아래 줄이 아니다').toBeGreaterThanOrEqual(last!.cta!.y + last!.cta!.h - 1);
  expect(trends.length, '빈 검사').toBeGreaterThan(10);
  expect(spanOf(trends), "1024: 정착에 '최근 7일 추세'가 움직였다").toBeLessThanOrEqual(3);
});

// ── B: 클락 켠 매장 재방문 — '라이브 운영 현황' 자리를 확인 중에 잡아 정착 이동이 없다 ─────────────────────
const W_CLOCK = merge(hist(13), { sessions: [sess(MOCK_DAY, { closed: false, reg_closed: false, closed_at: null })], buyins: buys(MOCK_DAY, 1, 20) }, clockOn);
for (const [W, H] of [[1440, 900], [390, 844]] as const) {
  test(`B ${W} 클락 켠 매장 재방문 — '라이브 운영 현황'이 정착에 끼어들어 '최근 7일 추세'를 밀지 않는다`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(SAMPLER);
    await boot(page, W, H, W_CLOCK, DELAY);
    await page.goto('/');
    await openMyStore(page);
    await settledPane(page);
    await expect(page.locator('[data-pane="dashboard"] section', { hasText: '라이브 운영 현황' }).first(), '라이브 위젯이 서지 않았다(전제)').toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    // 재방문(같은 기기) — 새로고침 뒤 다시 '내 매장'
    await page.reload();
    await openMyStore(page);
    await settledPane(page);
    await page.waitForTimeout(800);
    const fs = await frames(page);
    const chk = fs.filter((x) => x.badge === '확인 중');
    const trends = fs.map((x) => x.trend).filter((v): v is number => v != null);
    console.log(`[B ${W}] 확인중=${chk.length}(자리 ${chk.filter((x) => x.liveRes).length}) 정착 위젯=${fs.filter((x) => x.live).length} 7일 y ${Math.min(...trends)}~${Math.max(...trends)} 폭=${spanOf(trends).toFixed(1)}`);
    expect(chk.length, `'확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
    expect(fs.filter((x) => x.live).length, '정착 뒤 라이브 위젯 프레임이 없다 — 빈 검사').toBeGreaterThan(5);
    expect(trends.length, "'최근 7일 추세'를 못 쟀다 — 빈 검사").toBeGreaterThan(10);
    expect(spanOf(trends), `${W}: 라이브 위젯이 정착에 끼어들어 '최근 7일 추세'를 밀었다`).toBeLessThanOrEqual(3);
  });
}

// 모바일 깨짐 없음(360·390) — 가로 넘침 0, 할 일 카드 안 요소가 카드 밖으로 나가지 않는다
for (const [W, H] of [[390, 844], [360, 780]] as const) {
  test(`M ${W} 오늘 포스터 + 밀린 1 · 클락 — 가로 넘침 없음 · 할 일 카드 안에 다 들어간다`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, W, H, merge(W_PEND, clockOn), 0);
    await page.goto('/');
    await openMyStore(page);
    await expect(page.locator('[data-pane="dashboard"] [data-testid="todo-rank"]')).toBeVisible({ timeout: 25_000 });
    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-pane="dashboard"] [data-testid="todo-card"]')!.getBoundingClientRect();
      const kids = [...document.querySelectorAll('[data-pane="dashboard"] [data-testid="todo-card"] button, [data-pane="dashboard"] [data-testid="todo-card"] p')]
        .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, out: kids.filter((r) => r.left < card.left - 0.5 || r.right > card.right + 0.5).length, n: kids.length };
    });
    console.log(`[M ${W}] ${JSON.stringify(m)}`);
    expect(m.n, '빈 검사').toBeGreaterThan(2);
    expect(m.sw, '가로 넘침').toBeLessThanOrEqual(m.cw);
    expect(m.out, '할 일 카드 밖으로 나간 요소').toBe(0);
  });
}
