// 판(pane) 전환 중 높이 시계열의 "모양"을 판정하는 순수 함수 — S6(2026-09-19, 오너 "말려 올라가거나
// 내려간다") 회귀 게이트(e2e/mystore-transition-cls.spec.ts)가 쓴다. 브라우저가 없어도 되는 순수
// 배열 로직이라 여기 둔다 — e2e/ 는 Playwright 전용이라 vitest 가 안 본다(vitest.config.ts).
//
// 왜 "단조 비감소"가 아니라 "오르내림 없음"인가(2026-09-19 실측):
//   처음엔 "전환 중 높이가 한 번도 줄지 않는다"로 짰다. 그런데 실측하자마자 깨졌다 — 시드 없이
//   들어간 '게임 진행'(장부 목록 모드)·첫 방문 '이벤트 신청' 둘 다 대시보드보다 원래 더 짧은
//   화면이라, 자리 예약이 풀리며 `1082.03 → (고정) → 753.84` 처럼 **한 번, 깨끗하게** 내려앉는다.
//   이건 오너가 신고한 오르내림이 아니라 그냥 더 짧은 목적지로 정착하는 것이다.
//   옛 버그(매장 설정)의 실제 패턴은 `906 → 줄었다가 → 1022 → 줄었다가 → 3229` — **증가와 감소가
//   같은 전환 안에 섞여 있었다.** 그래서 정의를 "증가와 감소가 함께 나타나는가"로 바꿨다.
export interface HeightSample { t: number; h: number }
export interface Oscillation { t: number; from: number; to: number; kind: '감소 뒤에 증가' | '증가 뒤에 감소' }

/** 오르내림(진동) 검출 — 1px 이 아니라 24px 임계값을 쓴다(아래 근거). 섞인 첫 지점을 돌려준다. */
export const OSCILLATION_EPS_PX = 24;

export function findOscillation(heights: readonly HeightSample[], eps = OSCILLATION_EPS_PX): Oscillation | null {
  let sawIncrease = false;
  let sawDecrease = false;
  for (let i = 1; i < heights.length; i++) {
    const d = heights[i].h - heights[i - 1].h;
    if (d > eps) {
      if (sawDecrease) return { t: heights[i].t, from: heights[i - 1].h, to: heights[i].h, kind: '감소 뒤에 증가' };
      sawIncrease = true;
    } else if (d < -eps) {
      if (sawIncrease) return { t: heights[i].t, from: heights[i - 1].h, to: heights[i].h, kind: '증가 뒤에 감소' };
      sawDecrease = true;
    }
  }
  return null;
}

/** '정착' 시각 — 높이가 마지막으로 eps px 이상 바뀐 시각. 그 뒤 windowMs(기본 300ms) 안의
 *  layout-shift 합을 구할 때 쓴다(실제 합산은 호출부가 한다 — 여기는 시각만 순수하게 계산). */
export function settleAt(heights: readonly HeightSample[], eps = OSCILLATION_EPS_PX): number {
  let at = heights.length ? heights[0].t : 0;
  for (let i = 1; i < heights.length; i++) {
    if (Math.abs(heights[i].h - heights[i - 1].h) > eps) at = heights[i].t;
  }
  return at;
}
