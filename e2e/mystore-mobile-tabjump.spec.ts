// 내 매장 모바일 단계 바 전환 — "요약·포스터·장부·클락 이렇게 움직이면 하단 전체 콘텐츠가 위로 올라갔다가 내려와"(오너 2026-10-01).
//
// 원인(수정 전 빌드 실측 · 목킹 업주 · rAF 시계열): 모바일 섹션 헤더는 설명이 제목 아래로 내려가는데 **단계마다 줄 수가 달랐다**.
//   헤더 높이 포스터·장부·순위 78 / 클락·정산 59(390) · 412 에선 78·78·46·59·46 → 레일 아래 판 윗변이
//   172→172→140→154→140 으로 단계를 옮길 때마다 오르내렸다. PC 는 헤더가 한 줄 48 고정이라 안 생긴다.
// 고침: VenueManageTab.tsx — 게임 단계 5개 헤더를 같은 격자 칸에 겹쳐 두고 지금 단계만 보이게(칸 높이 = 최댓값).
//
// 재는 것: 전환마다 rAF 프레임별 「판 윗변 − 레일 밑변」(스크롤과 무관한 상대값), scrollY, scrollHeight.
//   ① 게임 단계 5개의 정착 오프셋이 전부 같다(±1px) — 수정 전 빌드에서 32px 차로 빨갛다.
//   ② 한 전환 안에서 새 판이 선 뒤 오프셋이 한 방향으로라도 1px 넘게 움직이지 않는다(오르내림 0).
// 탭은 DOM click(page.evaluate) — Playwright click 의 자동 스크롤이 scrollY 를 오염시키지 않게.
// 🔴 2026-10-01 오너 결정 「모든 탭 시작선을 같게」 — ①의 대상을 레일 7칸 전부(요약·포스터~정산·이용권)로 넓혔다.
//   종전엔 요약 6 · 게임 172.5 · 이용권 97(390)이라 요약→포스터에서 판이 166px 내려갔다(독립 검토 review-tabjump-1001).
//   고침: VenueManageTab.tsx data-step-chrome — 레일 섹션 3개가 같은 머리 칸(칩 바 + 헤더 겹침 격자)을 쓴다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE, MOCK_VENUE_NAME } from './_mockOwner';

const RAIL = '[data-mystore-rail]';
const TABS = ['요약', '포스터', '장부', '클락', '순위', '정산', '이용권'] as const;
// 순방향(요약→…→이용권) · 역방향(→…→요약) · 양 끝 직행(요약↔이용권). 첫 '요약'은 이미 열린 판을 재는 기준값이다.
const SEQ = [...TABS, ...TABS.slice(0, -1).reverse(), '이용권', '요약'] as const;

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const get = (body: unknown[]) => (r: Route) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(isSingle(r) ? (body[0] ?? null) : body)));
const session = (seq: number, title: string) => ({
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: seq, title, buyin_amount: 100_000, card_amount: null,
  target_entries: 40, game_type: 'gtd', max_entries: 0, is_addon: false, addon_stack: 0, addon_amount: 0,
  operators: [], discounts: [], early_double_min: 0, early_single_min: 0, tournament_start: null,
  opened_by: null, opened_at: new Date().toISOString(), reg_closed: false, closed: false, schedule_id: null, voucher_issued: 0,
});

async function open(page: Page, w: number, delayMs = 0, games = 2) {
  await bootOwner(page, {
    viewport: { width: w, height: 844 }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      // 메인+사이드 = 칩 줄이 뜨는 날(실매장 흔한 상태). delayMs = 요약 줄 '조회 전' 자리표시를 재기 위한 지연.
      //   games=1 = 칩 줄이 없는 날(메인 하나).
      //   game_seq=eq.N 조회(장부 보드 단건)는 그 게임 행만 돌려준다 — 칩 → 장부 보드 착지를 재려면 단건이 맞는 게임이어야 한다.
      const all = [session(1, '수요 딥스택'), session(2, '사이드 터보')].slice(0, games);
      await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => {
        if (delayMs) await new Promise((res) => setTimeout(res, delayMs));
        const m = /game_seq=eq\.(\d+)/.exec(r.request().url());
        return get(m ? all.filter((s) => String(s.game_seq) === m[1]) : all)(r);
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '목킹 업주로 내 매장 단계 바를 열지 못했다').toBeVisible({ timeout: 20_000 });
  if (!delayMs) await page.waitForTimeout(2500);
}

/** 보이는 요약 줄 하나를 잰다 — 한 줄인가(높이 ≤ 글자 줄 1.5배), 넘침이 말줄임으로 처리됐나, 시작선. */
const sumLine = (page: Page) => page.evaluate((sel) => {
  const rail = document.querySelector<HTMLElement>(sel)!;
  const els = [...document.querySelectorAll<HTMLElement>('[data-summary-line]')].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible');
  const p = els[0];
  const pane = [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] [data-pane]')].find((e) => e.getClientRects().length > 0);
  if (!p) return { count: els.length };
  const lh = parseFloat(getComputedStyle(p).fontSize) * 1.5;
  const game = p.querySelector<HTMLElement>('[data-summary-game]');
  // 말줄임 칸(truncate)이 실제로 잘렸는지 — 잘렸다면 ellipsis 가 걸린 칸이어야 한다
  //   (sr-only 는 설계상 1px 상자라 제외 — 화면에 보이는 칸만 본다)
  const clipped = [...p.querySelectorAll<HTMLElement>('span:not(.sr-only)')].filter((s) => s.scrollWidth > s.clientWidth + 1)
    .map((s) => ({ t: s.textContent, ellipsis: getComputedStyle(s).textOverflow === 'ellipsis' }));
  return {
    count: els.length, text: p.textContent?.replace(/\s+/g, ' ').trim() ?? '', h: Math.round(p.getBoundingClientRect().height * 10) / 10, lh,
    lineOverflow: p.scrollWidth - p.clientWidth, clipped, gameText: game?.textContent ?? '', gameH: game ? game.getBoundingClientRect().height : 0,
    lineTop: Math.round((p.getBoundingClientRect().top - rail.getBoundingClientRect().bottom) * 10) / 10,
    placeholder: game?.getAttribute('role') === 'img', off: pane ? Math.round((pane.getBoundingClientRect().top - rail.getBoundingClientRect().bottom) * 10) / 10 : null,
  };
}, RAIL);

type Frame = { t: number; off: number | null; pane: string | null; y: number; H: number };
/** 레일 칸 하나를 DOM click 하고 1.2s 동안 rAF 프레임마다 잰다. 칸이 없으면 null(호출부가 실패시킨다). */
const step = (page: Page, name: string) => page.evaluate(async ([sel, n]) => {
  const rail = document.querySelector<HTMLElement>(sel);
  const btn = rail && [...rail.querySelectorAll<HTMLElement>('button')].find((x) => getComputedStyle(x).display !== 'none' && x.textContent?.trim() === n);
  if (!rail || !btn) return null;
  const out: { t: number; off: number | null; pane: string | null; y: number; H: number }[] = [];
  const t0 = performance.now();
  const snap = () => {
    const pane = [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] [data-pane]')].find((e) => e.getClientRects().length > 0);
    out.push({ t: Math.round(performance.now() - t0), pane: pane?.dataset.pane ?? null,
      off: pane ? Math.round((pane.getBoundingClientRect().top - rail.getBoundingClientRect().bottom) * 10) / 10 : null,
      y: Math.round(scrollY), H: document.scrollingElement!.scrollHeight });
  };
  btn.click();
  await new Promise<void>((res) => { const f = () => { snap(); if (performance.now() - t0 < 1200) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return out;
}, [RAIL, name] as const);

const PANE: Record<string, string> = { 포스터: 'posters', 장부: 'ledger', 클락: 'clock', 순위: 'ranking', 정산: 'settle', 이용권: 'voucher', 요약: 'dashboard' };

for (const [W, Y] of [[360, 0], [390, 0], [412, 0], [390, 600]] as const) {
  test(`${W}px · scroll ${Y} — 레일 7칸 전환에서 레일 아래 콘텐츠 시작선이 같고 오르내리지 않는다`, async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, W);
    const settled: Record<string, number[]> = {};
    const osc: string[] = [];
    let measured = 0;
    for (const n of SEQ) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), Y);
      await page.waitForTimeout(300);
      const fr: Frame[] | null = await step(page, n);
      expect(fr, `레일에 «${n}» 칸이 없다`).not.toBeNull();
      const mine = fr!.filter((f) => f.pane === PANE[n] && f.off != null);
      expect(mine.length, `«${n}» 판이 1.2s 안에 서지 않았다 — 빈 검사`).toBeGreaterThan(5);
      measured++;
      const fin = mine[mine.length - 1].off!;
      (settled[n] ??= []).push(fin);
      // ② 새 판이 선 뒤의 모든 프레임이 정착값과 같아야 한다(위로 갔다 내려옴 = 중간 프레임이 정착값과 다름)
      const off = mine.filter((f) => Math.abs(f.off! - fin) > 1);
      if (off.length) osc.push(`${n}: ${off.slice(0, 4).map((f) => `t${f.t} ${f.off}`).join(', ')} → ${fin}`);
      console.log(`${W}/${Y} → ${n}: off ${mine[0].off}→${fin} · y ${fr![0].y}→${fr![fr!.length - 1].y} · H ${fr![0].H}→${fr![fr!.length - 1].H}`);
    }
    expect(measured, '전환을 다 재지 못했다').toBe(SEQ.length);
    expect(osc, '전환 도중 레일 아래 판이 움직였다').toEqual([]);
    // ① 레일 7칸 전부 레일 아래 시작선이 같다(순·역방향·직행의 모든 정착값)
    for (const n of TABS) expect(settled[n]?.length ?? 0, `«${n}» 정착값이 없다 — 빈 검사`).toBeGreaterThan(0);
    const g = TABS.flatMap((n) => settled[n] ?? []);
    expect(g.length, '정착값 수가 전환 수와 다르다').toBe(SEQ.length);
    expect(Math.max(...g) - Math.min(...g), `탭별 레일 아래 시작선이 다르다: ${TABS.map((n) => `${n} ${settled[n]}`).join(' · ')}`).toBeLessThanOrEqual(1);
  });
}

// 🔴 오너 2026-10-01 결정 — 요약(·이용권)의 머리 칸 빈 띠를 '매장 › 날짜(요일) › 오늘 게임' 요약 줄로 채운다.
//   같은 자리·같은 높이(시작선 불변), 실제 값, 320·390 에서 한 줄(nowrap · 넘치면 말줄임), 조회 전엔 같은 높이 자리표시(CLS 0).
const DATE_RE = /\d{1,2}월 \d{1,2}일 \([일월화수목금토]\)/;
for (const W of [320, 390] as const) {
  test(`${W}px — 요약·이용권 요약 줄: 한 줄 · 실제 값 · 시작선 불변`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, W);
    const offs: number[] = [];
    for (const n of ['요약', '이용권', '포스터'] as const) {
      expect(await step(page, n), `레일에 «${n}» 칸이 없다`).not.toBeNull();
      await page.waitForTimeout(400);
      const m = await sumLine(page);
      console.log(`${W} ${n} 요약 줄`, JSON.stringify(m));
      if (n === '포스터') {
        // 게임 단계에선 종전 문맥 줄이다 — 요약 줄 표식이 보이면 안 된다
        expect(m.count, '게임 단계에 요약 줄이 떴다').toBe(0);
        const fr = await step(page, '포스터');
        offs.push(fr!.at(-1)!.off!);
        continue;
      }
      expect(m.count, `«${n}»에 보이는 요약 줄이 없다 — 빈 띠 그대로`).toBe(1);
      expect(m.text, '요약 줄에 매장 이름이 없다').toContain(MOCK_VENUE_NAME);
      expect(m.text, '요약 줄에 요일이 붙은 오늘 날짜가 없다').toMatch(DATE_RE);
      expect(m.gameText, '요약 줄 게임 칸이 실제 값(목킹 2게임)이 아니다').toBe('오늘 게임 2개');
      expect(m.h!, `요약 줄이 한 줄이 아니다(높이 ${m.h} / 줄 ${m.lh})`).toBeLessThanOrEqual(m.lh! * 1.2);
      expect(m.lineOverflow!, '요약 줄이 줄 밖으로 넘쳤다').toBeLessThanOrEqual(1);
      for (const c of m.clipped ?? []) expect(c.ellipsis, `잘린 칸 «${c.t}» 에 말줄임이 없다`).toBe(true);
      offs.push(m.off!);
    }
    expect(offs.length, '시작선 측정 수').toBe(3);
    expect(Math.max(...offs) - Math.min(...offs), `요약·이용권·포스터 시작선이 다르다: ${offs}`).toBeLessThanOrEqual(1);
    // 넘침 실측 — 요약으로 돌아가 긴 매장명을 화면에 그대로 넣어 본다(CSS 의 말줄임·한 줄 유지를 실제로 잰다. 상태·데이터는 안 바꾼다)
    expect(await step(page, '요약'), '레일에 «요약» 칸이 없다').not.toBeNull();
    await page.waitForTimeout(400);
    await page.evaluate((name) => {
      const p = [...document.querySelectorAll<HTMLElement>('[data-summary-line]')].find((e) => e.getClientRects().length > 0)!;
      const v = [...p.querySelectorAll<HTMLElement>('span')].find((s) => s.textContent === name)!;
      v.textContent = '아주 긴 이름의 홀덤펍 강남역 본점 2호점 VIP 라운지';
    }, MOCK_VENUE_NAME);
    const L = await sumLine(page);
    console.log(`${W} 긴 매장명`, JSON.stringify(L));
    expect(L.h!, '긴 매장명에서 요약 줄이 두 줄이 됐다').toBeLessThanOrEqual(L.lh! * 1.2);
    expect(L.lineOverflow!, '긴 매장명이 줄 밖으로 넘쳤다').toBeLessThanOrEqual(1);
    expect(L.clipped?.length ?? 0, '긴 매장명이 잘리지 않았다 — 넘침 검사가 공허하다').toBeGreaterThan(0);
    for (const c of L.clipped ?? []) expect(c.ellipsis, `잘린 칸 «${c.t}» 에 말줄임이 없다`).toBe(true);
    expect(L.gameText, '긴 매장명 때문에 게임 칸이 사라졌다').toBe('오늘 게임 2개');
  });
}

test('390px — 요약 줄 조회 전 자리표시는 같은 높이(시작선·줄 높이 불변)', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 390, 6000);
  // 칩 목록 응답이 6초 늦다 — 그 사이 요약 줄 게임 칸은 자리표시여야 한다
  await expect(page.locator('[data-summary-game][role=img]').first(), '조회 전 자리표시가 없다').toBeVisible({ timeout: 5000 });
  const before = await sumLine(page);
  await expect(page.locator('[data-summary-game]:not([role])').first(), '응답 뒤 실제 값으로 바뀌지 않았다').toHaveText('오늘 게임 2개', { timeout: 15_000 });
  await page.waitForTimeout(800);
  const after = await sumLine(page);
  console.log('자리표시 전/후', JSON.stringify(before), JSON.stringify(after));
  expect(before.placeholder, '첫 측정이 자리표시가 아니다 — 빈 검사').toBe(true);
  expect(Math.abs(before.h! - after.h!), '자리표시 ↔ 실제 값에서 요약 줄 높이가 바뀌었다').toBeLessThanOrEqual(0.5);
  expect(Math.abs(before.lineTop! - after.lineTop!), '자리표시 ↔ 실제 값에서 요약 줄 위치가 바뀌었다').toBeLessThanOrEqual(0.5);
  expect(before.gameH, '자리표시 칸 높이가 0 — 보이지 않는 자리표시').toBeGreaterThan(0);
  // ⚠ 판 시작선(off)은 여기서 단언하지 않는다 — 조회 전엔 games=[] 라 칩 줄(멀티게임 날만 생기는 invisible 예약)이 아직 없다.
  //   이것은 게임 단계에도 같은 기존 동작(VenueManageTab F5 주석 · chipCache 선데우기로 완화)이고 요약 줄 자리표시와 무관하다. 수치는 로그로만 남긴다.
});

// 🔴 오너 2026-10-01 "아래 빈공간이 너무 큰거 아니야?" — 요약 줄 아래 빈 칸은 '가장 키 큰 게임 단계 헤더'에 맞춘 예약이었다
//   (설명이 제목 아래로 2~3줄 내려간 헤더 78px). 고침: 모바일 레일 헤더를 한 줄(제목 + 설명 말줄임 + ⓘ)로 접었다.
//   재는 것: ① 보이는 레일 헤더가 전부 한 줄(≤ 40px) ② 요약 줄 밑 → 구분선 빈 칸이 칩 줄 예약 + 한 줄 헤더 몫 이하
//   (2게임 ≤ 112 · 1게임 ≤ 64 — 360·390·412 실측: 수정 후 107.3 · 60.5, 수정 전 986a0e3e 137.2~137.6 · 90.4~90.9 로 빨갛다) ③ 시작선은 7칸 동일(위 테스트들이 계속 잰다).
//   빈 칸이 0 이 아닌 이유: 시작선을 같게 두는 한 요약 줄 밑에는 게임 단계의 [칩 줄 + 헤더] 높이만큼이 남는다(store-tabjump-report §8).
const chrome = (page: Page) => page.evaluate((sel) => {
  const rb = document.querySelector<HTMLElement>(sel)!.getBoundingClientRect().bottom;
  const vis = (e: Element) => e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible';
  const line = [...document.querySelectorAll<HTMLElement>('[data-summary-line]')].find(vis);
  const grid = document.querySelector<HTMLElement>('[data-step-header]');
  const hs = [...document.querySelectorAll<HTMLElement>('[data-step-header] header')].filter(vis);
  const heads = hs.map((h) => h.getBoundingClientRect().height);
  // 말줄임이 화면 안에서 일어나는가 — 헤더(설명·ⓘ 포함)가 뷰포트 오른쪽을 넘으면 안 된다(격자 auto 트랙이 564px 로 늘어난 실측 회귀)
  const over = Math.max(0, ...hs.map((h) => h.getBoundingClientRect().right - document.documentElement.clientWidth));
  // 🔴 오너 10-02 「요약에도 오늘 게임 칩 표시」 — 빈 칸은 '요약 줄 밑'이 아니라 **머리 칸의 마지막 보이는 것(요약 줄·칩 줄) 밑**에서
  //   다음 보이는 것(보이는 헤더 윗변, 없으면 구분선)까지다. 칩 줄이 invisible 이면 그 몫이 빈 칸으로 잡힌다.
  const chips = [...document.querySelectorAll<HTMLElement>('[data-step-chrome] [role=group][aria-label="오늘 게임 선택"]')].find(vis);
  const last = Math.max(line?.getBoundingClientRect().bottom ?? -Infinity, chips?.getBoundingClientRect().bottom ?? -Infinity);
  const next = hs.length ? Math.min(...hs.map((h) => h.getBoundingClientRect().top)) : grid?.getBoundingClientRect().bottom;
  return { blank: line && next != null ? next - last : null, chips: !!chips,
    lineTop: line ? line.getBoundingClientRect().top - rb : null, heads, over };
}, RAIL);

// 상한: 머리 칸 마지막 줄 → 보이는 헤더까지 = 표준 간격(space-y-3 = 12.75) → ≤ 16. 요약·이용권 같은 값.
//   이력: 63f77152(칩 invisible) 요약 107.3 · 이용권 ≈ 68 → 9e0a5326(칩 보임) 요약 60.5(숨긴 제목 줄 34 + 12.75×2)로 빨갛다.
//   🔴 오너 10-02 「중복 줄을 빈칸으로 올리기」 — 요약도 그 칸에 '오늘 장부 요약' 제목 줄을 보여 다른 단계와 같은 간격이 됐다.
const BLANK_MAX = { 요약: 16, 이용권: 16 } as const;
for (const G of [2, 1] as const) for (const W of [360, 390, 412] as const) {
  test(`${W}px · 게임 ${G}개 — 레일 헤더는 한 줄, 요약·이용권 머리 칸 빈 칸 상한(요약 ≤ ${BLANK_MAX.요약} · 이용권 ≤ ${BLANK_MAX.이용권})`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, W, 0, G);
    let heads = 0;
    for (const n of TABS) {
      expect(await step(page, n), `레일에 «${n}» 칸이 없다`).not.toBeNull();
      await page.waitForTimeout(300);
      const m = await chrome(page);
      heads += m.heads.length;
      for (const h of m.heads) expect(h, `«${n}» 헤더가 한 줄이 아니다(${h}px)`).toBeLessThanOrEqual(40);
      expect(m.over, `«${n}» 헤더가 화면 오른쪽 밖으로 ${m.over}px 넘쳤다`).toBeLessThanOrEqual(1);
      if (n === '요약' || n === '이용권') {
        console.log(`${W}/g${G} ${n} 머리 칸 빈 칸 ${m.blank?.toFixed(1)} · 칩 ${m.chips} · 줄 위치 ${m.lineTop?.toFixed(1)}`);
        expect(m.blank, `«${n}»에 요약 줄 또는 머리 칸이 없다 — 빈 검사`).not.toBeNull();
        expect(m.chips, `«${n}» 칩 줄 표시가 게임 수(${G})와 맞지 않는다`).toBe(G > 1);
        expect(m.blank!, `«${n}» 머리 칸 빈 칸이 크다`).toBeLessThanOrEqual(BLANK_MAX[n]);
      }
    }
    expect(heads, '보이는 레일 헤더를 하나도 못 쟀다 — 빈 검사').toBeGreaterThanOrEqual(6);
  });
}

// 접힌 설명 — 지우지 않았다. ⓘ 는 키보드로 닿고 Enter 로 펼치고 접으며 aria-expanded 를 알린다.
//   낭독기는 말줄임과 무관하게 전문을 읽는다(textContent 전문). 숨은 사본(inert)의 ⓘ 는 보이지도 포커스되지도 않는다. 단계를 옮기면 접힌다.
test('390px — 접힌 헤더 설명: ⓘ 키보드로 펼침·접힘, 단계 이동 시 접힘', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 390);
  expect(await step(page, '클락'), '레일에 «클락» 칸이 없다').not.toBeNull();
  await page.waitForTimeout(400);
  const toggle = () => page.locator('[data-step-header] [data-desc-toggle]:visible');
  await expect(toggle(), '보이는 ⓘ 는 지금 단계 하나여야 한다').toHaveCount(1);
  const t = toggle().first();
  await expect(t).toHaveAttribute('aria-expanded', 'false');
  await expect(t).toHaveAccessibleName('설명 펼치기');
  const desc = () => page.evaluate(() => {
    const h = [...document.querySelectorAll<HTMLElement>('[data-step-header] header')].find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible')!;
    const p = h.querySelector<HTMLElement>('.t-desc')!;
    return { text: p.textContent ?? '', clipped: p.scrollWidth > p.clientWidth + 1, ellipsis: getComputedStyle(p).textOverflow === 'ellipsis', h: h.getBoundingClientRect().height };
  });
  const c = await desc();
  expect(c.text, '설명 전문이 DOM 에 없다(낭독기가 못 읽는다)').toBe('대회 타이머. 장부 연동 시 엔트리·생존이 자동 반영됩니다');
  expect(c.clipped && c.ellipsis, '접힌 설명이 말줄임 한 줄이 아니다').toBe(true);
  // 키보드 순서: 문서 처음부터 Tab 을 눌러 ⓘ 에 닿는다(숨은 사본 ⓘ 는 inert 라 순서에 끼지 않는다)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return !!a?.matches('[data-desc-toggle]') && getComputedStyle(a).visibility === 'visible';
    });
  }
  expect(reached, 'Tab 으로 ⓘ 에 닿지 못했다').toBe(true);
  await expect(t).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(t).toHaveAttribute('aria-expanded', 'true');
  await expect(t).toHaveAccessibleName('설명 접기');
  const o = await desc();
  expect(o.clipped, '펼쳤는데 설명이 아직 잘려 있다').toBe(false);
  expect(o.h, '펼쳤는데 헤더가 그대로 한 줄 높이다').toBeGreaterThan(c.h + 10);
  await page.keyboard.press('Enter');
  await expect(t).toHaveAttribute('aria-expanded', 'false');
  // 펼친 채 단계를 옮겼다 돌아오면 접힌 채 도착한다(시작선 유지)
  await page.keyboard.press('Enter');
  await expect(t).toHaveAttribute('aria-expanded', 'true');
  const fr = await step(page, '순위');
  const fin = fr!.filter((f) => f.pane === 'ranking' && f.off != null).at(-1)!.off!;
  await expect(toggle().first(), '옮긴 단계가 펼친 채 도착했다').toHaveAttribute('aria-expanded', 'false');
  const back = await step(page, '클락');
  expect(Math.abs(back!.filter((f) => f.pane === 'clock' && f.off != null).at(-1)!.off! - fin), '펼침이 남아 시작선이 달라졌다').toBeLessThanOrEqual(1);
  await expect(toggle().first(), '돌아온 단계가 펼친 채로 남았다').toHaveAttribute('aria-expanded', 'false');
});

// 🔴 오너 10-02 「요약에도 오늘 게임 칩 표시」 — 요약·이용권의 칩은 게임 단계와 같은 자리·같은 모양으로 보이고,
//   누르면 **같은 게임 선택 상태**(onPickGame: 클락 시드 게임·장부 추종 신호)로 그 게임을 고른 채 장부 단계로 간다.
//   재는 것: 보이는 칩 줄(접근성 트리에 있음) · 위치가 포스터 칩 줄과 같다(±1px) · 클릭 → 장부 판 · 레일 '장부' 활성 ·
//   장부 칩 줄에서 그 칩이 aria-pressed · 장부가 그 게임(game_seq=eq.2)을 조회했다.
for (const from of ['요약', '이용권'] as const) {
  test(`390px · 게임 2개 — «${from}» 칩 '사이드1' → 장부 · 같은 게임 선택`, async ({ page }) => {
    test.setTimeout(120_000);
    const seqs: string[] = [];
    page.on('request', (r) => { const m = /ledger_sessions\?.*game_seq=eq\.(\d+)/.exec(r.url()); if (m) seqs.push(m[1]); });
    await open(page, 390);
    const chipTop = () => page.evaluate((sel) => {
      const g = [...document.querySelectorAll<HTMLElement>('[data-step-chrome] [role=group][aria-label="오늘 게임 선택"]')]
        .find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible');
      return g ? g.getBoundingClientRect().top - document.querySelector<HTMLElement>(sel)!.getBoundingClientRect().bottom : null;
    }, RAIL);
    expect(await step(page, '포스터'), '레일에 «포스터» 칸이 없다').not.toBeNull();
    await page.waitForTimeout(400);
    const posterTop = await chipTop();
    expect(posterTop, '포스터 칩 줄을 못 쟀다 — 빈 검사').not.toBeNull();
    expect(await step(page, from), `레일에 «${from}» 칸이 없다`).not.toBeNull();
    await page.waitForTimeout(400);
    const group = page.getByRole('group', { name: '오늘 게임 선택' });
    await expect(group, `«${from}»에 오늘 게임 칩 줄이 보이지 않는다`).toBeVisible();
    await expect(group.getByRole('button'), '칩 수(메인·사이드1 + 새 게임)').toHaveCount(3);
    const myTop = await chipTop();
    expect(Math.abs(myTop! - posterTop!), `«${from}» 칩 줄 위치 ${myTop} ≠ 포스터 ${posterTop}`).toBeLessThanOrEqual(1);
    const before = seqs.length;
    await group.getByRole('button', { name: /사이드1/ }).evaluate((b) => (b as HTMLElement).click());
    await expect(page.locator('[data-mystore-secpanel] [data-pane="ledger"]'), '칩을 눌렀는데 장부 판으로 가지 않았다').toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`${RAIL} [role=tab][aria-selected="true"]`), '레일 활성 칸이 장부가 아니다').toHaveText(/^\s*장부\s*$/);
    await expect(page.getByRole('group', { name: '오늘 게임 선택' }).getByRole('button', { name: /사이드1/ }),
      '장부의 칩 줄에서 고른 게임이 선택 상태가 아니다').toHaveAttribute('aria-pressed', 'true');
    // 장부 판 자체가 그 게임 보드로 열렸다 — 목록 모드(스위처 없음)로 열리면 실패한다(goStep 만 쓴 첫 구현이 실제로 그랬다).
    //   ⚠ eq.1 조회는 대시보드·클락 등 다른 소비자도 내므로 '마지막 요청' 으로 판정하지 않는다.
    await expect.poll(() => seqs.slice(before).includes('2'), { message: '장부가 고른 게임(game_seq=2)을 조회하지 않았다', timeout: 10_000 }).toBe(true);
    await expect(page.locator('[data-pane="ledger"] button.bg-accent-300'), '장부 보드의 게임 스위처에서 사이드1 이 선택되지 않았다(목록 모드로 열림)')
      .toHaveText([/사이드1/], { timeout: 10_000 });
  });
}

// 🔴 오너 10-02 결정 「중복 줄을 빈칸으로 올리기」 — 모바일 요약 판의 대시보드 머리줄('매장 · 날짜 · ⟳')은
//   바로 위 요약 줄(매장 › 날짜 › 오늘 게임)을 되풀이했다. 그 줄을 모바일에서 없애고, 비어 있던 머리 칸 제목 자리에
//   '오늘 장부 요약' 제목 + 새로고침(갱신 시각·접근성 이름 그대로)을 둔다. PC 는 머리줄 그대로.
//   재는 것: ① 보이는 매장 이름이 요약 줄 하나뿐(중복 0) ② 제목 줄이 보이고 다른 단계 헤더와 같은 높이·자리 ③ 보이는 새로고침은 정확히 하나,
//   그 줄 안에 있고 누름 상자 ≥44 ④ 누르면 오늘 장부를 다시 조회한다 ⑤ 'HH:MM 기준' 표시. 9e0a5326(머리줄 남음·제목 숨김)에서 빨갛다.
const dashHead = (page: Page, venue: string) => page.evaluate(([sel, v]) => {
  const vis = (e: Element) => e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible';
  const tab = document.querySelector<HTMLElement>('[data-tab="my-store"]')!;
  // 매장 이름이 보이는 잎 요소 — 요약 줄 1개만 있어야 한다(머리줄이 남으면 2)
  const names = [...tab.querySelectorAll<HTMLElement>('span')].filter((s) => s.children.length === 0 && s.textContent?.trim() === v && vis(s));
  const btns = [...tab.querySelectorAll<HTMLElement>('button[aria-label="대시보드 새로고침"]')].filter(vis);
  const head = [...tab.querySelectorAll<HTMLElement>('[data-step-header] header')].find((h) => vis(h) && h.querySelector('h2')?.textContent === '오늘 장부 요약');
  const b = btns[0];
  let hit = 0;
  if (b) {
    const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    // 누름 상자 — 중심에서 ±21px 네 점이 모두 그 버튼에 닿는가(before 확장 포함 = 지름 42 이상, 테두리까지 44)
    hit = [[cx, cy - 21], [cx, cy + 21], [cx - 21, cy], [cx + 21, cy]].filter(([x, y]) => b.contains(document.elementFromPoint(x, y))).length;
  }
  const rb = document.querySelector<HTMLElement>(sel)!.getBoundingClientRect().bottom;
  return { names: names.length, btns: btns.length, inHead: !!(b && head?.contains(b)), headH: head ? head.getBoundingClientRect().height : null,
    headTop: head ? head.getBoundingClientRect().top - rb : null, hit, stamp: head?.querySelector('[data-dash-refreshed]')?.textContent ?? null };
}, [RAIL, venue] as const);

test('390px · 게임 2개 — 요약: 대시보드 머리줄 중복 0 · 제목 줄에 새로고침(동작·이름·갱신 시각) · 다른 단계와 같은 헤더', async ({ page }) => {
  test.setTimeout(120_000);
  let calls = 0;
  page.on('request', (r) => { if (/\/rest\/v1\/ledger_sessions\?/.test(r.url()) && r.method() === 'GET') calls++; });
  await open(page, 390);
  expect(await step(page, '요약'), '레일에 «요약» 칸이 없다').not.toBeNull();
  await page.waitForTimeout(600);
  const m = await dashHead(page, MOCK_VENUE_NAME);
  console.log('요약 머리', JSON.stringify(m));
  expect(m.names, `보이는 매장 이름이 ${m.names}곳 — 요약 줄 하나여야 한다(대시보드 머리줄 중복)`).toBe(1);
  expect(m.headH, "'오늘 장부 요약' 제목 줄이 보이지 않는다").not.toBeNull();
  expect(m.btns, '보이는 «대시보드 새로고침» 이 정확히 하나가 아니다').toBe(1);
  expect(m.inHead, '새로고침이 제목 줄 안에 있지 않다').toBe(true);
  expect(m.hit, '새로고침 누름 상자가 44px 미만이다').toBe(4);
  expect(m.stamp ?? '', '마지막 갱신 시각이 없다').toMatch(/^\d{2}:\d{2} 기준$/);
  // 다른 단계 제목 줄과 같은 높이·같은 자리
  expect(await step(page, '클락'), '레일에 «클락» 칸이 없다').not.toBeNull();
  await page.waitForTimeout(400);
  const c = await page.evaluate((sel) => {
    const h = [...document.querySelectorAll<HTMLElement>('[data-step-header] header')].find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible')!;
    return { h: h.getBoundingClientRect().height, top: h.getBoundingClientRect().top - document.querySelector<HTMLElement>(sel)!.getBoundingClientRect().bottom };
  }, RAIL);
  expect(Math.abs(m.headH! - c.h), `제목 줄 높이 ${m.headH} ≠ 클락 ${c.h}`).toBeLessThanOrEqual(1);
  expect(Math.abs(m.headTop! - c.top), `제목 줄 위치 ${m.headTop} ≠ 클락 ${c.top}`).toBeLessThanOrEqual(1);
  // 새로고침 동작 — 오늘 장부를 다시 조회한다
  expect(await step(page, '요약'), '레일에 «요약» 칸이 없다').not.toBeNull();
  await page.waitForTimeout(400);
  const before = calls;
  await page.getByRole('button', { name: '대시보드 새로고침' }).click();
  await expect.poll(() => calls > before, { message: '새로고침을 눌렀는데 오늘 장부를 다시 조회하지 않았다', timeout: 10_000 }).toBe(true);
  await expect(page.getByRole('button', { name: '대시보드 새로고침' }), '새로고침이 끝나지 않는다').toBeEnabled({ timeout: 10_000 });
});

test('1440px — PC 요약은 대시보드 머리줄 그대로(매장 이름·새로고침 하나), 모바일 제목 줄 없음', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 1440);
  await expect(page.locator('[data-pane="dashboard"]')).toBeVisible({ timeout: 20_000 });
  const m = await dashHead(page, MOCK_VENUE_NAME);
  console.log('PC 요약 머리', JSON.stringify(m));
  expect(m.headH, "PC 에 모바일 '오늘 장부 요약' 제목 줄이 보인다").toBeNull();
  expect(m.btns, 'PC 의 보이는 «대시보드 새로고침» 이 하나가 아니다').toBe(1);
  await expect(page.locator('[data-pane="dashboard"]').getByText(MOCK_VENUE_NAME, { exact: true }), 'PC 머리줄의 매장 이름이 없다').toBeVisible();
});
