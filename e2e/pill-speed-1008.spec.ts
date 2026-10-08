// 소메뉴 알약이 판보다 늦게 따라오지 않는다 (오너 2026-10-08 "소메뉴 이동이 너무 느리다" · review-218 P3-1).
//
// #218 로 판은 누른 뒤 ~14ms 에 바뀌는데, 알약(SlidingPill)은 --ease-move(양끝 감속)·.22s 라 60ms 에 출발해 226ms 에 섰다.
// 그 ~200ms 동안 '새 내용 + 옛 칸의 알약' 이 보였다. 고침: 알약 전환만 출발이 빠른 감속 곡선(--ease-out-ui)·170ms.
//
// 잰 것: rAF 마다 알약의 translateX(레일 기준 — 가로 스크롤과 무관) → 누른 뒤 +90ms 진행률 · 도착 시각 · 넘침(오버슈트).
//   수정 전 +90ms 진행률 ≈ 0.1(양끝 감속의 앞 구간) → 수정 후 ≈ 0.8. 문턱 0.5 가 둘을 가른다.
// 함께 보는 것: 빠른 왕복(도착 전에 반대로 누름)에서도 정착 오차 < 1px · 모션 감소 설정에서는 사실상 즉시.
// 누름은 page.evaluate(btn.click()) — locator.click 의 자동 스크롤이 레일을 흔들지 않게. 운영 쓰기 0.
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';

type Track = { at: number; x: number }[];

/** 레일 안 버튼 하나를 누르고 rAF 마다 알약 x 를 기록한다. 끝 x 는 활성 타깃의 레일 기준 x. */
const PRESS_AND_TRACK = `async ([id, ms, then]) => {
  const bar = document.querySelector('[data-community-secbar]');
  const pill = bar.querySelector('[data-sliding-pill]');
  const xOf = () => new DOMMatrixReadOnly(getComputedStyle(pill).transform).m41;
  const btn = (k) => bar.querySelector('[data-testid="sec-tab-' + k + '"]');
  const start = xOf();
  const rows = [];
  const t0 = performance.now();
  btn(id).click();
  let thenDone = !then;
  await new Promise((res) => {
    const tick = () => {
      const at = performance.now() - t0;
      rows.push({ at: +at.toFixed(1), x: +xOf().toFixed(2) });
      if (!thenDone && at >= then[1]) { thenDone = true; btn(then[0]).click(); }
      if (at < ms) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  const act = bar.querySelector('[data-pill-active]');
  // 목표 x = 지금 x + (활성 타깃과 알약의 화면 거리). 레일 가로 스크롤·래퍼 구조와 무관하다(정착 뒤엔 scale 1).
  const target = xOf() + (act.getBoundingClientRect().left - pill.getBoundingClientRect().left);
  return { start, rows, target, end: xOf() };
}`;

async function open(page: import('@playwright/test').Page, reduce = false) {
  await stabilizeBackstack(page);
  if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2_000); // 유휴 프리마운트 — 재방문 경로
}

const settle = (page: import('@playwright/test').Page) => page.waitForFunction(() => {
  const bar = document.querySelector('[data-community-secbar]');
  const pill = bar?.querySelector<HTMLElement>('[data-sliding-pill]'); const act = bar?.querySelector('[data-pill-active]');
  if (!pill || !act || document.documentElement.hasAttribute('data-tab-swap')) return false;
  if (pill.getAnimations().some((a) => a.playState !== 'finished')) return false;
  return Math.abs(pill.getBoundingClientRect().left - act.getBoundingClientRect().left) < 1;
}, null, { timeout: 3_000 });

test('P3-1 소메뉴 알약 — 누른 뒤 90ms 에 절반 넘게 와 있고, 넘치지 않고 정착한다', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  const hops = ['board', 'market', 'live', 'venues', 'rank', 'dealer'];
  const lines: string[] = [];
  const fails: string[] = [];
  let measured = 0;
  for (const id of hops) {
    await settle(page);
    const r = await page.evaluate(`(${PRESS_AND_TRACK})(${JSON.stringify([id, 450, null])})`) as {
      start: number; rows: Track; target: number; end: number };
    const dist = r.target - r.start;
    if (Math.abs(dist) < 30) { lines.push(`${id}: 거리 ${dist.toFixed(0)}px — 판정 생략`); continue; }
    measured++;
    const prog = (x: number) => (x - r.start) / dist;
    const at90 = [...r.rows].reverse().find((p) => p.at <= 90);
    const depart = r.rows.find((p) => Math.abs(p.x - r.start) > 1)?.at ?? NaN;
    const arrive = r.rows.find((_p, i) => r.rows.slice(i).every((q) => Math.abs(q.x - r.target) < 1))?.at ?? NaN;
    const over = Math.max(...r.rows.map((p) => prog(p.x)));
    lines.push(`${id}: ${dist.toFixed(0)}px 출발 ${depart.toFixed(0)}ms · +90ms 진행 ${at90 ? prog(at90.x).toFixed(2) : '?'} · 도착 ${arrive.toFixed(0)}ms · 최대 ${over.toFixed(3)}`);
    if (!at90 || prog(at90.x) < 0.5) fails.push(`${id}: +90ms 진행률 ${at90 ? prog(at90.x).toFixed(2) : '없음'} < 0.5 — 알약이 판보다 늦게 따라온다`);
    if (!(arrive <= 260)) fails.push(`${id}: 도착 ${arrive}ms > 260ms`);
    if (over > 1.01) fails.push(`${id}: 목표를 ${((over - 1) * 100).toFixed(1)}% 넘쳤다(오버슈트)`);
    if (Math.abs(r.end - r.target) >= 1) fails.push(`${id}: 정착 오차 ${Math.abs(r.end - r.target).toFixed(2)}px`);
  }
  test.info().annotations.push({ type: 'pill', description: lines.join(' | ') });
  console.log('[pill-speed] ' + lines.join(' | '));
  expect(measured, `잰 이동이 너무 적다: ${lines.join(' | ')}`).toBeGreaterThanOrEqual(4);
  expect(fails, fails.join('\n')).toEqual([]);
});

test('P3-1 빠른 왕복 — 도착 전에 반대로 눌러도 마지막 탭에 1px 안으로 선다', async ({ page }) => {
  await open(page);
  await settle(page);
  for (const [a, b] of [['market', 'live'], ['board', 'rank'], ['dealer', 'venues']] as const) {
    await page.evaluate(`(${PRESS_AND_TRACK})(${JSON.stringify([a, 60, [b, 40]])})`);
    await settle(page).catch(() => {});
    const d = await page.evaluate(() => {
      const bar = document.querySelector('[data-community-secbar]')!;
      const pill = bar.querySelector('[data-sliding-pill]')!; const act = bar.querySelector('[data-pill-active]')!;
      return { dx: Math.abs(pill.getBoundingClientRect().left - act.getBoundingClientRect().left), active: act.closest('button')?.getAttribute('data-testid') };
    });
    expect(d.active, `${a}→${b} 왕복 뒤 활성 탭`).toBe(`sec-tab-${b}`);
    expect(d.dx, `${a}→${b} 왕복 뒤 알약이 ${d.dx.toFixed(2)}px 어긋났다`).toBeLessThan(1);
  }
});

test('P3-1 모션 감소 — 알약은 사실상 즉시 선다(첫 rAF 몇 장 안)', async ({ page }) => {
  await open(page, true);
  await settle(page);
  const r = await page.evaluate(`(${PRESS_AND_TRACK})(${JSON.stringify(['market', 200, null])})`) as { rows: Track; target: number };
  const arrive = r.rows.find((_p, i) => r.rows.slice(i).every((q) => Math.abs(q.x - r.target) < 1))?.at ?? NaN;
  expect(arrive, `모션 감소인데 도착 ${arrive}ms`).toBeLessThanOrEqual(80);
});
