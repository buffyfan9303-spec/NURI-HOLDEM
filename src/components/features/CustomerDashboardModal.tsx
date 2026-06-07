// src/components/features/CustomerDashboardModal.tsx — 손님 대시보드: 자주 간 매장 + 내 매장이용권 지갑(전송).
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { listMyVouchers, myVisitedVenues, findUserForTransfer, transferVoucher, type Voucher, type VisitedVenue, type TransferTarget } from '../../api/vouchers';
import { wonToMan } from '../../api/ledger';

export default function CustomerDashboardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [venues, setVenues] = useState<VisitedVenue[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([listMyVouchers(), myVisitedVenues()])
      .then(([v, ve]) => { setVouchers(v); setVenues(ve); })
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { if (open) reload(); /* eslint-disable-next-line */ }, [open]);

  const active = vouchers.filter((v) => v.status === 'active');
  const totalVal = active.reduce((a, v) => a + v.amount, 0);

  return (
    <Modal open={open} onClose={onClose} title="내 대시보드" maxWidth="md" variant="sheet">
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.06] p-3 text-center">
            <p className="text-2xl font-extrabold text-gold-300 tabular-nums">{active.length}</p>
            <p className="text-2xs text-ink-muted">보유 매장이용권</p>
          </div>
          <div className="rounded-card border border-border-subtle bg-surface-low p-3 text-center">
            <p className="text-2xl font-extrabold text-ink-primary tabular-nums">{totalVal > 0 ? wonToMan(totalVal) : '-'}<span className="text-sm">{totalVal > 0 ? '만' : ''}</span></p>
            <p className="text-2xs text-ink-muted">총 가치</p>
          </div>
        </div>

        <section>
          <p className="mb-1.5 text-2xs font-bold text-ink-secondary">자주 방문한 매장</p>
          {loading ? <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
            : venues.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">예약·방문 기록이 아직 없습니다.</p>
              : <ul className="space-y-1">{venues.slice(0, 6).map((v, i) => (
                <li key={v.venueId} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                  <span className={`w-5 shrink-0 text-center text-2xs font-bold tabular-nums ${i === 0 ? 'text-gold-300' : 'text-ink-muted'}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{v.venueName ?? '(매장)'}</span>
                  <span className="shrink-0 text-2xs text-ink-muted tabular-nums">방문 {v.visits}</span>
                </li>
              ))}</ul>}
        </section>

        <section>
          <p className="mb-1.5 text-2xs font-bold text-ink-secondary">내 매장이용권</p>
          {loading ? <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
            : vouchers.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">보유한 매장이용권이 없습니다.</p>
              : <ul className="space-y-1.5">{vouchers.map((v) => <VoucherCard key={v.id} v={v} onDone={reload} />)}</ul>}
          <p className="mt-1.5 text-[10px] text-ink-muted">매장이용권은 업주가 발급합니다. 보유분은 다른 회원에게 전송할 수 있습니다.</p>
        </section>
      </div>
    </Modal>
  );
}

function VoucherCard({ v, onDone }: { v: Voucher; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'view' | 'transfer'>('view');
  const [nick, setNick] = useState('');
  const [cands, setCands] = useState<TransferTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const isActive = v.status === 'active';

  const search = async () => {
    if (!nick.trim()) return;
    setSearching(true);
    try { setCands(await findUserForTransfer(nick.trim())); }
    catch (e) { toast.show(e instanceof Error ? e.message : '조회 실패', 'error'); }
    setSearching(false);
  };
  const doTransfer = async (to: TransferTarget) => {
    if (!window.confirm(`'${v.title}'을(를) ${to.display}님께 전송할까요? 되돌릴 수 없습니다.`)) return;
    setSending(true);
    try { await transferVoucher(v.id, to.id); toast.show(`${to.display}님께 전송했습니다`, 'success'); onDone(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '전송 실패', 'error'); setSending(false); }
  };

  const stLabel = v.status === 'active' ? '사용 가능' : v.status === 'used' ? '사용완료' : v.status === 'revoked' ? '취소됨' : '만료';
  return (
    <li className={`rounded-input border px-3 py-2 ${isActive ? 'border-gold-400/40 bg-gold-300/[0.05]' : 'border-border-subtle bg-surface-low opacity-70'}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-primary">{v.title}{v.amount > 0 && <span className="ml-1.5 text-2xs text-gold-300">{wonToMan(v.amount)}만</span>}</p>
          <p className="truncate text-[10px] text-ink-muted">{v.venueName ?? '매장'} 발급 · {stLabel}{v.status === 'used' && v.usedVenueName ? ` (${v.usedVenueName})` : ''}</p>
        </div>
        {isActive && mode === 'view' && <button type="button" onClick={() => setMode('transfer')} className="btn-ghost shrink-0 px-2 text-2xs text-gold-300">전송</button>}
      </div>
      {isActive && mode === 'transfer' && (
        <div className="mt-2 space-y-1.5 border-t border-border-subtle pt-2">
          <div className="flex gap-1.5">
            <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="받는 회원 닉네임" className="input min-w-0 flex-1 text-sm" />
            <button type="button" onClick={search} disabled={searching} className="btn-ghost shrink-0 px-2 text-2xs">조회</button>
            <button type="button" onClick={() => { setMode('view'); setCands([]); setNick(''); }} className="btn-ghost shrink-0 px-2 text-2xs text-ink-muted">취소</button>
          </div>
          {cands.map((c) => (
            <button key={c.id} type="button" disabled={sending} onClick={() => doTransfer(c)} className="flex w-full items-center justify-between rounded bg-surface-high px-2 py-1.5 text-left disabled:opacity-50">
              <span className="text-sm text-ink-primary">{c.display}</span>
              <span className="text-2xs font-bold text-gold-300">이 회원에게 전송 →</span>
            </button>
          ))}
          {!searching && nick.trim() !== '' && cands.length === 0 && <p className="text-[10px] text-ink-muted">정확한 닉네임으로 조회하세요.</p>}
        </div>
      )}
    </li>
  );
}
