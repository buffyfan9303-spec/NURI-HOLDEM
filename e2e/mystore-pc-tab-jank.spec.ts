// 내 매장 PC 탭 이동 '드득'·정산 깜빡임 — 전 범위 회귀 게이트(MYSTORE-PC-TAB-JANK, 오너 2026-09-24).
//
// 원인(root-cause-debugger 실측 · 운영 빌드 · 목킹 업주 · 1440/1024 · CPU 4× · 실제 마우스 70ms 누름):
//   ① VenueManageTab 이 방문 판(visited)을 useEffect 로 넣어 첫 방문마다 **제목만 바뀌고 판이 없는 프레임**이 1장.
//   ② 방문 판 상한 8 — 판 18개인데 두 바퀴째 21회 중 14회가 재마운트(빈 프레임+스켈레톤+재조회).
//   ③ LedgerSettlementPanel 이 다시 보일 때마다 setData(null) — keep-alive 인데도 재진입마다 스켈레톤 ~300ms.
//   ④ S6 높이 예약의 1.2s 안전망 — 짧은 판으로 가면 1.2s 뒤 푸터가 올라오고, 스크롤 1200 이면 scrollY 가 깎였다.
// 기존 mystore-transition-cls 는 **첫 방문 한 번**만 재서 이 넷을 전부 못 잡았다(수정 전에도 통과).
//
// 여기서는 전 판을 두 바퀴 돌며(1440·1024 · CPU 4×) 매 클릭 뒤 rAF 로 판을 본다:
//   (a) 빈 프레임 0 — 클릭 뒤 어느 프레임에도 보이는 판([data-pane])이 없으면 안 된다(두 바퀴 모두).
//   (b) 두 바퀴째 스켈레톤 0 — 이미 연 판을 다시 열 때 로딩 표시가 한 프레임도 없어야 한다.
//   (c) 정산 재진입 스켈레톤 0 — 장부↔정산 왕복.
//   (d) 스크롤 1200 에서 판 이동 → +300ms 와 +1500ms 의 scrollY 가 같고, +500ms 이후 CLS < 0.01(늦은 덜컥 없음),
//       그리고 +300ms 에 새 판의 머리가 sticky 머리(사이드바 top) 아래에 보인다(판 중간에 착지하지 않는다).
// 클릭은 page.mouse down→70ms→up(실제 누름). locator.click 은 대상까지 자동 스크롤해 (d) 를 오염시킨다.
// ⚠ 대상을 못 찾으면(missing) 측정이 비어 거짓 통과한다 — missing 은 그 자체로 실패다.
import { test, expect, type Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

type Kind = 'side' | 'step' | 'set';
const T = (kind: Kind, l: string) => ({ kind, l });
// 판 18개 + 요약/대시보드 재방문 — 단계 바 7 · 사이드바 9 · 매장 설정 하위탭 5.
const LAP = [
  T('step', '포스터'), T('step', '장부'), T('step', '클락'), T('step', '순위'), T('step', '정산'), T('step', '이용권'), T('step', '요약'),
  T('side', '내 캘린더'), T('side', '매출·손님'), T('side', '출근 관리'), T('side', '직원 관리'), T('side', '파트너 매장'), T('side', '이벤트 신청'), T('side', '매장 설정'),
  T('set', '게임 프리셋'), T('set', 'POS·결제'), T('set', '운영 도구'), T('set', '위험 구역'), T('set', '매장 페이지'), T('side', '게임 진행'), T('side', '대시보드'),
];
const SCROLL_TOUR = [
  T('side', '매장 설정'), T('side', '출근 관리'), T('side', '매장 설정'), T('side', '게임 진행'),
  T('side', '파트너 매장'), T('side', '매장 설정'), T('side', '대시보드'), T('side', '매장 설정'), T('side', '출근 관리'),
];

interface Frame { t: number; panes: number; skel: number; sy: number; top: number; head: number }
interface Watch { frames: Frame[]; shifts: { t: number; v: number }[]; missing?: boolean }

/** 대상 버튼을 찾아 실제 마우스로 누르고, 뗀 시점부터 durMs 동안 rAF 표본과 layout-shift 를 모은다. */
async function press(page: Page, kind: Kind, l: string, durMs: number): Promise<Watch> {
  const at = await page.evaluate(({ kind, l }) => {
    const pool = kind === 'side' ? document.querySelectorAll('[data-mystore-secbar] button')
      : kind === 'step' ? document.querySelectorAll('[role=tablist][aria-label="매장 단계 이동"] button')
        : document.querySelectorAll('[data-tab-id]');
    const b = [...pool].find((x) => (x as HTMLElement).offsetParent !== null && (x.textContent ?? '').replace(/\s+/g, ' ').includes(l)) as HTMLElement | undefined;
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) return null; // 화면 밖 — 자동 스크롤로 측정을 오염시키지 않는다
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { kind, l });
  if (!at) return { frames: [], shifts: [], missing: true };
  await page.evaluate((dur) => {
    const w = window as unknown as { __jank?: unknown };
    w.__jank = null;
    const frames: Frame[] = [];
    const shifts: { t: number; v: number }[] = [];
    let t0 = -1;
    addEventListener('pointerup', () => { t0 = performance.now(); }, { once: true, capture: true });
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (t0 >= 0 && !e.hadRecentInput) shifts.push({ t: e.startTime - t0, v: e.value });
      }
    });
    try { po.observe({ type: 'layout-shift', buffered: false }); } catch { /* 미지원 */ }
    const sp = document.querySelector('[data-mystore-secpanel]');
    const nav = document.querySelector('[data-mystore-secbar]');
    const head = nav ? parseFloat(getComputedStyle(nav).top) || 0 : 0;
    const sample = () => {
      if (t0 >= 0) {
        const vis = [...document.querySelectorAll<HTMLElement>('[data-pane]')].filter((e) => e.style.display !== 'none' && e.offsetParent !== null);
        const skel = sp ? [...sp.querySelectorAll<HTMLElement>('.skeleton,.animate-pulse,[aria-busy="true"]')].filter((e) => e.offsetParent !== null).length : 0;
        frames.push({ t: performance.now() - t0, panes: vis.length, skel, sy: Math.round(scrollY), top: sp ? Math.round(sp.getBoundingClientRect().top) : 0, head: Math.round(head) });
        if (performance.now() - t0 >= dur) { po.disconnect(); w.__jank = { frames, shifts }; return; }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, durMs);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForFunction(() => (window as unknown as { __jank?: unknown }).__jank, null, { timeout: durMs + 15_000 });
  return page.evaluate(() => (window as unknown as { __jank: Watch }).__jank);
}

/** 정산이 '빈 장부' 가 아니라 실제 보고서를 그리도록 오늘 게임 1개를 싣는다. 나머지 조회는 빈 응답(120ms 지연 — 실서버 흉내). */
async function bootWithData(page: Page, vp: { width: number; height: number }) {
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const single = (h: Record<string, string>) => (h['accept'] ?? '').includes('pgrst.object');
  const later = () => new Promise((z) => setTimeout(z, 120));
  // 가장 먼저 건 라우트가 가장 낮은 우선순위다 — bootOwner 의 기본 라우트가 이것을 덮는다.
  // 쓰기(비 GET·비 RPC)는 fallback 으로 흘려 운영 쓰기 가드가 끊게 둔다.
  await page.route(/supabase\.co\/rest\/v1\//, async (r) => {
    if (r.request().url().includes('/rest/v1/rpc/')) { await later(); return r.fulfill(json(null)); }
    if (r.request().method() !== 'GET') return r.fallback();
    await later();
    return r.fulfill(json(single(r.request().headers()) ? null : []));
  });
  await page.routeWebSocket(/realtime/, () => { /* 연결하지 않는다 */ });
  const sess = { id: 'aaaaaaaa-0000-4000-8000-000000000001', venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, title: '메인', buy_in: 50000, closed_at: null, created_at: new Date().toISOString(), target_entries: 20 };
  await bootOwner(page, {
    viewport: vp,
    appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => (r.request().method() !== 'GET' ? r.fallback()
        : r.fulfill(json(single(r.request().headers()) ? sess : [sess]))));
    },
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-secpanel]')).toBeVisible();
  await page.waitForTimeout(2000);
  // 성숙도 게이팅으로 숨은 항목까지 전부 연다(있을 때만).
  await page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => /고급 기능 모두 보기/.test(x.textContent ?? ''));
    b?.click();
  });
  await page.waitForTimeout(500);
}

const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }] as const;

for (const vp of VIEWPORTS) {
  test.describe(`내 매장 PC 탭 이동 — 드득·깜빡임 없음(${vp.width})`, () => {
    test.describe.configure({ timeout: 240_000 });

    test('(a)(b) 판 전부 두 바퀴 — 빈 프레임 0 · 두 바퀴째 스켈레톤 0', async ({ page }) => {
      await bootWithData(page, vp);
      const blank: string[] = []; const skel2: string[] = []; const missing: string[] = [];
      for (let lap = 1; lap <= 2; lap++) {
        for (const x of LAP) {
          const w = await press(page, x.kind, x.l, 450);
          if (w.missing) { missing.push(`${lap}:${x.l}`); continue; }
          if (w.frames.some((f) => f.panes === 0)) blank.push(`${lap}:${x.l}`);
          if (lap === 2 && w.frames.some((f) => f.skel > 0)) skel2.push(x.l);
          await page.waitForTimeout(250);
        }
      }
      expect(missing, '못 찾은 대상(0이어야 측정이 유효)').toEqual([]);
      expect(blank, '판이 없는 프레임이 있었던 이동').toEqual([]);
      expect(skel2, '두 바퀴째인데 로딩 표시가 보인 판').toEqual([]);
    });

    test('(c) 정산 재진입 — 스켈레톤 0', async ({ page }) => {
      await bootWithData(page, vp);
      // 첫 방문(로딩 허용)으로 두 판을 데운다.
      for (const l of ['장부', '정산']) { await press(page, 'step', l, 300); await page.waitForTimeout(900); }
      await expect(page.locator('[data-pane="settle"]')).toBeVisible();
      await expect(page.locator('[data-pane="settle"] [aria-busy="true"]')).toHaveCount(0); // 보고서가 선 뒤부터 잰다
      const bad: string[] = [];
      for (const l of ['장부', '정산', '요약', '정산', '클락', '정산']) {
        const w = await press(page, 'step', l, 700);
        expect(w.missing, l).toBeFalsy();
        if (l === '정산' && w.frames.some((f) => f.skel > 0)) bad.push(`${l}@frame${w.frames.findIndex((f) => f.skel > 0)}`);
        await page.waitForTimeout(250);
      }
      expect(bad, '정산 재진입 중 스켈레톤 프레임').toEqual([]);
    });

    test('(d) 스크롤 1200 에서 이동 — +300/+1500ms scrollY 동일 · +500ms 이후 CLS<0.01', async ({ page }) => {
      await bootWithData(page, vp);
      for (const x of SCROLL_TOUR) { await press(page, x.kind, x.l, 300); await page.waitForTimeout(700); } // 전부 한 번 열어 둔다
      const bad: string[] = [];
      for (const x of SCROLL_TOUR) {
        await page.evaluate(() => scrollTo(0, 1200));
        await page.waitForTimeout(250);
        const w = await press(page, x.kind, x.l, 1550);
        expect(w.missing, x.l).toBeFalsy();
        const at = (ms: number) => w.frames.find((f) => f.t >= ms)?.sy;
        const s300 = at(300); const s1500 = at(1500);
        const f300 = w.frames.find((f) => f.t >= 300);
        const headOk = !!f300 && f300.top >= f300.head - 1;
        const late = w.shifts.filter((s) => s.t >= 500).reduce((a, s) => a + s.v, 0);
        if (s300 == null || s1500 == null || s300 !== s1500 || late >= 0.01 || !headOk) bad.push(`${x.l}: sy300=${s300} sy1500=${s1500} lateCLS=${late.toFixed(4)} top300=${f300?.top}/head${f300?.head}`);
      }
      expect(bad, '늦은 덜컥(스크롤 깎임·늦은 이동)').toEqual([]);
    });
  });
}
