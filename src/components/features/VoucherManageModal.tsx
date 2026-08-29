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
import { listVenueVouchers, issueVoucher, deleteVouchers, revokeVouchers, findUserForTransfer, findUserByPhone, voucherHolderStats, isVoucherIssueApproved, voucherHolderProfiles, subscribeVenueVouchers, type Voucher, type VoucherHolderStats, type TransferTarget, type VoucherHolderProfile, type BulkResult, getVoucherQuota } from '../../api/vouchers';
import { useIdentityEnabled } from '../../lib/identityFlag'; // 본인인증·매장이용권 통합 킬스위치(2026-08-29)

function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function VoucherManagePanel({ venueId, prefillReceiver }: { venueId: string; prefillReceiver?: string }) {
  const toast = useToast();
  const { user } = useAuth();
  // 킬스위치(2026-08-29) — 진입점은 전부 위에서 숨겼지만, 마지막 문(門)에서도 한 번 더 막는다.
  // 이유: 이 패널은 매장관리 하위탭과 대시보드 모달 두 곳에서 마운트되고, 마운트되는 순간
  // 이용권 목록·보유자 프로필·실시간 구독까지 자동으로 열린다(꺼진 기능이 조용히 네트워크를 쓰는 상태).
  const idOn = useIdentityEnabled();
  const isAdmin = user?.role === 'admin';
  const canIssue = isAdmin || (user?.role === 'venue_owner' && user?.venueId === venueId);

  const [list, setList] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('매장이용권');
  const [count, setCount] = useState(1);
  // 만료일(선택) — 비우면 무기한. 서버는 KST 자정 직전으로 저장돼 그날까지 사용 가능.
  const [expiry, setExpiry] = useState('');
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
  // W2-1 VCH-1: 유상 충전 요청·조회 제거(§12-A-2) — 한도 표시는 유지
  const reloadQuota = () => {
    if (!canIssue || !idOn) return;
    getVoucherQuota(venueId).then(setQuota).catch(() => {});
  };
  useEffect(reloadQuota, [venueId, canIssue, idOn]);
  const [holderQuery, setHolderQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [profileMap, setProfileMap] = useState<Map<string, VoucherHolderProfile>>(new Map());
  const [issueOpen, setIssueOpen] = useState(false); // 발급 섹션 — 기본 접힘
  const [qrOpen, setQrOpen] = useState(false);       // QR 섹션 — 기본 접힘(PC 포함)
  const [ownerOpen, setOwnerOpen] = useState(false); // 보유자 현황·통계(업주 전용) — 기본 접힘

  const reload = () => {
    if (!idOn) return; // 킬스위치 OFF — 꺼진 기능이 조용히 조회를 돌지 않게(무료 egress 예산)
    setLoading(true);
    listVenueVouchers(venueId).then(setList).catch(() => {}).finally(() => setLoading(false));
    if (canIssue) voucherHolderStats(venueId).then(setStats).catch(() => {});
    if (canIssue) voucherHolderProfiles(venueId).then((ps) => setProfileMap(new Map(ps.map((p) => [p.userId, p])))).catch(() => {});
    isVoucherIssueApproved(venueId).then(setApproved).catch(() => {});
  };
  useEffect(() => { reload(); }, [venueId, idOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // 실시간: 이 매장 이용권이 들어오면(사용/발급/회수) 즉시 갱신 — 권한은 RLS로 자동 게이트.
  // ⚠ 킬스위치 OFF 에서는 채널을 열지 않는다 — Realtime 동시연결은 무료 한도의 실질 천장이라
  //   '안 보이는 화면'이 연결을 하나 차지하면 클락 TV 구독까지 같이 열화된다.
  useEffect(() => (idOn ? subscribeVenueVouchers(venueId, () => reload()) : undefined), [venueId, idOn]); // eslint-disable-line react-hooks/exhaustive-deps
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
    { id: 'voucher', title: '매장이용권 사용', data: () => QRCode.toDataURL(`NURIV-VENUE:${venueId}`, { width: 1024, margin: 2 }), desc: '대시보드 → 이용권 → 사용하기 → ‘매장 QR 스캔’' },
    { id: 'checkin', title: '출석 체크인', data: () => QRCode.toDataURL(checkinUrl(venueId), { width: 1024, margin: 2 }), desc: 'QR 스캔 → 오늘 출석 도장(매장 점수 적립 · 출석왕 집계)' },
    { id: 'signup', title: '회원가입', data: () => QRCode.toDataURL('https://nuriholdem.com/?signup=1', { width: 1024, margin: 2 }), desc: 'QR 스캔 → 바로 회원가입' },
    { id: 'buyin', title: '바인(참가) 요청', data: () => QRCode.toDataURL(buyinRequestUrl(venueId), { width: 1024, margin: 2 }), desc: '손님 스캔 → 참가 요청(게임 선택) → 운영자가 장부에서 원탭 승인' },
    { id: 'buyinG1', title: '바인 요청 · 메인', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 1), { width: 1024, margin: 2 }), desc: '메인 테이블 비치 — 스캔 시 메인 게임 바로 요청' },
    { id: 'buyinG2', title: '바인 요청 · 사이드1', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 2), { width: 1024, margin: 2 }), desc: '사이드1 테이블 비치 — 스캔 시 사이드1 바로 요청' },
    { id: 'buyinG3', title: '바인 요청 · 사이드2', data: () => QRCode.toDataURL(buyinRequestUrl(venueId, 3), { width: 1024, margin: 2 }), desc: '사이드2 테이블 비치 — 스캔 시 사이드2 바로 요청' },
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
        const tbl = q.id.startsWith('buyinG') && q.title.includes('·') ? `<div class="table">${q.title.split('·')[1].trim()} 테이블</div>` : '';
        return `  <div class="card"><h2>${q.title}</h2>${tbl}<img src="${imgs[i]}" alt="${q.title} QR"/><p>${q.desc}</p></div>`;
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
    // 받는 손님 미지정이 기본 경로라 실수로 '매장 보관'에 들어가던 사고 — 한 번 확인
    if (!recvUserId && !window.confirm(`받는 손님 없이 매장 보관용으로 ${count}개를 발급할까요?\n\n손님에게 주려면 [취소] 후 '받는 손님'을 지정하세요.`)) return;
    setBusy(true);
    try {
      await issueVoucher(venueId, { title, count, holderUserId: recvUserId ?? undefined, holderName: recvDisplay || undefined, expiresAt: expiry ? `${expiry}T23:59:59+09:00` : null });
      toast.show(`매장이용권 ${count}개를 ${recvDisplay ? recvDisplay + '님께 ' : ''}배포했습니다`, 'success');
      setTitle('매장이용권'); setCount(1); setExpiry(''); setRecvUserId(null); setRecvDisplay(''); setRecvMode('none'); setCands([]);
      reload(); reloadQuota();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '배포 실패';
      toast.show(msg, 'error');
      if (msg.includes('한도가 부족')) setIssueOpen(true); // 한도 안내 문구가 보이도록 발급 섹션만 펼침(유상 충전 UI 는 제거됨)
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
    if (g.isStore) return '매장 보관';
    const p = profileMap.get(g.key);
    if (p?.realName) return `${p.realName}/${p.nickname ?? g.name}`;
    return p?.nickname ?? g.name;
  };
  const hq = holderQuery.trim().toLowerCase();
  const shownHolders = hq ? holders.filter((g) => holderLabel(g).toLowerCase().includes(hq)) : holders;
  // 배치 결과를 사장님 말로 옮긴다 — 부분 성공(10장 중 3장만 처리)이 실제로 흔하다.
  const reportBulk = (verb: string, r: BulkResult) => {
    if (r.failed === 0) { toast.show(`${r.ok}장을 ${verb}했습니다`, 'success'); return; }
    if (r.ok === 0) { toast.show(`${verb}하지 못했습니다 — ${r.reasons[0] ?? '알 수 없는 오류'}`, 'error'); return; }
    toast.show(`${r.ok}장 ${verb} · ${r.failed}장 실패 — ${r.reasons[0] ?? ''}`, 'error');
  };

  // 회수 — 오너 지시(2026-08-28) 여정의 마지막 칸인데 화면에 아예 없었다.
  //   잘못 보낸 이용권을 되돌릴 수단이 없어 '삭제'(매장 보관분만 가능)로도 손댈 수 없었다.
  // 왜 삭제가 아니라 회수인가: 삭제는 행을 지워 손님 지갑의 내역까지 없애지만,
  //   회수는 status=revoked 로 남아 '언제 무엇을 회수했는지'가 양쪽에 남는다.
  //   서버가 보유자에게 알림도 보낸다(지갑에서 소리 없이 사라지지 않게).
  const revokeGroup = async (g: { name: string; ids: string[] }) => {
    if (g.ids.length === 0) return;
    if (!window.confirm(`${g.name}의 미사용 이용권 ${g.ids.length}장을 회수할까요?\n\n`
      + '회수하면 손님 지갑에서 사용할 수 없게 되고, 손님에게 회수 알림이 갑니다.\n'
      + '이미 사용된 이용권은 회수되지 않고 내역으로 남습니다.')) return;
    setBusy(true);
    const r = await revokeVouchers(g.ids);
    reportBulk('회수', r); setBusy(false); reload();
  };
  // 삭제는 '미사용분'만 넘긴다 — 사용 완료분은 서버가 거절하고(손님 내역·장부 연동 보존),
  // 예전엔 used 까지 함께 넘겨 사용 기록이 통째로 증발했다(2026-08-29 실측).
  const deleteGroup = async (g: { name: string; ids: string[]; usedCount: number }) => {
    if (g.ids.length === 0) { toast.show('삭제할 미사용 이용권이 없습니다 — 사용 완료분은 내역으로 보존됩니다', 'info'); return; }
    if (!window.confirm(`${g.name}의 미사용 이용권 ${g.ids.length}장을 완전히 삭제할까요? 되돌릴 수 없습니다.`
      + (g.usedCount > 0 ? `\n\n사용 완료 ${g.usedCount}장은 이용 내역이라 삭제되지 않습니다.` : ''))) return;
    setBusy(true);
    const r = await deleteVouchers(g.ids);
    reportBulk('삭제', r); setBusy(false); reload();
  };

  // 킬스위치 OFF — 진입점이 다 숨겨진 뒤에도 딥링크·구 탭 상태로 여기까지 오는 경로가 있을 수 있다.
  // '기능이 잠시 꺼졌다'를 말해 주는 것이 빈 화면·조용한 실패보다 낫다(레코드는 그대로 보존).
  if (!idOn) {
    return (
      <div className="rounded-card border border-border-default bg-surface-low p-6 text-center">
        <Icon name="ticket" size={22} className="mx-auto text-ink-muted" />
        <p className="mt-2 text-sm font-bold text-ink-primary">매장이용권은 현재 비활성화되어 있습니다</p>
        <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">
          본인인증 준비가 끝나면 다시 열립니다. 발행·보유 기록은 그대로 보관되어 있으며 삭제되지 않았습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 0) 이용 내역 — 실시간(발급·사용). 장부/이용권 권한 직원도 열람 — 기본 열림 */}
      <div className="rounded-card border border-border-default bg-surface-low p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-accent-300"><Icon name="ticket" size={14} /> 이용 내역 <span className="font-normal text-ink-muted">· 실시간</span></p>
          <button type="button" onClick={reload} disabled={loading}
            className="inline-flex h-7 items-center gap-1 rounded-input border border-border-subtle bg-surface-high/60 px-2 text-2xs font-bold text-ink-secondary hover:text-ink-primary disabled:opacity-50">
            <Icon name="refresh" size={12} className={loading ? 'animate-spin' : ''} /> 새로고침
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
                  <Icon name={e.t === 'used' ? 'arrow-down-left' : 'arrow-up-right'} size={10} className="mr-0.5 inline-block align-[-1px] shrink-0" />{e.t === 'used' ? '사용(받음)' : '발급(보냄)'}
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
            <span className="text-xs font-bold text-accent-300">매장이용권 발급 <span className="font-normal text-ink-muted">· 업주 전용</span>{quota !== null && <span className={['ml-1.5 rounded-badge px-1.5 py-0.5 font-bold', quota < 50 ? 'bg-danger/15 text-danger-light' : 'bg-surface-high text-ink-secondary'].join(' ')}>잔여 한도 {quota.toLocaleString()}개</span>}</span>
            <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', issueOpen ? 'rotate-180' : ''].join(' ')} />
          </button>
          {issueOpen && (
            <div className="space-y-1.5 px-2.5 pb-2.5">
              {!isAdmin && !approved && (
                <p className="flex items-start gap-1.5 rounded-input border border-danger/40 bg-danger/[0.08] px-2 py-1.5 text-2xs text-danger-light"><Icon name="alert" size={12} className="mt-0.5 shrink-0" /> 운영자 승인 후 발급할 수 있습니다.</p>
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
              {/* 유효기간(선택) — 비우면 무기한. 만료 이용권은 사용 RPC 가 서버에서 거부하고
                  손님 지갑에서도 자동 제외된다(스키마 확장 2026-08-17). */}
              <label className="flex items-center gap-2 text-2xs text-ink-secondary">
                <span className="shrink-0 font-semibold">유효기간</span>
                <input type="date" value={expiry} min={new Date(Date.now() + 86400000).toLocaleDateString('en-CA')}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="input h-9 w-40 text-sm tabular-nums" aria-label="이용권 만료일(선택)" />
                {expiry ? (
                  <button type="button" onClick={() => setExpiry('')} className="hit shrink-0 text-2xs text-ink-muted hover:text-danger-light">지우기</button>
                ) : (
                  <span className="text-ink-muted">비우면 무기한</span>
                )}
              </label>
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
                      <span className="self-center text-2xs text-ink-muted">최근:</span>
                      {recentRecipients.map((r) => (
                        <button key={r.id} type="button" onClick={() => pickRecv(r)}
                          className="inline-flex items-center gap-1 rounded-full border border-accent-400/30 bg-accent-300/[0.06] px-2 py-0.5 text-[11px] text-ink-secondary hover:border-accent-400/60 hover:text-accent-300">
                          <Icon name="user" size={11} /> {r.display}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input value={idInput} onChange={(e) => setIdInput(e.target.value)} autoFocus
                      role="combobox" aria-expanded={cands.length > 0} aria-autocomplete="list"
                      onKeyDown={(e) => {
                        // ⚠ 한글 조합 중의 확정 Enter 가 여기 들어오면, 화살표로 고르지도 않은 후보에게
                        //   이용권이 발급된다(activeIdx 가 남아 있으면 pickRecv 가 그대로 실행된다).
                        if (e.nativeEvent.isComposing) return; // 한글 조합 확정 Enter 를 제출로 오인하지 않게
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
                              <Icon name="user" size={12} className="shrink-0 text-ink-muted" />
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{c.display}</span>
                              {unverified && <span className="shrink-0 rounded bg-danger/15 px-1.5 py-0.5 text-2xs font-bold text-danger-light">미인증 · 발급 불가</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : idInput.trim() ? (
                    <p className="px-1 text-2xs text-ink-muted">일치하는 회원이 없습니다 — {recvMode === 'phone' ? '전화번호' : '아이디(닉네임)'}를 확인하세요.</p>
                  ) : null}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setRecvMode('id')} className="btn-ghost inline-flex flex-1 items-center justify-center gap-1 text-2xs"><Icon name="user" size={12} /> 아이디(닉네임)로 지정</button>
                  <button type="button" onClick={() => setRecvMode('phone')} className="btn-ghost inline-flex flex-1 items-center justify-center gap-1 text-2xs"><Icon name="phone" size={12} /> 전화번호로 지정</button>
                </div>
              )}
              <button type="button" disabled={busy || (!isAdmin && !approved)} onClick={issue} className="btn-primary w-full text-sm disabled:opacity-50">{busy ? '배포 중…' : `+ ${count}개 발급${recvDisplay ? ` → ${recvDisplay}` : ''}`}</button>
              <p className="text-2xs text-ink-muted">1회 최대 1000개 · 아이디(닉네임)로 손님 지정 시 그 회원 지갑으로. 미지정이면 매장 보관용. 손님은 ‘사용하기 → 매장 QR 스캔’으로 사용합니다. <b className="text-ink-secondary">매장이용권은 금전적 가치가 없습니다.</b></p>

              {/* W2-1 VCH-1: 유상 충전(구매) 요청 UI 제거 — 이용권이 '상금 재원' 성격을 갖지 않게(§12-A-2).
                  서버(request_voucher_credit·admin_decide approve)도 봉쇄됨. 한도는 운영자 문의로만. */}
              {quota !== null && quota < count && (
                <p className="rounded-input border border-border-subtle bg-surface-low p-2 text-2xs text-ink-muted">
                  한도 추가는 <b className="text-ink-secondary">운영자 문의</b> (유상 충전 종료).
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-input border border-border-subtle bg-surface-low p-2.5 text-2xs text-ink-muted">배포·회수·삭제는 <b className="text-ink-secondary">업주</b> 전용 — 직원은 열람·사용 처리만.</p>
      )}

      {/* 2) QR 코드 — 접기 */}
      {canIssue && qr && (
        <div className="rounded-input border border-accent-400/30 bg-accent-300/[0.05]">
          <button type="button" onClick={() => setQrOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-xs font-bold text-accent-300">매장 QR <span className="font-normal text-ink-muted">· 이용권 · 출석 체크인 · 회원가입</span></span>
            <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', qrOpen ? 'rotate-180' : ''].join(' ')} />
          </button>
          {qrOpen && (
            <div className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-ink-secondary">이용권 사용 QR</p>
                  <img src={qr} alt="매장 이용권 QR" width={130} height={130} className="rounded bg-white p-1.5" />
                  <p className="text-center text-2xs leading-tight text-ink-muted">손님이 스캔해 사용 (고정)</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-ink-secondary">출석 체크인 QR</p>
                  {checkinQr && <img src={checkinQr} alt="출석 체크인 QR" width={130} height={130} className="rounded bg-white p-1.5" />}
                  <p className="text-center text-2xs leading-tight text-ink-muted">손님 스캔 → 출석 도장 · 출석왕 집계 (고정)</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-ink-secondary">회원가입 QR</p>
                  {signupQr && <img src={signupQr} alt="회원가입 QR" width={130} height={130} className="rounded bg-white p-1.5" />}
                  <p className="text-center text-2xs leading-tight text-ink-muted">스캔 시 회원가입 페이지로 이동</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-center text-2xs font-bold text-ink-secondary">바인 요청 QR</p>
                  {buyinQr && <img src={buyinQr} alt="바인 요청 QR" width={130} height={130} className="rounded bg-white p-1.5" />}
                  <p className="text-center text-2xs leading-tight text-ink-muted">손님 스캔 → 참가 요청 → 장부에서 승인</p>
                </div>
              </div>
              {/* 인쇄할 QR 선택 — 종이가 작아 한꺼번에 안 됨. 1~3개 선택 */}
              <div className="mt-3 rounded-input border border-border-subtle bg-surface-low p-2">
                <p className="mb-1.5 text-2xs font-bold text-ink-secondary">인쇄할 QR 선택 (1~3개)</p>
                <div className="flex flex-wrap gap-1.5">
                  {QR_DEFS.map((q) => {
                    const on = printSel[q.id];
                    return (
                      <button key={q.id} type="button" onClick={() => togglePrint(q.id)}
                        className={['inline-flex items-center gap-1 rounded-badge border px-2 py-1 text-2xs font-bold transition-colors',
                          on ? 'border-accent-400/50 bg-accent-300/15 text-accent-300' : 'border-border-default bg-surface-high text-ink-muted'].join(' ')}>
                        {on && <Icon name="check" size={11} className="shrink-0" />} {q.title}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={printQr} className="btn-ghost mt-2 inline-flex w-full items-center justify-center gap-1.5 px-3 text-2xs"><Icon name="printer" size={13} /> 선택한 QR 출력해 매장에 비치</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3) 보유자 현황·통계 — 업주 전용, 기본 접힘 */}
      {canIssue && (
        <button type="button" onClick={() => setOwnerOpen((v) => !v)} aria-expanded={ownerOpen}
          className="flex w-full items-center justify-between gap-2 rounded-input border border-border-subtle bg-surface-low px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-ink-secondary"><Icon name="chart" size={14} /> 보유자 현황·통계 <span className="font-normal text-ink-muted">· 업주 전용</span></span>
          <Icon name="chevron-down" size={14} className={['shrink-0 text-ink-muted transition-transform', ownerOpen ? 'rotate-180' : ''].join(' ')} />
        </button>
      )}
      {canIssue && ownerOpen && stats && (
        <div className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.07] via-surface-low to-surface-low p-3 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['users', stats.holderCount, '보유 회원', 'text-ink-primary'],
              ['ticket', stats.activeCount + stats.usedCount, '활성 이용권', 'text-ink-primary'],
              ['check-circle', stats.activeCount, '잔여 이용권', 'text-emerald-300'],
            ] as const).map(([icon, val, label, cls]) => (
              <div key={label} className="rounded-input border border-border-subtle/60 bg-surface-base/60 p-2.5 text-center">
                <Icon name={icon} size={14} className="mx-auto text-ink-muted" />
                <p className={['mt-1 text-2xl font-extrabold tabular-nums leading-none', cls].join(' ')}>{val}</p>
                <p className="mt-1 text-2xs text-ink-muted">{label}</p>
              </div>
            ))}
          </div>
          {(stats.activeCount + stats.usedCount) > 0 && (
            <div>
              <div className="flex items-baseline justify-between text-2xs text-ink-muted">
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

      {/* #4(오너 지시 2026-08-29) '사용처 TOP' 제거 — 이용권은 매장마다 개별이고, 서버의 사용 경로
          3개(redeem_my_voucher / _by_qr / _by_phone)가 모두 used_venue_id := venue_id 로 고정한다.
          즉 이 목록은 구조적으로 '우리 매장' 한 줄뿐이고, '타 매장' 배지는 절대 켜지지 않는 죽은 분기였다
          (라이브 실측 2026-08-29: store_vouchers 101건 중 used_venue_id <> venue_id 인 행 0건).
          매장 간 사용이라는 없는 개념을 화면이 암시하던 유일한 자리였다.
          사용 건수 자체는 바로 위 '활성/잔여 이용권 + 사용률' 카드가 이미 보여 준다 — 정보 손실 0. */}

      <div className={canIssue && ownerOpen ? '' : 'hidden'}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-ink-secondary">보유자 현황</p>
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
                        <p className="text-2xs text-ink-muted">보유 {g.active.length}개{g.used.length > 0 && <> · 사용 {g.used.length}회</>}</p>
                      </button>
                      <span className="shrink-0 rounded-badge bg-accent-300/15 px-2 py-0.5 text-xs font-bold text-accent-300 tabular-nums">{g.active.length}</span>
                      {!g.isStore && <button type="button" onClick={() => setExpanded(open ? null : g.key)} className="btn-ghost shrink-0 px-2 text-2xs text-ink-secondary">{open ? '닫기' : '관리'}</button>}
                      {(isAdmin || g.isStore) && canIssue && <button type="button" disabled={busy} onClick={() => deleteGroup({ name: holderLabel(g), ids: g.active.map((v) => v.id), usedCount: g.used.length })} aria-label="삭제" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input text-ink-muted hover:text-danger-light disabled:opacity-50"><Icon name="trash" size={13} /></button>}
                    </div>
                    {open && !g.isStore && (
                      <div className="border-t border-border-subtle px-3 py-1.5">
                        {/* 회수 — 잘못 보낸 이용권을 되돌리는 유일한 수단(2026-08-29 신설).
                            미사용분에만 걸리고, 사용 완료분은 아래 내역으로 그대로 남는다. */}
                        {canIssue && (
                          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border-subtle pb-1.5">
                            <p className="min-w-0 flex-1 text-2xs leading-relaxed text-ink-muted">
                              잘못 보냈나요? <b className="text-ink-secondary">미사용 {g.active.length}장</b>을 회수할 수 있어요
                              {g.used.length > 0 && <> · 사용 완료 {g.used.length}장은 내역으로 보존</>}
                            </p>
                            <button type="button" disabled={busy || g.active.length === 0}
                              onClick={() => revokeGroup({ name: holderLabel(g), ids: g.active.map((v) => v.id) })}
                              className="inline-flex h-11 shrink-0 items-center rounded-input border border-danger/40 bg-danger/[0.08] px-3.5 text-2xs font-bold text-danger-deep transition-colors hover:bg-danger/15 disabled:opacity-40 dark:text-danger-light">
                              회수
                            </button>
                          </div>
                        )}
                        <p className="mb-0.5 text-2xs font-bold text-ink-muted">이 매장 이용내역{g.used.length > 0 ? ' (최근순)' : ''}</p>
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
