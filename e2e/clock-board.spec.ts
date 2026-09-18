// 클락 보드 — 오너 지시 2026-09-19 10건 중 **픽셀로만 잴 수 있는 것**의 계약.
//   #2 하단 지표(총 칩·평균 스택·다음 휴식)가 스테이지 정중앙 — TV 와 운영자 전체화면 둘 다(전체화면은 QR 이 없어 종전 −107px 치우침)
//   #3 카운트다운이 본문(상태 바 아래 ~ 하단 레일 위)의 세로 중앙 · CURRENT/NEXT 는 그 아래
//   #9 LEVEL 이 알약 없이 큰 글자 · 상태 단어(READY/RUNNING) 없음
//   #4 전체화면 띠에 시작/일시정지·엔트리·생존·리바이·얼리·애드온 ± 가 있고 44px 이상
//   #6·#7 콘솔에서 Level 이 시작 아래 · 초기화/토너 종료가 콘솔 왼쪽 절반
//   #10 사이드 클락(g=2)도 같은 수치
// 픽스처는 clock-visual.spec 과 같은 조리법(쓰기 0). 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/clock-board.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { TV_VENUE as VENUE, serveClock, type ClockShotLevel as Level } from './_clock';
import { bootOwner, MOCK_VENUE, openMyStore } from './_mockOwner';

const LEVELS: Level[] = [
  { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
  { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
  { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, label: 'BREAK 8Min.' },
  { kind: 'level', sb: 1500, bb: 3000, ante: 3000, minutes: 20 },
];
function row(gameSeq = 1) {
  return {
    venue_id: VENUE, game_seq: gameSeq, session_date: null, title: gameSeq > 1 ? '사이드 터보 30K' : '금요 딥스택 100K GTD',
    config: {
      title: '금요 딥스택 100K GTD', startStack: 50_000, rebuyStack: 70_000, addonStack: 30_000, isAddon: true,
      earlyBonus: 5_000, doubleEarlyBonus: 10_000, regCloseLevel: 3, maxLevel: 26,
      earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100,
      mysteryBounty: 0, prizes: [{ place: '1st', amount: 400 }, { place: '2nd', amount: 150 }], levels: LEVELS,
    },
    current_index: 0, running: true, ends_at: new Date(Date.now() + 12 * 60_000).toISOString(), remaining_ms: 0,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
    live_stats: { entries: 42, rebuys: 6, earlies: 3, addons: 2, alive: 18, eliminations: 24, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
  };
}

type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };
/** 보드 기하 — 스테이지(--clk-bg 루트) 기준. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const r = (el: Element | null): Box | null => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; };
    const timer = document.querySelector('[data-testid="clk-timer"]')!;
    const stage = timer.closest('[style*="--clk-bg"]') as HTMLElement;
    const header = stage.querySelector('header')!;
    const metrics = stage.querySelector('.clk-metrics')!;
    const bottom = metrics.parentElement!;
    const level = document.querySelector('[data-testid="clk-level"]')!;
    const bar = stage.querySelector('[role="progressbar"]')!;
    const cur = Array.from(stage.querySelectorAll('p')).find((p) => p.textContent === 'CURRENT')!;
    const nxt = Array.from(stage.querySelectorAll('p')).find((p) => p.textContent === 'NEXT')!;
    const headerText = header.textContent ?? '';
    return {
      stage: r(stage)!, header: r(header)!, bottom: r(bottom)!, metrics: r(metrics)!,
      timer: r(timer)!, level: { text: level.textContent ?? '', ...r(level)!, radius: getComputedStyle(level).borderRadius, border: getComputedStyle(level).borderTopWidth },
      bar: r(bar)!, cur: r(cur)!, nxt: r(nxt)!, headerText,
      cells: Array.from(metrics.children).map((c) => r(c)!),
    };
  });
}

async function checkBoard(page: Page, tag: string) {
  const g = await geometry(page);
  const bodyTop = g.header.y + g.header.h;
  const bodyBottom = g.bottom.y;
  const bodyCy = (bodyTop + bodyBottom) / 2;
  console.log(`[clock-board ${tag}]`, JSON.stringify({
    stageCx: g.stage.cx, metricsCx: g.metrics.cx, bodyCy, timerCy: g.timer.cy, level: g.level.text, levelH: g.level.h, curY: g.cur.y, nxtY: g.nxt.y, barBottom: g.bar.y + g.bar.h,
  }));
  // #2 하단 지표 중앙 — 셀 묶음의 중심 = 스테이지 중심
  expect(Math.abs(g.metrics.cx - g.stage.cx), `하단 지표 중심이 스테이지 중심에서 ${(g.metrics.cx - g.stage.cx).toFixed(1)}px 벗어났다`).toBeLessThanOrEqual(2);
  expect(g.cells.length).toBeGreaterThanOrEqual(2);
  // #3 카운트다운 세로 중앙 — 타이머 박스 중심 = 본문 중심(상태 바 아래 ~ 하단 레일 위)
  expect(Math.abs(g.timer.cy - bodyCy), `타이머 중심이 본문 중심에서 ${(g.timer.cy - bodyCy).toFixed(1)}px 벗어났다`).toBeLessThanOrEqual(3);
  // #3 CURRENT/NEXT 는 진행 바 아래 — 그리고 라벨 두 줄이 같은 높이(#5 줄간격)
  expect(g.cur.y, 'CURRENT 가 진행 바 위에 있다').toBeGreaterThan(g.bar.y + g.bar.h);
  expect(Math.abs(g.cur.y - g.nxt.y), `CURRENT/NEXT 라벨 높이가 ${(g.cur.y - g.nxt.y).toFixed(1)}px 어긋난다`).toBeLessThanOrEqual(1);
  // #9 LEVEL — 알약 아님(테두리 0·둥근 모서리 0), 큰 글자, 타이머 바로 위, 상태 단어 없음
  expect(g.level.text).toMatch(/^LEVEL \d+$/);
  expect(g.level.border).toBe('0px');
  expect(g.level.radius).toBe('0px');
  expect(g.level.y + g.level.h, 'LEVEL 이 타이머 위에 있지 않다').toBeLessThanOrEqual(g.timer.y + 1);
  expect(g.level.h, 'LEVEL 글자가 종전 알약(2.1cqmin)보다 커야 한다').toBeGreaterThanOrEqual(g.stage.h * 0.04);
  expect(g.headerText, '상태 바에 상태 단어가 남아 있다').not.toMatch(/READY|RUNNING|PAUSED/);
  return g;
}

test.describe('클락 보드 — 2026-09-19 오너 10건(픽셀 계약)', () => {
  for (const [name, w, h] of [['1920x1080', 1920, 1080], ['1280x720', 1280, 720]] as [string, number, number][]) {
    test(`TV ${name} — 하단 지표 중앙 · 타이머 세로 중앙 · LEVEL 큰 글자`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await serveClock(page, row());
      await page.goto(`/?display=${VENUE}&g=1&auto=0`);
      await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      await checkBoard(page, `tv ${name}`);
    });
  }

  test('#10 사이드 클락(g=2)도 같은 계약', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.route(/\/rest\/v1\/clock_states/, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row(1), row(2)]) }));
    await page.goto(`/?display=${VENUE}&g=2&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const g = await checkBoard(page, 'tv side');
    expect(g.headerText).toContain('사이드 터보 30K');
  });

  test('세로 TV(1080x1920) — 하단 지표가 잘리지 않고 중앙', async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 1920 });
    await serveClock(page, row());
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const g = await geometry(page);
    expect(Math.abs(g.metrics.cx - g.stage.cx)).toBeLessThanOrEqual(2);
    for (const c of g.cells) {
      expect(c.x, '하단 셀이 왼쪽으로 잘린다').toBeGreaterThanOrEqual(0);
      expect(c.x + c.w, '하단 셀이 오른쪽으로 잘린다').toBeLessThanOrEqual(1080);
    }
    // 세로에서도 타이머는 본문 중앙
    const bodyCy = (g.header.y + g.header.h + g.bottom.y) / 2;
    expect(Math.abs(g.timer.cy - bodyCy)).toBeLessThanOrEqual(3);
  });

  test('운영자 전체화면 — 지표 중앙(QR 없어도) · #4 조작 띠 12개 · 44px', async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, { viewport: { width: 1920, height: 1080 }, clock: { ...row(), venue_id: MOCK_VENUE } });
    await openMyStore(page);
    const clock = page.locator('[aria-label="매장 단계 이동"] [role=tab]').filter({ hasText: '클락' }).first();
    await expect(clock).toBeVisible({ timeout: 20_000 });
    await clock.click();
    const main = page.getByTestId('clk-main-action');
    await expect(main).toBeVisible({ timeout: 20_000 });

    // #6 시작이 맨 위, Level 은 그 아래 줄 · #7 초기화·토너 종료가 콘솔 왼쪽 절반
    const mainBox = (await main.boundingBox())!;
    const levelRow = (await page.getByTestId('clk-level-row').boundingBox())!;
    expect(levelRow.y, 'Level 줄이 시작 버튼 아래가 아니다').toBeGreaterThanOrEqual(mainBox.y + mainBox.height - 1);
    expect(Math.abs(levelRow.width - mainBox.width), '시작 버튼이 한 줄을 다 쓰지 않는다').toBeLessThanOrEqual(2);
    const danger = page.getByTestId('clk-danger-row');
    const dBox = (await danger.boundingBox())!;
    const reset = (await danger.getByRole('button', { name: '↺ 초기화' }).boundingBox())!;
    const end = (await danger.getByRole('button', { name: '토너 종료' }).boundingBox())!;
    expect(reset.x, '초기화가 왼쪽 끝에 붙어 있지 않다').toBeLessThanOrEqual(dBox.x + 2);
    expect(end.x + end.width, '토너 종료가 콘솔 왼쪽 절반을 벗어났다').toBeLessThanOrEqual(dBox.x + dBox.width / 2);

    await page.getByRole('button', { name: /전체화면/ }).first().click();
    await page.waitForTimeout(800);
    await page.mouse.move(900, 500);
    await page.waitForTimeout(300);
    await checkBoard(page, 'fs');

    // #4 조작 띠 — 시작/일시정지 + 5종 ± + 음소거 + 해제
    const overlay = page.getByTestId('clk-fs-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId('clk-fs-main')).toHaveText(/일시정지|시작|계속하기|다시 시작/);
    for (const label of ['엔트리', '생존', '리바이', '얼리', '애드온']) {
      for (const dir of ['줄이기', '늘리기']) {
        const b = overlay.getByRole('button', { name: new RegExp(`^${label} 1 ${dir}`) });
        await expect(b, `${label} ${dir} 버튼이 없다`).toBeVisible();
        const bb = (await b.boundingBox())!;
        expect(bb.width, `${label} ${dir} 폭 < 44`).toBeGreaterThanOrEqual(44);
        expect(bb.height, `${label} ${dir} 높이 < 44`).toBeGreaterThanOrEqual(44);
      }
    }
    await expect(overlay.getByRole('button', { name: /음소거/ })).toBeVisible();
    await expect(overlay.getByRole('button', { name: '전체화면 해제' })).toBeVisible();
    // 띠가 한 줄에 다 들어간다(줄바꿈 없음) — 1920 에서 버튼들의 y 가 같다.
    const ys = await overlay.locator('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
    expect(new Set(ys).size, `띠가 ${new Set(ys).size}줄로 접혔다: ${ys.join(',')}`).toBe(1);
    // 2.5초 잠잠하면 사라진다 — 송출 화면에 버튼이 남지 않는다.
    await page.waitForTimeout(3200);
    await expect(overlay).toHaveCSS('opacity', '0');
  });
});
