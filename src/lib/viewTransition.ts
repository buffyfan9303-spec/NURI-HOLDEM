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

export type VTDirection = 'forward' | 'back';

export function withViewTransition(update: () => void, fallback?: () => void, dir?: VTDirection): void {
  const d = document as VTDocument;
  // document.hidden: 숨긴 문서에서 startViewTransition 은 InvalidStateError 로 abort 되고,
  // 그 ready/finished 거부가 unhandledrejection 으로 새어 에러 수집망(Sentry)을 오염시킨다.
  // 안 보이는 화면에 전환 연출은 무의미하므로 폴백 경로로 우회.
  if (d.startViewTransition && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // 방향 마커 — 탭 전환은 애플식 '밀어내기'(패럴랙스 슬라이드), 오버레이는 기본 크로스페이드.
    // 속성은 남아 있어도 다음 호출이 덮으므로 정리 타이머가 필요 없다.
    if (dir) document.documentElement.dataset.vtDir = dir;
    else delete document.documentElement.dataset.vtDir;
    const t = d.startViewTransition.call(document, update) as
      | { ready?: Promise<void>; finished?: Promise<void>; updateCallbackDone?: Promise<void> }
      | undefined;
    // 전환 자체의 취소(연타로 다음 전환이 이번 것을 대체, 탭 백그라운드 전환 등)는 정상 동작 —
    // 거부를 소비해 unhandledrejection 소음을 차단한다(update 커밋은 어느 경우에도 실행됨).
    t?.ready?.catch(() => {});
    t?.finished?.catch(() => {});
    t?.updateCallbackDone?.catch(() => {});
  } else {
    (fallback ?? update)();
  }
}
