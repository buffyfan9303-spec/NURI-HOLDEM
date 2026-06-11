// src/api/reviews.ts — 매장 후기·별점. 읽기 공개 / 작성은 해당 매장 체크인 인증자만(RLS 강제).
import { supabase, IS_MOCK } from '../lib/supabase';

export interface VenueReview {
  id: string;
  venueId: string;
  userId: string;
  nickname: string;
  rating: number; // 1~5
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface ReviewRow {
  id: string; venue_id: string; user_id: string; nickname: string;
  rating: number; content: string; created_at: string; updated_at: string;
}
const mapRow = (r: ReviewRow): VenueReview => ({
  id: r.id, venueId: r.venue_id, userId: r.user_id, nickname: r.nickname || '회원',
  rating: r.rating, content: r.content ?? '', createdAt: r.created_at, updatedAt: r.updated_at,
});

/** 매장 후기 목록(최신순). */
export async function getVenueReviews(venueId: string): Promise<VenueReview[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venue_reviews').select('*')
    .eq('venue_id', venueId).order('created_at', { ascending: false });
  if (error) return [];
  return ((data ?? []) as ReviewRow[]).map(mapRow);
}

/** 내가 이 매장에 체크인한 적 있는지(후기 작성 자격) — 서버 RLS와 동일 조건의 UX 프리체크. */
export async function canReviewVenue(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return false;
  const { count } = await supabase.from('checkins').select('id', { count: 'exact', head: true })
    .eq('user_id', uid).eq('venue_id', venueId);
  return (count ?? 0) > 0;
}

/** 후기 저장 — 매장당 1인 1후기(있으면 수정). */
export async function saveVenueReview(venueId: string, rating: number, content: string, nickname: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('venue_reviews').upsert({
    venue_id: venueId, user_id: uid, nickname, rating,
    content: content.trim(), updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,user_id' });
  if (error) {
    // RLS 위반(체크인 기록 없음)이 42501로 옴 — 사용자 언어로 변환
    if (error.code === '42501') throw new Error('매장 QR 체크인 후에 후기를 쓸 수 있어요');
    throw new Error(error.message);
  }
}

/** 전 매장 별점 집계 — venueId → {avg, count}. 매장 카드·일정탐색 ⭐표시용(읽기 공개라 1쿼리). */
export interface VenueRating { avg: number; count: number }
export async function getVenueRatings(): Promise<Record<string, VenueRating>> {
  if (IS_MOCK) return {};
  const { data } = await supabase.from('venue_reviews').select('venue_id, rating').limit(5000);
  const agg = new Map<string, { sum: number; n: number }>();
  for (const r of (data ?? []) as { venue_id: string; rating: number }[]) {
    const cur = agg.get(r.venue_id) ?? { sum: 0, n: 0 };
    cur.sum += r.rating; cur.n += 1;
    agg.set(r.venue_id, cur);
  }
  const out: Record<string, VenueRating> = {};
  for (const [k, v] of agg) out[k] = { avg: Math.round((v.sum / v.n) * 10) / 10, count: v.n };
  return out;
}

/** 후기 삭제(본인 또는 운영자). */
export async function deleteVenueReview(id: string): Promise<void> {
  const { error } = await supabase.from('venue_reviews').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
