// src/api/checkins.ts — QR 체크인. 기록은 check_in RPC로만(로그인 회원·4시간 중복 방지).
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';

export interface Checkin { id: string; venueId: string; userId: string; displayName: string | null; createdAt: string }

/** 체크인 결과. points = 이번에 실제 부여된 점수(같은 날 두 번째부터 0), streak = 갱신된 연속일(구형 서버면 null). */
export interface CheckInResult { name: string; points: number; streak: number | null }

/** 서버 반환 정규화 — 20260905k 부터 jsonb {name, points, streak}. 구형 check_in(text) 은 매장명만 돌려주므로
 *  옛 클라 문구와 같게 +3 으로 본다(배포 순서상 클라가 먼저 나간다). */
export function normalizeCheckInResult(data: unknown): CheckInResult {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    return {
      name: typeof o.name === 'string' ? o.name : '',
      points: Number(o.points) || 0,
      streak: o.streak == null ? null : (Number(o.streak) || 0),
    };
  }
  return { name: typeof data === 'string' ? data : '', points: 3, streak: null };
}

/** 체크인 실행. 성공 시 매장명·부여 점수·연속일 반환. */
export async function checkIn(venueId: string): Promise<CheckInResult> {
  if (IS_MOCK) return { name: '데모 매장', points: 3, streak: null };
  const { data, error } = await supabase.rpc('check_in', { p_venue_id: venueId });
  if (error) throw new Error(error.message);
  return normalizeCheckInResult(data);
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
  const u = await currentUser();
  if (!u) return 0;
  const { data } = await supabase.from('profiles')
    .select('checkin_streak, last_checkin_date').eq('id', u.id).single();
  if (!data?.last_checkin_date) return 0;
  const last = new Date(`${data.last_checkin_date}T00:00:00`);
  const diff = Math.round((Date.now() - last.getTime()) / 86400000);
  return diff <= 1 ? (data.checkin_streak ?? 0) : 0; // 이틀 이상 끊겼으면 0으로 표시
}

export function checkinUrl(venueId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nuriholdem.com';
  return `${origin}/?checkin=${venueId}`;
}

export function subscribeCheckins(venueId: string, cb: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`checkins:${venueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: `venue_id=eq.${venueId}` }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
