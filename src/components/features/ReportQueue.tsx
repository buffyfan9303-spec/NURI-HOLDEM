// src/components/features/ReportQueue.tsx — 관리자 신고 처리 큐
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { getReportQueue, decideReport, reportedUserId } from '../../api/reports';
import type { ReportQueueItem, ReportDecision, DecideOptions } from '../../api/reports';
import { adminSetPostBlinded } from '../../api/community';
import type { User } from '../../api/auth';
import { relativeTime } from '../../lib/relativeTime';

const TYPE_LABEL: Record<string, string> = {
  post: '게시글', comment: '댓글', listing: '매물', live: '실시간', user: '회원',
};
const STATUS_LABEL: Record<string, string> = {
  active: '정상', suspended: '정지 중', banned: '영구 정지', pending: '승인 대기', withdrawn: '탈퇴',
};
const SUSPEND_DAYS: { label: string; days: number | null }[] = [
  { label: '1일', days: 1 }, { label: '7일', days: 7 }, { label: '30일', days: 30 }, { label: '영구', days: null },
];
const BTN = 'text-2xs font-semibold px-2.5 py-1 rounded-badge border transition-colors disabled:opacity-50';

// 오너 10-02: 신고가 들어와도 글은 그대로 둔다. 관리자가 여기서 원문·사유·신고 수·작성자 이력을 보고
//   기각 · 글 삭제 · 유저 정지(+글 삭제 선택) 중에서 정한다. 결정은 서버 RPC admin_decide_report 한 번이다.
// 점검 A-07(2026-10-01)의 글 보기 · 블라인드(관리자 직접 가림) · 작성자 제재(회원 관리로 이동)는 그대로 둔다.
export default function ReportQueue({ users = [], onSanction }: { users?: User[]; onSanction?: (userId: string) => void }) {
  const toast = useToast();
  const [reports, setReports] = useState<ReportQueueItem[]>([]);
  const [blinded, setBlinded] = useState<Set<string>>(new Set());   // 이 화면에서 블라인드한 신고 id
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<unknown>(null);
  const [together, setTogether] = useState<Record<string, boolean>>({});   // 같은 대상 함께 처리(기본 켬)
  const [suspendOpen, setSuspendOpen] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(7);
  const [reason, setReason] = useState('');
  const [alsoDelete, setAlsoDelete] = useState(false);

  // 실패를 토스트로만 알리면 몇 초 뒤 화면이 '신고 0건'으로 굳는다 — 다른 관리자 패널과 같이
  // LoadErrorCard 로 '없음'과 '못 불러옴'을 가르고 재시도 수단을 남긴다.
  const load = useCallback(() => {
    setLoading(true);
    getReportQueue()
      .then((r) => { setErr(null); setReports(r); })
      .catch((e) => setErr(e ?? new Error('신고 목록을 불러오지 못했습니다')))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (r: ReportQueueItem, action: ReportDecision, confirmText: string | null, opts: DecideOptions = {}) => {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(r.id);
    try {
      const res = await decideReport(r.id, action, { includeSameTarget: together[r.id] ?? true, ...opts });
      const n = res.closed > 1 ? ` (신고 ${res.closed}건)` : '';
      const mail = action !== 'suspend' ? '' : res.mailSent ? ' · 안내 메일 발송' : ' · 안내 메일은 보내지 못했습니다';
      const done = action === 'dismiss' ? '기각했습니다' : action === 'resolve' ? '처리 완료했습니다'
        : action === 'delete' ? '삭제했습니다' : '정지했습니다';
      toast.show(`신고를 ${done}${n}${mail}`, action === 'dismiss' || action === 'resolve' ? 'info' : 'success');
      setSuspendOpen(null);
      load();   // 같은 대상의 다른 신고도 닫혔을 수 있다 — 서버에서 다시 읽는다
    } catch (e) { toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error'); }
    finally { setBusy(null); }
  };

  const blind = async (r: ReportQueueItem) => {
    if (!r.targetId || busy) return;
    if (!window.confirm('이 글을 블라인드(숨김) 처리합니다. 노출 관리 > 게시글에서 다시 풀 수 있습니다. 진행할까요?')) return;
    setBusy(r.id);
    try {
      await adminSetPostBlinded(r.targetId, true);
      setBlinded((s) => new Set(s).add(r.id));
      toast.show('글을 블라인드했습니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '블라인드에 실패했습니다', 'error'); }
    finally { setBusy(null); }
  };

  const sanction = (r: ReportQueueItem) => {
    const uid = reportedUserId(r);
    if (!uid || !users.some((u) => u.id === uid)) {
      toast.show('신고 대상 작성자를 회원 목록에서 찾지 못했습니다. 회원 관리에서 직접 검색해 주세요', 'error');
      return;
    }
    onSanction?.(uid);
  };

  const openSuspend = (id: string) => {
    setSuspendOpen((cur) => (cur === id ? null : id));
    setDays(7); setReason(''); setAlsoDelete(false);
  };

  if (loading) return <p className="py-8 text-center text-xs text-ink-muted">불러오는 중…</p>;
  if (err != null) return <LoadErrorCard error={err} what="신고 목록" onRetry={load} />;
  if (reports.length === 0) return <p className="py-10 text-center text-xs text-ink-muted">접수된 신고가 없습니다</p>;

  return (
    <ul className="space-y-1.5" data-testid="report-queue">
      {reports.map((r) => {
        const author = reportedUserId(r);
        const au = author ? users.find((u) => u.id === author) : undefined;
        const deletable = (r.targetType === 'post' || r.targetType === 'comment') && !!r.targetId && !r.targetMissing;
        const what = r.targetType === 'comment' ? '댓글' : '글';
        const isBusy = busy === r.id;
        return (
          <li key={r.id} className="rounded-aura border card-aura p-2.5 space-y-2" data-testid="report-row">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-danger/15 text-danger-light border border-danger/30 font-semibold">{TYPE_LABEL[r.targetType] ?? r.targetType}</span>
              <span className="text-xs font-semibold text-ink-primary">{r.reason}</span>
              {r.sameTargetOpen > 1 && (
                <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-surface-high border border-border-default text-ink-secondary font-semibold">같은 대상 신고 {r.sameTargetOpen}건</span>
              )}
              <span className="text-2xs text-ink-muted ml-auto">{r.reporterName ?? '익명'} · {relativeTime(r.createdAt)}</span>
            </div>

            {r.targetText != null ? (
              <p className="text-xs text-ink-secondary whitespace-pre-line line-clamp-4 rounded-input bg-surface-high px-2 py-1.5" data-testid="report-target-text">{r.targetText || '(빈 본문)'}</p>
            ) : r.targetMissing ? (
              <p className="text-2xs text-ink-muted">원문을 찾지 못했습니다(이미 삭제됐을 수 있음)</p>
            ) : null}
            {r.targetSummary && <p className="text-2xs text-ink-muted line-clamp-2">대상: {r.targetSummary}</p>}
            {author && (
              <p className="text-2xs text-ink-muted" data-testid="report-author-history">
                작성자 {au ? (au.nickname ?? au.name) : '알 수 없음'}
                {au && <> · {STATUS_LABEL[au.status ?? 'active'] ?? au.status}</>}
                {' '}· 받은 신고 {r.authorReports}건(조치 {r.authorResolved}건)
                {au?.sanctionReason && <> · 이전 제재 사유: {au.sanctionReason}</>}
              </p>
            )}

            {r.sameTargetOpen > 1 && (
              <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">
                <input type="checkbox" checked={together[r.id] ?? true}
                  onChange={(e) => setTogether((m) => ({ ...m, [r.id]: e.target.checked }))} />
                같은 대상의 미처리 신고 {r.sameTargetOpen}건을 함께 처리
              </label>
            )}

            <div className="flex flex-wrap gap-1.5 justify-end">
              {r.targetType === 'post' && r.targetId && (
                <button type="button" onClick={() => window.open(`/?post=${encodeURIComponent(r.targetId!)}`, '_blank', 'noopener')}
                  className={`${BTN} bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary`}>글 보기</button>
              )}
              {r.targetType === 'post' && r.targetId && (
                <button type="button" disabled={isBusy || blinded.has(r.id)} onClick={() => blind(r)}
                  className={`${BTN} bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25`}>
                  {blinded.has(r.id) ? '블라인드됨' : '블라인드'}
                </button>
              )}
              {onSanction && author && (
                <button type="button" onClick={() => sanction(r)}
                  className={`${BTN} bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25`}>작성자 제재</button>
              )}
              <button type="button" data-testid="report-dismiss" disabled={isBusy} onClick={() => decide(r, 'dismiss', null)}
                className={`${BTN} bg-surface-high text-ink-muted border-border-default hover:text-ink-secondary`}>기각</button>
              {deletable && (
                <button type="button" data-testid="report-delete" disabled={isBusy}
                  onClick={() => decide(r, 'delete', `이 ${what}을(를) 삭제합니다. 되돌릴 수 없습니다. 진행할까요?`)}
                  className={`${BTN} bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25`}>{what} 삭제</button>
              )}
              {author && (
                <button type="button" data-testid="report-suspend-open" disabled={isBusy} aria-expanded={suspendOpen === r.id}
                  onClick={() => openSuspend(r.id)}
                  className={`${BTN} bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25`}>유저 정지</button>
              )}
              <button type="button" data-testid="report-resolve" disabled={isBusy} onClick={() => decide(r, 'resolve', null)}
                className={`${BTN} bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25`}>처리 완료</button>
            </div>

            {suspendOpen === r.id && author && (
              <div className="rounded-input border border-danger/30 bg-danger/5 p-2 space-y-2" data-testid="report-suspend-panel">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-2xs font-semibold text-ink-secondary">정지 기간</span>
                  {SUSPEND_DAYS.map((d) => (
                    <button key={d.label} type="button" aria-pressed={days === d.days} onClick={() => setDays(d.days)}
                      className={`${BTN} ${days === d.days ? 'bg-danger/25 text-danger-light border-danger/50' : 'bg-surface-high text-ink-muted border-border-default'}`}>{d.label}</button>
                  ))}
                </div>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                  placeholder="정지 사유(작성자에게 안내됩니다)" aria-label="정지 사유" className="input text-xs" />
                {deletable && (
                  <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">
                    <input type="checkbox" checked={alsoDelete} onChange={(e) => setAlsoDelete(e.target.checked)} />
                    이 {what}도 삭제
                  </label>
                )}
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setSuspendOpen(null)}
                    className={`${BTN} bg-surface-high text-ink-muted border-border-default`}>취소</button>
                  <button type="button" data-testid="report-suspend-run" disabled={isBusy || !reason.trim()}
                    onClick={() => decide(r, 'suspend',
                      `작성자를 ${days == null ? '영구 정지' : `${days}일 정지`}합니다${alsoDelete && deletable ? ` (${what} 삭제 포함, 되돌릴 수 없음)` : ''}. 진행할까요?`,
                      { suspendDays: days, reason: reason.trim(), deleteContent: alsoDelete && deletable })}
                    className={`${BTN} bg-danger/25 text-danger-light border-danger/50 hover:bg-danger/35`}>정지 실행</button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
