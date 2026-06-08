// src/components/features/VoucherManageModal.tsx
// 매장이용권 관리 — 업주: 배포/회수/삭제, 인증직원: 사용 처리. 금전적 가치(금액) 없음.
// VoucherManagePanel(인라인, 매장관리 메뉴) + VoucherManageModal(대시보드 카드용 모달).
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { listVenueVouchers, issueVoucher, redeemVoucher, revokeVoucher, deleteVoucher, findUserByPhone, voucherUsageByVenue, voucherHolderStats, isVoucherIssueApproved, type Voucher, type VoucherUsage, type VoucherHolderStats } from '../../api/vouchers';

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: '배포됨', cls: 'bg-gold-300/15 text-gold-300' },
  used: { label: '사용완료', cls: 'bg-surface-float text-ink-muted' },
  revoked: { label: '회수됨', cls: 'bg-danger/15 text-danger-light' },
  expired: { label: '만료', cls: 'bg-surface-float text-ink-muted' },
};

export function VoucherManagePanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canIssue = isAdmin || (user?.role === 'venue_owner' && user?.venueId === venueId);

  const [list, setList] = useState<Voucher[]>([]);
  const [usage, setUsage] = useState<VoucherUsage[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('매장이용권');
  const [count, setCount] = useState(1);
  const [recvUserId, setRecvUserId] = useState<string | null>(null);
  const [recvDisplay, setRecvDisplay] = useState('');
  const [recvMode, setRecvMode] = useState<'none' | 'qr' | 'phone'>('none');
  const [phoneInput, setPhoneInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<VoucherHolderStats | null>(null);
  const [qr, setQr] = useState('');
  const [approved, setApproved] = useState(true);

  const reload = () => {
    setLoading(true);
    listVenueVouchers(venueId).then(setList).catch(() => {}).finally(() => setLoading(false));
    voucherHolderStats(venueId).then(setStats).catch(() => {});
    isVoucherIssueApproved(venueId).then(setApproved).catch(() => {});
    if (canIssue) voucherUsageByVenue(venueId).then(setUsage).catch(() => {});
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [venueId]);
  useEffect(() => { QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 240, margin: 1 }).then(setQr).catch(() => {}); }, [venueId]);

  const onScan = (text: string) => {
    const t = text.trim();
    const rest = t.startsWith('NURIU:') ? t.slice('NURIU:'.length) : '';
    const [id, name] = rest.split('|');
    if (!/^[0-9a-fA-F-]{36}$/.test(id || '')) { toast.show('회원 받기 QR이 아닙니다', 'error'); setRecvMode('none'); return; }
    setRecvUserId(id); setRecvDisplay(name || '회원'); setRecvMode('none');
  };
  const resolvePhone = async () => {
    try {
      const f = await findUserByPhone(phoneInput);
      if (!f.length) { toast.show('해당 전화번호의 회원이 없습니다', 'error'); return; }
      setRecvUserId(f[0].id); setRecvDisplay(f[0].display); setRecvMode('none'); setPhoneInput('');
    } catch (e) { toast.show(e instanceof Error ? e.message : '조회 실패', 'error'); }
  };
  const issue = async () => {
    setBusy(true);
    try {
      await issueVoucher(venueId, { title, count, holderUserId: recvUserId ?? undefined, holderName: recvDisplay || undefined });
      toast.show(`매장이용권 ${count}개를 ${recvDisplay ? recvDisplay + '님께 ' : ''}배포했습니다`, 'success');
      setTitle('매장이용권'); setCount(1); setRecvUserId(null); setRecvDisplay(''); setRecvMode('none');
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
          {!isAdmin && !approved && (
            <p className="rounded-input border border-amber-500/40 bg-amber-500/[0.08] px-2 py-1.5 text-[10px] text-amber-300">⚠️ 운영자 승인 후 매장이용권을 발급할 수 있습니다. 운영자에게 발급 승인을 요청하세요.</p>
          )}
          <div className="flex gap-1.5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이용권 이름 (예: 데일리 1회 참가권)" className="input min-w-0 flex-1 text-sm" />
            <div className="relative w-24 shrink-0">
              <input type="number" inputMode="numeric" min={1} max={1000} value={count || ''} onChange={(e) => setCount(Math.min(1000, Math.max(1, parseInt(e.target.value, 10) || 1)))} className="input w-full pr-6 text-sm tabular-nums" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">개</span>
            </div>
          </div>
          {/* 받는 손님 지정 — QR 스캔 / 전화번호 (닉네임은 바뀌므로 미사용) */}
          {recvUserId ? (
            <div className="flex items-center gap-2 rounded-input border border-gold-400/40 bg-gold-300/[0.06] px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs text-ink-primary">받는 손님: <b className="text-gold-300">{recvDisplay}</b></span>
              <button type="button" onClick={() => { setRecvUserId(null); setRecvDisplay(''); }} className="shrink-0 text-2xs text-ink-muted">변경</button>
            </div>
          ) : recvMode === 'qr' ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-ink-muted">손님의 ‘받기 QR’(손님 대시보드)을 비춰 주세요. (카메라 권한 필요)</p>
              <IssueScanner onResult={onScan} onError={(m) => { toast.show(m, 'error'); setRecvMode('none'); }} />
              <button type="button" onClick={() => setRecvMode('none')} className="btn-ghost w-full text-2xs">취소</button>
            </div>
          ) : recvMode === 'phone' ? (
            <div className="flex gap-1.5">
              <input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} inputMode="tel" placeholder="손님 전화번호" className="input min-w-0 flex-1 text-sm" />
              <button type="button" onClick={resolvePhone} className="btn-ghost shrink-0 px-2 text-2xs">조회</button>
              <button type="button" onClick={() => setRecvMode('none')} className="btn-ghost shrink-0 px-2 text-2xs text-ink-muted">취소</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setRecvMode('qr')} className="btn-ghost flex-1 text-2xs">📷 손님 QR 스캔</button>
              <button type="button" onClick={() => setRecvMode('phone')} className="btn-ghost flex-1 text-2xs">📞 전화번호로 지정</button>
            </div>
          )}
          <button type="button" disabled={busy || (!isAdmin && !approved)} onClick={issue} className="btn-primary w-full text-sm disabled:opacity-50">{busy ? '배포 중…' : `+ ${count}개 배포${recvDisplay ? ` → ${recvDisplay}` : ''}`}</button>
          <p className="text-[10px] text-ink-muted">1회 최대 1000개 · QR/전화로 손님 지정 시 그 회원 지갑으로(닉네임 변경과 무관하게 정확). 미지정이면 매장 보관용. <b className="text-ink-secondary">매장이용권은 금전적 가치가 없습니다.</b></p>
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

function IssueScanner({ onResult, onError }: { onResult: (t: string) => void; onError: (m: string) => void }) {
  useEffect(() => {
    let s: Html5Qrcode | null = null; let done = false;
    const stop = () => { const x = s; s = null; if (x) { x.stop().then(() => x.clear()).catch(() => {}); } };
    (async () => {
      try { s = new Html5Qrcode('nuri-issue-reader'); await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: 200 }, (t) => { if (!done) { done = true; const r = t; stop(); onResult(r); } }, () => {}); }
      catch (e) { onError(e instanceof Error ? e.message : '카메라를 열 수 없습니다.'); }
    })();
    return () => { done = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div id="nuri-issue-reader" className="mx-auto w-full max-w-[260px] overflow-hidden rounded-input bg-black" style={{ minHeight: 200 }} />;
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
