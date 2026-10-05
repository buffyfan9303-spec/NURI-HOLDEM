// src/lib/posterFallbackBg.ts — ScheduleCard 에서 옮김(react-refresh: 컴포넌트 파일은 컴포넌트만 export).
/** 이미지 없는 로고·포스터 자리의 배경.
 *  🔴 2026-09-24(design-reviewer 실측) — 종전엔 `${posterColor}ee` 를 그대로 붙였는데, 호출부가 `venue?.themeColor ?? schedule.posterColor`
 *    로 **null** 을 넘기면 기본값 인자('#1a1d24')를 우회해 `nullee` 가 되어 그라데이션 전체가 무효 → 배경이 사라졌다.
 *    라이트 지면 위 흰 이니셜 대비 **1.00**(다크는 어두운 지면이라 가려졌다). null·빈 값도 기본색으로 떨어뜨린다.
 *  회귀: src/components/features/posterFallbackBg.test.ts */
// 2026-10-05 4안 미드나이트 블루: 기본색 흑회 #1a1d24 → 푸른 먹색(SPOT 아이콘 원판과 같은 계열), 끝색도 푸른 먹색.
export const POSTER_FALLBACK_COLOR = '#2B4166';
export function posterFallbackBg(posterColor?: string | null): string {
  const base = posterColor && posterColor.trim() ? posterColor.trim() : POSTER_FALLBACK_COLOR;
  return `linear-gradient(135deg, ${base}ee 0%, #111A27 100%)`;
}
