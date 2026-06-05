// src/api/marketplace.ts
import { supabase, IS_MOCK } from '../lib/supabase';

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
  const { data: { user } } = await supabase.auth.getUser();
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

// ── Notices ───────────────────────────────────────────────────────────────────
export async function getNotices(): Promise<MarketplaceNotice[]> {
  if (IS_MOCK) {
    const { MOCK_NOTICES } = await import('../mock/data');
    return MOCK_NOTICES;
  }
  const { data, error } = await supabase.from('marketplace_notices').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToNotice);
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