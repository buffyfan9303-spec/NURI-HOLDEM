// PC-MOTION-1010(2026-10-10 오너 "PC 대메뉴 뚝뚝 · GTO 글자/폭 커짐") — PC 상단 대메뉴(GNB)의 세 계약.
//
// 변경 전 실측(artifacts/motion/2026-10-10/before, 1440 다크 · CPU 4):
//   ① GTO 를 드나들 때마다 GNB 의 다른 라벨이 전부 0.41px 씩 옆으로 밀렸다 — 활성 굵기(700)·비활성(500)에서 라틴 글자 'GTO' 만
//      폭이 0.82px 달라지고, GNB 는 가운데 정렬이라 그 절반만큼 전체가 움직인다(한글 라벨은 굵기별 폭이 같아 안 밀린다).
//   ② 활성 밑줄은 활성 버튼의 ::after 라 새 탭으로 **순간이동**했다 — CPU 1 에서도 메인 탭 이동의 프레임 간격은 최대 17ms 로
//      끊김이 없었다. 즉 '뚝뚝' 은 끊김이 아니라 연속 동작의 부재였다.
//   ③ 누른 라벨이 전역 프레스(scale .97)로 줄었다가 0.2s 에 걸쳐 되돌아오며 굵어짐과 겹쳐 '글자가 커진다' 로 보였다.
// 고친 것: 굵은 폭을 칸에 미리 잡는 라벨(App TabBar) · 공용 SlidingPill 밑줄 · GNB 탭 프레스 끔(index.css).
// 음성 대조: 변경 전 빌드(dist-before)에 이 파일을 돌리면 세 테스트가 모두 빨개진다(HANDOFF PC-MOTION-1010 절).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const GNB = '[data-stack-tabbar]';
const tab = (page: Page, name: string) => page.locator(GNB).getByRole('tab', { name, exact: true });

async function boot(page: Page) {
  await page.goto('/');
  await expect(tab(page, 'GTO')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200); // 첫 배치·폰트 스왑이 끝난 뒤의 좌표를 잰다
}

/** 탭을 누르는 동안과 뒤 ms 동안 rAF 마다 GNB 라벨 왼쪽 좌표·밑줄 상자를 모은다. 누름은 실제 마우스(누른 채 holdMs). */
type Sample = { t: number; lefts: number[]; pill: number[] | null; ease: string | null; press: string | null; tint: string | null };
async function sampleWhile(page: Page, name: string, ms: number, holdMs = 90) {
  const box = (await tab(page, name).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250); // hover 틴트 전환이 끝난 자리 — 누름 틴트와 구별하는 기준
  const hoverTint = await tab(page, name).evaluate((b) => getComputedStyle(b.firstElementChild!).backgroundColor);
  await page.evaluate(() => {
    const w = window as unknown as { __g: { s: Sample[]; on: boolean } };
    w.__g = { s: [], on: true };
    const loop = () => {
      if (!w.__g.on) return;
      const tabs = [...document.querySelectorAll<HTMLElement>('[data-stack-tabbar] [role="tab"]')];
      const p = document.querySelector<HTMLElement>('[data-stack-tabbar] [data-sliding-pill]');
      const pr = p?.getBoundingClientRect();
      const act = document.querySelector<HTMLElement>('[data-stack-tabbar] button:active');
      w.__g.s.push({ t: performance.now(), lefts: tabs.map((e) => e.getBoundingClientRect().left),
        pill: pr && Number(getComputedStyle(p!).opacity) > 0 ? [pr.left, pr.width] : null,
        ease: p && p.getAnimations().length ? getComputedStyle(p).transitionTimingFunction : null,
        press: act ? getComputedStyle(act).transform : null,
        tint: act?.firstElementChild ? getComputedStyle(act.firstElementChild).backgroundColor : null });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await page.waitForTimeout(ms);
  const s = await page.evaluate(() => {
    const w = window as unknown as { __g: { s: Sample[]; on: boolean } };
    w.__g.on = false; return w.__g.s;
  });
  return Object.assign(s, { hoverTint });
}

/** 활성 라벨 캡슐(밑줄 대상)의 기대 밑줄 상자 — 좌우 8px 안쪽. */
const wantPill = (page: Page) => page.evaluate(() => {
  const c = document.querySelector<HTMLElement>('[data-stack-tabbar] [data-pill-active]');
  if (!c) return null; const r = c.getBoundingClientRect(); return [r.left + 8, r.width - 16];
});

test('🔴 ① GTO 를 드나들어도 다른 GNB 라벨은 1px 의 1/20 도 움직이지 않는다(굵기 폭 고정)', async ({ page }) => {
  await boot(page);
  const lefts: number[][] = [];
  const read = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-stack-tabbar] [role="tab"]')].map((e) => e.getBoundingClientRect().left));
  lefts.push(await read());
  for (const n of ['GTO', '커뮤니티', 'GTO', '홈']) {
    await tab(page, n).click();
    await expect(tab(page, n)).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(400);
    lefts.push(await read());
  }
  expect(lefts[0].length, 'GNB 탭을 못 찾았다(빈 측정)').toBeGreaterThanOrEqual(5);
  let worst = 0;
  for (const l of lefts) l.forEach((x, i) => { worst = Math.max(worst, Math.abs(x - lefts[0][i])); });
  expect(worst, `GNB 라벨이 탭 전환마다 옆으로 밀린다(최대 ${worst.toFixed(2)}px) — 굵기 전환이 칸 폭을 바꾼다: ${JSON.stringify(lefts.map((l) => l.map((x) => x.toFixed(2))))}`).toBeLessThan(0.05);
});

test('🔴 ② 활성 밑줄은 새 탭으로 미끄러져 간다(순간이동 아님) · 도착 상자는 라벨 캡슐 안쪽 8px', async ({ page }) => {
  await boot(page);
  const from = await wantPill(page);
  expect(from, '활성 라벨 캡슐([data-pill-active])이 없다').not.toBeNull();
  const s = await sampleWhile(page, 'GTO', 600);
  // 도착 확인 — 클릭이 아무 일도 안 했으면 from==to 라 '중간 없음·도착 일치' 가 공허하게 통과한다(Codex 리뷰 2026-10-10).
  await expect(tab(page, 'GTO')).toHaveAttribute('aria-selected', 'true');
  const to = await wantPill(page);
  expect(Math.abs(to![0] - from![0]), '출발·도착 밑줄 상자가 같다 — 탭이 바뀌지 않았다').toBeGreaterThan(20);
  const xs = s.map((e) => e.pill?.[0]).filter((x): x is number => typeof x === 'number');
  expect(xs.length, `밑줄(SlidingPill)이 GNB 에 안 그려진다 — 표본 ${s.length}개 중 밑줄 0`).toBeGreaterThan(5);
  const lo = Math.min(from![0], to![0]) + 2, hi = Math.max(from![0], to![0]) - 2;
  const mids = new Set(xs.filter((x) => x > lo && x < hi).map((x) => Math.round(x)));
  expect(mids.size, `밑줄이 ${from![0].toFixed(1)}→${to![0].toFixed(1)} 사이를 지나가지 않았다(순간이동): ${JSON.stringify(xs.map((x) => Math.round(x)))}`).toBeGreaterThanOrEqual(3);
  const last = s[s.length - 1].pill!;
  expect(Math.abs(last[0] - to![0]), `밑줄 도착 x ${last[0]} ≠ 기대 ${to![0]}`).toBeLessThan(1);
  expect(Math.abs(last[1] - to![1]), `밑줄 도착 폭 ${last[1]} ≠ 기대 ${to![1]}`).toBeLessThan(1);
  // 2차(스프링 안착) — 비행 중 곡선이 스프링 linear() 이고, 넘침은 절제(≤8px) 안이다.
  const eases = s.map((e) => e.ease).filter((e): e is string => !!e);
  expect(eases.length, '밑줄 비행 중 표본 0 — 전환이 안 돌았다').toBeGreaterThan(0);
  expect(eases.every((e) => e.startsWith('linear(')), `밑줄 곡선이 스프링이 아니다: ${eases[0]}`).toBe(true);
  const dir = Math.sign(to![0] - from![0]);
  const over = Math.max(0, ...xs.map((x) => (x - to![0]) * dir));
  expect(over, `밑줄이 도착점을 ${over.toFixed(1)}px 넘어갔다 — 과한 튕김`).toBeLessThanOrEqual(8);
});

test('🔴 ③ GNB 탭은 누르는 동안 줄지 않는다(전역 프레스 scale 이 라벨을 키우며 돌아오지 않게)', async ({ page }) => {
  await boot(page);
  const s = await sampleWhile(page, '커뮤니티', 300, 160);
  await expect(tab(page, '커뮤니티')).toHaveAttribute('aria-selected', 'true'); // 누름이 실제 클릭으로 끝났는가
  expect(s.length, 'rAF 표본 0 — 측정이 돌지 않았다').toBeGreaterThan(5);
  const pressed = s.filter((e) => e.press !== null);
  expect(pressed.length, '누르는 동안(:active) 표본이 0 — 측정이 누름을 못 잡았다').toBeGreaterThan(0);
  expect(pressed.filter((e) => e.press !== 'none').map((e) => e.press), 'GNB 탭이 눌린 동안 transform 이 걸렸다').toEqual([]);
  // 크기 대신 캡슐 틴트가 손끝 반응을 맡는다 — 첫 누름 프레임부터 hover 와 다른 색(전환 0).
  expect(pressed[0].tint, `누른 첫 프레임 틴트가 hover(${s.hoverTint})와 같다 — 누름 반응이 없다`).not.toBe(s.hoverTint);
  expect(pressed[0].tint).not.toBe('rgba(0, 0, 0, 0)');
});

// RAPID-1010 — 비행 중 다른 탭을 누르면 밑줄은 그 자리(위치·폭)에서 새 탭으로 간다. 변경 전: 동결 표식이 전환을 취소해 옛 목표로 ~175px 튀었다
//   (artifacts/motion/2026-10-10/polish/rapid/prefix). 클릭은 페이지 안 btn.click() — 비행 시작 rAF 기준 정확한 시각이 필요하다.
for (const d of [50, 90]) test(`🔴 ⑤ 연타(${d}ms) — 밑줄은 비행 중 자리에서 이어 가고 튀지 않는다`, async ({ page }) => {
  await boot(page);
  for (const n of ['일정 탐색', '캘린더', '홈']) { await tab(page, n).click(); await page.waitForTimeout(900); } // 첫 방문 lazy 청크를 미리 데운다
  const r = await page.evaluate((d) => new Promise<{ I: number[]; sync: number[]; pre: number; post: number[][]; c: [number, number]; selB: string | null; selC: string | null }>((res) => {
    const bar = document.querySelector<HTMLElement>('[data-stack-tabbar]')!;
    const tabs = [...bar.querySelectorAll<HTMLElement>('[role="tab"]')];
    const by = (n: string) => tabs.find((t) => t.innerText.trim() === n)!;
    const pill = bar.querySelector<HTMLElement>('[data-sliding-pill]')!;
    const box = () => { const b = pill.getBoundingClientRect(); return [b.left, b.width]; };
    const x0 = box()[0];
    let I: number[] = [], sync: number[] = [], pre = 0, moved = false, clicked = 0;
    const post: number[][] = [];
    const loop = () => {
      const s = box();
      if (clicked) post.push(s); else if (moved) pre++;
      if (!moved && Math.abs(s[0] - x0) > 0.5) {
        moved = true;
        setTimeout(() => { I = box(); clicked = performance.now(); by('일정 탐색').click(); sync = box(); }, d);
      }
      if (clicked && performance.now() - clicked > 1200) {
        const c = by('일정 탐색').querySelector<HTMLElement>('[data-pill-active]')!.getBoundingClientRect();
        return res({ I, sync, pre, post, c: [c.left + 8, c.width - 16], selB: by('캘린더').getAttribute('aria-selected'), selC: by('일정 탐색').getAttribute('aria-selected') });
      }
      requestAnimationFrame(loop);
    };
    by('캘린더').click();
    requestAnimationFrame(loop);
  }), d);
  expect(r.pre, '두 번째 클릭 전 비행 표본 0 — 연타가 비행 중에 들어가지 않았다').toBeGreaterThan(0);
  expect(r.selC, '두 번째 탭이 선택되지 않았다').toBe('true');
  expect(Math.abs(r.I[0] - r.c[0]), '비행 중 자리와 새 목표가 같다 — 시나리오가 공허하다').toBeGreaterThan(20);
  expect(Math.abs(r.sync[0] - r.I[0]), `클릭 직후 밑줄 x 가 ${r.I[0].toFixed(1)}→${r.sync[0].toFixed(1)} 로 튀었다`).toBeLessThan(2);
  expect(Math.abs(r.sync[1] - r.I[1]), `클릭 직후 밑줄 폭이 ${r.I[1].toFixed(1)}→${r.sync[1].toFixed(1)} 로 튀었다`).toBeLessThan(2);
  const lo = Math.min(r.I[0], r.c[0]) - 8, hi = Math.max(r.I[0], r.c[0]) + 8;
  const out = r.post.map(([x]) => Math.max(0, lo - x, x - hi));
  expect(Math.max(0, ...out), `클릭 뒤 밑줄이 [${lo.toFixed(0)}, ${hi.toFixed(0)}] 밖으로 튀었다: ${JSON.stringify(r.post.slice(0, 12).map(([x]) => Math.round(x)))}`).toBeLessThan(1);
  const [ex, ew] = r.post[r.post.length - 1];
  expect(Math.abs(ex - r.c[0]), '밑줄이 마지막 탭에 도착하지 않았다').toBeLessThan(1);
  expect(Math.abs(ew - r.c[1]), '밑줄 도착 폭이 마지막 탭과 다르다').toBeLessThan(1);
});

// SAMEKEY-1010 — 밑줄이 비행 중일 때 **같은 대메뉴 안 하위 탭**(커뮤니티 섹션)을 누르면 GNB activeKey 는 그대로다.
//   변경 전: holdSwap 이 세운 밑줄을 아무도 다시 띄우지 않아 SlidingPill verify 가 목표로 순간이동시켰다(d50: 한 프레임 103px —
//   artifacts/motion/2026-10-10/polish/samekey/prefix). 이제 releaseSwap 이 세우기 전 목표로 다시 띄운다(lib/tabCover).
for (const d of [50, 90]) test(`🔴 ⑥ 비행 중 같은 대메뉴 하위 탭(${d}ms) — 밑줄은 멈췄다 튀지 않고 이어서 도착한다`, async ({ page }) => {
  await boot(page);
  for (const n of ['커뮤니티', '홈']) { await tab(page, n).click(); await page.waitForTimeout(1200); } // 커뮤니티 판을 미리 데운다
  const r = await page.evaluate((d) => new Promise<{ I: number[]; pre: number[]; post: { x: number; w: number; f: boolean }[]; c: [number, number]; sec: string | null; secOn: string | null; selB: string | null }>((res) => {
    const bar = document.querySelector<HTMLElement>('[data-stack-tabbar]')!;
    const b = [...bar.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.innerText.trim() === '커뮤니티')!;
    const pill = bar.querySelector<HTMLElement>('[data-sliding-pill]')!;
    const x0 = pill.getBoundingClientRect().left;
    let I: number[] = [], moved = false, clicked = 0, sec: HTMLElement | undefined;
    const pre: number[] = [];
    const post: { x: number; w: number; f: boolean }[] = [];
    const loop = () => {
      const q = pill.getBoundingClientRect();
      if (clicked) post.push({ x: q.left, w: q.width, f: bar.hasAttribute('data-swap-freeze') }); else if (moved) pre.push(q.left);
      if (!moved && Math.abs(q.left - x0) > 0.5) {
        moved = true;
        setTimeout(() => {
          const pane = document.querySelector('.tab-pane[data-tab="community"]')!;
          sec = [...pane.querySelectorAll<HTMLElement>('[data-testid^="sec-tab-"]')].find((e) => e.getAttribute('aria-pressed') === 'false' && e.getClientRects().length > 0);
          const p = pill.getBoundingClientRect(); I = [p.left, p.width]; clicked = performance.now(); sec?.click();
        }, d);
      }
      if (clicked && performance.now() - clicked > 1200) {
        const c = b.querySelector<HTMLElement>('[data-pill-active]')!.getBoundingClientRect();
        return res({ I, pre, post, c: [c.left + 8, c.width - 16], sec: sec?.getAttribute('data-testid') ?? null, secOn: sec?.getAttribute('aria-pressed') ?? null, selB: b.getAttribute('aria-selected') });
      }
      requestAnimationFrame(loop);
    };
    b.click();
    requestAnimationFrame(loop);
  }), d);
  expect(r.sec, '보이는 커뮤니티 판에 누를 하위 탭이 없다 — 시나리오가 공허하다').not.toBeNull();
  expect(r.secOn, '하위 탭이 선택되지 않았다(판 교체가 없었다)').toBe('true');
  expect(r.selB).toBe('true');
  expect(r.pre.length, '하위 탭 클릭 전 비행 표본 0').toBeGreaterThan(0);
  expect(Math.abs(r.I[0] - r.c[0]), '클릭 순간 밑줄이 이미 도착해 있다 — 시나리오가 공허하다').toBeGreaterThan(10);
  const steps = (xs: number[]) => xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
  const preMax = Math.max(0, ...steps(r.pre));
  const postXs = [r.I[0], ...r.post.map((s) => s.x)];
  const postMax = Math.max(0, ...steps(postXs));
  expect(postMax, `클릭 뒤 한 프레임 이동 ${postMax.toFixed(1)}px > 비행 중 최대 ${preMax.toFixed(1)}px×1.5+4 — 순간이동: ${JSON.stringify(postXs.slice(0, 14).map(Math.round))}`).toBeLessThanOrEqual(preMax * 1.5 + 4);
  // 동결이 풀린 뒤 목표에서 떨어진 채 멈춘 프레임이 3 연속 이상이면 '멈춤'
  let still = 0, worst = 0;
  for (let i = 1; i < r.post.length; i++) {
    const s = r.post[i], p = r.post[i - 1];
    still = !s.f && !p.f && Math.abs(s.x - p.x) < 0.1 && Math.abs(s.x - r.c[0]) > 1 ? still + 1 : 0;
    worst = Math.max(worst, still);
  }
  expect(worst, '동결이 풀린 뒤 밑줄이 목표 앞에서 멈춰 있다').toBeLessThan(3);
  const lo = Math.min(r.I[0], r.c[0]) - 8, hi = Math.max(r.I[0], r.c[0]) + 8;
  expect(Math.max(0, ...r.post.map(({ x }) => Math.max(0, lo - x, x - hi))), '밑줄이 출발·도착 밖으로 샜다').toBeLessThan(1);
  const last = r.post[r.post.length - 1];
  expect(Math.abs(last.x - r.c[0]), '밑줄이 활성 탭에 도착하지 않았다').toBeLessThan(1);
  expect(Math.abs(last.w - r.c[1]), '밑줄 도착 폭이 활성 탭과 다르다').toBeLessThan(1);
});

test.describe('동작 줄이기', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('reduce — 밑줄은 미끄러지지 않고 바로 새 탭에 선다', async ({ page }) => {
    await boot(page);
    const from = await wantPill(page);
    expect(from, '활성 라벨 캡슐([data-pill-active])이 없다').not.toBeNull();
    const s = await sampleWhile(page, '라이브', 400);
    // 도착·이동 확인 — 클릭이 무효(no-op)면 from==to 라 아래 두 단언이 공허하게 통과한다(Codex 최종 리뷰 2026-10-10).
    await expect(tab(page, '라이브')).toHaveAttribute('aria-selected', 'true');
    const to = await wantPill(page);
    expect(Math.abs(to![0] - from![0]), '출발·도착 밑줄 상자가 같다 — 탭이 바뀌지 않았다').toBeGreaterThan(20);
    const xs = s.map((e) => e.pill?.[0]).filter((x): x is number => typeof x === 'number');
    expect(xs.length, `밑줄 표본 0 — reduce 에서 밑줄이 안 그려진다(표본 ${s.length}개)`).toBeGreaterThan(5);
    const lo = Math.min(from![0], to![0]) + 2, hi = Math.max(from![0], to![0]) - 2;
    expect(xs.filter((x) => x > lo && x < hi), 'reduce 인데 밑줄이 중간 지점을 지나갔다').toEqual([]);
    expect(Math.abs(xs[xs.length - 1] - to![0])).toBeLessThan(1);
  });
});
