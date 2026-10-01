// src/api/reports.ts — 신고(reports) API
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import { gateError } from './_gateError';

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
  if (error) throw gateError(error, '신고 접수에 실패했습니다');
}

export interface ReportEntry {
  id: string; reporterName?: string; targetType: string; targetId?: string;
  targetOwnerId?: string; targetSummary?: string; reason: string; status: string; createdAt: string;
}

/** 신고 대상의 작성자(제재 대상) id — 회원 신고는 대상 자체, 그 밖에는 저장된 작성자. 없으면 null. */
export function reportedUserId(r: Pick<ReportEntry, 'targetType' | 'targetId' | 'targetOwnerId'>): string | null {
  return (r.targetType === 'user' ? r.targetId : r.targetOwnerId) ?? null;
}

// ── 관리자 신고 처리 (오너 10-02: 신고는 기록만, 결정은 관리자) ─────────────────────────────
// 신고가 들어와도 글은 가려지지 않는다(20261002a 가 자동 가림 트리거를 지웠다). 관리자가 대기 목록에서
// 기각 · 처리 완료 · 글 삭제 · 유저 정지 중 하나를 고르면 서버 RPC admin_decide_report 한 번으로 신고를 닫는다.
// ⚠ 예전엔 reports 를 직접 update 하고 기각이면 admin_set_post_blinded(false) 를 무조건 불러 관리자가 직접 가린 글까지
//   풀었다(점검 L-02). 신고 표 직접 쓰기·가림 해제 호출을 다시 들이지 마라 — reportDecide.contract.test.ts 가 막는다.

export type ReportDecision = 'dismiss' | 'resolve' | 'delete' | 'suspend';

export interface DecideOptions {
  /** 같은 대상의 다른 미처리 신고도 함께 닫는다(기본 true) */
  includeSameTarget?: boolean;
  /** suspend 일 때 글/댓글도 삭제 */
  deleteContent?: boolean;
  /** suspend: 정지 일수. null = 영구 정지 */
  suspendDays?: number | null;
  /** suspend: 정지 사유(필수) */
  reason?: string;
}

export interface DecideResult {
  closed: number;
  deleted: boolean;
  /** suspend 일 때 제재 안내 메일 결과: true=발송 · false=실패 · null=대상 아님 */
  mailSent: boolean | null;
}

export async function decideReport(id: string, action: ReportDecision, opts: DecideOptions = {}): Promise<DecideResult> {
  if (IS_MOCK) return { closed: 1, deleted: action === 'delete', mailSent: null };
  const { data, error } = await supabase.rpc('admin_decide_report', {
    p_report_id: id,
    p_action: action,
    p_include_same_target: opts.includeSameTarget ?? true,
    p_delete_content: opts.deleteContent ?? false,
    p_suspend_days: action === 'suspend' ? (opts.suspendDays ?? null) : null,
    p_reason: action === 'suspend' ? (opts.reason ?? null) : null,
  });
  if (error) throw gateError(error, '신고 처리에 실패했습니다');
  const j = (data ?? {}) as { closed?: number; deleted?: boolean; suspended_user?: string | null };
  let mailSent: boolean | null = null;
  // 회원 관리의 제재와 같은 안내 메일(notify-sanction). 메일 실패는 처리 실패가 아니다 — 결과만 돌려준다.
  if (action === 'suspend' && j.suspended_user) {
    try {
      const { data: m } = await supabase.functions.invoke('notify-sanction', {
        body: {
          userId: j.suspended_user,
          status: opts.suspendDays == null ? 'banned' : 'suspended',
          reason: opts.reason ?? '',
          suspendedUntil: opts.suspendDays == null ? null
            : new Date(Date.now() + opts.suspendDays * 86_400_000).toISOString(),
        },
      });
      mailSent = (m as { sent?: boolean } | null)?.sent === true;
    } catch { mailSent = false; }
  }
  return { closed: j.closed ?? 0, deleted: !!j.deleted, mailSent };
}

/** 대기 목록 한 줄 — 신고 + 원문 + 같은 대상 신고 수 + 작성자 이력 */
export interface ReportQueueItem extends ReportEntry {
  /** 같은 대상의 미처리 신고 수(이 신고 포함) */
  sameTargetOpen: number;
  /** 대상 원문(게시글 제목·본문 / 댓글 본문). 대상을 못 찾으면 undefined */
  targetText?: string;
  /** 대상 행을 찾지 못함(이미 삭제됨) — 게시글·댓글 신고에서만 의미가 있다 */
  targetMissing: boolean;
  /** 이 작성자가 받은 신고 수(최근 500건 안) · 그중 조치(처리 완료)된 수 */
  authorReports: number;
  authorResolved: number;
}

/** 관리자 대기 목록. 신고는 최근 500건을 한 번에 읽어 미처리분과 작성자 이력을 함께 만든다. */
export async function getReportQueue(): Promise<ReportQueueItem[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('reports')
    .select('id, reporter_name, target_type, target_id, target_owner_id, target_summary, reason, status, created_at')
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: ReportEntry[] = (data ?? []).map((r: any) => ({
    id: r.id, reporterName: r.reporter_name ?? undefined, targetType: r.target_type,
    targetId: r.target_id ?? undefined, targetOwnerId: r.target_owner_id ?? undefined,
    targetSummary: r.target_summary ?? undefined, reason: r.reason, status: r.status, createdAt: r.created_at,
  }));
  const open = all.filter((r) => r.status === 'open');
  const ids = (t: string) => [...new Set(open.filter((r) => r.targetType === t && r.targetId).map((r) => r.targetId!))];
  const postIds = ids('post');
  const commentIds = ids('comment');
  const [posts, comments] = await Promise.all([
    postIds.length ? supabase.from('community_posts').select('id, title, content').in('id', postIds) : Promise.resolve({ data: [], error: null }),
    commentIds.length ? supabase.from('comments').select('id, content').in('id', commentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (posts.error) throw posts.error;
  if (comments.error) throw comments.error;
  const text = new Map<string, string>();
  for (const p of (posts.data ?? []) as { id: string; title?: string | null; content?: string | null }[]) {
    text.set(`post:${p.id}`, [p.title, p.content].filter(Boolean).join('\n'));
  }
  for (const c of (comments.data ?? []) as { id: string; content?: string | null }[]) text.set(`comment:${c.id}`, c.content ?? '');
  return open.map((r) => {
    const key = `${r.targetType}:${r.targetId}`;
    const author = reportedUserId(r);
    const against = author ? all.filter((x) => reportedUserId(x) === author) : [];
    return {
      ...r,
      sameTargetOpen: r.targetId ? open.filter((x) => x.targetType === r.targetType && x.targetId === r.targetId).length : 1,
      targetText: text.get(key),
      targetMissing: (r.targetType === 'post' || r.targetType === 'comment') && !!r.targetId && !text.has(key),
      authorReports: against.length,
      authorResolved: against.filter((x) => x.status === 'resolved').length,
    };
  });
}
