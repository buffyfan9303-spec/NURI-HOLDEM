// src/api/communityCore.ts — 첫 화면(App.tsx)이 실제로 부르는 커뮤니티 API 와 그 매핑만 둔다.
//
// 왜 따로 있나(2026-10-02 · entryGzipKb 267 예산): community.ts(2200줄)는 App.tsx 가 정적으로 물어서
//   **파일 전체**가 첫 화면 청크에 실려 있었다(34.6KB raw / 8.5KB gz) — 한 모듈은 청크를 나눌 수 없어서
//   그룹·딜러·외치기·상점·관리자 함수까지 앱을 켤 때 모두가 받았다. 여기엔 App.tsx 가 부르는 14개와 매핑만 남기고
//   나머지는 community.ts 에 두어 지연 청크(그 화면을 여는 사람만)로 보낸다.
// 규칙: 첫 화면 파일(App.tsx 와 그 정적 그래프)은 **이 파일만** 물고 community.ts 는 물지 않는다
//   (criticalPathGraph.contract.test.ts BANNED). community.ts 는 이 파일을 재수출해 기존 import 35곳의 이름을 그대로 유지한다
//   — 방향이 무거운 쪽→가벼운 쪽이라 재수출이 첫 화면으로 무거운 쪽을 끌어오지 않는다.
// 여기에 함수를 더하기 전에: 첫 화면이 정말 부르는가? 아니면 community.ts 에 둔다.
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import { mustAffect } from './_mustAffect';
import { gateError } from './_gateError';
import type { UserRole } from './auth';

// 매장 상태 (관리자 게시물 관리) — active 외에는 공개 목록에서 숨김. 모두 active로 복구 가능.
export type VenueStatus = 'active' | 'inactive' | 'suspended' | 'hidden';

export interface Venue {
  id: string; name: string; region: string; address: string;
  description?: string; imageUrl?: string; themeColor?: string;
  kakaoUrl?: string; // 카카오톡 오픈채팅/단톡방 링크
  ownerId?: string; approved: boolean; contactPhone?: string;
  businessHours?: string; followerCount?: number;
  /** 프리미엄 매장(관리자 지정) — **기간이 지나면 거짓**으로 읽는다. 기간 안 프리미엄 매장 포스터는 승인 없이 공개(20261002h). */
  isPaidAd?: boolean;
  /** 프리미엄 기간 끝(venues.premium_until) — null = 기한 없음. 포스터 부스트(schedules.premium_until)와 별개다. */
  premiumUntil?: string | null;
  displayOrder?: number; // 관리자 노출 순서 (작을수록 앞)
  status?: VenueStatus;  // active/inactive/suspended/hidden
  verificationStatus?: VenueVerificationStatus; // 인증 등급
  images?: string[];     // 매장 갤러리(자동 슬라이드)
  kind?: GroupKind;      // venue(홀덤펍) | dealer_team | club | youtuber | other
  /** 위경도 — 카카오 지오코딩 라이트백(set_venue_coords). 거리순 정렬용, 없으면 정렬 뒤로 */
  lat?: number | null; lng?: number | null;
  joinApproval?: boolean;// 비-매장 그룹: 가입 시 개설자 승인 필요 여부
  /** 그룹 개설 목적 — 운영자 승인 판단용(비공개). 공개 소개(description)와 별개다. */
  openPurpose?: string;
  slug?: string | null;  // 커스텀 공유 링크(/s/<slug>) — 업주 설정, 전역 유니크
  /** 다중 연락처(오너 #17). 신 필드 우선, 없으면 contactPhone 폴백 — venueContacts() 를 쓸 것 */
  contacts?: VenueContact[];
}

/** 연락처 1건 — 라벨(대표/예약/담당자…)이 있어야 손님이 '어디로 걸지'를 고르지 않는다 */
export interface VenueContact { label: string; phone: string }

export const MAX_VENUE_CONTACTS = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rowToContacts = (raw: any): VenueContact[] => (Array.isArray(raw) ? raw : [])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .map((c: any) => ({ label: String(c?.label ?? '').trim(), phone: String(c?.phone ?? '').trim() }))
  .filter((c) => c.phone !== '')
  .slice(0, MAX_VENUE_CONTACTS);

// 커뮤니티 그룹 종류. venue=홀덤펍(기존), 그 외는 가입제 비공개 그룹.
export type GroupKind = 'venue' | 'dealer_team' | 'club' | 'youtuber' | 'other';

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
  blinded?: boolean;        // 숨김(운영자/작성자만 열람) — 서버 RLS posts_select 가 가린다
  /** 숨김 출처: 'admin' 관리자 블라인드 · 'takedown' 권리침해 임시조치(20261006t) · 'auto' 옛 자동 숨김 */
  blindedSource?: string | null;
  /** 남(비로그인 포함)이 임시조치된 글의 링크를 열었을 때의 자리표시 — 본문·작성자 없이 안내만 있다(getPostById) */
  takedown?: TakedownNotice;
  liked?: boolean;         // 현재 사용자가 좋아요했는지(post_likes 기준) — 토글 UI용
  /** 끌올 만료 시각(ISO). now 보다 크면 목록 상단 고정 — 판정은 isBumped() 하나로 */
  bumpedUntil?: string | null;
  /** 끌올 누적 횟수(표시용) */
  bumpCount?: number;
  /** 관리자 상단 고정 시각(ISO). null = 미고정. 정렬은 src/lib/pinnedFirst.ts */
  pinnedAt?: string | null;
  /**
   * 목록 쿼리에 끼워 받은 post_spots 원본 행(`POST_LIST_SELECT`) — 피드 SPOT 미리보기·상세 첫 프레임용.
   * undefined = 모른다(끼워 받지 않은 경로·옛 캐시) · null = 스팟 글이 아니다. 해석은 spotShare/embeddedSpot.ts.
   */
  spotEmbed?: unknown | null;
  /**
   * 목록 쿼리에 끼워 받은 post_polls 행(질문·보기 이름) — 상세가 투표 자리를 첫 프레임부터 잡는 데 쓴다.
   * undefined = 모른다 · null = 투표 없음. 해석은 postAttachments.pollFromEmbed.
   */
  pollEmbed?: unknown | null;
}

/** 권리침해 임시조치 안내(서버 post_takedown_notice) — reason·objectionAt 은 작성자 본인·운영자에게만 온다. 변환은 reports.ts */
export interface TakedownNotice {
  status: 'active' | 'kept'; createdAt: string; endsAt: string; expired: boolean; mine: boolean;
  /** 신청 없이 운영 정책으로(§44의3) — 화면 문구만 바뀐다. 신원은 없다 */
  exOfficio?: boolean;
  reason?: string; objectionAt?: string | null;
}

/**
 * 게시판 목록·단건 select — 스팟 미리보기를 **같은 요청 하나에** 끼워 받는다(글마다 따로 부르는 N+1 금지).
 * post_spots 는 칸 단위 GRANT(공개 열만)라 `*` 금지 — 쓰는 세 열만. 가린 값은 서버가 spot 본문에서 이미 뺐다(20260911d).
 * 끼워 받기가 실패하면(관계·권한 변경) 목록이 죽지 않게 `*` 로 한 번 더 받는다 — 미리보기만 빠진다.
 */
//   투표(post_polls·보기)는 공개 읽기 정책(20260827h)이라 같은 요청에 끼운다 — 상세 투표 블록이 첫 프레임부터 선다.
const POST_LIST_SELECT = '*, post_spots(spot, reveal_villain, reveal_result), post_polls(id, question, closes_at, post_poll_options(id, idx, label))';
export async function withSpotFallback<R extends { error: unknown }>(run: (select: string) => PromiseLike<R>): Promise<R> {
  const res = await run(POST_LIST_SELECT);
  return res.error ? run('*') : res;
}

// ── DB 변환 ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rowToVenue = (r: any): Venue => ({
  id: r.id, name: r.name, region: r.region, address: r.address,
  description: r.description, imageUrl: r.image_url, themeColor: r.theme_color,
  kakaoUrl: r.kakao_url ?? undefined,
  ownerId: r.owner_id, approved: r.approved, contactPhone: r.contact_phone,
  businessHours: r.business_hours, followerCount: r.follower_count,
  // 서버 판정(_venue_premium_active)과 같은 식 — 기간이 지난 프리미엄은 배지·상단 정렬에서도 빠진다.
  isPaidAd: !!r.is_paid_ad && (r.premium_until == null || new Date(r.premium_until) > new Date()),
  premiumUntil: r.premium_until ?? null,
  displayOrder: r.display_order,
  status: r.status ?? 'active',
  lat: r.lat ?? null, lng: r.lng ?? null,
  verificationStatus: r.verification_status ?? 'unverified',
  images: r.images ?? [],
  kind: r.kind ?? 'venue',
  joinApproval: r.join_approval ?? true,
  openPurpose: r.open_purpose ?? '',
  slug: r.slug ?? null,
  contacts: rowToContacts(r.contact_phones),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rowToComment = (r: any): Comment => ({
  id: r.id, scheduleId: r.schedule_id, venueId: r.venue_id, postId: r.post_id ?? undefined, parentId: r.parent_id,
  userId: r.user_id, userName: r.user_name, userRole: r.user_role,
  isOwner: r.is_owner, userAvatar: r.user_avatar ?? undefined,
  content: r.content, createdAt: r.created_at, edited: r.edited,
});

/** 게시글 행 → CommunityPost. 광고(승격 게시글) 경로도 **이 매핑 하나**를 쓴다 —
 *  매핑이 두 벌이면 한쪽만 고쳐져 광고 카드만 필드가 비는 사고가 난다(src/api/ads.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rowToPost = (r: any): CommunityPost => ({
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
  blindedSource: r.blinded_source ?? null,
  // 20260830m 추가분 — 컬럼이 없던 시절 응답(캐시 스냅샷 포함)에서도 0/null 로 안전하게 접힌다
  bumpedUntil: r.bumped_until ?? null,
  bumpCount:   r.bump_count ?? 0,
  pinnedAt:    r.pinned_at ?? null,
  // post_spots.post_id 는 PK 라 PostgREST 가 보통 객체로 주지만, 배열로 와도 받는다. 키가 없으면 '모름'.
  spotEmbed: !('post_spots' in r) ? undefined
    : Array.isArray(r.post_spots) ? (r.post_spots[0] ?? null) : (r.post_spots ?? null),
  pollEmbed: !('post_polls' in r) ? undefined
    : Array.isArray(r.post_polls) ? (r.post_polls[0] ?? null) : (r.post_polls ?? null),
});

/** 단건 게시글 — 공유 딥링크·알림 링크가 목록(최근 50건) 밖의 글을 가리킬 때 사용 */
export async function getPostById(postId: string): Promise<CommunityPost | null> {
  // IS_MOCK와 같은 조건을 직접 써야 Vite가 그래프 생성 전에 Mock 청크를 제외한다.
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    const { MOCK_COMMUNITY_POSTS } = await import('../mock/data');
    return MOCK_COMMUNITY_POSTS.find((p) => p.id === postId) ?? null;
  }
  // FULL-ERROR-SWEEP-B(2026-09-25): ?post=·알림 링크의 id 는 URL 에서 온 남의 입력이다. uuid 꼴이 아니면
  //   PostgREST 가 400(22P02) 을 돌려주던 것을 요청 없이 '없는 글'(null) 로 끝낸다.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId)) return null;
  const res = await withSpotFallback((sel) => supabase.from('community_posts').select(sel).eq('id', postId).maybeSingle());
  if (res.error) return null;
  // 서버가 가린 글(RLS 0행)이 권리침해 임시조치면 '없는 글' 대신 그 자리에 안내를 띄운다(약관 제5조⑧) — 지연 청크(첫 화면 예산).
  if (!res.data) return (await import('./reports')).takedownPlaceholder(postId);
  const liked = await supabase.from('post_likes').select('post_id').eq('post_id', postId).limit(1);
  return { ...rowToPost(res.data), liked: (liked.data ?? []).length > 0 };
}

// ── Venues ────────────────────────────────────────────────────────────────────
export async function getVenues(): Promise<Venue[]> {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
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

export async function updateVenueDescription(venueId: string, description: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('venues').update({ description, updated_at: new Date().toISOString() }).eq('id', venueId));
}

export async function updateVenueImage(venueId: string, imageUrl: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('venues').update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', venueId));
}

// ── Comments ──────────────────────────────────────────────────────────────────
export async function getComments(filter: { scheduleId?: string; venueId?: string; postId?: string }): Promise<Comment[]> {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
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
  // 서버 게이트(제재 20260911n · 금칙어 · 5초 쿨다운)는 plpgsql raise 라 code='P0001' 로 온다 —
  // 그 한국어 문장만 그대로 올린다. RLS 위반(42501) 등은 테이블·정책 이름이 섞여 나오므로
  // 뭉갠다(보안표준 6: 에러에 내부 식별자 노출 금지). DB 미적용 상태에서도 동작은 종전과 같다.
  if (error) throw new Error(error.code === 'P0001' ? error.message : '댓글 등록에 실패했습니다');
  return rowToComment(data);
}

// 댓글 삭제 — RLS 정책(comments_delete)이 "본인 또는 관리자"만 허용한다.
// ⚠ RLS 거부는 error 가 아니라 0행이다(_mustAffect.ts). 호출부(App.handleDeleteComment)가 낙관적으로
//   지우고 '댓글이 삭제되었습니다' 를 띄우므로, 0행을 성공으로 넘기면 화면만 지워진 채 새로고침 때 되살아난다.
export async function deleteComment(commentId: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('comments').delete().eq('id', commentId));
}

// ── Community Posts ────────────────────────────────────────────────────────────
export async function getPosts(): Promise<CommunityPost[]> {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    const { MOCK_COMMUNITY_POSTS } = await import('../mock/data');
    return MOCK_COMMUNITY_POSTS;
  }
  const postsRes = await withSpotFallback((sel) => supabase.from('community_posts').select(sel).order('created_at', { ascending: false }).limit(50));
  if (postsRes.error) throw postsRes.error;
  // 끌올(100점)한 글은 최신 50건 밖으로 밀려나 있어도 **반드시** 목록에 있어야 한다.
  // 이 한 번의 추가 조회가 없으면 오래된 글을 끌올한 사람은 돈을 내고 아무것도 못 얻는다
  // (동시 끌올 상한이 3자리라 최대 3행 — 부하는 무시할 수 있다).
  // 컬럼이 아직 없는 환경(마이그레이션 지연)에서는 조용히 건너뛴다 — 목록 자체가 죽으면 안 된다.
  const bumpedRes = await withSpotFallback((sel) => supabase.from('community_posts').select(sel)
    .gt('bumped_until', new Date().toISOString())
    .order('bumped_until', { ascending: false }).limit(10));
  // 관리자 고정 글도 같은 이유로 50건 밖에서 건져 온다(20260903a pinned_at — 컬럼 없으면 조용히 건너뜀).
  const pinnedRes = await withSpotFallback((sel) => supabase.from('community_posts').select(sel)
    .not('pinned_at', 'is', null)
    .order('pinned_at', { ascending: false }).limit(10));
  const rows = [...(postsRes.data ?? [])];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seen = new Set(rows.map((r: any) => r.id as string));
  for (const res of [bumpedRes, pinnedRes]) {
    if (res.error) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (res.data ?? []) as any[]) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
  }
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
  if (first.error.code !== '42703') throw gateError(first.error, '게시글 등록에 실패했습니다');

  const fallback = await supabase.from('community_posts').insert(base).select().single();
  if (fallback.error) throw gateError(fallback.error, '게시글 등록에 실패했습니다');
  // 클라이언트 표시용으로 입력값을 합쳐 반환(DB엔 미저장이지만 UI 일관성 유지)
  return { ...rowToPost(fallback.data), category: payload.category, title: payload.title, images: payload.images };
}

// 게시글 삭제 — RLS(posts_delete: 본인 또는 admin)가 권한 강제.
// ⚠ F15(2026-09-13): `.select()` 없이 delete 하면 RLS 거부가 **error 없이 0행 200** 이라 여기서 성공으로 통과했다.
//   호출부(App.handleDeletePost)는 낙관적으로 목록에서 빼고 '게시글이 삭제되었습니다' 를 띄우고 감사 로그까지
//   남기므로, 권한 없는 운영자가 눌러도 새로고침 전까지 아무도 몰랐다 — approveOwner 와 같은 부류의 두 번째.
//   지금은 반영 행을 확인해 0행이면 던진다. App 의 catch 가 reloadPosts() 로 화면을 서버 상태로 되돌린다.
export async function deletePost(postId: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('community_posts').delete().eq('id', postId));
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

// 업주: 매장 갤러리(자동 슬라이드) 이미지 URL 목록 저장
export async function updateVenueImages(venueId: string, urls: string[]): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('venues').update({ images: urls }).eq('id', venueId));
}
