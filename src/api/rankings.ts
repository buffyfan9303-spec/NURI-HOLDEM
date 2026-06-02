// src/api/rankings.ts — 매장 일일 손님 순위
import { supabase, IS_MOCK } from '../lib/supabase';

export interface RankingEntry {
  position: number;
  nickname: string;
  realName: string;
}

// 실명 마스킹: 홍길동 → 홍*동, 나리 → 나*, 남궁민수 → 남**수
export function maskRealName(name: string): string {
  const n = (name ?? '').trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${'*'.repeat(n.length - 2)}${n[n.length - 1]}`;
}

// 공개 표시 문자열: 닉네임(마스킹실명) — 예: 도토리(나*리)
export function rankingLabel(e: RankingEntry): string {
  const masked = maskRealName(e.realName);
  return masked ? `${e.nickname}(${masked})` : e.nickname;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(r: any): RankingEntry {
  return { position: r.position, nickname: r.nickname, realName: r.real_name };
}

export async function getLatestRankingDate(venueId: string): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase
    .from('venue_rankings').select('ranking_date')
    .eq('venue_id', venueId).order('ranking_date', { ascending: false }).limit(1);
  if (error) throw error;
  return data && data.length ? (data[0] as { ranking_date: string }).ranking_date : null;
}

export async function getVenueRankings(
  venueId: string,
  date?: string,
): Promise<{ date: string | null; entries: RankingEntry[] }> {
  if (IS_MOCK) return { date: null, entries: [] };
  const d = date ?? (await getLatestRankingDate(venueId));
  if (!d) return { date: null, entries: [] };
  const { data, error } = await supabase
    .from('venue_rankings').select('*')
    .eq('venue_id', venueId).eq('ranking_date', d)
    .order('position', { ascending: true });
  if (error) throw error;
  return { date: d, entries: (data ?? []).map(rowToEntry) };
}

export async function saveVenueRankings(
  venueId: string,
  date: string,
  entries: { nickname: string; realName: string }[],
): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('save_venue_rankings', {
    p_venue_id: venueId,
    p_date: date,
    p_entries: entries.map((e) => ({ nickname: e.nickname, realName: e.realName })),
  });
  if (error) throw error;
}
