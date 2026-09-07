// 알약은 **틀린 자리에서 보이면 안 된다**.
//
// 오너 리포트(2026-09-08, 스크린샷): 활성 탭은 '장터'인데 보라색 알약만 맨 왼쪽 '홀덤펍' 자리에 앉아 있다.
//
// 원인: 최상위 탭은 언마운트하지 않고 display 로만 껐다 켠다(App.tsx keep-alive). 꺼져 있는 사이에도
//   activeKey 는 바뀔 수 있다 — 예: 대시보드의 '내 장터 거래' 바로가기가 쏘는 nuri:community-section.
//   그때 SlidingPill 이 재려 하면 offsetParent 가 null 이라 offsetLeft/offsetWidth 가 전부 0 이고,
//   알약이 레일 맨 왼쪽에 박힌다. 다시 켜면 활성은 장터인데 알약만 홀덤펍 자리에 남는다.
//   실측: 복귀 후 87ms 지점에서 알약 x=17(홀덤펍) · 활성=장터 · opacity=1 — 눈에 보이는 어긋남이었다.
//
// 고침: 화면에 없는 동안에는 재지 않고 잠시 숨긴다. 다시 보이면 ResizeObserver 가 깨워 제자리에 놓는다.
//   그래서 이 스펙은 '언제 제자리로 오는가'가 아니라 **보이는 동안 늘 제자리인가**를 잠근다 —
//   한 프레임이라도 보이면서 어긋나면 사용자는 그것을 본다.
import { test, expect, type Page } from '@playwright/test';

type Frame = { t: number; x: number | null; 자리: string | null; 활성: string | null; op: string | null };

const tabBtn = (page: Page, name: string) =>
  page.getByRole('tab', { name: new RegExp(`^${name}$`) }).or(page.getByRole('button', { name: new RegExp(`^${name}$`) }));

test.describe('SlidingPill — 숨겨진 사이 바뀐 활성', () => {
  test('🔴 알약이 보이는 동안에는 언제나 활성 탭 자리에 있다', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ① 커뮤니티를 한 번 열어 마운트시킨다(이후 keep-alive 로 DOM 에 남는다)
    await tabBtn(page, '커뮤니티').first().click();
    await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);

    // ② 다른 탭으로 나간다 → 커뮤니티 페인이 display:none
    await tabBtn(page, '홈').first().click();
    await page.waitForTimeout(1200);
    const hidden = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim() === '홀덤펍');
      return b ? b.offsetParent === null : null;
    });
    test.skip(hidden !== true, '커뮤니티 페인이 숨겨지지 않았다(구조 변경?)');

    // ③ 숨어 있는 동안 섹션을 바꾼다 — 대시보드 '내 장터 거래' 바로가기가 쓰는 바로 그 이벤트
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:community-section', { detail: 'market' })));
    await page.waitForTimeout(600);

    // ④ 돌아오면서 프레임마다 '알약이 앉은 자리 vs 활성 탭'을 적는다
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      (w.__f as Frame[]) = [];
      const tick = () => {
        const rail = [...document.querySelectorAll('button')]
          .find((e) => (e.textContent || '').trim() === '홀덤펍')?.parentElement;
        if (rail && rail.offsetParent !== null) {
          const pill = rail.querySelector('.pill-active');
          const act = rail.querySelector('[data-pill-active]');
          const tabs = [...rail.querySelectorAll('button')]
            .map((x) => ({ t: (x.textContent || '').trim(), x: Math.round(x.getBoundingClientRect().x) }));
          const px = pill ? Math.round(pill.getBoundingClientRect().x) : null;
          const near = px == null ? null
            : tabs.reduce((a, c) => (a == null || Math.abs(c.x - px) < Math.abs(a.x - px) ? c : a), tabs[0]);
          (w.__f as Frame[]).push({
            t: Math.round(performance.now()), x: px, 자리: near?.t ?? null,
            활성: act ? (act.textContent || '').trim() : null,
            op: pill ? getComputedStyle(pill).opacity : null,
          });
        }
        (w.__raf as number) = requestAnimationFrame(tick);
      };
      (w.__raf as number) = requestAnimationFrame(tick);
    });
    await tabBtn(page, '커뮤니티').first().click();
    await page.waitForTimeout(2500);
    const frames: Frame[] = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      cancelAnimationFrame(w.__raf as number);
      return w.__f as Frame[];
    });

    expect(frames.length, '프레임을 못 모았다').toBeGreaterThan(5);
    // 보이는(opacity > 0) 프레임만 본다 — 숨어 있는 동안 어디에 있든 사용자는 못 본다.
    const bad = frames.filter((f) => Number(f.op ?? 0) > 0.01 && f.활성 != null && f.자리 !== f.활성);
    const last = frames[frames.length - 1];
    console.log('[알약] 프레임', frames.length, '· 어긋난 채 보인 프레임', bad.length,
      '· 마지막', JSON.stringify({ 자리: last.자리, 활성: last.활성, op: last.op }));
    if (bad.length) console.log('[알약] 첫 어긋남', JSON.stringify(bad[0]));

    expect(bad.length,
      `알약이 보이는데 활성 탭과 다른 자리에 있었다(${bad.length}프레임). 첫 사례: `
      + `알약=${bad[0]?.자리} · 활성=${bad[0]?.활성}. 숨겨진 동안 측정하면 offsetLeft 가 0 이라 맨 왼쪽에 박힌다`)
      .toBe(0);
    // 결국에는 제자리에 보여야 한다 — 영원히 숨겨서 통과시키는 것을 막는다.
    expect(last.자리, '끝내 활성 탭 자리에 오지 않았다').toBe(last.활성);
    expect(Number(last.op ?? 0), '알약이 끝까지 숨겨져 있다').toBeGreaterThan(0.5);
  });
});
