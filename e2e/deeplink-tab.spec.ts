// `?tab=` 딥링크 — **권한이 늦게 도착해도** 약속한 탭에 도달한다.
//
// ── 무엇을 막는가 (2026-09-18 실측 회귀) ──────────────────────────────────────
// 업주 세션으로 `/?tab=my-store` 에 들어가도 **홈이 떴다**. URL 도 `/` 로 재작성돼
// 사용자에게는 "바로가기가 그냥 홈으로 간다" 로 보였다. PWA 바로가기·알림 링크가 쓰는 경로다.
//
// 원인은 타이밍이었다. App.tsx 의 "탭 목록에 없는 탭이면 홈으로" 가드가 `authLoading` 하나만 보고
// 홀드하는데, auth 는 끝났지만 `profiles` 가 아직 안 와 `user.role` 이 비어 있는 **그 한 창**에
// tabs 에 'my-store' 가 없어 홈으로 튕겼다. 뒤늦게 탭이 생겨도 돌아오지 않았다.
//   계측(1280 · 목킹 업주): 33ms boot search=?tab=my-store → 100ms replaceState '/' →
//   t=500ms 에 이미 home 이 보이고 my-store pane 은 숨은 채 존재(= isOwner 는 이미 true).
//
// 고친 방식: 딥링크 의도를 기억했다가 그 탭이 생기는 순간 한 번 적용한다(어느 쪽이 먼저 와도 같은 결과).
//   ⚠ 사용자가 그 사이 손으로 다른 탭을 누르면 기억을 버린다. 단 **가드의 자동 되돌림은 사용자 선택이 아니다** —
//     그것까지 선택으로 세면 기억이 그 자리에서 지워져 수정이 무효가 된다(실제로 한 번 그렇게 만들었다).
//
// ⚠ 양성만 보면 안 된다. "아무나 내 매장에 들어간다" 가 되면 그게 더 큰 사고이므로
//   **비업주는 홈에 남는다**를 같은 파일에서 함께 잠근다.
import { test, expect } from './_fixtures';
import { bootOwner } from './_mockOwner';

/** 지금 화면에 실제로 보이는 탭 pane 들. keep-alive 라 숨은 pane 도 DOM 에는 남아 있으므로
 *  `offsetParent` 로 **보이는 것만** 고른다(존재만 보면 거짓 통과한다). */
const visibleTabs = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-tab]')]
      .filter((p) => p.offsetParent !== null)
      .map((p) => p.dataset.tab));

test('🔴 업주: /?tab=my-store 는 권한이 늦게 와도 내 매장을 연다', async ({ page }) => {
  await bootOwner(page, { viewport: { width: 1280, height: 900 } });
  await page.goto('/?tab=my-store');
  // 권한 RPC 가 다 도착할 시간을 준다 — 결함이 사는 창이 부팅 직후라 '도착 뒤'를 봐야 한다.
  await page.waitForTimeout(4000);
  const tabs = await visibleTabs(page);
  expect(tabs, `업주인데 내 매장이 안 열렸다(보이는 pane: ${tabs.join(',')})`).toContain('my-store');
});

test('🔴 비업주: /?tab=my-store 는 홈에 남는다 — 게이트가 열리면 안 된다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=my-store');
  await page.waitForTimeout(3500);
  const tabs = await visibleTabs(page);
  expect(tabs, '비업주에게 홈이 아닌 화면이 떴다').toContain('home');
  expect(tabs, '비업주에게 내 매장이 열렸다 — 권한 게이트가 뚫렸다').not.toContain('my-store');
});
