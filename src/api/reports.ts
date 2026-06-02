// src/api/reports.ts — 신고(reports) API
import { supabase, IS_MOCK } from '../lib/supabase';

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
  const { data: { user } } = await supabase.auth.getUser();
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
  const { error } = await supabase.from('reports').update({ status }).eq('id', id);
  if (error) throw error;
}
