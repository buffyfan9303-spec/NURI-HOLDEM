// src/api/nickname.ts — 닉네임 이력으로 옛 이름 기록까지 잇는 조회(20260924k).
//
// 오너 2026-09-24: "바뀐 닉네임도 이전 닉네임을 기록해서 순위·매장이용권 등이 바뀐 닉네임으로 적용되게."
// 저장된 옛 글자(venue_rankings.nickname)는 고치지 않는다 — 서버가 nickname_owner_at(글자, 기록 시각)으로
// '그 시각에 그 이름을 쓰던 계정'을 찾는다. 그래서 여기는 닉네임 인자를 받지 않는다(서버가 auth.uid() 로 안다).
import { supabase, IS_MOCK } from '../lib/supabase';
import type { MyRankingRow } from './rankings';

/** 내 입상 기록 — 지금 닉네임 + 옛 닉네임(바꾸기 전 시각에 적힌 것만). 실패는 종전처럼 빈 목록. */
export async function getMyRankingHistoryAll(limit = 30): Promise<MyRankingRow[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('my_ranking_history', { p_limit: limit });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    date: r.ranking_date, position: r.position, prize: r.prize ?? null, venueName: r.venue_name ?? '(매장)',
  }));
}
