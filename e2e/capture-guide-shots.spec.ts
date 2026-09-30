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
      mysteryBounty: 0, prizes: [{ place: '1st', amount: 400 }, { place: '2nd', amount: 150 }], levels },
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
      await expect(page.getByText(s.must).first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await still(page);
      await save(page, s.name, s.clip, s.w);
    });
  }
});

test.describe('업주 가이드 — PC 1440', () => {
  test.use({ deviceScaleFactor: 2 });

  async function boot(page: Page) {
    await floor(page);
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, goto: false, clock: clockRow(MOCK_VENUE) });
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
      // 본문 열(단계 바부터) — 사이드바·헤더는 뺀다. 장부 하단 고정 정산 바(y≈793)가 안 걸리게 790 에서 자른다.
      await save(page, `owner-${SLUG[label]}`, { x: 360, y: 248, width: 962, height: 542 }, 1480);
    });
  }
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
