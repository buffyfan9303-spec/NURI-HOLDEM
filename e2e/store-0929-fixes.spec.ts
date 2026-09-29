// 내 매장 2026-09-29 수정 묶음 회귀 — docs/HANDOFF-2026-09-29-account-switch.md §7 #6 · #4(D1·D5·D7·D8) · #7(D6).
//   원천 실측: docs/handoff-2026-09-29/{store-deep.md, bounce-sweep.md}
//
// 목킹 업주(운영 DB 쓰기 0). 느린 응답은 **누른 뒤에만** 건다(armed) — 부팅 조회까지 늦추면 재는 대상이 바뀐다.
// 음성 대조: 수정 전 빌드(bb1cdc31)에서 돌리면 각 🔴 가 빨갛다(시트 윗변 263/232px · 직원 관리 +730px ·
//   매출·손님 '고객 분석' 761→1662 · 통계 날짜 = 달력 오늘 · 재조회 실패 배너 없음 · 합계 칸 3줄 · 390 비고 미리보기 표시).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/store-0929-fixes.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE } from './_mockOwner';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LAT = 500;
const YESTERDAY = new Date(Date.now() + 9 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

const staffRows = Array.from({ length: 5 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000010${i}`, name: `직원${i + 1}`, nickname: `staff${i + 1}`, email: null, avatar_color: '#5A6175', staff_title: i ? '딜러' : '매니저', is_active: true }));
const inviteRows = [{ id: 'iv1', user_id: 'u9', email: 'a@b.c', nickname: 'newbie', name: '새직원', created_at: new Date().toISOString(), grant_ledger: false, grant_voucher: false, grant_schedule: false, staff_title: null }];
const dealerRows = Array.from({ length: 90 }, (_, i) => ({ id: `d${i}`, venue_id: MOCK_VENUE, dealer_name: `딜러${i % 9}`, shift_date: `${MOCK_DAY.slice(0, 7)}-${String((i % 27) + 1).padStart(2, '0')}`, start_time: '18:00', end_time: '23:00', table_no: null, hourly_wage: 12000, memo: null }));
const regRows = Array.from({ length: 120 }, (_, i) => ({ player_name: `손님${i % 38}`, session_date: MOCK_DAY }));
const rangeBuyins = Array.from({ length: 60 }, (_, i) => ({ id: `rb${i}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, player_name: `손님${i % 25}`, entry_no: 1 + Math.floor(i / 25),
  payment_method: i % 7 === 0 ? 'ticket' : 'cash', is_unpaid: i % 11 === 0, buyin_at: `${MOCK_DAY}T10:${String(i % 60).padStart(2, '0')}:00Z`, created_by: null, is_split: false,
  cash_amount: 100000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: 'none', request_id: null }));
const session = (over: Record<string, unknown> = {}) => ({ venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 100000, card_amount: null, game_type: 'gtd', target_entries: 40, max_entries: 0,
  is_addon: false, addon_stack: 0, title: '데일리', discounts: [], early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: `${MOCK_DAY}T09:00:00Z`, tournament_start: null, schedule_id: null, operators: [], ...over });

type Opts = { vp: { width: number; height: number }; data?: boolean; biz?: string; board?: { unit: number; buyins: number; note?: string; unpaid?: boolean; name?: string }; seedStaffRows?: string };
async function boot(page: Page, o: Opts) {
  const armed = { on: false, failBuyins: false };
  const late = async (r: Route, body: unknown) => { if (armed.on) await sleep(LAT); await r.fulfill(json(body)); };
  if (o.seedStaffRows) await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } }, [`nuri:staff-rows:${MOCK_VENUE}`, o.seedStaffRows] as [string, string]);
  const boardSession = o.board ? session({ buyin_amount: o.board.unit }) : null;
  const boardBuyins = o.board ? Array.from({ length: o.board.buyins }, (_, i) => ({ ...rangeBuyins[0], id: `bb${i}`, player_name: o.board!.name ?? '김철수', entry_no: i + 1, payment_method: 'cash', is_unpaid: !!o.board!.unpaid, cash_amount: o.board!.unit })) : [];
  await bootOwner(page, {
    viewport: o.vp,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/can_manage_venue(\?|$)/, (r) => r.fulfill(json(true)));
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => (o.biz ? r.fulfill(json(o.biz)) : r.fallback()));
      await p.route(/\/rest\/v1\/rpc\/get_my_venue_staff/, (r) => late(r, staffRows));
      await p.route(/\/rest\/v1\/rpc\/get_my_venue_invites/, (r) => late(r, inviteRows));
      await p.route(/\/rest\/v1\/rpc\/(get_ledger_access_user_ids|get_voucher_viewer_ids|get_schedule_manager_ids)/, (r) => late(r, []));
      await p.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(false)));
      await p.route(/\/rest\/v1\/dealer_shifts\?/, (r) => (r.request().method() === 'GET' ? late(r, dealerRows) : r.fallback()));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = r.request().url();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        if (/session_date=gte/.test(u)) return late(r, o.data ? [session()] : boardSession ? [boardSession] : []);
        if (boardSession) return r.fulfill(json(single ? boardSession : [boardSession]));
        return r.fulfill(json(single ? null : []));
      });
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json(o.board ? [{ id: 'ffffffff-0000-4000-8000-000000000001', venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, name: o.board.name ?? '김철수', visitor_type: 'regular', note: o.board.note ?? null, sort_order: 1 }] : []))
        : r.fallback()));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = r.request().url();
        if (/select=player_name(%2C|,)session_date/.test(u)) return late(r, regRows);
        if (/session_date=gte/.test(u)) return late(r, o.data ? rangeBuyins : boardBuyins);
        if (armed.failBuyins) return r.fulfill(json({ message: 'boom', code: 'XX000' }, 500));
        return r.fulfill(json(boardBuyins));
      });
    },
  });
  await openMyStore(page);
  return armed;
}

const secBtn = (page: Page, label: string) => page.locator('[data-mystore-secbar] button:visible').filter({ hasText: label }).first();

// ── #6 A3·A4 — 시트 윗변이 데이터 도착 때 솟지 않는다 ────────────────────────────
for (const [w, h] of [[390, 844], [412, 915], [1280, 800]] as const) {
  for (const which of ['딜러', '단골'] as const) {
    test(`🔴 #6 ${which} 시트 — 열릴 때 윗변 고정 (${w}×${h})`, async ({ page }) => {
      test.setTimeout(90_000);
      const armed = await boot(page, { vp: { width: w, height: h } });
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const g = window as unknown as { __tops: number[]; __t0: number };
        g.__tops = []; g.__t0 = performance.now();
        const tick = () => {
          const el = document.querySelector('[role="dialog"]') as HTMLElement | null;
          if (el) { const rc = el.getBoundingClientRect(); g.__tops.push(rc.top - new DOMMatrixReadOnly(getComputedStyle(el).transform).m42); }
          if (performance.now() - g.__t0 < 1800) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      armed.on = true;
      if (which === '딜러') await page.getByRole('button', { name: '딜러 로테이션·급여' }).click();
      else await page.getByRole('button', { name: /고객·단골/ }).first().click();
      if (which === '딜러') {
        await page.waitForTimeout(150);
        await expect(page.getByText('이번 달 등록된 시프트가 없습니다'), '로딩 중에 "이번 달 없음"이 거짓으로 떴다').toHaveCount(0);
        await expect(page.getByTestId('dealer-shifts-loading')).toHaveCount(1);
      }
      await page.waitForTimeout(1900);
      const tops: number[] = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops);
      expect(tops.length, '시트가 안 떴다 — 잴 것이 없으면 통과가 아니다').toBeGreaterThan(20);
      const swing = Math.max(...tops) - Math.min(...tops);
      console.log(`[#6 ${which} ${w}×${h}] 윗변 흔들림 ${swing.toFixed(1)}px (n=${tops.length})`);
      expect(swing, '데이터가 도착하며 시트 윗변이 움직였다').toBeLessThanOrEqual(1);
    });
  }
}

// ── #7 D6 — 사이드바 섹션 첫 방문 때 본문이 밀리지 않는다(1280) ────────────────────
const topOf = (page: Page, prefix: string) => page.evaluate((p) => {
  const e = [...document.querySelectorAll('[data-tab="my-store"] button, [data-tab="my-store"] h3, [data-tab="my-store"] p')]
    .find((x) => (x as HTMLElement).offsetParent && x.textContent?.trim().startsWith(p)) as HTMLElement | undefined;
  return e ? e.getBoundingClientRect().top : null;
}, prefix);

test('🔴 #7 D6-1 직원 관리 — 전에 본 인원만큼 자리를 잡아 아래 카드가 안 밀린다', async ({ page }) => {
  test.setTimeout(90_000);
  const armed = await boot(page, { vp: { width: 1280, height: 800 }, seedStaffRows: '5|1' });
  await page.waitForTimeout(800);
  armed.on = true;
  await secBtn(page, '직원 관리').click();
  await page.waitForTimeout(400);
  const a = await topOf(page, '딜러 출근 스케줄');
  await page.waitForTimeout(1300);
  const b = await topOf(page, '딜러 출근 스케줄');
  console.log(`[D6-1] 딜러 출근 스케줄 카드 top 400ms=${a} 1700ms=${b}`);
  expect(a).not.toBeNull();
  expect(Math.abs((b ?? 0) - (a ?? 0)), '구성원 목록이 도착하며 아래 카드가 밀렸다').toBeLessThanOrEqual(1);
});

test('🔴 #7 D6-2 매출·손님 — 로딩 중 뼈대가 필터 카드를 포함하고 "고객 분석"을 화면 밖에 둔다', async ({ page }) => {
  test.setTimeout(90_000);
  const armed = await boot(page, { vp: { width: 1280, height: 800 }, data: true });
  await page.waitForTimeout(800);
  const more = page.locator('[data-mystore-secbar] button:visible').filter({ hasText: '고급 기능' }).first();
  if (await more.count()) await more.click();
  armed.on = true;
  await secBtn(page, '매출·손님').click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('stats-loading'), '400ms 에 아직 로딩이어야 측정이 뜻을 가진다').toHaveCount(1);
  const f0 = await topOf(page, '바인 제외');
  const an0 = await topOf(page, '고객 분석');
  await page.waitForTimeout(1300);
  const f1 = await topOf(page, '바인 제외');
  const an1 = await topOf(page, '고객 분석');
  console.log(`[D6-2] 필터 ${f0}→${f1} · 고객 분석 ${an0}→${an1} (뷰포트 800)`);
  expect(f0, '필터 카드가 로딩 중 뼈대에서 빠졌다(도착 때 KPI 가 밀린다)').not.toBeNull();
  expect(Math.abs((f1 ?? 0) - (f0 ?? 0))).toBeLessThanOrEqual(1);
  expect(an0 ?? 9999, "로딩 중 '고객 분석'이 화면 안에 떴다가 밀려난다").toBeGreaterThanOrEqual(800);
});

// ── #4 D1 — 통계 '당일'은 영업일 ───────────────────────────────────────────────
test('🔴 #4 D1 매출·손님 당일 날짜 = 서버 영업일(자정 넘긴 토너 → 어제)', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, { vp: { width: 1280, height: 800 }, biz: YESTERDAY });
  await page.waitForTimeout(800);
  const more = page.locator('[data-mystore-secbar] button:visible').filter({ hasText: '고급 기능' }).first();
  if (await more.count()) await more.click();
  await secBtn(page, '매출·손님').click();
  const input = page.locator('[data-tab="my-store"] section input[type="date"]:visible').first();
  await expect(input).toHaveValue(YESTERDAY, { timeout: 10_000 });
});

// ── #4 D8·D5·D7 — 장부 판 ─────────────────────────────────────────────────────
async function openBoard(page: Page, o: Opts) {
  const armed = await boot(page, o);
  const store = page.locator('[data-tab="my-store"]');
  await store.locator('button:visible').filter({ hasText: /^장부$/ }).first().click({ timeout: 20_000 });
  await expect(store.locator('tbody td button[title="+1 바인 · 결제수단 선택"]:visible').first()).toBeVisible({ timeout: 25_000 });
  return armed;
}

test('🔴 #4 D8 바인 재조회만 실패해도 인라인 배너가 뜨고 표는 남는다', async ({ page }) => {
  test.setTimeout(90_000);
  const armed = await openBoard(page, { vp: { width: 1280, height: 900 }, board: { unit: 100_000, buyins: 2 } });
  armed.failBuyins = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('방금 장부를 새로 불러오지 못했어요'), '바인 재조회 실패를 삼켰다').toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-tab="my-store"] tbody button[title="+1 바인 · 결제수단 선택"]:visible').first(), '실패했다고 표를 비웠다').toBeVisible();
  armed.failBuyins = false;
  await page.getByRole('button', { name: '다시 시도' }).first().click();
  await expect(page.getByText('방금 장부를 새로 불러오지 못했어요'), '재시도 성공 뒤에도 배너가 남았다').toHaveCount(0, { timeout: 10_000 });
});

test('🔴 #4 D5 총바인 칸 — 긴 금액(8,888.89만)도 두 줄(회수·금액)을 넘지 않고 옆 칸을 침범하지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  await openBoard(page, { vp: { width: 1280, height: 900 }, board: { unit: 7_407_407, buyins: 12 } });
  const m = await page.evaluate(() => {
    const btn = ([...document.querySelectorAll('[data-tab="my-store"] tbody td button[title="+1 바인 · 결제수단 선택"]')] as HTMLElement[]).find((e) => e.offsetParent) as HTMLElement | undefined;
    if (!btn) return null;
    const td = btn.closest('td')!;
    const amt = btn.querySelector('span') as HTMLElement;
    const range = document.createRange(); range.selectNodeContents(amt);
    // 줄 수는 요소 상자가 아니라 **글자** 줄로 센다(block span 은 줄바꿈돼도 상자가 하나다).
    const lineTops = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()].map((x) => Math.round(x.top)); };
    const tops = new Set([...lineTops(btn.querySelector('b')!), ...lineTops(amt)]);
    return { text: amt.textContent, lines: tops.size, textRight: range.getBoundingClientRect().right, tdRight: td.getBoundingClientRect().right, tdH: td.getBoundingClientRect().height };
  });
  console.log(`[D5] ${JSON.stringify(m)}`);
  expect(m, '총바인 칸 버튼을 못 찾았다').not.toBeNull();
  expect(m!.lines, '금액이 줄바꿈됐다(행 높이가 4px 튄다)').toBe(2);
  expect(m!.textRight, '금액이 옆 미수 칸을 침범한다').toBeLessThanOrEqual(m!.tdRight);
});

// D5 후속(2026-09-29 CI) — 같은 표의 미수 칸도 68px 고정이다. 긴 미수 금액이 칸을 넘거나 왼쪽 총바인 고정 칸과 겹치면 안 된다.
//   글꼴 폭이 기기마다 달라(CI 리눅스 +3.4px 실측) 기본 글꼴 통과만으로는 모자란다 — 여기 강도는 총바인과 같다.
for (const [w, h] of [[1280, 900], [390, 844]] as const) {
  test(`🔴 #4 D5 미수 칸 ${w} — 긴 미수 금액(8,888.89만)이 두 줄 이내·칸 안·총바인 칸과 겹치지 않는다`, async ({ page }) => {
    test.setTimeout(90_000);
    await openBoard(page, { vp: { width: w, height: h }, board: { unit: 7_407_407, buyins: 12, unpaid: true } });
    const m = await page.evaluate(() => {
      const btn = ([...document.querySelectorAll('[data-tab="my-store"] tbody td button[title="+1 바인 · 결제수단 선택"]')] as HTMLElement[]).find((e) => e.offsetParent);
      if (!btn) return null;
      const tot = btn.closest('td')!;
      const un = tot.nextElementSibling as HTMLElement;
      un.scrollIntoView({ inline: 'center' });
      const r = document.createRange(); r.selectNodeContents(un);
      const rects = [...r.getClientRects()];
      const tb = tot.getBoundingClientRect(), ub = un.getBoundingClientRect();
      return { text: un.textContent, lines: new Set(rects.map((x) => Math.round(x.top))).size,
        textLeft: Math.min(...rects.map((x) => x.left)), textRight: Math.max(...rects.map((x) => x.right)),
        unLeft: ub.left, unRight: ub.right, totRight: tb.right, unW: ub.width };
    });
    console.log(`[D5 미수 ${w}] ${JSON.stringify(m)}`);
    expect(m, '미수 칸을 못 찾았다').not.toBeNull();
    expect(m!.text).toBe('8,888.89만');
    expect(m!.lines, '미수 금액이 세 줄 이상으로 접혔다').toBeLessThanOrEqual(2);
    expect(m!.textRight, '미수 금액이 칸 밖으로 넘친다').toBeLessThanOrEqual(m!.unRight);
    expect(m!.textLeft, '미수 금액이 칸 왼쪽으로 넘친다').toBeGreaterThanOrEqual(m!.unLeft);
    expect(m!.totRight, '총바인 고정 칸이 미수 칸을 덮는다').toBeLessThanOrEqual(m!.unLeft + 0.5);
  });
}

for (const [w, h, hidden] of [[390, 844, true], [1280, 900, false]] as const) {
  test(`🔴 #4 D7 플레이어 칸 비고 미리보기 — ${w}px 에서 ${hidden ? '숨김(고정 열 폭 절약)' : '유지(PC 기능 보존)'}`, async ({ page }) => {
    test.setTimeout(90_000);
    await openBoard(page, { vp: { width: w, height: h }, board: { unit: 100_000, buyins: 2, note: '단골 VIP 좌석 요청 메모' } });
    const r = await page.evaluate(() => {
      const ths = ([...document.querySelectorAll('[data-tab="my-store"] thead th')] as HTMLElement[]).filter((t) => t.offsetParent);
      const sticky = ths.filter((t) => getComputedStyle(t).position === 'sticky' && getComputedStyle(t).left !== 'auto');
      const note = ([...document.querySelectorAll('[data-tab="my-store"] tbody td span')] as HTMLElement[]).find((s) => s.textContent?.startsWith('· 단골') && s.closest('table')?.getClientRects().length);
      const scroller = (([...document.querySelectorAll('[data-tab="my-store"] table')] as HTMLElement[]).find((t) => t.offsetParent)?.parentElement ?? null) as HTMLElement | null;
      return { stickyW: sticky.reduce((a, t) => a + t.getBoundingClientRect().width, 0), scrollerW: scroller?.clientWidth ?? 0, noteShown: !!note && note.getClientRects().length > 0 };
    });
    console.log(`[D7 ${w}] ${JSON.stringify(r)}`);
    expect(r.noteShown).toBe(!hidden);
  });
}

// ── D7 후속(design-reviewer 2026-09-29) — 긴 이름이면 비고 숨김과 무관하게 고정 열이 191px(390 의 54%)였다 ──────────
const LONG = '홍길동닉네임아주긴플레이어이름';
for (const [w, h, capped] of [[390, 844, true], [1280, 900, false]] as const) {
  test(`🔴 D7 긴 이름 ${w} — ${capped ? '모바일 고정 열 ≤158px' : 'PC 는 종전 폭(이름 상한 153px)'} · 잘린 이름은 title 로 남는다`, async ({ page }) => {
    test.setTimeout(90_000);
    await openBoard(page, { vp: { width: w, height: h }, board: { unit: 100_000, buyins: 3, name: LONG } });
    const r = await page.evaluate((nm) => {
      const ths = ([...document.querySelectorAll('[data-tab="my-store"] thead th')] as HTMLElement[]).filter((t) => t.offsetParent && getComputedStyle(t).position === 'sticky' && getComputedStyle(t).left !== 'auto');
      const nameEl = ([...document.querySelectorAll('[data-tab="my-store"] tbody span[title]')] as HTMLElement[]).find((s) => s.offsetParent && s.getAttribute('title') === nm);
      return { stickyW: ths.reduce((a, t) => a + t.getBoundingClientRect().width, 0), playerW: ths[1]?.getBoundingClientRect().width ?? 0, titled: !!nameEl, clipped: nameEl ? nameEl.scrollWidth > nameEl.clientWidth : null };
    }, LONG);
    console.log(`[D7 긴 이름 ${w}] ${JSON.stringify(r)}`);
    expect(r.titled, '잘린 이름의 전체가 title 로 남아 있지 않다').toBe(true);
    if (capped) expect(r.stickyW, '모바일 고정 열이 너무 넓다').toBeLessThanOrEqual(158);
    else expect(r.playerW, 'PC 플레이어 열이 줄었다(모바일 상한이 PC 로 샜다)').toBeGreaterThan(150);
  });
}

for (const [w, h] of [[390, 844], [360, 780]] as const) {
  test(`🔴 D7 ${w} Shift+Tab 으로 왼쪽 바인 칸에 포커스가 가도 고정 열 밑에 가려지지 않는다`, async ({ page }) => {
    test.setTimeout(90_000);
    await openBoard(page, { vp: { width: w, height: h }, board: { unit: 100_000, buyins: 8, name: LONG } });
    await page.evaluate(() => {
      const t = ([...document.querySelectorAll('[data-tab="my-store"] table')] as HTMLElement[]).find((x) => x.offsetParent)!;
      window.scrollBy(0, t.getBoundingClientRect().top - 120);
      const sc = t.parentElement!; sc.scrollLeft = sc.scrollWidth;
    });
    await page.locator('[data-tab="my-store"] tbody td button[title="+1 바인 · 결제수단 선택"]:visible').first().focus();
    let hidden = 0; const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(450);   // 포커스 스크롤이 부드러운 스크롤이면 정착까지 기다린다
      const v = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || !a.closest('[data-tab="my-store"] tbody')) return null;
        if (a.closest('td')?.classList.contains('sticky')) return { txt: a.textContent?.trim() ?? '', ok: true };
        const b = a.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const by = hit ? `${hit.tagName}.${String((hit as HTMLElement).className).slice(0, 30)}` : 'none';
        return { txt: `${a.textContent?.trim() ?? ''}@${Math.round(b.left)}${hit === a || a.contains(hit) ? '' : `<${by}[${hit ? Math.round((hit as HTMLElement).getBoundingClientRect().left) + '-' + Math.round((hit as HTMLElement).getBoundingClientRect().right) : ''}] w${Math.round(b.width)}`}`, ok: !!hit && (hit === a || a.contains(hit)) };
      });
      if (!v) break;
      seen.push(`${v.txt}:${v.ok ? 'ok' : 'HIDDEN'}`);
      if (!v.ok) hidden++;
    }
    console.log(`[D7 focus ${w}] ${seen.join(' | ')}`);
    expect(seen.length, '포커스가 표 칸으로 가지 않았다 — 잴 것이 없으면 통과가 아니다').toBeGreaterThan(2);
    expect(hidden, '포커스된 바인 칸이 고정 열 밑에 가려졌다').toBe(0);
  });
}

