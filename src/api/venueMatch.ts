// src/api/venueMatch.ts — 연합 대회 파트너 매칭(매장↔매장 짝짓기): 게시 → 신청 → 수락/거절 → 서로 연락처 공개.
// 누리는 여기서 끝난다 — 점수·상금·정산·공동 순위 없음(§10 계층1 #3). 조건은 note 자유 텍스트 한 칸뿐이다.
// 서버 정본: supabase/migrations/20260917f_venue_match_partners.sql (RLS 가 권한을 강제한다).
import { supabase, IS_MOCK } from '../lib/supabase';
import { mustAffect } from './_mustAffect';
import { currentUser } from './_session';

export type MatchPostStatus = 'open' | 'closed';
export type MatchResponseStatus = 'pending' | 'accepted' | 'declined';
export interface MatchVenue { id: string; name: string; region?: string; phone?: string }
export interface MatchPost {
  id: string; venue: MatchVenue; eventDate: string | null; note: string; status: MatchPostStatus; createdAt: string;
}
export interface MatchResponse {
  id: string; postId: string; venue: MatchVenue; message: string | null; status: MatchResponseStatus; createdAt: string;
}
/** 내 매장이 보낸 신청 — 상대(게시) 매장까지 붙여서 */
export interface MyMatchResponse extends MatchResponse { post: MatchPost }

const VENUE_SEL = 'venues(id, name, region, contact_phone)';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const venueOf = (v: any, fallbackId: string): MatchVenue =>
  ({ id: v?.id ?? fallbackId, name: v?.name ?? '매장', region: v?.region ?? undefined, phone: v?.contact_phone ?? undefined });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToPost = (r: any): MatchPost =>
  ({ id: r.id, venue: venueOf(r.venues, r.venue_id), eventDate: r.event_date ?? null, note: r.note, status: r.status, createdAt: r.created_at });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToResponse = (r: any): MatchResponse =>
  ({ id: r.id, postId: r.post_id, venue: venueOf(r.venues, r.venue_id), message: r.message ?? null, status: r.status, createdAt: r.created_at });

/** 열린 게시 전부(내 매장 것 포함 — 화면이 가른다) */
export async function getOpenMatchPosts(): Promise<MatchPost[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venue_match_posts').select(`*, ${VENUE_SEL}`)
    .eq('status', 'open').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

/** 내 매장 게시(마감 포함) */
export async function getMyMatchPosts(venueId: string): Promise<MatchPost[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venue_match_posts').select(`*, ${VENUE_SEL}`)
    .eq('venue_id', venueId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

export async function createMatchPost(venueId: string, input: { eventDate?: string | null; note: string }): Promise<void> {
  if (IS_MOCK) return;
  const note = input.note.trim();
  if (!note) throw new Error('조건을 적어 주세요');
  const user = await currentUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('venue_match_posts').insert({
    venue_id: venueId, created_by: user.id, event_date: input.eventDate || null, note: note.slice(0, 500),
  });
  if (error) throw error;
}

export async function closeMatchPost(id: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('venue_match_posts').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id));
}

export async function deleteMatchPost(id: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('venue_match_posts').delete().eq('id', id));
}

/** 게시 하나에 온 신청(게시 매장만 RLS 로 본다) */
export async function getMatchResponses(postId: string): Promise<MatchResponse[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venue_match_responses').select(`*, ${VENUE_SEL}`)
    .eq('post_id', postId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToResponse);
}

/** 내 매장이 보낸 신청 + 상대 게시 */
export async function getMyMatchResponses(venueId: string): Promise<MyMatchResponse[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venue_match_responses')
    .select(`*, ${VENUE_SEL}, venue_match_posts(*, ${VENUE_SEL})`)
    .eq('venue_id', venueId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).filter((r: any) => r.venue_match_posts).map((r: any) => ({ ...rowToResponse(r), post: rowToPost(r.venue_match_posts) }));
}

export async function respondMatchPost(postId: string, venueId: string, message?: string): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('venue_match_responses').insert({
    post_id: postId, venue_id: venueId, created_by: user.id, message: message?.trim().slice(0, 300) || null,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('이미 신청한 게시입니다');
    throw error;
  }
}

/** 게시 매장의 결정 — 트리거가 status 외 컬럼 변경을 막고 responded_at 을 찍는다 */
export async function decideMatchResponse(id: string, accept: boolean): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('venue_match_responses').update({ status: accept ? 'accepted' : 'declined' }).eq('id', id));
}

export async function withdrawMatchResponse(id: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('venue_match_responses').delete().eq('id', id));
}
