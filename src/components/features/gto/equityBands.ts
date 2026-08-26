// src/components/features/gto/equityBands.ts
// 에퀴티 '강도' 그라디언트 — GtoDeepPanel 권장 액션(preflopRec/postRec)의 5밴드 색.
//
// ⚠ 색 2축 분리(검증 #01 critical): 이 상수는 "핸드가 얼마나 강한가"라는 연속 강도 축이고,
// src/lib/ranges.data.ts 의 ACTION_COLORS 는 "어떤 액션인가"라는 범주 축이다.
// 두 축은 의미가 달라 **통일 대상이 아니다** — 여기 값을 ACTION_COLORS 로 바꾸거나
// 반대로 액션 빈도바에 이 그라디언트를 쓰면 그것이 곧 회귀다.
// 5밴드 값·의미는 기존 GtoDeepPanel 인라인 값과 1:1 동일하게 보존했다(데이터 fill 전용 hex 예외).
export const EQUITY_BANDS = {
  /** 밴드 1 — 압도적 우위(밸류 벳/레이즈 구간) */
  dominant: '#EF4444',
  /** 밴드 2 — 우위(레이즈·벳/콜 혼합 구간) */
  strong: '#F59E0B',
  /** 밴드 3 — 참여 가능(콜·체크-콜 구간) */
  playable: '#22C55E',
  /** 밴드 4 — 경계(오즈·포지션 조건부 구간) */
  marginal: '#3B82F6',
  /** 밴드 5 — 열세(폴드·체크-폴드 구간) — 밴드 4와 동일 색(기존 값 1:1 보존) */
  weak: '#3B82F6',
} as const;
