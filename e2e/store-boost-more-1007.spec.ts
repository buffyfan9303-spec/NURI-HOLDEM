// 오너 2026-10-07 두 건 회귀 게이트(목킹 업주 · 운영 쓰기 0).
//   (A) "포스터 고정 상단 문의 위로 올려 맨 위로 · 번호 고객센터 번호로 변경 · 아래로 쓸어내려 닫기가 제목 살짝 위에까지는 돼야지 이건 맨 위에만 돼"
//       → 문의 링크는 대시보드 맨 위 · 창의 전화는 사업자 정보의 전화번호(BIZ_REQUIRED) · 제목 줄(헤더)에서 끌어도 닫힌다(CDP 터치).
//   (B) "내 매장 모바일에서 더보기 … 누르면 아래에 나와야지 왜 위로 가 · 정보 제대로 송출도 안되고"
//       → 390 은 '더 보기' 칸이 토글 **아래**에 펼쳐지고(토글·스크롤 제자리, rAF 매 프레임), 토글 이름은 실제 펼쳐지는 칸만 말한다.
//       PC 1440 은 종전(한 격자 · 토글 제자리)과 같고 같은 카드·같은 숫자를 보인다.
// 음성 대조: 수정 전 빌드(origin/main 095079f6)에서 B1·B3·A1(390·1440)·A2·A3·A4·C1 FAIL, B3b·B4·B4b PASS(종전 유지 확인) — 수정 빌드 전부 PASS.
//   바닥 클램프(접을 때 문서가 짧아져 토글이 끌려 내려옴)는 이 판에서 390 으로 만들 수 없었다 — 토글 아래(유틸·알림·푸터)가 ~1300px 로
//   뷰포트보다 길어 토글이 보이는 한 클램프가 안 난다(Fold 를 빼고 빌드해도 0px). 그래서 검사로 두지 않는다(거짓 초록 방지).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/store-boost-more-1007.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';
import { BIZ_REQUIRED } from '../src/components/features/BusinessFooter';

type R = Record<string, unknown>;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const dayAgo = (n: number) => new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - n * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
const sess = (date: string, o: R = {}): R => ({
  venue_id: MOCK_VENUE, session_date: date, game_seq: 1, title: '메인', buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${date}T10:00:00+09:00`, operators: [], reg_closed: true, closed: true, closed_at: `${date}T22:00:00+09:00`,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${date}T01:00:00Z`, clock_snapshot: null, ...o,
});
const buys = (date: string, n: number): R[] => Array.from({ length: n }, (_, i) => ({
  id: `eeeeeeee-0001-4000-8000-${date.replace(/-/g, '')}${String(i).padStart(4, '0')}`, venue_id: MOCK_VENUE, session_date: date, game_seq: 1,
  player_name: `손님${i}`, entry_no: 1, payment_method: 'cash', is_unpaid: false, buyin_at: `${date}T11:00:00+09:00`, is_split: false,
  cash_amount: 30_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
}));
function pick(rows: R[], url: string) {
  const q = new URL(url).searchParams;
  let out = rows;
  for (const k of ['venue_id', 'session_date', 'game_seq', 'closed']) {
    for (const v of q.getAll(k)) {
      const m = /^(eq|lt|lte|gt|gte)\.(.*)$/.exec(v); if (!m) continue;
      const [, op, b] = m;
      out = out.filter((r) => { const a = String(r[k]); return op === 'eq' ? a === b : op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : a >= b; });
    }
  }
  return out;
}
// 14일 장부: 지난 13일 8~12바인 + 오늘 열린 메인 6바인 → 7일 65바인 · 전주 71바인(손계산).
const sessions: R[] = []; const buyins: R[] = [];
for (let i = 1; i <= 13; i++) { sessions.push(sess(dayAgo(i))); buyins.push(...buys(dayAgo(i), 8 + (i % 5))); }
sessions.push(sess(MOCK_DAY, { closed: false, reg_closed: false, closed_at: null })); buyins.push(...buys(MOCK_DAY, 6));
const clockRow = {
  venue_id: MOCK_VENUE, game_seq: 1, title: '메인',
  config: { title: '메인', startStack: 50_000, rebuyStack: 50_000, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 3, maxLevel: 10,
    earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [],
    levels: [{ kind: 'level', sb: 100, bb: 200, ante: 200, minutes: 20 }, { kind: 'level', sb: 200, bb: 400, ante: 400, minutes: 20 }] },
  current_index: 1, running: true, ends_at: new Date(Date.now() + 3_600_000).toISOString(), remaining_ms: 3_600_000,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, session_date: MOCK_DAY,
  live_stats: { buyInAmount: 30_000, ledger: { entries: 6, rebuys: 0, earlies: 0, doubleEarlies: 0, totalBuyins: 6, earlyUnits: 0, addons: 0 } },
};
const ADMIN_PHONE = '010-0000-0000';   // 관리자 설정의 옛 부스트 연락처 — 창에 보이면 안 된다
const CS_PHONE = BIZ_REQUIRED.find(([k]) => k === '전화번호')![1];

const schedRow = (id: string, date: string, title: string): R => ({
  id, title, venue_id: MOCK_VENUE, pub_name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1', date, start_time: '19:00:00',
  duration: '', format: 'tournament', guaranteed: 1_000_000, prize_pool: null, buy_in: { amount: 30_000 }, seats: 40, structure: null, description: '',
  side_events: [], ranking_prizes: [], partners: [], promotions: [], payment_methods: [], rules: [], poster_url: null, poster_color: null, display_order: 1,
  is_premium: false, premium_until: null, owner_id: '00000000-0000-4000-8000-0000000000ee', unread_qna_count: 0, approved: true, view_count: 0,
});
const dayAhead = (n: number) => dayAgo(-n);

async function boot(page: Page, W: number, H: number, clock = false, resErr = false) {
  await bootOwner(page, {
    viewport: { width: W, height: H }, goto: false, clock: clock ? clockRow : undefined,
    appSettings: { identity_voucher_enabled: 'on', boost_contact_phone: ADMIN_PHONE, boost_contact_email: 'ace@nuriholdem.com' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/rpc\/venue_regulars/, (r) => r.fulfill(json([{ name: '손님1', buyins: 12, visits: 9 }])));
      await p.route(/\/rest\/v1\/rpc\/ledger_dow_avg_buyins/, (r) => r.fulfill(json(null)));
      const serve = (rows: () => R[]) => async (r: Route) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const got = pick(rows(), r.request().url());
        return r.fulfill(json(single(r) ? (got[0] ?? null) : got)).catch(() => {});
      };
      await p.route(/\/rest\/v1\/ledger_sessions\?/, serve(() => [...sessions].sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)))));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, serve(() => buyins));
      if (resErr) {
        // 다가오는 예약 카드에 게임 1개 + 예약 인원 조회 실패(500) → '예약 인원을 불러오지 못했어요' 줄
        const rows = [schedRow('99999999-9999-4999-8999-000000000001', dayAhead(1), '내일 메인')];
        await p.route(/\/rest\/v1\/schedules\?/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? rows[0] : rows)));
        await p.route(/\/rest\/v1\/rpc\/schedule_reservation_counts/, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'mock fail' }) }));
      }
    },
  });
  await page.goto('/');
  await openMyStore(page);
  await expect(dash(page).getByTestId('todo-cta'), '대시보드가 정착하지 않았다').toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1200);   // 데이터 파도(14일 range·클락)가 가라앉을 때까지
}
const dash = (page: Page) => page.locator('[data-pane="dashboard"]');
const moreBtn = (page: Page) => dash(page).locator('button[aria-expanded]').filter({ hasText: /^(간단히 보기|더 보기)/ });

/** 토글을 화면 가운데 두고 누른 뒤 40 프레임 동안 토글 top·scrollY·펼침 칸 위치를 rAF 로 기록한다. */
async function pressTrace(page: Page) {
  const btn = moreBtn(page);
  await btn.evaluate((b) => b.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  return btn.evaluate(async (b) => {
    const frames: { btn: number; y: number }[] = [];
    const rec = () => frames.push({ btn: b.getBoundingClientRect().top, y: scrollY });
    rec();
    (b as HTMLElement).click();
    for (let i = 0; i < 40; i++) { await new Promise((z) => requestAnimationFrame(z)); rec(); }
    const bb = b.getBoundingClientRect().bottom;
    const cards = [...document.querySelectorAll<HTMLElement>('[data-pane="dashboard"] [data-reveal]')].filter((c) => c.getClientRects().length)
      .map((c) => ({ title: c.querySelector('button span')?.textContent?.trim() ?? '', top: c.getBoundingClientRect().top - bb }));
    const dBtn = Math.max(...frames.map((f) => Math.abs(f.btn - frames[0].btn)));
    const dY = Math.max(...frames.map((f) => Math.abs(f.y - frames[0].y)));
    return { dBtn: Math.round(dBtn * 10) / 10, dY: Math.round(dY), cards };
  });
}

// ── (B) 모바일 '더 보기' ──────────────────────────────────────────────────────────────
test('B1 390 — 더 보기를 누르면 칸이 토글 아래에 펼쳐지고 토글·스크롤은 제자리(접을 때도)', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, 844);
  expect(await moreBtn(page).getAttribute('aria-expanded'), '모바일은 접힌 채 시작한다').toBe('false');
  const open = await pressTrace(page);
  console.log('[B1 open]', JSON.stringify(open));
  expect(open.cards.length, '펼친 칸이 없다 — 빈 검사').toBeGreaterThanOrEqual(5);
  expect(open.dBtn, `펼칠 때 토글이 ${open.dBtn}px 움직였다`).toBeLessThanOrEqual(1);
  expect(open.dY, `펼칠 때 스크롤이 ${open.dY}px 움직였다(수정 전 +964 — 칸이 토글 위에 생겼다)`).toBeLessThanOrEqual(1);
  for (const c of open.cards) expect(c.top, `'${c.title}' 칸이 토글 위에 있다`).toBeGreaterThanOrEqual(0);
  // 펼친 첫 칸이 토글 바로 아래 화면 안에 보인다(눌렀는데 눈앞에 아무것도 없는 상태가 아니다)
  expect(Math.min(...open.cards.map((c) => c.top)), '첫 칸이 토글 바로 아래가 아니다').toBeLessThanOrEqual(40);
  const close = await pressTrace(page);
  console.log('[B1 close]', JSON.stringify({ dBtn: close.dBtn, dY: close.dY, left: close.cards.length }));
  expect(close.cards.length, '접었는데 칸이 남았다').toBe(0);
  expect(close.dBtn, `접을 때 토글이 ${close.dBtn}px 움직였다`).toBeLessThanOrEqual(1);
});

test('B3 390 — 클락이 돌면 토글 이름에 «클락»이 없고(칸도 없음), 없으면 이름·칸 둘 다 있다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, 844, true);
  await expect(moreBtn(page), '클락이 도는데 토글이 «클락»을 약속한다(펼쳐도 클락 칸이 없다)').not.toContainText('클락');
  await moreBtn(page).evaluate((b) => (b as HTMLElement).click());
  await page.waitForTimeout(600);
  await expect(dash(page).locator('[data-reveal]').filter({ hasText: '대회 클락' })).toHaveCount(0);
  await expect(dash(page).locator('[data-reveal]').filter({ hasText: '전주 대비' }).first()).toBeVisible();
});
test('B3b 390 — 클락이 없으면 토글 이름의 «클락» 칸이 실제로 펼쳐진다(양성 대조)', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, 844, false);
  await expect(moreBtn(page)).toContainText('더 보기 · 클락');
  await moreBtn(page).evaluate((b) => (b as HTMLElement).click());
  await expect(dash(page).locator('[data-reveal]').filter({ hasText: '대회 클락' }).first()).toBeVisible({ timeout: 5_000 });
});

// ── (A) 포스터 상단 고정 문의 ─────────────────────────────────────────────────────────
for (const [W, H] of [[390, 844], [1440, 900]] as const) {
  test(`A1 ${W} — '포스터 상단 고정 문의' 가 대시보드 맨 위(첫 칸보다 위)에 있다`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, W, H);
    const r = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-pane="dashboard"]')!;
      const b = [...pane.querySelectorAll<HTMLElement>('button')].find((x) => x.getClientRects().length && /포스터 상단 고정 문의/.test(x.textContent ?? ''));
      if (!b) return null;
      const top = b.getBoundingClientRect().top;
      const kids = [...pane.querySelectorAll<HTMLElement>('section, [data-testid="todo-card"]')].filter((x) => x.getClientRects().length && !x.contains(b));
      return { top, firstOther: Math.min(...kids.map((k) => k.getBoundingClientRect().top)), n: kids.length, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height };
    });
    console.log(`[A1 ${W}]`, JSON.stringify(r));
    expect(r, '문의 버튼이 없다').not.toBeNull();
    expect(r!.n, '비교할 카드가 없다 — 빈 검사').toBeGreaterThan(3);
    expect(r!.top, '문의 버튼이 대시보드 카드들보다 아래에 있다').toBeLessThan(r!.firstOther);
  });
}

test('A2 390 — 문의 창의 전화는 고객센터 번호(사업자 정보)이고 관리자 설정의 옛 번호가 아니다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, 844);
  await dash(page).getByRole('button', { name: /포스터 상단 고정 문의/ }).click();
  const dialog = page.getByRole('dialog', { name: /포스터 상단 고정/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.locator(`a[href="tel:${CS_PHONE.replace(/[^0-9+]/g, '')}"]`), '고객센터 번호 링크가 없다').toBeVisible({ timeout: 5_000 });
  await expect(dialog, '관리자 설정의 옛 번호가 보인다').not.toContainText(ADMIN_PHONE);
  await expect(dialog.locator('a[href^="mailto:"]'), '메일(관리자 설정)은 그대로').toBeVisible();
});

/** CDP 터치 — 손가락 조건(누름 유지·이동). steps 마다 16ms. */
async function touchDrag(page: Page, x: number, y: number, dy: number, steps = 12, holdMs = 120) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(holdMs);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function openBoost(page: Page) {
  await dash(page).getByRole('button', { name: /포스터 상단 고정 문의/ }).click();
  const dialog = page.getByRole('dialog', { name: /포스터 상단 고정/ });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);   // 진입 애니 끝
  return dialog;
}

test('A3 390 — 제목을 톡 치면(3px) 그대로다 · 닫기 버튼 탭은 버튼으로 닫는다 · 제목 줄(헤더)에서 끌어내리면 닫힌다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, 844);
  let dialog = await openBoost(page);
  const title = await dialog.locator('#modal-title').boundingBox();
  // ① 탭(3px 흔들림) — 드래그로 오인되면 안 된다
  await touchDrag(page, title!.x + 20, title!.y + title!.height / 2, 3, 2, 100);
  await page.waitForTimeout(500);
  await expect(dialog, '제목을 톡 쳤는데 창이 닫혔다').toBeVisible();
  // ② 닫기 버튼 손가락 탭(누름 120ms) — 헤더가 그립이 돼도 드래그가 아니라 버튼 클릭으로 간다
  const x = await dialog.getByRole('button', { name: '닫기' }).boundingBox();
  await touchDrag(page, Math.round(x!.x + x!.width / 2), Math.round(x!.y + x!.height / 2), 0, 0, 120);
  await expect(dialog, '닫기 버튼 탭이 먹지 않았다').toBeHidden({ timeout: 3_000 });
  // ③ 제목 줄에서 끌어내리기 — 수정 전은 그립(맨 위 막대)에서만 됐다
  //   ⚠ 끌어 닫은 **직후**의 다음 탭은 크롬이 플링 멈춤으로 삼켜 클릭이 안 날 수 있다(수정 전 빌드 그립 끌기도 같음, 2026-10-07 실측) — 그래서 끌기를 마지막에 둔다.
  dialog = await openBoost(page);
  await touchDrag(page, title!.x + 20, title!.y + title!.height / 2, 260);
  await expect(dialog, '제목 줄에서 끌어내렸는데 안 닫혔다').toBeHidden({ timeout: 3_000 });
});

test('A4 390 — 본문(맨 위)에서 끌어내려도 닫힌다 · 그립은 종전대로', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, 844);
  let dialog = await openBoost(page);
  const body = await dialog.getByText('이런 효과가 있어요').boundingBox();
  await touchDrag(page, body!.x + 10, body!.y + body!.height / 2, 260);
  await expect(dialog, '본문에서 끌어내렸는데 안 닫혔다').toBeHidden({ timeout: 3_000 });
  dialog = await openBoost(page);
  const box = await dialog.boundingBox();
  await touchDrag(page, box!.x + box!.width / 2, box!.y + 8, 260);
  await expect(dialog, '그립에서 끌어내렸는데 안 닫혔다(회귀)').toBeHidden({ timeout: 3_000 });
});

// ── PC 1440 대조 — 종전과 같은가 · 같은 정보인가 ───────────────────────────────────────
test.describe('PC 1440', () => {
  test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  test('B4 1440 — 펴고 시작하고 접기/펴기에 토글 제자리 · 칸은 한 격자(아래 접이 없음) · 390 과 같은 카드·같은 숫자', async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, 1440, 900);
    expect(await moreBtn(page).getAttribute('aria-expanded'), 'PC 는 펴고 시작한다').toBe('true');
    await expect(dash(page).getByTestId('dash-more-below'), 'PC 에 모바일 접이가 생겼다').toHaveCount(0);
    const titles = await dash(page).locator('[data-reveal]').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.querySelector('button span')?.textContent?.trim() ?? ''));
    const cmp = dash(page).locator('[data-reveal]').filter({ hasText: '전주 대비' }).first();
    await expect(cmp).toContainText('65');
    await expect(cmp).toContainText('전주 71');
    const close = await pressTrace(page);
    const open = await pressTrace(page);
    console.log('[B4 1440]', JSON.stringify({ titles, close: close.dBtn, open: open.dBtn }));
    expect(close.dBtn).toBeLessThanOrEqual(1);
    expect(open.dBtn).toBeLessThanOrEqual(1);
    expect(titles).toEqual(['대회 클락', '전주 대비', '오늘 출근', '인건비 요약', '매장이용권', '생일 단골', '손님 유형']);
  });
});
test('B4b 390 — 펼친 칸이 PC 와 같은 7장·같은 전주 대비 숫자', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, 844);
  await moreBtn(page).evaluate((b) => (b as HTMLElement).click());
  await page.waitForTimeout(700);
  const titles = await dash(page).locator('[data-reveal]').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.querySelector('button span')?.textContent?.trim() ?? ''));
  expect(titles).toEqual(['대회 클락', '전주 대비', '오늘 출근', '인건비 요약', '매장이용권', '생일 단골', '손님 유형']);
  const cmp = dash(page).locator('[data-reveal]').filter({ hasText: '전주 대비' }).first();
  await expect(cmp).toContainText('65');
  await expect(cmp).toContainText('전주 71');
});

// ── 리드 추가(PR #207 같은 부류) — 다가오는 예약 '불러오지 못했어요' 줄: 눌러도 글이 선택되거나 줄이 갈라지지 않는다 ──────────
test('C1 390 — 예약 오류 줄은 선택 불가(웹·설치형) · 맨 글자 없음 · block 으로 풀려도 한 줄 · 터치 전후 높이 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, 844, false, true);
  const li = dash(page).getByTestId('dash-res-err').or(dash(page).locator('li', { hasText: '예약 인원을 불러오지 못했어요' })).first();
  await expect(li, '예약 오류 줄이 없다(전제)').toBeVisible({ timeout: 15_000 });
  await li.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const userSelect = () => li.evaluate((el) => [el, ...el.querySelectorAll('*')].map((e) => getComputedStyle(e).userSelect));
  expect.soft((await userSelect()).filter((v) => v !== 'none'), '오류 줄이 선택 가능하다(웹)').toEqual([]);
  const injected = await page.evaluate(() => {
    let css = '';
    for (const sh of [...document.styleSheets]) {
      let rules: CSSRuleList; try { rules = sh.cssRules; } catch { continue; }
      for (const r of [...rules]) if (r instanceof CSSMediaRule && r.conditionText.includes('display-mode: standalone')) css += [...r.cssRules].map((x) => x.cssText).join(' ');
    }
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    return css.includes('li');
  });
  expect(injected, '설치형 규칙(li 선택 허용)을 찾지 못했다').toBe(true);
  expect.soft((await userSelect()).filter((v) => v !== 'none'), '설치형에서 오류 줄이 선택 가능하다').toEqual([]);
  const bare = await li.evaluate((el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim()).map((n) => n.textContent));
  expect.soft(bare, '오류 줄에 맨 글자 노드가 있다(익명 flex 아이템)').toEqual([]);
  const split = await li.evaluate((el) => {
    const h0 = el.getBoundingClientRect().height;
    (el as HTMLElement).style.display = 'block';
    const h1 = el.getBoundingClientRect().height;
    (el as HTMLElement).style.display = '';
    return { h0, h1 };
  });
  console.log('[C1 block 강제]', JSON.stringify(split));
  expect.soft(split.h1, `block 으로 풀리면 글·버튼이 갈라진다 (${JSON.stringify(split)})`).toBeLessThan(split.h0 * 1.5);
  const b = (await li.locator('span').first().boundingBox())!;
  const h0 = (await li.boundingBox())!.height;
  const cdp = await page.context().newCDPSession(page);
  for (const hold of [80, 800]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 10, y: b.y + b.height / 2 }] });
    await page.waitForTimeout(hold);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => String(getSelection())), `터치 ${hold}ms 에 글이 선택됐다`).toBe('');
    expect(Math.abs((await li.boundingBox())!.height - h0), `터치 ${hold}ms 에 줄 높이가 바뀌었다`).toBeLessThanOrEqual(0.5);
  }
});
