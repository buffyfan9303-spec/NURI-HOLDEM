// src/lib/profileCover.ts — 내 정보 머리의 '배경'(커버 밴드) 선택지 정본(2026-09-27 오너 요청 2).
//
// 데이터는 한 곳 — profiles.profile_cover(null = 기본 '등급색'). 대시보드 머리·프로필 탭·설정 탭이 모두 같은 값을
//   ProfileIdentityHeader 의 커버 한 벌(ProfileCoverBand)로 그린다. 서버는 이 목록만 받는다(CHECK — 마이그레이션 초안은 리드).
// 저장 전에는 설정 탭 안에서만 미리보기로 바뀌고, 저장하면 AuthContext 의 user 가 바뀌어 대시보드·프로필 탭이 같이 바뀐다.

export const PROFILE_COVERS = ['tier', 'violet', 'ocean', 'teal', 'forest', 'sunset', 'rose', 'gold', 'mono'] as const;
export type ProfileCover = (typeof PROFILE_COVERS)[number];

/** 모르는 값·null → 'tier'(기본). 서버 값이 이상해도 화면이 깨지지 않는다. */
export const coverKey = (v: unknown): ProfileCover =>
  (PROFILE_COVERS as readonly unknown[]).includes(v) ? (v as ProfileCover) : 'tier';

const PAIRS: Record<Exclude<ProfileCover, 'tier'>, [string, string]> = {
  violet: ['#A855F7', '#6366F1'],
  ocean:  ['#0EA5E9', '#6366F1'],
  teal:   ['#14B8A6', '#0EA5E9'],
  forest: ['#22C55E', '#14B8A6'],
  sunset: ['#F97316', '#EC4899'],
  rose:   ['#EC4899', '#E879F9'],
  gold:   ['#FFD100', '#F97316'],
  mono:   ['#64748B', '#94A3B8'],
};
export const COVER_LABEL: Record<ProfileCover, string> = {
  tier: '등급색', violet: '보라', ocean: '바다', teal: '청록', forest: '숲', sunset: '노을', rose: '장미', gold: '금빛', mono: '회색',
};

/** 커버 밴드 위에 깔리는 그림(opacity 0.25 층) — 'tier' 는 종전 그대로 등급색에서 투명으로. */
export function coverImage(key: ProfileCover, tierColor: string): string {
  if (key === 'tier') return `linear-gradient(135deg, ${tierColor}, transparent 72%)`;
  const [a, b] = PAIRS[key];
  return `linear-gradient(135deg, ${a}, ${b})`;
}
