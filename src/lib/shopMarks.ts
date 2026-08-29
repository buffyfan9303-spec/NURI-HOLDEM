// src/lib/shopMarks.ts — 랭킹 상점 마크 레지스트리(확장분 포함).
//
// 오너 #8 "상점에 더 많은 아이콘들을 추가해줘".
//
// 기존 6종(loyalty.SHOP_MARKS)은 그대로 두고 여기서 **덧붙이기만** 한다.
//   · loyalty.ts 를 고치지 않는 이유: 이번 웨이브의 소유 파일이 아니다(병렬 편집 충돌 회피).
//   · 마크가 '이모지 문자'인 이유: 장착 마크는 닉네임 앞에 **텍스트로** 붙는다
//     (getEquippedMarks → '♠ 닉네임'). SVG 아이콘으로 바꾸면 목록·댓글·리더보드의
//     문자열 결합 경로가 전부 깨진다. 그래서 표기는 이모지로 유지하고,
//     화면 크롬(외치기 배너 등)에만 아이콘/이모지를 쓴다.
//
// 해금 방식도 기존과 동일한 **'도달'**이다(차감 없음) — 활동점수를 깎으면 등급이 내려가고
// 이미 장착한 마크가 다시 잠긴다. 소비형 상품은 외치기(spent_points)로 분리했다.
import { SHOP_MARKS as BASE_MARKS, type ShopMark } from './loyalty';

export type { ShopMark };

/** 추가 마크 — 기존 6종 사이사이를 메워 다음 목표가 항상 가까이 보이게 배치 */
export const EXTRA_MARKS: ShopMark[] = [
  { key: 'chip_stack',  emoji: '🪙', name: '첫 스택',      need: 250,   desc: '판에 앉았다 — 250점' },
  { key: 'joker',       emoji: '🃏', name: '조커',         need: 800,   desc: '변수의 카드 — 800점' },
  { key: 'hot_streak',  emoji: '🔥', name: '핫 스트릭',    need: 1200,  desc: '달아오른 흐름 — 1,200점' },
  { key: 'bullseye',    emoji: '🎯', name: '타겟',         need: 2200,  desc: '노린 자리는 놓치지 않는다 — 2,200점' },
  { key: 'rush',        emoji: '🚀', name: '러시',         need: 3000,  desc: '수직 상승 — 3,000점' },
  { key: 'star_player', emoji: '🌟', name: '스타 플레이어', need: 5000,  desc: '눈에 띄는 사람 — 5,000점' },
  { key: 'gem_hand',    emoji: '💎', name: '다이아 핸드',   need: 6500,  desc: '쥐면 놓지 않는다 — 6,500점' },
  { key: 'turbo',       emoji: '⚡', name: '터보',         need: 10000, desc: '레벨업이 빠르다 — 10,000점' },
  { key: 'shark',       emoji: '🦈', name: '샤크',         need: 12000, desc: '테이블의 포식자 — 12,000점' },
  { key: 'champion',    emoji: '🏆', name: '챔피언',       need: 20000, desc: 'KK 너머 — 20,000점' },
];

/** 기존 + 확장 = 상점에 진열되는 전체 마크(해금 점수 오름차순) */
export const ALL_MARKS: ShopMark[] = [...BASE_MARKS, ...EXTRA_MARKS].sort((a, b) => a.need - b.need);

/** 마크 키 → 이모지(없으면 빈 문자열) — 확장분까지 인식 */
export const markEmoji = (key?: string | null): string =>
  key ? (ALL_MARKS.find((m) => m.key === key)?.emoji ?? '') : '';
