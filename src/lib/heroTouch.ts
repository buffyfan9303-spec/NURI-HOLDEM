// 매장 hero(VenuePage) 손가락 판정 — 스와이프·탭을 가르는 순수 함수.
// UP-12(2026-10-08): 예전엔 터치 핸들러 자체를 사진이 2장 이상일 때만 붙여, 포스터가 **1장**인 매장은
//   모바일에서 hero 를 탭해도 아무 일도 없었다(클릭 버튼은 lg 이상 전용). 탭 판정은 장수와 무관하게 하고,
//   넘기기만 2장 이상으로 막는다.
export type HeroTouchIntent = 'next' | 'prev' | 'tap' | null;

export function heroTouchIntent(dx: number, dy: number, count: number): HeroTouchIntent {
  if (count <= 0) return null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) return count > 1 ? (dx < 0 ? 'next' : 'prev') : null;
  // 거의 안 움직였으면 스와이프가 아니라 탭이다.
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return 'tap';
  return null;
}
