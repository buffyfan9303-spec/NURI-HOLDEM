// 메인 탭을 옮기면 **항상 맨 위**에서 시작한다.
//
// 오너 지적(2026-09-19): "메인메뉴를 이동하면 화면이 올라갔다가 내려가. 모든 메인메뉴 탭이
// 메뉴 이동시 중간부터 나오는 경우도 있어."
// → 원인은 탭별 스크롤 위치를 저장했다 되돌리던 것(App.tsx `tabScrollRef`, 지시로 제거).
//   오너 확답: **"항상 맨 위에서 시작."**
//
// ⚠ 이 검사는 "마지막에 0 이더라" 만 보지 않는다. 그건 전환이 아예 안 일어나도 통과한다.
//   ① 스크롤을 실제로 내렸고 ② 탭이 실제로 바뀌었고 ③ 그 뒤 0 이다 — 셋을 다 본다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const TABS = ['browse', 'live', 'community', 'tools'] as const;

for (const vp of [{ width: 390, height: 844, label: '모바일' }, { width: 1440, height: 900, label: 'PC' }]) {
  test(`🔴 ${vp.label} ${vp.width}px — 메인 탭을 옮기면 맨 위에서 시작한다`, async ({ page }) => {
    test.setTimeout(90_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/?tab=home');
    await page.waitForSelector('[data-stack-header]', { timeout: 20_000 });

    // 대상 탭을 한 번씩 방문해 keep-alive 를 켠다 — 재방문 경로가 이 계약의 대상이다.
    for (const t of TABS) {
      await page.evaluate((x) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: x })), t);
      await page.waitForTimeout(600);
    }

    let checked = 0;
    const skipped: string[] = [];
    for (const t of TABS) {
      await page.evaluate((x) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: x })), t);
      await page.waitForTimeout(600);

      // ① 그 탭에서 실제로 내려간다. 내릴 여지가 없으면 이 탭으로는 아무것도 못 잰다.
      const scrolled = await page.evaluate(() => {
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (max < 120) return 0;
        window.scrollTo({ top: Math.round(max * 0.6), behavior: 'instant' as ScrollBehavior });
        return Math.round(window.scrollY);
      });
      if (scrolled < 100) { skipped.push(t); continue; }

      // ② 다른 탭으로 갔다가 ③ 이 탭으로 돌아온다.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'home' })));
      await page.waitForTimeout(600);
      await page.evaluate((x) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: x })), t);
      await page.waitForTimeout(700);

      const back = await page.evaluate(() => {
        const pane = [...document.querySelectorAll('[data-tab]')]
          .find((el) => getComputedStyle(el as HTMLElement).display !== 'none');
        return { y: Math.round(window.scrollY), tab: pane?.getAttribute('data-tab') ?? null };
      });

      // 탭이 실제로 바뀌었는지부터 — 안 바뀌었으면 y=0 이어도 아무 의미가 없다.
      expect(back.tab, `${t} 로 돌아오지 않았다 — 이 검사가 아무것도 재지 않았다`).toBe(t);
      expect(back.y, `${t} 로 돌아왔더니 ${back.y}px 에서 시작한다 — 오너 지시는 "항상 맨 위"다`
        + ` (돌아오기 전 ${scrolled}px 까지 내려가 있었다)`).toBeLessThanOrEqual(2);
      checked++;
    }

    // 🔴 건너뛴 것을 조용히 넘기지 않는다 — 전부 건너뛰면 이 검사는 빈 검사다.
    expect(checked, `잰 탭이 하나도 없다. 건너뛴 탭: ${JSON.stringify(skipped)}`
      + ' — 스크롤 여지가 없으면 이 계약은 아무것도 증명하지 못한다').toBeGreaterThan(0);
  });
}
