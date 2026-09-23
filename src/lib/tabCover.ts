// src/lib/tabCover.ts — 하단 대메뉴 전환 '덮개' (BOTTOM-TAB-SMOOTH, 2026-09-24)
//
// 오너: "알약 같은 건 상관없고 본문이 문제" — 탭을 누르면 본문이 한 프레임에 컷된다.
// 🔴 본문(.tab-pane)에 opacity/transform 을 걸지 않는다. 그건 본문 레이어를 승격했다 해제하는 것이고
//   (ActiveOpacityAnimation), §0-a25 의 삼성 '전 메뉴 밝기 점프' 부류를 그대로 되살린다.
//   e2e/mobile-tab-transition.spec.ts R3(본문 애니메이션 0)가 그걸 막고 있다.
// → 본문은 그대로 두고, 본문 영역 **위**에 지면색(surface-base) 덮개 한 장을 깔았다가 걷어낸다.
//   합성층이 생기는 것은 덮개 한 장뿐이고, 본문은 그 **아래**라 승격 사유가 생기지 않는다.
//
// 2차(오너 삼성 실기기 `?fx=tabfade`: "밝기 변화는 없지만 딱딱해" → "제일 오류가 없는 모션으로"):
//   덮개 **opacity 만** 쓰는 방식을 유지하고(삼성에서 밝기 변화 없음이 실측된 방식) 곡선만 부드럽게 한 tabsoft 를
//   **기본으로 켠다**. 첫 50ms 는 거의 불투명으로 머물고(새 본문이 자리 잡는 동안) 긴 감속으로 풀린다.
//   transform·방향 변형(wipe·rise)은 새 오류 여지라 만들지 않았다.
//
// 기기별 스위치(localStorage 'nuri:fx'): `?fx=off` 로 이 기기만 끈다, `?fx=tabfade` 는 1차 160ms(비교용),
//   `?fx=tabsoft` 는 기본값을 명시 저장. 전체 끄기는 TAB_COVER_DEFAULT_ON 한 줄을 false 로.

export type TabCoverFx = 'tabfade' | 'tabsoft';
const FX: readonly string[] = ['tabfade', 'tabsoft'];

/** 전체 기본값 — 2026-09-24 리드 결정으로 켬(기본 변형 tabsoft). */
export const TAB_COVER_DEFAULT_ON = true;
export const TAB_COVER_STORAGE_KEY = 'nuri:fx';
export const TAB_COVER_MS: Record<TabCoverFx, number> = { tabfade: 160, tabsoft: 280 };
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'; // index.css --ease (감속) — tabfade
const SOFT = 'cubic-bezier(0.22, 0.61, 0.36, 1)'; // 감속 꼬리가 긴 곡선 — tabsoft
const SOFT_HOLD_MS = 50;

const isFx = (v: string | null): v is TabCoverFx => v !== null && FX.includes(v);

/** URL 의 fx 값과 저장값으로 **새 저장값**을 정한다. 변형 이름 | 'off' | null(미지정). */
export function nextTabCoverValue(search: string, stored: string | null): string | null {
  const fx = new URLSearchParams(search).get('fx');
  if (isFx(fx) || fx === 'off') return fx;
  return isFx(stored) || stored === 'off' ? stored : null;
}

/** 저장값 → 이 기기의 변형(꺼짐이면 null). 미지정은 기본값을 따른다. */
export function tabCoverFxFor(value: string | null, defaultOn = TAB_COVER_DEFAULT_ON): TabCoverFx | null {
  if (isFx(value)) return value;
  return defaultOn && value !== 'off' ? 'tabsoft' : null;
}
export function tabCoverOnFor(value: string | null, defaultOn = TAB_COVER_DEFAULT_ON): boolean {
  return tabCoverFxFor(value, defaultOn) !== null;
}

/** 변형별 키프레임(순수) — 첫 키프레임은 언제나 opacity 1(전면을 덮은 상태, K-07). opacity 외 속성은 쓰지 않는다. */
export function tabCoverKeyframes(fx: TabCoverFx): Keyframe[] {
  if (fx === 'tabfade') return [{ opacity: 1 }, { opacity: 0 }];
  const hold = SOFT_HOLD_MS / TAB_COVER_MS.tabsoft;
  return [{ opacity: 1 }, { opacity: 0.96, offset: hold, easing: SOFT }, { opacity: 0 }];
}

let cached: { fx: TabCoverFx | null } | null = null;
/** 이 기기의 변형(꺼짐이면 null). 첫 호출에서 URL 을 읽고 저장한다 — App 마운트 때 한 번 불러 두어라
 *  (그 뒤 딥링크 처리가 query 를 정리해도 결과가 같다). 저장소가 막힌 브라우저는 URL 값만 쓴다. */
export function tabCoverFx(): TabCoverFx | null {
  if (cached) return cached.fx;
  let stored: string | null = null;
  try { stored = localStorage.getItem(TAB_COVER_STORAGE_KEY); } catch { /* 프라이빗·차단 */ }
  const next = nextTabCoverValue(typeof location === 'undefined' ? '' : location.search, stored);
  if (next !== stored) {
    try {
      if (next === null) localStorage.removeItem(TAB_COVER_STORAGE_KEY);
      else localStorage.setItem(TAB_COVER_STORAGE_KEY, next);
    } catch { /* 저장 실패 = 이번 세션만 */ }
  }
  cached = { fx: tabCoverFxFor(next) };
  return cached.fx;
}
export function isTabCoverOn(): boolean { return tabCoverFx() !== null; }
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
  if (!el || typeof el.animate !== 'function') return;
  const fx = tabCoverFx();
  if (!fx) return;
  if (window.matchMedia('(min-width: 1024px)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const a of el.getAnimations()) a.cancel(); // 연타 — 새 이동이 이긴다
  el.style.display = 'block';
  const anim = el.animate(tabCoverKeyframes(fx), { duration: TAB_COVER_MS[fx], easing: fx === 'tabfade' ? EASE : 'linear' });
  anim.onfinish = () => { el.style.display = ''; }; // 클래스 `hidden` 으로 복귀
}
