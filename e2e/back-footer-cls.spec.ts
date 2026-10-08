/**
 * 초안(root-cause-debugger 2026-10-04) — 뒤로가기로 탭이 돌아올 때 사업자 푸터가 '입력 없는 레이아웃 이동'으로 잡히지 않는다.
 *
 * 원인: 푸터(.reveal > footer)는 keep-alive 판(.tab-pane) **밖의 단 하나의 노드**라 문서 위치 = 활성 판 높이다.
 *   뒤로가기(popstate)는 판 교체 + 스크롤 복원을 한 프레임에 하므로, 두 판 높이가 다르면 같은 노드가 그만큼 옮겨진다.
 *   탭을 눌러 간 이동은 hadRecentInput 으로 빠지지만, 안드로이드 뒤로 제스처·브라우저 뒤로는 입력이 아니라 CLS 에 그대로 들어간다.
 * 데이터 비결합: 떠날 판(B)에 테스트가 min-height 를 걸어 '돌아올 판보다 900px 길다'를 만든다 — 운영 데이터 높이와 무관하게 조건이 선다.
 * 전 범위: 홈·라이브·커뮤니티·GTO·캘린더 중 A→B→뒤로 16쌍(B=홈 제외 — 홈을 누르면 트레일이 비워져 뒤로가 복원 경로가 아니다).
 * 거짓 통과 방지: 쌍마다 ① B 가 실제로 활성이었다 ② 복원 뒤 A 가 활성 ③ scrollY 가 저장값과 같다 ④ 복원 뒤 푸터가 화면 안 을 먼저 단언한다.
 */
import { devices, type Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

const NAV = 'nav[aria-label="하단 내비게이션"]';
const NAME: Record<string, string> = { home: '홈', live: '라이브', community: '커뮤니티', tools: 'GTO', calendar: '캘린더' };
const TABS = Object.keys(NAME);

const activeTab = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((p) => !p.hasAttribute('data-pane-leaving') && p.style.display !== 'none')?.dataset.tab ?? '?');

async function tapTab(page: Page, tab: string) {
  // 신뢰 입력(터치) — 앞으로 가는 이동은 hadRecentInput 으로 CLS 에서 빠지는 것이 정상이다
  const box = await page.locator(NAV).getByRole('button', { name: new RegExp(`^${NAME[tab]}`) }).first().boundingBox();
  expect(box, `${tab} 탭 버튼`).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect.poll(() => activeTab(page)).toBe(tab);
  await page.waitForTimeout(700); // 떠나는 판 페이드(LEAVE_FADE_MS) 정착
}

/** 바닥 근처로 스크롤 — 하단바 자동숨김이 걸리면 위로 조금 올려 다시 보이게 한다. 저장값을 돌려준다. */
async function scrollNearBottom(page: Page) {
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(300);
  await page.evaluate(() => scrollBy({ top: -60, behavior: 'instant' as ScrollBehavior }));
  for (let k = 0; k < 8 && await page.evaluate(() => document.documentElement.hasAttribute('data-tabbar-hidden') && scrollY > 0); k++) {
    await page.evaluate(() => scrollBy({ top: -30, behavior: 'instant' as ScrollBehavior }));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  return page.evaluate(() => Math.round(scrollY));
}

test('뒤로가기 탭 복원 — 푸터가 입력 없는 레이아웃 이동으로 잡히지 않는다(16쌍)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const w = window as unknown as { __ls: { t: number; v: number; rin: boolean; foot: boolean }[] };
    w.__ls = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node: Node | null }[] })[]) {
        w.__ls.push({ t: e.startTime, v: e.value, rin: e.hadRecentInput,
          foot: e.sources.some((s) => !!(s.node as Element | null)?.closest?.('.reveal') || (s.node as Element | null)?.matches?.('.reveal')) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.goto('/');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 30_000 });
  for (const t of ['live', 'community', 'tools', 'calendar', 'home']) await tapTab(page, t); // 첫 방문 스켈레톤을 측정 밖으로

  const bad: string[] = [];
  for (const a of TABS) for (const b of TABS.filter((x) => x !== a && x !== 'home')) {
    if ((await activeTab(page)) !== a) await tapTab(page, a);
    const saved = await scrollNearBottom(page);
    const ha = await page.evaluate((a) => Math.round(document.querySelector<HTMLElement>(`.tab-pane[data-tab="${a}"]`)!.getBoundingClientRect().height), a);
    await tapTab(page, b);
    // 떠날 판 B 를 돌아올 판 A 보다 900px 길게 — 푸터의 문서 위치가 반드시 다르게(데이터 무관)
    await page.evaluate(([b, h]) => { document.querySelector<HTMLElement>(`.tab-pane[data-tab="${b}"]`)!.style.minHeight = `${h}px`; }, [b, ha + 900] as const);
    // 입력 없는 뒤로. 판이 바뀐 첫 프레임 시각(swapT)을 rAF 로 잡는다 — 그 프레임의 이동만 판정한다
    //   (그 뒤 프레임의 이동은 판 안 내용 변화라 다른 부류다: 예) 캘린더 재활성 시 오류 카드가 걷혔다 다시 서는 것).
    const t0 = await page.evaluate((a) => {
      const w = window as unknown as { __swapT: number | null }; w.__swapT = null;
      const tick = () => {
        const act = [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((p) => !p.hasAttribute('data-pane-leaving') && p.style.display !== 'none')?.dataset.tab;
        if (act === a) w.__swapT = performance.now(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const t = performance.now(); setTimeout(() => history.back(), 0); return t;
    }, a);
    await expect.poll(() => activeTab(page), { message: `${a}>${b}>뒤로: 복원 탭` }).toBe(a);
    await page.waitForTimeout(800);
    const r = await page.evaluate((t0) => {
      const w = window as unknown as { __ls: { t: number; v: number; rin: boolean; foot: boolean }[]; __swapT: number | null };
      const f = document.querySelector('.reveal > footer')!.getBoundingClientRect();
      const end = (w.__swapT ?? Infinity) + 12; // 교체 프레임(다음 프레임은 ≥16ms 뒤)
      const win = w.__ls.filter((e) => e.t >= t0 && e.t <= end && !e.rin);
      return { swapT: w.__swapT, y: Math.round(scrollY), footIn: f.top < innerHeight && f.bottom > 0,
        foot: +win.filter((e) => e.foot).reduce((s, e) => s + e.v, 0).toFixed(4), all: +win.reduce((s, e) => s + e.v, 0).toFixed(4) };
    }, t0);
    await page.evaluate((b) => { document.querySelector<HTMLElement>(`.tab-pane[data-tab="${b}"]`)!.style.minHeight = ''; }, b);
    // 전제(거짓 통과 방지) — 복원이 실제로 일어났고 푸터가 화면 안에 있다
    expect(Math.abs(r.y - saved), `${a}>${b}>뒤로: scrollY ${r.y} vs 저장 ${saved}`).toBeLessThanOrEqual(2);
    expect(r.footIn, `${a}>${b}>뒤로: 복원 뒤 푸터가 화면 안`).toBe(true);
    expect(r.swapT, `${a}>${b}>뒤로: 교체 프레임을 잡았다`).not.toBeNull();
    if (r.foot > 0.001) bad.push(`${a}>${b}>뒤로 footer-shift ${r.foot} (전체 ${r.all})`);
  }
  expect(bad, bad.join('\n')).toEqual([]);
});

// 2026-10-08 8차 INSTANT-SWAP — 떠나는 판·푸터 복제본을 걷었다(src/lib/tabCover.ts 8차 절). 판과 푸터는 같은 프레임에 새 판으로 바뀐다.
//   옛 계약('보이던 푸터 자리를 복제본이 지킨다')은 복제본이 겹쳐 보이는 것 자체가 '블러·네모칸' 이었으므로 뒤집는다 — 복제본이 한 프레임도 서지 않는다.
test('앞으로 탭 이동 — 푸터 복제본이 서지 않는다(한 프레임 교체 · 4탭)', async ({ page }) => {
  test.setTimeout(120_000);
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.goto('/');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 30_000 });
  for (const t of ['live', 'community', 'tools', 'calendar', 'home']) await tapTab(page, t);
  const bad: string[] = [];
  for (const b of ['live', 'community', 'tools', 'calendar']) {
    if ((await activeTab(page)) !== 'home') await tapTab(page, 'home');
    await scrollNearBottom(page);
    const top0 = await page.evaluate(() => Math.round(document.querySelector('.reveal > footer')!.getBoundingClientRect().top));
    expect(top0, `홈 바닥에서 푸터가 화면 안(전제)`).toBeLessThan(844);
    await page.evaluate(() => {
      const w = window as unknown as { __cl: (number | null)[] }; w.__cl = [];
      const tick = () => { const c = document.querySelector('[data-footer-clone]'); w.__cl.push(c ? Math.round(c.getBoundingClientRect().top) : null); if (w.__cl.length < 12) requestAnimationFrame(tick); };
      document.addEventListener('touchend', () => requestAnimationFrame(tick), { once: true, capture: true }); // 누른 뒤 12프레임
    });
    await tapTab(page, b);
    const cl = await page.evaluate(() => (window as unknown as { __cl: (number | null)[] }).__cl);
    expect(cl.length, `홈>${b}: 누른 뒤 프레임을 못 모았다(측정 공허)`).toBeGreaterThan(0);
    if (cl.some((v) => v !== null)) bad.push(`홈>${b}: 푸터 복제본이 섰다 ${JSON.stringify(cl)} (푸터 ${top0})`);
  }
  expect(bad, bad.join('\n')).toEqual([]);
});
