// 정적 앱 셸(Phase 2) 게이트 — 'JS 가 오기 전에도 앱처럼 보인다' 를 못 박는다.
//
// 검증 1: JS 를 끄고 들어가도 헤더·스켈레톤·탭바가 보인다(문서의 Slow 4G+JS비활성 기준).
// 검증 2: React 마운트 후 셸이 정확히 교체된다 — 헤더가 2개면 셸이 잔류한 것.
// 검증 3: 셸의 뼈대 클래스가 React 렌더와 동일하다(픽셀 일치의 구조적 근거).
import { test, expect } from '@playwright/test';

test.describe('정적 앱 셸 — 첫 페인트', () => {
  test('🔴 JS 없이도 헤더·스켈레톤·탭바가 그려진다', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 412, height: 915 } });
    const page = await ctx.newPage();
    await page.goto('/');

    await expect(page.locator('text=일정 탐색').first(), '헤더 타이틀이 없다').toBeVisible();
    for (const label of ['일정', '라이브', '커뮤니티', '도구', '내 정보']) {
      await expect(page.locator(`nav >> text=${label}`).first(), `탭바에 ${label} 이 없다`).toBeVisible();
    }
    // MO-5 에서 셸 스켈레톤이 .skeleton(내부 @apply animate-pulse) 클래스로 통일됐다
    const skels = await page.locator('.skeleton').count();
    expect(skels, '스켈레톤 카드가 없다 — 콘텐츠 영역이 빈 화면').toBeGreaterThanOrEqual(6);

    // 탭바가 실제로 하단에 붙어 있는가(fixed bottom)
    const nav = page.locator('nav').first();
    const box = await nav.boundingBox();
    expect(box, '탭바 박스를 못 얻음').toBeTruthy();
    expect(box!.y + box!.height, '탭바가 화면 하단에 붙어 있지 않다').toBeGreaterThan(850);
    await ctx.close();
  });

  test('🔴 React 마운트가 셸을 정확히 교체한다 — 이중 헤더·셸 잔류 없음', async ({ page }) => {
    await page.goto('/');
    // React 마운트 대기: 셸에는 없는 상호작용 요소(로그인 버튼)로 판별
    await page.waitForSelector('button[aria-label="로그인"], button[aria-label="통합 검색"]', { timeout: 15_000 });
    await page.waitForTimeout(300);

    // ⚠ 'header' 전체를 세면 안 된다 — 온보딩 모달 등 다른 <header> 가 정당하게 존재한다
    //   (실제로 700ms 시점에 3개가 잡혀 멀쩡한 교체를 실패로 판정했다).
    //   셸의 고유 마커(aria-hidden 래퍼)와 앱 헤더(data-stack-header)만 본다.
    expect(await page.locator('#root > div[aria-hidden="true"]').count(), '셸 래퍼가 살아 있다 — React 가 교체하지 못했다').toBe(0);
    expect(await page.locator('[data-stack-header]').count(), '앱 헤더가 정확히 1개가 아니다').toBe(1);
  });

  test('🔴 셸이 상단 스택을 예약한다 — 마운트 시 목록이 낙하하지 않는다(MO-7A)', async ({ browser, page }) => {
    // JS 끈 셸에서 목록 컨테이너의 y — 예약이 사라지면 헤더 바로 아래(~74px)로 되돌아간다.
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
    const p0 = await ctx.newPage();
    await p0.goto('/');
    const shellBox = await p0.locator('[class*="pb-section"]').first().boundingBox();
    await ctx.close();
    expect(shellBox, '셸 목록 컨테이너가 없다').toBeTruthy();
    expect(shellBox!.y, '셸 상단 스택 예약이 사라졌다(목록이 헤더 바로 아래서 시작)').toBeGreaterThan(380);

    // React 마운트 후 같은 컨테이너의 y — 셸과 근접해야 '낙하 없는 교체'다.
    // (공지·주간킹 등 라이브 데이터에 따라 ±수십 px 는 정상 범위)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForSelector('button[aria-label="로그인"], button[aria-label="통합 검색"]', { timeout: 15_000 });
    await page.waitForTimeout(500);
    const appBox = await page.locator('main.tab-pane [class*="pb-section"]').first().boundingBox();
    expect(appBox, 'React 목록 컨테이너가 없다').toBeTruthy();
    expect(Math.abs(appBox!.y - shellBox!.y), `셸(${shellBox!.y})↔React(${appBox!.y}) 목록 시작 y 격차`)
      .toBeLessThan(90);
  });

  test('셸 뼈대 클래스가 React 렌더와 동일하다(단일 출처 검증)', async ({ page }) => {
    // 셸 HTML 은 App.tsx 첫 렌더의 클래스를 복사한 것 — 대표 클래스 3개가
    // 마운트 후 실제 DOM 에도 그대로 존재해야 한다. 하나라도 사라지면
    // App.tsx 쪽이 리팩터링된 것이므로 index.html 셸도 함께 갱신해야 한다는 신호다.
    const html = await (await page.request.get('/')).text();
    await page.goto('/');
    await page.waitForSelector('button[aria-label="통합 검색"]', { timeout: 15_000 });
    // MO-7A: 셸 스켈레톤이 ListCard 골격 복제로 바뀌며 대표 클래스도 그 컨테이너로 교체
    for (const cls of ['h-header-h', 'bg-surface-mid shadow-dialog', 'rounded-card border border-border-subtle bg-surface-low']) {
      expect(html, `셸에서 '${cls}' 가 사라졌다`).toContain(cls);
      const inApp = await page.evaluate(
        (c) => document.querySelector(`[class*="${c.split(' ')[0]}"]`) != null, cls,
      );
      expect(inApp, `React 렌더에 '${cls}' 가 더는 없다 — App.tsx 가 바뀌었으니 index.html 셸도 갱신할 것`).toBe(true);
    }
  });
});
