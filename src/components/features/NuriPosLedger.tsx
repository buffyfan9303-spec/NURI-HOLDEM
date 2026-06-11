// src/components/features/NuriPosLedger.tsx
import { useIsDesktop } from '../../lib/responsive';
// NURI POS 장부 — 표(table) 형태. 장부 입장 시 세션 설정(담당직원·게임·단가·이벤트·딜러) → 보드.
// 셀 2-Tap 입력(결제수단 + 완납/미수/가게지원). 티켓·지원은 미수 불가. 미수=붉은색.
// 8바인 초과 시 가로 스크롤. 비고 컬럼 수기 입력. 장부 마감=읽기전용 스냅샷+메모. 엑셀 내보내기.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../atoms/Toast';
import DateTimePicker from '../atoms/DateTimePicker';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../atoms/Icon';
import {
  type LedgerBuyin, type LedgerSession, type LedgerPlayer, type PaymentMethod, type LedgerSessionListItem, type DiscountPreset, type EarlyType,
  visitorLabel, wonToMan, WON_PER_MAN, buyinFinance, earlyTypeOf, setBuyinEarly,
  getLedgerSession, saveLedgerSession, openLedgerSession, closeLedgerSession, reopenLedgerSession, deleteLedgerSession,
  setRegistrationClosed, getLastLedgerSettings, getLedgerSessionList, getLedgerAccessUserIds, notifyLedgerOpen,
  getLedgerBuyins, upsertBuyin, upsertBuyinSplit, cancelBuyin,
  getLedgerPlayers, addLedgerPlayer, updateLedgerPlayer, renameLedgerPlayer, removeLedgerPlayer,
  searchRegisteredPlayers, type RegisteredPlayer,
  subscribeLedger, posHasPassword, getLedgerPresets, type LedgerPreset,
} from '../../api/ledger';
import { getStaffSchedule, addStaffShift } from '../../api/staffSchedule';
import { getVenueRankings } from '../../api/rankings';
import { exportLedgerXls } from '../../lib/ledgerExport';
import { getSchedules, type Schedule } from '../../api/schedules';
import { getClockState, saveClockState, defaultClockConfig, type ClockState } from '../../api/clock';
import { getMyVenueStaff, type User } from '../../api/auth';
import { accrueVoucher } from '../../api/vouchers';
import { useBackClose } from '../../lib/backstack';
import EmptyState from '../atoms/EmptyState';

const today = () => new Date().toLocaleDateString('en-CA'); // 로컬 날짜 — UTC 자정 넘김 방지
const shiftDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };

// 얼리 설정용 숫자 입력(라벨 + 접미사)
function EarlyNum({ label, value, onChange, suffix, disabled }: { label: string; value: number; onChange: (n: number) => void; suffix: string; disabled?: boolean }) {
  return (
    <div>
      <span className="block text-2xs text-ink-muted mb-0.5">{label}</span>
      <div className="relative">
        <input type="number" inputMode="numeric" value={value || ''} disabled={disabled}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
          className="input w-full text-sm pr-8 tabular-nums disabled:opacity-50" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted pointer-events-none">{suffix}</span>
      </div>
    </div>
  );
}

// 금액은 만원 단위 입력/표시 (천원=0.1만 까지 허용)
const manVal   = (won: number): number | '' => (won ? won / WON_PER_MAN : '');
const parseMan = (v: string): number => Math.max(0, Math.round((parseFloat(v) || 0) * WON_PER_MAN));

const METHOD_SHORT: Record<PaymentMethod, string> = { ticket: 'T', cash: '현', transfer: '이', card: '카', support: '지원' };
// 유형 빠른 선택(고정) + 직접입력은 별도
const VISITOR_OPTS: { code: string; label: string }[] = [
  { code: 'new', label: '신규방문' }, { code: 'regular', label: '기존손님' },
  { code: 'staff', label: '관계자' }, { code: 'other', label: '기타' },
];

function hhmm(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return ''; }
}

interface SelectedCell { playerName: string; entryNo: number; buyin: LedgerBuyin | null; }

/** 게임관리 '장부' 바로가기 시드 — 연결 장부가 있으면 그 날짜로 바로, 없으면 포스터 정보 프리필로 새 등록 */
export interface LedgerSeed {
  date: string;          // 열 장부 날짜(연결 장부 날짜 or 포스터 날짜)
  scheduleId: string;
  isNew: boolean;        // true=연결 장부 없음 → 시작 설정에 포스터 프리필
  title?: string;
  buyinAmount?: number;
  gtd?: boolean;
}

export default function NuriPosLedger({ venueId, canManage, venueName = 'NURI POS', onMakeRankingDraft, onOpenClock, onOpenStats, seed }: {
  venueId: string; canManage: boolean; venueName?: string;
  onMakeRankingDraft?: (date: string, names: string[]) => void;
  onOpenClock?: (date: string) => void;
  /** 마감 후 '주간 리포트 보기' — 통계 섹션으로 이동(업주/운영자만 전달) */
  onOpenStats?: () => void;
  /** 게임관리에서 '장부' 버튼으로 진입 시 — 해당 포스터의 장부로 바로 이동/등록 */
  seed?: LedgerSeed | null;
}) {
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const operatorOk = isAdmin || !!user?.approved; // 담당직원: 승인된 계정만 운영
  const operatorName = user?.name ?? user?.nickname ?? '담당직원';

  const [date, setDate]       = useState(today);
  const [session, setSession] = useState<LedgerSession>({ venueId, sessionDate: today(), buyinAmount: 0, cardAmount: null, gameType: 'gtd', targetEntries: 0, maxEntries: 0, isAddon: false, addonStack: 0, regClosed: false, closed: false, discounts: [], earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null });
  const [buyins, setBuyins]   = useState<LedgerBuyin[]>([]);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPw, setHasPw]     = useState(false);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [query, setQuery]     = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string | null>('regular'); // 기본 선택: 기존손님
  const [suggest, setSuggest] = useState<RegisteredPlayer[]>([]); // 가입자 검색 결과(바인 계정 연동)
  const [closeOpen, setCloseOpen] = useState(false);
  const [editOpen, setEditOpen]   = useState(false);
  const [editPlayer, setEditPlayer] = useState<LedgerPlayer | null>(null);
  const [prefill, setPrefill]     = useState<Partial<LedgerSession> | null>(null);
  const [mode, setMode]           = useState<'list' | 'board'>('list');
  const [sessionList, setSessionList] = useState<LedgerSessionListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listQuery, setListQuery] = useState('');
  const [filterFrom, setFilterFrom] = useState(''); // 기간 필터 시작일
  const [filterTo, setFilterTo]     = useState(''); // 기간 필터 종료일
  const [presets, setPresets] = useState<LedgerPreset[]>([]);
  const [venueSchedules, setVenueSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    getSchedules().then((all) => setVenueSchedules(all.filter((s) => s.venueId === venueId))).catch(() => {});
    getLedgerPresets(venueId, 50).then(setPresets).catch(() => {});
  }, [venueId]);

  // 금일(세션 날짜) 출근자 — 세션 딜러 명단 자동 채움용
  const [scheduledNames, setScheduledNames] = useState<string[]>([]);
  useEffect(() => { getStaffSchedule(venueId, date, date).then((ss) => setScheduledNames([...new Set(ss.map((s) => s.name))])).catch(() => {}); }, [venueId, date]);
  // 세션 딜러 명단 → 출근 스케줄에 등록(추가형)
  const syncDealersToSchedule = useCallback(async (d: string, dealersText?: string) => {
    if (!dealersText) return;
    const names = dealersText.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    for (const n of names) { try { await addStaffShift(venueId, d, n); } catch { /* noop */ } }
  }, [venueId]);
  const scheduleTitle = (id?: string | null) => venueSchedules.find((s) => s.id === id)?.title ?? null;

  const [staff, setStaff] = useState<User[]>([]);
  const [accessIds, setAccessIds] = useState<string[]>([]); // 장부 접근 권한 보유 직원
  useEffect(() => { getMyVenueStaff().then(setStaff).catch(() => {}); }, []);
  useEffect(() => { getLedgerAccessUserIds(venueId).then(setAccessIds).catch(() => {}); }, [venueId]);
  // 현재 사용자가 이 매장 업주/운영자인지(전체 접근). 아니면 장부권한 직원(담당 지정 장부만).
  const fullAccess = isAdmin || (user?.role === 'venue_owner' && user?.venueId === venueId);
  // 담당직원 후보 = 업주/운영자(나) + 장부 접근 권한 직원만(최대 10은 폼에서 제한)
  const operatorOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [];
    if (user) opts.push({ id: user.id, label: `${user.name}${isAdmin ? ' (운영자)' : ' (업주/나)'}` });
    for (const s of staff) if (s.id !== user?.id && accessIds.includes(s.id)) opts.push({ id: s.id, label: `${s.name}${s.staffTitle ? ` · ${s.staffTitle}` : ''}${s.nickname ? ` · @${s.nickname}` : ''}` });
    return opts;
  }, [user, staff, isAdmin, accessIds]);
  const operatorName2 = (id?: string | null) => operatorOptions.find((o) => o.id === id)?.label ?? operatorName;

  const loadList = useCallback(() => {
    setListLoading(true);
    getLedgerSessionList(venueId).then(setSessionList).catch(() => {}).finally(() => setListLoading(false));
  }, [venueId]);
  useEffect(() => { if (mode === 'list') loadList(); }, [mode, loadList]);

  const openBoard = (d: string) => { setDate(d); setMode('board'); };

  // 게임관리 '장부' 바로가기: 연결 장부로 즉시 이동, 없으면 포스터 정보를 시작 설정에 프리필
  // (ref에 대상 날짜를 묶어 — 세션 fetch 타이밍에 이전 날짜 화면이 잠깐 보여도 오적용/유실 없음)
  const seedFillRef = useRef<{ date: string; fill: Partial<LedgerSession> } | null>(null);
  useEffect(() => {
    if (!seed) return;
    if (seed.isNew) {
      seedFillRef.current = {
        date: seed.date,
        fill: {
          title: seed.title, buyinAmount: seed.buyinAmount ?? 0,
          gameType: seed.gtd ? 'gtd' : 'entry', scheduleId: seed.scheduleId,
        },
      };
    }
    setDate(seed.date);
    setMode('board');
  }, [seed]);
  const handleDeleteSession = useCallback(async (d: string) => {
    if (!confirm(`${d} 장부를 삭제할까요?\n바인·명단·세션 기록이 모두 삭제되며 되돌릴 수 없습니다.`)) return;
    try { await deleteLedgerSession(venueId, d); toast.show('장부를 삭제했습니다', 'info'); loadList(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
  }, [venueId, toast, loadList]);

  const reload = useCallback(() => {
    Promise.all([getLedgerBuyins(venueId, date), getLedgerPlayers(venueId, date)])
      .then(([b, p]) => { setBuyins(b); setPlayers(p); }).catch(() => {});
  }, [venueId, date]);
  const reloadSession = useCallback(() => { getLedgerSession(venueId, date).then(setSession).catch(() => {}); }, [venueId, date]);

  useEffect(() => {
    // stale 응답 가드 — 날짜를 빠르게 바꾸면(예: 게임관리 '장부' 바로가기) 이전 날짜의
    // 응답이 늦게 도착해 현재 세션을 빈 값으로 덮어쓰는 race가 난다. cleanup으로 무시.
    let alive = true;
    setLoading(true);
    Promise.all([getLedgerSession(venueId, date), getLedgerBuyins(venueId, date), getLedgerPlayers(venueId, date), posHasPassword(venueId)])
      .then(([s, b, p, pw]) => { if (!alive) return; setSession(s); setBuyins(b); setPlayers(p); setHasPw(pw); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [venueId, date]);

  useEffect(() => subscribeLedger(venueId, reload), [venueId, reload]);

  const closed = session.closed;
  const regClosed = session.regClosed;
  const showSetup = !session.openedAt && !closed && buyins.length === 0 && players.length === 0;

  // 마감 후 다음 액션 바 — 그날 순위가 이미 입력됐는지(미입력이면 입력 유도 강조)
  const [hasRank, setHasRank] = useState<boolean | null>(null);
  useEffect(() => {
    if (!closed) { setHasRank(null); return; }
    let on = true;
    getVenueRankings(venueId, date)
      .then(({ entries }) => { if (on) setHasRank(entries.length > 0); })
      .catch(() => { if (on) setHasRank(null); });
    return () => { on = false; };
  }, [closed, venueId, date]);

  // 다음 게임 바로 작성: 설정 화면일 때 직전 세션 단가/게임명/딜러를 미리 불러옴
  // 게임관리에서 포스터 프리필(seedFill)로 들어왔으면 그게 우선(해당 날짜에서 1회 소비)
  useEffect(() => {
    if (loading) return; // 세션 fetch 중엔 이전 날짜 잔상 기준 판단 금지
    if (!showSetup) {
      setPrefill(null);
      // 그 날짜에 이미 장부가 있으면 포스터 프리필은 폐기(기존 장부 = 그날의 게임)
      if (seedFillRef.current?.date === date) seedFillRef.current = null;
      return;
    }
    if (seedFillRef.current?.date === date) {
      setPrefill(seedFillRef.current.fill);
      seedFillRef.current = null;
      return;
    }
    getLastLedgerSettings(venueId, date).then(setPrefill).catch(() => {});
  }, [loading, showSetup, venueId, date]);

  const cellAt = (name: string, e: number) => buyins.find((b) => b.playerName === name && b.entryNo === e) ?? null;
  const countOf = (name: string) => buyins.filter((b) => b.playerName === name).length;
  const maxEntryOf = (name: string) => buyins.reduce((m, b) => (b.playerName === name && b.entryNo > m ? b.entryNo : m), 0);
  // 바인 컬럼 수 — PC는 10 고정(폭 축소로 한 화면에), 모바일은 "쓰인 최대 바인+1"만 렌더(가로 스크롤 최소화)
  const isDesktopLedger = useIsDesktop();
  const globalMaxEntry = buyins.reduce((m, b) => Math.max(m, b.entryNo), 0);
  const binCols = (isDesktopLedger || globalMaxEntry >= 10) ? 10 : Math.min(10, Math.max(globalMaxEntry + 1, 3));

  // 정렬 — 100명+ 명단에서 빨리 찾기: 등록순(기본)/이름순/바인 많은 순
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'bins'>('recent');
  const rows = useMemo(() => {
    const rosterNames = players.map((p) => p.name);
    const buyinOnly = [...new Set(buyins.map((b) => b.playerName))].filter((n) => !rosterNames.includes(n));
    const base: { name: string; player: LedgerPlayer | null }[] = [
      ...players.map((p) => ({ name: p.name, player: p as LedgerPlayer | null })),
      ...buyinOnly.map((n) => ({ name: n, player: null as LedgerPlayer | null })),
    ];
    const q = query.trim().toLowerCase();
    const filtered = q ? base.filter((r) => r.name.toLowerCase().includes(q)) : base;
    if (sortBy === 'name') return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (sortBy === 'bins') {
      const cnt = (n: string) => buyins.filter((b) => b.playerName === n).length;
      return [...filtered].sort((a, b) => cnt(b.name) - cnt(a.name));
    }
    return filtered;
  }, [players, buyins, query, sortBy]);

  const stats = useMemo(() => {
    let totalBuyins = 0, ticket = 0, ticketUnpaid = 0, revenue = 0, unpaid = 0, support = 0, entries = 0;
    for (const b of buyins) {
      totalBuyins++;
      const f = buyinFinance(b, session);
      revenue += f.paid; unpaid += f.unpaid; entries += f.entry;
      ticket += f.ticketPaid + (b.isSplit ? b.ticketCount : 0); ticketUnpaid += f.ticketUnpaid; support += f.support;
    }
    return { totalBuyins, entries, ticket, ticketUnpaid, revenue, unpaid, support };
  }, [buyins, session]);

  // 플레이어별 총 바이인/미수(금액)
  const playerTotals = (name: string) => {
    let paid = 0, unpaid = 0;
    for (const b of buyins) if (b.playerName === name) { const f = buyinFinance(b, session); paid += f.paid; unpaid += f.unpaid; }
    return { paid, unpaid };
  };

  // ── 액션 ──────────────────────────────────────────────────────────────────
  const handleOpen = async (s: LedgerSession) => {
    try {
      await openLedgerSession(s, s.openedBy ?? null);
      await syncDealersToSchedule(s.sessionDate, s.dealers);
      await reloadSession();
      toast.show('장부를 시작했습니다', 'success');
      // 담당 직원(본인 제외)에게 장부 시작 알림 — 실패해도 장부 흐름엔 영향 없음
      const others = (s.operators ?? []).filter((id) => id && id !== user?.id);
      if (others.length) notifyLedgerOpen(venueId, s.title ?? '', others).catch(() => {});
      // 포스터→장부→클락 원클릭 체인: 시작 직후 클락도 이어서 켤지 한 번만 묻는다
      if (onOpenClock && window.confirm('장부를 시작했습니다.\n클락(토너먼트 타이머)도 같이 켤까요?')) {
        onOpenClock(s.sessionDate);
      }
    }
    catch (e) { toast.show(e instanceof Error ? e.message : '시작 실패', 'error'); }
  };
  const handleEditSave = async (s: LedgerSession) => {
    try { await saveLedgerSession(s); await syncDealersToSchedule(s.sessionDate, s.dealers); setSession((prev) => ({ ...prev, ...s })); setEditOpen(false); toast.show('세션 정보를 저장했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
  };
  const handleClose = async (memo: string) => {
    try {
      await closeLedgerSession(venueId, date, memo);
      await reloadSession();
      setCloseOpen(false);
      // 마감 요약 한 줄 — 바인·매출(실수금)·미수 건수(통계와 동일한 buyinFinance 규칙)
      const fins = buyins.map((b) => buyinFinance(b, session));
      const rev = fins.reduce((s, f) => s + f.paid, 0);
      const unpaidCnt = fins.filter((f) => f.unpaid > 0 || f.ticketUnpaid > 0).length;
      toast.show(`마감 완료 — 오늘 바인 ${buyins.length} · 매출 ${wonToMan(rev)}만${unpaidCnt ? ` · 미수 ${unpaidCnt}건` : ' · 미수 없음'}`, 'success');
    }
    catch (e) { toast.show(e instanceof Error ? e.message : '마감 실패', 'error'); }
  };
  const handleReopen = async () => {
    try { await reopenLedgerSession(venueId, date); await reloadSession(); toast.show('마감을 해제했습니다', 'info'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '해제 실패', 'error'); }
  };
  const handleRegClose = async () => {
    try { await setRegistrationClosed(venueId, date, !regClosed); await reloadSession(); toast.show(!regClosed ? '레지 마감했습니다' : '레지를 다시 열었습니다', 'info'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패했습니다', 'error'); }
  };
  const addPlayer = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      await addLedgerPlayer({ venueId, sessionDate: date, name: n, visitorType: newType, sortOrder: players.length });
      setNewName(''); setNewType('regular'); setAddOpen(false); setSuggest([]); reload();
    } catch (e) { toast.show(e instanceof Error ? e.message : '추가 실패', 'error'); }
  };
  // 가입자 검색(디바운스) — 바인 추가 입력에 누리홀덤 가입자 자동완성
  useEffect(() => {
    if (!addOpen || newName.trim().length < 1) { setSuggest([]); return; }
    const t = window.setTimeout(() => { searchRegisteredPlayers(venueId, newName).then(setSuggest).catch(() => setSuggest([])); }, 250);
    return () => window.clearTimeout(t);
  }, [newName, addOpen, venueId]);
  // 가입자 선택 → 실명(닉네임)으로 장부 기록(강제 아님, 그냥 추가하면 입력값 그대로)
  const pickRegistered = async (rp: RegisteredPlayer) => {
    const label = rp.realName ? `${rp.realName}(${rp.nickname ?? ''})` : (rp.nickname ?? newName.trim());
    try {
      await addLedgerPlayer({ venueId, sessionDate: date, name: label, visitorType: newType, sortOrder: players.length });
      setNewName(''); setSuggest([]); setNewType('regular'); setAddOpen(false); reload();
    } catch (e) { toast.show(e instanceof Error ? e.message : '추가 실패', 'error'); }
  };
  const savePlayer = async (id: string, patch: { visitorType?: string | null; note?: string | null; name?: string }) => {
    try {
      const { name: newName, ...rest } = patch;
      // 이름 변경은 로스터+해당 세션 바인 기록(player_name 키)을 함께 갱신
      if (newName) {
        const cur = players.find((p) => p.id === id);
        if (cur) await renameLedgerPlayer({ id, venueId, sessionDate: date, oldName: cur.name, newName });
      }
      await updateLedgerPlayer(id, rest);
      reload();
    }
    catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
  };
  const removePlayer = async (p: LedgerPlayer, password?: string) => {
    const ids = buyins.filter((b) => b.playerName === p.name).map((b) => b.id);
    try {
      if (ids.length > 0) {
        if (!password) { toast.show('바인 기록 삭제에는 취소 비밀번호가 필요합니다', 'error'); return; }
        for (const id of ids) await cancelBuyin(id, password); // 서버에서 비밀번호 검증
      }
      await removeLedgerPlayer(p.id);
      toast.show('플레이어를 삭제했습니다', 'info'); setEditPlayer(null); reload();
    } catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패(비밀번호 확인)', 'error'); }
  };

  // ── 게임(세션) 리스트 — 장부 진입 첫 화면 ──────────────────────────────────
  if (mode === 'list') {
    const todayStr = today();
    const lq = listQuery.trim().toLowerCase();
    const filtered = sessionList.filter((s) => {
      if (filterFrom && s.sessionDate < filterFrom) return false;
      if (filterTo && s.sessionDate > filterTo) return false;
      if (lq && !`${s.sessionDate} ${s.title ?? ''}`.toLowerCase().includes(lq)) return false;
      return true;
    });
    const hasRange = !!(filterFrom || filterTo);
    return (
      <div className="space-y-3 pb-6">
        {/* 제목은 VenueManageTab 공용 SectionHeader가 렌더 — 여기는 검색+추가 한 행 */}
        <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="장부 검색 (날짜·게임명)" className="input w-full text-sm pl-9" />
        </div>
        <button type="button" onClick={() => openBoard(todayStr)} className="btn-primary text-xs px-3 shrink-0">+ 장부 추가</button>
        </div>

        {/* 기간으로 보기 — 시작~종료 범위의 장부만 표시(필터) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input type="date" value={filterFrom} max={filterTo || todayStr} onChange={(e) => setFilterFrom(e.target.value)} className="input flex-1 text-sm" aria-label="시작일" />
            <span className="text-2xs text-ink-muted shrink-0">~</span>
            <input type="date" value={filterTo} min={filterFrom || undefined} max={todayStr} onChange={(e) => setFilterTo(e.target.value)} className="input flex-1 text-sm" aria-label="종료일" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xs text-ink-muted">{hasRange ? `${filterFrom || '처음'} ~ ${filterTo || '오늘'}` : '기간 설정 시 그 범위만'}</span>
            <button type="button" onClick={() => { setFilterFrom(shiftDays(todayStr, -6)); setFilterTo(todayStr); }} className="text-2xs font-semibold text-gold-300/90 hover:text-gold-300">최근 7일</button>
            <button type="button" onClick={() => { setFilterFrom(todayStr.slice(0, 7) + '-01'); setFilterTo(todayStr); }} className="text-2xs font-semibold text-gold-300/90 hover:text-gold-300">이번 달</button>
            {hasRange && <button type="button" onClick={() => { setFilterFrom(''); setFilterTo(''); }} className="text-2xs text-ink-muted hover:text-ink-secondary ml-auto">전체 보기</button>}
          </div>
        </div>

        {listLoading ? (
          <p className="py-10 text-center text-xs text-ink-muted">불러오는 중…</p>
        ) : sessionList.length === 0 ? (
          <EmptyState title="아직 작성한 장부가 없습니다" hint='"+ 장부 추가"를 누르면 오늘 장부가 열립니다' />
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-ink-muted">{hasRange ? '선택한 기간에 작성된 장부가 없습니다.' : `"${listQuery.trim()}" 검색 결과가 없습니다.`}</p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((s, i) => {
              const canOpen = fullAccess || s.operators.length === 0 || (!!user && s.operators.includes(user.id));
              return (
              <li key={s.sessionDate} className="flex items-center rounded-card border border-border-subtle bg-surface-low hover:border-gold-400/40 transition-colors">
                <button type="button" disabled={!canOpen} onClick={() => canOpen && openBoard(s.sessionDate)}
                  className={['flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left', canOpen ? '' : 'opacity-50 cursor-not-allowed'].join(' ')}>
                  <span className="w-6 shrink-0 text-center text-sm font-bold text-gold-300 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-primary truncate">
                      {s.sessionDate}{s.sessionDate === todayStr ? ' (오늘)' : ''}
                      <span className="font-normal text-ink-secondary"> · {s.title || '게임'}</span>
                    </p>
                    <p className="text-2xs text-ink-muted">바인 {s.buyinAmount.toLocaleString()}원 · {canOpen ? '탭하여 보기·수정' : '담당 미지정 — 접근 권한 없음'}</p>
                  </div>
                  {!canOpen
                    ? <span className="shrink-0 text-sm" aria-label="잠김">🔒</span>
                    : s.closed
                    ? <span className="shrink-0 text-2xs font-bold text-gold-300 bg-gold-300/15 px-2 py-0.5 rounded-badge">마감</span>
                    : s.regClosed
                    ? <span className="shrink-0 text-2xs font-bold text-danger-light bg-danger/10 px-2 py-0.5 rounded-badge">레지마감</span>
                    : <span className="shrink-0 text-2xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-badge">진행중</span>}
                </button>
                {fullAccess && (
                  <button type="button" onClick={() => handleDeleteSession(s.sessionDate)} aria-label={`${s.sessionDate} 장부 삭제`}
                    className="shrink-0 mr-1.5 w-8 h-8 flex items-center justify-center rounded-input text-ink-muted hover:text-danger-light hover:bg-danger/10 transition-colors">
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </li>
            );})}
          </ul>
        )}
      </div>
    );
  }

  if (loading) return <p className="py-10 text-center text-xs text-ink-muted">장부 불러오는 중…</p>;

  // ── 세션 설정(장부 입장 게이트) ────────────────────────────────────────────
  if (showSetup) {
    return (
      <div className="space-y-3">
        <DateBar date={date} setDate={setDate} onBack={() => setMode('list')} />
        {!operatorOk ? (
          <div className="rounded-card border border-danger/40 bg-danger/10 p-4 text-center">
            <p className="text-sm font-bold text-danger-light">승인된 계정만 장부를 운영할 수 있습니다.</p>
            <p className="text-2xs text-ink-muted mt-1">업주 승인 완료 후 이용하세요.</p>
          </div>
        ) : (
          <SessionForm
            base={{ ...session, ...(prefill ?? {}) }} mode="open" operatorName={operatorName}
            prefilled={!!prefill} schedules={venueSchedules} operatorOptions={operatorOptions}
            presets={presets} scheduledDealers={scheduledNames}
            onSubmit={handleOpen}
          />
        )}
      </div>
    );
  }

  // ── 보드 ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-28">
      <DateBar date={date} setDate={setDate} onBack={() => setMode('list')} />

      {/* 세션 요약 */}
      <div className="rounded-card border border-border-default bg-surface-low p-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-ink-primary">{session.title || '세션'}</span>
        <span className="text-2xs text-ink-muted">현금 {wonToMan(session.buyinAmount)}만원
          {session.cardAmount && session.cardAmount > 0 ? ` · 카드 ${wonToMan(session.cardAmount)}만원` : ' · 카드=현금'}</span>
        {session.openedAt && <span className="text-2xs text-ink-muted">· 담당 {operatorName2(session.openedBy)}</span>}
        {scheduleTitle(session.scheduleId) && <span className="text-2xs text-gold-300 font-semibold">· 대회 {scheduleTitle(session.scheduleId)}</span>}
        <span className="flex-1" />
        {onOpenClock && <button type="button" onClick={() => onOpenClock(date)} className="btn-ghost text-sm px-3.5 py-2 font-semibold">⏱ 클락</button>}
        {!closed && <button type="button" onClick={() => setEditOpen(true)} className="btn-ghost text-sm px-3.5 py-2 font-semibold">세션 정보 수정</button>}
      </div>

      {closed && (
        <div className="rounded-card border border-gold-400/40 bg-gold-300/10 p-2.5 flex items-center gap-2">
          <span className="text-xs font-bold text-gold-300">마감됨 (읽기전용){session.closedAt ? ` · ${hhmm(session.closedAt)}` : ''}</span>
          {session.closeMemo && <span className="text-2xs text-ink-secondary truncate">메모: {session.closeMemo}</span>}
          <span className="flex-1" />
          {canManage && <button type="button" onClick={handleReopen} className="btn-ghost text-2xs px-2.5 py-1">마감 해제</button>}
        </div>
      )}

      {/* 마감 직후 다음 단계 — 순위 입력(참가자 명단 프리필) → 주간 리포트. 마감→정산 동선을 클릭 1번으로 */}
      {closed && (onMakeRankingDraft || onOpenStats) && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-card border border-border-subtle bg-surface-low p-2">
          <span className="px-1 text-2xs font-bold text-ink-muted">다음 단계</span>
          {onMakeRankingDraft && (
            <button type="button"
              onClick={() => {
                const rosterNames = players.map((p) => p.name);
                const extra = [...new Set(buyins.map((b) => b.playerName))].filter((n) => !rosterNames.includes(n));
                onMakeRankingDraft(date, [...rosterNames, ...extra]); // 명단 없어도 날짜는 맞춰 이동
              }}
              className={hasRank === false
                ? 'btn-primary px-3 py-1.5 text-xs'
                : 'btn-ghost px-3 py-1.5 text-xs text-gold-300'}>
              🏆 순위 입력하기{hasRank === false ? ' (미입력)' : hasRank ? ' · 입력됨 ✓' : ''}
            </button>
          )}
          {onOpenStats && (
            <button type="button" onClick={onOpenStats} className="btn-ghost px-3 py-1.5 text-xs">📊 주간 리포트 보기</button>
          )}
        </div>
      )}

      {/* 검색 + 유저 추가 */}
      {!closed && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="플레이어 검색"
                className="input w-full text-sm pl-8" />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="9" cy="9" r="6" /><line x1="14" y1="14" x2="18" y2="18" strokeLinecap="round" />
              </svg>
            </div>
            {/* 정렬 — 100명+ 명단 빨리 찾기: 등록순/이름순/바인순 */}
            <div className="flex shrink-0 items-center rounded-input border border-border-default bg-surface-high p-0.5">
              {([['recent', '등록순'], ['name', '가나다'], ['bins', '바인순']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setSortBy(k)}
                  className={['rounded-[6px] px-2 py-1.5 text-xs font-bold transition-colors',
                    sortBy === k ? 'bg-gold-300 text-ink-inverse' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
                  {label}
                </button>
              ))}
            </div>
            {regClosed
              ? <span className="shrink-0 self-center text-2xs font-bold text-danger-light px-2">레지 마감</span>
              : <button type="button" onClick={() => setAddOpen((v) => !v)} className="btn-primary text-xs px-3 shrink-0">+ 유저 추가</button>}
          </div>

          {addOpen && !regClosed && (
            <div className="rounded-input border border-border-default bg-surface-low p-2 space-y-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } }}
                placeholder="닉네임/이름 (입력 시 가입자 자동완성)" maxLength={20} className="input w-full text-sm" autoFocus />
              {suggest.length > 0 && (
                <ul className="max-h-44 space-y-1 overflow-y-auto rounded-input border border-gold-400/30 bg-surface-base/60 p-1">
                  <li className="px-1 text-[10px] text-ink-muted">누리홀덤 가입자 — 선택 시 실명(닉네임)으로 기록(선택 안 하고 추가하면 입력값 그대로)</li>
                  {suggest.map((rp) => (
                    <li key={rp.userId}>
                      <button type="button" onClick={() => pickRegistered(rp)} className="flex w-full items-center justify-between gap-2 rounded-input px-2 py-1.5 text-left hover:bg-surface-high">
                        <span className="min-w-0 truncate text-xs font-semibold text-ink-primary">{rp.realName ? `${rp.realName}(${rp.nickname ?? '-'})` : (rp.nickname ?? '-')}</span>
                        <span className="shrink-0 text-[10px] text-ink-muted">방문 {rp.visits}회</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-2xs text-ink-muted">유형(선택):</span>
                {VISITOR_OPTS.map((t) => (
                  <button key={t.code} type="button" onClick={() => setNewType((cur) => (cur === t.code ? null : t.code))}
                    className={['text-2xs font-bold px-2 py-1 rounded-badge border transition-colors',
                      newType === t.code ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                    {t.label}
                  </button>
                ))}
                <button type="button"
                  onClick={() => { const v = window.prompt('유형 직접입력'); if (v && v.trim()) setNewType(v.trim()); }}
                  className={['text-2xs font-bold px-2 py-1 rounded-badge border transition-colors',
                    newType && !VISITOR_OPTS.some((o) => o.code === newType) ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                  {newType && !VISITOR_OPTS.some((o) => o.code === newType) ? newType : '직접입력'}
                </button>
                <span className="flex-1" />
                <button type="button" onClick={addPlayer} disabled={!newName.trim()} className="btn-primary text-xs px-4 disabled:opacity-50">추가</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 표 보드 */}
      {rows.length === 0 ? (
        <p className="py-10 text-center text-xs text-ink-muted">{query ? '검색 결과가 없습니다.' : '유저를 추가하면 바인을 입력할 수 있습니다.'}</p>
      ) : (
        <div
          // 휠 = 순수 세로 스크롤(가로 변환 제거 — 대각선 이동 방지). PC는 10바인 한 화면이라 가로 휠 불필요.
          // overscroll-contain 금지: 표에 스크롤할 내용이 없을 때 표 위에서 페이지 스크롤까지 막아버린다.
          // 표 안 스크롤이 끝나면 페이지로 이어지는 건 브라우저 표준 동작으로 둔다.
          className="overflow-auto max-h-[70vh] [-webkit-overflow-scrolling:touch] rounded-card border border-border-subtle [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5"
        >
          {/* w-max: 칸을 압축하지 않고 고정폭 유지 → 모바일에서 가로 스크롤. min-w-full: 데스크톱은 꽉 채움 */}
          <table className="border-separate border-spacing-0 text-center w-max min-w-full">
            <thead>
              {/* 헤더는 세로 스크롤에도 고정(sticky top) — 100명 명단에서도 바인 번호가 항상 보임 */}
              <tr className="bg-surface-high">
                <th className="sticky left-0 top-0 z-40 bg-surface-high w-9 px-1 py-2 text-xs text-ink-muted border-b border-border-subtle">No</th>
                <th className="sticky left-9 top-0 z-40 bg-surface-high min-w-[6rem] max-w-[9rem] px-2 py-2 text-xs text-ink-muted border-b border-l border-border-subtle text-left">플레이어</th>
                {Array.from({ length: binCols }, (_, i) => (
                  <th key={i} className="sticky top-0 z-30 bg-surface-high w-12 px-0.5 py-2 text-xs text-ink-muted border-b border-l border-border-subtle">{i + 1}바인</th>
                ))}
                <th className="sticky top-0 z-30 bg-surface-high min-w-[4rem] px-2 py-2 text-xs text-ink-muted border-b border-l border-border-subtle text-left">비고</th>
                <th className="sticky right-[4rem] top-0 z-40 bg-surface-high w-[4rem] px-1 py-2 text-xs text-ink-muted border-b border-l border-border-strong">총바인</th>
                <th className="sticky right-0 top-0 z-40 bg-surface-high w-[4rem] px-1 py-2 text-xs text-ink-muted border-b border-l border-border-subtle">미수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const cnt = countOf(r.name);
                const mx = maxEntryOf(r.name);
                const tot = playerTotals(r.name);
                const rowChunks = Math.min(10, Math.max(1, Math.ceil((mx + 1) / 10)));
                return Array.from({ length: rowChunks }, (_, chunk) => {
                  const first = chunk === 0;
                  return (
                    <tr key={`${r.name}-${chunk}`} className={first ? 'border-t-2 border-border-default' : ''}>
                      <td className="sticky left-0 z-10 bg-surface-low w-9 px-1 py-1 text-[10px] text-ink-muted border-b border-border-subtle tabular-nums">{first ? ri + 1 : <span className="opacity-40">↳</span>}</td>
                      <td className="sticky left-9 z-10 bg-surface-low min-w-[6rem] max-w-[9rem] px-2 py-1 border-b border-l border-border-subtle text-left">
                        {first ? (
                          <button type="button" disabled={!r.player || closed} onClick={() => r.player && setEditPlayer(r.player)} className="w-full text-left disabled:cursor-default">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-ink-primary truncate max-w-[5rem]" title={r.name}>{r.name}</span>
                              <span className="text-[9px] text-ink-muted shrink-0">{cnt}회</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {r.player?.visitorType
                                ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-badge bg-gold-300/15 text-gold-300 border border-gold-400/40">{visitorLabel(r.player.visitorType)}</span>
                                : r.player ? <span className="text-[9px] text-ink-muted">{closed ? '' : '유형/비고 +'}</span> : <span className="text-[9px] text-ink-muted">—</span>}
                              {r.player?.note && <span className="text-[9px] text-ink-secondary truncate max-w-[4rem]">· {r.player.note}</span>}
                            </div>
                          </button>
                        ) : <span className="text-[10px] text-ink-muted/50 truncate">{r.name}</span>}
                      </td>

                      {Array.from({ length: binCols }, (_, i) => {
                        const e = chunk * 10 + i + 1;
                        const c = cellAt(r.name, e);
                        const cls = 'w-12 h-[2.6rem] px-0.5 py-0.5 border-b border-l border-border-subtle align-middle';
                        if (e > 100) return <td key={e} className={cls} />;
                        if (c) {
                          const tone = c.paymentMethod === 'support'
                            ? 'border-indigo-400/50 bg-indigo-500/10 text-indigo-300'
                            : c.isUnpaid ? 'border-danger bg-danger/10 text-danger-light'
                            : (c.isSplit || c.discountIndex > 0) ? 'border-gold-400/50 bg-gold-300/10 text-gold-300'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
                          const topLabel = c.isSplit ? '분납' : `${METHOD_SHORT[c.paymentMethod]}${c.isUnpaid ? '·미' : ''}`;
                          const et = earlyTypeOf(c, session);
                          const frac = buyinFinance(c, session).entry; // 할인 반영 엔트리(예: 10만 게임 5만 할인 = 0.5)
                          return (
                            <td key={e} className={cls}>
                              <button type="button" disabled={closed}
                                onClick={() => !closed && setSelected({ playerName: r.name, entryNo: e, buyin: c })}
                                className={['w-full h-full rounded-input border-2 flex flex-col items-center justify-center leading-none', tone, closed ? 'cursor-default' : ''].join(' ')}>
                                <span className="text-[11px] font-extrabold">{topLabel}{(c.discountIndex > 0 || (c.isSplit && c.discountLevel > 0)) ? '*' : ''}</span>
                                {et !== 'none'
                                  ? <span className="text-[7px] font-bold text-amber-300 leading-none">{et === 'double' ? '더블얼리' : '얼리'}</span>
                                  : frac < 0.999
                                  ? <span className="text-[8px] font-bold text-gold-200 leading-none mt-0.5">{frac.toLocaleString(undefined, { maximumFractionDigits: 2 })}엔트리</span>
                                  : <span className="text-[8px] opacity-80 mt-0.5">{hhmm(c.buyinAt)}</span>}
                              </button>
                            </td>
                          );
                        }
                        if (!closed && e <= mx + 1 && e <= 100) {
                          return (
                            <td key={e} className={cls}>
                              <button type="button" onClick={() => setSelected({ playerName: r.name, entryNo: e, buyin: null })}
                                className="w-full h-full rounded-input border-2 border-dashed border-border-default text-ink-muted hover:border-gold-400 hover:text-gold-300 transition-colors flex items-center justify-center text-base font-bold">+</button>
                            </td>
                          );
                        }
                        return <td key={e} className={cls}><div className="w-full h-full rounded-input bg-surface-base/30" /></td>;
                      })}

                      <td className="min-w-[4rem] px-1 py-1 border-b border-l border-border-subtle text-left">
                        {first && r.player ? (
                          <button type="button" disabled={closed} onClick={() => setEditPlayer(r.player as LedgerPlayer)} className="w-full text-left text-2xs disabled:cursor-default">
                            {r.player.note
                              ? <span className="text-ink-secondary line-clamp-2 whitespace-pre-wrap break-words">{r.player.note}</span>
                              : <span className="text-gold-300 font-semibold">{closed ? '—' : '비고 +'}</span>}
                          </button>
                        ) : first ? <span className="text-2xs text-ink-muted">—</span> : null}
                      </td>
                      <td className="sticky right-[4rem] z-10 bg-surface-low w-[4rem] px-1 py-1 border-b border-l border-border-strong text-2xs tabular-nums">
                        {first ? (
                          <span className="leading-tight block">
                            <b className="text-gold-300">{cnt}회</b>
                            <span className="block text-ink-secondary">{wonToMan(tot.paid + tot.unpaid)}만</span>
                          </span>
                        ) : ''}
                      </td>
                      <td className="sticky right-0 z-10 bg-surface-low w-[4rem] px-1 py-1 border-b border-l border-border-subtle text-2xs tabular-nums text-danger-light">{first && tot.unpaid > 0 ? `${wonToMan(tot.unpaid)}만` : ''}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 정산 바 (고정) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-6xl bg-surface-mid border-t border-border-default px-page-x py-2">
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-4 gap-2 flex-1 text-center">
            <Metric label="총 엔트리" value={stats.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
            <Metric label="회수 티켓" value={`${stats.ticket}장`} />
            <Metric label="완납 매출" value={`${wonToMan(stats.revenue)}만`} tone="emerald" />
            <Metric label="미수금" value={`${wonToMan(stats.unpaid)}만`} tone="danger" />
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button type="button" onClick={() => exportLedgerXls({ venueName, session, players, buyins })}
              className="btn-ghost text-2xs px-3 py-1">엑셀</button>
            {!closed ? (
              <div className="flex gap-1">
                <button type="button" onClick={handleRegClose}
                  className={['text-2xs px-2 py-1 rounded-input border font-semibold transition-colors',
                    regClosed ? 'border-danger/40 text-danger-light bg-danger/10' : 'border-border-default text-ink-secondary hover:text-ink-primary'].join(' ')}>
                  {regClosed ? '레지 열기' : '레지 마감'}
                </button>
                <button type="button" onClick={() => setCloseOpen(true)} className="btn-primary text-2xs px-2 py-1">정산 마감</button>
              </div>
            ) : <span className="text-2xs text-gold-300 text-center font-bold px-3 py-1">마감됨</span>}
          </div>
        </div>
        {(stats.support > 0 || stats.ticketUnpaid > 0) && (
          <p className="text-[10px] text-center mt-0.5">
            {stats.ticketUnpaid > 0 && <span className="text-danger-light">티켓 미수 {stats.ticketUnpaid}장</span>}
            {stats.ticketUnpaid > 0 && stats.support > 0 && <span className="text-ink-muted"> · </span>}
            {stats.support > 0 && <span className="text-indigo-300">가게지원 {stats.support}건</span>}
          </p>
        )}
      </div>

      {/* 2-Tap 결제 모달 */}
      {selected && (
        <PaymentModal
          cell={selected} hasPw={hasPw} session={session}
          onClose={() => setSelected(null)}
          onPick={async (method, isUnpaid, discountIndex) => {
            const pn = selected.playerName; const isNew = !selected.buyin;
            try {
              await upsertBuyin({ venueId, sessionDate: date, playerName: pn, entryNo: selected.entryNo, paymentMethod: method, isUnpaid, discountIndex });
              setSelected(null); reload();
              if (isNew && (session.voucherAccrualPerBin ?? 0) > 0) {
                accrueVoucher(venueId, pn, session.voucherAccrualPerBin as number).then((n) => { if (n > 0) toast.show(`${pn}님 이용권 ${n}개 적립`, 'success'); }).catch(() => {});
              }
            } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
          }}
          onPickSplit={async (d) => {
            const pn = selected.playerName; const isNew = !selected.buyin;
            try {
              await upsertBuyinSplit({ venueId, sessionDate: date, playerName: pn, entryNo: selected.entryNo, ...d });
              setSelected(null); reload();
              if (isNew && (session.voucherAccrualPerBin ?? 0) > 0) {
                accrueVoucher(venueId, pn, session.voucherAccrualPerBin as number).then((n) => { if (n > 0) toast.show(`${pn}님 이용권 ${n}개 적립`, 'success'); }).catch(() => {});
              }
            } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
          }}
          onCancelBuyin={async (pw) => {
            if (!selected.buyin) return;
            try { await cancelBuyin(selected.buyin.id, pw); toast.show('바인을 취소했습니다', 'info'); setSelected(null); reload(); }
            catch (e) { toast.show(e instanceof Error ? e.message : '취소 실패', 'error'); }
          }}
          onSetEarly={async (override) => {
            if (!selected.buyin) return;
            try { await setBuyinEarly(selected.buyin.id, override); toast.show('얼리 유형을 변경했습니다', 'success'); setSelected(null); reload(); }
            catch (e) { toast.show(e instanceof Error ? e.message : '변경 실패', 'error'); }
          }}
        />
      )}

      {/* 세션 정보 수정 */}
      {editOpen && (
        <Overlay onClose={() => setEditOpen(false)} title="세션 정보 수정">
          <SessionForm base={session} mode="edit" operatorName={operatorName} schedules={venueSchedules} operatorOptions={operatorOptions} scheduledDealers={scheduledNames} onSubmit={handleEditSave} onCancel={() => setEditOpen(false)} embedded />
        </Overlay>
      )}

      {/* 장부 마감 */}
      {closeOpen && (
        <CloseModal
          stats={stats}
          unpaidPlayers={rows.map((r) => ({ name: r.name, unpaid: playerTotals(r.name).unpaid })).filter((x) => x.unpaid > 0).sort((a, b) => b.unpaid - a.unpaid)}
          onClose={() => setCloseOpen(false)}
          onConfirm={handleClose}
        />
      )}

      {/* 플레이어 편집(유형/비고/삭제) */}
      {editPlayer && (
        <PlayerEditModal
          player={editPlayer}
          recordCount={countOf(editPlayer.name)}
          hasPw={hasPw}
          onClose={() => setEditPlayer(null)}
          onSave={async (patch) => { await savePlayer(editPlayer.id, patch); setEditPlayer(null); }}
          onDelete={(pw) => removePlayer(editPlayer, pw)}
        />
      )}
    </div>
  );
}

// ── 플레이어 편집 모달(이름 수정 + 유형 + 비고 무제한 + 삭제) ─────────────────
function PlayerEditModal({ player, recordCount, hasPw, onClose, onSave, onDelete }: {
  player: LedgerPlayer; recordCount: number; hasPw: boolean;
  onClose: () => void;
  onSave: (patch: { visitorType: string | null; note: string | null; name?: string }) => void;
  onDelete: (password?: string) => void;
}) {
  const isKnown = VISITOR_OPTS.some((o) => o.code === player.visitorType);
  const [name, setName]   = useState(player.name);
  const [type, setType]   = useState<string | null>(player.visitorType ?? null);
  const [custom, setCustom] = useState(player.visitorType && !isKnown ? player.visitorType : '');
  const [note, setNote]   = useState(player.note ?? '');
  const [delMode, setDelMode] = useState(false);
  const [delPw, setDelPw] = useState('');

  const submit = () => {
    const finalType = type === '__custom__' ? (custom.trim() || null) : type;
    const newName = name.trim();
    onSave({ visitorType: finalType, note: note.trim() || null, name: newName && newName !== player.name ? newName : undefined });
  };

  return (
    <Overlay title={`${player.name} · 플레이어 수정`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-2xs text-ink-muted mb-1">이름 (오기 수정 — 바인 기록도 함께 변경됩니다)</p>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
            placeholder="플레이어 이름" className="input w-full text-sm" />
        </div>
        <div>
          <p className="text-2xs text-ink-muted mb-1">유형(선택)</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={type === null} onClick={() => setType(null)}>없음</Chip>
            {VISITOR_OPTS.map((o) => (
              <Chip key={o.code} active={type === o.code} onClick={() => setType(o.code)}>{o.label}</Chip>
            ))}
            <Chip active={type === '__custom__'} onClick={() => setType('__custom__')}>직접입력</Chip>
          </div>
          {type === '__custom__' && (
            <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={20}
              placeholder="유형 직접입력" className="input w-full text-sm mt-2" autoFocus />
          )}
        </div>
        <div>
          <p className="text-2xs text-ink-muted mb-1">비고 (글자수 제한 없음)</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
            placeholder="자유롭게 메모하세요" className="input w-full text-sm resize-none" />
        </div>
        {/* 삭제 — 바인 기록이 없으면 즉시, 있으면 취소 비밀번호로 바인까지 함께 삭제 */}
        {recordCount === 0 ? (
          <button type="button" onClick={() => onDelete()} className="w-full btn-danger text-xs py-2">플레이어 삭제</button>
        ) : !delMode ? (
          <button type="button" onClick={() => setDelMode(true)} className="w-full rounded-input border border-danger/40 py-2 text-xs font-semibold text-danger-light transition-colors hover:bg-danger/10">플레이어 삭제 (바인 {recordCount}건 포함)</button>
        ) : (
          <div className="space-y-1.5 rounded-input border border-danger/40 bg-danger/[0.06] p-2">
            <p className="text-[10px] text-danger-light">바인 {recordCount}건이 함께 삭제됩니다. 취소 비밀번호를 입력하세요.</p>
            <div className="flex gap-1.5">
              <input type="password" inputMode="numeric" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder={hasPw ? '취소 비밀번호' : '비밀번호 미설정'} disabled={!hasPw} className="input min-w-0 flex-1 text-sm" autoFocus />
              <button type="button" onClick={() => onDelete(delPw)} disabled={!hasPw || !delPw} className="btn-danger shrink-0 px-3 text-xs disabled:opacity-50">삭제 확정</button>
              <button type="button" onClick={() => { setDelMode(false); setDelPw(''); }} className="btn-ghost shrink-0 px-2 text-xs">취소</button>
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="btn-ghost text-sm px-4">닫기</button>
          <button type="button" onClick={submit} className="btn-primary text-sm px-4">저장</button>
        </div>
      </div>
    </Overlay>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={['text-2xs font-bold px-2.5 py-1 rounded-badge border transition-colors',
        active ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
      {children}
    </button>
  );
}

// ── 날짜 바 ───────────────────────────────────────────────────────────────────
function DateBar({ date, setDate, onBack }: { date: string; setDate: (d: string) => void; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {onBack && (
        <button type="button" onClick={onBack} className="btn-ghost text-xs px-2 shrink-0" aria-label="목록으로">← 목록</button>
      )}
      <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="input flex-1 text-sm" />
      {date !== today() && <button type="button" onClick={() => setDate(today())} className="btn-ghost text-xs px-3 shrink-0">오늘</button>}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'danger' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'danger' ? 'text-danger-light' : 'text-ink-primary';
  return (
    <div>
      <p className="text-[10px] text-ink-muted leading-none">{label}</p>
      <p className={['text-sm font-bold tabular-nums leading-tight mt-0.5', c].join(' ')}>{value}</p>
    </div>
  );
}

// ── 세션 설정 폼 (입장/수정 공용) ─────────────────────────────────────────────
function SessionForm({ base, mode, operatorName, onSubmit, onCancel, embedded, prefilled, schedules = [], operatorOptions = [], presets = [], scheduledDealers = [] }: {
  base: LedgerSession; mode: 'open' | 'edit'; operatorName: string;
  onSubmit: (s: LedgerSession) => void; onCancel?: () => void; embedded?: boolean; prefilled?: boolean;
  schedules?: Schedule[]; operatorOptions?: { id: string; label: string }[]; presets?: LedgerPreset[]; scheduledDealers?: string[];
}) {
  const [title, setTitle]     = useState(base.title ?? '');
  const [cash, setCash]       = useState<number>(base.buyinAmount || 0);
  const [card, setCard]       = useState<number>(base.cardAmount ?? 0);
  const [target, setTarget]   = useState<number>(base.targetEntries || 0);
  const [gameType, setGameType] = useState<'gtd' | 'entry'>(base.gameType ?? 'gtd');
  const [maxEntries, setMaxEntries] = useState<number>(base.maxEntries || 0);
  const [isAddon, setIsAddon] = useState<boolean>(!!base.isAddon);
  const [addonStack, setAddonStack] = useState<number>(base.addonStack || 0);
  const [voucherIssued, setVoucherIssued] = useState<number>(base.voucherIssued ?? 0);
  const [accrualPerBin, setAccrualPerBin] = useState<number>(base.voucherAccrualPerBin ?? 0);
  const [event, setEvent]     = useState(base.eventMemo ?? '');
  const [dealers, setDealers] = useState(base.dealers ?? (scheduledDealers.length ? scheduledDealers.join('\n') : ''));
  const [schedId, setSchedId] = useState<string>(base.scheduleId ?? '');
  const [operIds, setOperIds] = useState<string[]>(
    base.operators && base.operators.length ? base.operators
    : base.openedBy ? [base.openedBy]
    : operatorOptions[0] ? [operatorOptions[0].id] : [],
  );
  const toggleOper = (id: string) => setOperIds((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : (arr.length >= 10 ? arr : [...arr, id]));
  const [discs, setDiscs]     = useState<DiscountPreset[]>(base.discounts ?? []);
  const [startISO, setStartISO] = useState<string | null>(base.tournamentStart ?? null);
  const [presetOpen, setPresetOpen] = useState(false); // 프리셋 리스트 펼침
  const [autoLinked, setAutoLinked] = useState(false); // 당일 포스터 자동 연동 표시

  // 당일 포스터 자동 연동 — 새 장부 시작 시 그 날짜 포스터가 1개면 즉시 프리필(수정 가능).
  // 포스터→장부→클락 재입력 반복을 제거(사장님 요청: 더 간단하게).
  useEffect(() => {
    if (mode !== 'open' || prefilled || autoLinked || schedId || title.trim()) return;
    const todays = schedules.filter((s) => s.date === base.sessionDate);
    if (todays.length === 1) {
      const sc = todays[0];
      setAutoLinked(true);
      setSchedId(sc.id);
      setTitle(sc.title);
      if (sc.buyIn?.amount) setCash(sc.buyIn.amount);
      setGameType(sc.guaranteed ? 'gtd' : 'entry');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, prefilled, schedules, base.sessionDate]);

  // 연동 클락 얼리 설정(추가스택·레벨) — 장부 시작에서 바로 편집(옵션 1)
  const [clockState, setClockState] = useState<ClockState | null>(null);
  const [earlyBonus, setEarlyBonus] = useState<number>(0);
  const [doubleEarlyBonus, setDoubleEarlyBonus] = useState<number>(0);
  const [earlyDoubleLevel, setEarlyDoubleLevel] = useState<number>(1);
  const [earlySingleLevel, setEarlySingleLevel] = useState<number>(4);
  useEffect(() => {
    let alive = true;
    getClockState(base.venueId).then((st) => {
      if (!alive) return;
      const c = st?.config ?? defaultClockConfig();
      setClockState(st);
      setEarlyBonus(c.earlyBonus ?? 0);
      setDoubleEarlyBonus(c.doubleEarlyBonus ?? 0);
      setEarlyDoubleLevel(c.earlyDoubleLevel ?? 1);
      setEarlySingleLevel(c.earlySingleLevel ?? 4);
    }).catch(() => {});
    return () => { alive = false; };
  }, [base.venueId]);

  const setDisc = (i: number, patch: Partial<DiscountPreset>) =>
    setDiscs((arr) => arr.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const addDisc = () => setDiscs((arr) => (arr.length < 5 ? [...arr, { label: '', amount: 0 }] : arr));
  const removeDisc = (i: number) => setDiscs((arr) => arr.filter((_, idx) => idx !== i));

  // 프리셋 게임 클릭 → 아래 내용 자동입력(수정 가능). 담당직원(operId)은 프리셋과 무관 → 그대로 유지.
  const applyPreset = (p: LedgerPreset) => {
    setTitle(p.title);
    setCash(p.buyinAmount || 0);
    setCard(p.cardAmount ?? 0);
    setTarget(p.targetEntries || 0);
    setDealers(p.dealers ?? '');
    setEvent(p.eventMemo ?? '');
    setDiscs(p.discounts ?? []);
  };

  const submit = () => {
    if (cash <= 0) return;
    const tStart = startISO;
    // 연동 클락 얼리 설정 저장 — 진행 중 클락은 건드리지 않음(비파괴 병합)
    if (!clockState?.running) {
      const baseCfg = clockState?.config ?? defaultClockConfig();
      const cfg = { ...baseCfg, earlyBonus, doubleEarlyBonus, earlyDoubleLevel, earlySingleLevel };
      const next: ClockState = clockState
        ? { ...clockState, config: cfg }
        : { venueId: base.venueId, sessionDate: null, title: base.title ?? '', config: cfg, currentIndex: 0, running: false, endsAt: null, remainingMs: 0, adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0 };
      saveClockState(next).catch(() => {});
    }
    onSubmit({
      ...base, title: title.trim() || undefined,
      buyinAmount: cash, cardAmount: card > 0 ? card : null,
      gameType, targetEntries: gameType === 'gtd' ? target : 0, maxEntries: gameType === 'entry' ? maxEntries : 0,
      isAddon, addonStack: isAddon ? addonStack : 0, voucherIssued, voucherAccrualPerBin: accrualPerBin,
      eventMemo: event.trim() || undefined, dealers: dealers.trim() || undefined,
      scheduleId: schedId || null, openedBy: operIds[0] ?? null, operators: operIds,
      discounts: discs.filter((d) => d.amount > 0),
      earlyDoubleMin: base.earlyDoubleMin ?? 0, earlySingleMin: base.earlySingleMin ?? 0, tournamentStart: tStart,
    });
  };

  return (
    <div className={embedded ? 'space-y-3' : 'rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent p-3 space-y-2.5'}>
      {mode === 'open' && (
        <div>
          <h3 className="text-sm font-bold text-gold-300">장부 시작 설정</h3>
          <p className="text-2xs text-ink-muted mt-0.5">담당직원: <b className="text-ink-secondary">{operatorName}</b> · 아래 정보를 입력 후 장부에 입장합니다.</p>
          {prefilled && <p className="text-xs font-semibold text-emerald-400 mt-0.5">✅ 직전 게임 설정을 불러왔습니다 — 바로 시작하거나 수정하세요.</p>}
          {autoLinked && <p className="text-xs font-semibold text-emerald-400 mt-0.5">✅ 오늘 포스터를 자동으로 연동했습니다 — 게임명·바인·유형이 채워졌어요(수정 가능).</p>}
        </div>
      )}

      {mode === 'open' && presets.length > 0 && (
        <Field label="프리셋 게임 · 클릭하면 아래 내용 자동입력(수정 가능)">
          <button type="button" onClick={() => setPresetOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3.5 py-3 rounded-input border border-gold-400/40 bg-gold-300/10 text-base font-bold text-gold-300 hover:bg-gold-300/15 transition-colors">
            <span>📋 {presetOpen ? '프리셋 닫기' : `프리셋에서 게임 불러오기 (${presets.length})`}</span>
            <span className="text-sm">{presetOpen ? '▲' : '▼'}</span>
          </button>
          {presetOpen && (
            <div className="mt-1 max-h-[13rem] overflow-y-auto rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle">
              {presets.map((p, i) => (
                <button key={i} type="button" onClick={() => { applyPreset(p); setPresetOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-high transition-colors">
                  {i < 3 && <span className="shrink-0 text-2xs font-bold text-gold-300 bg-gold-300/15 px-1.5 py-0.5 rounded-badge">최근</span>}
                  <span className="flex-1 min-w-0 text-sm font-semibold text-ink-primary truncate">{p.title}</span>
                  <span className="shrink-0 text-sm text-ink-muted tabular-nums">{wonToMan(p.buyinAmount)}만</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-muted mt-1">최근 게임 3개가 상단에 표시됩니다. 담당 직원은 프리셋과 무관하게 아래에서 선택하세요.</p>
        </Field>
      )}

      <Field label="금일 게임 내용">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 데일리 딥스택" maxLength={40} className="input w-full text-sm" />
      </Field>

      {schedules.length > 0 && (
        <Field label="기존 포스터 불러오기 · 선택">
          <select value={schedId}
            onChange={(e) => {
              const id = e.target.value; setSchedId(id);
              const sc = schedules.find((s) => s.id === id);
              if (sc) {
                // 포스터 정보 불러오기 — 게임명·바인 단가·게임유형 프리필
                setTitle(sc.title);
                if (sc.buyIn?.amount) setCash(sc.buyIn.amount);
                setGameType(sc.guaranteed ? 'gtd' : 'entry');
              }
            }}
            className="input w-full text-sm">
            <option value="">연결 안 함 / 직접 입력</option>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.date} · {s.title} · 바인 {(s.buyIn?.amount ?? 0).toLocaleString()}</option>)}
          </select>
          <p className="mt-1 text-xs text-ink-muted">선택하면 게임명·바인 단가·유형을 자동으로 불러옵니다(수정 가능).</p>
        </Field>
      )}

      {operatorOptions.length > 0 && (
        <Field label={`담당 직원 · 최대 10명 (${operIds.length} 선택)`}>
          <div className="flex flex-wrap gap-1.5">
            {operatorOptions.map((o) => {
              const on = operIds.includes(o.id);
              return (
                <button key={o.id} type="button" onClick={() => toggleOper(o.id)}
                  className={['text-xs font-semibold px-2.5 py-1.5 rounded-badge border transition-colors',
                    on ? 'bg-gold-300 text-ink-inverse border-gold-300' : 'bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>
                  {on ? '✓ ' : ''}{o.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-ink-muted mt-1">선택한 담당 직원만 이 장부를 열람·운영할 수 있습니다(업주·운영자는 전체 접근). 후보는 장부 접근 권한 직원입니다.</p>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="현금단가(만원) *">
          <input type="number" inputMode="decimal" step="0.1" min="0" value={manVal(cash)} onChange={(e) => setCash(parseMan(e.target.value))} placeholder="10" className="input w-full text-sm tabular-nums" />
        </Field>
        <Field label="카드단가(만원) · 선택">
          <input type="number" inputMode="decimal" step="0.1" min="0" value={manVal(card)} onChange={(e) => setCard(parseMan(e.target.value))} placeholder="미입력=현금단가" className="input w-full text-sm tabular-nums" />
        </Field>
      </div>

      <Field label="할인 이벤트 (최대 5) · 선택">
        <div className="space-y-1.5">
          {discs.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-2xs text-gold-300 font-bold w-9 shrink-0">할인{i + 1}</span>
              <input value={d.label} onChange={(e) => setDisc(i, { label: e.target.value })} maxLength={20} placeholder="예) 1레벨" className="input flex-1 min-w-0 text-sm" />
              <div className="relative w-24 shrink-0">
                <input type="number" inputMode="decimal" step="0.1" min="0" value={manVal(d.amount)} onChange={(e) => setDisc(i, { amount: parseMan(e.target.value) })} placeholder="할인액" className="input w-full text-sm pr-6 tabular-nums" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">만</span>
              </div>
              <button type="button" onClick={() => removeDisc(i)} className="text-ink-muted hover:text-danger-light text-xs px-1 shrink-0">✕</button>
            </div>
          ))}
          {discs.length < 5 && (
            <button type="button" onClick={addDisc} className="w-full py-1.5 rounded-input border border-dashed border-border-default text-2xs text-ink-secondary hover:text-gold-300 hover:border-gold-400/50 transition-colors">+ 할인 추가</button>
          )}
          <p className="text-[10px] text-ink-muted">할인액(만원)만큼 차감해 엔트리를 비례 계산합니다. 예) 10만 게임에 5만 할인 = <b className="text-gold-300">0.5 엔트리</b>, 2만 할인 = 0.8 엔트리.</p>
        </div>
      </Field>

      <Field label="토너먼트 스타트 시각 · 선택 (클락 연동·얼리 판정 기준)">
        <DateTimePicker value={startISO} onChange={setStartISO} defaultDate={base.sessionDate} placeholder="스타트 날짜·시각 선택" />
        <p className="text-[10px] text-ink-muted mt-1 leading-relaxed">
          얼리 구간(더블/1얼리)은 이제 <b className="text-gold-300">「클락」 설정에서 레벨 기준</b>으로 지정합니다(예: 1레벨=더블얼리, 2~4레벨=1얼리). 이 장부를 클락과 연동해 시작하면 위 스타트 시각을 기준으로 바인이 레벨→얼리로 자동 분류되며, 바인 칸에서 '없음'으로 수기 변경도 가능합니다.
          {(base.earlyDoubleMin || base.earlySingleMin) ? <span className="text-gold-300/90"> 현재 적용: 더블 ~{base.earlyDoubleMin}분 · 1얼리 ~{base.earlySingleMin}분.</span> : null}
        </p>
      </Field>

      <Field label="얼리 설정 · 연동 클락 (추가 스택 · 레벨)">
        <div className="grid grid-cols-2 gap-2">
          <EarlyNum label="더블얼리 추가스택" value={doubleEarlyBonus} onChange={setDoubleEarlyBonus} suffix="칩" disabled={!!clockState?.running} />
          <EarlyNum label="1얼리 추가스택" value={earlyBonus} onChange={setEarlyBonus} suffix="칩" disabled={!!clockState?.running} />
          <EarlyNum label="더블얼리 마감레벨" value={earlyDoubleLevel} onChange={setEarlyDoubleLevel} suffix="LV" disabled={!!clockState?.running} />
          <EarlyNum label="1얼리 마감레벨" value={earlySingleLevel} onChange={setEarlySingleLevel} suffix="LV" disabled={!!clockState?.running} />
        </div>
        <p className="text-[10px] text-ink-muted mt-1 leading-relaxed">
          {clockState?.running
            ? '클락이 진행 중이라 얼리 설정은 클락 화면에서만 변경할 수 있습니다.'
            : '여기서 변경하면 연동 클락 설정에 반영됩니다(장부 시작 시 저장). 예) 더블얼리 1LV · 1얼리 4LV.'}
        </p>
      </Field>

      <Field label="게임 유형">
        <div className="grid grid-cols-2 gap-2">
          {([['gtd', 'GTD (보장)'], ['entry', '엔트리 게임']] as const).map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setGameType(k)}
              className={['py-2 rounded-input border text-sm font-bold transition-colors',
                gameType === k ? 'bg-gold-300/15 text-gold-300 border-gold-400/50' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>{lbl}</button>
          ))}
        </div>
      </Field>

      {gameType === 'gtd' ? (
        <Field label="기준 엔트리(통계용) · 선택">
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" value={target || ''} onChange={(e) => setTarget(parseInt(e.target.value, 10) || 0)} placeholder="100" className="input w-32 shrink-0 text-sm tabular-nums" />
            <span className="text-2xs text-ink-muted leading-snug">통계에서 목표 대비 달성률 비교에 사용</span>
          </div>
        </Field>
      ) : (
        <Field label="맥스 엔트리 · 선택">
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" value={maxEntries || ''} onChange={(e) => setMaxEntries(parseInt(e.target.value, 10) || 0)} placeholder="200" className="input w-32 shrink-0 text-sm tabular-nums" />
            <span className="text-2xs text-ink-muted leading-snug">최대 참가 인원 · 무제한이면 비움</span>
          </div>
        </Field>
      )}

      <Field label="애드온 게임 여부">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setIsAddon((v) => !v)}
            className={['px-3 py-2 rounded-input border text-sm font-bold transition-colors shrink-0',
              isAddon ? 'bg-gold-300/15 text-gold-300 border-gold-400/50' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>
            {isAddon ? '✓ 애드온 게임' : '애드온 없음'}
          </button>
          {isAddon ? (
            <div className="relative w-40 shrink-0">
              <input type="number" inputMode="numeric" value={addonStack || ''} onChange={(e) => setAddonStack(parseInt(e.target.value, 10) || 0)}
                placeholder="스택" className="input w-full text-sm pr-7 tabular-nums" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">칩</span>
            </div>
          ) : (
            <span className="text-2xs text-ink-muted leading-snug">애드온이 있으면 켜서 스택을 입력하세요.</span>
          )}
        </div>
        {isAddon && <p className="text-[10px] text-ink-muted mt-1">애드온 스택은 클락에 표시됩니다.</p>}
      </Field>

      <Field label="매장이용권 발행/시상 · 선택 (당일 발급 장수)">
        <div className="relative w-40">
          <input type="number" inputMode="numeric" value={voucherIssued || ''} onChange={(e) => setVoucherIssued(parseInt(e.target.value, 10) || 0)}
            placeholder="0" className="input w-full text-sm pr-7 tabular-nums" />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted pointer-events-none">장</span>
        </div>
        <p className="text-[10px] text-ink-muted mt-1">오늘 발행·시상한 매장이용권 수 — 대시보드 '매장이용권' 카드에 합산됩니다.</p>
      </Field>

      <Field label="바인 1회당 매장이용권 적립 · 선택 (0=사용 안 함)">
        <div className="relative w-40">
          <input type="number" inputMode="numeric" value={accrualPerBin || ''} onChange={(e) => setAccrualPerBin(Math.min(1000, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            placeholder="0" className="input w-full text-sm pr-7 tabular-nums" />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted pointer-events-none">개</span>
        </div>
        <p className="text-[10px] text-ink-muted mt-1">바인할 때마다 그 손님에게 매장이용권을 자동 적립합니다. 닉네임/실명이 회원과 일치하면 손님 지갑으로, 아니면 매장 기록으로 들어가 매장관리에서 동기화됩니다. (운영자 발급 승인 필요)</p>
      </Field>

      <Field label="이벤트 · 비고 · 선택">
        <textarea value={event} onChange={(e) => setEvent(e.target.value)} rows={2} placeholder="예) 1만원 추가 = 1스택 추가" maxLength={200} className="input w-full text-sm resize-none" />
      </Field>

      <Field label="금일 딜러 명단 · 선택">
        <textarea value={dealers} onChange={(e) => setDealers(e.target.value)} rows={2} placeholder="한 줄에 한 명" maxLength={300} className="input w-full text-sm resize-none" />
      </Field>

      <div className="flex gap-2 pt-1">
        {onCancel && <button type="button" onClick={onCancel} className="btn-ghost text-sm flex-1">취소</button>}
        <button type="button" onClick={submit} disabled={cash <= 0} className="btn-primary text-sm flex-1 disabled:opacity-50">
          {mode === 'open' ? '장부 시작' : '저장'}
        </button>
      </div>
      {cash <= 0 && <p className="text-2xs text-danger-light">현금단가를 입력하세요.</p>}
    </div>
  );
}

// 주의: <label> 로 감싸면 라벨 영역 클릭 시 내부 "첫 번째" labelable 요소(button 포함)가
// 활성화되어, 버튼 그룹(담당직원 등)에서 "줄 아무 곳이나 눌러도 첫 번째가 선택"되는 버그가 난다.
// → 컨테이너는 <div> 로, 라벨 텍스트는 <span> 로 둔다.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="block text-sm font-semibold text-ink-secondary mb-1">{label}</span>
      {children}
    </div>
  );
}

// ── 오버레이(모달 셸) ─────────────────────────────────────────────────────────
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // 뒤로가기 → 이 오버레이만 닫기 (중앙 back-stack)
  useBackClose(true, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md mx-4 max-h-[88vh] overflow-y-auto rounded-dialog bg-surface-mid shadow-dialog animate-slide-up">
        <header className="sticky top-0 px-4 py-3 border-b border-border-subtle bg-surface-mid flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-primary">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high">
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ── 2-Tap 결제 입력 모달 ──────────────────────────────────────────────────────
interface SplitInput { cashAmount: number; cardAmount: number; transferAmount: number; ticketCount: number; unpaidAmount: number; discountLevel: number; }

function PaymentModal({ cell, hasPw, session, onClose, onPick, onPickSplit, onCancelBuyin, onSetEarly }: {
  cell: SelectedCell; hasPw: boolean; session: LedgerSession;
  onClose: () => void;
  onPick: (m: PaymentMethod, isUnpaid: boolean, discountIndex: number) => void;
  onPickSplit: (d: SplitInput) => void;
  onCancelBuyin: (pw: string) => void;
  onSetEarly: (override: EarlyType | null) => void;
}) {
  const [cancelMode, setCancelMode] = useState(false);
  const [pw, setPw] = useState('');
  const [discIdx, setDiscIdx] = useState<number>(cell.buyin && !cell.buyin.isSplit ? cell.buyin.discountIndex : 0);
  const discs = session.discounts ?? [];
  const dualMethods: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: '현금' }, { key: 'transfer', label: '이체' }, { key: 'card', label: '카드' },
  ];

  // 분납/할인 상세
  const init = cell.buyin?.isSplit ? cell.buyin : null;
  const [splitMode, setSplitMode] = useState(!!init);
  const [cash, setCash]         = useState<number>(init?.cashAmount ?? 0);
  const [card, setCard]         = useState<number>(init?.cardAmount ?? 0);
  const [transfer, setTransfer] = useState<number>(init?.transferAmount ?? 0);
  const [tkt, setTkt]           = useState<number>(init?.ticketCount ?? 0);
  const [unpaidAmt, setUnpaidAmt] = useState<number>(init?.unpaidAmount ?? 0);
  const [discount, setDiscount] = useState<number>(init?.discountLevel ?? 0);
  const splitTotal = cash + card + transfer + unpaidAmt;
  const canSaveSplit = splitTotal > 0 || tkt > 0;
  const submitSplit = () => onPickSplit({ cashAmount: cash, cardAmount: card, transferAmount: transfer, ticketCount: tkt, unpaidAmount: unpaidAmt, discountLevel: discount });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 뒤로가기 → 결제 모달만 닫기 (중앙 back-stack)
  useBackClose(true, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm mx-4 rounded-dialog bg-surface-mid shadow-dialog animate-slide-up overflow-hidden">
        <header className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-primary">{cell.playerName} · {cell.entryNo}바인</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="p-3 space-y-2">
          {cell.buyin && (
            <div className="flex items-center gap-1.5 flex-wrap pb-2 mb-1 border-b border-border-subtle">
              <span className="text-2xs text-ink-muted">얼리</span>
              {([[null, '자동'], ['double', '더블얼리'], ['single', '1얼리'], ['none', '없음']] as const).map(([v, label]) => {
                const active = (cell.buyin!.earlyOverride ?? null) === v;
                return (
                  <button key={String(v)} type="button" onClick={() => onSetEarly(v)}
                    className={['text-2xs font-bold px-2 py-1 rounded-badge border transition-colors',
                      active ? 'bg-amber-400/20 text-amber-300 border-amber-400/50' : 'bg-surface-high text-ink-muted border-border-default hover:text-ink-secondary'].join(' ')}>{label}</button>
                );
              })}
              <span className="text-[9px] text-ink-muted w-full">
                현재 {(() => { const t = earlyTypeOf(cell.buyin, session); return t === 'double' ? '더블얼리' : t === 'single' ? '1얼리' : '없음'; })()} · {cell.buyin.earlyOverride ? '수기지정' : '시각 자동'}
              </span>
            </div>
          )}
          {!splitMode ? (
            <>
              {/* 할인 선택 (세션 프리셋) */}
              {discs.length > 0 && (
                <div className="pb-2 mb-1 border-b border-border-subtle space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-ink-muted">할인:</span>
                    <button type="button" onClick={() => setDiscIdx(0)}
                      className={['text-xs font-bold px-2.5 py-1.5 rounded-badge border', discIdx === 0 ? 'bg-surface-float text-ink-primary border-border-strong' : 'text-ink-muted border-border-default'].join(' ')}>없음</button>
                    {discs.map((d, i) => (
                      <button key={i} type="button" onClick={() => setDiscIdx(i + 1)}
                        className={['text-xs font-bold px-2.5 py-1.5 rounded-badge border', discIdx === i + 1 ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'text-ink-muted border-border-default'].join(' ')}>
                        {d.label || `할인${i + 1}`} ({wonToMan(d.amount)}만)
                      </button>
                    ))}
                  </div>
                  {discIdx > 0 && session.buyinAmount > 0 && (() => {
                    const da = discs[discIdx - 1]?.amount ?? 0;
                    const ent = Math.max(0, session.buyinAmount - da) / session.buyinAmount;
                    return (
                      <p className="text-2xs text-gold-300">
                        할인 적용 → 이 바인 <b className="text-sm">{ent.toLocaleString(undefined, { maximumFractionDigits: 2 })} 엔트리</b>
                        <span className="text-ink-muted"> = ({wonToMan(session.buyinAmount)}만 − {wonToMan(da)}만) / {wonToMan(session.buyinAmount)}만</span>
                      </p>
                    );
                  })()}
                </div>
              )}

              {/* 티켓: 완납·미수(가불) */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onPick('ticket', false, discIdx)}
                  className="h-12 rounded-input border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-bold text-sm active:scale-95 transition-all hover:bg-emerald-500/20">
                  티켓 완납{discIdx > 0 ? ' ·할인' : ''}
                </button>
                <button type="button" onClick={() => onPick('ticket', true, discIdx)}
                  className="h-12 rounded-input border border-danger/50 bg-danger/10 text-danger-light font-bold text-sm active:scale-95 transition-all hover:bg-danger/20">
                  티켓 미수{discIdx > 0 ? ' ·할인' : ''}
                </button>
              </div>

              {/* 현금/이체/카드: 완납·미수 */}
              {dualMethods.map((m) => (
                <div key={m.key} className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => onPick(m.key, false, discIdx)}
                    className="h-12 rounded-input border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-bold text-sm active:scale-95 transition-all hover:bg-emerald-500/20">
                    {m.label} 완납{discIdx > 0 ? ' ·할인' : ''}
                  </button>
                  <button type="button" onClick={() => onPick(m.key, true, discIdx)}
                    className="h-12 rounded-input border border-danger/50 bg-danger/10 text-danger-light font-bold text-sm active:scale-95 transition-all hover:bg-danger/20">
                    {m.label} 미수{discIdx > 0 ? ' ·할인' : ''}
                  </button>
                </div>
              ))}

              {/* 가게지원 */}
              <button type="button" onClick={() => onPick('support', false, 0)}
                className="w-full h-12 rounded-input border border-indigo-400/50 bg-indigo-500/10 text-indigo-300 font-bold text-sm active:scale-95 transition-all hover:bg-indigo-500/20">
                가게지원
              </button>

              {/* 분납/할인 상세 */}
              <button type="button" onClick={() => setSplitMode(true)}
                className="w-full h-11 rounded-input border border-gold-400/40 text-gold-300 font-semibold text-sm hover:bg-gold-300/10 transition-colors">
                분납 / 할인 상세 입력
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setSplitMode(false)} className="text-2xs text-ink-muted hover:text-ink-primary">← 빠른 입력</button>
                <span className="text-2xs font-semibold text-gold-300">분납 / 할인</span>
              </div>
              <AmountRow label="현금" value={cash} set={setCash} />
              <AmountRow label="카드" value={card} set={setCard} />
              <AmountRow label="이체" value={transfer} set={setTransfer} />
              <AmountRow label="미수" value={unpaidAmt} set={setUnpaidAmt} danger />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-2xs text-ink-muted mb-0.5">티켓(장)</span>
                  <input type="number" inputMode="numeric" min={0} value={tkt || ''} onChange={(e) => setTkt(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="0" className="input w-full text-sm tabular-nums" />
                </label>
                <label className="block">
                  <span className="block text-2xs text-ink-muted mb-0.5">레벨 할인</span>
                  <div className="relative">
                    <input type="number" inputMode="numeric" min={0} value={discount || ''} onChange={(e) => setDiscount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      placeholder="0" className="input w-full text-sm tabular-nums pr-9" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">레벨</span>
                  </div>
                </label>
              </div>
              <p className="text-2xs text-ink-secondary text-right">합계 <b className="tabular-nums">{wonToMan(splitTotal)}</b>만원{discount > 0 ? ` · ${discount}레벨 할인` : ''}</p>
              <button type="button" onClick={submitSplit} disabled={!canSaveSplit} className="btn-primary w-full text-sm disabled:opacity-50">저장</button>
            </div>
          )}

          {/* 기존 셀: 취소(삭제) */}
          {cell.buyin && (
            <div className="pt-1 border-t border-border-subtle">
              {!cancelMode ? (
                <button type="button" onClick={() => setCancelMode(true)}
                  className="w-full h-10 rounded-input border border-border-default text-ink-muted text-xs font-semibold hover:text-danger-light hover:border-danger/40 transition-colors">
                  결제 취소 (내역 삭제)
                </button>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-2xs text-ink-muted">취소하려면 업주 비밀번호를 입력하세요.</p>
                  <div className="flex gap-1.5">
                    <input type="password" inputMode="numeric" value={pw} onChange={(e) => setPw(e.target.value)}
                      placeholder={hasPw ? '취소 비밀번호' : '비밀번호 미설정'} disabled={!hasPw} className="input flex-1 text-sm" autoFocus />
                    <button type="button" onClick={() => onCancelBuyin(pw)} disabled={!hasPw || !pw} className="btn-danger text-xs px-3 shrink-0 disabled:opacity-50">취소 확정</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AmountRow({ label, value, set, danger }: { label: string; value: number; set: (n: number) => void; danger?: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <span className={['w-9 shrink-0 text-2xs font-semibold', danger ? 'text-danger-light' : 'text-ink-secondary'].join(' ')}>{label}</span>
      <div className="relative flex-1">
        <input type="number" inputMode="decimal" step="0.1" min={0} value={manVal(value)} onChange={(e) => set(parseMan(e.target.value))}
          placeholder="0" className="input w-full text-sm tabular-nums pr-7" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">만</span>
      </div>
    </label>
  );
}

// ── 장부 마감 모달 ────────────────────────────────────────────────────────────
function CloseModal({ stats, unpaidPlayers, onClose, onConfirm }: {
  stats: { totalBuyins: number; entries: number; ticket: number; revenue: number; unpaid: number; support: number };
  unpaidPlayers: { name: string; unpaid: number }[];
  onClose: () => void; onConfirm: (memo: string) => void;
}) {
  const [memo, setMemo] = useState('');
  return (
    <Overlay title="정산 마감 — 금일 통계" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <SummaryStat label="총 바인" value={`${stats.totalBuyins}회`} />
          <SummaryStat label="총 엔트리" value={stats.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
          <SummaryStat label="완납 매출" value={`${wonToMan(stats.revenue)}만원`} tone="emerald" />
          <SummaryStat label="당일 미수금" value={`${wonToMan(stats.unpaid)}만원`} tone="danger" />
          <SummaryStat label="회수 티켓" value={`${stats.ticket}장`} />
          <SummaryStat label="가게지원" value={`${stats.support}건`} />
        </div>

        {/* 미수자 리스트 */}
        <div className="rounded-input border border-danger/30 bg-danger/[0.05] p-2.5">
          <p className="mb-1 text-2xs font-bold text-danger-light">미수자 {unpaidPlayers.length}명</p>
          {unpaidPlayers.length === 0 ? (
            <p className="py-1 text-center text-2xs text-ink-muted">미수자가 없습니다 👍</p>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {unpaidPlayers.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{p.name}</span>
                  <span className="shrink-0 font-bold text-danger-light tabular-nums">{p.unpaid.toLocaleString()}원</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="block">
          <span className="block text-2xs text-ink-muted mb-0.5">마감 메모(수기 비고) · 선택</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={300}
            placeholder="예) 미수 3건은 내일 정산 예정" className="input w-full text-sm resize-none" />
        </label>
        <p className="text-2xs text-danger-light">마감하면 해당 날짜 장부는 읽기전용으로 잠깁니다. (업주만 해제 가능)</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-sm flex-1">취소</button>
          <button type="button" onClick={() => onConfirm(memo)} className="btn-primary text-sm flex-1">마감 확정</button>
        </div>
      </div>
    </Overlay>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'danger' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'danger' ? 'text-danger-light' : 'text-ink-primary';
  return (
    <div className="rounded-input bg-surface-low border border-border-subtle py-2 text-center">
      <p className={['text-base font-extrabold tabular-nums', c].join(' ')}>{value}</p>
      <p className="text-[10px] text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}
