// src/components/features/tools/handRank.data.ts
// © 2026 엔에이치홀딩스(NURI HOLDEM). 족보 순서·확률(freq)은 공용 사실이라 저작권 대상이 아니고, 설명문(desc)·메모(HAND_RANK_NOTES)만 자체 작성물이다.
// 홀덤 족보(핸드 랭킹) 단일 출처 — HandRankPanel 이 그린다. 강한 순서대로 10개.
// freq = 텍사스 홀덤 7장(내 2장 + 보드 5장)에서 최선 5장이 그 족보가 될 확률(%) — 표준 조합 계산값.
export type HandRank = {
  key: string;
  ko: string;
  en: string;
  desc: string;
  /** 카드 id 5장 — 'As' 형식(MiniCard 규격). */
  cards: readonly [string, string, string, string, string];
  /** 7장 기준 빈도(%) */
  freq: number;
};

export const HAND_RANKS: readonly HandRank[] = [
  { key: 'royal', ko: '로열 플러시', en: 'Royal Flush', desc: '같은 무늬 10·J·Q·K·A. 스트레이트 플러시 중 가장 높은 것.', cards: ['As', 'Ks', 'Qs', 'Js', 'Ts'], freq: 0.0032 },
  { key: 'sflush', ko: '스트레이트 플러시', en: 'Straight Flush', desc: '같은 무늬로 연속된 5장. 높은 카드가 큰 쪽이 이긴다.', cards: ['9h', '8h', '7h', '6h', '5h'], freq: 0.0279 },
  { key: 'quads', ko: '포카드', en: 'Four of a Kind', desc: '같은 숫자 4장 + 아무 카드 1장. 같은 포카드면 다섯째 카드(키커)로 가른다.', cards: ['Qs', 'Qh', 'Qd', 'Qc', '7s'], freq: 0.168 },
  { key: 'full', ko: '풀하우스', en: 'Full House', desc: '같은 숫자 3장 + 같은 숫자 2장. 3장 쪽 숫자를 먼저 비교한다.', cards: ['Jd', 'Jc', 'Jh', '4s', '4d'], freq: 2.60 },
  { key: 'flush', ko: '플러시', en: 'Flush', desc: '같은 무늬 5장(순서 무관). 가장 높은 카드부터 차례로 비교한다.', cards: ['Kc', 'Tc', '8c', '5c', '2c'], freq: 3.03 },
  { key: 'straight', ko: '스트레이트', en: 'Straight', desc: '무늬 상관없이 연속된 5장. A는 A-2-3-4-5(휠)에서 가장 낮게도 쓰인다.', cards: ['Ts', '9d', '8h', '7c', '6s'], freq: 4.62 },
  { key: 'trips', ko: '트리플', en: 'Three of a Kind', desc: '같은 숫자 3장. 포켓 페어로 맞으면 셋, 보드 페어로 맞으면 트립스라 부른다.', cards: ['8s', '8d', '8c', 'Ah', '3d'], freq: 4.83 },
  { key: 'twopair', ko: '투페어', en: 'Two Pair', desc: '페어 두 개. 높은 페어 → 낮은 페어 → 키커 순으로 비교한다.', cards: ['Ah', 'Ad', '9s', '9c', '5h'], freq: 23.5 },
  { key: 'pair', ko: '원페어', en: 'One Pair', desc: '같은 숫자 2장. 같은 페어면 나머지 3장(키커)을 높은 순으로 비교한다.', cards: ['Ks', 'Kd', 'Jh', '7c', '2d'], freq: 43.8 },
  { key: 'high', ko: '하이카드', en: 'High Card', desc: '아무 족보도 없을 때. 가장 높은 카드부터 5장을 차례로 비교한다.', cards: ['Ad', 'Jc', '8s', '6h', '3c'], freq: 17.4 },
];

/** 현장에서 자주 틀리는 것 — 짧게. */
export const HAND_RANK_NOTES: readonly { title: string; body: string }[] = [
  { title: '보드 5장이 곧 족보면 나눠 갖는다', body: '보드가 K K K A A 처럼 그 자체로 최선 5장이면 핸드가 무엇이든 전원 같은 족보 — 팟을 나눈다(스플릿). 단, 보드 스트레이트·플러시는 더 높은 카드를 든 사람이 이기고, 이 예시(K K K A A)도 예외다 — 남은 케이스 킹이나 잔여 에이스 두 장을 든 사람은 포카드로 혼자 이긴다(스플릿 아님).' },
  { title: '키커는 5장 안에서만 센다', body: '족보는 항상 정확히 5장이다. 같은 투페어면 남은 1장, 같은 원페어면 남은 3장만 본다. 여섯째 카드는 아무 힘이 없다.' },
  { title: 'A는 위에도 아래에도 붙는다', body: 'A-2-3-4-5 는 가장 낮은 스트레이트(휠), 10-J-Q-K-A 는 가장 높은 스트레이트. K-A-2-3-4 처럼 A를 가운데 두고 돌아가는 스트레이트는 없다.' },
  { title: '플러시는 5장이다', body: '같은 무늬가 4장이면 아직 아무것도 아니다(플러시 드로우). 무늬끼리는 높낮이가 없다 — 스페이드 플러시가 하트 플러시보다 세지 않다.' },
];
