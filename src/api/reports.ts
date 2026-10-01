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

/**
 * 신고 대상의 작성자(제재 대상) id — 회원 신고는 대상 자체, 그 밖에는 **원문 행의 작성자**(sourceOwner)가 이긴다.
 * 원문을 못 읽었을 때만 저장된 target_owner_id 로 내려간다 — 이 칸은 20261002a 트리거가 서버에서 원문으로 채운다
 * (예전엔 신고자가 적은 값이라 아무 회원이나 '작성자'로 지목할 수 있었다 — 검토 T11). 없으면 null.
 */
export function reportedUserId(r: Pick<ReportEntry, 'targetType' | 'targetId' | 'targetOwnerId'>, sourceOwner?: string | null): string | null {
  return (r.targetType === 'user' ? r.targetId : (sourceOwner ?? r.targetOwnerId)) ?? null;
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
  const j = (data ?? {}) as { closed?: number; deleted?: boolean; suspended_user?: string | null; suspended_until?: string | null };
  let mailSent: boolean | null = null;
  // 회원 관리의 제재와 같은 안내 메일(notify-sanction). 메일 실패는 처리 실패가 아니다 — 결과만 돌려준다.
  if (action === 'suspend' && j.suspended_user) {
    try {
      const { data: m } = await supabase.functions.invoke('notify-sanction', {
        body: {
          userId: j.suspended_user,
          status: opts.suspendDays == null ? 'banned' : 'suspended',
          reason: opts.reason ?? '',
          // 서버가 정한 만료일 — 이미 더 긴 기간 정지가 있으면 그 날짜가 남는다(20261002a 개정 b)
          suspendedUntil: opts.suspendDays == null ? null : (j.suspended_until ?? null),
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
  /** 대상 행을 찾지 못함(이미 삭제됨) — 게시글·댓글·매물 신고에서만 의미가 있다 */
  targetMissing: boolean;
  /** 제재 대상 작성자 — 원문 행의 작성자(회원 신고는 대상 id). 원문을 못 읽으면 서버가 채운 target_owner_id */
  authorId?: string;
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
  const listingIds = ids('listing');
  const none = Promise.resolve({ data: [], error: null });
  // 원문과 **원문의 작성자**를 함께 읽는다 — 제재 대상은 신고 행의 칸이 아니라 원문에서 정한다(검토 T11).
  const [posts, comments, listings] = await Promise.all([
    postIds.length ? supabase.from('community_posts').select('id, user_id, title, content').in('id', postIds) : none,
    commentIds.length ? supabase.from('comments').select('id, user_id, content').in('id', commentIds) : none,
    listingIds.length ? supabase.from('marketplace_listings').select('id, seller_id, title').in('id', listingIds) : none,
  ]);
  if (posts.error) throw posts.error;
  if (comments.error) throw comments.error;
  if (listings.error) throw listings.error;
  const text = new Map<string, string>();
  const owner = new Map<string, string>();
  for (const p of (posts.data ?? []) as { id: string; user_id?: string | null; title?: string | null; content?: string | null }[]) {
    text.set(`post:${p.id}`, [p.title, p.content].filter(Boolean).join('\n'));
    if (p.user_id) owner.set(`post:${p.id}`, p.user_id);
  }
  for (const c of (comments.data ?? []) as { id: string; user_id?: string | null; content?: string | null }[]) {
    text.set(`comment:${c.id}`, c.content ?? '');
    if (c.user_id) owner.set(`comment:${c.id}`, c.user_id);
  }
  for (const l of (listings.data ?? []) as { id: string; seller_id?: string | null; title?: string | null }[]) {
    text.set(`listing:${l.id}`, l.title ?? '');
    if (l.seller_id) owner.set(`listing:${l.id}`, l.seller_id);
  }
  const keyOf = (x: ReportEntry) => `${x.targetType}:${x.targetId}`;
  const authorOf = (x: ReportEntry) => reportedUserId(x, owner.get(keyOf(x)));
  return open.map((r) => {
    const key = keyOf(r);
    const author = authorOf(r);
    const against = author ? all.filter((x) => authorOf(x) === author) : [];
    return {
      ...r,
      authorId: author ?? undefined,
      sameTargetOpen: r.targetId ? open.filter((x) => x.targetType === r.targetType && x.targetId === r.targetId).length : 1,
      targetText: text.get(key),
      targetMissing: (r.targetType === 'post' || r.targetType === 'comment' || r.targetType === 'listing') && !!r.targetId && !text.has(key),
      authorReports: against.length,
      authorResolved: against.filter((x) => x.status === 'resolved').length,
    };
  });
}
