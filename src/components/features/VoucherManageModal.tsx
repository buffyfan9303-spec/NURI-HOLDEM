// src/components/features/VoucherManageModal.tsx
// 매장이용권 관리 — 업주: 배포/회수/삭제, 인증직원: 사용 처리. 금전적 가치(금액) 없음.
// VoucherManagePanel(인라인, 매장관리 메뉴) + VoucherManageModal(대시보드 카드용 모달).
import { useEffect, useMemo, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';
import { listVenueVouchers, issueVoucher, revokeVoucher, deleteVoucher, findUserForTransfer, voucherUsageByVenue, voucherHolderStats, isVoucherIssueApproved, type Voucher, type VoucherUsage, type VoucherHolderStats, type TransferTarget } from '../../api/vouchers';

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
  const [recvMode, setRecvMode] = useState<'none' | 'id'>('none');
  const [idInput, setIdInput] = useState('');
  const [cands, setCands] = useState<TransferTarget[]>([]);
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

  const pickRecv = (t: TransferTarget) => { setRecvUserId(t.id); setRecvDisplay(t.display); setRecvMode('none'); setIdInput(''); setCands([]); };
  const resolveId = async () => {
    const q = idInput.trim();
    if (!q) return;
    try {
      const f = await findUserForTransfer(q);
      if (!f.length) { toast.show('해당 아이디(닉네임)의 회원이 없습니다', 'error'); setCands([]); return; }
      if (f.length === 1) pickRecv(f[0]); else setCands(f);
    } catch (e) { toast.show(e instanceof Error ? e.message : '조회 실패', 'error'); }
  };

  // 매장 QR 인쇄 — 고정값(venueId 기반)이라 한 번 출력해 매장에 비치 가능.
  const printQr = async () => {
    try {
      const big = await QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 1024, margin: 2 });
      const w = window.open('', '_blank', 'width=480,height=640');
      if (!w) { toast.show('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도하세요.', 'error'); return; }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>매장이용권 QR</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#111}h1{font-size:20px;margin:0 0 4px}p{color:#555;font-size:13px;margin:4px 0 16px}img{width:320px;height:320px}small{display:block;margin-top:16px;color:#888;font-size:11px}</style></head><body><h1>매장이용권 사용 QR</h1><p>손님: 대시보드 → 이용권 → 사용하기 → ‘매장 QR 스캔’</p><img src="${big}" alt="매장 QR"/><small>NURI HOLDEM · 이 QR은 고정값입니다. 출력해 매장에 비치하세요.</small><script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`);
      w.document.close();
    } catch (e) { toast.show(e instanceof Error ? e.message : '인쇄 준비 실패', 'error'); }
  };
  const issue = async () => {
    setBusy(true);
    try {
      await issueVoucher(venueId, { title, count, holderUserId: recvUserId ?? undefined, holderName: recvDisplay || undefined });
      toast.show(`매장이용권 ${count}개를 ${recvDisplay ? recvDisplay + '님께 ' : ''}배포했습니다`, 'success');
      setTitle('매장이용권'); setCount(1); setRecvUserId(null); setRecvDisplay(''); setRecvMode('none'); setCands([]);
      reload();
    } catch (e) { toast.show(e instanceof Error ? e.message : '배포 실패', 'error'); }
    setBusy(false);
  };
  const del = async (id: string) => { if (!window.confirm('이 이용권을 완전히 삭제할까요? 되돌릴 수 없습니다.')) return; try { await deleteVoucher(id); toast.show('삭제했습니다', 'info'); reload(); } catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); } };

  const active = list.filter((v) => v.status === 'active');
  const others = list.filter((v) => v.status !== 'active');
  // 보유자별 집계 — 개별 나열 대신 인원/갯수
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; name: string; isStore: boolean; ids: string[] }>();
    for (const v of active) {
      const key = v.holderUserId ?? (v.holderName ? `n:${v.holderName}` : '__store__');
      const g = m.get(key) ?? { key, name: v.holderName ?? '매장 보관', isStore: !v.holderUserId && !v.holderName, ids: [] };
      g.ids.push(v.id); m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.ids.length - a.ids.length);
  }, [active]);
  const holderCount = groups.filter((g) => !g.isStore).length;
  const revokeGroup = async (g: { name: string; ids: string[] }) => {
    if (!window.confirm(`${g.name}의 이용권 ${g.ids.length}개를 회수할까요?`)) return;
    setBusy(true);
    await Promise.all(g.ids.map((id) => revokeVoucher(id).catch(() => {})));
    toast.show('회수했습니다', 'info'); setBusy(false); reload();
  };
  const deleteGroup = async (g: { name: string; ids: string[] }) => {
    if (!window.confirm(`${g.name}의 이용권 ${g.ids.length}개를 완전히 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    await Promise.all(g.ids.map((id) => deleteVoucher(id).catch(() => {})));
    toast.show('삭제했습니다', 'info'); setBusy(false); reload();
  };

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
          {/* 받는 손님 지정 — 아이디(닉네임)로 지정 */}
          {recvUserId ? (
            <div className="flex items-center gap-2 rounded-input border border-gold-400/40 bg-gold-300/[0.06] px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs text-ink-primary">받는 손님: <b className="text-gold-300">{recvDisplay}</b></span>
              <button type="button" onClick={() => { setRecvUserId(null); setRecvDisplay(''); }} className="shrink-0 text-2xs text-ink-muted">변경</button>
            </div>
          ) : recvMode === 'id' ? (
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <input value={idInput} onChange={(e) => setIdInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); resolveId(); } }} placeholder="받는 사람 아이디(닉네임)" className="input min-w-0 flex-1 text-sm" />
                <button type="button" onClick={resolveId} className="btn-ghost shrink-0 px-2 text-2xs">조회</button>
                <button type="button" onClick={() => { setRecvMode('none'); setCands([]); }} className="btn-ghost shrink-0 px-2 text-2xs text-ink-muted">취소</button>
              </div>
              {cands.length > 0 && (
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-input border border-border-subtle bg-surface-low p-1">
                  {cands.map((c) => (
                    <li key={c.id}><button type="button" onClick={() => pickRecv(c)} className="w-full truncate rounded-input px-2 py-1 text-left text-xs text-ink-secondary hover:bg-surface-high hover:text-ink-primary">{c.display}</button></li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setRecvMode('id')} className="btn-ghost w-full text-2xs">👤 아이디(닉네임)로 받는 사람 지정 (선택)</button>
          )}
          <button type="button" disabled={busy || (!isAdmin && !approved)} onClick={issue} className="btn-primary w-full text-sm disabled:opacity-50">{busy ? '배포 중…' : `+ ${count}개 배포${recvDisplay ? ` → ${recvDisplay}` : ''}`}</button>
          <p className="text-[10px] text-ink-muted">1회 최대 1000개 · 아이디(닉네임)로 손님 지정 시 그 회원 지갑으로. 미지정이면 매장 보관용. 손님은 ‘사용하기 → 매장 QR 스캔’으로 사용합니다. <b className="text-ink-secondary">매장이용권은 금전적 가치가 없습니다.</b></p>
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
          <p className="text-2xs font-bold text-gold-300">매장 이용권 QR — 손님이 스캔해 사용 (고정 QR)</p>
          <img src={qr} alt="매장 이용권 QR" width={160} height={160} className="rounded bg-white p-1.5" />
          <p className="text-center text-[10px] text-ink-muted">손님: 대시보드 → 이용권 → 사용하기 → ‘매장 QR 스캔’</p>
          <button type="button" onClick={printQr} className="btn-ghost mt-0.5 px-3 text-2xs">🖨 인쇄용 QR 열기 — 출력해 매장에 비치</button>
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
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-2xs font-bold text-ink-secondary">보유 현황</p>
          <p className="text-2xs text-ink-muted">보유 인원 <b className="text-gold-300 tabular-nums">{holderCount}</b>명 · 보유 갯수 <b className="text-ink-primary tabular-nums">{active.length}</b>개</p>
        </div>
        {loading ? <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : groups.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">배포된 이용권이 없습니다.</p>
            : <ul className="space-y-1.5">
                {groups.map((g) => (
                  <li key={g.key} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-primary">{g.isStore ? '🏪 매장 보관' : g.name}</p>
                      <p className="text-[10px] text-ink-muted">보유 {g.ids.length}개</p>
                    </div>
                    <span className="shrink-0 rounded-badge bg-gold-300/15 px-2 py-0.5 text-xs font-bold text-gold-300 tabular-nums">{g.ids.length}</span>
                    {canIssue && <button type="button" disabled={busy} onClick={() => revokeGroup(g)} className="btn-ghost shrink-0 px-2 text-2xs text-ink-secondary disabled:opacity-50">회수</button>}
                    {canIssue && <button type="button" disabled={busy} onClick={() => deleteGroup(g)} aria-label="삭제" className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light disabled:opacity-50">✕</button>}
                  </li>
                ))}
              </ul>}
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
