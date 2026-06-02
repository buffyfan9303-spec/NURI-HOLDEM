// src/api/community.ts
import { supabase, IS_MOCK } from '../lib/supabase';
import type { UserRole } from './auth';

// 매장 상태 (관리자 게시물 관리) — active 외에는 공개 목록에서 숨김. 모두 active로 복구 가능.
export type VenueStatus = 'active' | 'inactive' | 'suspended' | 'hidden';

export interface Venue {
  id: string; name: string; region: string; address: string;
  description?: string; imageUrl?: string; themeColor?: string;
  ownerId?: string; approved: boolean; contactPhone?: string;
  businessHours?: string; followerCount?: number; isPaidAd?: boolean;
  displayOrder?: number; // 관리자 노출 순서 (작을수록 앞)
  status?: VenueStatus;  // active/inactive/suspended/hidden
}

export interface Comment {
  id: string; scheduleId?: string; venueId?: string; parentId?: string;
  userId: string; userName: string; userRole: UserRole; isOwner: boolean;
  content: string; createdAt: string; edited?: boolean;
}

// 커뮤니티 글 카테고리 (Stage 2). DB 미존재 시 'free'로 폴백.
// 'study'(공부) = '홀덤 공부' 탭 글 모음 (Task 4)
export type PostCategory = 'free' | 'question' | 'info' | 'review' | 'study';

export interface CommunityPost {
  id: string; userId: string; userName: string;
  userRole: UserRole; userColor?: string;
  content: string; createdAt: string; likeCount: number; commentCount: number;
  // ── Stage 2 확장 (모두 옵셔널 → 구버전 데이터/호출 호환) ──
  category?: PostCategory;  // 카테고리
  title?: string;           // 제목
  images?: string[];        // 첨부 이미지 URL[]
}

// ── DB 변환 ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToVenue = (r: any): Venue => ({
  id: r.id, name: r.name, region: r.region, address: r.address,
  description: r.description, imageUrl: r.image_url, themeColor: r.theme_color,
  ownerId: r.owner_id, approved: r.approved, contactPhone: r.contact_phone,
  businessHours: r.business_hours, followerCount: r.follower_count, isPaidAd: r.is_paid_ad,
  displayOrder: r.display_order,
  status: r.status ?? 'active',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToComment = (r: any): Comment => ({
  id: r.id, scheduleId: r.schedule_id, venueId: r.venue_id, parentId: r.parent_id,
  userId: r.user_id, userName: r.user_name, userRole: r.user_role,
  isOwner: r.is_owner, content: r.content, createdAt: r.created_at, edited: r.edited,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToPost = (r: any): CommunityPost => ({
  id: r.id, userId: r.user_id, userName: r.user_name,
  userRole: r.user_role, userColor: r.user_color,
  content: r.content, createdAt: r.created_at,
  likeCount: r.like_count, commentCount: r.comment_count,
  // Stage 2 컬럼 (없으면 undefined)
  category: r.category ?? undefined,
  title:    r.title ?? undefined,
  images:   Array.isArray(r.images) ? r.images : undefined,
});

// ── Venues ────────────────────────────────────────────────────────────────────
export async function getVenues(): Promise<Venue[]> {
  if (IS_MOCK) {
    const { MOCK_VENUES } = await import('../mock/data');
    return MOCK_VENUES;
  }
  // 정렬: 유료광고 우선 → 관리자가 지정한 노출 순서(display_order) → 팔로워순
  const { data, error } = await supabase.from('venues').select('*')
    .eq('approved', true)
    .eq('status', 'active')
    .order('is_paid_ad', { ascending: false })
    .order('display_order', { ascending: true })
    .order('follower_count', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToVenue);
}

// ── 관리자: 매장 노출 순서 일괄 변경 ──────────────────────────────────────────
// venues 는 NOT NULL 컬럼(name/region)이 많아 upsert가 불가하므로 개별 UPDATE로 처리.
export async function reorderVenues(payload: { items: { id: string; displayOrder: number }[] }): Promise<void> {
  if (IS_MOCK) return;
  const results = await Promise.all(
    payload.items.map(({ id, displayOrder }) =>
      supabase.from('venues')
        .update({ display_order: displayOrder, updated_at: new Date().toISOString() })
        .eq('id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function updateVenueDescription(venueId: string, description: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues').update({ description, updated_at: new Date().toISOString() }).eq('id', venueId);
  if (error) throw error;
}

export async function updateVenueImage(venueId: string, imageUrl: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues').update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', venueId);
  if (error) throw error;
}

// ── Comments ──────────────────────────────────────────────────────────────────
export async function getComments(filter: { scheduleId?: string; venueId?: string }): Promise<Comment[]> {
  if (IS_MOCK) {
    const { MOCK_COMMENTS } = await import('../mock/data');
    return MOCK_COMMENTS.filter((c) =>
      (filter.scheduleId ? c.scheduleId === filter.scheduleId : true) &&
      (filter.venueId    ? c.venueId    === filter.venueId    : true),
    );
  }
  let q = supabase.from('comments').select('*').order('created_at');
  if (filter.scheduleId) q = q.eq('schedule_id', filter.scheduleId);
  if (filter.venueId)    q = q.eq('venue_id',    filter.venueId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToComment);
}

export async function addComment(
  payload: Pick<Comment, 'scheduleId' | 'venueId' | 'parentId' | 'userId' | 'userName' | 'userRole' | 'isOwner' | 'content'>,
): Promise<Comment> {
  if (IS_MOCK) {
    return { ...payload, id: `c_${Date.now()}`, createdAt: new Date().toISOString() } as Comment;
  }
  const { data, error } = await supabase.from('comments').insert({
    schedule_id: payload.scheduleId ?? null,
    venue_id:    payload.venueId    ?? null,
    parent_id:   payload.parentId   ?? null,
    user_id:     payload.userId, user_name: payload.userName,
    user_role:   payload.userRole,  is_owner: payload.isOwner,
    content:     payload.content,
  }).select().single();
  if (error) throw error;
  return rowToComment(data);
}

// 댓글 삭제 — RLS 정책(comments_delete)이 "본인 또는 관리자"만 허용하므로
// 클라이언트는 단순 delete만 호출하면 권한은 서버(Postgres RLS)에서 강제된다.
export async function deleteComment(commentId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) throw error;
}

// ── Community Posts ────────────────────────────────────────────────────────────
export async function getPosts(): Promise<CommunityPost[]> {
  if (IS_MOCK) {
    const { MOCK_COMMUNITY_POSTS } = await import('../mock/data');
    return MOCK_COMMUNITY_POSTS;
  }
  const { data, error } = await supabase.from('community_posts').select('*')
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map(rowToPost);
}

export async function addPost(
  payload: Pick<CommunityPost, 'userId' | 'userName' | 'userRole' | 'userColor' | 'content'>
    & Partial<Pick<CommunityPost, 'category' | 'title' | 'images'>>,
): Promise<CommunityPost> {
  if (IS_MOCK) {
    return {
      ...payload, id: `p_${Date.now()}`, createdAt: new Date().toISOString(),
      likeCount: 0, commentCount: 0,
    };
  }

  const base = {
    user_id: payload.userId, user_name: payload.userName,
    user_role: payload.userRole, user_color: payload.userColor,
    content: payload.content,
  };
  const extended = {
    ...base,
    category: payload.category ?? 'free',
    title:    payload.title ?? null,
    images:   payload.images ?? [],
  };

  // 1차: 신규 컬럼 포함 insert. 컬럼 미존재(42703) 등이면 content-only로 폴백.
  const first = await supabase.from('community_posts').insert(extended).select().single();
  if (!first.error) return rowToPost(first.data);
  if (first.error.code !== '42703') throw first.error;

  const fallback = await supabase.from('community_posts').insert(base).select().single();
  if (fallback.error) throw fallback.error;
  // 클라이언트 표시용으로 입력값을 합쳐 반환(DB엔 미저장이지만 UI 일관성 유지)
  return { ...rowToPost(fallback.data), category: payload.category, title: payload.title, images: payload.images };
}

export async function likePost(postId: string): Promise<void> {
  if (IS_MOCK) return;
  await supabase.rpc('increment_post_likes', { post_id: postId });
}

// 게시글 삭제 — RLS(posts_delete: 본인 또는 admin)가 권한 강제
export async function deletePost(postId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('community_posts').delete().eq('id', postId);
  if (error) throw error;
}

// ── Live Wall (실시간 한 줄 보드) ───────────────────────────────────────────────
// '실시간 댓글' 탭 = 제목 없이 짧게(최대 140자) 올리는 실시간 보드.
export interface LiveMessage {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userColor?: string;
  content: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToLiveMessage = (r: any): LiveMessage => ({
  id: r.id, userId: r.user_id, userName: r.user_name,
  userRole: r.user_role, userColor: r.user_color ?? undefined,
  content: r.content, createdAt: r.created_at,
});

export async function getLiveMessages(limit = 50): Promise<LiveMessage[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('live_wall').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToLiveMessage);
}

export async function addLiveMessage(
  payload: Pick<LiveMessage, 'userId' | 'userName' | 'userRole' | 'userColor' | 'content'>,
): Promise<LiveMessage> {
  if (IS_MOCK) {
    return { ...payload, id: `lw_${Date.now()}`, createdAt: new Date().toISOString() };
  }
  const { data, error } = await supabase.from('live_wall').insert({
    user_id:    payload.userId,
    user_name:  payload.userName,
    user_role:  payload.userRole,
    user_color: payload.userColor ?? null,
    content:    payload.content,
  }).select().single();
  if (error) throw error;
  return rowToLiveMessage(data);
}

export async function deleteLiveMessage(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('live_wall').delete().eq('id', id);
  if (error) throw error;
}

// 실시간 구독 — 새 메시지 INSERT 수신. 반환 함수 호출로 구독 해제.
export function subscribeLiveWall(onInsert: (msg: LiveMessage) => void): () => void {
  if (IS_MOCK) return () => {};
  const channel = supabase
    .channel('live_wall_inserts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_wall' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => onInsert(rowToLiveMessage(payload.new)),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ── 관리자: 매장 상태 관리 (게시물 관리) ───────────────────────────────────────
// 관리자용 전체 매장 조회(미승인·숨김·정지 포함). RLS가 admin에 전체 SELECT 허용.
export async function getAllVenues(): Promise<Venue[]> {
  if (IS_MOCK) {
    const { MOCK_VENUES } = await import('../mock/data');
    return MOCK_VENUES;
  }
  const { data, error } = await supabase.from('venues').select('*')
    .order('is_paid_ad', { ascending: false })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToVenue);
}

export async function updateVenueStatus(venueId: string, status: VenueStatus): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', venueId);
  if (error) throw error;
}

export async function setVenueAd(venueId: string, isAd: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues')
    .update({ is_paid_ad: isAd, updated_at: new Date().toISOString() }).eq('id', venueId);
  if (error) throw error;
}

export async function deleteVenue(venueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues').delete().eq('id', venueId);
  if (error) throw error;
}

// ── 활동/삭제 감사 로그 ────────────────────────────────────────────────────────
export interface ActivityLogInput {
  action: string;        // delete | hide | suspend | deactivate | restore | ad_on | ad_off
  targetType: string;    // post | comment | listing | schedule | venue | live
  targetId?: string;
  targetOwnerId?: string;
  targetSummary?: string;
  actorName?: string;
}

// 삭제/제재 등 관리 행위 기록. 실패해도 주 작업엔 영향 없도록 swallow.
export async function logActivity(input: ActivityLogInput): Promise<void> {
  if (IS_MOCK) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('activity_log').insert({
      actor_id:        user?.id ?? null,
      actor_name:      input.actorName ?? null,
      action:          input.action,
      target_type:     input.targetType,
      target_id:       input.targetId ?? null,
      target_owner_id: input.targetOwnerId ?? null,
      target_summary:  input.targetSummary ?? null,
    });
  } catch (e) {
    console.warn('[activity_log] insert failed:', e);
  }
}

export interface ActivityLogEntry {
  id: string; actorName?: string; action: string;
  targetType: string; targetSummary?: string; createdAt: string;
}

// 관리자: 특정 회원(소유자) 콘텐츠에 대한 삭제/제재 이력 조회
export async function getActivityLog(targetOwnerId: string, limit = 30): Promise<ActivityLogEntry[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('activity_log').select('*')
    .eq('target_owner_id', targetOwnerId)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, actorName: r.actor_name ?? undefined, action: r.action,
    targetType: r.target_type, targetSummary: r.target_summary ?? undefined, createdAt: r.created_at,
  }));
}

export interface UserActivityItem {
  type: 'post' | 'comment' | 'listing';
  id: string; summary: string; createdAt: string;
}

// 회원의 현재 활동(글/댓글/매물) 최신순
export async function getUserActivity(userId: string, limit = 20): Promise<UserActivityItem[]> {
  if (IS_MOCK) return [];
  const [posts, comments, listings] = await Promise.all([
    supabase.from('community_posts').select('id, title, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('comments').select('id, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('marketplace_listings').select('id, title, created_at').eq('seller_id', userId).order('created_at', { ascending: false }).limit(limit),
  ]);
  const items: UserActivityItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (posts.data ?? []).forEach((r: any) => items.push({ type: 'post', id: r.id, summary: r.title || r.content || '(내용 없음)', createdAt: r.created_at }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (comments.data ?? []).forEach((r: any) => items.push({ type: 'comment', id: r.id, summary: r.content || '', createdAt: r.created_at }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (listings.data ?? []).forEach((r: any) => items.push({ type: 'listing', id: r.id, summary: r.title || '', createdAt: r.created_at }));
  return items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}