// src/lib/viewTransition.ts — 화면 전환 마스킹의 단일 출처.
//
// 메이저 사이트의 '부드러움'은 전환 커밋 비용이 0이라서가 아니라, View Transition 이
// 이전 화면 스냅샷을 고정해 두고 그 '뒤에서' 무거운 커밋(마운트·display 토글·스크롤 복원)을
// 끝낸 뒤 완성된 화면으로 짧은 크로스페이드만 보여주기 때문이다 — 중간 과정이 화면에
// 노출될 수 없는 구조라 '투두둑'이 물리적으로 보이지 않는다.
//
// update 는 flushSync 로 감싼 동기 커밋이어야 스냅샷 뒤에서 끝난다(호출측 책임).
// 미지원 브라우저·모션 축소 설정에선 fallback(없으면 update)을 그대로 실행 — 점진적 향상.
type VTDocument = Document & { startViewTransition?: (cb: () => void) => unknown };

export function withViewTransition(update: () => void, fallback?: () => void): void {
  const d = document as VTDocument;
  if (d.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    d.startViewTransition.call(document, update);
  } else {
    (fallback ?? update)();
  }
}
