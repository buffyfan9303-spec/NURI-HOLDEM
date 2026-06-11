// src/components/features/VoucherManageModal.tsx
// 매장이용권 관리 — 업주: 배포/회수/삭제, 인증직원: 사용 처리. 금전적 가치(금액) 없음.
// VoucherManagePanel(인라인, 매장관리 메뉴) + VoucherManageModal(대시보드 카드용 모달).
import { useEffect, useMemo, useState } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';
import { listVenueVouchers, issueVoucher, deleteVoucher, findUserForTransfer, voucherUsageByVenue, voucherHolderStats, isVoucherIssueApproved, voucherHolderProfiles, subscribeVenueVouchers, type Voucher, type VoucherUsage, type VoucherHolderStats, type TransferTarget, type VoucherHolderProfile } from '../../api/vouchers';

function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function VoucherManagePanel({ venueId, prefillReceiver }: { venueId: string; prefillReceiver?: string }) {
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
  const [signupQr, setSignupQr] = useState('');
  const [approved, setApproved] = useState(true);
  const [holderQuery, setHolderQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profileMap, setProfileMap] = useState<Map<string, VoucherHolderProfile>>(new Map());
  const [issueOpen, setIssueOpen] = useState(true); // 배포 섹션 접기
  const [qrOpen, setQrOpen] = useState(true);       // QR 섹션 접기

  const reload = () => {
    setLoading(true);
    listVenueVouchers(venueId).then(setList).catch(() => {}).finally(() => setLoading(false));
    voucherHolderStats(venueId).then(setStats).catch(() => {});
    voucherHolderProfiles(venueId).then((ps) => setProfileMap(new Map(ps.map((p) => [p.userId, p])))).catch(() => {});
    isVoucherIssueApproved(venueId).then(setApproved).catch(() => {});
    if (canIssue) voucherUsageByVenue(venueId).then(setUsage).catch(() => {});
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [venueId]);
  // 실시간: 이 매장 이용권이 들어오면(사용/발급/회수) 즉시 갱신 — 권한은 RLS로 자동 게이트
  useEffect(() => subscribeVenueVouchers(venueId, () => reload()), [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 240, margin: 1 }).then(setQr).catch(() => {}); }, [venueId]);
  useEffect(() => { QRCode.toDataURL('https://nuriholdem.com/?signup=1', { width: 240, margin: 1 }).then(setSignupQr).catch(() => {}); }, []);

  const pickRecv = (t: TransferTarget) => { setRecvUserId(t.id); setRecvDisplay(t.display); setRecvMode('none'); setIdInput(''); setCands([]); };
  // 단골 TOP '이용권 보내기' 진입 — 받는 사람을 자동 입력·검색(1명 매치면 즉시 선택)
  useEffect(() => {
    const q = (prefillReceiver ?? '').trim();
    if (!q) return;
    setIssueOpen(true);
    setRecvMode('id');
    setIdInput(q);
    findUserForTransfer(q)
      .then((f) => { if (f.length === 1) pickRecv(f[0]); else setCands(f); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillReceiver]);
  const resolveId = async () => {
    const q = idInput.trim();
    if (!q) return;
    try {
      const f = await findUserForTransfer(q);
      if (!f.length) { toast.show('해당 아이디(닉네임)의 회원이 없습니다', 'error'); setCands([]); return; }
      if (f.length === 1) pickRecv(f[0]); else setCands(f);
    } catch (e) { toast.show(e instanceof Error ? e.message : '조회 실패', 'error'); }
  };

  // 매장 비치용 인쇄 — 누리홀덤 브랜딩 + 이용권·회원가입 QR 세로 배치(고정값이라 한 번 출력해 비치).
  const printQr = async () => {
    try {
      const [bigVoucher, bigSignup] = await Promise.all([
        QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 1024, margin: 2 }),
        QRCode.toDataURL('https://nuriholdem.com/?signup=1', { width: 1024, margin: 2 }),
      ]);
      const w = window.open('', '_blank', 'width=480,height=860');
      if (!w) { toast.show('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도하세요.', 'error'); return; }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NURI HOLDEM · 매장 비치 QR</title><style>
*{box-sizing:border-box;margin:0}body{font-family:system-ui,'Apple SD Gothic Neo',sans-serif;text-align:center;padding:28px 22px;color:#111}
.brandlogo{height:56px;width:auto;margin:0 auto 8px;display:block}
.logo{font-size:30px;font-weight:900;letter-spacing:.5px}.logo .h{color:#c9a43c}
.tag{font-size:14px;color:#444;font-weight:700;margin-top:8px}.url{font-size:14px;color:#c9a43c;font-weight:800;margin-top:2px}
.qrs{display:flex;flex-direction:column;align-items:center;gap:20px;margin-top:22px}
.card{border:2px solid #ececec;border-radius:16px;padding:16px 16px 12px;width:320px}
.card h2{font-size:17px;font-weight:800}.card img{width:236px;height:236px;margin-top:10px}.card p{font-size:12px;color:#666;margin-top:8px;line-height:1.4}
@media print{body{padding:10px}}
</style></head><body>
<img class="brandlogo" src="${window.location.origin}/nuri-logo.png" alt="" onerror="this.style.display='none'"/>
<div class="logo">NURI <span class="h">HOLDEM</span></div>
<div class="tag">국내 최고의 홀덤 커뮤니티</div>
<div class="url">nuriholdem.com</div>
<div class="qrs">
  <div class="card"><h2>🎟 매장이용권 사용</h2><img src="${bigVoucher}" alt="매장이용권 QR"/><p>대시보드 → 이용권 → 사용하기 → ‘매장 QR 스캔’</p></div>
  <div class="card"><h2>📱 회원가입</h2><img src="${bigSignup}" alt="회원가입 QR"/><p>QR 스캔 → 바로 회원가입</p></div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};</script>
</body></html>`);
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
  const active = list.filter((v) => v.status === 'active');
  // 보유자별 상세 — 활성/사용 분리(개별 나열 대신). 사용내역은 날짜·시간 포함.
  const holders = useMemo(() => {
    const m = new Map<string, { key: string; name: string; isStore: boolean; active: Voucher[]; used: Voucher[] }>();
    for (const v of list) {
      if (v.status === 'revoked' || v.status === 'expired') continue;
      const key = v.holderUserId ?? (v.holderName ? `n:${v.holderName}` : '__store__');
      const g = m.get(key) ?? { key, name: v.holderName ?? '매장 보관', isStore: !v.holderUserId && !v.holderName, active: [], used: [] };
      if (v.status === 'used') g.used.push(v); else g.active.push(v);
      m.set(key, g);
    }
    return [...m.values()].filter((g) => g.active.length + g.used.length > 0)
      .sort((a, b) => (b.active.length - a.active.length) || (b.used.length - a.used.length));
  }, [list]);
  const holderCount = holders.filter((g) => !g.isStore && g.active.length > 0).length;
  // 표기: 실명(닉네임). 실명이 없으면 닉네임만.
  const holderLabel = (g: { key: string; name: string; isStore: boolean }) => {
    if (g.isStore) return '🏪 매장 보관';
    const p = profileMap.get(g.key);
    if (p?.realName) return `${p.realName}(${p.nickname ?? g.name})`;
    return p?.nickname ?? g.name;
  };
  const hq = holderQuery.trim().toLowerCase();
  const shownHolders = hq ? holders.filter((g) => holderLabel(g).toLowerCase().includes(hq)) : holders;
  const deleteGroup = async (g: { name: string; ids: string[] }) => {
    if (!window.confirm(`${g.name}의 이용권 ${g.ids.length}개를 완전히 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    await Promise.all(g.ids.map((id) => deleteVoucher(id).catch(() => {})));
    toast.show('삭제했습니다', 'info'); setBusy(false); reload();
  };

  return (
    <div className="space-y-3">
      {/* 1) 매장이용권 배포 — 접기 */}
      {canIssue ? (
        <div className="rounded-input border border-gold-400/30 bg-gold-300/[0.05]">
          <button type="button" onClick={() => setIssueOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-2xs font-bold text-gold-300">매장이용권 배포 <span className="font-normal text-ink-muted">· 업주 전용</span></span>
            <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', issueOpen ? 'rotate-180' : ''].join(' ')} />
          </button>
          {issueOpen && (
            <div className="space-y-1.5 px-2.5 pb-2.5">
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
                    <div className="flex w-24 shrink-0 gap-1">
                      <button type="button" onClick={resolveId} className="flex-1 rounded-input border border-border-default bg-surface-high text-2xs font-bold text-ink-secondary hover:text-ink-primary">조회</button>
                      <button type="button" onClick={() => { setRecvMode('none'); setCands([]); }} className="flex-1 rounded-input border border-border-default bg-surface-high text-2xs font-bold text-ink-muted hover:text-ink-secondary">취소</button>
                    </div>
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
          )}
        </div>
      ) : (
        <p className="rounded-input border border-border-subtle bg-surface-low p-2.5 text-2xs text-ink-muted">배포·회수·삭제는 <b className="text-ink-secondary">업주</b>만 가능합니다. 인증 직원은 열람·사용 처리만 할 수 있습니다.</p>
      )}

      {/* 2) QR 코드 — 접기 */}
      {canIssue && qr && (
        <div className="rounded-input border border-gold-400/30 bg-gold-300/[0.05]">
          <button type="button" onClick={() => setQrOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-2xs font-bold text-gold-300">QR 코드 <span className="font-normal text-ink-muted">· 이용권 사용 · 회원가입</span></span>
            <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', qrOpen ? 'rotate-180' : ''].join(' ')} />
          </button>
          {qrOpen && (
            <div className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-gold-300">이용권 사용 QR</p>
                  <img src={qr} alt="매장 이용권 QR" width={130} height={130} className="rounded bg-white p-1.5" />
                  <p className="text-center text-[10px] leading-tight text-ink-muted">손님이 스캔해 사용 (고정)</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-emerald-300">회원가입 QR</p>
                  {signupQr && <img src={signupQr} alt="회원가입 QR" width={130} height={130} className="rounded bg-white p-1.5" />}
                  <p className="text-center text-[10px] leading-tight text-ink-muted">스캔 시 회원가입 페이지로 이동</p>
                </div>
              </div>
              <button type="button" onClick={printQr} className="btn-ghost mt-2 w-full px-3 text-2xs">🖨 출력해 매장에 비치 (이용권 + 회원가입 QR)</button>
            </div>
          )}
        </div>
      )}

      {/* 3) 통계 — 보유회원 · 활성 · 잔여 + 사용률 진행바 */}
      {stats && (
        <div className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.07] via-surface-low to-surface-low p-3 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['👥', stats.holderCount, '보유 회원', 'text-gold-300'],
              ['🎟', stats.activeCount + stats.usedCount, '활성 이용권', 'text-ink-primary'],
              ['✨', stats.activeCount, '잔여 이용권', 'text-emerald-300'],
            ] as const).map(([emoji, val, label, cls]) => (
              <div key={label} className="rounded-input border border-border-subtle/60 bg-surface-base/60 p-2.5 text-center">
                <p className="text-sm leading-none" aria-hidden>{emoji}</p>
                <p className={['mt-1 text-xl font-extrabold tabular-nums leading-none', cls].join(' ')}>{val}</p>
                <p className="mt-1 text-[10px] text-ink-muted">{label}</p>
              </div>
            ))}
          </div>
          {(stats.activeCount + stats.usedCount) > 0 && (
            <div>
              <div className="flex items-baseline justify-between text-[10px] text-ink-muted">
                <span>사용률</span>
                <span className="font-bold tabular-nums text-gold-300">{Math.round((stats.usedCount / (stats.activeCount + stats.usedCount)) * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-high">
                <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-300 transition-[width] duration-500"
                  style={{ width: `${Math.round((stats.usedCount / (stats.activeCount + stats.usedCount)) * 100)}%` }} />
              </div>
            </div>
          )}
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
          <p className="text-2xs font-bold text-ink-secondary">보유자 현황</p>
          <p className="text-2xs text-ink-muted">보유 인원 <b className="text-gold-300 tabular-nums">{holderCount}</b>명 · 보유 갯수 <b className="text-ink-primary tabular-nums">{active.length}</b>개</p>
        </div>
        {holders.length > 0 && (
          <input value={holderQuery} onChange={(e) => setHolderQuery(e.target.value)} placeholder="보유자 검색 (실명·닉네임)" className="input mb-1.5 w-full text-sm" />
        )}
        {loading ? <p className="py-3 text-center text-2xs text-ink-muted">불러오는 중…</p>
          : holders.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">배포된 이용권이 없습니다.</p>
          : shownHolders.length === 0 ? <p className="py-3 text-center text-2xs text-ink-muted">검색 결과가 없습니다.</p>
          : <ul className="space-y-1.5">
              {shownHolders.map((g) => {
                const open = expanded === g.key;
                return (
                  <li key={g.key} className="rounded-input border border-border-subtle bg-surface-low">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button type="button" onClick={() => setExpanded(open ? null : g.key)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-ink-primary">{holderLabel(g)}</p>
                        <p className="text-[10px] text-ink-muted">보유 {g.active.length}개{g.used.length > 0 && <> · 사용 {g.used.length}회</>}</p>
                      </button>
                      <span className="shrink-0 rounded-badge bg-gold-300/15 px-2 py-0.5 text-xs font-bold text-gold-300 tabular-nums">{g.active.length}</span>
                      {!g.isStore && <button type="button" onClick={() => setExpanded(open ? null : g.key)} className="btn-ghost shrink-0 px-2 text-2xs text-ink-secondary">{open ? '닫기' : '관리'}</button>}
                      {(isAdmin || g.isStore) && canIssue && <button type="button" disabled={busy} onClick={() => deleteGroup({ name: holderLabel(g), ids: [...g.active, ...g.used].map((v) => v.id) })} aria-label="삭제" className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light disabled:opacity-50">✕</button>}
                    </div>
                    {open && !g.isStore && (
                      <div className="border-t border-border-subtle px-3 py-1.5">
                        <p className="mb-0.5 text-[10px] font-bold text-ink-muted">이 매장 이용내역{g.used.length > 0 ? ' (최근순)' : ''}</p>
                        {g.used.length === 0 ? <p className="py-1 text-[11px] text-ink-muted">사용 내역이 없습니다.</p>
                          : <ul className="space-y-0.5">
                              {g.used.slice().sort((a, b) => (b.usedAt ?? '').localeCompare(a.usedAt ?? '')).map((v) => (
                                <li key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="min-w-0 flex-1 truncate text-ink-secondary">{v.title}</span>
                                  <span className="shrink-0 tabular-nums text-ink-muted">{fmtDateTime(v.usedAt)}</span>
                                </li>
                              ))}
                            </ul>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>}
      </div>
    </div>
  );
}

export default function VoucherManageModal({ open, onClose, venueId, prefillReceiver }: { open: boolean; onClose: () => void; venueId: string; prefillReceiver?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="매장이용권 관리" maxWidth="md" variant="sheet">
      <div className="p-4"><VoucherManagePanel venueId={venueId} prefillReceiver={prefillReceiver} /></div>
    </Modal>
  );
}
