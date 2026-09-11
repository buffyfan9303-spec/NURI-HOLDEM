// src/api/reports.ts — 신고(reports) API
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';

export type ReportTargetType = 'post' | 'comment' | 'listing' | 'live' | 'user';

export interface ReportInput {
  targetType: ReportTargetType;
  targetId?: string;
  targetOwnerId?: string;
  targetSummary?: string;
  reason: string;
  reporterName?: string;
}

export async function submitReport(input: ReportInput): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('reports').insert({
    reporter_id:     user.id,
    reporter_name:   input.reporterName ?? null,
    target_type:     input.targetType,
    target_id:       input.targetId ?? null,
    target_owner_id: input.targetOwnerId ?? null,
    target_summary:  input.targetSummary ?? null,
    reason:          input.reason,
  });
  if (error) throw error;
}

export interface ReportEntry {
  id: string; reporterName?: string; targetType: string; targetId?: string;
  targetOwnerId?: string; targetSummary?: string; reason: string; status: string; createdAt: string;
}

export async function getReports(scope: 'open' | 'all' = 'open'): Promise<ReportEntry[]> {
  if (IS_MOCK) return [];
  let q = supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100);
  if (scope === 'open') q = q.eq('status', 'open');
  const { data, error } = await q;
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, reporterName: r.reporter_name ?? undefined, targetType: r.target_type,
    targetId: r.target_id ?? undefined, targetOwnerId: r.target_owner_id ?? undefined,
    targetSummary: r.target_summary ?? undefined, reason: r.reason, status: r.status, createdAt: r.created_at,
  }));
}

export async function updateReportStatus(id: string, status: 'resolved' | 'dismissed'): Promise<void> {
  if (IS_MOCK) return;
  // PostgREST 는 RLS 가 막은 UPDATE 를 오류가 아니라 0행으로 돌려준다 — 반환 행으로 도달을 확인한다.
  const { data, error } = await supabase.from('reports').update({ status }).eq('id', id)
    .select('target_type, target_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('처리 권한이 없거나 이미 처리된 신고입니다');
  // 서로 다른 신고자 3명이면 trg_auto_blind_reported_post 가 글을 이미 숨겼다(baseline auto_blind_reported_post).
  // '기각'은 그 자동 블라인드까지 되돌려야 한다 — 안 그러면 무고 신고로 숨은 글이 영구히 숨은 채 남는다.
  const t = data[0] as { target_type: string; target_id: string | null };
  if (status === 'dismissed' && t.target_type === 'post' && t.target_id) {
    const { error: unblind } = await supabase.rpc('admin_set_post_blinded', { p_post_id: t.target_id, p_blinded: false });
    if (unblind) throw new Error('신고는 기각했지만 자동 블라인드 해제에 실패했습니다: ' + unblind.message);
  }
}
