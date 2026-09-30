// 배포 스큐 — 앱을 켜 둔 채 새 배포가 나간 뒤 **아직 안 연 화면**을 누르면, 새로고침이 일어나도 **누른 곳에 도착**한다.
//
// ── 무엇을 막는가 (R-01 · audit-regress-1001 · 2026-10-01) ──────────────────────
// 운영 GET 실측: `/assets/ToolsPanel-DEADBEEF.js` → 200 · text/html · immutable(vercel.json SPA 재작성이 /assets/ 까지 삼킴).
// 그 응답으로 lazy import 가 MIME 오류로 실패하면 lazyWithReload 가 `location.reload()` 를 불렀고,
// 부팅 기본 탭(홈)으로 떨어져 **누른 목적지가 사라졌다** — GTO·캘린더·일정 상세·이벤트 4경로 모두 홈 도착.
// 오너가 말한 "검은 화면으로 갔다가 돌아옴" 을 하네스에서 실제로 재현한 유일한 경로다.
//
// 재현: 부팅 뒤 옛 청크 요청(`/assets/*.js|css`)에 운영과 같은 200 text/html 을 준다. 새 문서(새로고침)는 새 배포를
//   받으므로 문서가 바뀌는 순간 가짜 응답을 끈다. **가짜 응답이 실제로 한 번 이상 나갔는지**도 단언한다(0건이면 거짓 통과).
// 음성 대조: 수정 전 빌드(b7ad649c)에서 4건 모두 홈 도착으로 FAIL.
import { test, expect } from './_fixtures';
import { mockSchedules } from './_schedules';
import type { Page } from '@playwright/test';

// SW 가 제어하면 청크 요청이 page.route 를 우회한다(가짜 응답 0건 — 실측). 운영의 첫 설치 직후와 같은 '네트워크 경로'를 잰다.
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const visibleTabs = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tab-pane')].filter((p) => p.offsetParent !== null).map((p) => p.dataset.tab)).catch(() => ['(navigating)']);

/** `chunk` = 이 화면을 여는 지연 청크. 첫 문서에서 그 청크 요청에만 옛 배포의 응답(200 text/html)을 준다.
 *  ⚠ '부팅 뒤 모든 청크' 로 무장하면 idle·타이머 프리로드가 무장 전에 청크를 받아 버려 결함 경로를 안 지난다
 *    (실측: CPU 1배에서 가짜 응답 0건 — 4건 모두 거짓 통과). 대상 청크만 첫 문서 전체에서 막는 것이 결정적이다. */
async function bootAndArm(page: Page, chunk: RegExp) {
  await mockSchedules(page);
  let armed = true;
  const skewed: string[] = [];
  let html = '';
  // 새 문서 = 새 배포. framenavigated 는 pushState 에도 불리므로 쓰지 않는다(탭 이력 칸이 무장을 풀어 버린다).
  page.on('domcontentloaded', () => { if (html) armed = false; });
  await page.route(/\/assets\/.+\.(js|css)$/, (r) => {
    const name = r.request().url().split('/').pop()!;
    if (!armed || !chunk.test(name)) return r.fallback();
    skewed.push(name);
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html || '<!doctype html>', headers: { 'cache-control': 'no-store' } });
  });
  await page.goto('/');
  html = await (await page.request.get('/')).text();
  await expect(page.getByTestId('home-schedule-title')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => { (window as unknown as { __alive?: number }).__alive = 1; });
  return { skewed };
}

const reloaded = (page: Page) => page.evaluate(() => !(window as unknown as { __alive?: number }).__alive);
const navButton = (page: Page, label: string) =>
  page.locator('nav[aria-label="하단 내비게이션"] button').filter({ hasText: new RegExp(`^${label}$`) });

for (const [label, tab, chunk] of [['GTO', 'tools', /^ToolsPanel-/], ['캘린더', 'calendar', /^CalendarPanel-/]] as const) {
  test(`🔴 배포 스큐: 첫 방문 탭 '${label}' 을 누르면 새로고침 뒤에도 그 탭에 도착한다`, async ({ page }) => {
    const { skewed } = await bootAndArm(page, chunk);
    await navButton(page, label).click();
    await expect.poll(() => visibleTabs(page), { timeout: 20_000, message: `${label} 대신 다른 탭에 도착(홈이면 R-01 재발)` }).toEqual([tab]);
    expect(skewed.length, '옛 청크 가짜 응답이 한 번도 안 나갔다 — 결함 경로를 안 지났다(거짓 통과)').toBeGreaterThan(0);
    expect(await reloaded(page), '스큐에서 새로고침이 안 일어났다면 이 스펙의 전제가 깨진 것').toBe(true);
  });
}

test('🔴 배포 스큐: 홈 일정 카드를 누르면 새로고침 뒤에도 그 일정 상세가 열린다', async ({ page }) => {
  const { skewed } = await bootAndArm(page, /^ScheduleDetailModal-/);
  const card = page.locator('[data-testid="home-schedule"] [role="button"]').first();
  const title = (await card.innerText()).split('\n').map((s) => s.trim()).filter((s) => s.length >= 4)[0] ?? '';
  expect(title, '일정 카드 제목을 못 읽었다').not.toBe('');
  await card.click();
  await expect(page.getByRole('dialog').filter({ hasText: title }).first()).toBeVisible({ timeout: 20_000 });
  expect(skewed.length).toBeGreaterThan(0);
  expect(await reloaded(page)).toBe(true);
  expect(await visibleTabs(page)).toEqual(['home']);
});

test('🔴 배포 스큐: 홈 이벤트 바로가기를 누르면 새로고침 뒤에도 이벤트 목록이 열린다', async ({ page }) => {
  const { skewed } = await bootAndArm(page, /^EventListPage-/);
  await page.getByTestId('home-quick-event').click();
  await expect(page.getByTestId('event-list-page')).toBeVisible({ timeout: 20_000 });
  expect(skewed.length).toBeGreaterThan(0);
  expect(await reloaded(page)).toBe(true);
  // `?event=list` 는 1회성 — 주소에 남으면 다음 새로고침마다 목록이 저절로 열린다.
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.search).get('event'))).toBeNull();
});
