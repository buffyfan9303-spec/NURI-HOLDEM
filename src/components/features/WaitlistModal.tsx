// src/components/features/WaitlistModal.tsx — 웨이팅(대기) 손님 관리. 실시간 동기화.
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { getWaitlist, addWaiting, setWaitingStatus, removeWaiting, subscribeWaitlist, type WaitEntry } from '../../api/waitlist';

export default function WaitlistModal({ open, onClose, venueId }: { open: boolean; onClose: () => void; venueId: string }) {
  const toast = useToast();
  const [list, setList] = useState<WaitEntry[]>([]);
  const [name, setName] = useState('');
  const [party, setParty] = useState(1);
  const [phone, setPhone] = useState('');

  const reload = () => getWaitlist(venueId).then(setList).catch(() => {});
  useEffect(() => {
    if (!open) return;
    reload();
    return subscribeWaitlist(venueId, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venueId]);

  const add = async () => {
    if (!name.trim()) return toast.show('이름을 입력하세요', 'error');
    try { await addWaiting(venueId, { displayName: name, party, phone }); setName(''); setParty(1); setPhone(''); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '추가 실패', 'error'); }
  };
  const waiting = list.filter((w) => w.status === 'waiting');
  const called = list.filter((w) => w.status === 'called');

  return (
    <Modal open={open} onClose={onClose} title={`웨이팅 리스트 (${list.length})`} maxWidth="md" variant="sheet">
      <div className="space-y-3 p-4">
        <div className="flex gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className="input min-w-0 flex-1 text-sm" />
          <input type="number" inputMode="numeric" value={party || ''} onChange={(e) => setParty(parseInt(e.target.value, 10) || 1)} placeholder="인원" className="input w-16 shrink-0 text-sm tabular-nums" />
          <button type="button" onClick={add} className="btn-primary shrink-0 px-4 text-sm">추가</button>
        </div>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="연락처 (선택)" className="input w-full text-sm" />

        {list.length === 0 ? (
          <p className="py-6 text-center text-2xs text-ink-muted">대기 중인 손님이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {[...called, ...waiting].map((w, i) => (
              <li key={w.id} className={`flex items-center gap-1.5 rounded-input border px-3 py-2 ${w.status === 'called' ? 'border-gold-400/40 bg-gold-300/[0.06]' : 'border-border-subtle bg-surface-low'}`}>
                <span className="w-4 shrink-0 text-center text-2xs font-bold tabular-nums text-ink-muted">{w.status === 'called' ? '•' : i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-primary">{w.displayName} <span className="text-2xs text-ink-muted">{w.party}명{w.status === 'called' ? ' · 호출됨' : ''}</span></p>
                  {w.phone && <p className="truncate text-2xs text-ink-muted">{w.phone}</p>}
                </div>
                {w.status === 'waiting' && <button type="button" onClick={() => setWaitingStatus(w.id, 'called').then(reload)} className="btn-ghost shrink-0 px-2 text-2xs text-gold-300">호출</button>}
                <button type="button" onClick={() => setWaitingStatus(w.id, 'seated').then(reload)} className="btn-ghost shrink-0 px-2 text-2xs">착석</button>
                <button type="button" onClick={() => removeWaiting(w.id).then(reload)} aria-label="삭제" className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light">✕</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-ink-muted">호출 → 착석 처리 시 목록에서 사라집니다 · 실시간 동기화.</p>
      </div>
    </Modal>
  );
}
