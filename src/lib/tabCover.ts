// src/lib/tabCover.ts — 하단 대메뉴 전환 '덮개' (BOTTOM-TAB-SMOOTH, 2026-09-24)
//
// 오너: "알약 같은 건 상관없고 본문이 문제" — 탭을 누르면 본문이 한 프레임에 컷된다.
// 🔴 본문(.tab-pane)에 opacity/transform 을 걸지 않는다. 그건 본문 레이어를 승격했다 해제하는 것이고
//   (ActiveOpacityAnimation), §0-a25 의 삼성 '전 메뉴 밝기 점프' 부류를 그대로 되살린다.
//   e2e/mobile-tab-transition.spec.ts R3(본문 애니메이션 0)가 그걸 막고 있다.
// → 본문은 그대로 두고, 본문 영역 **위**에 지면색(surface-base) 덮개 한 장을 깔았다가 걷어낸다.
//   합성층이 생기는 것은 덮개 한 장뿐이고, 본문은 그 **아래**라 승격 사유가 생기지 않는다.
//
// 기본 꺼짐 — 기기별 시험 스위치:
//   `?fx=tabfade` 로 한 번 들어오면 이 기기에서 켜짐(localStorage), `?fx=off` 로 끔.
//   전체 켜기는 아래 TAB_COVER_DEFAULT_ON 한 줄을 true 로. 그때도 `?fx=off` 기기는 꺼진 채로 남는다.

/** 전체 기본값. 실기기(삼성 인터넷) 확인 전까지 false. */
export const TAB_COVER_DEFAULT_ON = false;
export const TAB_COVER_STORAGE_KEY = 'nuri:fx';
export const TAB_COVER_MS = 160;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'; // index.css --ease (감속)

/** URL 의 fx 값과 저장값으로 **새 저장값**을 정한다. 'tabfade' | 'off' | null(미지정). */
export function nextTabCoverValue(search: string, stored: string | null): string | null {
  const fx = new URLSearchParams(search).get('fx');
  if (fx === 'tabfade' || fx === 'off') return fx;
  return stored === 'tabfade' || stored === 'off' ? stored : null;
}

export function tabCoverOnFor(value: string | null, defaultOn = TAB_COVER_DEFAULT_ON): boolean {
  return value === 'tabfade' || (defaultOn && value !== 'off');
}

let cached: boolean | null = null;
/** 이 기기에서 켜졌는가. 첫 호출에서 URL 을 읽고 저장한다 — App 마운트 때 한 번 불러 두어라
 *  (그 뒤 딥링크 처리가 query 를 정리해도 결과가 같다). 저장소가 막힌 브라우저는 URL 값만 쓴다. */
export function isTabCoverOn(): boolean {
  if (cached !== null) return cached;
  let stored: string | null = null;
  try { stored = localStorage.getItem(TAB_COVER_STORAGE_KEY); } catch { /* 프라이빗·차단 */ }
  const next = nextTabCoverValue(typeof location === 'undefined' ? '' : location.search, stored);
  if (next !== stored) {
    try {
      if (next === null) localStorage.removeItem(TAB_COVER_STORAGE_KEY);
      else localStorage.setItem(TAB_COVER_STORAGE_KEY, next);
    } catch { /* 저장 실패 = 이번 세션만 */ }
  }
  cached = tabCoverOnFor(next);
  return cached;
}
/** 테스트 전용. */
export function resetTabCoverCache(): void { cached = null; }

/**
 * 탭 커밋 직후(**useLayoutEffect 안**) 부른다 — 첫 페인트부터 덮개가 opacity 1 로 깔린다(K-07).
 * rAF 로 미루면 새 본문이 덮개 없이 한 프레임 보였다가 덮이는 역행이 생긴다.
 * 모바일(<1024)만: PC 는 View Transition 크로스페이드가 이미 맡는다(두 겹이 되면 안 된다).
 * 덮개의 기본 클래스는 `hidden opacity-0` 이다 — 애니메이션이 끝나면 opacity 0 으로 떨어지고
 * finish 에서 display 를 끈다. finish 가 늦게 와도 보이는 프레임이 생기지 않는다.
 */
export function playTabCover(el: HTMLElement | null): void {
  if (!el || typeof el.animate !== 'function' || !isTabCoverOn()) return;
  if (window.matchMedia('(min-width: 1024px)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const a of el.getAnimations()) a.cancel(); // 연타 — 새 이동이 이긴다
  el.style.display = 'block';
  const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TAB_COVER_MS, easing: EASE });
  anim.onfinish = () => { el.style.display = ''; }; // 클래스 `hidden` 으로 복귀
}
