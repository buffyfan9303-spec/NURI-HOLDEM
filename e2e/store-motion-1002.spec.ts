// PC 내 매장 화면 튐·스크롤 — 2026-10-02 실측 점검(audit-motion-1002) FAIL 3건 + 내 매장 경미 2건의 회귀 게이트.
//
//   F-1 장부 긴 목록: 표 안쪽 스크롤 상자(70vh)의 절반이 화면 밖·정산 바 밑인데 휠은 그 상자가 먼저 먹었다.
//       → 상자가 화면(헤더 밑 ~ 정산 바 위)에 다 들어오기 전에는 페이지가 먼저 움직이고, 상자 높이는 그 칸에 맞춘다.
//   F-2 정산 첫 진입: 판 높이 예약이 700ms 상한에서 먼저 풀려 로딩 중에 문서가 3326→981 로 무너졌다.
//       → 예약은 '로딩 완료'(판 안 스켈레톤·aria-busy 0 + 높이 정지)로만 푼다.
//   F-3 클락 첫 진입: 게임 슬롯 바가 데이터 전에 null 이라 뒤늦게 끼어들어 설정 폼을 103px 밀었다.
//       → 로딩 중에는 같은 높이의 자리표시를 그린다.
//   M-5 짧은 판(출근 관리)으로 갈 때 정렬 뒤 클램프가 한 번 더 일어나 2단으로 튀었다 → 판 바닥(화면 높이) 예약.
//   M-6 프리셋 '수정'을 600 에서 열면 편집 폼 머리가 화면 위로 잘려 시작했다 → 열 때 폼 머리로 정렬, 닫으면 원위치.
//
// 누름은 전부 page.evaluate(el.click()) — locator.click 의 자동 스크롤이 측정을 오염시킨다(CLAUDE.md 참고 메모).
// 운영 쓰기 0: 읽기(GET)만 목으로 답하고 쓰기는 _fixtures 가드로 흘린다.
// 음성 대조(2026-10-02 실측): d2d67e0f(이 수정 직전) 빌드에서 15건 중 14건 실패 — F-1 2폭 · F-2 정산 400/900 · 장부 150/400/900 ·
//   F-3 4건 · M-5 · M-6 2폭. 통과한 1건(F-2 정산 150ms)은 감사의 대조군과 같다(응답이 700ms 상한 안에 오면 원래도 안 무너졌다).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const STEP = '[role=tablist][aria-label="매장 단계 이동"] [role=tab]';
const SIDE = '[data-mystore-secbar] button';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const NAMES = ['김철수', '이영희', '박민수', '최지훈', '정다은', '강호동', '윤서연', '장민재', '임하늘', '한지민', '오세훈', '서지우', '신동엽', '권나라', '황보름', '안재현', '송가인', '류현진', '조은비', '배수지'];
const sess = { id: 'aaaaaaaa-0000-4000-8000-000000000001', venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, title: '데일리 메인', buyin_amount: 100000, card_amount: null, game_type: 'gtd', target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false, closed_at: null, created_at: new Date().toISOString() };
const buyins = Array.from({ length: 60 }, (_, i) => ({
  id: `cccccccc-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
  player_name: NAMES[i % NAMES.length] + (i >= 20 ? String(Math.floor(i / 20)) : ''), entry_no: 1, payment_method: 'cash', is_unpaid: false,
  buyin_at: `${MOCK_DAY}T${String(10 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`, is_split: false,
  cash_amount: 100000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
}));
const players = Array.from({ length: 40 }, (_, i) => ({ id: `dddddddd-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, name: NAMES[i % NAMES.length] + (i >= 20 ? '1' : ''), visitor_type: i % 3 ? 'regular' : 'new', note: null, sort_order: i }));
const ranks = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, venue_id: MOCK_VENUE, ranking_date: MOCK_DAY, position: i + 1, nickname: `플레이어${i + 1}`, real_name: null, prize: null, event_name: '데일리 메인', optin_real_name: null }));
const presets = Array.from({ length: 12 }, (_, i) => ({ id: `pppppppp-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, name: `프리셋 ${i + 1}`, data: { title: `데일리 대회 ${i + 1}`, gameType: '프리즈아웃', buyInWon: 60000, startStack: 30000, prizeType: 'GTD', prizeAmountWon: 1000000, duration: '20분' }, updated_at: new Date(Date.now() - i * 86400e3).toISOString() }));

/** 목킹 업주 + 긴 장부·순위·프리셋. 모든 읽기 응답을 delay ms 늦춘다(목 응답 지연 — 느린 망·서버 흉내). */
async function boot(page: Page, vp: { width: number; height: number }, delay: number) {
  const later = () => new Promise((z) => setTimeout(z, delay));
  // 포괄 목(먼저 건 = 가장 낮은 우선순위): 나머지 읽기는 빈 응답. 쓰기는 가드로 흘린다.
  await page.route(/supabase\.co\/rest\/v1\//, async (r) => {
    if (r.request().url().includes('/rest/v1/rpc/')) { await later(); return r.fulfill(json(null)); }
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') return r.fallback();
    await later();
    return r.fulfill(json(single(r) ? null : []));
  });
  await page.routeWebSocket(/realtime/, () => { /* 연결하지 않는다 */ });
  await bootOwner(page, {
    viewport: vp,
    extra: async (p) => {
      const slow = (body: unknown) => async (r: Route) => { if (r.request().method() !== 'GET') return r.fallback(); await later(); return r.fulfill(json(body)); };
      await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => { if (r.request().method() !== 'GET') return r.fallback(); await later(); return r.fulfill(json(single(r) ? sess : [sess])); });
      await p.route(/\/rest\/v1\/ledger_buyins\?/, slow(buyins));
      await p.route(/\/rest\/v1\/ledger_players\?/, slow(players));
      await p.route(/\/rest\/v1\/rpc\/venue_rankings_public/, async (r) => { await later(); return r.fulfill(json(ranks)); });
      await p.route(/\/rest\/v1\/venue_rankings\?/, slow([{ ranking_date: MOCK_DAY }]));
      await p.route(/\/rest\/v1\/game_presets\?/, slow(presets));
    },
  });
  await openMyStore(page);
  await page.waitForSelector('[data-mystore-secpanel]', { timeout: 20_000 });
  await page.waitForTimeout(1500 + delay * 3);
  await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => /고급 기능 모두 보기/.test(x.textContent ?? ''))?.click(); });
  await page.waitForTimeout(300);
}

/** 보이는 버튼 중 텍스트가 맞는 것을 누른다(자동 스크롤 없이). */
async function press(page: Page, sel: string, re: RegExp) {
  const ok = await page.evaluate(([s, src]) => {
    const rx = new RegExp(src);
    const b = [...document.querySelectorAll<HTMLElement>(s)].find((x) => x.offsetParent !== null && rx.test((x.textContent ?? '').trim()));
    b?.click();
    return !!b;
  }, [sel, re.source] as const);
  expect(ok, `누를 대상이 없다: ${sel} ${re}`).toBe(true);
}

/** 헤더(+GNB) 밑변 — 앱이 실측해 두는 --stack-top 을 고정 요소로 읽는다(단위 무관). */
const HEAD_BOTTOM = `(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:var(--stack-top,97px);left:0;width:1px;height:1px;pointer-events:none'; document.body.appendChild(d); const v = d.getBoundingClientRect().top; d.remove(); return v; })()`;

// ── F-1 ─────────────────────────────────────────────────────────────────────
for (const vp of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
  test(`F-1 장부 긴 목록 — 휠은 상자가 화면에 다 들어온 뒤에만 표를 굴리고, 마지막 행은 정산 바에 안 가린다 ${vp.width}`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, vp, 150);
    await press(page, STEP, /장부/);
    await page.waitForTimeout(2000);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(200);
    // 표 상자 = '1바인' 머리칸이 든 표의 부모(스크롤 상자). 클래스에 기대지 않는다(수정 전후 같은 선택).
    const geo = await page.evaluate(() => {
      const th = [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] th')].find((x) => x.offsetParent !== null && (x.textContent ?? '').trim() === '1바인');
      const box = th?.closest('table')?.parentElement as HTMLElement | undefined;
      if (!box) return null;
      box.setAttribute('data-e2e-ledger-box', '1');
      const r = box.getBoundingClientRect();
      return { top: r.top, h: r.height, sh: box.scrollHeight, ch: box.clientHeight };
    });
    expect(geo, '장부 표가 없다').not.toBeNull();
    expect(geo!.sh, '목록이 짧아 안쪽 스크롤이 생기지 않았다 — 픽스처를 늘려라').toBeGreaterThan(geo!.ch + 200);

    const sample = () => page.evaluate((HB) => {
      const box = document.querySelector<HTMLElement>('[data-e2e-ledger-box]')!;
      const pane = document.querySelector('[data-mystore-secpanel]')!;
      const bar = [...pane.querySelectorAll<HTMLElement>('div')].find((d) => getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().height > 40 && d.getBoundingClientRect().bottom >= innerHeight - 2);
      const head = (0, eval)(HB) as number;
      const r = box.getBoundingClientRect();
      const rows = box.querySelectorAll('tbody tr');
      const last = rows[rows.length - 1].getBoundingClientRect();
      const barTop = bar ? bar.getBoundingClientRect().top : innerHeight;
      return { sy: Math.round(scrollY), st: Math.round(box.scrollTop), atEnd: box.scrollTop + box.clientHeight >= box.scrollHeight - 1, top: r.top, bottom: r.bottom, head, barTop, lastTop: last.top, lastBottom: last.bottom };
    }, HEAD_BOTTOM);

    // ① 휠 — 상자가 보이는 자리에 커서를 두고 굴린다.
    const s0 = await sample();
    await page.mouse.move(vp.width / 2, Math.min(s0.barTop - 30, Math.max(s0.top + 40, s0.head + 40)));
    const trail: Awaited<ReturnType<typeof sample>>[] = [s0];
    for (let i = 0; i < 40; i++) {
      // 커서가 상자 밖으로 나가면 다시 상자 위로(상자는 페이지와 함께 올라간다)
      const cur = trail[trail.length - 1];
      await page.mouse.move(vp.width / 2, Math.min(cur.barTop - 30, Math.max(cur.top + 40, cur.head + 40)));
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(180);
      const s = await sample();
      trail.push(s);
      if (s.atEnd && s.lastBottom <= s.barTop) break;
    }
    // 안쪽(표)이 움직인 모든 순간, 상자는 헤더 밑 ~ 정산 바 위에 다 들어와 있어야 한다.
    const bad = trail.filter((s, i) => i > 0 && s.st !== trail[i - 1].st && (s.bottom > s.barTop + 1 || s.top < s.head - 1));
    expect(bad.map((s) => `sy${s.sy} st${s.st} box ${Math.round(s.top)}~${Math.round(s.bottom)} head${Math.round(s.head)} bar${Math.round(s.barTop)}`),
      '상자 일부가 화면 밖·정산 바 밑인데 휠이 표를 굴렸다(F-1)').toEqual([]);
    const end = trail[trail.length - 1];
    expect(end.atEnd, '휠로 표 끝까지 못 갔다').toBe(true);
    const overlap = Math.max(0, Math.min(end.lastBottom, innerHeightOf(vp)) - Math.max(end.lastTop, end.barTop));
    expect(overlap, '마지막 행이 정산 바와 겹친다').toBe(0);
    expect(end.lastTop, '마지막 행이 헤더 밑에 가렸다').toBeGreaterThanOrEqual(end.head - 1);
    expect(end.bottom - end.top, '상자가 헤더~정산 바 칸보다 크다(다 보일 자리가 없다)').toBeLessThanOrEqual(end.barTop - end.head + 1);

    // ② 키보드 — 맨 위에서 마지막 행으로 포커스를 옮겨도(직전 행에서 Tab) 그 행이 정산 바 밑에 숨지 않는다.
    await page.evaluate(() => { scrollTo(0, 0); document.querySelector<HTMLElement>('[data-e2e-ledger-box]')!.scrollTop = 0; });
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('[data-e2e-ledger-box]')!;
      const rows = [...box.querySelectorAll('tbody tr')];
      const prev = [...rows[rows.length - 2].querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')].filter((x) => !x.hasAttribute('disabled'));
      const el = prev[prev.length - 1];
      el?.focus({ preventScroll: true });
      return !!el;
    });
    expect(focused, '마지막 직전 행에 포커스할 칸이 없다').toBe(true);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    const k = await page.evaluate((HB) => {
      const a = document.activeElement as HTMLElement;
      const box = document.querySelector<HTMLElement>('[data-e2e-ledger-box]')!;
      const rows = box.querySelectorAll('tbody tr');
      const inLast = rows[rows.length - 1].contains(a);
      const pane = document.querySelector('[data-mystore-secpanel]')!;
      const bar = [...pane.querySelectorAll<HTMLElement>('div')].find((d) => getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().height > 40 && d.getBoundingClientRect().bottom >= innerHeight - 2);
      const r = a.getBoundingClientRect();
      return { inLast, top: r.top, bottom: r.bottom, barTop: bar ? bar.getBoundingClientRect().top : innerHeight, head: (0, eval)(HB) as number };
    }, HEAD_BOTTOM);
    expect(k.inLast, 'Tab 이 마지막 행으로 가지 않았다').toBe(true);
    expect(Math.max(0, Math.min(k.bottom, vp.height) - Math.max(k.top, k.barTop)), '키보드로 간 마지막 행 칸이 정산 바에 가렸다').toBe(0);
    expect(k.top, '키보드로 간 칸이 헤더 밑에 가렸다').toBeGreaterThanOrEqual(k.head - 1);
  });
}
const innerHeightOf = (vp: { height: number }) => vp.height;

// ── F-2 ─────────────────────────────────────────────────────────────────────
// 정산(감사 원본) + 장부(포스터에서 첫 진입 — 스켈레톤 1620 이 예약을 넘겨 '따라잡음' 경로로 먼저 풀린 뒤 1489 로 줄던 같은 부류).
// 장부는 CLS 를 보지 않는다 — 실제 보드(1487)가 스켈레톤(848)보다 길어 아래 이용권 레일이 밀리는 '성장'이고, 예약으로는 못 막는다(보고서 후속).
for (const [target, prev, clsMax] of [['정산', '순위', 0.001], ['장부', '포스터', Infinity]] as const) for (const delay of [150, 400, 900]) {
  test(`F-2 ${target} 첫 진입 — 로딩이 끝날 때까지 판 높이 예약이 유지된다(응답 ${delay}ms)`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, { width: 1440, height: 900 }, delay);
    await press(page, STEP, new RegExp(prev));
    await page.waitForTimeout(1500 + delay * 4);
    const tl = await page.evaluate(async (target) => {
      const pane = document.querySelector<HTMLElement>('[data-mystore-secpanel]')!;
      const btn = [...document.querySelectorAll<HTMLElement>('[role=tablist][aria-label="매장 단계 이동"] [role=tab]')].find((b) => (b.textContent ?? '').includes(target))!;
      let cls = 0;
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number })[]) cls += e.value; });
      po.observe({ type: 'layout-shift', buffered: false });
      const busy = () => [...pane.querySelectorAll('.skeleton, [aria-busy="true"]')].some((e) => e.tagName !== 'BUTTON' && e.tagName !== 'SPAN' && e.getClientRects().length > 0);
      const f: { t: number; sh: number; busy: boolean; top: number }[] = [];
      const t0 = performance.now();
      btn.click();
      await new Promise<void>((done) => {
        let quietSince = -1;
        const loop = () => {
          const b = busy();
          f.push({ t: Math.round(performance.now() - t0), sh: document.documentElement.scrollHeight, busy: b, top: Math.round(pane.getBoundingClientRect().top + scrollY) });
          quietSince = b ? -1 : quietSince < 0 ? performance.now() : quietSince;
          if (performance.now() - t0 < 8000 && !(quietSince > 0 && performance.now() - quietSince > 600 && performance.now() - t0 > 300)) requestAnimationFrame(loop); else done();
        };
        requestAnimationFrame(loop);
      });
      po.disconnect();
      return { f, cls };
    }, target);
    const sh0 = tl.f[0].sh;
    const lastBusy = tl.f.map((x) => x.busy).lastIndexOf(true);
    expect(lastBusy, '로딩 표시가 한 프레임도 안 잡혔다 — 측정 대상이 틀렸다').toBeGreaterThanOrEqual(0);
    const collapsed = tl.f.slice(0, lastBusy + 1).filter((x) => x.sh < sh0 - 1);
    expect(collapsed.slice(0, 3).map((x) => `+${x.t}ms sh${x.sh}`), `로딩 중에 문서 높이가 예약(${sh0}) 밑으로 떨어졌다(F-2)`).toEqual([]);
    expect(new Set(tl.f.map((x) => x.top)).size, '판 윗변(문서 좌표)이 움직였다').toBe(1);
    expect(tl.cls, '레이아웃 이동이 있었다').toBeLessThan(clsMax);
  });
}

// ── F-3 ─────────────────────────────────────────────────────────────────────
for (const [delay, w] of [[150, 1440], [400, 1440], [900, 1440], [400, 1024]] as const) {
  test(`F-3 클락 첫 진입 — 게임 슬롯 바가 늦게 와도 설정 폼이 밀리지 않는다(응답 ${delay}ms · ${w})`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, { width: w, height: w === 1440 ? 900 : 768 }, delay);
    const tl = await page.evaluate(async () => {
      const btn = [...document.querySelectorAll<HTMLElement>('[role=tablist][aria-label="매장 단계 이동"] [role=tab]')].find((b) => (b.textContent ?? '').includes('클락'))!;
      let cls = 0;
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number })[]) cls += e.value; });
      po.observe({ type: 'layout-shift', buffered: false });
      const f: { t: number; y: number | null; bar: boolean }[] = [];
      const t0 = performance.now();
      btn.click();
      await new Promise<void>((done) => {
        const loop = () => {
          const p = [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] p')].find((x) => x.offsetParent !== null && (x.textContent ?? '').trim() === '클락 시작 방식');
          // 진짜 슬롯 칸이 왔는가(자리표시는 머리줄만 같고 칸은 버튼이 아니다)
          const bar = [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] button')].some((x) => x.offsetParent !== null && /바로 시작|메인 설정/.test(x.title + (x.textContent ?? '')));
          f.push({ t: Math.round(performance.now() - t0), y: p ? Math.round(p.getBoundingClientRect().top + scrollY) : null, bar });
          if (performance.now() - t0 < 3500) requestAnimationFrame(loop); else done();
        };
        requestAnimationFrame(loop);
      });
      po.disconnect();
      return { f, cls };
    });
    const ys = tl.f.filter((x) => x.y != null).map((x) => x.y!);
    expect(ys.length, '클락 설정 폼이 안 그려졌다').toBeGreaterThan(0);
    expect(tl.f.some((x) => x.bar), '게임 슬롯 바가 끝내 안 왔다 — 픽스처 확인').toBe(true);
    expect(Math.max(...ys) - Math.min(...ys), '설정 폼이 처음 그려진 뒤 밀렸다(F-3)').toBeLessThanOrEqual(1);
    expect(tl.cls, '레이아웃 이동이 있었다').toBeLessThan(0.01);
  });
}

// ── M-5 · M-6 ───────────────────────────────────────────────────────────────
test('M-5 짧은 판(출근 관리)으로 600 에서 가면 정렬 한 번으로 끝난다(2단 점프 없음) 1440', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page, { width: 1440, height: 900 }, 300);
  await press(page, STEP, /순위/);
  await page.waitForTimeout(2500);
  await page.evaluate(() => scrollTo(0, 600));
  await page.waitForTimeout(300);
  const ys = await page.evaluate(async () => {
    const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => x.offsetParent !== null && /^출근 관리/.test((x.textContent ?? '').trim()))!;
    const out: number[] = [];
    const t0 = performance.now();
    b.click();
    await new Promise<void>((done) => { const loop = () => { const y = Math.round(scrollY); if (out[out.length - 1] !== y) out.push(y); if (performance.now() - t0 < 3000) requestAnimationFrame(loop); else done(); }; requestAnimationFrame(loop); });
    return out;
  });
  // 600 → 정렬값 하나. 그 뒤 클램프로 더 내려가면 2단 점프다.
  expect(ys.length, `scrollY 이동: ${ys.join(' → ')}`).toBeLessThanOrEqual(2);
  // 클릭이 아무 효과가 없어 600 에 머무는 것도 실패다(ys=[600] 거짓 통과 차단 — verify-store-motion-1002 §3).
  expect(ys[ys.length - 1], `정렬이 일어나지 않았다: ${ys.join(' → ')}`).toBeLessThan(600);
});

for (const vp of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
  test(`M-6 프리셋 '수정'을 600 에서 열면 폼 머리가 헤더 밑에서 시작하고, 닫으면 600 으로 돌아온다 ${vp.width}`, async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page, vp, 150);
    await press(page, SIDE, /^매장 설정/);
    await page.waitForTimeout(1200);
    await press(page, '[data-tab-id]', /게임 프리셋/);
    await page.waitForTimeout(1500);
    await page.evaluate(() => scrollTo(0, 600));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => Math.round(scrollY))).toBe(600);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] button')].filter((e) => e.offsetParent !== null && (e.textContent ?? '').trim() === '수정');
      b.find((e) => { const q = e.getBoundingClientRect(); return q.top > 0 && q.bottom < innerHeight; })!.click();
    });
    await page.waitForTimeout(400);
    const head = await page.evaluate((HB) => {
      const h = [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] h3')].find((x) => (x.textContent ?? '').trim() === '프리셋 수정')!;
      return { top: h.getBoundingClientRect().top, head: (0, eval)(HB) as number };
    }, HEAD_BOTTOM);
    expect(head.top, '편집 폼 제목이 헤더 밑에 가렸다(M-6)').toBeGreaterThanOrEqual(head.head - 1);
    expect(head.top, '편집 폼 제목이 화면 아래에 있다').toBeLessThan(vp.height / 2);
    await press(page, '[data-mystore-secpanel] button', /^✕$/);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => Math.round(scrollY)), '닫은 뒤 목록 위치가 돌아오지 않았다').toBe(600);
  });
}
