// 재점검 1회차(2026-10-03) 리모컨·순위 단계 — N-4 가로 2열 · L1-3 −/+ 틈 · L1-4 로그인 44px · L1-2 순위 단계 첫 방문 밀림.
// 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\recheck1-screens-1003.md
// 목킹 업주(_mockOwner) — 쓰기는 이 파일의 라우트가 받고 끝난다(운영 쓰기 0).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const level = (sb: number, bb: number) => ({ kind: 'level', sb, bb, ante: bb, minutes: 20 });
const clockRow = () => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: '수요 딥스택',
  config: {
    title: '수요 딥스택', startStack: 50_000, rebuyStack: 70_000, addonStack: 30_000, isAddon: true,
    earlyBonus: 5_000, doubleEarlyBonus: 10_000, regCloseLevel: 12, maxLevel: 18,
    earlyDoubleLevel: 2, earlySingleLevel: 4, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
    prizes: [], levels: [level(100, 200), level(200, 400), level(300, 600)],
  },
  current_index: 1, running: false, ends_at: null, remaining_ms: 20 * 60_000,
  adj_entries: 3, adj_rebuys: 1, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null,
  updated_at: new Date().toISOString(),
});

async function openRemote(page: Page, w: number, h: number) {
  const rpc: Record<string, unknown>[] = [];
  await bootOwner(page, {
    viewport: { width: w, height: h }, clock: clockRow(), goto: false,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/clock_adjust_counts/, async (r) => {
        rpc.push(r.request().postDataJSON() as Record<string, unknown>);
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ eliminations: 0, adj_entries: 3, adj_rebuys: 1, adj_earlies: 0, adj_addons: 0 }]) });
      });
    },
  });
  await page.goto(`/?remote=${MOCK_VENUE}&g=1`);
  await expect(page.getByRole('button', { name: '엔트리 더하기' })).toBeEnabled({ timeout: 20_000 });
  return rpc;
}

/** 리모컨 조작 버튼이 스크롤 없이 화면 안에 다 들어오는가 — 밖이면 어느 버튼이 몇 px 밖인지. */
const offscreen = (page: Page) => page.evaluate(() => {
  const names = ['이전 레벨', '다음 레벨', 'START', '−1분', '−10초', '+10초', '+1분'];
  const btns = [...document.querySelectorAll<HTMLButtonElement>('[data-scroll-lock] button')]
    .filter((b) => names.some((n) => b.textContent?.includes(n)) || /빼기|더하기/.test(b.getAttribute('aria-label') ?? ''));
  const out: string[] = [];
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    const over = Math.max(r.bottom - innerHeight, r.right - innerWidth, -r.top, -r.left);
    if (over > 0.5) out.push(`${b.getAttribute('aria-label') ?? b.textContent?.trim()} +${over.toFixed(0)}`);
  }
  const sc = document.querySelector<HTMLElement>('[data-scroll-lock] > div.overflow-y-auto')!;
  return { n: btns.length, out, scroll: sc.scrollHeight - sc.clientHeight, minH: Math.min(...btns.map((b) => b.getBoundingClientRect().height)) };
});

for (const [w, h, strict] of [[740, 360, true], [844, 390, true], [390, 844, true], [360, 780, false]] as const) {
  test(`N-4 리모컨 ${w}×${h} — START·시간 보정·인원 조작이 스크롤 없이 닿는다${strict ? '' : '(기록만)'}`, async ({ page }) => {
    await openRemote(page, w, h);
    const m = await offscreen(page);
    console.log(`[N-4 ${w}x${h}] ${JSON.stringify(m)}`);
    expect(m.n).toBe(17);   // 레벨 2 · START 1 · 시간 4 · 인원 −/+ 10
    expect(m.minH, '조작 칸 높이 44px 미만').toBeGreaterThanOrEqual(44);
    if (strict) expect(m.out, `화면 밖 조작: ${m.out.join(', ')}`).toEqual([]);
  });
}

test('L1-3 리모컨 — −/+ 사이 틈 어디를 눌러도 가까운 쪽 버튼이고, 실제 터치(CDP 120ms)도 그 쪽으로 간다', async ({ page }) => {
  const rpc = await openRemote(page, 390, 844);
  const minus = page.getByRole('button', { name: '엔트리 빼기' });
  const plus = page.getByRole('button', { name: '엔트리 더하기' });
  // 보이는 알약(버튼 안 span, 없으면 버튼 자신) 사이의 틈
  const gap = await page.evaluate(() => {
    const pill = (b: Element) => (b.querySelector('span') ?? b).getBoundingClientRect();
    const m = pill(document.querySelector('[aria-label="엔트리 빼기"]')!), p = pill(document.querySelector('[aria-label="엔트리 더하기"]')!);
    const y = m.top + m.height / 2;
    const hits: string[] = [];
    for (let x = Math.ceil(m.right); x < p.left; x++) {
      const el = document.elementFromPoint(x, y)?.closest('button');
      hits.push(el?.getAttribute('aria-label')?.endsWith('빼기') ? '−' : el?.getAttribute('aria-label')?.endsWith('더하기') ? '+' : '·');
    }
    return { left: m.right, right: p.left, y, hits: hits.join('') };
  });
  console.log(`[L1-3] 틈 ${(gap.right - gap.left).toFixed(1)}px 판정 '${gap.hits}'`);
  expect(gap.right - gap.left, '틈이 12px 보다 좁다').toBeGreaterThanOrEqual(11.5);
  expect(gap.hits, '틈에 버튼이 아닌 자리(·)가 있다 — 브라우저 터치 보정이 임의로 붙인다').not.toContain('·');
  expect(gap.hits, '틈 왼쪽 반이 − 가 아니다').toMatch(/^−+\+*$/);
  const mid = (gap.left + gap.right) / 2;
  const cdp = await page.context().newCDPSession(page);
  const tap = async (x: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: gap.y }] });
    await new Promise((r) => setTimeout(r, 120));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(700);
  };
  await tap(mid - 3);
  await tap(mid + 3);
  await expect.poll(() => rpc.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  const ds = rpc.map((b) => Number(b.p_d_entries ?? 0)).filter(Boolean);
  console.log(`[L1-3] 터치 차분 ${JSON.stringify(ds)}`);
  expect(ds.slice(0, 2), '틈 왼쪽 터치는 −1, 오른쪽은 +1').toEqual([-1, 1]);
  await expect(minus).toBeVisible(); await expect(plus).toBeVisible();
});

test('L1-4 리모컨 로그인 전 — 로그인 버튼 높이 44px 이상(360)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/?remote=${MOCK_VENUE}&g=1`);
  const b = page.locator('[data-scroll-lock]').getByRole('button', { name: '로그인', exact: true });
  await expect(b).toBeVisible({ timeout: 20_000 });
  const box = (await b.boundingBox())!;
  console.log(`[L1-4] 로그인 ${box.width.toFixed(1)}×${box.height.toFixed(1)}`);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

// ── L1-2 내 매장 › 순위 첫 방문 — 늦게 오는 그날 게임 목록이 '그날 장부 명단' 카드를 밀지 않는다 ──
test('L1-2 순위 단계 첫 방문(1440) — 장부 게임이 600ms 늦게 와도 장부 명단 카드가 움직이지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  const session = {
    venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 2, buyin_amount: 50_000, card_amount: null, game_type: 'gtd',
    target_entries: 0, max_entries: 0, is_addon: false, addon_stack: 0, title: '나이트 사이드', discounts: [],
    early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false, opened_at: new Date().toISOString(), tournament_start: null, schedule_id: null,
  };
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        await new Promise((res) => setTimeout(res, 600));
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? null : [session]) });
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-rail]')).toBeVisible({ timeout: 20_000 });
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] button')].find((x) => getComputedStyle(x).display !== 'none' && /순위/.test(x.textContent ?? ''));
    b?.click(); return !!b;
  });
  expect(ok, '레일에 순위 칸이 없다').toBe(true);
  // 카드가 처음 보인 순간부터 2초 동안 top 을 프레임마다 기록한다
  const ys = await page.evaluate(async () => {
    const find = () => [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('그날 장부 명단'));
    const t0 = performance.now();
    while (!find() && performance.now() - t0 < 15_000) await new Promise((r) => requestAnimationFrame(r));
    const out: number[] = [];
    const t1 = performance.now();
    while (performance.now() - t1 < 2_000) {
      const b = find();
      if (b) out.push(Math.round(b.getBoundingClientRect().top + scrollY));
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  });
  const shift = Math.max(...ys) - Math.min(...ys);
  console.log(`[L1-2] 카드 top ${ys[0]} → ${ys[ys.length - 1]} · 최대 이동 ${shift}px (${ys.length}프레임)`);
  await expect(page.getByText('장부 게임').first()).toBeVisible();
  expect(ys.length).toBeGreaterThan(10);
  expect(shift, '장부 게임 목록이 늦게 와서 카드가 밀렸다').toBeLessThanOrEqual(1);
});
