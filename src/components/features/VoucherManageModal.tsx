// src/components/features/VoucherManageModal.tsx
// 매장이용권 관리 — 업주: 배포/회수/삭제, 인증직원: 사용 처리. 금전적 가치(금액) 없음.
// VoucherManagePanel(인라인, 매장관리 메뉴) + VoucherManageModal(대시보드 카드용 모달).
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';
import { listVenueVouchers, issueVoucher, redeemVoucher, revokeVoucher, deleteVoucher, findUserForTransfer, voucherUsageByVenue, voucherHolderStats, type Voucher, type VoucherUsage, type VoucherHolderStats } from '../../api/vouchers';

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: '배포됨', cls: 'bg-gold-300/15 text-gold-300' },
  used: { label: '사용완료', cls: 'bg-surface-float text-ink-muted' },
  revoked: { label: '회수됨', cls: 'bg-danger/15 text-danger-light' },
  expired: { label: '만료', cls: 'bg-surface-float text-ink-muted' },
};

export function VoucherManagePanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const { user } = useAuth();
  const canIssue = user?.role === 'admin' || (user?.role === 'venue_owner' && user?.venueId === venueId);

  const [list, setList] = useState<Voucher[]>([]);
  const [usage, setUsage] = useState<VoucherUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('매장이용권');
  const [nick, setNick] = useState('');
  const [recvName, setRecvName] = useState('');
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<VoucherHolderStats | null>(null);
  const [qr, setQr] = useState('');

  const reload = () => {
    setLoading(true);
    listVenueVouchers(venueId).then(setList).catch(() => {}).finally(() => setLoading(false));
    voucherHolderStats(venueId).then(setStats).catch(() => {});
    if (canIssue) voucherUsageByVenue(venueId).then(setUsage).catch(() => {});
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [venueId]);
  useEffect(() => { QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 240, margin: 1 }).then(setQr).catch(() => {}); }, [venueId]);

  const issue = async () => {
    setBusy(true);
    try {
      let holderUserId: string | undefined;
      let holderName: string | undefined = recvName.trim() || undefined;
      if (nick.trim()) {
        const found = await findUserForTransfer(nick.trim());
        if (!found.length) { toast.show('해당 닉네임의 회원을 찾을 수 없습니다', 'error'); setBusy(false); return; }
        holderUserId = found[0].id; holderName = found[0].display;
      }
      await issueVoucher(venueId, { title, holderName, holderUserId });
      toast.show('매장이용권을 배포했습니다', 'success');
      setTitle('매장이용권'); setNick(''); setRecvName('');
      reload();
    } catch (e) { toast.show(e instanceof Error ? e.message : '배포 실패', 'error'); }
    setBusy(false);
  };
  const redeem = async (id: string) => { try { await redeemVoucher(id, venueId); toast.show('사용 처리 완료', 'success'); reload(); } catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); } };
  const revoke = async (id: string) => { if (!window.confirm('이 이용권을 회수(무효화)할까요?')) return; try { await revokeVoucher(id); toast.show('회수했습니다', 'info'); reload(); } catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); } };
  const del = async (id: string) => { if (!window.confirm('이 이용권을 완전히 삭제할까요? 되돌릴 수 없습니다.')) return; try { await deleteVoucher(id); toast.show('삭제했습니다', 'info'); reload(); } catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); } };

  const active = list.filter((v) => v.status === 'active');
  const others = list.filter((v) => v.status !== 'active');

  return (
    <div className="space-y-3">
      {canIssue ? (
        <div className="space-y-1.5 rounded-input border border-gold-400/30 bg-gold-300/[0.05] p-2.5">
          <p className="text-2xs font-bold text-gold-300">매장이용권 배포 <span className="font-normal text-ink-muted">· 업주 전용</span></p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이용권 이름 (예: 데일리 1회 참가권)" className="input w-full text-sm" />
          <div className="flex gap-1.5">
            <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="받는 회원 닉네임(연결, 선택)" className="input min-w-0 flex-1 text-sm" />
            <input value={recvName} onChange={(e) => setRecvName(e.target.value)} placeholder="이름만 기록(선택)" className="input w-32 shrink-0 text-sm" />
          </div>
          <button type="button" disabled={busy} onClick={issue} className="btn-primary w-full text-sm disabled:opacity-50">{busy ? '배포 중…' : '+ 배포'}</button>
          <p className="text-[10px] text-ink-muted">닉네임 입력 시 그 회원 지갑으로 전송. 비우면 매장 내 사용용으로 기록. <b className="text-ink-secondary">매장이용권은 금전적 가치가 없습니다.</b></p>
        </div>
      ) : (
        <p className="rounded-input border border-border-subtle bg-surface-low p-2.5 text-2xs text-ink-muted">배포·회수·삭제는 <b className="text-ink-secondary">업주</b>만 가능합니다. 인증 직원은 열람·사용 처리만 할 수 있습니다.</p>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-input border border-border-subtle bg-surface-low p-2 text-center"><p className="text-lg font-extrabold tabular-nums text-gold-300">{stats.holderCount}</p><p className="text-[10px] text-ink-muted">보유 회원</p></div>
          <div className="rounded-input border border-border-subtle bg-surface-low p-2 text-center"><p className="text-lg font-extrabold tabular-nums text-ink-primary">{stats.activeCount}</p><p className="text-[10px] text-ink-muted">활성 이용권</p></div>
          <div className="rounded-input border border-border-subtle bg-surface-low p-2 text-center"><p className="text-lg font-extrabold tabular-nums text-ink-secondary">{stats.usedCount}</p><p className="text-[10px] text-ink-muted">사용 완료</p></div>
        </div>
      )}
      {canIssue && qr && (
        <div className="flex flex-col items-center gap-1.5 rounded-input border border-gold-400/30 bg-gold-300/[0.05] p-3">
          <p className="text-2xs font-bold text-gold-300">매장 이용권 QR — 손님이 스캔해 사용</p>
          <img src={qr} alt="매장 이용권 QR" width={160} height={160} className="rounded bg-white p-1.5" />
          <p className="text-center text-[10px] text-ink-muted">손님: 대시보드 → 이용권 → 사용하기 → ‘매장 QR 스캔’</p>
        </div>
      )}

      {canIssue && usage.length > 0 && (
        <div className="rounded-input border border-border-subtle bg-surface-low p-2.5">
          <p className="mb-1 text-2xs font-bold text-ink-secondary">사용처 TOP — 배포분이 실제 사용된 매장</p>
          <ul className="space-y-1">
            {usage.slice(0, 6).map((u, i) => (
              <li key={u.usedVenueId ?? i} className="flex items-center justify-between text-2xs">
                <span className="min-w-0 flex-1 truncate text-ink-secondary">{i + 1}. {u.venueName ?? '(알수없음)'}{u.usedVenueId && u.usedVenueId !== venueId && <span className="ml-1 text-gold-300">타 매장</span>}</span>
                <span className="shrink-0 font-bold text-ink-primary tabular-nums">{u.usedCount}건</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1 text-2xs font-bold text-ink-secondary">배포됨 {active.length}장</p>
        {loading ? <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : active.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">배포된 이용권이 없습니다.</p>
            : <ul className="space-y-1.5">{active.map((v) => <Row key={v.id} v={v} onRedeem={() => redeem(v.id)} onRevoke={canIssue ? () => revoke(v.id) : undefined} onDelete={canIssue ? () => del(v.id) : undefined} />)}</ul>}
      </div>

      {others.length > 0 && (
        <div>
          <p className="mb-1 text-2xs font-bold text-ink-muted">이력 {others.length}건</p>
          <ul className="space-y-1.5">{others.slice(0, 40).map((v) => <Row key={v.id} v={v} onDelete={canIssue ? () => del(v.id) : undefined} />)}</ul>
        </div>
      )}
    </div>
  );
}

export default function VoucherManageModal({ open, onClose, venueId }: { open: boolean; onClose: () => void; venueId: string }) {
  return (
    <Modal open={open} onClose={onClose} title="매장이용권 관리" maxWidth="md" variant="sheet">
      <div className="p-4"><VoucherManagePanel venueId={venueId} /></div>
    </Modal>
  );
}

function Row({ v, onRedeem, onRevoke, onDelete }: { v: Voucher; onRedeem?: () => void; onRevoke?: () => void; onDelete?: () => void }) {
  const st = STATUS[v.status] ?? STATUS.active;
  return (
    <li className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-primary">{v.title}</p>
        <p className="truncate text-[10px] text-ink-muted">
          {v.holderName ? `보유: ${v.holderName}` : '미지정'}
          {v.status === 'used' && v.usedVenueName ? ` · 사용처: ${v.usedVenueName}` : ''}
        </p>
      </div>
      <span className={`shrink-0 rounded-badge px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
      {onRedeem && <button type="button" onClick={onRedeem} className="btn-ghost shrink-0 px-2 text-2xs text-gold-300">사용</button>}
      {onRevoke && <button type="button" onClick={onRevoke} className="btn-ghost shrink-0 px-2 text-2xs text-ink-secondary">회수</button>}
      {onDelete && <button type="button" onClick={onDelete} aria-label="삭제" className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light">✕</button>}
    </li>
  );
}
