// 내 매장 대시보드 — 세로 리듬 계약(모바일).
//
// 무엇을 막나: **같은 크기 글자가 화면마다 다른 행간**을 갖는 것. 한 카드 안에서도 문단마다 호흡이
//   달라지면 "간격이 들쭉날쭉하다"로 보인다(오너 2026-09-07). 실측으로 잡힌 것:
//     · 11.69px → 15.94(27곳) vs 18.99(1곳, leading-relaxed)
//     · 12.75px → 19.13(t-desc 2곳) vs 20.72(1곳, leading-relaxed)
//   눈으로는 1~3px 차이라 리뷰에서 안 걸린다. 그래서 렌더로 강제한다.
import { test, expect } from './_fixtures';
import { loginAs } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

/** 의도적으로 행간을 죽인 곳 — 한 줄짜리 큰 제목(leading-none). 크기별 예외를 명시로만 허용한다. */
const ALLOW_TIGHT = new Set(['17.00']);

test.describe('내 매장 대시보드 — 세로 리듬', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 없음 — 내 매장은 로그인해야 열린다');

  test('🔴 같은 글자 크기는 같은 행간을 쓴다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
    test.skip(await store.count() === 0, '이 계정에는 내 매장 탭이 없다');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3000);

    const groups = await page.evaluate(() => {
      const root = document.querySelector('[data-tab="my-store"]');
      if (!root) return {};
      const out: Record<string, Record<string, string>> = {};
      for (const e of [...root.querySelectorAll<HTMLElement>('p,h1,h2,h3,span,dt,dd,li')]) {
        if (e.offsetParent === null || e.children.length > 0) continue; // 잎 노드만
        const t = (e.textContent || '').trim();
        if (!t) continue;
        const cs = getComputedStyle(e);
        const size = parseFloat(cs.fontSize).toFixed(2);
        const lh = parseFloat(cs.lineHeight).toFixed(2);
        (out[size] ??= {})[lh] = t.slice(0, 24);
      }
      return out;
    });

    const bad = Object.entries(groups)
      .filter(([size, lhs]) => Object.keys(lhs).length > 1 && !ALLOW_TIGHT.has(size))
      .map(([size, lhs]) => `${size}px → ${Object.entries(lhs).map(([lh, ex]) => `${lh}«${ex}»`).join(' / ')}`);

    console.log('[rhythm]', JSON.stringify(groups));
    expect(bad, `같은 크기 글자에 행간이 둘 이상이다 — leading-* 를 개별로 걸지 말고 크기별 정본(t-desc 등)을 쓰라:\n  ${bad.join('\n  ')}`)
      .toEqual([]);
  });
});
