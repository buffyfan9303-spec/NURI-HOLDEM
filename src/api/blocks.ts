// src/api/blocks.ts — 사용자 차단/숨기기.
// 차단하면 그 사용자의 글·댓글·매물이 내 화면에서 숨겨진다(클라 필터). 본인 차단목록만 RLS로 관리.
import { supabase, IS_MOCK } from '../lib/supabase';

export interface BlockedUser { blockedId: string; name: string; createdAt: string }

/** 내가 차단한 사용자 id 집합 — 피드/댓글 필터에 사용 */
export async function getMyBlockedIds(): Promise<Set<string>> {
  if (IS_MOCK) return new Set();
  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error) return new Set();
  return new Set((data ?? []).map((r: { blocked_id: string }) => r.blocked_id));
}

/** 차단 목록(이름 포함) — 관리 화면용 */
export async function listMyBlocks(): Promise<BlockedUser[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('user_blocks')
    .select('blocked_id, blocked_name, created_at').order('created_at', { ascending: false });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ blockedId: r.blocked_id, name: r.blocked_name || '사용자', createdAt: r.created_at }));
}

/** 차단 — 닉네임을 함께 저장(목록 표시용, profiles 조인 불가) */
export async function blockUser(blockedId: string, name?: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error('로그인이 필요합니다');
  if (me.user.id === blockedId) throw new Error('자기 자신은 차단할 수 없습니다');
  const { error } = await supabase.from('user_blocks')
    .upsert({ blocker_id: me.user.id, blocked_id: blockedId, blocked_name: name ?? null }, { onConflict: 'blocker_id,blocked_id' });
  if (error) throw new Error(error.message);
}

export async function unblockUser(blockedId: string): Promise<void> {
  if (IS_MOCK) return;
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return;
  const { error } = await supabase.from('user_blocks').delete()
    .eq('blocker_id', me.user.id).eq('blocked_id', blockedId);
  if (error) throw new Error(error.message);
}
