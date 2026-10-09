// 내 매장 E3 비차단 후속(2026-10-03) 회귀 게이트. 전부 목킹(운영 쓰기 0).
//   원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-mystore-e3-1003.md (L-1 대안 절 · L-2 '7일 카드' 부작용 절)
//
//   R  '순위 미입력' 카드 — 이 기기의 지난 건수만큼 자리를 잡던 방식은 건수가 바뀌면 다시 움직였다
//      (첫 방문 0→1 82px · 1→0 접힘 82px · 3→1 122px). '지금 할 일' 칸(확인 중에 자리를 잡는 칸)의 한 갈래로 옮겼다.
//   T  7일 장부가 없는 매장 — '최근 7일 추세'(171px) 옆 '대회 클락'·'전주 대비'(99px) 아래로 PC 첫 줄에 72px 빈 홈.
//
// 음성 대조: 수정 전 빌드(origin/main 6bfd156f)에서 R(0→1·1→0·3→1)·T(빈 매장 줄 높이) FAIL, 수정 빌드에서 PASS.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const FIRST_DELAY = 4000;   // 대시보드는 '내 매장' 누르기 전 숨은 채 조회를 시작한다 — 누름 뒤까지 안 끝나게
const dayAgo = (n: number) => new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - n * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);

const sess = (date: string, o: Record<string, unknown> = {}) => ({
  venue_id: MOCK_VENUE, session_date: date, game_seq: 1, title: '메인', buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${date}T10:00:00+09:00`, operators: [], reg_closed: true, closed: true, closed_at: `${date}T22:00:00+09:00`,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${date}T01:00:00Z`, clock_snapshot: null, ...o,
});
/** 순위가 빈 마감 포스터 대회 n건(어제부터 하루씩 거슬러). 0건이어도 어제 마감 이력은 있어 '지금 할 일'이 선다('그대로 열기'). */
const pending = (n: number) => Array.from({ length: n }, (_, i) =>
  sess(dayAgo(i + 1), { title: `밀린 메인${i + 1}`, schedule_id: `99999999-9999-4999-8999-${String(i).padStart(12, '0')}` }));

const TODAY_POSTER = {
  id: '99999999-9999-4999-8999-000000000090', title: '오늘 메인 포스터', venue_id: MOCK_VENUE, pub_name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1',
  date: MOCK_DAY, start_time: '19:00:00', duration: '', format: 'tournament', guaranteed: 1_000_000, prize_pool: null, buy_in: { amount: 30_000 }, seats: 40,
  structure: null, description: '', side_events: [], ranking_prizes: [], partners: [], promotions: [], payment_methods: [], rules: [], poster_url: null,
  poster_color: null, display_order: 1, is_premium: false, premium_until: null, owner_id: '00000000-0000-4000-8000-0000000000ee', unread_qna_count: 0,
  approved: true, view_count: 0,
};
async function routeRank(p: Page, n: number) {
  await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
  // 일정은 '조회 성공·오늘 포스터 없음'(P 는 뒤에서 오늘 포스터로 덮는다). 안 걸면 가짜 토큰 401 → 일정 실패 갈래가 섞인다(main CI run 37940996274).
  await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(single(r) ? null : [])) : r.fallback()));
  await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const u = decodeURIComponent(r.request().url());
    await sleep(FIRST_DELAY);
    let rows: unknown[] = [];
    if (/schedule_id=not\.is\.null/.test(u)) rows = pending(n);
    else if (/closed=eq\.true/.test(u) && /session_date=lt\./.test(u)) rows = n ? pending(n).slice(0, 1) : [sess(dayAgo(1), { title: '어제 메인' })];
    return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows)).catch(() => {});
  });
  await p.route(/\/rest\/v1\/ledger_buyins\?/, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    await sleep(FIRST_DELAY);
    return r.fulfill(json([])).catch(() => {});
  });
}

type F = { t: number; badge: string; grid: number | null; todoRes: boolean; todoTitle: string | null; slotH: number; cards: Record<string, [number, number]> };
async function installSampler(page: Page) {
  await page.addInitScript(() => {
    Date.prototype.getHours = function () { return 14; };   // '지금 할 일' 정오 분기 고정
    const w = window as unknown as { __f: F[] }; w.__f = [];
    const tick = () => {
      const pane = document.querySelector<HTMLElement>('[data-pane="dashboard"]');
      const band = pane && [...pane.querySelectorAll<HTMLElement>('button')].find((b) => b.getClientRects().length && (b.querySelector('span > span')?.textContent ?? '').trim() === '오늘 장부');
      if (pane && band) {
        const grid = [...pane.querySelectorAll<HTMLElement>('div.grid.grid-cols-1')].find((g) => g.getClientRects().length) ?? null;
        w.__f.push({
          t: performance.now(),
          badge: (band.querySelector('span > span:nth-child(2)')?.textContent ?? '').trim(),
          grid: grid ? grid.getBoundingClientRect().top + scrollY : null,
          todoRes: !!pane.querySelector('[data-testid="todo-reserve"]'),
          todoTitle: pane.querySelector('[data-testid="todo-cta"]')?.parentElement?.querySelector('p')?.textContent?.trim() ?? null,
          slotH: +((pane.querySelector('[data-testid="todo-reserve"]') ?? pane.querySelector('[data-testid="todo-card"]'))?.getBoundingClientRect().height ?? 0).toFixed(1),
          cards: Object.fromEntries([...pane.querySelectorAll<HTMLElement>('section.card-aura')].filter((s) => s.getClientRects().length)
            .map((s) => { const b = s.getBoundingClientRect(); return [(s.querySelector('button > span')?.textContent ?? '').trim(), [Math.round(b.top + scrollY), +b.height.toFixed(1)]]; })),
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const spanOf = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __f: F[] }).__f);

// ── R: '순위 미입력' — 건수가 바뀌어도(첫 방문·채움·줄어듦) 아래 격자가 움직이지 않는다 ─────────────────
//   prev = 이 기기에 남은 지난 건수(종전 방식이 읽던 localStorage 값 — 수정 뒤엔 읽지 않는다), now = 이번 응답의 건수.
const CASES: { prev: number | null; now: number }[] = [{ prev: null, now: 1 }, { prev: 1, now: 0 }, { prev: 3, now: 1 }, { prev: 1, now: 1 }];
for (const [W, H] of [[1024, 768], [390, 844], [360, 780]] as const) for (const { prev, now } of CASES) {
  test(`R ${W} 지난 ${prev ?? '기록없음'} → 이번 ${now}건 — '순위 미입력'이 정착해도 아래 격자가 그대로다`, async ({ page }) => {
    test.setTimeout(90_000);
    if (prev != null) await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, [`nuri:dash-rank-n:${MOCK_VENUE}`, String(prev)] as [string, string]);
    await installSampler(page);
    await bootOwner(page, { viewport: { width: W, height: H }, goto: false, extra: (p) => routeRank(p, now) });
    await page.goto('/');
    await openMyStore(page);
    const pane = page.locator('[data-pane="dashboard"]');
    if (now > 0) await expect(pane.getByTestId('todo-rank'), '순위 미입력 보조 줄에 닿지 못했다(전제)').toBeVisible({ timeout: 25_000 });
    else await expect(pane.getByTestId('todo-cta'), "0건 — '지금 할 일'(그대로 열기)에 닿지 못했다(전제)").toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1000);
    const f = await frames(page);
    const t0 = (f[0]?.t ?? 0) + 300;   // 누름 직후 셸 자리잡기(입력 면제) 제외 — D1 과 같은 기준
    const fs = f.filter((x) => x.t >= t0);
    const checking = fs.filter((x) => x.badge === '확인 중');
    const settled = fs.filter((x) => x.badge !== '확인 중');
    const grids = fs.map((x) => x.grid).filter((x): x is number => x != null);
    console.log(`[R ${W} ${prev}→${now}] frames=${fs.length} 확인중=${checking.length} 정착=${settled.length} 할일=${settled[settled.length - 1]?.todoTitle} 칸h ${checking[checking.length - 1]?.slotH}→${settled[settled.length - 1]?.slotH} 격자 y폭=${spanOf(grids).toFixed(1)}`);
    expect(checking.length, `'확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
    expect(settled.length, '정착 프레임을 못 봤다 — 빈 검사').toBeGreaterThan(5);
    expect(grids.length, '격자를 못 쟀다 — 빈 검사').toBeGreaterThan(10);
    expect(spanOf(grids), `${W} ${prev}→${now}: 정착에 아래 격자가 움직였다`).toBeLessThanOrEqual(3);
  });
}

test(`R 1024 — 밀린 순위는 오늘 할 일(그대로 열기) 아래 보조 줄로 건수·최근 날짜를 말하고, 누르면 그 대회 순위 입력으로 간다`, async ({ page }) => {
  test.setTimeout(90_000);
  await installSampler(page);
  await bootOwner(page, { viewport: { width: 1024, height: 768 }, goto: false, extra: (p) => routeRank(p, 3) });
  await page.goto('/');
  await openMyStore(page);
  const pane = page.locator('[data-pane="dashboard"]');
  await expect(pane.getByTestId('todo-cta'), '오늘 할 일(그대로 열기)이 주 카드여야 한다').toHaveText('그대로 열기', { timeout: 25_000 });
  const row = pane.getByTestId('todo-rank');
  await expect(row).toContainText(`순위 미입력 3건 · 최근 ${dayAgo(1).slice(5).replace('-', '/')}`);
  await row.getByRole('button', { name: '순위 입력' }).click();
  await expect(page.locator('[data-pane="ranking"]'), '순위 입력 판이 열리지 않았다').toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-pane="ranking"] input[type="date"]').first(), '가장 최근 밀린 대회 날짜로 착지하지 않았다').toHaveValue(dayAgo(1), { timeout: 10_000 });
});

// 리드 판정(review-mystore-followup-1003 FAIL) — 밀린 순위가 오늘 할 일을 가리면 안 된다. 기준 e4e6f660 에서 FAIL(순위만 보임).
for (const [W, H] of [[1440, 900], [390, 844]] as const) {
  test(`P ${W} — 오늘 포스터 + 밀린 순위 1건: '장부 시작하기'와 '순위 입력'이 둘 다 보인다`, async ({ page }) => {
    test.setTimeout(90_000);
    await installSampler(page);
    await bootOwner(page, { viewport: { width: W, height: H }, goto: false, extra: async (p) => {
      await routeRank(p, 1);
      await p.route(/\/rest\/v1\/schedules\?/, (r) => r.request().method() !== 'GET' ? r.fallback()
        : r.fulfill(json(single(r) ? TODAY_POSTER : [TODAY_POSTER])));
    } });
    await page.goto('/');
    await openMyStore(page);
    const pane = page.locator('[data-pane="dashboard"]');
    await expect(pane.getByTestId('todo-cta'), "오늘 포스터 할 일('장부 시작하기')이 사라졌다").toHaveText('장부 시작하기', { timeout: 25_000 });
    await expect(pane.getByTestId('todo-rank').getByRole('button', { name: '순위 입력' }), '밀린 순위 보조 줄이 없다').toBeVisible();
    await page.waitForTimeout(1000);
    const f = await frames(page);
    const t0 = (f[0]?.t ?? 0) + 300;
    const grids = f.filter((x) => x.t >= t0).map((x) => x.grid).filter((x): x is number => x != null);
    console.log(`[P ${W}] 격자 y폭=${spanOf(grids).toFixed(1)}`);
    expect(grids.length, '격자를 못 쟀다 — 빈 검사').toBeGreaterThan(10);
    expect(spanOf(grids), `${W}: 정착에 아래 격자가 움직였다`).toBeLessThanOrEqual(3);
  });
}

// ── T: 7일 장부가 없는 매장 — PC 첫 줄 카드가 같은 높이로 서고, 정착에 아무 카드도 움직이지 않는다 ─────────
for (const [W, H] of [[1440, 900], [1280, 900], [1024, 768]] as const) {
  test(`T ${W} — 7일 장부 없는 매장: '최근 7일 추세' 줄의 카드 높이가 같고 정착 이동이 없다`, async ({ page }) => {
    test.setTimeout(90_000);
    await installSampler(page);
    await bootOwner(page, { viewport: { width: W, height: H }, goto: false, extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => { if (r.request().method() !== 'GET') return r.fallback(); await sleep(FIRST_DELAY); return r.fulfill(json(single(r) ? null : [])).catch(() => {}); });
      await p.route(/\/rest\/v1\/ledger_buyins\?/, async (r) => { if (r.request().method() !== 'GET') return r.fallback(); await sleep(FIRST_DELAY); return r.fulfill(json([])).catch(() => {}); });
    } });
    await page.goto('/');
    await openMyStore(page);
    const pane = page.locator('[data-pane="dashboard"]');
    await expect(pane.getByText('최근 7일 장부 데이터가 없습니다.'), '빈 상태에 닿지 못했다(전제)').toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1000);
    const f = await frames(page);
    const t0 = (f[0]?.t ?? 0) + 300;
    const fs = f.filter((x) => x.t >= t0);
    const last = fs[fs.length - 1]?.cards ?? {};
    const trend = last['최근 7일 추세'];
    expect(trend, "'최근 7일 추세' 카드를 못 찾았다 — 빈 검사").toBeTruthy();
    const row = Object.entries(last).filter(([, [top]]) => Math.abs(top - trend[0]) <= 1);
    const hs = row.map(([, [, h]]) => h);
    console.log(`[T ${W}] frames=${fs.length} 줄=${row.map(([k, [, h]]) => `${k}:${h}`).join(' ')}`);
    expect(row.length, '같은 줄 이웃 카드가 없다 — PC 격자 전제가 깨졌다').toBeGreaterThan(1);
    expect(spanOf(hs), `${W}: 같은 줄 카드 높이가 다르다(빈 홈)`).toBeLessThanOrEqual(1);
    // 화면 안 카드는 확인 중 → 정착 동안 윗변이 그대로다
    const chk = fs.filter((x) => x.badge === '확인 중');
    expect(chk.length, `'확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
    const titles = Object.keys(chk[chk.length - 1].cards).filter((k) => k && chk[chk.length - 1].cards[k][0] < H);
    expect(titles.length, '화면 안 카드를 못 쟀다 — 빈 검사').toBeGreaterThan(0);
    for (const k of titles) expect(spanOf(fs.map((x) => x.cards[k]?.[0]).filter((v): v is number => v != null)), `${W}: '${k}' 가 정착에 움직였다`).toBeLessThanOrEqual(3);
  });
}

// 리드 판정 2 — 데이터 있는 매장은 확인 중에도 이웃을 늘리지 않는다(종전 e4e6f660: 171 로 늘었다가 정착에 98.7/121 로 줄었다).
for (const [W, H] of [[1440, 900], [1280, 900]] as const) {
  test(`T ${W} 데이터 매장 — 확인 중 → 정착에 '대회 클락'·'전주 대비' 높이가 크게 변하지 않는다(늘렸다 줄이기 없음)`, async ({ page }) => {
    test.setTimeout(90_000);
    await installSampler(page);
    const s0 = sess(MOCK_DAY, { closed: false, reg_closed: false, closed_at: null });
    const buys = Array.from({ length: 5 }, (_, i) => ({
      id: `eeeeeeee-0002-4000-8000-${String(i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, player_name: `손님${i}`, entry_no: 1,
      payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T11:00:00+09:00`, is_split: false,
      cash_amount: 30_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
    }));
    await bootOwner(page, { viewport: { width: W, height: H }, goto: false, extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = decodeURIComponent(r.request().url());
        await sleep(FIRST_DELAY);
        const rows = u.includes(`session_date=eq.${MOCK_DAY}`) || /session_date=gte?\./.test(u) ? [s0] : [];
        return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows)).catch(() => {});
      });
      await p.route(/\/rest\/v1\/ledger_buyins\?/, async (r) => { if (r.request().method() !== 'GET') return r.fallback(); await sleep(FIRST_DELAY); return r.fulfill(json(buys)).catch(() => {}); });
    } });
    await page.goto('/');
    await openMyStore(page);
    const pane = page.locator('[data-pane="dashboard"]');
    await expect(pane.getByText('7일 합계'), '7일 데이터 정착에 닿지 못했다(전제)').toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(800);
    const f = await frames(page);
    const t0 = (f[0]?.t ?? 0) + 300;
    const fs = f.filter((x) => x.t >= t0);
    expect(fs.filter((x) => x.badge === '확인 중').length, `'확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
    for (const k of ['대회 클락', '전주 대비']) {
      const hs = fs.map((x) => x.cards[k]?.[1]).filter((v): v is number => v != null);
      console.log(`[T ${W} data] ${k} 높이 ${Math.min(...hs)}~${Math.max(...hs)}`);
      expect(hs.length, `'${k}' 를 못 쟀다 — 빈 검사`).toBeGreaterThan(10);
      expect(spanOf(hs), `${W}: '${k}' 가 확인 중에 늘었다가 정착에 줄었다`).toBeLessThanOrEqual(15);
    }
  });
}

// ── S: 청크 분리(매장 페이지·게임 프리셋·위험 구역 지연 청크) — 여는 동작·폴백 경계 불변 ─────────────────
async function sideClick(page: Page, label: string) {
  const at = await page.evaluate((l) => {
    const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')]
      .find((e) => e.getClientRects().length && (e.innerText || '').replace(/\s+/g, ' ').trim().startsWith(l));
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  expect(at, `사이드바 '${label}' 없음 — 측정이 비면 거짓 통과다`).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
}
const SETTINGS: [string, string, RegExp][] = [
  ['page', '매장 페이지', /매장 페이지 탭 순서/], ['presets', '게임 프리셋', /빈 폼으로 만들기/], ['danger', '위험 구역', /위험 구역 · 매장 전체 초기화/],
];
/** 지연 판의 지역 Suspense 폴백(VenueManageTab LazyBox) — 판 자체의 데이터 로딩 줄(py-6·py-10)과 가른다. */
const LAZY_FALLBACK = 'p.py-16[aria-busy="true"]';
test(`S 1280 — 대시보드에서 곧장 '매장 설정' 하위탭 3종(지연 청크)을 열어도 '불러오는 중…' 없이 그려진다`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript((sel) => {
    const w = window as unknown as { __busy: number; __busyAt: string[] }; w.__busy = 0; w.__busyAt = [];
    new MutationObserver(() => {
      const hit = [...document.querySelectorAll(`[data-pane] ${sel}`)].find((e) => (e.textContent ?? '').includes('불러오는 중'));
      if (hit) { w.__busy++; w.__busyAt.push(`${hit.closest('[data-pane]')?.getAttribute('data-pane')}@${Math.round(performance.now())}`); }
    }).observe(document, { subtree: true, childList: true });
  }, LAZY_FALLBACK);
  await bootOwner(page, { viewport: { width: 1280, height: 900 } });
  await openMyStore(page);
  await expect(page.locator('[data-pane="dashboard"]')).toBeVisible({ timeout: 15_000 });
  await sideClick(page, '매장 설정');
  for (const [id, label, text] of SETTINGS) {
    await page.locator(`[data-mystore-rail] [data-tab-id="${id}"]`).click();
    await expect(page.locator(`[data-pane="${id}"]`).getByText(text).first(), `'${label}' 본문이 그려지지 않았다`).toBeVisible({ timeout: 10_000 });
  }
  // 다시 대시보드 → 매장 설정(keep-alive: 마지막 하위탭이 그대로, 다시 받지 않는다)
  await sideClick(page, '대시보드');
  await sideClick(page, '매장 설정');
  await expect(page.locator('[data-pane="danger"]').getByText(/위험 구역 · 매장 전체 초기화/).first(), '재방문에 마지막 하위탭이 유지되지 않았다').toBeVisible();
  const busy = await page.evaluate(() => (window as unknown as { __busyAt: string[] }).__busyAt);
  console.log(`[S] 지역 폴백 ${busy.length} ${busy.join(' ')}`);
  expect(busy, "지연 판이 '불러오는 중…' 폴백을 보였다").toEqual([]);
});

test.describe('지연 청크', () => {
// 서비스 워커가 청크 요청을 처리하면 page.route 가 못 본다(실측: 가로챈 요청 0) — 이 묶음만 SW 를 끈다.
test.use({ serviceWorkers: 'block' });
test(`S 1280 — 청크가 늦게 와도 폴백은 그 판 안에서만 선다(사이드바·셸은 그대로)`, async ({ page }) => {
  test.setTimeout(90_000);
  let delayed = 0;
  // extra 는 bootOwner 의 기본 라우트보다 우선한다.
  await bootOwner(page, { viewport: { width: 1280, height: 900 }, extra: async (p) => { await p.route(/\/assets\/VenueCustomizePanel-[^/]+\.js$/, async (r) => { delayed++; await sleep(8000); return r.continue().catch(() => {}); }); } });
  await openMyStore(page);
  await expect(page.locator('[data-pane="dashboard"]')).toBeVisible({ timeout: 15_000 });
  // 청크가 오는 동안 매 프레임 사이드바가 보이는지 센다 — 전환은 startTransition 이라 이전 판을 쥐고 있거나 판 안 LazyBox 폴백이 선다.
  //   어느 쪽이든 셸(사이드바)이 사라지면 안 된다(App 최상위 폴백이 my-store 전체를 덮던 S6-2 부류).
  await page.evaluate(() => {
    const w = window as unknown as { __side: boolean[] }; w.__side = [];
    const t0 = performance.now();
    const tick = () => { w.__side.push(!!document.querySelector('[data-mystore-secbar]')?.getClientRects().length); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await sideClick(page, '매장 설정');
  const pane = page.locator('[data-pane="page"]');
  await page.waitForTimeout(2600);
  const side = await page.evaluate(() => (window as unknown as { __side: boolean[] }).__side);
  console.log(`[S slow] frames=${side.length} 사이드바 안 보인 프레임=${side.filter((v) => !v).length} 본문 이미 있음=${await pane.getByText(/매장 페이지 탭 순서/).count()}`);
  expect(side.length, '프레임을 못 쟀다 — 빈 검사').toBeGreaterThan(30);
  expect(delayed, '지연 청크 요청을 가로채지 못했다 — 빈 검사').toBeGreaterThan(0);
  expect(await pane.getByText(/매장 페이지 탭 순서/).count(), '청크가 이미 와 있었다 — 늦은 청크 경로를 재지 못했다(빈 검사)').toBe(0);
  expect(side.filter((v) => !v).length, '청크 대기 중 셸(사이드바)이 사라졌다').toBe(0);
  await expect(pane.getByText(/매장 페이지 탭 순서/).first(), '청크가 온 뒤 본문이 그려지지 않았다').toBeVisible({ timeout: 15_000 });
});
});
