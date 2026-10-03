// 내 매장 E3(2026-10-03) 회귀 게이트. 전부 목킹(운영 쓰기 0).
//   원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\E3-screens-1003.md (M-1 · L-1 · L-2 · L-4 · L-8)
//
//   M-1  PC 에서 대시보드·게임 진행 ↔ 그 밖의 메뉴를 오갈 때 사이드바·판이 통째로 ±69px 움직였다
//        (인증 등급 배너가 레일 메뉴에선 판 안, 그 밖에선 셸 위에 그려졌다).
//   L-1  '순위 미입력' 카드가 확인 중엔 없다가 정착 순간 생겨 1280 미만에서 아래 격자를 82px 밀었다.
//   L-2  '클락 켜기' 할 일 — 자리표시와 실제 카드의 높이 차로 아래가 밀렸다(390 21px · 1440 하단 카드 63px).
//   L-4  이용권 레일이 없는 매장의 장부 정산바가 판이 아니라 화면 가운데(72rem)에 섰다.
//   L-8  1024 운영 도구 카드 설명 끝 줄에 '수' 한 글자만 남았다.
//
// 음성 대조: 수정 전 빌드(origin/main b923842c)에서 각 항목 FAIL, 수정 빌드에서 PASS.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const FIRST_DELAY = 4000;   // 대시보드는 '내 매장' 누르기 전 숨은 채 조회를 시작한다 — 누름 뒤까지 안 끝나게
const YDAY = new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
const SCHED = '99999999-9999-4999-8999-999999999999';

const sess = (date: string, o: Record<string, unknown> = {}) => ({
  venue_id: MOCK_VENUE, session_date: date, game_seq: 1, title: '메인', buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${date}T10:00:00+09:00`, operators: [], reg_closed: false, closed: false, closed_at: null,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${date}T01:00:00Z`, clock_snapshot: null, ...o,
});
/** 어제 포스터 대회를 마감했고 순위가 없다 → '순위 미입력' 카드 + '지난 게임 그대로 열기' 할 일. */
const yClosed = sess(YDAY, { title: '어제 메인', closed: true, reg_closed: true, closed_at: `${YDAY}T22:00:00+09:00`, schedule_id: SCHED });
/** 오늘 장부 진행 중(바인 37 · 클락 없음) → '클락 켜기' 할 일. */
const today = sess(MOCK_DAY);
const buyins = Array.from({ length: 37 }, (_, i) => ({
  id: `eeeeeeee-0001-4000-8000-${String(i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, player_name: `손님${i}`, entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T11:00:00+09:00`, is_split: false,
  cash_amount: 30_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
}));

type World = 'rank' | 'live';
/** ledger_sessions·ledger_buyins — 세계별 응답. delay 면 대시보드 조회가 '내 매장' 누름 뒤에 끝나게 늦춘다. */
async function routeWorld(p: Page, w: World, delay: number) {
  await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
  await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const u = decodeURIComponent(r.request().url());
    if (delay) await sleep(delay);
    let rows: unknown[] = [];
    if (w === 'rank') {
      if (/schedule_id=not\.is\.null/.test(u) || (/closed=eq\.true/.test(u) && /session_date=lt\./.test(u))) rows = [yClosed];
    } else if (u.includes(`session_date=eq.${MOCK_DAY}`) || /session_date=gte?\./.test(u)) rows = [today];
    return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows)).catch(() => {});
  });
  await p.route(/\/rest\/v1\/ledger_buyins\?/, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const u = decodeURIComponent(r.request().url());
    if (delay) await sleep(delay);
    return r.fulfill(json(w === 'live' && u.includes(MOCK_DAY) ? buyins : [])).catch(() => {});
  });
}

// ── 대시보드 정착 이동(L-1 · L-2) ────────────────────────────────────────────────────────────────
type DF = { t: number; badge: string; grid: number | null; cards: Record<string, number>; vh: number; rank: boolean; rankRes: boolean; todo: string | null };
async function installDashSampler(page: Page) {
  await page.addInitScript(() => {
    Date.prototype.getHours = function () { return 14; };   // '지금 할 일' 정오 분기 고정
    const w = window as unknown as { __f: DF[] }; w.__f = [];
    const tick = () => {
      const pane = document.querySelector<HTMLElement>('[data-pane="dashboard"]');
      const band = pane && [...pane.querySelectorAll<HTMLElement>('button')].find((b) => b.getClientRects().length && (b.querySelector('span > span')?.textContent ?? '').trim() === '오늘 장부');
      if (pane && band) {
        const grid = [...pane.querySelectorAll<HTMLElement>('div.grid.grid-cols-1')].find((g) => g.getClientRects().length) ?? null;
        w.__f.push({
          t: performance.now(),
          badge: (band.querySelector('span > span:nth-child(2)')?.textContent ?? '').trim(),
          grid: grid ? grid.getBoundingClientRect().top + scrollY : null,
          // 하단 카드(DashCard) — 제목으로 짚어 같은 카드끼리 비교한다(확인 중과 정착 뒤 카드 수가 달라 순번으로는 못 맞춘다)
          cards: Object.fromEntries([...pane.querySelectorAll<HTMLElement>('section.card-aura')].filter((s) => s.getClientRects().length)
            .map((s) => [(s.querySelector('button > span')?.textContent ?? '').trim(), Math.round(s.getBoundingClientRect().top + scrollY)])),
          vh: innerHeight,
          rank: [...pane.querySelectorAll('button, section')].some((e) => /순위 미입력/.test(e.textContent ?? '') && e.getClientRects().length > 0),
          rankRes: !!pane.querySelector('[data-testid="rank-reserve"]'),
          todo: pane.querySelector('[data-testid="todo-cta"]')?.textContent?.trim() ?? null,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
type DFn = DF;

function spanOf(xs: number[]) { return xs.length ? Math.max(...xs) - Math.min(...xs) : 0; }

for (const [W, H] of [[1024, 768], [390, 844], [360, 780]] as const) {
  test(`L-1 ${W} — 다시 연 대시보드: '순위 미입력' 카드가 정착하며 아래 격자를 밀지 않는다`, async ({ page }) => {
    test.setTimeout(90_000);
    // 지난번 방문에서 이 매장의 순위 미입력 1건을 봤다(이 기기 기록) — 업주가 매일 여는 실제 경로.
    //   처음 보는 매장(기록 없음)은 몇 건인지 몰라 예약하지 않는다(0건 매장의 반대 방향 이동을 만들지 않게 — D1 게이트가 지킨다).
    await page.addInitScript((k) => { try { localStorage.setItem(k, '1'); } catch { /* */ } }, `nuri:dash-rank-n:${MOCK_VENUE}`);
    await installDashSampler(page);
    await bootOwner(page, { viewport: { width: W, height: H }, goto: false, extra: (p) => routeWorld(p, 'rank', FIRST_DELAY) });
    await page.goto('/');
    await openMyStore(page);
    await expect(page.locator('[data-pane="dashboard"]').getByText(/순위 미입력/).first(), '순위 미입력 카드에 닿지 못했다(전제)').toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1000);
    const f = await page.evaluate(() => (window as unknown as { __f: DFn[] }).__f);
    const t0 = (f[0]?.t ?? 0) + 300;   // 누름 직후 셸 자리잡기(입력 면제) 제외 — D1 과 같은 기준
    const checking = f.filter((x) => x.t >= t0 && x.badge === '확인 중');
    const settled = f.filter((x) => x.t >= t0 && x.rank);
    const grids = f.filter((x) => x.t >= t0).map((x) => x.grid).filter((x): x is number => x != null);
    console.log(`[L-1 ${W}] frames=${f.length} 확인중=${checking.length}(예약 ${checking.filter((x) => x.rankRes).length}) 정착=${settled.length} 격자 y폭=${spanOf(grids).toFixed(1)}`);
    expect(checking.length, `'확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
    expect(settled.length, `'순위 미입력' 정착 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
    expect(checking.filter((x) => x.rankRes).length, `${W}: 확인 중에 '순위 미입력' 자리를 예약하지 않았다`).toBeGreaterThan(5);
    expect(grids.length, '격자를 못 쟀다 — 빈 검사').toBeGreaterThan(10);
    expect(spanOf(grids), `${W}: '순위 미입력' 정착에 아래 격자가 움직였다`).toBeLessThanOrEqual(3);
  });
}

for (const [W, H] of [[390, 844], [1440, 900]] as const) {
  test(`L-2 ${W} — '클락 켜기' 할 일이 정착하며 아래(격자·하단 카드)를 밀지 않는다`, async ({ page }) => {
    test.setTimeout(90_000);
    await installDashSampler(page);
    await bootOwner(page, { viewport: { width: W, height: H }, goto: false, extra: (p) => routeWorld(p, 'live', FIRST_DELAY) });
    await page.goto('/');
    await openMyStore(page);
    await expect(page.locator('[data-pane="dashboard"] [data-testid="todo-cta"]').filter({ hasText: '클락 켜기' }), "'클락 켜기'에 닿지 못했다(전제)").toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1500);
    const f = await page.evaluate(() => (window as unknown as { __f: DFn[] }).__f);
    const t0 = (f[0]?.t ?? 0) + 300;
    const fs = f.filter((x) => x.t >= t0);
    const grids = fs.map((x) => x.grid).filter((x): x is number => x != null);
    // 확인 중에 이미 화면 안(윗변 < 뷰포트 높이)에 서 있던 카드만 — 화면 밖 카드의 이동은 사용자가 보지 못한다(CLS 도 세지 않는다)
    const chk = fs.filter((x) => x.badge === '확인 중');
    const first = chk[chk.length - 1]?.cards ?? {};
    const titles = Object.keys(first).filter((k) => k && first[k] < (chk[0]?.vh ?? 0));
    const spans = titles.map((k) => [k, spanOf(fs.map((x) => x.cards[k]).filter((v): v is number => v != null))] as const);
    console.log(`[L-2 ${W}] frames=${fs.length} 확인중=${chk.length} 격자 y폭=${spanOf(grids).toFixed(1)} 카드 y폭=${spans.map(([k, s]) => `${k}:${s}`).join(' ')}`);
    expect(chk.length, `'확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
    expect(grids.length, '격자를 못 쟀다 — 빈 검사').toBeGreaterThan(10);
    expect(spanOf(grids), `${W}: '클락 켜기' 정착에 아래 격자가 움직였다`).toBeLessThanOrEqual(3);
    expect(spans.length, '화면 안 하단 카드를 못 쟀다 — 빈 검사').toBeGreaterThan(0);
    for (const [k, s] of spans) expect(s, `${W}: 하단 카드 '${k}' 가 정착에 움직였다`).toBeLessThanOrEqual(3);
  });
}

// ── M-1 사이드바·판이 메뉴 이동에 움직이지 않는다 ──────────────────────────────────────────────────
async function side(page: Page, label: string) {
  const at = await page.evaluate((l) => {
    const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')]
      .find((e) => e.getClientRects().length && (e.innerText || '').replace(/\s+/g, ' ').trim().startsWith(l));
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  expect(at, `사이드바 '${label}' 없음 — 측정이 비면 거짓 통과다`).not.toBeNull();
  await page.mouse.move(at!.x, at!.y); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
}

for (const [W, H] of [[1024, 768], [1440, 900], [1920, 1080]] as const) {
  test(`M-1 ${W} — 대시보드·게임 진행 ↔ 다른 메뉴 이동에 사이드바·판 윗변이 그대로다(등급 배너는 판 안)`, async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, { viewport: { width: W, height: H } });
    await openMyStore(page);
    await expect(page.locator('[data-mystore-secbar]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-pane="dashboard"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const geo = () => page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('[data-mystore-secbar]')!.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>('[data-mystore-secpanel]')!.getBoundingClientRect();
      return { bar: Math.round(bar.top + scrollY), panel: Math.round(panel.top + scrollY) };
    });
    const ref = await geo();
    const route = ['내 캘린더', '대시보드', '매장 설정', '게임 진행', '직원 관리', '대시보드'];
    const bad: string[] = [];
    let grades = 0;
    for (const to of route) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
      // 누른 뒤 600ms 동안 매 프레임 사이드바 윗변을 잰다(셸이 손 밑에서 움직이면 다음 클릭이 다른 메뉴로 간다)
      await page.evaluate(() => {
        const w = window as unknown as { __m: number[] }; w.__m = []; const t0 = performance.now();
        const tick = () => { const b = document.querySelector('[data-mystore-secbar]'); if (b) w.__m.push(Math.round(b.getBoundingClientRect().top + scrollY)); if (performance.now() - t0 < 900) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await side(page, to);
      await page.waitForTimeout(1200);
      const ms = await page.evaluate(() => (window as unknown as { __m: number[] }).__m);
      const g = await geo();
      if (ms.length < 10) bad.push(`${to}: 프레임 ${ms.length}개 — 빈 검사`);
      const dev = Math.max(...ms.map((y) => Math.abs(y - ref.bar)));
      if (dev > 1) bad.push(`${to}: 사이드바 ${dev}px 움직임`);
      if (Math.abs(g.panel - ref.panel) > 1) bad.push(`${to}: 판 윗변 ${g.panel - ref.panel}px`);
      // 기능 보존 — 등급 배너(목 매장 = 인증 매장)는 지우지 않고 판 안에 있다. 레일 밖 메뉴에서 확인한다.
      if (to === '내 캘린더' || to === '매장 설정' || to === '직원 관리') {
        const where = await page.evaluate(() => {
          const el = [...document.querySelectorAll<HTMLElement>('p')].find((p) => p.textContent?.trim() === '인증 매장' && p.getClientRects().length);
          return el ? (el.closest('[data-mystore-secpanel]') ? 'panel' : 'shell') : 'none';
        });
        if (where !== 'panel') bad.push(`${to}: 인증 등급 배너 위치 ${where}`); else grades += 1;
      }
    }
    console.log(`[M-1 ${W}] ref bar=${ref.bar} panel=${ref.panel} 배너 판 안=${grades}/3 ${bad.join(' / ')}`);
    expect(bad, bad.join(' / ')).toEqual([]);
  });
}

// ── L-4 이용권 레일 없는 장부 — 정산바가 판에 맞는다 ──────────────────────────────────────────────
for (const [W, H] of [[1440, 900], [1920, 1080]] as const) {
  test(`L-4 ${W} — 이용권 권한 없는 매장: 장부 정산바 좌우가 장부 판과 같다`, async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page, { viewport: { width: W, height: H }, perms: { can_view_vouchers: false }, extra: (p) => routeWorld(p, 'live', 0) });
    await openMyStore(page);
    await expect(page.locator('[data-mystore-secbar]')).toBeVisible({ timeout: 20_000 });
    await side(page, '게임 진행');
    await page.locator('[data-main-enter] [role="tab"]:visible').filter({ hasText: '장부' }).first().click();
    const bar = page.locator('[data-ledger-settlebar]');
    await expect(bar, '정산바가 없다(전제)').toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    const g = await page.evaluate(() => {
      const ws = document.querySelector<HTMLElement>('[data-ledger-workspace]')!;
      const b = document.querySelector<HTMLElement>('[data-ledger-settlebar]')!.getBoundingClientRect();
      const col = (ws.firstElementChild as HTMLElement).getBoundingClientRect();
      return { mode: ws.dataset.ledgerWorkspace, bl: Math.round(b.left), br: Math.round(b.right), cl: Math.round(col.left), cr: Math.round(col.right) };
    });
    console.log(`[L-4 ${W}] ${JSON.stringify(g)}`);
    expect(g.mode, '이용권 레일이 없는 장부여야 한다(전제)').toBe('below');
    expect(g.cr - g.cl, '판 폭을 못 쟀다 — 빈 검사').toBeGreaterThan(300);
    expect(Math.abs(g.bl - g.cl), `${W}: 정산바 왼쪽(${g.bl})이 판 왼쪽(${g.cl})과 다르다`).toBeLessThanOrEqual(1);
    expect(Math.abs(g.br - g.cr), `${W}: 정산바 오른쪽(${g.br})이 판 오른쪽(${g.cr})과 다르다`).toBeLessThanOrEqual(1);
  });
}

// ── L-8 1024 운영 도구 설명 끝 줄 한 글자 ─────────────────────────────────────────────────────────
test(`L-8 1024 — 운영 도구 카드 설명이 끝 줄 한 글자로 끝나지 않는다`, async ({ page }) => {
  test.setTimeout(90_000);
  await bootOwner(page, { viewport: { width: 1024, height: 768 } });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-secbar]')).toBeVisible({ timeout: 20_000 });
  await side(page, '매장 설정');
  await page.getByRole('tab', { name: '운영 도구' }).click();
  await expect(page.getByText('칩 분배기', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const lines = await page.evaluate(() => {
    const out: { name: string; last: string; lines: number }[] = [];
    for (const btn of document.querySelectorAll<HTMLElement>('[data-pane="optools"] button')) {
      const spans = btn.querySelectorAll<HTMLElement>(':scope > span:last-child > span');
      if (spans.length < 2 || !btn.getClientRects().length) continue;
      const desc = spans[1]; const tn = desc.firstChild; if (!tn || tn.nodeType !== 3) continue;
      const text = tn.textContent ?? '';
      const rows: { top: number; s: string }[] = [];
      for (let i = 0; i < text.length; i++) {
        const rg = document.createRange(); rg.setStart(tn, i); rg.setEnd(tn, i + 1);
        const r = rg.getClientRects()[0]; if (!r) continue;
        const row = rows.find((x) => Math.abs(x.top - r.top) < r.height / 2);
        if (row) row.s += text[i]; else rows.push({ top: r.top, s: text[i] });
      }
      out.push({ name: spans[0].textContent ?? '', last: (rows[rows.length - 1]?.s ?? '').trim(), lines: rows.length });
    }
    return out;
  });
  console.log(`[L-8] ${JSON.stringify(lines)}`);
  expect(lines.length, '운영 도구 카드를 못 쟀다 — 빈 검사').toBeGreaterThanOrEqual(5);
  const orphan = lines.filter((l) => l.lines > 1 && [...l.last].length < 2);
  expect(orphan, `끝 줄 한 글자: ${JSON.stringify(orphan)}`).toEqual([]);
});
