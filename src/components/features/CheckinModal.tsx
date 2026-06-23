// src/components/features/CheckinModal.tsx — 업주/직원용: 체크인 QR 표시 + 오늘 체크인 명단(실시간).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { listVenueCheckins, subscribeCheckins, checkinUrl, type Checkin } from '../../api/checkins';

export default function CheckinModal({ open, onClose, venueId, venueName }: { open: boolean; onClose: () => void; venueId: string; venueName?: string }) {
  const toast = useToast();
  const [list, setList] = useState<Checkin[]>([]);
  const [qr, setQr] = useState(''); // #15 로컬 생성(외부 api.qrserver.com 의존 제거 — 가용성·프라이버시)
  useEffect(() => { QRCode.toDataURL(checkinUrl(venueId), { width: 240, margin: 2 }).then(setQr).catch(() => setQr('')); }, [venueId]);

  const reload = () => { const s = new Date(); s.setHours(0, 0, 0, 0); listVenueCheckins(venueId, s.toISOString()).then(setList).catch(() => {}); };
  useEffect(() => {
    if (!open) return;
    reload();
    return subscribeCheckins(venueId, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venueId]);

  const copy = async () => { try { await navigator.clipboard.writeText(checkinUrl(venueId)); toast.show('체크인 링크를 복사했습니다', 'success'); } catch { /* noop */ } };
  const fmt = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  return (
    <Modal open={open} onClose={onClose} title="예약·방문 체크" maxWidth="md" variant="sheet">
      <div className="space-y-3 p-4">
        <div className="flex flex-col items-center gap-2 rounded-card border border-border-subtle bg-surface-low p-4">
          {qr
            ? <img src={qr} alt="체크인 QR" width={200} height={200} className="rounded-lg bg-white p-2" />
            : <div className="h-[200px] w-[200px] animate-pulse rounded-lg bg-white/10" aria-label="QR 생성 중" />}
          <p className="text-center text-2xs text-ink-muted"><b className="text-gold-300">고정 QR</b> — 손님이 스캔하면 <b className="text-ink-secondary">{venueName ?? '우리 매장'}</b>에 방문 체크됩니다.<br />로그인 회원만 · 4시간 내 중복 방지. 손님이 매장이용권을 사용하면 방문이 자동 기록됩니다.</p>
          <button type="button" onClick={copy} className="btn-ghost px-3 text-2xs">체크인 링크 복사</button>
        </div>
        <div>
          <p className="mb-1 text-2xs font-bold text-ink-secondary">오늘 방문 {list.length}명</p>
          {list.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">아직 체크인한 손님이 없습니다.</p>
            : <ul className="space-y-1">{list.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-input border border-border-subtle bg-surface-low px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-primary">{c.displayName ?? '회원'}</span>
                <span className="shrink-0 text-2xs text-ink-muted tabular-nums">{fmt(c.createdAt)}</span>
              </li>
            ))}</ul>}
        </div>
      </div>
    </Modal>
  );
}
