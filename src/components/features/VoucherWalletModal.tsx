// src/components/features/VoucherWalletModal.tsx
// 손님 매장이용권 지갑 — 헤더 🎟 버튼에서 열림. 매장마다 종류가 다르므로 매장별로 분리 표시 + 전송.
// 매장이용권은 금전적 가치가 없습니다(금액 표기 없음).
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { listMyVouchers, findUserForTransfer, transferVoucher, type Voucher, type TransferTarget } from '../../api/vouchers';

export default function VoucherWalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [list, setList] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = () => { setLoading(true); listMyVouchers().then(setList).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { if (open) reload(); }, [open]);

  const active = list.filter((v) => v.status === 'active');
  // 매장별 그룹
  const groups = new Map<string, Voucher[]>();
  for (const v of active) {
    const key = v.venueName ?? '기타 매장';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  const groupArr = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));

  return (
    <Modal open={open} onClose={onClose} title={`내 매장이용권 (${active.length})`} maxWidth="md" variant="sheet">
      <div className="space-y-3 p-4">
        {loading ? (
          <p className="py-8 text-center text-2xs text-ink-muted">불러오는 중…</p>
        ) : active.length === 0 ? (
          <p className="py-8 text-center text-2xs text-ink-muted">보유한 매장이용권이 없습니다.<br />매장 방문 시 업주가 발급해 드립니다.</p>
        ) : (
          groupArr.map(([venue, vs]) => (
            <section key={venue}>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-ink-primary">
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" />
                <span className="min-w-0 truncate">{venue}</span>
                <span className="shrink-0 text-2xs font-normal text-ink-muted">{vs.length}장</span>
              </p>
              <ul className="space-y-1.5">{vs.map((v) => <WalletCard key={v.id} v={v} onDone={reload} />)}</ul>
            </section>
          ))
        )}
        <p className="text-[10px] text-ink-muted">매장마다 발급한 이용권 종류가 다릅니다 · 금전적 가치 없음 · 다른 회원에게 전송 가능.</p>
      </div>
    </Modal>
  );
}

function WalletCard({ v, onDone }: { v: Voucher; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'view' | 'transfer'>('view');
  const [nick, setNick] = useState('');
  const [cands, setCands] = useState<TransferTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const search = async () => { if (!nick.trim()) return; setSearching(true); try { setCands(await findUserForTransfer(nick.trim())); } catch (e) { toast.show(e instanceof Error ? e.message : '조회 실패', 'error'); } setSearching(false); };
  const doTransfer = async (to: TransferTarget) => {
    if (!window.confirm(`'${v.title}'을(를) ${to.display}님께 전송할까요? 되돌릴 수 없습니다.`)) return;
    setSending(true);
    try { await transferVoucher(v.id, to.id); toast.show(`${to.display}님께 전송했습니다`, 'success'); onDone(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '전송 실패', 'error'); setSending(false); }
  };

  return (
    <li className="rounded-input border border-gold-400/40 bg-gold-300/[0.05] px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden>🎟</span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{v.title}</p>
        {mode === 'view' && <button type="button" onClick={() => setMode('transfer')} className="btn-ghost shrink-0 px-2 text-2xs text-gold-300">전송</button>}
      </div>
      {mode === 'transfer' && (
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
