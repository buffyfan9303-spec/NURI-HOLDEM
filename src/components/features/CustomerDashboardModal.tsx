// src/components/features/CustomerDashboardModal.tsx — 손님 대시보드: 자주 방문한 매장.
// (매장이용권은 헤더 🎟 버튼의 지갑에서 매장별로 확인)
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { myVisitedVenues, type VisitedVenue } from '../../api/vouchers';

export default function CustomerDashboardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [venues, setVenues] = useState<VisitedVenue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    myVisitedVenues().then(setVenues).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="내 대시보드" maxWidth="md" variant="sheet">
      <div className="space-y-3 p-4">
        <section>
          <p className="mb-1.5 text-2xs font-bold text-ink-secondary">자주 방문한 매장</p>
          {loading ? (
            <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
          ) : venues.length === 0 ? (
            <p className="py-6 text-center text-2xs text-ink-muted">예약·방문 기록이 아직 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {venues.slice(0, 10).map((v, i) => (
                <li key={v.venueId} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                  <span className={`w-5 shrink-0 text-center text-2xs font-bold tabular-nums ${i === 0 ? 'text-gold-300' : 'text-ink-muted'}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{v.venueName ?? '(매장)'}</span>
                  <span className="shrink-0 text-2xs text-ink-muted tabular-nums">방문 {v.visits}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-[10px] text-ink-muted">🎟 매장이용권은 상단 이용권 버튼에서 매장별로 확인·전송할 수 있습니다.</p>
      </div>
    </Modal>
  );
}
