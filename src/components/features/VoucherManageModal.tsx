// src/components/features/VoucherManageModal.tsx
// 매장이용권 관리 — 업주: 배포/회수/삭제, 인증직원: 사용 처리. 금전적 가치(금액) 없음.
// VoucherManagePanel(인라인, 매장관리 메뉴) + VoucherManageModal(대시보드 카드용 모달).
import { useEffect, useMemo, useState, useRef } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'qrcode';
import { checkinUrl } from '../../api/checkins';
import { buyinRequestUrl } from '../../api/ledger';
import { listVenueVouchers, issueVoucher, deleteVoucher, findUserForTransfer, findUserByPhone, voucherUsageByVenue, voucherHolderStats, isVoucherIssueApproved, voucherHolderProfiles, subscribeVenueVouchers, type Voucher, type VoucherUsage, type VoucherHolderStats, type TransferTarget, type VoucherHolderProfile, getVoucherQuota, requestVoucherCredit, myVoucherCreditRequests, type VoucherCreditRequest } from '../../api/vouchers';

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
  const [recvMode, setRecvMode] = useState<'none' | 'id' | 'phone'>('none');
  const [idInput, setIdInput] = useState('');
  const [cands, setCands] = useState<TransferTarget[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1); // 자동완성 키보드 하이라이트
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<VoucherHolderStats | null>(null);
  const [qr, setQr] = useState('');
  const [signupQr, setSignupQr] = useState('');
  const [checkinQr, setCheckinQr] = useState('');
  const [buyinQr, setBuyinQr] = useState('');
  const [approved, setApproved] = useState(true);
  // 발급 한도(쿼터) — null이면 구 DB(한도 미적용)라 표시 생략
  const [quota, setQuota] = useState<number | null>(null);
  const [creditReqs, setCreditReqs] = useState<VoucherCreditRequest[]>([]);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmt, setCreditAmt] = useState(1000);
  const [creditNote, setCreditNote] = useState('');
  const [creditBusy, setCreditBusy] = useState(false);
  const reloadQuota = () => {
    if (!canIssue) return;
    getVoucherQuota(venueId).then(setQuota).catch(() => {});
    myVoucherCreditRequests(venueId).then(setCreditReqs).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadQuota, [venueId, canIssue]);
  const submitCredit = async () => {
    if (creditAmt < 1) return;
    setCreditBusy(true);
    try {
      await requestVoucherCredit(venueId, creditAmt, creditNote.trim() || undefined);
      toast.show('충전 요청을 남겼습니다 — 운영자 승인 후 한도가 충전됩니다', 'success');
      setCreditOpen(false); setCreditNote(''); reloadQuota();
    } catch (e) { toast.show(e instanceof Error ? e.message : '요청 실패', 'error'); }
    setCreditBusy(false);
  };
  const [holderQuery, setHolderQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profileMap, setProfileMap] = useState<Map<string, VoucherHolderProfile>>(new Map());
  const [issueOpen, setIssueOpen] = useState(false); // 발급 섹션 — 기본 접힘
  const [qrOpen, setQrOpen] = useState(false);       // QR 섹션 — 기본 접힘(PC 포함)
  const [ownerOpen, setOwnerOpen] = useState(false); // 보유자 현황·통계(업주 전용) — 기본 접힘

  const reload = () => {
    setLoading(true);
    listVenueVouchers(venueId).then(setList).catch(() => {}).finally(() => setLoading(false));
    if (canIssue) voucherHolderStats(venueId).then(setStats).catch(() => {});
    if (canIssue) voucherHolderProfiles(venueId).then((ps) => setProfileMap(new Map(ps.map((p) => [p.userId, p])))).catch(() => {});
    isVoucherIssueApproved(venueId).then(setApproved).catch(() => {});
    if (canIssue) voucherUsageByVenue(venueId).then(setUsage).catch(() => {});
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [venueId]);
  // 실시간: 이 매장 이용권이 들어오면(사용/발급/회수) 즉시 갱신 — 권한은 RLS로 자동 게이트
  useEffect(() => subscribeVenueVouchers(venueId, () => reload()), [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 240, margin: 1 }).then(setQr).catch(() => {}); }, [venueId]);
  useEffect(() => { QRCode.toDataURL('https://nuriholdem.com/?signup=1', { width: 240, margin: 1 }).then(setSignupQr).catch(() => {}); }, []);
  useEffect(() => { QRCode.toDataURL(checkinUrl(venueId), { width: 240, margin: 1 }).then(setCheckinQr).catch(() => {}); }, [venueId]);
  useEffect(() => { QRCode.toDataURL(buyinRequestUrl(venueId), { width: 240, margin: 1 }).then(setBuyinQr).catch(() => {}); }, [venueId]);

  // 이용 내역 피드 — 발급(보낸 것)·사용(들어온 것)을 한 줄씩, 최신순. 실시간 구독이 reload를 부르므로 자동 갱신.
  const feed = useMemo(() => {
    // 보유자 표기: 실명(닉네임) 둘 다 — 닉네임만으론 동명이인 구분 불가
    const whoOf = (v: Voucher) => {
      const p = v.holderUserId ? profileMap.get(v.holderUserId) : undefined;
      if (p?.realName && p?.nickname) return `${p.realName}/${p.nickname}`;
      if (p?.realName) return p.realName;
      if (p?.nickname) return p.nickname;
      return v.holderName ?? '';
    };
    const ev: { t: 'issued' | 'used'; at: string; title: string; who: string }[] = [];
    for (const v of list) {
      if (v.createdAt) ev.push({ t: 'issued', at: v.createdAt, title: v.title, who: whoOf(v) || '매장 보관' });
      if (v.usedAt) ev.push({ t: 'used', at: v.usedAt, title: v.title, who: whoOf(v) });
    }
    ev.sort((a, b) => b.at.localeCompare(a.at));
    // 같은 분(分)·종류·대상·제목은 한 줄로 묶고 ×N — 10장 발급이 10줄로 도배되지 않게
    const grouped: { t: 'issued' | 'used'; at: string; title: string; who: string; n: number }[] = [];
    for (const e of ev) {
      const last = grouped[grouped.length - 1];
      if (last && last.t === e.t && last.title === e.title && last.who === e.who && last.at.slice(0, 16) === e.at.slice(0, 16)) last.n += 1;
      else grouped.push({ ...e, n: 1 });
    }
    return grouped.slice(0, 30);
  }, [list, profileMap]);
  const fmtFeed = (iso: string) => { const d = new Date(iso); const p2 = (n: number) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };

  const pickRecv = (t: TransferTarget) => {
    if (t.verified === false) { toast.show('본인인증을 완료한 회원에게만 이용권을 발급할 수 있습니다', 'error'); return; }
    setRecvUserId(t.id); setRecvDisplay(t.display); setRecvMode('none'); setIdInput(''); setCands([]); setActiveIdx(-1);
  };
  // 최근 발급한 손님(단골) — 자주 주는 대상 빠른 선택. 이미 발급된 이력이라 본인인증 완료자로 간주(발급은 인증자만 가능).
  const recentRecipients = useMemo<TransferTarget[]>(() => {
    const seen = new Map<string, { display: string; at: string }>();
    for (const v of list) {
      if (!v.holderUserId) continue;
      const p = profileMap.get(v.holderUserId);
      const display = (p?.realName && p?.nickname) ? `${p.realName}/${p.nickname}` : (p?.nickname || p?.realName || v.holderName || '회원');
      const at = v.createdAt ?? '';
      const prev = seen.get(v.holderUserId);
      if (!prev || at > prev.at) seen.set(v.holderUserId, { display, at });
    }
    return [...seen.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, 6)
      .map(([id, x]) => ({ id, display: x.display, verified: true }));
  }, [list, profileMap]);
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
    const finder = recvMode === 'phone' ? findUserByPhone : findUserForTransfer;
    try {
      const f = await finder(q);
      if (!f.length) { toast.show(recvMode === 'phone' ? '해당 전화번호의 회원이 없습니다' : '해당 아이디(닉네임)의 회원이 없습니다', 'error'); setCands([]); return; }
      if (f.length === 1) pickRecv(f[0]); else setCands(f);
    } catch (e) { toast.show(e instanceof Error ? e.message : '조회 실패', 'error'); }
  };
  // 입력 시 라이브 자동완성 — 장부 바인 검색과 동일 UX(디바운스 280ms). 닉네임·전화 경로 공용.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if ((recvMode !== 'id' && recvMode !== 'phone') || recvUserId) return;
    const q = idInput.trim();
    if (!q) { setCands([]); return; }
    const finder = recvMode === 'phone' ? findUserByPhone : findUserForTransfer;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { finder(q).then((f) => { setCands(f); setActiveIdx(-1); }).catch(() => { setCands([]); setActiveIdx(-1); }); }, 280);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [idInput, recvMode, recvUserId]);

  // 매장 비치용 인쇄 — 선택한 QR만 출력(종이가 작아 한꺼번에 불가). 3개 중 1~3개 선택.
  const QR_DEFS = [
    { id: 'voucher', icon: '🎟', title: '매장이용권 사용', data: () => QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 1024, margin: 2 }), desc: '대시보드 → 이용권 → 사용하기 → ‘매장 QR 스캔’' },
    { id: 'checkin', icon: '📍', title: '출석 체크인', data: () => QRCode.toDataURL(checkinUrl(venueId), { width: 1024, margin: 2 }), desc: 'QR 스캔 → 오늘 출석 도장(매장 점수 적립 · 출석왕 집계)' },
    { id: 'signup', icon: '📱', title: '회원가입', data: () => QRCode.toDataURL('https://nuriholdem.com/?signup=1', { width: 1024, margin: 2 }), desc: 'QR 스캔 → 바로 회원가입' },
    { id: 'buyin', icon: '🙋', title: '바인(참가) 요청', data: () => QRCode.toDataURL(buyinRequestUrl(venueId), { width: 1024, margin: 2 }), desc: '손님 스캔 → 참가 요청(게임 선택) → 운영자가 장부에서 원탭 승인' },
    { id: 'buyinG1', icon: '🏆', title: '바인 요청 · 메인', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 1), { width: 1024, margin: 2 }), desc: '메인 테이블 비치 — 스캔 시 메인 게임 바로 요청' },
    { id: 'buyinG2', icon: '🎲', title: '바인 요청 · 사이드1', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 2), { width: 1024, margin: 2 }), desc: '사이드1 테이블 비치 — 스캔 시 사이드1 바로 요청' },
    { id: 'buyinG3', icon: '🎲', title: '바인 요청 · 사이드2', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 3), { width: 1024, margin: 2 }), desc: '사이드2 테이블 비치 — 스캔 시 사이드2 바로 요청' },
  ] as const;
  const [printSel, setPrintSel] = useState<Record<string, boolean>>({ voucher: true, checkin: false, signup: false, buyin: false, buyinG1: false, buyinG2: false, buyinG3: false });
  const togglePrint = (id: string) => setPrintSel((m) => ({ ...m, [id]: !m[id] }));
  const printQr = async () => {
    const chosen = QR_DEFS.filter((q) => printSel[q.id]);
    if (chosen.length === 0) { toast.show('인쇄할 QR을 1개 이상 선택하세요', 'error'); return; }
    try {
      const imgs = await Promise.all(chosen.map((q) => q.data()));
      const w = window.open('', '_blank', 'width=480,height=860');
      if (!w) { toast.show('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도하세요.', 'error'); return; }
      const cards = chosen.map((q, i) => {
        const tbl = q.id.startsWith('buyinG') && q.title.includes('·') ? `<div class="table">🪑 ${q.title.split('·')[1].trim()} 테이블</div>` : '';
        return `  <div class="card"><h2>${q.icon} ${q.title}</h2>${tbl}<img src="${imgs[i]}" alt="${q.title} QR"/><p>${q.desc}</p></div>`;
      }).join('\n');
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NURI HOLDEM · 매장 비치 QR</title><style>
*{box-sizing:border-box;margin:0}body{font-family:system-ui,'Apple SD Gothic Neo',sans-serif;text-align:center;padding:28px 22px;color:#111}
.brandlogo{height:56px;width:auto;margin:0 auto 8px;display:block}
.logo{font-size:30px;font-weight:900;letter-spacing:.5px}.logo .h{color:#c9a43c}
.tag{font-size:14px;color:#444;font-weight:700;margin-top:8px}.url{font-size:14px;color:#c9a43c;font-weight:800;margin-top:2px}
.qrs{display:flex;flex-direction:column;align-items:center;gap:20px;margin-top:22px}
.card{border:2px solid #ececec;border-radius:16px;padding:16px 16px 12px;width:320px}
.card h2{font-size:17px;font-weight:800}.card .table{margin-top:8px;font-size:20px;font-weight:900;color:#1a1a1a;background:#f5e6c8;border-radius:8px;padding:6px 8px}.card img{width:236px;height:236px;margin-top:10px}.card p{font-size:12px;color:#666;margin-top:8px;line-height:1.4}
@media print{body{padding:10px}}
</style></head><body>
<img class="brandlogo" src="${window.location.origin}/nuri-logo.png" alt="" onerror="this.style.display='none'"/>
<div class="logo">NURI <span class="h">HOLDEM</span></div>
<div class="tag">국내 최고의 홀덤 커뮤니티</div>
<div class="url">nuriholdem.com</div>
<div class="qrs">
${cards}
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
      reload(); reloadQuota();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '배포 실패';
      toast.show(msg, 'error');
      if (msg.includes('한도가 부족') || msg.includes('충전 요청')) { setIssueOpen(true); setCreditOpen(true); }
      reloadQuota();
    }
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
  // 표기: 실명/닉네임. 실명이 없으면 닉네임만.
  const holderLabel = (g: { key: string; name: string; isStore: boolean }) => {
    if (g.isStore) return '🏪 매장 보관';
    const p = profileMap.get(g.key);
    if (p?.realName) return `${p.realName}/${p.nickname ?? g.name}`;
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
      {/* 0) 이용 내역 — 실시간(발급·사용). 장부/이용권 권한 직원도 열람 — 기본 열림 */}
      <div className="rounded-card border border-border-default bg-surface-low p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-2xs font-bold text-accent-300">🎟 이용 내역 <span className="font-normal text-ink-muted">· 실시간</span></p>
          <button type="button" onClick={reload} disabled={loading}
            className="inline-flex h-7 items-center gap-1 rounded-input border border-border-subtle bg-surface-high/60 px-2 text-2xs font-bold text-ink-secondary hover:text-ink-primary disabled:opacity-50">
            <span className={loading ? 'inline-block animate-spin' : ''} aria-hidden>↻</span> 새로고침
          </button>
        </div>
        {feed.length === 0 ? (
          <p className="py-3 text-center text-2xs text-ink-muted">아직 내역이 없습니다 — 발급·사용되면 즉시 표시됩니다.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {feed.map((e, i) => (
              <li key={i} className="flex items-center gap-2 rounded-input bg-surface-base/50 px-2 py-1.5 text-2xs">
                <span className={['shrink-0 rounded-badge px-1.5 py-0.5 font-bold leading-none',
                  e.t === 'used' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-accent-300/15 text-accent-300'].join(' ')}>
                  {e.t === 'used' ? '↘ 사용(받음)' : '↗ 발급(보냄)'}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-secondary">
                  <b className="text-ink-primary">{e.who || '회원'}</b> · {e.title}
                  {e.n > 1 && <b className="ml-1 text-accent-300">×{e.n}</b>}
                </span>
                <span className="shrink-0 tabular-nums text-ink-muted">{fmtFeed(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 1) 매장이용권 발급 — 접기 */}
      {canIssue ? (
        <div className="rounded-input border border-accent-400/30 bg-accent-300/[0.05]">
          <button type="button" onClick={() => setIssueOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-2xs font-bold text-accent-300">매장이용권 발급 <span className="font-normal text-ink-muted">· 업주 전용</span>{quota !== null && <span className={['ml-1.5 rounded-badge px-1.5 py-0.5 font-bold', quota < 50 ? 'bg-danger/15 text-danger-light' : 'bg-surface-high text-ink-secondary'].join(' ')}>잔여 한도 {quota.toLocaleString()}개</span>}</span>
            <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', issueOpen ? 'rotate-180' : ''].join(' ')} />
          </button>
          {issueOpen && (
            <div className="space-y-1.5 px-2.5 pb-2.5">
              {!isAdmin && !approved && (
                <p className="rounded-input border border-amber-500/40 bg-amber-500/[0.08] px-2 py-1.5 text-[10px] text-amber-300">⚠️ 운영자 승인 후 매장이용권을 발급할 수 있습니다. 운영자에게 발급 승인을 요청하세요.</p>
              )}
              <div className="flex gap-1.5">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이용권 이름 (예: 데일리 1회 참가권)" className="input min-w-0 flex-1 text-sm" />
                <div className="flex items-stretch gap-1 shrink-0">
                  <StepBtn label="−" onStep={() => setCount((c) => Math.max(1, c - 1))} />
                  <input type="number" inputMode="numeric" min={1} max={1000} value={count || ''} onChange={(e) => setCount(Math.min(1000, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="input w-16 text-sm tabular-nums text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" aria-label="발급 갯수" />
                  <StepBtn label="+" onStep={() => setCount((c) => Math.min(1000, c + 1))} />
                  <span className="self-center pl-0.5 text-2xs text-ink-muted">개</span>
                </div>
              </div>
              {/* 받는 손님 지정 — 아이디(닉네임)로 지정 */}
              {recvUserId ? (
                <div className="flex items-center gap-2 rounded-input border border-accent-400/40 bg-accent-300/[0.06] px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-primary">받는 손님: <b className="text-accent-300">{recvDisplay}</b></span>
                  <button type="button" onClick={() => { setRecvUserId(null); setRecvDisplay(''); }} className="shrink-0 text-2xs text-ink-muted">변경</button>
                </div>
              ) : (recvMode === 'id' || recvMode === 'phone') ? (
                <div className="space-y-1.5">
                  {/* 최근 발급한 손님(단골) 빠른 선택 — 자주 주는 대상 원탭 */}
                  {recentRecipients.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="self-center text-[10px] text-ink-muted">최근:</span>
                      {recentRecipients.map((r) => (
                        <button key={r.id} type="button" onClick={() => pickRecv(r)}
                          className="rounded-full border border-accent-400/30 bg-accent-300/[0.06] px-2 py-0.5 text-[11px] text-ink-secondary hover:border-accent-400/60 hover:text-accent-300">
                          👤 {r.display}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input value={idInput} onChange={(e) => setIdInput(e.target.value)} autoFocus
                      role="combobox" aria-expanded={cands.length > 0} aria-autocomplete="list"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' && cands.length) { e.preventDefault(); setActiveIdx((i) => Math.min(cands.length - 1, i + 1)); }
                        else if (e.key === 'ArrowUp' && cands.length) { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
                        else if (e.key === 'Enter') { e.preventDefault(); if (activeIdx >= 0 && activeIdx < cands.length) pickRecv(cands[activeIdx]); else resolveId(); }
                        else if (e.key === 'Escape') { setCands([]); setActiveIdx(-1); }
                      }}
                      inputMode={recvMode === 'phone' ? 'numeric' : 'text'}
                      placeholder={recvMode === 'phone' ? '전화번호 입력 — 자동완성 (↑/↓·Enter)' : '이름·아이디(닉네임) 입력 — 자동완성 (↑/↓·Enter)'} className="input min-w-0 flex-1 text-sm" />
                    <button type="button" onClick={() => { setRecvMode('none'); setCands([]); setIdInput(''); setActiveIdx(-1); }} className="shrink-0 rounded-input border border-border-default bg-surface-high px-3 text-2xs font-bold text-ink-muted hover:text-ink-secondary">취소</button>
                  </div>
                  {cands.length > 0 ? (
                    <ul role="listbox" className="max-h-40 space-y-1 overflow-y-auto rounded-input border border-accent-400/30 bg-surface-low p-1">
                      {cands.map((c, i) => {
                        const unverified = c.verified === false;
                        return (
                          <li key={c.id} role="option" aria-selected={i === activeIdx}>
                            <button type="button" disabled={unverified} onClick={() => pickRecv(c)} onMouseEnter={() => setActiveIdx(i)}
                              className={`flex w-full items-center gap-1.5 rounded-input px-2 py-1.5 text-left ${unverified ? 'cursor-not-allowed opacity-60' : i === activeIdx ? 'bg-surface-high' : 'hover:bg-surface-high'}`}>
                              <span aria-hidden className="shrink-0 text-2xs">👤</span>
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{c.display}</span>
                              {unverified && <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">미인증 · 발급 불가</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : idInput.trim() ? (
                    <p className="px-1 text-[10px] text-ink-muted">일치하는 회원이 없습니다 — {recvMode === 'phone' ? '전화번호' : '아이디(닉네임)'}를 확인하세요.</p>
                  ) : null}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setRecvMode('id')} className="btn-ghost flex-1 text-2xs">👤 아이디(닉네임)로 지정</button>
                  <button type="button" onClick={() => setRecvMode('phone')} className="btn-ghost flex-1 text-2xs">📞 전화번호로 지정</button>
                </div>
              )}
              <button type="button" disabled={busy || (!isAdmin && !approved)} onClick={issue} className="btn-primary w-full text-sm disabled:opacity-50">{busy ? '배포 중…' : `+ ${count}개 발급${recvDisplay ? ` → ${recvDisplay}` : ''}`}</button>
              <p className="text-[10px] text-ink-muted">1회 최대 1000개 · 아이디(닉네임)로 손님 지정 시 그 회원 지갑으로. 미지정이면 매장 보관용. 손님은 ‘사용하기 → 매장 QR 스캔’으로 사용합니다. <b className="text-ink-secondary">매장이용권은 금전적 가치가 없습니다.</b></p>

              {/* 발급 한도 충전(구매) 요청 — 운영진 승인 시 충전 */}
              {quota !== null && (
                <div className="rounded-input border border-border-subtle bg-surface-low p-2 space-y-1.5">
                  {creditReqs.some((r) => r.status === 'pending') ? (
                    <p className="text-2xs text-amber-300 font-semibold">⏳ 충전 요청 {creditReqs.find((r) => r.status === 'pending')?.amount.toLocaleString()}개 — 운영자 승인 대기 중</p>
                  ) : !creditOpen ? (
                    <button type="button" onClick={() => setCreditOpen(true)} className="btn-ghost w-full text-2xs text-accent-300">🛒 발급 한도 충전(구매) 요청 — 운영진 승인</button>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        {[500, 1000, 3000].map((n) => (
                          <button key={n} type="button" onClick={() => setCreditAmt(n)}
                            className={['flex-1 rounded-input border px-2 py-1.5 text-2xs font-bold transition-colors',
                              creditAmt === n ? 'border-accent-400/50 bg-accent-300/15 text-accent-300' : 'border-border-default bg-surface-high text-ink-secondary'].join(' ')}>
                            {n.toLocaleString()}개
                          </button>
                        ))}
                        <input type="number" inputMode="numeric" min={1} max={100000} value={creditAmt || ''} onChange={(e) => setCreditAmt(Math.min(100000, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                          className="input w-20 shrink-0 text-sm tabular-nums text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" aria-label="충전 수량" />
                      </div>
                      <input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} maxLength={80} placeholder="요청 메모 (선택 — 예: 주말 이벤트용)" className="input w-full text-sm" />
                      <div className="flex gap-1.5">
                        <button type="button" disabled={creditBusy} onClick={submitCredit} className="btn-primary flex-1 text-2xs disabled:opacity-50">{creditBusy ? '요청 중…' : `충전 ${creditAmt.toLocaleString()}개 요청`}</button>
                        <button type="button" onClick={() => setCreditOpen(false)} className="btn-ghost shrink-0 px-3 text-2xs">닫기</button>
                      </div>
                      <p className="text-[10px] text-ink-muted">운영진이 확인 후 승인하면 한도가 충전됩니다. 구매·정산은 운영진이 별도로 안내합니다.</p>
                    </>
                  )}
                  {creditReqs.filter((r) => r.status !== 'pending').slice(0, 2).map((r) => (
                    <p key={r.id} className="text-[10px] text-ink-muted">
                      {r.status === 'approved' ? '✅ 승인' : '❌ 거절'} · {r.amount.toLocaleString()}개{r.adminNote ? ` · ${r.adminNote}` : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-input border border-border-subtle bg-surface-low p-2.5 text-2xs text-ink-muted">배포·회수·삭제는 <b className="text-ink-secondary">업주</b>만 가능합니다. 인증 직원은 열람·사용 처리만 할 수 있습니다.</p>
      )}

      {/* 2) QR 코드 — 접기 */}
      {canIssue && qr && (
        <div className="rounded-input border border-accent-400/30 bg-accent-300/[0.05]">
          <button type="button" onClick={() => setQrOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-2xs font-bold text-accent-300">매장 QR <span className="font-normal text-ink-muted">· 이용권 · 출석 체크인 · 회원가입</span></span>
            <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', qrOpen ? 'rotate-180' : ''].join(' ')} />
          </button>
          {qrOpen && (
            <div className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-accent-300">이용권 사용 QR</p>
                  <img src={qr} alt="매장 이용권 QR" width={130} height={130} className="rounded bg-white p-1.5" />
                  <p className="text-center text-[10px] leading-tight text-ink-muted">손님이 스캔해 사용 (고정)</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-sky-300">출석 체크인 QR</p>
                  {checkinQr && <img src={checkinQr} alt="출석 체크인 QR" width={130} height={130} className="rounded bg-white p-1.5" />}
                  <p className="text-center text-[10px] leading-tight text-ink-muted">손님 스캔 → 출석 도장 · 출석왕 집계 (고정)</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-emerald-300">회원가입 QR</p>
                  {signupQr && <img src={signupQr} alt="회원가입 QR" width={130} height={130} className="rounded bg-white p-1.5" />}
                  <p className="text-center text-[10px] leading-tight text-ink-muted">스캔 시 회원가입 페이지로 이동</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-sky-300">바인 요청 QR</p>
                  {buyinQr && <img src={buyinQr} alt="바인 요청 QR" width={130} height={130} className="rounded bg-white p-1.5" />}
                  <p className="text-center text-[10px] leading-tight text-ink-muted">손님 스캔 → 참가 요청 → 장부에서 승인</p>
                </div>
              </div>
              {/* 인쇄할 QR 선택 — 종이가 작아 한꺼번에 안 됨. 1~3개 선택 */}
              <div className="mt-3 rounded-input border border-border-subtle bg-surface-low p-2">
                <p className="mb-1.5 text-[10px] font-bold text-ink-secondary">인쇄할 QR 선택 (1~3개)</p>
                <div className="flex flex-wrap gap-1.5">
                  {QR_DEFS.map((q) => {
                    const on = printSel[q.id];
                    return (
                      <button key={q.id} type="button" onClick={() => togglePrint(q.id)}
                        className={['inline-flex items-center gap-1 rounded-badge border px-2 py-1 text-2xs font-bold transition-colors',
                          on ? 'border-accent-400/50 bg-accent-300/15 text-accent-300' : 'border-border-default bg-surface-high text-ink-muted'].join(' ')}>
                        <span>{on ? '☑' : '☐'}</span> {q.icon} {q.title}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={printQr} className="btn-ghost mt-2 w-full px-3 text-2xs">🖨 선택한 QR 출력해 매장에 비치</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3) 보유자 현황·통계 — 업주 전용, 기본 접힘 */}
      {canIssue && (
        <button type="button" onClick={() => setOwnerOpen((v) => !v)} aria-expanded={ownerOpen}
          className="flex w-full items-center justify-between gap-2 rounded-input border border-border-subtle bg-surface-low px-2.5 py-2">
          <span className="text-2xs font-bold text-ink-secondary">📊 보유자 현황·통계 <span className="font-normal text-ink-muted">· 업주 전용</span></span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            className={['text-ink-muted transition-transform', ownerOpen ? 'rotate-180' : ''].join(' ')} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      )}
      {canIssue && ownerOpen && stats && (
        <div className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.07] via-surface-low to-surface-low p-3 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['👥', stats.holderCount, '보유 회원', 'text-accent-300'],
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
                <span className="font-bold tabular-nums text-accent-300">{Math.round((stats.usedCount / (stats.activeCount + stats.usedCount)) * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-high">
                <div className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-300 transition-[width] duration-500"
                  style={{ width: `${Math.round((stats.usedCount / (stats.activeCount + stats.usedCount)) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {canIssue && ownerOpen && usage.length > 0 && (
        <div className="rounded-input border border-border-subtle bg-surface-low p-2.5">
          <p className="mb-1 text-2xs font-bold text-ink-secondary">사용처 TOP — 배포분이 실제 사용된 매장</p>
          <ul className="space-y-1">
            {usage.slice(0, 6).map((u, i) => (
              <li key={u.usedVenueId ?? i} className="flex items-center justify-between text-2xs">
                <span className="min-w-0 flex-1 truncate text-ink-secondary">{i + 1}. {u.venueName ?? '(알수없음)'}{u.usedVenueId && u.usedVenueId !== venueId && <span className="ml-1 text-accent-300">타 매장</span>}</span>
                <span className="shrink-0 font-bold text-ink-primary tabular-nums">{u.usedCount}건</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={canIssue && ownerOpen ? '' : 'hidden'}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-2xs font-bold text-ink-secondary">보유자 현황</p>
          <p className="text-2xs text-ink-muted">보유 인원 <b className="text-accent-300 tabular-nums">{holderCount}</b>명 · 보유 갯수 <b className="text-ink-primary tabular-nums">{active.length}</b>개</p>
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
                      <span className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-0.5 text-xs font-bold text-accent-300 tabular-nums">{g.active.length}</span>
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

/** 가속 스테퍼 버튼 — 꾹 누르면 350ms→점점 빨라져 40ms 간격(iOS 타이머 패턴). 연타 불필요 */
function StepBtn({ label, onStep }: { label: string; onStep: () => void }) {
  // 리렌더에도 타이머가 살아있도록 ref — pointerup을 놓쳐도 leave에서 정지
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const run = (delay: number) => {
    onStep();
    timer.current = setTimeout(() => run(Math.max(40, delay * 0.82)), delay);
  };
  return (
    <button type="button" aria-label={label === '+' ? '증가' : '감소'}
      onPointerDown={() => { stop(); run(350); }}
      onPointerUp={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()}
      className="w-9 shrink-0 rounded-input border border-border-default bg-surface-high text-base font-bold text-ink-secondary hover:text-ink-primary active:bg-surface-float select-none touch-none">
      {label}
    </button>
  );
}
