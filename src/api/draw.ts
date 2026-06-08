// src/api/draw.ts — 이벤트 추첨 명단 자동 불러오기(오늘 체크인/예약/장부). 권한은 RPC가 게이트.
import { supabase, IS_MOCK } from '../lib/supabase';

export type DrawSource = 'checkin' | 'reservation' | 'ledger' | 'members';

export async function getDrawCandidates(venueId: string, source: DrawSource): Promise<string[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('event_draw_candidates', { p_venue_id: venueId, p_source: source });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.name as string).filter(Boolean);
}
