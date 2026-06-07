// src/api/waitlist.ts — 웨이팅(대기) 리스트. 매장 관계자(can_manage_pos)만 접근.
import { supabase, IS_MOCK } from '../lib/supabase';

export interface WaitEntry {
  id: string; venueId: string; displayName: string; party: number;
  phone: string | null; status: string; memo: string | null; createdAt: string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const row = (r: any): WaitEntry => ({
  id: r.id, venueId: r.venue_id, displayName: r.display_name, party: r.party ?? 1,
  phone: r.phone ?? null, status: r.status ?? 'waiting', memo: r.memo ?? null, createdAt: r.created_at,
});

/** 대기/호출 중인 손님(착석·취소 제외) */
export async function getWaitlist(venueId: string): Promise<WaitEntry[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('waitlist').select('*')
    .eq('venue_id', venueId).in('status', ['waiting', 'called']).order('created_at', { ascending: true });
  return (data ?? []).map(row);
}

export async function addWaiting(venueId: string, input: { displayName: string; party: number; phone?: string }): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('waitlist').insert({
    venue_id: venueId, display_name: input.displayName.trim().slice(0, 30) || '대기', party: input.party || 1, phone: input.phone?.trim() || null,
  });
  if (error) throw error;
}

export async function setWaitingStatus(id: string, status: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('waitlist').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function removeWaiting(id: string): Promise<void> {
  if (IS_MOCK) return;
  await supabase.from('waitlist').delete().eq('id', id);
}

export function subscribeWaitlist(venueId: string, cb: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`waitlist:${venueId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist', filter: `venue_id=eq.${venueId}` }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
