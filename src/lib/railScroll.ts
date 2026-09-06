// src/lib/railScroll.ts — 가로 탭·칩 레일에서 '활성 항목을 시야 안으로'. 세로는 절대 건드리지 않는다.
//
// ⚠ `element.scrollIntoView()` 를 쓰면 안 된다.
//   그 API 는 **조상 스크롤러를 전부 훑어 올라가며** 맞춰 준다. 가로로만 밀고 싶어도 문서(세로)까지
//   함께 끌어당기고, sticky 헤더에 항목이 조금이라도 가려져 있으면 브라우저는 '안 보인다'고 판정해
//   페이지를 스크롤한다. `behavior:'smooth'` 면 그 움직임이 눈에 그대로 보인다 —
//   탭을 눌렀을 뿐인데 화면이 내려갔다 올라오는 증상이 정확히 이것이다(오너 제보 2026-09-06).
//   이 저장소는 이미 두 번 같은 함정을 밟고 각자 고쳐 뒀다(IntegratedSearchBar MO-2③,
//   VenueManageTab SettingsTabBar). 세 번째부터는 한 곳에 모아 둔다 — 다음 레일이 또 밟지 않도록.
//
// 하는 일은 하나뿐이다: 레일의 scrollLeft 만 직접 계산해 넣는다.

/** el 이 속한 가로 스크롤러를 찾는다(레일을 직접 넘기면 그걸 쓴다). */
function xScrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.scrollWidth > p.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(p).overflowX)) return p;
  }
  return null;
}

/**
 * 활성 항목을 레일 가운데로. 넘치지 않는 레일이면 아무것도 하지 않는다.
 * 위치 계산은 getBoundingClientRect 로 한다 — offsetLeft 는 offsetParent 가 레일이 아닐 때 틀린다.
 */
export function centerInRail(
  el: HTMLElement | null | undefined,
  rail?: HTMLElement | null,
  behavior: ScrollBehavior = 'auto',
): void {
  if (!el) return;
  const r = rail ?? xScrollerOf(el);
  if (!r) return;
  const max = r.scrollWidth - r.clientWidth;
  if (max <= 0) return; // 넘치지 않으면 움직일 이유가 없다
  const er = el.getBoundingClientRect();
  const rr = r.getBoundingClientRect();
  const to = Math.max(0, Math.min(max, r.scrollLeft + (er.left - rr.left) - (rr.width - er.width) / 2));
  if (Math.abs(r.scrollLeft - to) < 1) return; // 이미 제자리 — 불필요한 스크롤 이벤트를 만들지 않는다
  r.scrollTo({ left: to, behavior });
}
