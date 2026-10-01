// 서비스 소개(public/about.html)·업주 가이드(public/guide/owner.html)에 넣는 **실제 앱 화면** 캡처.
//
// 왜 스펙인가: 캡처는 운영 데이터를 한 줄도 읽지 않아야 한다(제3자 상호·실명·전화 — BLOCKED #14 의 기본값이
//   '가명 픽스처로 촬영'). 목킹 업주(_mockOwner)·일정 픽스처·클락 픽스처를 그대로 재사용하고,
//   그 밖의 Supabase 요청은 전부 빈 응답으로 끊는다 → 운영 읽기 0 · 쓰기 0(_fixtures 가드).
// 평소 e2e 게이트에서는 돌지 않는다(CAPTURE_GUIDE=1 일 때만). 화면이 바뀌어 사진이 낡으면 다시 돌린다:
//   CAPTURE_GUIDE=1 npx playwright test e2e/capture-guide-shots.spec.ts --workers=1
// 산출: public/guide/img/*.webp (폭 고정·q78) — 페이지의 <img width/height> 가 이 치수를 적는다(CLS 0).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY, MOCK_UID } from './_mockOwner';
import { kstDay } from './_schedules';
import { TV_VENUE, serveClock } from './_clock';

test.skip(!process.env.CAPTURE_GUIDE, '가이드 사진 재생성 전용 — CAPTURE_GUIDE=1 일 때만');
test.describe.configure({ mode: 'serial' });

const OUT = resolve('public/guide/img');
const RAW = resolve('test-results/guide-raw');
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const PUB = '누리 샘플 홀덤펍';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** 모든 Supabase 요청의 바닥 — 먼저 건 route 가 **가장 약하다**. 개별 목킹이 없으면 빈 응답이라 운영을 읽지 않는다. */
async function floor(page: Page) {
  await page.route(/supabase\.co\//, (r) => {
    const req = r.request();
    if (!['GET', 'HEAD'].includes(req.method()) && !/\/rpc\//.test(req.url())) return r.fallback(); // 쓰기는 _fixtures 가드가 끊는다
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill(json(single ? null : []));
  });
}

type Row = { d: number; t: string; title: string; buy: number; gtd: number | null; venue?: string | null };
const ROWS: Row[] = [
  { d: 0, t: '19:00', title: '데일리 딥스택', buy: 60_000, gtd: null },
  { d: 0, t: '21:00', title: '나이트 터보', buy: 40_000, gtd: null },
  { d: 1, t: '19:00', title: '금요 메인 이벤트', buy: 100_000, gtd: 3_000_000 },
  { d: 2, t: '14:00', title: '주말 스페셜', buy: 150_000, gtd: 5_000_000 },
  { d: 3, t: '19:30', title: '루키 입문 토너먼트', buy: 30_000, gtd: null },
];
function scheduleRows(venueId: string | null) {
  return ROWS.map((r, i) => ({
    id: `guide-shot-${i + 1}`, title: r.title, venue_id: venueId, pub_name: PUB, region: '서울', address: '서울시 중구 샘플로 1',
    date: kstDay(r.d), start_time: `${r.t}:00`, duration: '6시간', format: 'MTT', guaranteed: r.gtd != null,
    prize_pool: r.gtd, prize_percent: null, is_competition: false, grade: null, blinds: null, reg_close_time: null,
    buy_in: { amount: r.buy }, seats: null, structure: null, description: null, side_events: null, ranking_prizes: null,
    partners: null, promotions: null, payment_methods: null, rules: null, poster_url: null, poster_color: null,
    display_order: i + 1, is_premium: false, premium_until: null, owner_id: 'guide-shot-owner', unread_qna_count: 0,
    approved: true, view_count: 0, rejected_at: null, reject_reason: null,
  }));
}
async function serveSchedules(page: Page, venueId: string | null) {
  const rows = scheduleRows(venueId);
  await page.route(/\/rest\/v1\/schedules\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    const id = /[?&]id=eq\.([^&]+)/.exec(r.request().url());
    const body = id ? rows.filter((x) => x.id === decodeURIComponent(id[1])) : rows;
    return r.fulfill(json(single ? body[0] ?? null : body));
  });
}

/** 장부 픽스처 — 닉네임(실명 아님). 금액은 기록 시점 스냅샷(cash_amount)이 정본. */
const NICKS = ['리버킹', '에이스헌터', '폴드장인', '올인러', '블러프', '스택왕', '넛츠', '팟오즈'];
const session = { venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 60_000, card_amount: null, game_type: 'gtd',
  target_entries: 12, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리 딥스택', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false };
const buyins = NICKS.flatMap((n, i) => [i, ...(i % 3 === 0 ? [i + 100] : [])].map((k, j) => ({
  id: `cccccccc-0000-4000-8000-${String(k + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
  player_name: n, entry_no: j + 1, payment_method: i % 4 === 1 ? 'card' : 'cash', is_unpaid: false,
  buyin_at: `${MOCK_DAY}T1${i % 10}:0${j}:00Z`, is_split: false,
  cash_amount: i % 4 === 1 ? 0 : 60_000, card_amount: i % 4 === 1 ? 60_000 : 0, transfer_amount: 0,
  ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
})));
const players = NICKS.map((n, i) => ({ id: `dddddddd-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE,
  session_date: MOCK_DAY, game_seq: 1, name: n, visitor_type: i < 5 ? 'regular' : 'new', note: null, sort_order: i }));

async function serveLedger(page: Page) {
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill(json(single ? session : [session]));
  });
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(buyins)) : r.fallback()));
  await page.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(players)) : r.fallback()));
}

/** clock_states 한 행 — e2e/clock-visual.spec.ts 의 row() 와 같은 모양. */
function clockRow(venueId: string) {
  const levels = [
    { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
    { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
    { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 10, label: 'BREAK 10Min.' },
    { kind: 'level', sb: 1500, bb: 3000, ante: 3000, minutes: 20 },
  ];
  return {
    venue_id: venueId, game_seq: 1, session_date: null, title: '데일리 딥스택',
    config: { title: '데일리 딥스택', startStack: 50_000, rebuyStack: 50_000, addonStack: 0, isAddon: false,
      earlyBonus: 5_000, doubleEarlyBonus: 10_000, regCloseLevel: 3, maxLevel: 26,
      earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100,
      // 시상 금액은 원 단위(ClockPagesEditor '금액은 원 단위로 입력') · 문구 줄(K단계) · 추가 페이지 2장(팀 점수 포함)
      mysteryBounty: 0, prizes: [{ place: '1st', amount: 400_000 }, { place: '2nd', amount: 150_000 }, { place: '3rd', amount: 0, text: '시드권 + 트로피' }], levels,
      extraPages: [
        { kind: 'bounty', title: '바운티 안내', rows: [{ label: '헤드 바운티', content: '1만 칩', note: '탈락시킨 사람에게' }] },
        { kind: 'team', title: '깐부 팀 순위', points: [14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
          rows: [{ label: 'A팀', content: '2, 9', note: '리버킹·넛츠' }, { label: 'B팀', content: '1, 12' }, { label: 'C팀', content: '3, 4' }] },
      ] },
    current_index: 1, running: true, ends_at: new Date(Date.now() + 12 * 60_000 + 34_000).toISOString(), remaining_ms: 0,
    adj_entries: 11, adj_rebuys: 3, adj_earlies: 0, adj_addons: 0, eliminations: 5,
    live_stats: { entries: 11, rebuys: 3, alive: 6, avgStack: 91_000, totalStack: 546_000, buyInAmount: 60_000 },
  };
}

/** 캡처 → webp. clip 은 CSS px, 결과 폭은 outW(px). 반환: 실제 저장 치수. */
async function save(page: Page, name: string, clip: { x: number; y: number; width: number; height: number }, outW: number) {
  const png = await page.screenshot({ clip, path: `${RAW}/${name}.png` });
  const img = sharp(png).resize({ width: outW });
  const { width, height, size } = await img.webp({ quality: 78, effort: 6 }).toFile(`${OUT}/${name}.webp`);
  console.log(`[guide-shot] ${name}.webp ${width}x${height} ${(size / 1024).toFixed(1)}KB`);
  return { width, height };
}

/** 애니메이션·깜빡이는 캐럿이 사진에 반쯤 찍히지 않게 멈춘다. */
const still = (page: Page) => page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}' });

test.describe('서비스 소개 — 모바일 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  for (const s of [
    // home = 첫 화면(헤더 포함) · browse/tools = 헤더 아래 핵심 440px 만(카드 폭에서 글자가 읽히게)
    { name: 'about-home', path: '/?tab=home', clip: { x: 0, y: 0, width: 390, height: 640 }, w: 560, must: '데일리 딥스택' },
    { name: 'about-browse', path: '/?tab=browse', clip: { x: 0, y: 61, width: 390, height: 440 }, w: 640, must: '데일리 딥스택' },
    { name: 'about-tools', path: '/?tab=tools', clip: { x: 0, y: 61, width: 390, height: 440 }, w: 640, must: 'NURI SPOT' },
  ]) {
    test(s.name, async ({ page }) => {
      await floor(page);
      await serveSchedules(page, null);
      await page.goto(s.path);
      await page.waitForLoadState('networkidle');
      // 픽스처가 실제로 화면에 닿았는지 — 빈 목록을 찍고 통과하지 않게
      await expect(page.getByText(s.must).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await still(page);
      await save(page, s.name, s.clip, s.w);
    });
  }
});

/** 업주 PC 캡처 폭. 1440 으로 찍은 본문(962px)을 가이드 1440 의 그림 칸(≈725px)에 넣으면 0.75배라 앱의 11.7px 글자가
 *  ~8.8px 로 읽혔다(2026-09-30 design-reviewer). lg(64rem=1088px) 이상인 1100 으로 찍으면 본문 열이 그림 칸과 거의 같은 폭이 된다. */
const PC_W = Number(process.env.GUIDE_PC_W ?? 1100);

/** 단계 바(rail)부터 본문 열 — 고정 좌표 대신 rail 위치로 자른다(P-03 으로 rail 이 16px 올라가도 따라간다).
 *  아래 끝 = 화면 아래쪽에 고정된 바(장부 정산 바 등)의 위 — 그 바는 사진에 반쯤 걸리지 않게 뺀다. */
async function railClip(page: Page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-tab="my-store"] [data-mystore-rail]')!.getBoundingClientRect();
    let bottom = innerHeight;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 300 && r.height > 24 && r.top > innerHeight / 2 && r.bottom >= innerHeight - 2) bottom = Math.min(bottom, r.top);
    }
    const y = Math.max(0, Math.floor(rail.top - 8));
    // 좌우 8px 여유 — 열 왼쪽 끝 글자(게임·매장 아이콘)가 잘리지 않게
    return { x: Math.max(0, Math.floor(rail.left - 8)), y, width: Math.ceil(rail.width + 16), height: Math.floor(bottom - 8 - y) };
  });
}

/** 사진 속 가장 작은 글자(px) — 보고서의 '그림 칸에서 몇 px 로 보이나' 계산용. */
const minFontIn = (page: Page, clip: { x: number; y: number; width: number; height: number }) => page.evaluate((c) => {
  let min = 99;
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || cs.visibility === 'hidden' || r.right < c.x || r.left > c.x + c.width || r.bottom < c.y || r.top > c.y + c.height) continue;
    min = Math.min(min, parseFloat(cs.fontSize));
  }
  return min;
}, clip);

test.describe('업주 가이드 — PC', () => {
  test.use({ deviceScaleFactor: 2 });

  async function boot(page: Page) {
    await floor(page);
    await bootOwner(page, { viewport: { width: PC_W, height: 900 }, goto: false, clock: clockRow(MOCK_VENUE) });
    await serveSchedules(page, MOCK_VENUE);
    await serveLedger(page);
    // bootOwner 의 매장 이름('테스트 홀덤펍')을 사진용 가명으로 — 일정 픽스처의 pub_name 과 맞춘다
    await page.route(/\/rest\/v1\/venues\?/, (r) => {
      if (r.request().method() !== 'GET') return r.fallback();
      const row = { id: MOCK_VENUE, name: PUB, region: '서울', address: '서울시 중구 샘플로 1', owner_id: MOCK_UID, approved: true, status: 'active',
        verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 3, rating: 4.5, page_config: null };
      const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
      return r.fulfill(json(single ? row : [row]));
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openMyStore(page);
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
  }
  const step = async (page: Page, label: string) => {
    const t = page.locator('[aria-label="매장 단계 이동"] [role=tab]').filter({ hasText: label }).first();
    await expect(t).toBeVisible({ timeout: 20_000 });
    await t.click();
    await page.waitForTimeout(2500);
    return t;
  };

  const SLUG: Record<string, string> = { 포스터: 'poster', 장부: 'ledger', 순위: 'ranking', 정산: 'settle' };
  for (const label of Object.keys(SLUG)) {
    test(`owner-${label}`, async ({ page }) => {
      await boot(page);
      // 그 단계 판이 실제로 열렸는지(엉뚱한 판을 찍고 통과하지 않게)
      await expect(await step(page, label)).toHaveAttribute('aria-selected', 'true');
      await still(page);
      const clip = await railClip(page);
      console.log(`[guide-shot] owner-${SLUG[label]} clip ${JSON.stringify(clip)} minFont ${await minFontIn(page, clip)}px`);
      await save(page, `owner-${SLUG[label]}`, clip, clip.width * 2);
    });
  }

  // ── 2026-10-01 새 기능 사진 4장 ──
  test('owner-poster-rules', async ({ page }) => {
    await boot(page);
    await step(page, '포스터');
    await page.getByRole('button', { name: /새 게임/ }).first().click();
    const d = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '새 포스터 등록' }) }).last();
    await expect(d).toBeVisible({ timeout: 20_000 });
    await d.getByRole('button', { name: /리엔트리 가격·한도/ }).click();
    const f = (name: string) => d.getByLabel(name, { exact: false }).first();
    await f('리엔트리 참가비').fill('100000');
    await f('참가 1회 = 이용권').fill('10');
    await f('회차별 리엔트리 스택').fill('80000, 80000, 90000');
    await page.waitForTimeout(600);
    const box = d.locator('div.mt-2.space-y-3').first();
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    await still(page);
    const b = (await box.boundingBox())!;
    const clip = { x: Math.floor(b.x - 12), y: Math.floor(b.y - 44), width: Math.ceil(b.width + 24), height: Math.ceil(b.height + 56) };
    console.log(`[guide-shot] owner-poster-rules clip ${JSON.stringify(clip)} minFont ${await minFontIn(page, clip)}px`);
    await save(page, 'owner-poster-rules', clip, clip.width * 2);
  });

  test('owner-clock-pages', async ({ page }) => {
    await boot(page);
    await step(page, '클락');
    await page.getByTestId('clk-edit-pages').first().click();
    const d = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /TV 페이지/ }) }).last();
    await expect(d.getByTestId('clk-extra-editor')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await still(page);
    const b = (await d.boundingBox())!;
    const clip = { x: Math.floor(b.x), y: Math.floor(b.y), width: Math.ceil(b.width), height: Math.min(Math.ceil(b.height), 900 - Math.floor(b.y)) };
    console.log(`[guide-shot] owner-clock-pages clip ${JSON.stringify(clip)} minFont ${await minFontIn(page, clip)}px`);
    await save(page, 'owner-clock-pages', clip, clip.width * 2);
  });
});

test.describe('업주 가이드 — 새 기능(장부·직원)', () => {
  test.use({ deviceScaleFactor: 2 });

/** 장부 접수대 — 이용권 7장으로 10장 게임 요청 → 서버가 '모자람'(VOUCHER_SHORT)을 돌려주면 남은 금액 결제 선택이 열린다.
 *  e2e/voucher-short-split.spec.ts 와 같은 가짜 서버(승인 RPC 를 여기서 받는다 — 운영 쓰기 0). */
test('owner-voucher-split', async ({ page }) => {
  const SES = { ...session, buyin_amount: 100_000, title: '데일리 메인', opened_at: `${MOCK_DAY}T10:00:00Z`, tournament_start: null, schedule_id: null, operators: [] };
  const reqs = [1, 2, 3, 4, 5, 6, 7].map((i) => ({
    id: `aaaaaaaa-0000-4000-8000-00000000000${i}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, user_id: 'u1', player_name: '리버킹',
    note: '이용권 사용', status: 'pending', created_at: new Date(Date.now() - (10 - i) * 1000).toISOString(), requested_game_seq: 1,
    voucher_id: `bbbbbbbb-0000-4000-8000-00000000000${i}`,
  }));
  await floor(page);
  await bootOwner(page, {
    viewport: { width: PC_W, height: 900 }, goto: false, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        return r.fulfill(json(single ? SES : [SES]));
      });
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(players)) : r.fallback()));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(buyins)) : r.fallback()));
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
      await p.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(reqs)) : r.fallback()));
      await p.route(/\/rest\/v1\/rpc\/approve_buyin_request/, (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({
        code: '23514', hint: 'VOUCHER_SHORT', message: '이용권이 모자랍니다',
        details: JSON.stringify({ need: 10, have: 7, ticketWon: 70000, remainder: 30000, use: 'buyin' }) }) }));
    },
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openMyStore(page);
  await page.locator('[data-tab="my-store"] [data-mystore-rail] [role=tab]').filter({ hasText: '장부' }).first().click();
  await expect(page.getByTestId('voucher-pending-count').first()).toContainText('이용권 7장 사용 대기', { timeout: 20_000 });
  await page.getByRole('button', { name: '✓ 승인·티켓' }).first().click();
  const panel = page.getByTestId('voucher-short-pay');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  const card = panel.locator('xpath=ancestor::li[1]');
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(4500); // 안내 토스트가 사라진 뒤
  await still(page);
  const b = (await card.boundingBox())!;
  const clip = { x: Math.floor(b.x - 8), y: Math.floor(b.y - 8), width: Math.ceil(b.width + 16), height: Math.ceil(b.height + 16) };
  console.log(`[guide-shot] owner-voucher-split clip ${JSON.stringify(clip)} minFont ${await minFontIn(page, clip)}px`);
  await save(page, 'owner-voucher-split', clip, clip.width * 2);
});

/** 직원 계정 — 내 매장 맨 위 출근·퇴근 줄. e2e/staff-punch.spec.ts 의 가짜 서버(배정 1건, 출근 전). */
test('owner-staff-punch', async ({ page }) => {
  const NONE = { can_access_ledger: false, can_manage_pos: false, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false };
  const rows = [{ work_date: MOCK_DAY, staff_name: '김직원', start_hm: '18:00', check_in: null, check_out: null, confirmed: true }];
  await floor(page);
  await bootOwner(page, {
    viewport: { width: PC_W, height: 900 }, goto: false, perms: NONE, profile: { role: 'venue_staff', name: '김직원', nickname: '김직원' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/my_punch_state/, (r) => r.fulfill(json(rows.map((x) => ({ work_date: x.work_date, check_in: x.check_in, check_out: x.check_out })))));
      await p.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(rows)) : r.fallback()));
    },
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await openMyStore(page);
  const bar = page.locator('[data-tab="my-store"] [data-testid="staff-punch-bar"]');
  await expect(bar).toHaveAttribute('data-phase', 'before', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await still(page);
  const b = (await bar.boundingBox())!;
  const clip = { x: Math.floor(b.x - 8), y: Math.floor(b.y - 8), width: Math.ceil(b.width + 16), height: Math.ceil(b.height + 16) };
  console.log(`[guide-shot] owner-staff-punch clip ${JSON.stringify(clip)} minFont ${await minFontIn(page, clip)}px`);
  await save(page, 'owner-staff-punch', clip, clip.width * 2);
});
});

test.describe('업주 가이드 — TV', () => {
  test.use({ deviceScaleFactor: 2 });
  test('owner-tv', async ({ page }) => {
    test.info().annotations.push({ type: 'dpr', description: '1 — 1920 을 그대로 줄인다' });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await floor(page);
    await serveClock(page, clockRow(TV_VENUE));
    await page.goto(`/?display=${TV_VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await still(page);
    await save(page, 'owner-tv', { x: 0, y: 0, width: 1920, height: 1080 }, 1480);
    // 서비스 소개(모바일)의 '매장 관리' 카드용 작은 판
    await save(page, 'about-clock', { x: 0, y: 0, width: 1920, height: 1080 }, 720);
  });
});
