// 스타팅 핸드 순위 행 — 순위 화면(StartingHandRankPanel)과 게시판 핸드 분석 모달(HandGtoModal)이 **같이** 쓴다.
// 2026-10-01: 모달이 Chen 공식(preflop.ts RANK_PCT)으로 따로 "상위 N%"를 내 순위 화면과 어긋났다(77: 23% vs 3.9%).
//
// 기준은 두 가지다(기본 = 10인).
//  · 'ten' — 10인 테이블 기준 일반 순위(startingHandRank10.data.ts). 값 없이 **순위만** 있다.
//  · 'hu'  — 헤즈업(무작위 한 손 상대) 정확 승률 순위(startingHandRank.data.ts). 승률 `eq` 가 있다.
// 상위 % 는 두 기준 모두 1326콤보 누적(자기 포함, AA = 0.5%) — 분모를 맞춰 같은 문구로 읽힌다.
// 🔴 두 기준의 순위·승률을 한 줄에 섞어 보여 주지 않는다(77 이 10인 29위 / 헤즈업 9위 — 서로 다른 질문의 답이다).
import { comboCount } from '../../../lib/ranges';
import { STARTING_HAND_EQUITY } from './startingHandRank.data';
import { STARTING_HAND_ORDER_10 } from './startingHandRank10.data';

export type RankBasis = 'ten' | 'hu';

export interface StartingHandRow {
  hand: string; rank: number; kind: string; combos: number;
  /** 이 핸드까지 누적한 콤보가 전체 1326콤보에서 차지하는 비율(%) — "상위 몇 %" */
  topPct: number;
  /** 헤즈업 승률(%) — 'hu' 기준에만 있다. 10인 기준은 null(순위만). */
  eq: number | null;
}

/** 화면 문구용 기준 이름. */
export const RANK_BASIS_LABEL: Record<RankBasis, string> = { ten: '10인 테이블 기준', hu: '헤즈업 승률 기준' };

const kindOf = (h: string) => (h.length === 2 ? '페어' : h.endsWith('s') ? '수딧' : '오프수트');

function build(entries: readonly (readonly [string, number | null])[]): StartingHandRow[] {
  let cum = 0;
  return entries.map(([hand, eq], i) => {
    const combos = comboCount(hand);
    cum += combos;
    return { hand, rank: i + 1, kind: kindOf(hand), combos, topPct: (cum / 1326) * 100, eq };
  });
}

export const STARTING_HAND_ROWS: Record<RankBasis, StartingHandRow[]> = {
  ten: build(STARTING_HAND_ORDER_10.map((h) => [h, null] as const)),
  hu: build(STARTING_HAND_EQUITY),
};
export const STARTING_HAND_BY_HAND: Record<RankBasis, Map<string, StartingHandRow>> = {
  ten: new Map(STARTING_HAND_ROWS.ten.map((r) => [r.hand, r])),
  hu: new Map(STARTING_HAND_ROWS.hu.map((r) => [r.hand, r])),
};
