// src/api/blocks.ts — 사용자 차단/숨기기.
// 차단하면 그 사용자의 글·댓글·매물이 내 화면에서 숨겨진다(클라 필터). 본인 차단목록만 RLS로 관리.
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import { dedupe } from '../lib/inflight';

export interface BlockedUser { blockedId: string; name: string; createdAt: string }

/** 내가 차단한 사용자 id 집합 — 피드/댓글 필터에 사용 */
export async function getMyBlockedIds(): Promise<Set<string>> {
  if (IS_MOCK) return new Set();
  // 키에 uid 를 넣는다(getMyProfile 'my-profile:'+uid 와 같은 모양) — 비행 중 로그아웃→다른 계정 로그인이 겹치면
  // 새 계정의 BlockContext 가 이전 계정의 프라미스를 받아 남의 차단 목록으로 글을 숨겼다. currentUser 는 로컬 세션 읽기라 왕복 0.
  const me = await currentUser();
  if (!me) return new Set();
  // BlockContext 가 부팅 중 user 참조 변화마다 재조회해 실측 ×4 로 나갔다(lib/inflight 주석 참조).
  return dedupe('blocked-ids:' + me.id, async () => {
    const { data, error } = await supabase.from('user_blocks').select('blocked_id');
    if (error) return new Set<string>();
    return new Set((data ?? []).map((r: { blocked_id: string }) => r.blocked_id));
  });
}

/** 차단 목록(이름 포함) — 관리 화면용 */
export async function listMyBlocks(): Promise<BlockedUser[]> {
  if (IS_MOCK) return [];
  const me = await currentUser();
  if (!me) return [];
  return dedupe('blocks-list:' + me.id, async () => {
    const { data, error } = await supabase.from('user_blocks')
      .select('blocked_id, blocked_name, created_at').order('created_at', { ascending: false });
    if (error) return [] as BlockedUser[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => ({ blockedId: r.blocked_id, name: r.blocked_name || '사용자', createdAt: r.created_at })) as BlockedUser[];
  });
}

/** 차단 — 닉네임을 함께 저장(목록 표시용, profiles 조인 불가) */
export async function blockUser(blockedId: string, name?: string): Promise<void> {
  if (IS_MOCK) return;
  const me = await currentUser();
  if (!me) throw new Error('로그인이 필요합니다');
  if (me.id === blockedId) throw new Error('자기 자신은 차단할 수 없습니다');
  const { error } = await supabase.from('user_blocks')
    .upsert({ blocker_id: me.id, blocked_id: blockedId, blocked_name: name ?? null }, { onConflict: 'blocker_id,blocked_id' });
  if (error) throw new Error(error.message);
}

export async function unblockUser(blockedId: string): Promise<void> {
  if (IS_MOCK) return;
  const me = await currentUser();
  if (!me) return;
  const { error } = await supabase.from('user_blocks').delete()
    .eq('blocker_id', me.id).eq('blocked_id', blockedId);
  if (error) throw new Error(error.message);
}
