// 홈·캘린더가 **다른 세션의 일정 변경을 따라온다** (2026-09-20 · R1-A)
//
// 🔴 무엇이 문제였나
//   `App.tsx` 의 `wantScheduleRealtime` 에 `home` 과 `calendar` 가 빠져 있었다. 두 탭 모두 같은
//   `schedules` 를 그리는데(홈의 오늘·내일 목록, 캘린더의 달력) 구독 자체가 안 열렸다.
//   복귀 재조회도 마찬가지로 `case 'home'` 은 **배너만** 갱신했고 `case 'calendar'` 는 **분기 자체가 없었다**.
//   그래서 손님이 홈이나 캘린더를 열어 둔 채로는 다른 세션에서 포스터가 승인·수정·삭제돼도
//   수동 새로고침 전까지 옛 목록을 봤다.
//
// 이 스펙이 잠그는 것: **숨김→복귀에 두 탭이 일정을 다시 읽는다.**
// ⚠ Realtime 구독 자체(웹소켓)는 여기서 안 잰다 — 소켓이 붙었는지는 이 하네스에서 결정적으로
//   재현하기 어렵다. 구독 조건은 같은 커밋의 소스 계약 테스트가 따로 잠근다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack } from './_session';

const SCHEDULES_GET = /\/rest\/v1\/schedules\?/;

/** 탭을 숨겼다가 되살린다 — 실제 브라우저의 백그라운드 복귀와 같은 이벤트를 쏜다. */
async function hideAndShow(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

for (const tab of ['home', 'calendar'] as const) {
  test(`🔴 ${tab} — 숨김→복귀에 일정을 다시 읽는다`, async ({ page }) => {
    test.setTimeout(120_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });

    let gets = 0;
    await page.route(SCHEDULES_GET, (r) => { if (r.request().method() === 'GET') gets += 1; return r.fallback(); });

    await page.goto('/');
    await page.waitForSelector('[data-stack-header]', { timeout: 20_000 });
    await page.evaluate((t) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: t })), tab);
    await page.waitForTimeout(2500);

    const before = gets;
    expect(before, '첫 로드에서 일정을 한 번도 안 읽었다 — 이 검사가 아무것도 재지 않았다').toBeGreaterThan(0);

    await hideAndShow(page);
    await page.waitForTimeout(2500);

    expect(gets, `${tab} 탭에서 복귀했는데 일정을 다시 안 읽었다(${before} → ${gets}) — 다른 세션의 변경을 영영 못 본다`)
      .toBeGreaterThan(before);
  });
}
