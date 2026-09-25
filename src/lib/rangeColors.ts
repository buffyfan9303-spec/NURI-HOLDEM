// 레인지 매트릭스·범례·푸시폴드 차트의 **칸 채움색** — 아우라 팔레트(바이올렛 주색 · 틸 신호색 · 푸시아 강조)로 테마별 한 벌.
//
// 🔴 2026-09-26 오너 RANGE-COLORS-AURA: 9/25 글자색 규칙(cellText.ts)만으로는 못 넘던 칸이 남았다 —
//   다크 콜 #10B981 위 흰 글자 2.54 · 다크 4벳 #8B5CF6 4.23 · 폴드 칸 글자 1.98/2.27. 채움색 자체를 바꿔야 4.5:1 을 넘는다.
// 왜 테마별인가: 글자는 셀 세로 30~70% 띠에 놓이고, 반쯤 채운 칸에서는 **채움색과 지면색에 동시에** 걸친다.
//   다크 지면(#1B243C)은 검은 글자 1.36 이라 글자가 흰색이어야 하고 → 모든 채움색은 흰 글자 ≥4.5(명도 L ≤ 0.183).
//   라이트 지면(#EEF2F8)은 흰 글자 1.12 라 글자가 검정이어야 하고 → 모든 채움색은 검은 글자 ≥4.5(L ≥ 0.175).
//   한 색이 두 조건을 다 만족하는 창은 L 0.175~0.183 뿐이라(현실적으로 없다) 테마마다 다른 hex 를 쓴다.
// 수치(WCAG 대비, 지면 = --surface-high) — src/components/features/tools/cellText.test.ts 가 잠근다:
//   다크  raise #6344CE(=accent-300) 흰 6.46 · call #0E7490(=라이트 aura-300) 흰 5.36 · fourbet #A21CAF 흰 6.32 — 지면 대비 2.4~2.9
//   라이트 raise #9D7BF7 검 6.61 · call #0891B2(=aura-400) 검 5.70 · fourbet #D946EF 검 6.07 — 지면 대비 2.8~3.3
// 색각 이상: 공격(바이올렛)과 콜(틸)은 S-원추(청-황) 축에서 갈려 적록색약에서도 구별된다. 4벳은 콜과만 한 판에 놓인다(vs 3벳 표).
// ⚠ src/lib/ranges.data.ts 의 ACTION_COLORS(테마 무관 hex) 는 GTO 딥 패널 빈도바가 아직 쓴다 — 그쪽 통일은 별도 판단.

export type ActionTone = 'raise' | 'call' | 'fourbet';
export type RangeTheme = 'dark' | 'light';

export const RANGE_FILL: Record<RangeTheme, Record<ActionTone, string>> = {
  dark: { raise: '#6344CE', call: '#0E7490', fourbet: '#A21CAF' },
  light: { raise: '#9D7BF7', call: '#0891B2', fourbet: '#D946EF' },
};

/** 액션 키 → 색 톤. 레인지 표 키(raise·allin·call·fourbet)와 푸시폴드 뷰 키(shove·callBB·callSB)를 한 규칙으로 받는다. */
export function toneOfKey(key: string): ActionTone {
  if (key === 'fourbet') return 'fourbet';
  return /^call/i.test(key) ? 'call' : 'raise';
}
