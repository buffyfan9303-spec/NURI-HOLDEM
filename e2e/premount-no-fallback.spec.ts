// perf① 홈 콜드 간헐 CLS(0.193 → HOME-DENSITY 뒤 0.328)의 근본 원인 회귀 가드 — 2026-09-24.
//
// 기전(root-cause-debugger 실측): App 프리마운트(mountNext)가 가변 Set(visitedTabs)을 **커밋 전에** 바꾸고
//   startTransition 으로 틱만 올렸다. 그 사이 끼어든 일반 우선순위 App 렌더가 Set 을 읽어 lazy 판(live 등)을
//   트랜지션 **밖에서** 마운트 → 서스펜드 → 바깥 Suspense 의 LazyFallback(pane-reserve, 한 화면 높이)이 홈 밑에
//   커밋 → 푸터가 뷰포트 밖으로 밀렸다가 ~450ms 뒤 복귀(엔트리 2개 0.157+0.171). CPU 8x 에서 11/15.
// 고친 뒤: 프리마운트는 React 상태(premounted)로만 올라가고 가변 Set 은 커밋 뒤 effect 에서만 바뀐다.
//
// 보는 것: 워밍업 방문 뒤 재방문(perf① 과 같은 순서) · CPU 8x · 5회 — 홈에 있는 동안 '불러오는 중'
//   폴백이 **한 번도** DOM 에 들어오지 않는다(MutationObserver 로 잡는다 — rAF 샘플은 짧은 커밋을 놓친다).
// 운영 DB 에 쓰지 않는다(_fixtures 가드) · home_banners 는 빈 배열(배너 도착 시점이 결과를 흔들지 않게).
import { test, expect } from './_fixtures';

test('🔴 재방문 홈 · CPU 8x · 5회 — 프리마운트가 LazyFallback 을 커밋하지 않는다', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route(/\/rest\/v1\/home_banners\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(() => {
    const hits: { t: number; panes: string }[] = [];
    (window as unknown as { __fb: typeof hits }).__fb = hits;
    const SEL = '[aria-busy="true"][aria-label="불러오는 중"]';
    new MutationObserver((list) => {
      for (const m of list) for (const n of Array.from(m.addedNodes)) {
        if (!(n instanceof Element)) continue;
        if (n.matches(SEL) || n.querySelector(SEL)) {
          hits.push({ t: Math.round(performance.now()), panes: Array.from(document.querySelectorAll('[data-tab]')).map((e) => (e as HTMLElement).dataset.tab).join(',') });
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await page.setViewportSize({ width: 375, height: 812 });

  // 워밍업 — 청크·HTTP 캐시를 데운다(첫 방문의 폴백은 이 테스트의 대상이 아니다).
  await page.goto('/');
  await page.getByTestId('home-schedule-title').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(3500);

  const seen: string[] = [];
  let premounted = 0;
  for (let i = 0; i < 5; i++) {
    await page.goto('/');
    await page.getByTestId('home-schedule-title').waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(4500); // 프리마운트(idle 마다 한 판)가 끝날 시간
    const r = await page.evaluate(() => ({
      hits: (window as unknown as { __fb: { t: number; panes: string }[] }).__fb,
      panes: Array.from(document.querySelectorAll('[data-tab]')).map((e) => (e as HTMLElement).dataset.tab),
    }));
    for (const h of r.hits) seen.push(`run${i + 1} @${h.t}ms panes=[${h.panes}]`);
    if (r.panes.includes('live')) premounted++;
  }
  // 양성 대조: 프리마운트 자체는 계속 돈다(고치다 프리마운트를 꺼 버리면 폴백 0 은 거짓 통과다).
  expect(premounted, '재방문 5회 중 live 판이 숨김 마운트된 횟수 — 0 이면 프리마운트가 꺼졌다').toBeGreaterThanOrEqual(4);
  expect(seen, '홈에 있는 동안 LazyFallback 이 커밋됐다').toEqual([]);
});
