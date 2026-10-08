// 클락 TV — 브레이크 라벨이 어떤 길이·화면에서도 CURRENT 칸 안에 머문다 (2026-10-09 로티 3차 검수 P1).
//
// 왜: 라벨이 `whitespace-nowrap` + 6.4cqmin 고정이라 포스터 원문 'BREAK TIME 8 MINS / 1,000칩 레이스' 가 1920×1080 에서
//   CURRENT 칸(내용 폭 450px)을 672px 넘어 NEXT 블라인드를 덮었다. 가장 짧은 'BREAK TIME 8 MINS' 도 170px 넘쳤고,
//   1280×720·세로 1080×1920 도 넘쳤다(세로는 화면 밖으로 잘림). 블라인드 숫자는 칸 폭 맞춤(clock-blinds-fit)이 있었는데 라벨만 없었다.
// 고침: ClockStage BlindsRow 브레이크 칸 — 칸 높이는 종전 한 줄 높이 그대로, 글자는 칸 폭 ÷ em 으로 줄이고 → 하한(높이의 절반)에서
//   두 줄 → 그래도 넘치면 말줄임(breakLabelFit.ts).
// 계약: ① 보이는 글자가 CURRENT 칸 내용 상자 안 ② 화면 안 ③ NEXT 블라인드와 안 겹침 ④ 다른 칸 위치(타이머·NEXT·칸·라벨 상자)가
//       기본 'BREAK' 와 같다 ⑤ 글자 하한(칸 높이 ÷ 2.2) ⑥ 실제 포스터 길이 라벨은 잘리지 않고 다 보인다(두 줄 이하)
//       ⑦ 기본 'BREAK' 는 종전 크기·한 줄 그대로.
// 음성 대조: ClockStage 브레이크 <p> 를 종전(`whitespace-nowrap` + fontSize 'clamp(24px, 6.4cqmin, 108px)', span 없이 글자 직접)으로
//   되돌리면 ①③(1920·1280·세로·4K 의 short/long/huge)이 실패한다.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/clock-break-label-fit.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { TV_VENUE as VENUE, serveClock, type ClockShotLevel as Level } from './_clock';

// TV 는 모바일 기기가 아니다 — 하네스 기본(Pixel 7, DPR 2.6)이면 4K 한 장이 1만 px 폭이 된다.
// 서비스 워커는 막는다 — 한 테스트에서 두 번 여는데, 두 번째부터 SW 가 미리 받아 둔 폰트를 내줘 '폰트 OFF' 라우트를 비켜 간다(실측: NEXT 가 21px 이동).
test.use({ deviceScaleFactor: 1, isMobile: false, hasTouch: false, serviceWorkers: 'block' });

const LABELS = {
  short: 'BREAK TIME 8 MINS',
  long: 'BREAK TIME 8 MINS / 1,000칩 레이스',
  huge: 'DINNER BREAK 30 MINS / 1,000칩 레이스 · 컬러업 · 애드온 마감 · 다음 레벨 블라인드 인상 안내',
  token: 'BREAKTIME8MINS/1000CHIPRACE/COLORUP/ADDONCLOSE',
} as const;
type LabelKey = keyof typeof LABELS;
/** 잘리지 않고 전부 보여야 하는 것 = 실제 포스터에 있는 길이(로티 5종 중 최단·최장). */
const MUST_SHOW: LabelKey[] = ['short', 'long'];

function body(label?: string) {
  const levels: Level[] = [
    { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 30 },
    { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, ...(label ? { label } : {}) },
    { kind: 'level', sb: 1500, bb: 3000, ante: 3000, minutes: 30 },
  ];
  return {
    venue_id: VENUE, game_seq: 1, session_date: null, title: '로티 단독 깐부전',
    config: {
      title: '로티 단독 깐부전', startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false, earlyBonus: 5_000, doubleEarlyBonus: 10_000,
      regCloseLevel: 16, maxLevel: 26, earlyDoubleLevel: 1, earlySingleLevel: 4, earlyDoubleMin: 40, earlySingleMin: 100, mysteryBounty: 0,
      prizes: [{ place: '1st', amount: 400 }, { place: '2nd', amount: 150 }], levels,
    },
    current_index: 1, running: true, ends_at: new Date(Date.now() + 6 * 60_000).toISOString(), remaining_ms: 0,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
    live_stats: { entries: 42, rebuys: 6, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
  };
}

type Box = { l: number; r: number; t: number; b: number };
type M = {
  text: string; vis: Box | null; lines: number; cut: boolean; font: number; cqmin: number;
  content: Box; next: Box; timer: Box; cell: Box; pBox: Box; vw: number; vh: number;
};

async function render(page: Page, label: string | undefined, blockFonts: boolean): Promise<M> {
  await page.unroute(/\/rest\/v1\/clock_states/);
  await serveClock(page, body(label));
  await page.goto(`/?display=${VENUE}&g=1&auto=0`);
  await page.locator('[data-testid="clk-timer"]').waitFor({ timeout: 20_000 });
  await expect(page.locator('[data-testid="clk-cur-cue"]').locator('..')).toHaveText(label ?? 'BREAK');
  await page.evaluate(() => document.fonts.ready);
  if (blockFonts) await page.waitForTimeout(300);
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const B = (d: DOMRect): Box => ({ l: d.left, r: d.right, t: d.top, b: d.bottom });
    const cue = document.querySelector('[data-testid="clk-cur-cue"]')!;
    const p = cue.parentElement!; const cell = p.parentElement!;
    // 종전 판에는 span 이 없다(글자가 <p> 바로 아래) — 두 판을 같은 식으로 잰다.
    const textEl = (p.querySelector('[data-testid="clk-break-label"]') as HTMLElement | null) ?? p;
    // 보이는 글자 = 줄마다의 글자 사각형을 overflow 로 자르는 조상(p 까지) 상자와 교차한 것.
    const clips: Box[] = [];
    for (let e: Element | null = textEl; e && e !== cell; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(B(e.getBoundingClientRect()));
    }
    const rects: Box[] = [];
    const walk = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const d of Array.from(rg.getClientRects())) {
        let r = B(d);
        for (const c of clips) r = { l: Math.max(r.l, c.l), r: Math.min(r.r, c.r), t: Math.max(r.t, c.t), b: Math.min(r.b, c.b) };
        if (r.r - r.l > 0.5 && r.b - r.t > 0.5) rects.push(r);
      }
    }
    const vis = rects.length ? rects.reduce((a, r) => ({ l: Math.min(a.l, r.l), r: Math.max(a.r, r.r), t: Math.min(a.t, r.t), b: Math.max(a.b, r.b) })) : null;
    const lines = new Set(rects.map((r) => Math.round(r.t))).size;
    const cb = cell.getBoundingClientRect(); const ccs = getComputedStyle(cell);
    const stage = document.querySelector('[data-testid="clk-timer"]')!.closest('[style*="--clk-bg"]')!.getBoundingClientRect();
    return {
      text: (textEl.textContent ?? '').trim(), vis, lines,
      // 줄 높이 1 이라 글자 내용 영역(약 1.2em)이 scrollHeight 를 몇 px 늘린다 — 숨은 줄이 있으면 한 줄(≥1em)만큼 커진다.
      cut: textEl.scrollHeight > textEl.clientHeight + parseFloat(getComputedStyle(textEl).fontSize) * 0.5,
      font: parseFloat(getComputedStyle(textEl).fontSize),
      cqmin: Math.min(stage.width, stage.height) / 100,
      content: { l: cb.left + parseFloat(ccs.paddingLeft), r: cb.right - parseFloat(ccs.paddingRight), t: cb.top, b: cb.bottom },
      next: B(document.querySelector('[data-testid="clk-next-blinds"]')!.getBoundingClientRect()),
      timer: B(document.querySelector('[data-testid="clk-timer"]')!.getBoundingClientRect()),
      cell: B(cb), pBox: B(p.getBoundingClientRect()), vw: innerWidth, vh: innerHeight,
    };
  });
}

const near = (a: Box, b: Box, what: string) => {
  for (const k of ['l', 'r', 't', 'b'] as const) expect(Math.abs(a[k] - b[k]), `${what}.${k} 가 기본 BREAK 대비 움직였다(${b[k]} → ${a[k]})`).toBeLessThan(0.6);
};

function check(m: M, base: M, key: LabelKey) {
  expect(m.vis, '보이는 글자가 하나도 없다').not.toBeNull();
  const v = m.vis!;
  // ① 칸 안
  expect(v.l, `라벨이 CURRENT 칸 왼쪽을 ${(m.content.l - v.l).toFixed(0)}px 넘는다`).toBeGreaterThanOrEqual(m.content.l - 0.5);
  expect(v.r, `라벨이 CURRENT 칸 오른쪽을 ${(v.r - m.content.r).toFixed(0)}px 넘는다`).toBeLessThanOrEqual(m.content.r + 0.5);
  expect(v.t, '라벨이 CURRENT 칸 위로 넘는다').toBeGreaterThanOrEqual(m.content.t - 0.5);
  expect(v.b, '라벨이 CURRENT 칸 아래로 넘는다').toBeLessThanOrEqual(m.content.b + 0.5);
  // ② 화면 안
  expect(v.l, '라벨이 화면 왼쪽으로 잘린다').toBeGreaterThanOrEqual(-0.5);
  expect(v.r, '라벨이 화면 오른쪽으로 잘린다').toBeLessThanOrEqual(m.vw + 0.5);
  // ③ NEXT 블라인드와 안 겹침
  const ox = Math.min(v.r, m.next.r) - Math.max(v.l, m.next.l); const oy = Math.min(v.b, m.next.b) - Math.max(v.t, m.next.t);
  expect(ox > 0.5 && oy > 0.5, `라벨이 NEXT 블라인드를 덮는다(${ox.toFixed(0)}×${oy.toFixed(0)}px)`).toBe(false);
  // ④ 다른 칸 위치 불변 — 칸 높이를 종전 한 줄 높이로 고정했으므로 기본 'BREAK' 와 같아야 한다
  // 타이머는 초가 흐르며 폴백 폰트(비례 숫자)에서 폭이 바뀐다 — 세로 위치와 가로 중심만 본다.
  expect(Math.abs(m.timer.t - base.timer.t) < 0.6 && Math.abs(m.timer.b - base.timer.b) < 0.6, '타이머 세로 위치가 기본 BREAK 대비 움직였다').toBe(true);
  expect(Math.abs((m.timer.l + m.timer.r) - (base.timer.l + base.timer.r)) / 2, '타이머 가로 중심이 움직였다').toBeLessThan(0.6);
  near(m.next, base.next, 'NEXT 블라인드'); near(m.cell, base.cell, 'CURRENT 칸');
  expect(Math.abs(m.pBox.t - base.pBox.t) < 0.6 && Math.abs(m.pBox.b - base.pBox.b) < 0.6, '라벨 상자 높이가 기본 BREAK 와 다르다').toBe(true);
  // ⑤ 하한 = 칸 높이 ÷ 2.2(두 줄 × 줄 높이 1.1, ≈2.9cqmin · 1920×1080 약 31px) — 먼 자리 가독성(ANTE 3.4·지표 3.6cqmin 바로 아래 층).
  //   칸 높이가 108px 상한에 걸리는 4K 에서는 49px(ANTE·지표도 60px 상한에 걸린다).
  const floor = Math.min(108, Math.max(24, 6.4 * m.cqmin)) / 2.2;
  expect(m.font, `글자 ${m.font}px < 하한 ${floor.toFixed(1)}px`).toBeGreaterThanOrEqual(floor - 0.6);
  // 글자 자체는 바뀌지 않는다(데이터 그대로)
  expect(m.text).toBe(LABELS[key]);
  // ⑥ 실제 포스터 길이 라벨은 말줄임 없이 두 줄 이하로 전부 보인다
  if (MUST_SHOW.includes(key)) {
    expect(m.cut, '포스터 길이 라벨이 말줄임으로 잘렸다').toBe(false);
    expect(m.lines, '두 줄을 넘는다').toBeLessThanOrEqual(2);
  }
}

test.describe('클락 TV — 브레이크 라벨이 CURRENT 칸 안에 머문다', () => {
  const VIEWS: [string, number, number][] = [['1920x1080', 1920, 1080], ['1280x720', 1280, 720], ['1080x1920', 1080, 1920], ['3840x2160', 3840, 2160]];
  for (const [name, w, h] of VIEWS) {
    for (const key of Object.keys(LABELS) as LabelKey[]) {
      test(`🔴 ${name} · ${key} — 칸 안·화면 안·NEXT 안 겹침·다른 칸 위치 불변·하한`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        const base = await render(page, undefined, false);
        // 기본 'BREAK' 는 종전 크기(6.4cqmin, 상한 108px) 그대로 한 줄이다.
        expect(Math.abs(base.font - Math.min(108, Math.max(24, 6.4 * base.cqmin))), `기본 BREAK ${base.font}px ≠ 6.4cqmin`).toBeLessThan(0.6);
        expect(base.lines).toBe(1);
        const m = await render(page, LABELS[key], false);
        check(m, base, key);
        if (key === 'short' && w >= 1920 && h <= w) expect(m.lines, '가장 짧은 포스터 라벨은 TV 에서 한 줄이다').toBe(1);
      });
    }
  }
  for (const key of ['long', 'token'] as const) {
    test(`🔴 1920x1080 · ${key} · 폰트 OFF(폴백) — 같은 계약`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.route(/\.woff2(\?|$)|pretendardvariable-dynamic-subset\.css/, (r) => r.abort());
      const base = await render(page, undefined, true);
      expect(base.lines, '기본 BREAK 는 한 줄').toBe(1);
      check(await render(page, LABELS[key], true), base, key);
    });
  }
});
