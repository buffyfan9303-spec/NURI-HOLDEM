// src/api/seasons.ts — 매장 시즌(분기) 리그
//   시즌 기간 venue_rankings 집계 랭킹 + 종료 시 스냅샷 아카이브 + 상위3 활동점수 보상(서버 처리).
import { supabase, IS_MOCK } from '../lib/supabase';

export interface VenueSeason {
  id: string; venueId: string; name: string;
  startsOn: string; endsOn: string; status: 'active' | 'ended'; endedAt: string | null;
}
export interface SeasonStanding {
  rank: number; nickname: string; realName: string | null;
  points: number; prizeMan: number; appearances: number; bestPosition: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSeason(r: any): VenueSeason {
  return { id: r.id, venueId: r.venue_id, name: r.name, startsOn: r.starts_on, endsOn: r.ends_on, status: r.status, endedAt: r.ended_at ?? null };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToStanding(r: any): SeasonStanding {
  return { rank: Number(r.rank), nickname: r.nickname, realName: r.real_name ?? null, points: Number(r.points) || 0, prizeMan: Number(r.prize_man) || 0, appearances: Number(r.appearances) || 0, bestPosition: Number(r.best_position) || 0 };
}

export async function listVenueSeasons(venueId: string): Promise<VenueSeason[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('list_venue_seasons', { p_venue_id: venueId });
  return (data ?? []).map(rowToSeason);
}

export async function getCurrentSeasonStandings(venueId: string): Promise<SeasonStanding[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('current_season_standings', { p_venue_id: venueId });
  return (data ?? []).map(rowToStanding);
}

export async function getSeasonResults(seasonId: string): Promise<SeasonStanding[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('season_results', { p_season_id: seasonId });
  return (data ?? []).map(rowToStanding);
}

export async function createVenueSeason(venueId: string, name: string, startsOn: string, endsOn: string): Promise<string> {
  if (IS_MOCK) throw new Error('Mock');
  const { data, error } = await supabase.rpc('create_venue_season', { p_venue_id: venueId, p_name: name, p_starts_on: startsOn, p_ends_on: endsOn });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function endVenueSeason(seasonId: string): Promise<number> {
  if (IS_MOCK) return 0;
  const { data, error } = await supabase.rpc('end_venue_season', { p_season_id: seasonId });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export interface HallOfFameEntry { seasonId: string; seasonName: string; endsOn: string; nickname: string; realName: string | null; points: number }
export async function getVenueHallOfFame(venueId: string): Promise<HallOfFameEntry[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.rpc('venue_hall_of_fame', { p_venue_id: venueId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ seasonId: r.season_id, seasonName: r.season_name, endsOn: r.ends_on, nickname: r.nickname, realName: r.real_name ?? null, points: Number(r.points) || 0 }));
}

/** 내 시즌 우승 횟수(전 매장, 닉네임 기준) — 영구 배지용 */
export async function getMyChampionships(nickname: string): Promise<number> {
  if (IS_MOCK || !nickname.trim()) return 0;
  const { data } = await supabase.rpc('my_championships', { p_nickname: nickname.trim() });
  return Number(data) || 0;
}
