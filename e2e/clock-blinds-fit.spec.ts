// 클락 TV — CURRENT/NEXT 블라인드 텍스트가 자릿수가 커져도 **칸 안에** 머문다 (2026-09-13 배포 직전 독립 검증 결함).
//
// 왜 이 스펙인가: clock-visual.spec 의 big-blinds 케이스는 **타이머 폭 안정성**만 재고, 블라인드 글자가 이웃 칸·프라이즈 열·
//   뷰포트 밖으로 넘치는지는 안 봤다(그래서 29 passed 가 이걸 놓쳤다). 실측(검증자, CDP 사각형 교차):
//   폰트 ON · 1920×1080 에서 15,000/30,000 이 NEXT 와 8px 겹치고 프라이즈 열을 30px 침범, 200K/400K 는 99px 겹침·82px 침범,
//   세로 TV(1080×1920)에서는 좌측 16px/68px 잘림. 폴백 폰트에서도 6자리는 24px 겹치던 기존 결함이었다.
// 고침: ClockStage BlindsRow 의 fontSize 를 `min(7.2cqmin, (var(--clk-half) − 5.2cqmin) / em)` 로 칸 폭에 묶었다(index.css --clk-half).
// 계약: ① CUR·NEXT 사각형이 겹치지 않는다 ② 뷰포트 좌우로 잘리지 않는다 ③ 프라이즈 열·지표 레일을 침범하지 않는다
//       ④ 글자는 자기 칸(부모) 폭 안이다 ⑤ 하한(26px/20px)을 깨지 않는다 ⑥ 4자리(500/1,000)는 종전 크기(7.2cqmin) 그대로다.
// 음성 대조: ClockStage 의 CURRENT fontSize 를 `'clamp(26px, 7.2cqmin, 128px)'` 로 되돌리면 mid/big 케이스가 실패한다.
//   index.css 가로 블록의 `--clk-half` 를 지우면(1열 식으로 폴백) 1920×1080 mid/big 이 실패한다.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/clock-blinds-fit.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { TV_VENUE as VENUE, serveClock, type ClockShotLevel as Level } from './_clock';

const SETS: Record<string, Level[]> = {
  normal: [{ kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 }, { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 }],
  mid: [{ kind: 'level', sb: 15_000, bb: 30_000, ante: 30_000, minutes: 20 }, { kind: 'level', sb: 20_000, bb: 40_000, ante: 40_000, minutes: 20 }],
  big: [{ kind: 'level', sb: 200_000, bb: 400_000, ante: 400_000, minutes: 20 }, { kind: 'level', sb: 300_000, bb: 600_000, ante: 600_000, minutes: 20 }],
};
function body(levels: Level[]) {
  return {
    venue_id: VENUE, game_seq: 1, session_date: null, title: '금요 딥스택 100K GTD',
    config: {
      title: '금요 딥스택 100K GTD', startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false, earlyBonus: 5_000, doubleEarlyBonus: 10_000,
      regCloseLevel: 3, maxLevel: 26, earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100, mysteryBounty: 0,
      prizes: [{ place: '1st', amount: 400 }, { place: '2nd', amount: 150 }], levels,
    },
    current_index: 0, running: true, ends_at: new Date(Date.now() + 9 * 60_000).toISOString(), remaining_ms: 0,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
    live_stats: { entries: 42, rebuys: 6, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
  };
}

type Box = { l: number; r: number; w: number; t: number };
type Measure = {
  cur: { box: Box; parent: Box; font: number }; nxt: { box: Box; parent: Box; font: number };
  overlap: number; clipL: number; clipR: number; intoPrizes: number; intoRails: number; cqmin: number;
};
async function measure(page: Page, blockFonts: boolean, levels: Level[], w: number, h: number): Promise<Measure> {
  await page.setViewportSize({ width: w, height: h });
  if (blockFonts) await page.route(/\.woff2(\?|$)|pretendardvariable-dynamic-subset\.css/, (r) => r.abort());
  await serveClock(page, body(levels));
  await page.goto(`/?display=${VENUE}&g=1&auto=0`);
  await page.locator('[data-testid="clk-timer"]').waitFor({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const rect = (el: Element): Box => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, t: b.top }; };
    // 2026-09-19: `.clk-cols .whitespace-nowrap` 의 0·1번째로 잡던 것을 testid 로 고정했다 — 중앙 열에 LEVEL 줄(whitespace-nowrap)이
    //   들어오며 0번째가 LEVEL 이 되어 'CURRENT 와 NEXT 가 겹친다' 10건이 **코드는 멀쩡한데** 빨개졌다(선택자 결합의 거짓 실패).
    const one = (el: Element) => ({ box: rect(el), parent: rect(el.parentElement!), font: parseFloat(getComputedStyle(el).fontSize) });
    const cur = one(document.querySelector('[data-testid="clk-cur-blinds"]')!);
    const nxt = one(document.querySelector('[data-testid="clk-next-blinds"]')!);
    const x = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l));
    const pz = document.querySelector('[data-testid="clk-prizes"]'); const rl = document.querySelector('[data-testid="clk-rails"]');
    return {
      cur, nxt, overlap: x(cur.box, nxt.box), clipL: Math.max(0, -cur.box.l), clipR: Math.max(0, nxt.box.r - innerWidth),
      intoPrizes: pz ? x(cur.box, rect(pz)) : 0, intoRails: rl ? x(nxt.box, rect(rl)) : 0,
      cqmin: Math.min(innerWidth, innerHeight) / 100,
    };
  });
}

test.describe('클락 TV — 블라인드 텍스트가 칸 안에 머문다', () => {
  const VIEWS: [string, number, number][] = [['1920x1080', 1920, 1080], ['1080x1920', 1080, 1920]];
  for (const [name, w, h] of VIEWS) {
    for (const set of ['mid', 'big'] as const) {
      for (const block of [false, true]) {
        test(`🔴 ${name} · ${set}(${SETS[set][0].sb.toLocaleString()}/${SETS[set][0].bb.toLocaleString()}) · 폰트 ${block ? 'OFF' : 'ON'} — 겹침·잘림·침범 0, 칸 안, 하한 유지`, async ({ page }) => {
          const m = await measure(page, block, SETS[set], w, h);
          expect(m.overlap, 'CURRENT 와 NEXT 가 겹친다').toBe(0);
          expect(m.clipL, 'CURRENT 가 뷰포트 왼쪽으로 잘린다').toBe(0);
          expect(m.clipR, 'NEXT 가 뷰포트 오른쪽으로 잘린다').toBe(0);
          expect(m.intoPrizes, 'CURRENT 가 프라이즈 열을 침범한다').toBe(0);
          expect(m.intoRails, 'NEXT 가 지표 레일을 침범한다').toBe(0);
          expect(m.cur.box.w, 'CURRENT 글자가 자기 칸보다 넓다').toBeLessThanOrEqual(m.cur.parent.w + 0.5);
          expect(m.nxt.box.w, 'NEXT 글자가 자기 칸보다 넓다').toBeLessThanOrEqual(m.nxt.parent.w + 0.5);
          expect(m.cur.font, 'CURRENT 하한 26px 이 깨졌다 — TV 는 멀리서 본다').toBeGreaterThanOrEqual(26);
          expect(m.nxt.font, 'NEXT 하한 20px 이 깨졌다').toBeGreaterThanOrEqual(20);
        });
      }
    }
    test(`${name} · normal(500/1,000) 폰트 ON — 4자리는 종전 크기(7.2cqmin) 그대로다(축소 규칙이 기준 화면을 건드리지 않는다)`, async ({ page }) => {
      const m = await measure(page, false, SETS.normal, w, h);
      expect(Math.abs(m.cur.font - 7.2 * m.cqmin), `CURRENT ${m.cur.font}px ≠ 7.2cqmin(${7.2 * m.cqmin})`).toBeLessThan(0.6);
      expect(Math.abs(m.nxt.font - 5.4 * m.cqmin), `NEXT ${m.nxt.font}px ≠ 5.4cqmin`).toBeLessThan(0.6);
      expect(m.overlap).toBe(0);
    });
  }
});
