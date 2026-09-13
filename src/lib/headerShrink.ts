// 모바일 헤더 축소 히스테리시스 — 판정 한 벌.
//
// App.tsx 가 스크롤마다 이 판정으로 헤더를 낮추고(내릴 때 56 을 넘어야 축소, 올릴 때 40 밑이어야 복원),
// CommunityTab 의 섹션 스크롤 복원이 **같은 판정으로 결과를 예측**한다. 헤더는 인플로우 sticky 라 높이가 바뀌면
// 아래 내용이 그만큼 밀리고, 스크롤 앵커링을 구현한 브라우저(Chromium·Firefox)는 그 밀림만큼 scrollY 를 되민다
// (2026-09-13 실측: 게시판에서 scrollTo(80) → 두 프레임 뒤 y=67.25, 헤더 60.5→47.75). 복원 직후 헤더가 뒤집힐지를
// 여기 판정으로 미리 알아야 되밀림을 상쇄할 수 있다 — 임계값이 두 파일에 따로 있으면 언젠가 어긋난다.
export const HEADER_SHRINK_DOWN = 56;
export const HEADER_SHRINK_UP = 40;

/** 현재 축소 상태(prev)에서 scrollY 가 y 일 때의 다음 축소 상태 */
export function nextHeaderShrunk(prev: boolean, y: number): boolean {
  return prev ? y > HEADER_SHRINK_UP : y > HEADER_SHRINK_DOWN;
}

/** 브라우저가 스크롤 앵커링을 구현했는가 — overflow-anchor 를 아는 엔진만 앵커링을 한다(Safari 는 둘 다 없다). */
export const SCROLL_ANCHORING: boolean =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('overflow-anchor', 'none');

/**
 * 저장해 둔 섹션 위치로 돌아갈 scrollTo 목표값.
 *  - 헤더 높이가 저장 당시와 같으면 그대로.
 *  - 다르고, 복원 뒤 히스테리시스가 헤더를 저장 당시 상태로 되돌릴 것이면 → 앵커링이 되밀 만큼(지금 헤더 − 저장 헤더)을 미리 더한다.
 *  - 다르지만 되돌리지 않을 것이면(히스테리시스 띠 안) → 그대로. 헤더는 안 움직이고 위치는 정확하다.
 * 앵커링이 없는 엔진에서는 보정하지 않는다 — 되밀림이 없으니 그대로가 정답이다.
 */
export function restoreScrollTop(
  saved: { y: number; headerH: number },
  headerHNow: number,
  maxScroll: number,
  anchoring: boolean = SCROLL_ANCHORING,
): number {
  let top = saved.y;
  if (anchoring && headerHNow !== saved.headerH) {
    const shrunkNow = headerHNow < saved.headerH;
    const compensated = saved.y + (headerHNow - saved.headerH);
    if (nextHeaderShrunk(shrunkNow, compensated) !== shrunkNow) top = compensated;
  }
  return Math.max(0, Math.min(top, maxScroll));
}
