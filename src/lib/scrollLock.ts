// src/lib/scrollLock.ts — 오버레이 열림 중 배경 페이지 스크롤 잠금(ref-count).
// ⚠ 이 앱의 뷰포트 스크롤러는 body가 아니라 html(index.css의 html{overflow-y:scroll})이다.
//   body.style.overflow='hidden'만으로는 잠기지 않아(무효) 모달 뒤 배경이 그대로 스크롤됐다.
//   → documentElement+body를 함께 잠그고, 중첩 오버레이(포스터 상세 위 글쓰기 모달 등)가
//     안쪽을 닫을 때 바깥 잠금까지 풀지 않도록 카운트로 관리한다.
//   html은 scrollbar-gutter:stable이라 잠금/해제 시 레이아웃 흔들림 없음.
//
// 2026-08-30 자가복구(sweep) 추가 — 왜:
//   Modal·ImageLightbox 는 **포털을 쓰지 않아** 자기가 속한 탭 pane 안에 렌더된다.
//   최상위 탭은 언마운트 없이 display 토글로 keep-alive 되므로(App.tsx), 오버레이가 열린 채
//   탭이 감춰지면 **React 정리 함수가 돌지 않아 카운트가 1 이상으로 남는다.**
//   그 상태는 화면에 아무 단서도 없이 앱 전체 스크롤이 죽고, 새로고침 외엔 사용자가 못 푼다.
//   → 잠금 소유자는 자기 오버레이에 data-scroll-lock 을 달고, 탭 전환 때 sweep 이
//     '보이는 소유자가 하나도 없는데 잠겨 있는' 모순 상태만 골라 되돌린다.
let locks = 0;

const paint = () => {
  const on = locks > 0;
  document.documentElement.style.overflow = on ? 'hidden' : '';
  document.body.style.overflow = on ? 'hidden' : '';
};

export function lockScroll() {
  locks += 1;
  if (locks === 1) paint();
}

export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) paint();
}

/**
 * 잠겨 있는데 화면에 보이는 잠금 소유자가 하나도 없으면 — 정리되지 못한 잠금이다. 되돌린다.
 * display:none 된 조상 아래의 요소는 getClientRects()가 비므로 fixed 오버레이도 정확히 걸러진다.
 * (정상 상태에선 보이는 소유자가 있으므로 아무 일도 하지 않는다 — 오작동 시 손해가 없는 방향.)
 */
export function sweepScrollLocks() {
  if (locks === 0) return;
  const visible = [...document.querySelectorAll<HTMLElement>('[data-scroll-lock]')]
    .some((el) => el.getClientRects().length > 0);
  if (visible) return;
  locks = 0;
  paint();
}
