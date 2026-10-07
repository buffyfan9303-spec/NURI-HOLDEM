import { useEffect, useState } from 'react';

// 새로고침(F5)은 보던 화면에 머문다 — 최상위 탭과 그 하위 탭(섹션)까지.
//   오너 2026-10-07: "커뮤니티-게시판에서 새로고침을 하면 홈으로 넘어가. 다른 페이지에서도 이건 있으면 안 돼."
//   (같은 날 audit10 P3-6 · PR #203 은 내 매장만 살렸다 — 이제 모든 탭이 같은 규칙이다.)
//   진입점은 홈 하나로 고정한다는 오너 지시(2026-09-04, "다른 웹페이지 갔다가 돌아오면 홈")는 그대로다 —
//   그 지시가 겨냥한 것은 **다른 곳에서 돌아오는** 진입(navigate·back_forward)이고, 새로고침은 같은 화면을 다시 그리는 것이라 구별한다.
//   그래서 navigation type 이 'reload' 일 때만 이 창(sessionStorage — 창마다 따로, 새 창은 비어 있다)이 남긴 값을 읽는다. 쓰기는 늘 한다.
//   ⚠ 읽은 값은 **첫 렌더의 초기값**으로만 쓴다 — 마운트 뒤 setState 로 옮기면 홈·첫 칸이 한 번 그려지고 알약이 첫 칸에서 미끄러져 온다.

/** 페이지가 사는 동안 변하지 않는다(새로고침으로 연 페이지는 끝까지 'reload') — 처음 읽을 때 한 번 잰다. */
const RELOAD = (() => {
  try { return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'; }
  catch { return false; }
})();

const TAB_KEY = 'nuri:reload-tab';
const TABS = ['home', 'browse', 'live', 'community', 'tools', 'calendar', 'my-store', 'admin'] as const;
export type ReloadTab = typeof TABS[number];
/** 새로고침 직전에 보던 최상위 탭 — **부팅 때 한 번** 잡는다(이 모듈은 App 과 함께 첫 화면 청크에 실린다).
 *  지연 모듈(커뮤니티·GTO·관리자…)은 처음 열릴 때에야 저장값을 읽는다. 이 판정이 없으면 '홈에서 새로고침 → 나중에 커뮤니티' 가
 *  새로고침 **전** 섹션으로 열렸다(design-review P3-3, 2026-10-07). 그래서 하위 탭 값은 부팅 탭이 그 탭일 때만 쓴다.
 *  ⚠ index.html 의 첫 페인트 스크립트(data-boot-tab)가 같은 키·같은 판정을 쓴다 — 키를 바꾸면 거기도 바꾼다. */
const BOOT_TAB: string | null = (() => {
  if (!RELOAD) return null;
  try { return sessionStorage.getItem(TAB_KEY); } catch { return null; }
})();

/** 새로고침 부팅이면 이 창이 `key` 에 남긴 값(허용 목록 안의 것만 — 옛 판이 남긴 낯선 값은 버린다), 아니면 null.
 *  `tab` 을 주면 새로고침 직전 탭이 그 탭일 때만 돌려준다(그 탭의 하위 상태).
 *  `allowed` 가 null 이면 값 검증은 부르는 쪽 몫이다 — 매장 id 처럼 서버 목록으로만 판정할 수 있는 값. */
export function reloadSaved<T extends string>(key: string, allowed: readonly T[] | null, tab?: ReloadTab): T | null {
  if (!RELOAD || (tab && BOOT_TAB !== tab)) return null;
  try {
    const v = sessionStorage.getItem(key);
    return v !== null && v !== '' && (allowed === null || (allowed as readonly string[]).includes(v)) ? v as T : null;
  } catch { return null; }
}

/** 지금 값을 남긴다(새로고침 때만 읽힌다). */
export function saveForReload(key: string, v: string): void {
  try { sessionStorage.setItem(key, v); } catch { /* 저장소 차단 — 새로고침은 기본 화면으로(예전 동작) */ }
}

/** useState 와 같되 새로고침하면 남긴 값으로 다시 시작한다 — 하위 탭(섹션) 상태용. `tab` = 이 상태가 사는 최상위 탭. */
export function useReloadState<T extends string>(key: string, allowed: readonly T[], init: T, tab: ReloadTab) {
  const [v, setV] = useState<T>(() => reloadSaved(key, allowed, tab) ?? init);
  useEffect(() => { saveForReload(key, v); }, [key, v]);
  return [v, setV] as const;
}

/** '내 정보'(App 의 전면 페이지) 열림 · 그 안의 하위 탭(MeTabs) — 두 곳이 같은 키를 써야 해서 여기 둔다.
 *  내 정보는 어느 탭 위에서나 열리는 겹이라 부팅 탭으로 거르지 않는다. */
export const ME_OPEN_KEY = 'nuri:reload:me-open';
export const ME_TAB_KEY = 'nuri:reload:me-tab';

/** 새로고침 부팅이면 그 창이 마지막으로 연 최상위 탭, 아니면 null. 권한 탭(내 매장·관리자)은 App 의 pendingDeepTab 이 권한 확인까지 붙든다. */
export const reloadBootTab = () => reloadSaved(TAB_KEY, TABS);
/** 지금 최상위 탭을 기억한다. */
export const rememberTab = (tab: string) => saveForReload(TAB_KEY, tab);
