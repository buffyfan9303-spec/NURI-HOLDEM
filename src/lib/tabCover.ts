// src/lib/tabCover.ts — 하단 대메뉴 전환 '덮개' (BOTTOM-TAB-SMOOTH, 2026-09-24)
//
// 오너: "알약 같은 건 상관없고 본문이 문제" — 탭을 누르면 본문이 한 프레임에 컷된다.
// 🔴 본문(.tab-pane)에 opacity/transform 을 걸지 않는다. 그건 본문 레이어를 승격했다 해제하는 것이고
//   (ActiveOpacityAnimation), §0-a25 의 삼성 '전 메뉴 밝기 점프' 부류를 그대로 되살린다.
//   e2e/mobile-tab-transition.spec.ts R3(본문 애니메이션 0)가 그걸 막고 있다.
// → 본문은 그대로 두고, 본문 영역 **위**에 지면색(surface-base) 덮개 한 장을 깔았다가 걷어낸다.
//   합성층이 생기는 것은 덮개 한 장뿐이고, 본문은 그 **아래**라 승격 사유가 생기지 않는다.
//
// 2차(오너 삼성 실기기 "밝기 변화는 없지만 딱딱해" → "제일 오류가 없는 모션으로"): 덮개 **opacity 만** 쓰고
//   첫 50ms 는 거의 불투명으로 머문 뒤 긴 감속으로 풀리는 tabsoft 280ms 를 **기본으로 켠다**.
//   오너가 tabsoft 를 채택해 1차 비교용 `?fx=tabfade`(160ms)는 3차에서 지웠다 — 저장돼 있던 값은 무시·정리한다.
//
// 3차(리드 실측: 프로덕션에서 GTO 첫 방문 4회 중 3회 '새 본문 첫 프레임에 덮개 없음'):
//   덮개를 **고정 시각**에 걷으면, 목적지 본문이 늦게 그려질 때(Suspense 폴백 뒤 공개 — React 폴백 스로틀 ~300ms,
//   느린 폰) 덮개가 먼저 걷혀 스피너·빈 판이 드러나고 새 본문은 덮개 없이 컷으로 나타난다.
//   → 커밋 때 덮개를 opacity 1 로 깔아 두고, rAF 마다 **목적지 판이 실제로 그려졌는지**(tabPaneReady) 본 뒤에야
//     걷기 시작한다. 상한 TAB_COVER_WAIT_MAX_MS 를 넘으면 그래도 걷는다(영원히 덮지 않는다). 덮개는
//     pointer-events-none 이라 기다리는 동안에도 조작을 막지 않는다. 연타면 새 이동이 이긴다.
//
// 기기별 스위치(localStorage 'nuri:fx'): `?fx=off` 로 이 기기만 끈다, `?fx=tabsoft` 는 켬을 명시 저장.
//   전체 끄기는 TAB_COVER_DEFAULT_ON 한 줄을 false 로.

/** 전체 기본값 — 2026-09-24 리드 결정으로 켬(tabsoft). */
export const TAB_COVER_DEFAULT_ON = true;
export const TAB_COVER_STORAGE_KEY = 'nuri:fx';
export const TAB_COVER_MS = 280;
/** 목적지 판을 기다리는 상한 — 넘으면 준비 여부와 상관없이 걷는다. */
export const TAB_COVER_WAIT_MAX_MS = 700;
const SOFT = 'cubic-bezier(0.22, 0.61, 0.36, 1)'; // 감속 꼬리가 긴 곡선
const SOFT_HOLD_MS = 50;

const isSwitch = (v: string | null): v is 'tabsoft' | 'off' => v === 'tabsoft' || v === 'off';

/** URL 의 fx 값과 저장값으로 **새 저장값**을 정한다. 'tabsoft' | 'off' | null(미지정). 그 밖의 값(지운 'tabfade' 포함)은 무시. */
export function nextTabCoverValue(search: string, stored: string | null): string | null {
  const fx = new URLSearchParams(search).get('fx');
  if (isSwitch(fx)) return fx;
  return isSwitch(stored) ? stored : null;
}

/** 저장값 → 이 기기에서 켜짐 여부. 미지정은 기본값을 따른다. */
export function tabCoverOnFor(value: string | null, defaultOn = TAB_COVER_DEFAULT_ON): boolean {
  return value === 'tabsoft' || (defaultOn && value !== 'off');
}

/** 키프레임(순수) — 첫 키프레임은 언제나 opacity 1(전면을 덮은 상태, K-07). opacity 외 속성은 쓰지 않는다. */
export function tabCoverKeyframes(): Keyframe[] {
  return [{ opacity: 1 }, { opacity: 0.96, offset: SOFT_HOLD_MS / TAB_COVER_MS, easing: SOFT }, { opacity: 0 }];
}

let cached: boolean | null = null;
/** 이 기기에서 켜짐 여부. 첫 호출에서 URL 을 읽고 저장한다 — App 마운트 때 한 번 불러 두어라
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
 * 목적지 판이 **실제 내용으로** 그려졌는가(덮개를 걷어도 되는가).
 * ① App 의 탭 로딩 자리(`.pane-reserve[aria-busy="true"]` — Suspense 폴백 LazyFallback·내 매장 권한 대기)가
 *    보이면 아직이다. 첫 방문 lazy 판이 급한 업데이트에서 서스펜드하면 판은 DOM 에 없고 이것만 보인다.
 * ② 판이 DOM 에 있으면 React 가 숨긴 상태(display none — 폴백 중 기존 자식 숨김)가 아니고 높이가 있어야 한다.
 * 판이 없는 목적지(event 처럼 판 없이 여는 탭)는 ①만 본다.
 */
export function tabPaneReady(tab: string): boolean {
  for (const el of document.querySelectorAll('.pane-reserve[aria-busy="true"]')) {
    if (el.getClientRects().length > 0) return false;
  }
  const pane = document.querySelector<HTMLElement>(`.tab-pane[data-tab="${tab}"]`);
  return !pane || (pane.style.display !== 'none' && pane.offsetHeight > 0);
}

let run = 0;
/**
 * 탭 커밋 직후(**useLayoutEffect 안**) 부른다 — 첫 페인트부터 덮개가 opacity 1 로 깔린다(K-07).
 * 걷기는 rAF 에서 `tabPaneReady(tab)` 이 참이 된 프레임에 시작한다(상한 TAB_COVER_WAIT_MAX_MS).
 * 모바일(<1024)만: PC 는 View Transition 크로스페이드가 이미 맡는다(두 겹이 되면 안 된다).
 * 덮개의 기본 클래스는 `hidden opacity-0` 이다 — 끝나면 인라인 display·opacity 를 지워 클래스로 돌아간다.
 */
export function playTabCover(el: HTMLElement | null, tab: string): void {
  if (!el || typeof el.animate !== 'function') return;
  if (!isTabCoverOn()) return;
  if (window.matchMedia('(min-width: 1024px)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const my = ++run; // 연타 — 새 이동이 이긴다(이전 대기·애니메이션은 버린다)
  for (const a of el.getAnimations()) a.cancel();
  el.style.display = 'block';
  el.style.opacity = '1';
  const t0 = performance.now();
  const tick = () => {
    if (my !== run) return;
    if (!tabPaneReady(tab) && performance.now() - t0 < TAB_COVER_WAIT_MAX_MS) { requestAnimationFrame(tick); return; }
    const anim = el.animate(tabCoverKeyframes(), { duration: TAB_COVER_MS, easing: 'linear' });
    anim.onfinish = () => { if (my === run) { el.style.display = ''; el.style.opacity = ''; } };
  };
  requestAnimationFrame(tick);
}
