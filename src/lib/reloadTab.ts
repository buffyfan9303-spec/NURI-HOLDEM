// 새로고침(F5)은 내 매장에 머문다 — audit10 P3-6(2026-10-07): 업주 PC 에서 새로고침하면 홈으로 돌아갔다.
//   진입점은 홈 하나로 고정한다는 오너 지시(2026-09-04, "다른 웹페이지 갔다가 돌아오면 홈")는 그대로다 —
//   그 지시가 겨냥한 것은 **다른 곳에서 돌아오는** 진입이고, 새로고침은 같은 화면을 다시 그리는 것이라 구별한다.
//   그래서 navigation type 이 'reload' 일 때만, 그리고 이 창(sessionStorage)에서 마지막으로 연 탭이 내 매장일 때만 내 매장으로 부팅한다.
const KEY = 'nuri:reload-tab';

function isReload(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch { return false; }
}

/** 새로고침 부팅이면 그 창이 마지막으로 연 내 매장, 아니면 null. */
export function reloadBootTab(): 'my-store' | null {
  if (!isReload()) return null;
  try { return sessionStorage.getItem(KEY) === 'my-store' ? 'my-store' : null; } catch { return null; }
}

/** 지금 탭을 기억한다(내 매장만 — 다른 탭은 새로고침해도 홈이 정본). */
export function rememberTab(tab: string): void {
  try {
    if (tab === 'my-store') sessionStorage.setItem(KEY, tab);
    else sessionStorage.removeItem(KEY);
  } catch { /* 저장소 차단 — 새로고침은 홈으로(예전 동작) */ }
}
