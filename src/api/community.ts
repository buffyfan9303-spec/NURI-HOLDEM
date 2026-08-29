// src/api/community.ts
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import type { UserRole } from './auth';
import { dedupe } from '../lib/inflight';

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
  /** 위경도 — 카카오 지오코딩 라이트백(set_venue_coords). 거리순 정렬용, 없으면 정렬 뒤로 */
  lat?: number | null; lng?: number | null;
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
  id: string; scheduleId?: string; venueId?: string; postId?: string; parentId?: string;
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
  lat: r.lat ?? null, lng: r.lng ?? null,
  verificationStatus: r.verification_status ?? 'unverified',
  images: r.images ?? [],
  kind: r.kind ?? 'venue',
  joinApproval: r.join_approval ?? true,
  slug: r.slug ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToComment = (r: any): Comment => ({
  id: r.id, scheduleId: r.schedule_id, venueId: r.venue_id, postId: r.post_id ?? undefined, parentId: r.parent_id,
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

/** 내가 쓴 글 — 개인 허브('내 대시보드')용. 목록 50건 제한과 무관하게 본인 글만 조회 */
export async function getPostsByUser(userId: string, limit = 20): Promise<CommunityPost[]> {
  if (IS_MOCK) return [];
  const res = await supabase.from('community_posts').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(limit);
  if (res.error) return [];
  return (res.data ?? []).map(rowToPost);
}

/** 단건 게시글 — 공유 딥링크·알림 링크가 목록(최근 50건) 밖의 글을 가리킬 때 사용 */
export async function getPostById(postId: string): Promise<CommunityPost | null> {
  if (IS_MOCK) {
    const { MOCK_COMMUNITY_POSTS } = await import('../mock/data');
    return MOCK_COMMUNITY_POSTS.find((p) => p.id === postId) ?? null;
  }
  const res = await supabase.from('community_posts').select('*').eq('id', postId).maybeSingle();
  if (res.error || !res.data) return null;
  const liked = await supabase.from('post_likes').select('post_id').eq('post_id', postId).limit(1);
  return { ...rowToPost(res.data), liked: (liked.data ?? []).length > 0 };
}

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
/** 좌표 라이트백 — 지도 임베드가 지오코딩에 성공하면 매장 관리자 기기가 조용히 저장(can_manage_venue 게이트) */
export async function setVenueCoords(venueId: string, lat: number, lng: number): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_venue_coords', { p_venue_id: venueId, p_lat: lat, p_lng: lng });
  if (error) throw new Error(error.message);
}

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
export async function getComments(filter: { scheduleId?: string; venueId?: string; postId?: string }): Promise<Comment[]> {
  if (IS_MOCK) {
    const { MOCK_COMMENTS } = await import('../mock/data');
    // postId 필터 누락 시 목 모드에서 '남의 글 댓글'이 전부 딸려온다 — 실서버 동작과 맞춘다.
    return MOCK_COMMENTS.filter((c) =>
      (filter.scheduleId ? c.scheduleId === filter.scheduleId : true) &&
      (filter.venueId    ? c.venueId    === filter.venueId    : true) &&
      (filter.postId     ? c.postId     === filter.postId     : true),
    );
  }
  let q = supabase.from('comments').select('*').order('created_at');
  if (filter.scheduleId) q = q.eq('schedule_id', filter.scheduleId);
  if (filter.venueId)    q = q.eq('venue_id',    filter.venueId);
  if (filter.postId)     q = q.eq('post_id',     filter.postId);
  // ⚠ 필터가 하나도 없으면 전 서비스 댓글을 통째로 받는다(App 부팅 시 getComments({}) 가 그랬다).
  //   PostgREST 상한(1000행)까지 그대로 내려오고, 그게 첫 화면 로딩과 경쟁했다.
  //   무필터 조회는 '어느 글에 댓글이 있나' 정도의 용도라 상한을 걸어도 기능이 깨지지 않는다.
  if (!filter.scheduleId && !filter.venueId && !filter.postId) q = q.limit(300);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToComment);
}

export async function addComment(
  payload: Pick<Comment, 'scheduleId' | 'venueId' | 'postId' | 'parentId' | 'userId' | 'userName' | 'userRole' | 'isOwner' | 'content'>,
): Promise<Comment> {
  if (IS_MOCK) {
    return { ...payload, id: `c_${Date.now()}`, createdAt: new Date().toISOString() } as Comment;
  }
  const { data, error } = await supabase.from('comments').insert({
    schedule_id: payload.scheduleId ?? null,
    venue_id:    payload.venueId    ?? null,
    post_id:     payload.postId     ?? null,
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
  const postsRes = await supabase.from('community_posts').select('*').order('created_at', { ascending: false }).limit(50);
  if (postsRes.error) throw postsRes.error;
  const rows = postsRes.data ?? [];
  // #10 내 좋아요는 '노출된 50글'로 한정(전건 로드 방지). RLS 가 본인 것만 반환(미로그인 0건).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = rows.map((r: any) => r.id as string);
  const likesRes = ids.length
    ? await supabase.from('post_likes').select('post_id').in('post_id', ids)
    : { data: [] as { post_id: string }[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const likedIds = new Set((likesRes.data ?? []).map((r: any) => r.post_id as string));
  return rows.map(rowToPost).map((p) => ({ ...p, liked: likedIds.has(p.id) }));
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
    const user = await currentUser();
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
  const user = await currentUser();
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
  const user = await currentUser();
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
  const user = await currentUser();
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
  const user = await currentUser();
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
  const user = await currentUser();
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
  const user = await currentUser();
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
  const user = await currentUser();
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
  const user = await currentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('venues').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToVenue);
}
/** 내가 가입한 그룹(매니저 제외) — 그룹 정보 + 멤버십 id(탈퇴용) */
export interface JoinedGroup { membershipId: string; status: MemberStatus; group: Venue }
export async function getMyJoinedGroups(): Promise<JoinedGroup[]> {
  if (IS_MOCK) return [];
  const user = await currentUser();
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
  const user = await currentUser();
  if (!user) return null;
  const { data } = await supabase
    .from('post_reactions').select('type')
    .eq('post_id', postId).eq('user_id', user.id).maybeSingle();
  return (data as { type?: ReactionType } | null)?.type ?? null;
}
export async function reactToPost(postId: string, type: ReactionType): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase
    .from('post_reactions')
    .upsert({ post_id: postId, user_id: user.id, type }, { onConflict: 'post_id,user_id' });
  if (error) throw error;
}
export async function removeReaction(postId: string): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
  if (!user) return;
  const { error } = await supabase
    .from('post_reactions').delete()
    .eq('post_id', postId).eq('user_id', user.id);
  if (error) throw error;
}

// ── 매장 인증 등급 ────────────────────────────────────────────────────────────
export async function getMyVenue(): Promise<Venue | null> {
  if (IS_MOCK) return null;
  const user = await currentUser();
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
  const user = await currentUser();
  if (!user) return [];
  return dedupe('followed-venues:' + user.id, async () => {
    const { data, error } = await supabase.from('venue_follows').select('venue_id').eq('user_id', user.id);
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => r.venue_id) as string[];
  });
}
export async function followVenue(venueId: string): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('venue_follows').insert({ user_id: user.id, venue_id: venueId });
  if (error && error.code !== '23505') throw error; // 중복(이미 팔로우)은 무시
}
export async function unfollowVenue(venueId: string): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
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

/**
 * 작성자 장착 마크 일괄 조회 — userId → 마크 이모지(상점 코스메틱)
 *
 * 서버 get_equipped_marks 가 **만료·강등된 마크를 이미 걸러서** 준다
 * (기간 마크는 잔여 기간, 도달 마크는 activity_points 재확인). 여기서는 글리프만 붙인다.
 */
export async function getEquippedMarks(userIds: string[]): Promise<Record<string, string>> {
  if (IS_MOCK || userIds.length === 0) return {};
  const { data, error } = await supabase.rpc('get_equipped_marks', { p_ids: userIds });
  if (error) return {};
  // 서버 카탈로그(도달 16 + 기간 6)를 먼저 확보한다 — 폴백에 없는 새 마크가
  // 빈 문자열로 떨어져 '산 게 조용히 사라지는' 사고를 막는다.
  const { loadShopMarks, markEmoji } = await import('../lib/shopMarks');
  await loadShopMarks();
  const out: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const emoji = markEmoji(r.equipped_mark);
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

// ── 외치기(Shout) — 활동점수로 사는 커뮤니티 강조 메시지 (오너 #8) ───────────
//
// 설계 요약(자세한 근거는 supabase/migrations/20260829h_community_shouts.sql 주석):
//  · 차감 대상은 activity_points 가 아니라 spent_points 다.
//    activity_points 는 등급·활동 순위·상점 마크 해금의 기준이라 깎으면 '샀는데 등급이 내려가고
//    장착 중이던 마크가 다시 잠기는' 회귀가 생긴다. 그래서 누적은 보존하고 사용액만 쌓는다.
//    사용 가능 점수 = activity_points - spent_points.
//  · 차감과 게시는 buy_shout() RPC 한 트랜잭션에서 함께 일어난다(둘 중 하나만 되는 상태가 없다).
//  · 중복 클릭·잔액 부족·도배는 전부 서버가 막는다(프로필 행 잠금 + 쿨다운 + 하루 상한).

/** 외치기 등급 — 서버 shop_skus 의 shout_* 키에서 접두사를 뗀 값 */
export type ShoutTier = 'basic' | 'gold' | 'board';

export interface Shout {
  id: string; userId: string; nickname: string; message: string;
  cost: number; createdAt: string; expiresAt: string;
  /** 구매 등급. tierRank 가 클수록 위에 진열된다(가격표가 바뀌어도 과거 게시물 자리는 고정) */
  tier: ShoutTier; tierRank: number;
}
export interface ShoutRules {
  cost: number; cooldownMinutes: number; dailyCap: number;
  maxLen: number; minLen: number; ttlHours: number;
}
export interface PointBalance { total: number; spent: number; available: number }

/** 외치기 규칙(가격·쿨다운·길이 한도) — 서버가 단일 출처, 클라이언트는 표시만 한다 */
export async function getShoutRules(): Promise<ShoutRules> {
  // ⚠ 서버 shout_rules() 와 반드시 같은 값이어야 한다. 폴백이 낮으면 화면은 30점이라 말하고
  //   서버는 200점을 걷는다 — 유저에게 거짓말이 된다. 가격을 바꿀 땐 여기까지 같이 바꿀 것.
  //   (2026-08-29 오너 지시로 30 → 200: 하루 획득량 실측 ≈45~50점 기준 '나흘치')
  const fallback: ShoutRules = { cost: 200, cooldownMinutes: 10, dailyCap: 3, maxLen: 60, minLen: 2, ttlHours: 6 };
  if (IS_MOCK) return fallback;
  const { data, error } = await supabase.rpc('shout_rules');
  const r = Array.isArray(data) ? data[0] : data;
  if (error || !r) return fallback;
  return {
    cost: r.cost ?? fallback.cost,
    cooldownMinutes: r.cooldown_minutes ?? fallback.cooldownMinutes,
    dailyCap: r.daily_cap ?? fallback.dailyCap,
    maxLen: r.max_len ?? fallback.maxLen,
    minLen: r.min_len ?? fallback.minLen,
    ttlHours: r.ttl_hours ?? fallback.ttlHours,
  };
}

/** 내 활동점수 잔액(누적/사용/사용 가능) */
export async function getMyPointBalance(): Promise<PointBalance | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('my_point_balance');
  const r = Array.isArray(data) ? data[0] : data;
  if (error || !r) return null;
  return { total: r.total ?? 0, spent: r.spent ?? 0, available: r.available ?? 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapShout = (r: any): Shout => ({
  id: r.id, userId: r.user_id, nickname: r.nickname ?? '회원', message: r.message ?? '',
  cost: r.cost ?? 0, createdAt: r.created_at, expiresAt: r.expires_at,
  tier: (r.tier ?? 'basic') as ShoutTier, tierRank: r.tier_rank ?? 1,
});

/** 지금 살아있는 외침(만료·숨김 제외) — 상위 등급 먼저, 같으면 최신순 */
export async function getLiveShouts(limit = 10): Promise<Shout[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('community_shouts')
    .select('id, user_id, nickname, message, cost, tier, tier_rank, created_at, expires_at')
    .eq('hidden', false)
    .gt('expires_at', new Date().toISOString())
    .order('tier_rank', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map(mapShout);
}

/**
 * 구매 = 차감 + 게시(원자적). 실패 사유는 서버 메시지를 그대로 올린다.
 * 등급별 가격·노출시간은 서버 shop_skus 가 단일 출처다 — 여기서 값을 보내지 않는다.
 */
export async function buyShout(message: string, tier: ShoutTier = 'basic'): Promise<Shout> {
  const { data, error } = await supabase.rpc('buy_shout', { p_message: message, p_tier: tier });
  if (error) throw new Error(error.message);
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) throw new Error('외치기에 실패했습니다');
  return mapShout(r);
}

// ── 소비형 상품 가격표 · 기간 마크 (2026-08-30 소비 경제 재설계) ──────────────
//
// 왜 소비처를 늘렸나(근거는 supabase/migrations/20260830a_point_sink_economy.sql 헤더):
//  · 소비처가 외치기 200점 하나뿐이라 **보통 유저의 첫 소비가 14일 뒤**였다.
//    2주 동안 '점수는 쓰는 것'을 배울 기회가 없으면 점수는 그냥 장식이 된다.
//  · 일회성만 있으면 한 번 사고 경제가 멈춘다 → 만료되는 기간 상품으로 **반복 소비**를 만든다.
//  · 가격 단위는 하루 50점(획득 상한을 다 채운 하루의 실측치).
//    50=하루 · 200=나흘 · 300=6일 · 600=12일 · 1,100=22일 · 2,000=40일.
//  · 전부 꾸미기·표현이다. 참가·상금·순위에 이점을 주는 상품은 넣지 않았다(§28).

export interface ShopSku {
  key: string;
  kind: 'mark_rent' | 'shout';
  label: string;
  descr: string;
  price: number;
  durationHours: number;
  tierRank: number;
  sort: number;
}

/** 가격표(서버 단일 출처). 실패 시 빈 배열 — 화면은 '상품 없음'으로 안전하게 접힌다. */
export async function getShopSkus(): Promise<ShopSku[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('shop_skus')
    .select('key, kind, label, descr, price, duration_hours, tier_rank, sort')
    .eq('active', true)
    .order('sort');
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    key: r.key, kind: r.kind, label: r.label, descr: r.descr ?? '',
    price: Number(r.price) || 0, durationHours: Number(r.duration_hours) || 0,
    tierRank: Number(r.tier_rank) || 1, sort: Number(r.sort) || 0,
  }));
}

export interface MarkRental { markKey: string; expiresAt: string }

/** 내 기간 마크(만료 전만). 없으면 null. */
export async function getMyMarkRental(): Promise<MarkRental | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('my_mark_rental');
  const r = Array.isArray(data) ? data[0] : data;
  if (error || !r) return null;
  return { markKey: r.mark_key, expiresAt: r.expires_at };
}

/**
 * 기간 마크 구매 — 차감·지급·장착이 서버 한 트랜잭션에서 일어난다(buy_shout 과 같은 규약).
 * 같은 마크를 다시 사면 기간이 이어 붙고, 다른 마크를 사면 교체된다(최대 1년치).
 */
export async function buyMarkRental(sku: string, markKey: string): Promise<MarkRental> {
  const { data, error } = await supabase.rpc('buy_mark_rental', { p_sku: sku, p_mark_key: markKey });
  if (error) throw new Error(error.message);
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) throw new Error('구매에 실패했습니다');
  return { markKey: r.mark_key, expiresAt: r.expires_at };
}

/** 내리기 — 작성자 본인 또는 운영자(환급 없음) */
export async function hideShout(id: string): Promise<void> {
  const { error } = await supabase.rpc('hide_shout', { p_id: id });
  if (error) throw new Error(error.message);
}

/** 운영자 — 만료·숨김 포함 최근 외침(RLS 가 admin 에게만 전량 노출) */
export async function adminListShouts(limit = 50): Promise<(Shout & { hidden: boolean })[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('community_shouts')
    .select('id, user_id, nickname, message, cost, tier, tier_rank, created_at, expires_at, hidden')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ ...mapShout(r), hidden: r.hidden === true }));
}

// ── 운영자 — 활동점수 원장 · 환불 (2026-08-30 환불 경로) ──────────────────────
//
// 설계 근거는 supabase/migrations/20260830c_refund.sql 헤더에 있다. 화면 쪽 규약만 옮기면:
//  · **환불액을 프런트에서 계산하지 않는다.** refundEstimate(지금 누르면 몇 점)와
//    refundBlock(왜 못 하나)은 서버 refund_quote() 가 유일한 출처다. 화면이 자체 계산하면
//    "1,100점 환불"이라 말하고 380점만 돌아오는 사고가 난다(shoutCost 폴백 30 vs 서버 200 과 같은 함정).
//  · 환불은 spent_points 를 낮춰 되돌린다. activity_points 는 건드리지 않는다
//    (등급·활동순위·도달마크 해금 기준이라 올리면 마크가 환불 때문에 해금된다).
//  · 사유 4자 이상 필수 — 서버가 최종 판정하지만 화면에서도 먼저 막아 왕복을 줄인다.

export interface PointPurchase {
  id: number;
  kind: 'shout' | 'mark_rent';
  skuKey: string;
  /** 상품 라벨(shop_skus.label). 가격표가 바뀌어도 과거 기록의 이름은 서버가 준 값 그대로 */
  label: string;
  markKey: string | null;
  shoutId: string | null;
  cost: number;
  createdAt: string;
  refundedAt: string | null;
  refundPoints: number;
  refundReason: string | null;
  refundable: boolean;
  /** 서버 계산값. 버튼 라벨에 그대로 박는다 — 화면이 다시 계산하지 않는다 */
  refundEstimate: number;
  /** 환불 불가 사유(한국어). null 이면 환불 가능 */
  refundBlock: string | null;
}

export interface PointGrant {
  id: number; delta: number; reason: string; createdAt: string;
}

/** 운영자 — 회원 활동점수 잔액(누적/사용/사용 가능) */
export async function adminPointSummary(userId: string): Promise<PointBalance | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('admin_point_summary', { p_user: userId });
  const r = Array.isArray(data) ? data[0] : data;
  if (error || !r) return null;
  return { total: r.total ?? 0, spent: r.spent ?? 0, available: r.available ?? 0 };
}

/** 운영자 — 회원의 활동점수 구매 내역(환불 견적·불가 사유 포함, 전부 서버 계산값) */
export async function adminListPurchases(userId: string, limit = 30): Promise<PointPurchase[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('admin_list_purchases', { p_user: userId, p_limit: limit });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: Number(r.id), kind: r.kind, skuKey: r.sku_key, label: r.label ?? r.sku_key,
    markKey: r.mark_key ?? null, shoutId: r.shout_id ?? null,
    cost: Number(r.cost) || 0, createdAt: r.created_at,
    refundedAt: r.refunded_at ?? null, refundPoints: Number(r.refund_points) || 0,
    refundReason: r.refund_reason ?? null,
    refundable: r.refundable === true, refundEstimate: Number(r.refund_estimate) || 0,
    refundBlock: r.refund_block ?? null,
  }));
}

/**
 * 운영자 환불 — 원장 1행당 1회, 구매 후 24시간 이내, 사유 4자 이상.
 * 반환값은 실제 반환된 점수와 회원의 사용 가능 점수(둘 다 서버 계산값).
 */
export async function adminRefundPurchase(
  purchaseId: number, reason: string,
): Promise<{ refunded: number; available: number }> {
  const { data, error } = await supabase.rpc('admin_refund_purchase', {
    p_purchase_id: purchaseId, p_reason: reason,
  });
  if (error) throw new Error(error.message);
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) throw new Error('환불에 실패했습니다');
  return { refunded: Number(r.refunded) || 0, available: Number(r.available) || 0 };
}

/** 운영자 — 외침별 원장 id·환불 견적(외치기 관리 카드가 회원이 아니라 외침 단위로 보기 때문) */
export async function adminShoutRefunds(
  limit = 50,
): Promise<Record<string, { purchaseId: number; estimate: number; block: string | null }>> {
  if (IS_MOCK) return {};
  const { data, error } = await supabase.rpc('admin_shout_refunds', { p_limit: limit });
  if (error) return {};
  const map: Record<string, { purchaseId: number; estimate: number; block: string | null }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    if (r.shout_id) map[r.shout_id] = {
      purchaseId: Number(r.purchase_id), estimate: Number(r.refund_estimate) || 0,
      block: r.refund_block ?? null,
    };
  }
  return map;
}

/** 운영자 — 회원의 수기 지급/회수 기록(point_grants). RLS 가 운영자에게만 전량 노출한다. */
export async function adminListGrants(userId: string, limit = 20): Promise<PointGrant[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('point_grants')
    .select('id, delta, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: Number(r.id), delta: Number(r.delta) || 0, reason: r.reason ?? '', createdAt: r.created_at,
  }));
}

/**
 * 운영자 활동점수 지급/회수 — 사유 필수, point_grants 에 기록된다.
 * 환불(구매 되돌리기)과 목적이 다르다: 이쪽은 보상·사과성 지급과 오지급 회수용이다.
 * 반환값은 지급 후 누적 활동점수.
 */
export async function adminGrantPoints(userId: string, delta: number, reason: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_grant_points', {
    p_user: userId, p_delta: delta, p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
