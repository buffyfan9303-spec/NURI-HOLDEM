// src/api/community.ts
import { supabase, IS_MOCK } from '../lib/supabase';
import type { UserRole } from './auth';

export interface Venue {
  id: string; name: string; region: string; address: string;
  description?: string; imageUrl?: string; themeColor?: string;
  ownerId?: string; approved: boolean; contactPhone?: string;
  businessHours?: string; followerCount?: number; isPaidAd?: boolean;
}

export interface Comment {
  id: string; scheduleId?: string; venueId?: string; parentId?: string;
  userId: string; userName: string; userRole: UserRole; isOwner: boolean;
  content: string; createdAt: string; edited?: boolean;
}

export interface CommunityPost {
  id: string; userId: string; userName: string;
  userRole: UserRole; userColor?: string;
  content: string; createdAt: string; likeCount: number; commentCount: number;
}

// ── DB 변환 ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToVenue = (r: any): Venue => ({
  id: r.id, name: r.name, region: r.region, address: r.address,
  description: r.description, imageUrl: r.image_url, themeColor: r.theme_color,
  ownerId: r.owner_id, approved: r.approved, contactPhone: r.contact_phone,
  businessHours: r.business_hours, followerCount: r.follower_count, isPaidAd: r.is_paid_ad,
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
});

// ── Venues ────────────────────────────────────────────────────────────────────
export async function getVenues(): Promise<Venue[]> {
  if (IS_MOCK) {
    const { MOCK_VENUES } = await import('../mock/data');
    return MOCK_VENUES;
  }
  const { data, error } = await supabase.from('venues').select('*')
    .eq('approved', true).order('is_paid_ad', { ascending: false })
    .order('follower_count', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToVenue);
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
  payload: Pick<CommunityPost, 'userId' | 'userName' | 'userRole' | 'userColor' | 'content'>,
): Promise<CommunityPost> {
  if (IS_MOCK) {
    return { ...payload, id: `p_${Date.now()}`, createdAt: new Date().toISOString(), likeCount: 0, commentCount: 0 };
  }
  const { data, error } = await supabase.from('community_posts').insert({
    user_id: payload.userId, user_name: payload.userName,
    user_role: payload.userRole, user_color: payload.userColor,
    content: payload.content,
  }).select().single();
  if (error) throw error;
  return rowToPost(data);
}

export async function likePost(postId: string): Promise<void> {
  if (IS_MOCK) return;
  await supabase.rpc('increment_post_likes', { post_id: postId });
}