// src/lib/scrollLock.ts — 오버레이 열림 중 배경 페이지 스크롤 잠금(ref-count).
// ⚠ 이 앱의 뷰포트 스크롤러는 body가 아니라 html(index.css의 html{overflow-y:scroll})이다.
//   body.style.overflow='hidden'만으로는 잠기지 않아(무효) 모달 뒤 배경이 그대로 스크롤됐다.
//   → documentElement+body를 함께 잠그고, 중첩 오버레이(포스터 상세 위 글쓰기 모달 등)가
//     안쪽을 닫을 때 바깥 잠금까지 풀지 않도록 카운트로 관리한다.
//   html은 scrollbar-gutter:stable이라 잠금/해제 시 레이아웃 흔들림 없음.
let locks = 0;

export function lockScroll() {
  locks += 1;
  if (locks === 1) {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
}

export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }
}
