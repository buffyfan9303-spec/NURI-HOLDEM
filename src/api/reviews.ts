// src/api/reviews.ts — 매장 후기·별점. 읽기 공개 / 작성은 해당 매장 체크인 인증자만(RLS 강제).
import { supabase, IS_MOCK } from '../lib/supabase';
import { mustAffect } from './_mustAffect';
import { currentUser } from './_session';
import { dedupe } from '../lib/inflight';

export interface VenueReview {
  id: string;
  venueId: string;
  userId: string;
  nickname: string;
  rating: number; // 1~5
  content: string;
  createdAt: string;
  updatedAt: string;
  ownerReply?: string;
  ownerReplyAt?: string;
}

interface ReviewRow {
  id: string; venue_id: string; user_id: string; nickname: string;
  rating: number; content: string; created_at: string; updated_at: string;
  owner_reply?: string | null; owner_reply_at?: string | null;
}
const mapRow = (r: ReviewRow): VenueReview => ({
  id: r.id, venueId: r.venue_id, userId: r.user_id, nickname: r.nickname || '회원',
  rating: r.rating, content: r.content ?? '', createdAt: r.created_at, updatedAt: r.updated_at,
  ownerReply: r.owner_reply ?? undefined, ownerReplyAt: r.owner_reply_at ?? undefined,
});

/** 업주 답글 등록/수정(빈 문자열이면 삭제). can_manage_pos 강제(RPC). */
export async function replyToReview(reviewId: string, reply: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('reply_to_review', { p_review_id: reviewId, p_reply: reply });
  if (error) throw new Error(error.message);
}

// (2026-09-11) AI 답글 초안 제거 — 후기 본문·작성자 닉네임을 외부 모델로 보내던 유일한 경로였다.
// 업주 답글은 위 replyToReview 로 직접 작성한다. 권한은 종전대로 reply_to_review RPC 가 강제한다.

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
  const uid = (await currentUser())?.id;
  if (!uid) return false;
  const { count } = await supabase.from('checkins').select('id', { count: 'exact', head: true })
    .eq('user_id', uid).eq('venue_id', venueId);
  return (count ?? 0) > 0;
}

/** 후기 저장 — 매장당 1인 1후기(있으면 수정). */
export async function saveVenueReview(venueId: string, rating: number, content: string, nickname: string): Promise<void> {
  const uid = (await currentUser())?.id;
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
  // 캐시를 비워 **다음에 별점을 조회하는 화면**이 TTL 을 기다리지 않게 한다.
  // ⚠ '지금 이 화면에서 바로' 는 아니다 — 후기를 쓰는 `VenuePage` 는 별점 이펙트 deps 가 `[venue?.id]` 라
  //   스스로 재조회하지 않는다(§5-B 이전에도 같았다. 회귀가 아니라 원래 그렇다).
  invalidateVenueRatings();
}

/** 전 매장 별점 집계 — venueId → {avg, count}. 매장 카드·일정탐색 ⭐표시용(읽기 공개라 1쿼리). */
export interface VenueRating { avg: number; count: number }

/** 마지막으로 성공한 집계와 그 시각 — `dedupe` 가 못 잡는 **시차 중복**을 막는다(§5-B).
 *
 *  왜 필요한가: `dedupe` 는 **비행 중일 때만** 합류시킨다. 그런데 실제 호출 3곳은 시점이 어긋난다 —
 *  App 부팅(`App.tsx:1782`)이 끝난 **뒤** idle 프리마운트로 `CommunityTab`(`:1092`)이 마운트되고,
 *  `VenuePage`(`:115`)는 사용자가 매장을 열 때다. 성능 하네스가 **콜드·리로드·로그인 모든 조건에서**
 *  `rpc/venue_rating_summary` ×2 를 재현한 것이 바로 이 시차다.
 *
 *  ⚠ 이것은 '영구 캐시'가 아니다. TTL 이 지나면 그대로 다시 나간다 —
 *  즉 **재조회 시점은 보존**되고 '같은 순간 근처의 두 번째 왕복'만 사라진다.
 *  내가 후기를 쓰거나 지우면 즉시 무효화한다 — **다음에 별점을 조회하는 화면**이 TTL 을 기다리지 않는다.
 *  ⚠ '지금 보고 있는 화면에서 바로'는 아니다. 후기를 쓰는 `VenuePage` 는 별점 이펙트 deps 가 `[venue?.id]` 라
 *  스스로 재조회하지 않는다(§5-B 이전에도 같았다 — 회귀가 아니라 원래 그렇다). */
const RATINGS_TTL_MS = 60_000;
let ratingsCache: { at: number; value: Record<string, VenueRating> } | null = null;
/** 후기 쓰기/삭제 후 다음 조회가 서버를 다시 읽게 한다. */
function invalidateVenueRatings(): void { ratingsCache = null; }

export async function getVenueRatings(): Promise<Record<string, VenueRating>> {
  if (IS_MOCK) return {};
  if (ratingsCache && Date.now() - ratingsCache.at < RATINGS_TTL_MS) return ratingsCache.value;
  // App(일정탐색 ⭐)과 CommunityTab(매장 목록)이 같은 순간 각자 부르며 5000행을 두 번 받아
  // 두 번 집계했다(실측 ×2) — 비행 중이면 합류해 왕복·파싱·집계를 한 번으로.
  const fresh = await dedupe('venue-ratings', async () => {
    // 2026-08-29: 집계를 서버로 내렸다(venue_rating_summary RPC).
    //   예전엔 전 매장 후기를 통째로(limit 5000) 받아 브라우저에서 평균을 냈다 —
    //   **응답이 리뷰 수에 선형**이라 쌓일수록 콜드 부팅이 무거워지고,
    //   5000행에 닿는 순간 잘린 표본으로 평균을 내 **평점이 조용히 틀려진다.**
    //   이제 응답이 '매장 수'에 비례하고 리뷰 수와 무관하다.
    const { data, error } = await supabase.rpc('venue_rating_summary');
    if (!error && Array.isArray(data)) {
      const out: Record<string, VenueRating> = {};
      for (const r of data as { venue_id: string; avg: number | string; count: number }[]) {
        // numeric 은 PostgREST 가 문자열로 줄 수 있다(정밀도 보존) — 표시 반올림은 기존과 동일하게 0.1 단위.
        out[r.venue_id] = { avg: Math.round(Number(r.avg) * 10) / 10, count: r.count };
      }
      return out;
    }
    // RPC 가 아직 배포되지 않은 환경(구버전 DB)에서도 화면이 비지 않게 구 경로로 폴백한다.
    const { data: rows } = await supabase.from('venue_reviews').select('venue_id, rating').limit(5000);
    const agg = new Map<string, { sum: number; n: number }>();
    for (const r of (rows ?? []) as { venue_id: string; rating: number }[]) {
      const cur = agg.get(r.venue_id) ?? { sum: 0, n: 0 };
      cur.sum += r.rating; cur.n += 1;
      agg.set(r.venue_id, cur);
    }
    const out: Record<string, VenueRating> = {};
    for (const [k, v] of agg) out[k] = { avg: Math.round((v.sum / v.n) * 10) / 10, count: v.n };
    return out;
  });
  // 성공했을 때만 기억한다 — 실패(throw)는 캐시에 남지 않으므로 다음 호출이 그대로 재시도한다.
  ratingsCache = { at: Date.now(), value: fresh };
  return fresh;
}

/** 후기 삭제(본인 또는 운영자). */
export async function deleteVenueReview(id: string): Promise<void> {
  await mustAffect(supabase.from('venue_reviews').delete().eq('id', id));
  invalidateVenueRatings(); // 삭제한 후기가 평균에 남아 보이지 않게
}
