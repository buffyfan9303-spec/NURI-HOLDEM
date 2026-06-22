// src/api/leagues.ts — 연합 리그(여러 매장 공동 보드): 생성 → 초대(알림) → 수락/거절 → 포인트 → 통합 순위
import { supabase, IS_MOCK } from '../lib/supabase';

export type LeagueMemberStatus = 'pending' | 'accepted' | 'declined';
export type LeaguePhase = 'idle' | 'live' | 'settled' | 'final';
export type LeagueLiveStatus = 'pending' | 'running' | 'settled'; // 🟡 시작전 · 🟢 진행중 · 🔴 정산완료
export interface League { id: string; name: string; ownerVenueId: string; ownerVenueName?: string; seasonStart: string; phase: LeaguePhase; finalVenueId: string | null; eventDate: string | null; }
export interface LeagueMember { id: string; leagueId: string; venueId: string; venueName?: string; status: LeagueMemberStatus; }
export interface LeagueItmPlayer { name: string; place?: number; prize?: string }
export interface LeagueVenueStatus { venueId: string; liveStatus: LeagueLiveStatus; entries: number; itm: LeagueItmPlayer[]; updatedAt: string }
export interface LeagueEntry { id: string; leagueId: string; venueId: string; venueName?: string; name: string; points: number; reason: string | null; entryDate: string; }

/** 내 매장이 리그장이거나 멤버(초대 포함)인 리그 전부 */
export async function getMyLeagues(venueId: string): Promise<{ league: League; myStatus: LeagueMemberStatus | 'owner'; members: LeagueMember[] }[]> {
  if (IS_MOCK) return [];
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('leagues').select('*, venues(name)').eq('owner_venue_id', venueId),
    supabase.from('league_members').select('league_id').eq('venue_id', venueId),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberLeagueIds = (memberships ?? []).map((m: any) => m.league_id);
  const { data: memberLeagues } = memberLeagueIds.length
    ? await supabase.from('leagues').select('*, venues(name)').in('id', memberLeagueIds)
    : { data: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [...(owned ?? []), ...((memberLeagues ?? []) as any[]).filter((l) => !(owned ?? []).some((o: any) => o.id === l.id))];
  if (!all.length) return [];

  const ids = all.map((l) => l.id);
  const { data: mems } = await supabase.from('league_members').select('*, venues(name)').in('league_id', ids);

  return all.map((l) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const members: LeagueMember[] = ((mems ?? []) as any[])
      .filter((m) => m.league_id === l.id)
      .map((m) => ({ id: m.id, leagueId: m.league_id, venueId: m.venue_id, venueName: m.venues?.name, status: m.status }));
    const mine = members.find((m) => m.venueId === venueId);
    return {
      league: { id: l.id, name: l.name, ownerVenueId: l.owner_venue_id, ownerVenueName: l.venues?.name, seasonStart: l.season_start, phase: l.phase ?? 'idle', finalVenueId: l.final_venue_id ?? null, eventDate: l.event_date ?? null },
      myStatus: l.owner_venue_id === venueId ? 'owner' as const : (mine?.status ?? 'pending'),
      members,
    };
  });
}

export async function createLeague(venueId: string, name: string): Promise<string> {
  if (IS_MOCK) return '';
  const { data, error } = await supabase.from('leagues')
    .insert({ name: name.trim(), owner_venue_id: venueId }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteLeague(leagueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('leagues').delete().eq('id', leagueId);
  if (error) throw error;
}

/** 매장 초대 — insert 트리거가 상대 매장 전원에게 알림 발송 */
export async function inviteLeagueMember(leagueId: string, venueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('league_members').insert({ league_id: leagueId, venue_id: venueId });
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('이미 초대한 매장입니다');
    throw error;
  }
}

/** 초대 응답(수락/거절) — update 트리거가 리그장 매장에 알림 */
export async function respondLeagueInvite(memberId: string, accept: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('league_members')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('id', memberId);
  if (error) throw error;
}

export async function removeLeagueMember(memberId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('league_members').delete().eq('id', memberId);
  if (error) throw error;
}

export async function getLeagueEntries(leagueId: string, limit = 400): Promise<LeagueEntry[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('league_entries')
    .select('*, venues(name)').eq('league_id', leagueId)
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, leagueId: r.league_id, venueId: r.venue_id, venueName: r.venues?.name,
    name: r.name, points: r.points, reason: r.reason ?? null, entryDate: r.entry_date,
  }));
}

export async function addLeagueEntry(leagueId: string, venueId: string, input: { name: string; points: number; reason?: string }): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('league_entries').insert({
    league_id: leagueId, venue_id: venueId, name: input.name.trim(),
    points: input.points, reason: input.reason?.trim() || null, created_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function deleteLeagueEntry(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('league_entries').delete().eq('id', id);
  if (error) throw error;
}

// ── 라이브 이벤트(실시간 정산 상태 + ITM + 전체정산 + 파이널) ──────────────────
/** 리그 참가 매장들의 실시간 상태(🟡pending/🟢running/🔴settled)·엔트리·ITM */
export async function getLeagueStatuses(leagueId: string): Promise<LeagueVenueStatus[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('league_event_status')
    .select('venue_id, live_status, entries, itm, updated_at').eq('league_id', leagueId);
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ venueId: r.venue_id, liveStatus: r.live_status, entries: r.entries ?? 0, itm: Array.isArray(r.itm) ? r.itm : [], updatedAt: r.updated_at }));
}

export function subscribeLeagueStatus(leagueId: string, cb: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`league_status:${leagueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'league_event_status', filter: `league_id=eq.${leagueId}` }, () => cb())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** 참가 매장: 내 매장 상태 보고(시작·정산완료 + 엔트리 + ITM 스냅샷) */
export async function setLeagueStatus(leagueId: string, venueId: string, status: LeagueLiveStatus, entries: number, itm?: LeagueItmPlayer[]): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('league_set_status', { p_league_id: leagueId, p_venue_id: venueId, p_status: status, p_entries: entries, p_itm: itm ?? null });
  if (error) throw new Error(error.message);
}

/** 리그장: 전체 정산 완료 → 파이널 매장(엔트리 최다) 반환 */
export async function leagueSettleAll(leagueId: string): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('league_settle_all', { p_league_id: leagueId });
  if (error) throw new Error(error.message);
  return (data as string) ?? null;
}

export async function leagueStartFinal(leagueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('league_start_final', { p_league_id: leagueId });
  if (error) throw new Error(error.message);
}

export async function leagueResetEvent(leagueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('league_reset_event', { p_league_id: leagueId });
  if (error) throw new Error(error.message);
}

/** 통합 스탠딩 — 시즌 시작일 이후 entries를 이름별 합산 */
export function leagueStandings(entries: LeagueEntry[], seasonStart: string): { name: string; points: number; venues: number }[] {
  const m = new Map<string, { name: string; points: number; venueSet: Set<string> }>();
  for (const e of entries) {
    if (e.entryDate < seasonStart) continue;
    const k = e.name.trim().toLowerCase();
    const c = m.get(k) ?? { name: e.name, points: 0, venueSet: new Set<string>() };
    c.points += e.points;
    c.venueSet.add(e.venueId);
    m.set(k, c);
  }
  return [...m.values()]
    .map((x) => ({ name: x.name, points: x.points, venues: x.venueSet.size }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points);
}
