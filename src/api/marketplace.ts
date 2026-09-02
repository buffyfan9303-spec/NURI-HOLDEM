// src/api/marketplace.ts
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';

// 카테고리(요구사항 4): '게임머니' 노출 제거 → [용품(pokerGear), 아이템(item), 기타(etc)].
//  gameMoney는 기존 DB 데이터 호환을 위해 타입에는 유지(신규 작성 UI에선 미노출).
export type ListingCategory = 'gameMoney' | 'pokerGear' | 'item' | 'etc';
export type ListingCondition = 'S' | 'A' | 'B' | 'C';
export type ListingStatus    = 'on_sale' | 'reserved' | 'sold';

export interface MarketplaceListing {
  id: string; title: string; category: ListingCategory;
  description: string; price: number; condition: ListingCondition;
  status: ListingStatus; images: string[];
  region: string; shippingAvailable: boolean; pickupOnly: boolean;
  sellerId: string; sellerName: string; sellerAvatarColor: string;
  sellerTradeCount: number; sellerVerified: boolean;
  createdAt: string; viewCount: number; likeCount: number; commentCount: number;
}

export type NoticeType = 'pinned' | 'event' | 'caution';
// 공지 노출 대상 게시판: all(전체) / community(게시판) / market(중고장터) / dealer(딜러)
export type NoticeBoard = 'all' | 'community' | 'market' | 'dealer';
export interface MarketplaceNotice {
  id: string; type: NoticeType; title: string; body?: string;
  authorName: string; createdAt: string; board?: NoticeBoard;
  /** 관리자 노출 순서(클수록 위, 기본 0). 20260903a */
  sortOrder?: number;
}

// ── DB 변환 ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToListing = (r: any): MarketplaceListing => ({
  id: r.id, title: r.title, category: r.category,
  description: r.description, price: r.price, condition: r.condition,
  status: r.status, images: r.images ?? [],
  region: r.region, shippingAvailable: r.shipping_available, pickupOnly: r.pickup_only,
  sellerId: r.seller_id, sellerName: r.seller_name,
  sellerAvatarColor: r.seller_avatar_color, sellerTradeCount: r.seller_trade_count,
  sellerVerified: r.seller_verified,
  createdAt: r.created_at, viewCount: r.view_count,
  likeCount: r.like_count, commentCount: r.comment_count,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToNotice = (r: any): MarketplaceNotice => ({
  id: r.id, type: r.type, title: r.title, body: r.body,
  authorName: r.author_name, createdAt: r.created_at,
  board: (r.board ?? 'all') as NoticeBoard,
  sortOrder: r.sort_order ?? 0,
});

// ── Listings ──────────────────────────────────────────────────────────────────
export async function getListings(opts?: {
  category?: ListingCategory; status?: ListingStatus; region?: string;
}): Promise<MarketplaceListing[]> {
  if (IS_MOCK) {
    const { MOCK_LISTINGS } = await import('../mock/data');
    return MOCK_LISTINGS.filter((l) =>
      (!opts?.category || l.category === opts.category) &&
      (!opts?.status   || l.status   === opts.status)   &&
      (!opts?.region   || l.region   === opts.region),
    );
  }
  let q = supabase.from('marketplace_listings').select('*').order('created_at', { ascending: false });
  if (opts?.category) q = q.eq('category', opts.category);
  if (opts?.status)   q = q.eq('status',   opts.status);
  if (opts?.region)   q = q.eq('region',   opts.region);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToListing);
}

/** 내가 등록한 판매글 (최신순) */
export async function getMyListings(): Promise<MarketplaceListing[]> {
  if (IS_MOCK) return [];
  const user = await currentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('marketplace_listings')
    .select('*').eq('seller_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToListing);
}

export async function createListing(
  payload: Omit<MarketplaceListing, 'id' | 'createdAt' | 'viewCount' | 'likeCount' | 'commentCount'>,
): Promise<MarketplaceListing> {
  if (IS_MOCK) {
    return { ...payload, id: `m_${Date.now()}`, createdAt: new Date().toISOString(), viewCount: 0, likeCount: 0, commentCount: 0 };
  }
  const { data, error } = await supabase.from('marketplace_listings').insert({
    title:               payload.title,
    category:            payload.category,
    description:         payload.description,
    price:               payload.price,
    condition:           payload.condition,
    status:              payload.status,
    images:              payload.images,
    region:              payload.region,
    shipping_available:  payload.shippingAvailable,
    pickup_only:         payload.pickupOnly,
    seller_id:           payload.sellerId,
    seller_name:         payload.sellerName,
    seller_avatar_color: payload.sellerAvatarColor,
    seller_trade_count:  payload.sellerTradeCount,
    seller_verified:     payload.sellerVerified,
  }).select().single();
  if (error) throw error;
  return rowToListing(data);
}

export async function updateListingStatus(id: string, status: ListingStatus): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('marketplace_listings').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteListing(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
  if (error) throw error;
}

// ── 찜(관심) ──────────────────────────────────────────────────────────────────
// 커뮤니티 좋아요(post_likes/toggle_post_like)와 같은 구조를 쓴다. 쓰기를 RPC 한 곳으로만
// 통과시켜야 찜 행과 listings.like_count 가 항상 같은 트랜잭션에서 움직인다.
export interface ListingLikeState { liked: boolean; likeCount: number }

/** 낙관적 토글 계산(순수) — 클릭 즉시 UI 를 뒤집고, 서버 응답이 오면 그 값으로 덮어쓴다.
 *  음수 하한은 서버의 greatest(0, ..) 와 같은 규칙이라 되돌리기 시 값이 어긋나지 않는다. */
export function nextLikeState(cur: ListingLikeState): ListingLikeState {
  return { liked: !cur.liked, likeCount: Math.max(0, cur.likeCount + (cur.liked ? -1 : 1)) };
}

/** 상세 진입 시: 내 찜 여부 + 서버의 최신 총 개수.
 *  목록 배열의 likeCount 는 탭 로드 시점 스냅샷이라 그 사이 남이 찜하면 어긋난다. */
export async function getListingLikeState(listingId: string): Promise<ListingLikeState> {
  if (IS_MOCK) return { liked: false, likeCount: 0 };
  // listing_likes 는 RLS 가 '내 행'만 돌려주므로 user_id 조건이 따로 필요 없다(미로그인=0행).
  const [mine, row] = await Promise.all([
    supabase.from('listing_likes').select('listing_id').eq('listing_id', listingId).maybeSingle(),
    supabase.from('marketplace_listings').select('like_count').eq('id', listingId).maybeSingle(),
  ]);
  return {
    liked: !!mine.data,
    likeCount: Number((row.data as { like_count?: number } | null)?.like_count ?? 0),
  };
}

/** 찜 토글 — 1인 1회, 다시 누르면 취소. 서버 권위 카운트+liked 반환(카운트 조작 경로 차단). */
export async function toggleListingLike(listingId: string): Promise<ListingLikeState> {
  if (IS_MOCK) return { liked: true, likeCount: 1 };
  const { data, error } = await supabase.rpc('toggle_listing_like', { p_listing_id: listingId });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (data ?? {}) as any;
  return { liked: d.liked === true, likeCount: Number(d.count ?? 0) };
}

/** 내가 찜한 매물 — 최근 찜한 순. listing_likes 는 RLS 로 내 행만 보인다(미로그인=0건). */
export async function getMyLikedListings(): Promise<MarketplaceListing[]> {
  if (IS_MOCK) return [];
  const { data: likes, error } = await supabase
    .from('listing_likes').select('listing_id, created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = (likes ?? []).map((r: any) => r.listing_id as string);
  if (ids.length === 0) return [];
  const { data, error: e2 } = await supabase.from('marketplace_listings').select('*').in('id', ids);
  if (e2) throw e2;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, MarketplaceListing>((data ?? []).map((r: any) => [r.id as string, rowToListing(r)]));
  // 순서는 찜한 시각 기준이라 ids 를 기준으로 되짚는다. 삭제된 매물은 cascade 로 찜도 지워지지만,
  // 두 조회 사이의 레이스는 filter 로 흘려보낸다.
  return ids.map((id) => byId.get(id)).filter((l): l is MarketplaceListing => !!l);
}

// ── Notices ───────────────────────────────────────────────────────────────────
export async function getNotices(): Promise<MarketplaceNotice[]> {
  if (IS_MOCK) {
    const { MOCK_NOTICES } = await import('../mock/data');
    return MOCK_NOTICES;
  }
  // 관리자 순서(sort_order desc) 우선, 같은 값은 최신순 — 20260903a
  const { data, error } = await supabase.from('marketplace_notices').select('*')
    .order('sort_order', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToNotice);
}

/** 관리자: 공지 노출 순서 저장 — RLS notices_admin_upd(my_role()='admin')가 강제. */
export async function setNoticeOrder(id: string, sortOrder: number): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('marketplace_notices').update({ sort_order: sortOrder }).eq('id', id);
  if (error) throw error;
}

// 공지 작성 — RLS 정책(notices_admin_all)이 관리자(my_role()='admin')만 CUD 허용.
// 즉, 비관리자가 호출하면 서버에서 거부되므로 권한은 DB에서 강제된다.
export async function createNotice(
  payload: Pick<MarketplaceNotice, 'type' | 'title' | 'body' | 'authorName' | 'board'>,
): Promise<MarketplaceNotice> {
  if (IS_MOCK) {
    return { ...payload, id: `n_${Date.now()}`, createdAt: new Date().toISOString() };
  }
  const { data, error } = await supabase.from('marketplace_notices').insert({
    type:        payload.type,
    title:       payload.title,
    body:        payload.body ?? null,
    author_name: payload.authorName,
    board:       payload.board ?? 'all',
  }).select().single();
  if (error) throw error;
  return rowToNotice(data);
}

export async function deleteNotice(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('marketplace_notices').delete().eq('id', id);
  if (error) throw error;
}

export async function updateNotice(
  id: string,
  payload: Pick<MarketplaceNotice, 'type' | 'title' | 'body' | 'board'>,
): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('marketplace_notices').update({
    type:  payload.type,
    title: payload.title,
    body:  payload.body ?? null,
    board: payload.board ?? 'all',
  }).eq('id', id);
  if (error) throw error;
}