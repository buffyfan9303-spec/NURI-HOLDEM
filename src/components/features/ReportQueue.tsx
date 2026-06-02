// src/components/features/ReportQueue.tsx — 관리자 신고 처리 큐
import { useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { getReports, updateReportStatus } from '../../api/reports';
import type { ReportEntry } from '../../api/reports';

const TYPE_LABEL: Record<string, string> = {
  post: '게시글', comment: '댓글', listing: '매물', live: '실시간', user: '회원',
};

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function ReportQueue() {
  const toast = useToast();
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getReports('open')
      .then((r) => { if (active) setReports(r); })
      .catch(() => { if (active) toast.show('신고 목록을 불러오지 못했습니다', 'error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (id: string, status: 'resolved' | 'dismissed', label: string) => {
    try {
      await updateReportStatus(id, status);
      setReports((p) => p.filter((r) => r.id !== id));
      toast.show(`신고 ${label}`, 'info');
    } catch { toast.show('처리에 실패했습니다', 'error'); }
  };

  if (loading) return <p className="py-8 text-center text-xs text-ink-muted">불러오는 중…</p>;
  if (reports.length === 0) return <p className="py-10 text-center text-xs text-ink-muted">접수된 신고가 없습니다</p>;

  return (
    <ul className="space-y-1.5">
      {reports.map((r) => (
        <li key={r.id} className="rounded-card border border-border-default bg-surface-low p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-danger/15 text-danger-light border border-danger/30 font-semibold">{TYPE_LABEL[r.targetType] ?? r.targetType}</span>
            <span className="text-xs font-semibold text-ink-primary">{r.reason}</span>
            <span className="text-2xs text-ink-muted ml-auto">{r.reporterName ?? '익명'} · {relativeTime(r.createdAt)}</span>
          </div>
          {r.targetSummary && <p className="text-2xs text-ink-muted line-clamp-2">대상: {r.targetSummary}</p>}
          <div className="flex gap-1.5 justify-end">
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
