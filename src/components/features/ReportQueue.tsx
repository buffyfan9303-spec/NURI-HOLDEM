// src/components/features/ReportQueue.tsx — 관리자 신고 처리 큐
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { getReports, updateReportStatus, reportedUserId } from '../../api/reports';
import type { ReportEntry } from '../../api/reports';
import { adminSetPostBlinded } from '../../api/community';
import type { User } from '../../api/auth';
import { relativeTime } from '../../lib/relativeTime';

const TYPE_LABEL: Record<string, string> = {
  post: '게시글', comment: '댓글', listing: '매물', live: '실시간', user: '회원',
};


// 점검 A-07(2026-10-01): 예전엔 '기각'·'처리 완료' 두 버튼뿐이라 신고를 봐도 **제재로 가는 길이 없었다**.
//   글 보기 · 글 블라인드 · 작성자 제재(회원 관리로 이동 + 검색어 주입)를 행에 둔다. 제재 자체는
//   회원 관리의 기존 제재 흐름(정지·영구 정지·강제 탈퇴 — 사유 입력·메일 안내)을 그대로 쓴다.
export default function ReportQueue({ users = [], onSanction }: { users?: User[]; onSanction?: (userId: string) => void }) {
  const toast = useToast();
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [blinded, setBlinded] = useState<Set<string>>(new Set());   // 이 화면에서 블라인드한 신고 id
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<unknown>(null);

  // 실패를 토스트로만 알리면 몇 초 뒤 화면이 '신고 0건'으로 굳는다 — 다른 관리자 패널과 같이
  // LoadErrorCard 로 '없음'과 '못 불러옴'을 가르고 재시도 수단을 남긴다.
  const load = useCallback(() => {
    setLoading(true);
    getReports('open')
      .then((r) => { setErr(null); setReports(r); })
      .catch((e) => setErr(e ?? new Error('신고 목록을 불러오지 못했습니다')))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, status: 'resolved' | 'dismissed', label: string) => {
    try {
      await updateReportStatus(id, status);
      setReports((p) => p.filter((r) => r.id !== id));
      toast.show(`신고 ${label}`, 'info');
    } catch (e) { toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error'); }
  };

  const blind = async (r: ReportEntry) => {
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

  const sanction = (r: ReportEntry) => {
    const uid = reportedUserId(r);
    if (!uid || !users.some((u) => u.id === uid)) {
      toast.show('신고 대상 작성자를 회원 목록에서 찾지 못했습니다. 회원 관리에서 직접 검색해 주세요', 'error');
      return;
    }
    onSanction?.(uid);
  };

  if (loading) return <p className="py-8 text-center text-xs text-ink-muted">불러오는 중…</p>;
  if (err != null) return <LoadErrorCard error={err} what="신고 목록" onRetry={load} />;
  if (reports.length === 0) return <p className="py-10 text-center text-xs text-ink-muted">접수된 신고가 없습니다</p>;

  return (
    <ul className="space-y-1.5">
      {reports.map((r) => (
        <li key={r.id} className="rounded-aura border card-aura p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-danger/15 text-danger-light border border-danger/30 font-semibold">{TYPE_LABEL[r.targetType] ?? r.targetType}</span>
            <span className="text-xs font-semibold text-ink-primary">{r.reason}</span>
            <span className="text-2xs text-ink-muted ml-auto">{r.reporterName ?? '익명'} · {relativeTime(r.createdAt)}</span>
          </div>
          {r.targetSummary && <p className="text-2xs text-ink-muted line-clamp-2">대상: {r.targetSummary}</p>}
          <div className="flex flex-wrap gap-1.5 justify-end">
            {r.targetType === 'post' && r.targetId && (
              <button type="button" onClick={() => window.open(`/?post=${encodeURIComponent(r.targetId!)}`, '_blank', 'noopener')}
                className="text-2xs font-semibold px-2.5 py-1 rounded-badge border bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary transition-colors">글 보기</button>
            )}
            {r.targetType === 'post' && r.targetId && (
              <button type="button" disabled={busy === r.id || blinded.has(r.id)} onClick={() => blind(r)}
                className="text-2xs font-semibold px-2.5 py-1 rounded-badge border bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25 transition-colors disabled:opacity-50">
                {blinded.has(r.id) ? '블라인드됨' : busy === r.id ? '처리 중…' : '블라인드'}
              </button>
            )}
            {onSanction && reportedUserId(r) && (
              <button type="button" onClick={() => sanction(r)}
                className="text-2xs font-semibold px-2.5 py-1 rounded-badge border bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25 transition-colors">작성자 제재</button>
            )}
            <button type="button" onClick={() => act(r.id, 'dismissed', '기각')}
              className="text-2xs font-semibold px-2.5 py-1 rounded-badge border bg-surface-high text-ink-muted border-border-default hover:text-ink-secondary transition-colors">기각</button>
            <button type="button" onClick={() => act(r.id, 'resolved', '처리 완료')}
              className="text-2xs font-semibold px-2.5 py-1 rounded-badge border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25 transition-colors">처리 완료</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
