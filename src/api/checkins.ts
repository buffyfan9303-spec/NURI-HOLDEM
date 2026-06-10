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

/** 내 출석 스트릭(연속 체크인 일수). 오늘/어제 외 마지막 체크인이면 화면용으로 0 처리. */
export async function getMyCheckinStreak(): Promise<number> {
  if (IS_MOCK) return 0;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 0;
  const { data } = await supabase.from('profiles')
    .select('checkin_streak, last_checkin_date').eq('id', u.user.id).single();
  if (!data?.last_checkin_date) return 0;
  const last = new Date(`${data.last_checkin_date}T00:00:00`);
  const diff = Math.round((Date.now() - last.getTime()) / 86400000);
  return diff <= 1 ? (data.checkin_streak ?? 0) : 0; // 이틀 이상 끊겼으면 0으로 표시
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
