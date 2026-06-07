// src/api/checkins.ts — QR 체크인. 기록은 check_in RPC로만(로그인 회원·4시간 중복 방지).
import { supabase, IS_MOCK } from '../lib/supabase';

export interface Checkin { id: string; venueId: string; userId: string; displayName: string | null; createdAt: string }

/** 체크인 실행. 성공 시 매장명 반환. */
export async function checkIn(venueId: string): Promise<string> {
  if (IS_MOCK) return '데모 매장';
  const { data, error } = await supabase.rpc('check_in', { p_venue_id: venueId });
  if (error) throw new Error(error.message);
  return (data as string) ?? '';
}

export async function listVenueCheckins(venueId: string, sinceIso: string): Promise<Checkin[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('checkins').select('*')
    .eq('venue_id', venueId).gte('created_at', sinceIso).order('created_at', { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, userId: r.user_id, displayName: r.display_name ?? null, createdAt: r.created_at }));
}

export function checkinUrl(venueId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nuriholdem.com';
  return `${origin}/?checkin=${venueId}`;
}

/** QR 이미지 URL (venue_id만 인코딩 — 비민감). */
export function checkinQrUrl(venueId: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(checkinUrl(venueId))}`;
}

export function subscribeCheckins(venueId: string, cb: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`checkins:${venueId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: `venue_id=eq.${venueId}` }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
