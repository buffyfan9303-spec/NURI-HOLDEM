// src/api/myVenues.ts — 내가 속한 매장 목록(대표 업주 · 승인 공동운영자 · 직원) — 내 매장 상단 매장 전환기의 목록 소스.
//
// 왜 profiles.venue_id 하나로는 안 되나(2026-09-28 critical-reviewer): admin_decide_venue_owner 가
//   `venue_id = coalesce(venue_id, 새 매장)` 이라 이미 매장이 있는 사람은 공동운영 매장을 화면에서 영영 못 열었다.
// 서버 정본은 my_member_venues() 다(SQL 은 리드가 적용). 아직 없으면(42883·PGRST202) 빈 목록 — 전환기가 안 뜰 뿐
//   종전(profiles.venue_id 한 매장) 그대로 동작한다.
import { supabase, IS_MOCK } from '../lib/supabase';

export type VenueRelation = 'owner' | 'coowner' | 'staff';
export interface MemberVenue { id: string; name: string; relation: VenueRelation }

export async function listMyMemberVenues(): Promise<MemberVenue[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('my_member_venues');
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return [];
    throw error;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name ?? '', relation: r.relation as VenueRelation }));
}
