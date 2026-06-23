// src/api/community.ts
import { supabase, IS_MOCK } from '../lib/supabase';
import type { UserRole } from './auth';

// 매장 상태 (관리자 게시물 관리) — active 외에는 공개 목록에서 숨김. 모두 active로 복구 가능.
export type VenueStatus = 'active' | 'inactive' | 'suspended' | 'hidden';

export interface Venue {
  id: string; name: string; region: string; address: string;
  description?: string; imageUrl?: string; themeColor?: string;
  kakaoUrl?: string; // 카카오톡 오픈채팅/단톡방 링크
  ownerId?: string; approved: boolean; contactPhone?: string;
  businessHours?: string; followerCount?: number; isPaidAd?: boolean;
  displayOrder?: number; // 관리자 노출 순서 (작을수록 앞)
  status?: VenueStatus;  // active/inactive/suspended/hidden
  verificationStatus?: VenueVerificationStatus; // 인증 등급
  images?: string[];     // 매장 갤러리(자동 슬라이드)
  kind?: GroupKind;      // venue(홀덤펍) | dealer_team | club | youtuber | other
  joinApproval?: boolean;// 비-매장 그룹: 가입 시 개설자 승인 필요 여부
  slug?: string | null;  // 커스텀 공유 링크(/s/<slug>) — 업주 설정, 전역 유니크
}

// 현재 설정된 매장 슬러그 조회
export async function getVenueSlug(venueId: string): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data } = await supabase.from('venues').select('slug').eq('id', venueId).single();
  return data?.slug ?? null;
}

// 커스텀 슬러그 사용 가능 여부(형식·예약어·중복)
export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (IS_MOCK) return true;
  const { data, error } = await supabase.rpc('is_slug_available', { p_slug: slug.trim().toLowerCase() });
  if (error) return false;
  return data === true;
}

// 매장 커스텀 링크 설정(빈 문자열 = 해제) — 서버에서 형식/예약어/중복 강제
export async function setVenueSlug(venueId: string, slug: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_venue_slug', { p_venue_id: venueId, p_slug: slug.trim() });
  if (error) throw new Error(error.message);
}

// 커뮤니티 그룹 종류. venue=홀덤펍(기존), 그 외는 가입제 비공개 그룹.
export type GroupKind = 'venue' | 'dealer_team' | 'club' | 'youtuber' | 'other';
export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  venue: '홀덤펍', dealer_team: '딜러팀', club: '동호회', youtuber: '유튜버', other: '기타',
};

export type VenueVerificationStatus = 'unverified' | 'pending' | 'verified';

export interface Comment {
  id: string; scheduleId?: string; venueId?: string; parentId?: string;
  userId: string; userName: string; userRole: UserRole; isOwner: boolean;
  userAvatar?: string;
  content: string; createdAt: string; edited?: boolean;
}

// 커뮤니티 글 카테고리 (Stage 2). DB 미존재 시 'free'로 폴백.
// 'study'(공부) = '홀덤 공부' 탭 글 모음 (Task 4)
// 'hand'(핸드 분석)·'tourney'(대회 후기) — 국내 홀덤 커뮤니티 핵심 콘텐츠 카테고리
export type PostCategory = 'free' | 'question' | 'info' | 'review' | 'study' | 'hand' | 'tourney';

export interface CommunityPost {
  id: string; userId: string; userName: string;
  userRole: UserRole; userColor?: string; userAvatar?: string;
  content: string; createdAt: string; likeCount: number; commentCount: number;
  viewCount?: number;
  // ── Stage 2 확장 (모두 옵셔널 → 구버전 데이터/호출 호환) ──
  category?: PostCategory;  // 카테고리
  title?: string;           // 제목
  images?: string[];        // 첨부 이미지 URL[]
  badbeatCount?: number;    // 억까(Bad Beat) 수
  goodrunCount?: number;    // 나이스런(Good Run) 수
  blinded?: boolean;        // 신고 누적 자동 숨김(운영자/작성자만 열람)
  liked?: boolean;          // 현재 사용자가 좋아요했는지(post_likes 기준) — 토글 UI용
}

export type ReactionType = 'badbeat' | 'goodrun';

// ── DB 변환 ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToVenue = (r: any): Venue => ({
  id: r.id, name: r.name, region: r.region, address: r.address,
  description: r.description, imageUrl: r.image_url, themeColor: r.theme_color,
  kakaoUrl: r.kakao_url ?? undefined,
  ownerId: r.owner_id, approved: r.approved, contactPhone: r.contact_phone,
  businessHours: r.business_hours, followerCount: r.follower_count, isPaidAd: r.is_paid_ad,
  displayOrder: r.display_order,
  status: r.status ?? 'active',
  verificationStatus: r.verification_status ?? 'unverified',
  images: r.images ?? [],
  kind: r.kind ?? 'venue',
  joinApproval: r.join_approval ?? true,
  slug: r.slug ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToComment = (r: any): Comment => ({
  id: r.id, scheduleId: r.schedule_id, venueId: r.venue_id, parentId: r.parent_id,
  userId: r.user_id, userName: r.user_name, userRole: r.user_role,
  isOwner: r.is_owner, userAvatar: r.user_avatar ?? undefined,
  content: r.content, createdAt: r.created_at, edited: r.edited,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToPost = (r: any): CommunityPost => ({
  id: r.id, userId: r.user_id, userName: r.user_name,
  userRole: r.user_role, userColor: r.user_color, userAvatar: r.user_avatar ?? undefined,
  content: r.content, createdAt: r.created_at,
  likeCount: r.like_count, commentCount: r.comment_count, viewCount: r.view_count ?? 0,
  badbeatCount: r.badbeat_count ?? 0, goodrunCount: r.goodrun_count ?? 0,
  // Stage 2 컬럼 (없으면 undefined)
  category: r.category ?? undefined,
  title:    r.title ?? undefined,
  images:   Array.isArray(r.images) ? r.images : undefined,
  blinded:  r.blinded ?? false,
});

/** 운영자: 게시글 블라인드(신고 누적 숨김) 해제/설정 */
export async function adminSetPostBlinded(postId: string, blinded: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('admin_set_post_blinded', { p_post_id: postId, p_blinded: blinded });
  if (error) throw new Error(error.message);
}

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

/** 카카오톡 오픈채팅/단톡방 링크 설정(업주) — RLS로 본인 매장만 허용 */
export async function updateVenueKakao(venueId: string, kakaoUrl: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues')
    .update({ kakao_url: kakaoUrl.trim() || null, updated_at: new Date().toISOString() }).eq('id', venueId);
  if (error) throw error;
}

export async function updateVenueImage(venueId: string, imageUrl: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues').update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', venueId);
  if (error) throw error;
}

/** 업주/운영자: 매장 주소 수정 */
export async function updateVenueAddress(venueId: string, address: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('update_venue_address', { p_venue_id: venueId, p_address: address });
  if (error) throw error;
}

/** 업주/운영자: 매장 연락처 통합 수정(주소·전화·영업시간 한 번에) */
export async function updateVenueContact(
  venueId: string, input: { address: string; phone: string; hours: string },
): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('update_venue_contact', {
    p_venue_id: venueId, p_address: input.address, p_phone: input.phone, p_hours: input.hours,
  });
  if (error) throw new Error(error.message);
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

// 칭호 표시용 — 여러 유저의 활동점수 일괄 조회(공개 RPC). { userId: points } 맵 반환.
export async function getActivityPointsMap(userIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (IS_MOCK || ids.length === 0) return {};
  const { data, error } = await supabase.rpc('public_activity_points', { p_ids: ids });
  if (error || !data) return {};
  const map: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of data as any[]) map[r.id] = Number(r.points) || 0;
  return map;
}

// ── Community Posts ────────────────────────────────────────────────────────────
export async function getPosts(): Promise<CommunityPost[]> {
  if (IS_MOCK) {
    const { MOCK_COMMUNITY_POSTS } = await import('../mock/data');
    return MOCK_COMMUNITY_POSTS;
  }
  const [postsRes, likesRes] = await Promise.all([
    supabase.from('community_posts').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('post_likes').select('post_id'), // RLS: 본인 것만 반환(미로그인은 0건)
  ]);
  if (postsRes.error) throw postsRes.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const likedIds = new Set((likesRes.data ?? []).map((r: any) => r.post_id as string));
  return (postsRes.data ?? []).map(rowToPost).map((p) => ({ ...p, liked: likedIds.has(p.id) }));
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

// 좋아요 토글 — 1인 1회, 다시 누르면 취소. 서버 권위 카운트+liked 반환(스팸 증가 차단).
export async function togglePostLike(postId: string): Promise<{ liked: boolean; count: number }> {
  if (IS_MOCK) return { liked: true, count: 1 };
  const { data, error } = await supabase.rpc('toggle_post_like', { p_post_id: postId });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  return { liked: d.liked === true, count: Number(d.count ?? 0) };
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
  userAvatar?: string;
  content: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToLiveMessage = (r: any): LiveMessage => ({
  id: r.id, userId: r.user_id, userName: r.user_name,
  userRole: r.user_role, userColor: r.user_color ?? undefined,
  userAvatar: r.user_avatar ?? undefined,
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

// 실시간 구독 — 새 메시지 INSERT + 삭제 DELETE 수신(#19: 타인 삭제 전파). 반환 함수 호출로 구독 해제.
// 채널명에 랜덤 suffix 부여(코드베이스 표준) — 재마운트/멀티 인스턴스 시 고정명 충돌·누수 방지.
export function subscribeLiveWall(onInsert: (msg: LiveMessage) => void, onDelete?: (id: string) => void): () => void {
  if (IS_MOCK) return () => {};
  const channel = supabase
    .channel(`live_wall:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_wall' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => onInsert(rowToLiveMessage(payload.new)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'live_wall' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => { const id = payload.old?.id; if (id && onDelete) onDelete(String(id)); },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// #13 커뮤니티 게시글/댓글 실시간 — 변경 시 reload 콜백 호출(라이브월/장부와 동일 패턴: 랜덤 채널+cleanup).
export function subscribePosts(onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const channel = supabase
    .channel(`posts:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts' }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
export function subscribeComments(onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const channel = supabase
    .channel(`comments:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => onChange())
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

// ── 업주 커뮤니티 (작성 1일 후 자동 만료 / 삭제·만료글은 관리자만 열람) ──────────
export interface OwnerPost {
  id: string;
  authorId: string;
  authorName: string;
  authorColor?: string;
  content: string;
  deleted: boolean;
  createdAt: string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToOwnerPost(r: any): OwnerPost {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name ?? '익명',
    authorColor: r.author_color ?? undefined,
    content: r.content,
    deleted: r.deleted,
    createdAt: r.created_at,
  };
}
export async function getOwnerPosts(opts?: { deleted?: boolean }): Promise<OwnerPost[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('owner_posts')
    .select('*')
    .eq('deleted', opts?.deleted ? true : false)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(rowToOwnerPost);
}
export async function createOwnerPost(content: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const c = content.trim();
  if (!c) throw new Error('내용을 입력해 주세요');
  const { error } = await supabase.from('owner_posts').insert({ author_id: user.id, content: c.slice(0, 2000) });
  if (error) throw error;
}
export async function deleteOwnerPost(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase
    .from('owner_posts')
    .update({ deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// 게시글 조회수 +1 (상세 진입 시)
export async function incrementPostView(postId: string): Promise<void> {
  if (IS_MOCK) return;
  await supabase.rpc('increment_post_view', { p_id: postId });
}

// ── 딜러(venue_staff) 전용 게시판 — 구인/구직 ────────────────────────────────
export type DealerPostKind = 'hiring' | 'seeking' | 'general'; // 구인 / 구직 / 일반
export interface DealerPost {
  id: string;
  authorId: string;
  authorName: string;
  authorColor?: string;
  kind: DealerPostKind;
  region?: string;     // 구인 시 필수
  venueName?: string;  // 선택
  wage?: string;       // 시급(구인)
  workHours?: string;  // 근무시간(구인)
  workPeriod?: string; // 필요 기간(구인)
  content: string;
  deleted: boolean;
  createdAt: string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDealerPost(r: any): DealerPost {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name ?? '익명',
    authorColor: r.author_color ?? undefined,
    kind: r.kind,
    region: r.region ?? undefined,
    venueName: r.venue_name ?? undefined,
    wage: r.wage ?? undefined,
    workHours: r.work_hours ?? undefined,
    workPeriod: r.work_period ?? undefined,
    content: r.content,
    deleted: r.deleted,
    createdAt: r.created_at,
  };
}
export async function getDealerPosts(opts?: { deleted?: boolean }): Promise<DealerPost[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('dealer_posts')
    .select('*')
    .eq('deleted', opts?.deleted ? true : false)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(rowToDealerPost);
}
export async function createDealerPost(input: {
  kind: DealerPostKind; content: string; region?: string; venueName?: string;
  wage?: string; workHours?: string; workPeriod?: string;
}): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const content = input.content.trim();
  if (!content) throw new Error('내용을 입력해 주세요');
  if (input.kind === 'hiring' && !(input.region ?? '').trim()) {
    throw new Error('구인은 지역을 입력해야 합니다');
  }
  const hiring = input.kind === 'hiring';
  const { error } = await supabase.from('dealer_posts').insert({
    author_id: user.id,
    kind: input.kind,
    region: input.region?.trim() || null,
    venue_name: input.venueName?.trim() || null,
    wage: hiring ? (input.wage?.trim() || null) : null,
    work_hours: hiring ? (input.workHours?.trim() || null) : null,
    work_period: hiring ? (input.workPeriod?.trim() || null) : null,
    content: content.slice(0, 2000),
  });
  if (error) throw error;
}
export async function deleteDealerPost(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase
    .from('dealer_posts')
    .update({ deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── 구인 지원서 ───────────────────────────────────────────────────────────────
export interface DealerApplication {
  id: string;
  postId: string;
  applicantId: string | null;
  applicantName: string;
  phone: string;
  message?: string;
  createdAt: string;
}
/** 구인글에 지원(로그인 필수, 번호 필수). 지원서는 글 작성자/운영자만 열람 가능(RLS). */
export async function createDealerApplication(
  postId: string,
  input: { name: string; phone: string; message?: string },
): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) throw new Error('이름을 입력해 주세요');
  if (!phone) throw new Error('연락처는 필수입니다');
  const { error } = await supabase.from('dealer_applications').insert({
    post_id: postId,
    applicant_id: user.id,
    applicant_name: name.slice(0, 40),
    phone: phone.slice(0, 30),
    message: input.message?.trim().slice(0, 1000) || null,
  });
  if (error) throw error;
}
/** 특정 구인글의 지원서 목록(작성자/운영자/본인 것만 RLS 로 노출) */
export async function getDealerApplications(postId: string): Promise<DealerApplication[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('dealer_applications')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, postId: r.post_id, applicantId: r.applicant_id ?? null,
    applicantName: r.applicant_name, phone: r.phone, message: r.message ?? undefined, createdAt: r.created_at,
  }));
}

// ── 커뮤니티 그룹(가입제: 딜러팀·동호회·유튜버) ────────────────────────────────
export type MemberStatus = 'pending' | 'approved';
export interface GroupMember {
  id: string; groupId: string; userId: string;
  role: 'manager' | 'member'; status: MemberStatus;
  name: string; color?: string; createdAt: string;
}
export interface GroupMessage { id: string; groupId: string; userId: string; userName: string; userColor?: string; content: string; createdAt: string; }
export interface GroupPost { id: string; groupId: string; authorId: string; authorName: string; authorColor?: string; title?: string; content: string; createdAt: string; }

/** 그룹 생성 요청(운영자 승인 전 approved=false). 생성자=매니저. 반환: 그룹 id */
export async function createGroup(input: { name: string; kind: GroupKind; region?: string; description?: string; joinApproval: boolean }): Promise<string> {
  if (IS_MOCK) return '';
  const { data, error } = await supabase.rpc('create_group', {
    p_name: input.name, p_kind: input.kind, p_region: input.region ?? '', p_description: input.description ?? '', p_join_approval: input.joinApproval,
  });
  if (error) throw error;
  return data as string;
}

/** 내 멤버십(없으면 null) */
export async function getMyMembership(groupId: string): Promise<GroupMember | null> {
  if (IS_MOCK) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('group_members').select('*').eq('group_id', groupId).eq('user_id', user.id).maybeSingle();
  if (!data) return null;
  return { id: data.id, groupId: data.group_id, userId: data.user_id, role: data.role, status: data.status, name: data.member_name ?? '회원', color: data.member_color ?? undefined, createdAt: data.created_at };
}

/** 그룹 멤버 목록(매니저/멤버만 RLS 노출) */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('group_members').select('*').eq('group_id', groupId).order('created_at', { ascending: true });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, groupId: r.group_id, userId: r.user_id, role: r.role, status: r.status,
    name: r.member_name ?? '회원', color: r.member_color ?? undefined, createdAt: r.created_at,
  }));
}

/** 가입 신청 — join_approval 에 따라 'pending'(승인대기) 또는 'approved'(즉시가입) 반환 */
export async function joinGroup(groupId: string): Promise<MemberStatus> {
  if (IS_MOCK) return 'pending';
  const { data, error } = await supabase.rpc('join_group', { p_group: groupId });
  if (error) throw error;
  return (data as MemberStatus) ?? 'pending';
}
/** 가입 승인(매니저) */
export async function approveMember(memberId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('group_members').update({ status: 'approved' }).eq('id', memberId);
  if (error) throw error;
}
/** 멤버 추방/거절(매니저) 또는 탈퇴(본인) */
export async function removeMember(memberId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('group_members').delete().eq('id', memberId);
  if (error) throw error;
}

// ── 그룹 채팅(멤버 전용, 실시간) ──────────────────────────────────────────────
export async function getGroupMessages(groupId: string, limit = 50): Promise<GroupMessage[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, groupId: r.group_id, userId: r.user_id, userName: r.user_name, userColor: r.user_color ?? undefined, content: r.content, createdAt: r.created_at }));
}
export async function sendGroupMessage(groupId: string, input: { userName: string; userColor?: string; content: string }): Promise<GroupMessage> {
  if (IS_MOCK) throw new Error('mock');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const body = input.content.trim();
  if (!body) throw new Error('내용을 입력해 주세요');
  const { data, error } = await supabase.from('group_messages').insert({ group_id: groupId, user_id: user.id, user_name: input.userName, user_color: input.userColor ?? null, content: body.slice(0, 500) }).select('*').single();
  if (error) throw error;
  return { id: data.id, groupId: data.group_id, userId: data.user_id, userName: data.user_name, userColor: data.user_color ?? undefined, content: data.content, createdAt: data.created_at };
}
export async function deleteGroupMessage(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('group_messages').delete().eq('id', id);
  if (error) throw error;
}
export function subscribeGroupMessages(groupId: string, onInsert: (m: GroupMessage) => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`gmsg:${groupId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => { const r = payload.new; onInsert({ id: r.id, groupId: r.group_id, userId: r.user_id, userName: r.user_name, userColor: r.user_color ?? undefined, content: r.content, createdAt: r.created_at }); })
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ── 매장 실시간 채팅(공개 열람 · 로그인 시 작성, 그룹 채팅과 동일 UX) ─────────
export interface VenueMessage { id: string; venueId: string; userId: string; userName: string; userColor?: string; content: string; createdAt: string; }

export async function getVenueMessages(venueId: string, limit = 80): Promise<VenueMessage[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venue_messages').select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, userId: r.user_id, userName: r.user_name, userColor: r.user_color ?? undefined, content: r.content, createdAt: r.created_at }));
}
export async function sendVenueMessage(venueId: string, input: { userName: string; userColor?: string; content: string }): Promise<VenueMessage> {
  if (IS_MOCK) throw new Error('mock');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const body = input.content.trim();
  if (!body) throw new Error('내용을 입력해 주세요');
  const { data, error } = await supabase.from('venue_messages').insert({ venue_id: venueId, user_id: user.id, user_name: input.userName, user_color: input.userColor ?? null, content: body.slice(0, 500) }).select('*').single();
  if (error) throw error;
  return { id: data.id, venueId: data.venue_id, userId: data.user_id, userName: data.user_name, userColor: data.user_color ?? undefined, content: data.content, createdAt: data.created_at };
}
export async function deleteVenueMessage(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venue_messages').delete().eq('id', id);
  if (error) throw error;
}
export function subscribeVenueMessages(venueId: string, onInsert: (m: VenueMessage) => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`vmsg:${venueId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'venue_messages', filter: `venue_id=eq.${venueId}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => { const r = payload.new; onInsert({ id: r.id, venueId: r.venue_id, userId: r.user_id, userName: r.user_name, userColor: r.user_color ?? undefined, content: r.content, createdAt: r.created_at }); })
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ── 그룹 게시판(멤버 전용) ────────────────────────────────────────────────────
export async function getGroupPosts(groupId: string): Promise<GroupPost[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('group_posts').select('*').eq('group_id', groupId).eq('deleted', false).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, groupId: r.group_id, authorId: r.author_id, authorName: r.author_name, authorColor: r.author_color ?? undefined, title: r.title ?? undefined, content: r.content, createdAt: r.created_at }));
}
export async function createGroupPost(groupId: string, input: { authorName: string; authorColor?: string; title?: string; content: string }): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const body = input.content.trim();
  if (!body) throw new Error('내용을 입력해 주세요');
  const { error } = await supabase.from('group_posts').insert({ group_id: groupId, author_id: user.id, author_name: input.authorName, author_color: input.authorColor ?? null, title: input.title?.trim().slice(0, 80) || null, content: body.slice(0, 4000) });
  if (error) throw error;
}
export async function deleteGroupPost(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('group_posts').update({ deleted: true }).eq('id', id);
  if (error) throw error;
}

// ── 운영자: 그룹 개설 승인 ────────────────────────────────────────────────────
export async function getPendingGroups(): Promise<Venue[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venues').select('*').neq('kind', 'venue').eq('approved', false).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToVenue);
}
export async function approveGroup(groupId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues').update({ approved: true }).eq('id', groupId);
  if (error) throw error;
}

// ── 내 커뮤니티 관리 ──────────────────────────────────────────────────────────
/** 내가 운영(소유)하는 커뮤니티 — 매장+그룹(미승인 그룹 포함, RLS: owner 본인) */
export async function getMyOwnedCommunities(): Promise<Venue[]> {
  if (IS_MOCK) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('venues').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToVenue);
}
/** 내가 가입한 그룹(매니저 제외) — 그룹 정보 + 멤버십 id(탈퇴용) */
export interface JoinedGroup { membershipId: string; status: MemberStatus; group: Venue }
export async function getMyJoinedGroups(): Promise<JoinedGroup[]> {
  if (IS_MOCK) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: mems } = await supabase.from('group_members').select('id, group_id, role, status').eq('user_id', user.id).neq('role', 'manager');
  if (!mems || mems.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = (mems as any[]).map((m) => m.group_id);
  const { data: vs } = await supabase.from('venues').select('*').in('id', ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, Venue>((vs ?? []).map((v: any) => [v.id as string, rowToVenue(v)]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mems as any[]).filter((m) => byId.has(m.group_id)).map((m) => ({ membershipId: m.id, status: m.status, group: byId.get(m.group_id)! }));
}

// 업주: 본인 홀덤펍(매장) 직접 생성 — 이름 필수, 주소·전화는 폼에서 필수 검증. 반환: 새 매장 id.
export interface CreateVenueInput {
  name: string; region?: string; address?: string; phone?: string;
  imageUrl?: string; kakaoUrl?: string; description?: string; businessHours?: string;
}
export async function createMyVenue(input: CreateVenueInput): Promise<string> {
  if (IS_MOCK) return 'mock';
  const { data, error } = await supabase.rpc('create_my_venue', {
    p_name: input.name, p_region: input.region ?? '', p_address: input.address ?? '', p_phone: input.phone ?? '',
    p_image_url: input.imageUrl ?? null, p_kakao_url: input.kakaoUrl ?? null,
    p_description: input.description ?? null, p_business_hours: input.businessHours ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// 관리자: 홀덤펍(매장) 생성 + 관리 업주 임명
export async function adminCreateVenue(input: {
  name: string; region: string; address?: string; ownerId?: string;
}): Promise<string> {
  if (IS_MOCK) return 'mock';
  const { data, error } = await supabase.rpc('admin_create_venue', {
    p_name: input.name, p_region: input.region,
    p_address: input.address ?? '', p_owner_id: input.ownerId ?? null,
  });
  if (error) throw error;
  return data as string;
}

// 관리자: 기존 매장 정보 수정 + 업주 변경/임명/해제
export async function adminUpdateVenue(input: {
  venueId: string; name: string; region: string; address?: string; ownerId?: string | null;
}): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('admin_update_venue', {
    p_venue_id: input.venueId, p_name: input.name, p_region: input.region,
    p_address: input.address ?? '', p_owner_id: input.ownerId ?? null,
  });
  if (error) throw error;
}

// ── 매장 직원(스태프) 관리 (관리자 또는 해당 매장 업주) ──────────────────────
export interface VenueStaff {
  id: string; venueId: string; userId?: string;
  login: string; name?: string; position?: string; createdAt: string;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToStaff = (r: any): VenueStaff => ({
  id: r.id, venueId: r.venue_id, userId: r.user_id ?? undefined,
  login: r.staff_login, name: r.staff_name ?? undefined,
  position: r.staff_position ?? undefined, createdAt: r.created_at,
});
export async function getVenueStaff(venueId: string): Promise<VenueStaff[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('venue_staff').select('*')
    .eq('venue_id', venueId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToStaff);
}
export async function addVenueStaff(input: { venueId: string; login: string; name?: string; position?: string }): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('add_venue_staff', {
    p_venue_id: input.venueId, p_login: input.login,
    p_name: input.name ?? '', p_position: input.position ?? '',
  });
  if (error) throw error;
}
export async function updateVenueStaff(input: { staffId: string; name?: string; position?: string }): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('update_venue_staff', {
    p_staff_id: input.staffId, p_name: input.name ?? null, p_position: input.position ?? null,
  });
  if (error) throw error;
}
export async function removeVenueStaff(staffId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('remove_venue_staff', { p_staff_id: staffId });
  if (error) throw error;
}

// ── 매장 커뮤니티 공지 (업주 + 관리자) ───────────────────────────────────────
export interface VenueNotice {
  id: string; venueId: string; authorId: string; authorName: string;
  content: string; createdAt: string;
}
export async function getVenueNotices(venueId: string): Promise<VenueNotice[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('venue_notices')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, venueId: r.venue_id, authorId: r.author_id,
    authorName: r.author_name ?? '운영', content: r.content, createdAt: r.created_at,
  }));
}
export async function createVenueNotice(venueId: string, content: string): Promise<void> {
  if (IS_MOCK) return;
  const c = content.trim();
  if (!c) throw new Error('내용을 입력해 주세요');
  const { error } = await supabase.from('venue_notices').insert({ venue_id: venueId, content: c.slice(0, 1000) });
  if (error) throw error;
}
export async function deleteVenueNotice(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venue_notices').delete().eq('id', id);
  if (error) throw error;
}

// ── 배드빗/굿런 반응 (작성자 활동점수 증가) ───────────────────────────────────
export async function getMyReaction(postId: string): Promise<ReactionType | null> {
  if (IS_MOCK) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('post_reactions').select('type')
    .eq('post_id', postId).eq('user_id', user.id).maybeSingle();
  return (data as { type?: ReactionType } | null)?.type ?? null;
}
export async function reactToPost(postId: string, type: ReactionType): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase
    .from('post_reactions')
    .upsert({ post_id: postId, user_id: user.id, type }, { onConflict: 'post_id,user_id' });
  if (error) throw error;
}
export async function removeReaction(postId: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('post_reactions').delete()
    .eq('post_id', postId).eq('user_id', user.id);
  if (error) throw error;
}

// ── 매장 인증 등급 ────────────────────────────────────────────────────────────
export async function getMyVenue(): Promise<Venue | null> {
  if (IS_MOCK) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('venues').select('*').eq('owner_id', user.id).limit(1).maybeSingle();
  return data ? rowToVenue(data) : null;
}
// 업주: 본인 매장 인증 신청 (unverified -> pending)
export async function requestVenueVerification(venueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues').update({ verification_status: 'pending' }).eq('id', venueId);
  if (error) throw error;
}
// 관리자: 인증 상태 변경
export async function setVenueVerification(venueId: string, status: VenueVerificationStatus): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues').update({ verification_status: status }).eq('id', venueId);
  if (error) throw error;
}
// 업주: 매장 갤러리(자동 슬라이드) 이미지 URL 목록 저장
export async function updateVenueImages(venueId: string, urls: string[]): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('venues').update({ images: urls }).eq('id', venueId);
  if (error) throw error;
}

// ── 매장 팔로우(즐겨찾기) ──────────────────────────────────────────────────────
export async function getMyFollowedVenueIds(): Promise<string[]> {
  if (IS_MOCK) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('venue_follows').select('venue_id').eq('user_id', user.id);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.venue_id);
}
export async function followVenue(venueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('venue_follows').insert({ user_id: user.id, venue_id: venueId });
  if (error && error.code !== '23505') throw error; // 중복(이미 팔로우)은 무시
}
export async function unfollowVenue(venueId: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('venue_follows').delete().eq('user_id', user.id).eq('venue_id', venueId);
  if (error) throw error;
}

// ── 관리자 통계 ────────────────────────────────────────────────────────────────
export interface AdminStats {
  users: number; owners: number; pendingOwners: number; suspended: number;
  posts: number; listings: number; schedules: number; pendingSchedules: number; signups7d: number;
}
export async function getAdminStats(): Promise<AdminStats> {
  const empty: AdminStats = { users: 0, owners: 0, pendingOwners: 0, suspended: 0, posts: 0, listings: 0, schedules: 0, pendingSchedules: 0, signups7d: 0 };
  if (IS_MOCK) return empty;
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cnt = async (tbl: string, build?: (q: any) => any): Promise<number> => {
    let q = supabase.from(tbl).select('*', { count: 'exact', head: true });
    if (build) q = build(q);
    const { count } = await q;
    return count ?? 0;
  };
  const [users, owners, pendingOwners, suspended, posts, listings, schedules, pendingSchedules, signups7d] = await Promise.all([
    cnt('profiles'),
    cnt('profiles', (q) => q.eq('role', 'venue_owner')),
    cnt('profiles', (q) => q.eq('role', 'venue_owner').eq('approved', false)),
    cnt('profiles', (q) => q.in('status', ['suspended', 'banned', 'withdrawn'])),
    cnt('community_posts'),
    cnt('marketplace_listings'),
    cnt('schedules'),
    cnt('schedules', (q) => q.eq('approved', false)),
    cnt('profiles', (q) => q.gt('joined_at', since)),
  ]);
  return { users, owners, pendingOwners, suspended, posts, listings, schedules, pendingSchedules, signups7d };
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

// ── 활동 점수 랭킹(회원 등급) ─────────────────────────────────────────────────
export interface LeaderboardEntry {
  id: string;
  nickname: string;
  activityPoints: number;
  avatarColor?: string;
  role: UserRole;
  /** 랭킹 상점 장착 마크 키(코스메틱 — 금전 가치 없음) */
  equippedMark?: string | null;
}

/** 활동 점수 상위 회원 랭킹. 비민감 필드만 반환하는 RPC 사용(profiles RLS 우회). */
export async function getActivityLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('get_activity_leaderboard', { p_limit: limit });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id:             r.id,
    nickname:       r.nickname ?? '익명',
    activityPoints: r.activity_points ?? 0,
    avatarColor:    r.avatar_color ?? undefined,
    role:           r.role,
    equippedMark:   r.equipped_mark ?? null,
  }));
}

/** 작성자 장착 마크 일괄 조회 — userId → 마크 이모지(상점 코스메틱) */
export async function getEquippedMarks(userIds: string[]): Promise<Record<string, string>> {
  if (IS_MOCK || userIds.length === 0) return {};
  const { data, error } = await supabase.rpc('get_equipped_marks', { p_ids: userIds });
  if (error) return {};
  const { SHOP_MARKS } = await import('../lib/loyalty');
  const out: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const emoji = SHOP_MARKS.find((m) => m.key === r.equipped_mark)?.emoji;
    if (emoji) out[r.id] = emoji + ' ';
  }
  return out;
}

// ── 공동 사장(여러 업주) ─────────────────────────────────────
export interface VenueOwner { userId: string; nickname: string; name: string; isPrimary: boolean; status: string }
export async function listVenueOwners(venueId: string): Promise<VenueOwner[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('list_venue_owners', { p_venue_id: venueId });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ userId: r.user_id, nickname: r.nickname, name: r.name ?? '', isPrimary: !!r.is_primary, status: r.status ?? 'approved' }));
}
/** 대표 업주 교체 — 현 대표/운영자만, 새 대표는 승인된 공동 사장이어야 */
export async function transferVenuePrimary(venueId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_venue_primary', { p_venue_id: venueId, p_new_owner_id: userId });
  if (error) throw new Error(error.message);
}
export interface OwnerRequest { venueId: string; venueName: string; userId: string; nickname: string; name: string; invitedBy: string; createdAt: string }
export async function adminListVenueOwnerRequests(): Promise<OwnerRequest[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('admin_list_venue_owner_requests');
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ venueId: r.venue_id, venueName: r.venue_name ?? '(매장)', userId: r.user_id, nickname: r.nickname ?? '', name: r.name ?? '', invitedBy: r.invited_by ?? '', createdAt: r.created_at }));
}
export async function adminDecideVenueOwner(venueId: string, userId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_decide_venue_owner', { p_venue_id: venueId, p_user_id: userId, p_approve: approve });
  if (error) throw new Error(error.message);
}
/** 공동 사장 추가 — 닉네임(아이디)으로 회원 지정. 본인 매장 업주만. */
export async function addVenueOwner(venueId: string, nickname: string): Promise<void> {
  const { error } = await supabase.rpc('add_venue_owner', { p_venue_id: venueId, p_nickname: nickname });
  if (error) throw new Error(error.message);
}
export async function removeVenueOwner(venueId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_venue_owner', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw new Error(error.message);
}
