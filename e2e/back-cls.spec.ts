// 뒤로가기 한 번마다 CLS 가 계상되던 것 (R-05 · audit-regress-1001 · 2026-10-01).
//
// 탭을 **누르는** 이동은 판 교체의 레이아웃 이동이 `hadRecentInput` 으로 빠진다. 그런데 **뒤로가기(popstate)** 는 입력이 아니라
// 같은 판 교체가 그대로 CLS 에 계상됐다 — 원인 노드는 매번 판 밖 형제인 사업자 푸터 래퍼(div.reveal)가 새 판을 따라 움직인 것.
// 화면은 떠나는 판·푸터 복제본이 덮고 있어 눈에 보이는 튐은 없다(지표 오염 — Speed Insights 필드 CLS).
// 실측(수정 전): PC 내 매장→커뮤니티 뒤로 0.216 · 모바일 탭 뒤로 0.015~0.016.
//
// 잠그는 것: 탭을 옮긴 뒤 뒤로가기 → 1.5초 동안 입력 밖(hadRecentInput=false) layout-shift 합 < 0.01.
//   ⚠ 0건 수집 거짓 통과 방지 — 뒤로가기가 실제로 **원래 탭으로 돌아왔는지**를 같이 단언한다.
import { test, expect } from './_fixtures';
import { mockSchedules } from './_schedules';
import type { Page } from '@playwright/test';

const visibleTabs = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tab-pane')].filter((p) => p.offsetParent !== null).map((p) => p.dataset.tab));

async function backShift(page: Page, label: string, tab: string) {
  await page.locator('nav[aria-label="하단 내비게이션"] button, button[role="tab"]') // 모바일 하단바 · PC 상단 탭
    .filter({ hasText: new RegExp(`^${label}$`) }).filter({ visible: true }).first().click();
  await expect.poll(() => visibleTabs(page), { timeout: 15_000 }).toEqual([tab]);
  await page.waitForTimeout(1500); // 첫 방문 스켈레톤·데이터 정착
  await page.evaluate(() => {
    const w = window as unknown as { __ls: { v: number; src: string[] } };
    w.__ls = { v: 0, src: [] };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] }[]) {
        if (e.hadRecentInput) continue;
        w.__ls.v += e.value;
        for (const s of e.sources ?? []) { const n = s.node as HTMLElement | undefined; w.__ls.src.push(n ? `${n.nodeName}.${n.className ?? ''}`.slice(0, 60) : '?'); }
      }
    }).observe({ type: 'layout-shift' });
  });
  await page.evaluate(() => history.back());
  await expect.poll(() => visibleTabs(page), { timeout: 10_000, message: '뒤로가기가 홈으로 돌아오지 않았다(측정 전제)' }).toEqual(['home']);
  await page.waitForTimeout(1500);
  return page.evaluate(() => (window as unknown as { __ls: { v: number; src: string[] } }).__ls);
}

for (const [w, h] of [[390, 844], [1280, 900]] as const) {
  test.describe(`${w}px`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const [label, tab] of [['커뮤니티', 'community'], ['라이브', 'live'], ['캘린더', 'calendar']] as const) {
      test(`🔴 홈→${label}→뒤로가기 는 CLS 를 계상하지 않는다`, async ({ page }) => {
        await mockSchedules(page);
        await page.goto('/');
        await expect(page.getByTestId('home-schedule-title')).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(1200);
        const r = await backShift(page, label, tab);
        expect(r.v, `뒤로가기 CLS ${r.v.toFixed(4)} · 원인 ${[...new Set(r.src)].join(' | ')}`).toBeLessThan(0.01);
      });
    }
  });
}
