// FULL-RECHECK-2/C(2026-09-26) — 클락 결함 넷의 픽셀·요청 계약.
//   #1 블라인드 수정 시트: SB/BB/ANTE 입력칸 글자 공간 ≥ 7자리 값 폭(390 은 25.5px 에 53px 값이 잘렸다 · PC 도 −0.3px 경계)
//   #2 390 전체화면: 16:9 슬롯(390×166)에 갇혀 타이머(84px 하한)가 우측 레일을 21px 덮었다 → 세로 보드 · 글자 겹침 0
//   #4 비16:9 TV(1280×900): 타이머가 중앙 열을 25px 넘어 레일을 10px 덮었다 → 중앙 열 안 · 16:9 는 픽셀 불변
//   #7 끝난 클락의 CAS 전진 쓰기가 네트워크 실패 때 1초마다 재시도(31회/10초) → 백오프
// 쓰기 0(목킹 업주 · PATCH 는 여기서 끊는다). 실행: E2E_BASE_URL=http://localhost:<preview> npx playwright test e2e/clock-recheck2.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { TV_VENUE, serveClock } from './_clock';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const BIG = [
  { kind: 'level', sb: 1_700_000, bb: 3_400_000, ante: 3_400_000, minutes: 20 },
  { kind: 'level', sb: 2_400_000, bb: 4_800_000, ante: 4_800_000, minutes: 20 },
  { kind: 'level', sb: 2_900_000, bb: 5_800_000, ante: 5_800_000, minutes: 20 },
];
function clockRow(over: Record<string, unknown> = {}, venue = MOCK_VENUE) {
  return {
    venue_id: venue, game_seq: 1, session_date: null, title: '금요 딥스택 100K GTD',
    config: {
      title: '금요 딥스택 100K GTD', startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false,
      earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 3, maxLevel: 26, earlyDoubleLevel: 0, earlySingleLevel: 0,
      earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
      prizes: [{ place: '1st', amount: 4_000_000 }, { place: '2nd', amount: 1_500_000 }], levels: BIG,
    },
    current_index: 0, running: true, ends_at: new Date(Date.now() + 12 * 60_000).toISOString(), remaining_ms: 0,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
    live_stats: { entries: 42, rebuys: 6, earlies: 0, addons: 0, alive: 18, eliminations: 24, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
    ...over,
  };
}

/** 단계 바의 '클락' 칸을 DOM click 으로 누른다(폭에 따라 role 이 tab/button 으로 바뀐다). */
async function openClock(page: Page) {
  await openMyStore(page);
  await expect.poll(() => page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] button, [aria-label="매장 단계 이동"] [role=tab]')]
      .find((x) => x.offsetParent && x.textContent?.trim() === '클락');
    b?.click(); return !!b;
  }), { timeout: 20_000 }).toBe(true);
  await expect(page.getByTestId('clk-timer').first()).toBeVisible({ timeout: 20_000 });
}

/** 입력칸마다 (글자 공간 − 값 글자 폭). 음수면 잘린다. */
const inputSlack = (page: Page) => page.evaluate(() => {
  const ctx = document.createElement('canvas').getContext('2d')!;
  return [...document.querySelectorAll<HTMLInputElement>('[data-testid="clk-live-editor"] input[type=number]')]
    .filter((i) => /SB|BB|앤티/.test(i.getAttribute('aria-label') ?? '') && i.value)
    .map((i) => {
      const cs = getComputedStyle(i);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const avail = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return +(avail - ctx.measureText(i.value).width).toFixed(1);
    });
});

/** 스테이지 안 글자 잎끼리 2px 넘게 겹친 쌍 — 전체화면 조작 띠(오버레이)는 뺀다.
 *  2px: 인라인 숫자의 content-area 가 leading-none 줄 상자 위로 1~2px 솟아 라벨과 닿는 것은 TV(1080×1920)에도 있는 글자 상자 겹침이지 잉크 겹침이 아니다. */
const stageOverlaps = (page: Page) => page.evaluate(() => {
  const timer = document.querySelector<HTMLElement>('[data-testid="clk-timer"]')!;
  const stage = timer.closest<HTMLElement>('[style*="--clk-bg"]')!;
  const leaves = [...stage.querySelectorAll<HTMLElement>('*')].filter((e) => e.children.length === 0 && (e.textContent ?? '').trim()
    && !e.closest('[data-testid="clk-fs-overlay"]') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden');
  const pairs: string[] = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i].getBoundingClientRect(), b = leaves[j].getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 2 && oy > 2) pairs.push(`${leaves[i].textContent} ⟂ ${leaves[j].textContent} (${ox.toFixed(0)}×${oy.toFixed(0)})`);
  }
  const s = stage.getBoundingClientRect(), t = timer.getBoundingClientRect();
  return { pairs, stage: { w: s.width, h: s.height }, timerInside: t.left >= s.left - 0.5 && t.right <= s.right + 0.5 };
});

test.describe('FULL-RECHECK-2/C 클락', () => {
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    test(`#1 블라인드 수정 ${w} — 7자리 SB/BB/ANTE 가 잘리지 않는다`, async ({ page }) => {
      await bootOwner(page, { viewport: { width: w, height: h }, clock: clockRow() });
      await openClock(page);
      await page.getByTestId('clk-edit-structure').click();
      await expect(page.getByTestId('clk-live-editor')).toBeVisible();
      const slack = await inputSlack(page);
      console.log(`[recheck2 #1 ${w}] slack`, JSON.stringify(slack));
      expect(slack.length, '측정한 입력칸이 없다(거짓 통과 방지)').toBeGreaterThanOrEqual(9);
      expect(Math.min(...slack), '입력칸 글자 공간이 값보다 좁다').toBeGreaterThanOrEqual(2);
    });
  }

  test('#2 390 전체화면 — 세로 보드 · 글자 겹침 0', async ({ page }) => {
    await bootOwner(page, { viewport: { width: 390, height: 844 }, clock: clockRow() });
    await openClock(page);
    await page.getByRole('button', { name: '⤢ 전체화면' }).click();
    await expect(page.getByTestId('clk-fs-overlay')).toHaveCount(1);
    await page.waitForTimeout(3200); // 조작 띠가 사라진 뒤(송출 상태) 잰다
    const r = await stageOverlaps(page);
    console.log('[recheck2 #2 390 fs]', JSON.stringify(r));
    expect(r.stage.h, '스테이지가 16:9 슬롯에 갇혀 있다').toBeGreaterThan(r.stage.w);
    expect(r.timerInside, '타이머가 스테이지 폭을 넘는다').toBe(true);
    expect(r.pairs, `겹친 글자: ${r.pairs.join(' | ')}`).toEqual([]);
  });

  for (const [w, h] of [[1280, 900], [1920, 1080], [1080, 1920]] as const) {
    test(`#4 TV ${w}x${h} — 타이머가 중앙 열 안(레일과 겹침 0) · 16:9·세로는 26cqmin 그대로`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await serveClock(page, clockRow({}, TV_VENUE));
      await page.goto(`/?display=${TV_VENUE}&g=1&auto=0`);
      await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const g = await page.evaluate(() => {
        const t = document.querySelector<HTMLElement>('[data-testid="clk-timer"]')!;
        const col = t.parentElement!.parentElement!; // CenterPanel → 중앙 열
        const rails = document.querySelector<HTMLElement>('[data-testid="clk-rails"]')!;
        const tb = t.getBoundingClientRect(), cb = col.getBoundingClientRect(), rb = rails.getBoundingClientRect();
        return { fs: parseFloat(getComputedStyle(t).fontSize), tl: tb.left, tr: tb.right, cl: cb.left, cr: cb.right, colSpill: col.scrollWidth - col.clientWidth, railsL: rb.width > 0 ? rb.left : null };
      });
      console.log(`[recheck2 #4 ${w}x${h}]`, JSON.stringify(g));
      expect(g.colSpill, '중앙 열이 가로로 넘친다').toBeLessThanOrEqual(0);
      expect(g.tl).toBeGreaterThanOrEqual(g.cl - 0.5);
      expect(g.tr).toBeLessThanOrEqual(g.cr + 0.5);
      if (g.railsL != null) expect(g.tr, '타이머가 우측 레일을 덮는다').toBeLessThanOrEqual(g.railsL);
      if (w !== 1280) expect(Math.abs(g.fs - Math.min(w, h) * 0.26), '16:9·세로 TV 타이머 크기가 바뀌었다(픽셀 불변 계약)').toBeLessThanOrEqual(0.5);
    });
  }

  test('#7 끝난 클락 — CAS 전진 쓰기가 실패해도 10초에 5회 이하(백오프)', async ({ page }) => {
    test.setTimeout(90_000);
    const cas: number[] = [];
    const past = new Date(Date.now() - 60_000).toISOString();
    await bootOwner(page, {
      viewport: { width: 1440, height: 900 },
      clock: clockRow({ current_index: BIG.length - 1, ends_at: past }),
      extra: async (p) => {
        await p.route(/\/rest\/v1\/clock_states/, (r) => {
          if (r.request().method() === 'PATCH' && r.request().url().includes('ends_at=eq.')) { cas.push(Date.now()); return r.abort('failed'); }
          return r.fallback();
        });
      },
    });
    await openClock(page);
    await expect.poll(() => cas.length, { timeout: 20_000 }).toBeGreaterThan(0);
    const t0 = cas[0];
    await page.waitForTimeout(10_500);
    const in10 = cas.filter((t) => t - t0 < 10_000).length;
    console.log('[recheck2 #7] CAS PATCH in 10s', in10, JSON.stringify(cas.map((t) => t - t0)));
    expect(in10, '실패한 전진 쓰기를 1초마다 다시 보낸다').toBeLessThanOrEqual(5);
  });
});
