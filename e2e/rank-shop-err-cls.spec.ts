/**
 * M3-09(audit3/audit4-motion-1004) — 순위 › 상점에서 상점 정보 조회가 실패하면 오류 카드가 늦게 끼어 아래를 밀었다.
 *
 * 재현(감사 하네스 E 와 같은 조건): 잔액(my_point_balance)·가격표(shop_skus)를 600ms 늦춘 뒤 500 으로 응답.
 *   예전: 판이 그려진 뒤 ~800ms 에 compact 오류 카드(약 163px)가 '내 활동점수' 위에 끼어 아래 전부를 밀었다(입력 없는 CLS 0.0489, 5/5).
 *   지금: 오류는 '내 활동점수' 줄 자리 안에서 같은 높이로 말한다(제목·사유·다시 시도). 아래 내용은 움직이지 않는다.
 * 대조군: 같은 조건에서 성공 응답이면 오류가 없다(오류를 아예 안 그려서 통과한 게 아님을 ① 의 alert 단언이 증명한다).
 * 운영 DB 에 쓰지 않는다 — 상점 읽기는 전부 page.route 로 갈아끼운다(구매는 누르지 않는다).
 */
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function openShop(page: Page, mode: 'fail' | 'ok') {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const slow = (body: () => ReturnType<typeof json>) => async (r: Route) => {
    await new Promise((res) => setTimeout(res, 600));
    return r.fulfill(body()).catch(() => {});
  };
  await page.route(/\/rest\/v1\/rpc\/my_point_balance/, slow(() => (mode === 'fail' ? json({ message: 'x' }, 500) : json([{ total: 100, spent: 0, available: 100 }]))));
  await page.route(/\/rest\/v1\/shop_skus/, slow(() => (mode === 'fail' ? json({ message: 'x' }, 500) : json([]))));
  await page.route(/\/rest\/v1\/rpc\/(my_owned_marks|my_cosmetics|my_buyable_season_badges|my_season_badges)/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/shout_rules/, (r) => r.fulfill(json([{ cost: 50, cooldown_minutes: 10, daily_cap: 3, max_len: 60, min_len: 2, ttl_hours: 0 }])));
  await page.goto('/?tab=community');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 30_000 });
  await page.getByTestId('sec-tab-rank').first().click();
  const bar = page.locator('[data-rank-tabbar]');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  // 상점 누름 직후부터 2.5초 동안 입력 없는 레이아웃 이동 합과 '내 활동점수' 줄의 y 를 잰다.
  const measuring = page.evaluate(() => new Promise<{ cls: number; sources: string[]; ys: number[] }>((resolve) => {
    let cls = 0; const sources: string[] = []; const ys: number[] = [];
    const po = new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] }[]) {
        if (e.hadRecentInput) continue;
        cls += e.value;
        for (const s of e.sources ?? []) sources.push((s.node as HTMLElement | undefined)?.className?.toString().slice(0, 60) ?? '?');
      }
    });
    po.observe({ type: 'layout-shift', buffered: false });
    const t0 = performance.now();
    const tick = () => {
      const row = Array.from(document.querySelectorAll('span')).find((s) => s.firstChild?.textContent?.trim() === '내 활동점수');
      if (row) ys.push(Math.round(row.getBoundingClientRect().top * 100) / 100);
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else { po.disconnect(); resolve({ cls, sources, ys }); }
    };
    requestAnimationFrame(tick);
  }));
  await bar.getByRole('button', { name: '상점', exact: true }).click();
  return measuring;
}

test('🔴 M3-09 상점 정보 조회 실패 — 오류가 늦게 와도 아래 내용이 밀리지 않는다(CLS 0)', async ({ page }) => {
  test.setTimeout(90_000);
  const r = await openShop(page, 'fail');
  const alert = page.getByRole('alert').filter({ hasText: '상점 정보' });
  await expect(alert, '전제: 상점 정보 실패를 알린다').toBeVisible({ timeout: 10_000 });
  await expect(alert.getByRole('button', { name: '다시 시도' })).toBeVisible();
  expect(r.ys.length, '전제: 내 활동점수 줄을 프레임마다 쟀다').toBeGreaterThan(30);
  const ys = r.ys.slice(5);   // 판 진입 직후 몇 프레임(탭 전환 중)은 제외
  expect(Math.max(...ys) - Math.min(...ys), `내 활동점수 줄 y 변동 ${JSON.stringify([...new Set(ys)])}`).toBeLessThanOrEqual(0.5);
  expect(r.cls, `입력 없는 CLS ${r.cls} · 출처 ${r.sources.join(' | ')}`).toBeLessThan(0.001);
});

test('대조군 — 같은 지연에 성공하면 오류가 없다', async ({ page }) => {
  test.setTimeout(90_000);
  const r = await openShop(page, 'ok');
  await expect(page.getByText('100점', { exact: true }).first(), '전제: 잔액이 도착했다').toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alert').filter({ hasText: '상점 정보' })).toHaveCount(0);
  expect(r.cls, `입력 없는 CLS ${r.cls} · 출처 ${r.sources.join(' | ')}`).toBeLessThan(0.001);
});
