import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import CountUp from '../atoms/CountUp';
import Icon, { type IconName } from '../atoms/Icon';
import { getVenueWeeklyFunnel, type WeeklyFunnel } from '../../api/schedules';
import type { Schedule } from '../../api/schedules';
import { listStaleOpenSessions,
  getLedgerSession, getLedgerBuyins, getLedgerPlayers, getLedgerRange, buyinFinance, wonToMan, visitorLabel, subscribeLedger,
  getPosterOpsSummaries, getPendingBuyinRequests, subscribeBuyinRequests, approveBuyinRequest, rejectBuyinRequest,
  getLastClosedRound, type LastClosedRound,
  type LedgerSession, type LedgerBuyin, type LedgerPlayer, type BuyinRequest,
} from '../../api/ledger';
import { useToast } from '../atoms/Toast';
import { getClockState, getVenueClocks, subscribeClock, type ClockState } from '../../api/clock';
import { getReservationCounts, getVenueRegulars, subscribeReservations, type VenueRegular } from '../../api/reservations';
import { aiGenerate } from '../../api/ai';
import { getVenueRankings } from '../../api/rankings';
import { Skeleton } from '../atoms/Skeleton';
import RegularsModal from './RegularsModal';
import DealerShiftsModal from './DealerShiftsModal';
import VoucherManageModal from './VoucherManageModal';
import CheckinModal from './CheckinModal';
import Modal from '../atoms/Modal';
import { getAppSetting, BOOST_CONTACT_EMAIL_KEY, BOOST_CONTACT_PHONE_KEY } from '../../api/settings';
import { getStaffSchedule, getStaffWages, subscribeStaffSchedule, type StaffShift, type StaffWage } from '../../api/staffSchedule';
import { getUpcomingBirthdays } from '../../api/crm';

const localToday = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD (로컬)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const last7 = () => Array.from({ length: 7 }, (_, i) => {
  const dt = new Date(); dt.setDate(dt.getDate() - (6 - i));
  return dt.toLocaleDateString('en-CA');
});
const last14 = () => Array.from({ length: 14 }, (_, i) => {
  const dt = new Date(); dt.setDate(dt.getDate() - (13 - i));
  return dt.toLocaleDateString('en-CA');
});
const last28 = () => Array.from({ length: 28 }, (_, i) => {
  const dt = new Date(); dt.setDate(dt.getDate() - (27 - i));
  return dt.toLocaleDateString('en-CA');
});
const monthRange = () => {
  const n = new Date();
  return {
    start: new Date(n.getFullYear(), n.getMonth(), 1).toLocaleDateString('en-CA'),
    end: new Date(n.getFullYear(), n.getMonth() + 1, 0).toLocaleDateString('en-CA'),
    label: `${n.getMonth() + 1}월`,
  };
};
const hhmm = (s?: string | null) => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };

// PC 밀도 규약(오너 #5, 2026-08-30) — 이 파일의 모든 간격은 아래 4단만 쓴다.
//  1rem = 17px(index.css html) 이라 실제 렌더값은 괄호 안 값이다.
//   gap-1 / mt-1   (4.25px)  라벨↔값 · 아이콘↔글자 · 리스트 행 사이
//   gap-2          (8.5px)   카드 안 요소 그룹 사이
//   gap-3 / p-3    (12.75px) 카드 패딩 · 카드 사이 · 최상위 블록 사이
//   gap-5 / p-5    (21.25px) 섹션 경계 · 빈 상태 박스
//  0.5(2.125) · 1.5(6.375) · 2.5(10.625) · 3.5(14.875) 는 블록 간격으로 쓰지 않는다 —
//  같은 위계가 6.375 와 8.5 로 갈리던 것이 '지저분함'의 정체였다(1440 실측).
//  행간은 §T1 역할표(index.css)를 따른다:
//   설명문·빈 상태 안내 = t-desc(12.75/19.13) + break-keep(한글 어절 중간 줄바꿈 방지)
//   행 안 메타·캡션·뱃지 = text-2xs 기본(11.69/15.94) — leading-* 를 덧붙이지 않는다
//  text-[8px]/[9px]/[11px] 같은 사다리 밖 임의 px 금지(§T1 규칙 2).
//  예외 1가지: rounded-badge 의 내부 패딩(px-1.5 py-0.5)은 뱃지 토큰이라 이 4단의 대상이 아니다
//  — 블록 사이·카드 패딩만 4단으로 통제한다.
export interface DashCaps { ledger: boolean; manage: boolean; voucher: boolean; posters: boolean; staff: boolean }

interface Props {
  venueId: string;
  schedules: Schedule[];
  onGoto: (section: string) => void;
  onCreatePoster: () => void;
  /** 직원 권한에 따라 카드/바로가기 노출 게이팅(업주·운영자는 전부 true). */
  caps: DashCaps;
  /** 현재 보이는 탭일 때만 true — 숨김 상태에서 라이브 1초 틱을 멈춰 백그라운드 리렌더 방지. */
  active?: boolean;
}

/**
 * 매장 대시보드 — 오늘 장부·클락·예약·출근 + 최근 7일 추세·객단가 + 미수 알림 + 인건비·손님유형을 실시간 요약.
 * 모든 카드는 해당 운영 화면으로 바로가기. 직원은 부여된 권한(caps)의 카드만 노출 — 권한 없는 화면으로의 dead-end 방지.
 */
export default function StoreDashboard({ venueId, schedules, onGoto, onCreatePoster, caps, active = true }: Props) {
  const toast = useToast();
  const d = localToday();
  const days = last7();
  const d14 = last14();
  const mr = monthRange();
  const [session, setSession] = useState<LedgerSession | null>(null);
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [venueClocks, setVenueClocks] = useState<ClockState[]>([]); // 위젯 멀티게임 — 매장 전체 게임 클락(메인+사이드)
  const [widgetGame, setWidgetGame] = useState(1); // 위젯에서 보고 있는 게임(game_seq)
  const [wEntries, setWEntries] = useState<number | null>(null); // 위젯 사이드 게임 장부 엔트리(생존 정밀화용)
  const [dowStats, setDowStats] = useState<{ avg: number | null; weeks: { label: string; entries: number }[] }>({ avg: null, weeks: [] }); // 같은 요일 4주(평균+주차별)
  const [dowOpen, setDowOpen] = useState(false); // 요일 추세 드릴다운(주차 막대) 펼침
  const [pendingReqs, setPendingReqs] = useState<BuyinRequest[]>([]); // 라이브 위젯: 대기중 바인 요청
  const [reqBusy, setReqBusy] = useState<string | null>(null); // 인라인 승인/거절 진행 중 요청 id
  const [payFor, setPayFor] = useState<string | null>(null); // 인라인 승인 결제수단 팝오버(✓ 길게 누르기)
  const [payAmt, setPayAmt] = useState(0); // 팝오버 바인 금액(수정 가능)
  const [splitOpen, setSplitOpen] = useState(false); // 분할 결제 입력 모드
  const [splitVals, setSplitVals] = useState({ cash: 0, card: 0, transfer: 0 }); // 분할 금액
  const [payOrder, setPayOrder] = useState<('cash' | 'card' | 'transfer')[]>(['cash', 'card', 'transfer']); // 결제수단 순서(자주 쓰는 것 먼저 — 학습)
  const [, setNowTick] = useState(0); // 라이브 카운트다운/경과시간 1초 갱신
  const [resCounts, setResCounts] = useState<Record<string, number>>({});
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [monthShifts, setMonthShifts] = useState<StaffShift[]>([]);
  const [wages, setWages] = useState<StaffWage[]>([]);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [range, setRange] = useState<{ sessions: LedgerSession[]; buyins: LedgerBuyin[] }>({ sessions: [], buyins: [] });
  const [regulars, setRegulars] = useState<VenueRegular[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [regOpen, setRegOpen] = useState(false);
  const [dealerOpen, setDealerOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  // IA3a 대시보드 다이어트 — 기본 6카드(지금 할 일·라이브·오늘 장부·최근7일·예약·단골)만 노출,
  // 나머지는 '더 보기' 뒤로. 카드 옷을 입은 순수 링크 5장은 제거/유틸 줄로 강등.
  const [moreOpen, setMoreOpen] = useState(false);
  // 운영 가이드 배너 — 베테랑 매장에도 영구 노출되던 것을 닫기 가능으로(닫으면 기억)
  const [guideHidden, setGuideHidden] = useState(() => {
    try { return localStorage.getItem('nuri:guide-banner-dismissed') === '1'; } catch { return false; }
  });
  const dismissGuide = () => {
    setGuideHidden(true);
    try { localStorage.setItem('nuri:guide-banner-dismissed', '1'); } catch { /* noop */ }
  };
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherPrefill, setVoucherPrefill] = useState(''); // 단골 행 '이용권 보내기' 프리필
  const [hasRankToday, setHasRankToday] = useState<boolean | null>(null); // 지금 할 일 카드(순위 입력 유도)
  const [funnel, setFunnel] = useState<WeeklyFunnel | null>(null); // 주간 흐름(조회→예약→방문) — '퍼널' 용어는 UI 에서 금지(오너: 일반인 모름)
  const [staleOpen, setStaleOpen] = useState<{ sessionDate: string; gameSeq: number; title: string | null }[]>([]); // 미마감 지난 장부
  const [pendingRanks, setPendingRanks] = useState<{ date: string }[]>([]); // 마감됐는데 순위 미입력인 지난 대회(밀린 것)
  // 다가오는 생일 단골(7일 내) — CRM 생일 필드 기반
  const [bdays, setBdays] = useState<{ name: string; birthday: string; dday: number }[]>([]);
  useEffect(() => {
    if (!caps.manage) return;
    getUpcomingBirthdays(venueId).then(setBdays).catch(() => {});
  }, [venueId, caps.manage]);
  // 같은 요일 평소 엔트리(최근 4주 동일 요일 평균) — 위젯 미니 추세용. 핫 리로드와 분리해 매장당 1회만 로드(28일 데이터).
  useEffect(() => {
    if (!caps.ledger) return;
    const d28 = last28();
    const todayDow = new Date(d + 'T00:00:00').getDay();
    getLedgerRange(venueId, d28[0], d28[27]).then(({ sessions, buyins: bs }) => {
      // ⚠ 세션은 (날짜 + 게임)이 키다. 날짜만으로 매핑하면 사이드 게임이 있는 날
      //   메인 바인이 사이드 단가로 계산돼 엔트리·매출이 통째로 틀어진다(통계 화면과 값이 갈림).
      const byGame = new Map<string, LedgerSession>();
      sessions.forEach((s) => { byGame.set(`${s.sessionDate}#${s.gameSeq}`, s); });
      const weeks: { label: string; entries: number }[] = [];
      for (const day of d28) {
        if (day === d || new Date(day + 'T00:00:00').getDay() !== todayDow) continue;
        let e = 0; let has = false;
        for (const b of bs) {
          if (b.sessionDate !== day) continue;
          const s = byGame.get(`${b.sessionDate}#${b.gameSeq}`);
          if (!s) continue;
          has = true;
          e += buyinFinance(b, s).entry;
        }
        if (!has) continue;
        weeks.push({ label: day.slice(5).replace('-', '/'), entries: Math.round(e) });
      }
      const avg = weeks.length > 0 ? Math.round(weeks.reduce((a, w) => a + w.entries, 0) / weeks.length) : null;
      setDowStats({ avg, weeks });
    }).catch(() => {});
  }, [venueId, d, caps.ledger]);
  // 결제수단 기본값 학습 — 매장이 자주 쓰는 결제수단을 팝오버 첫 버튼으로(localStorage 카운트 기반)
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(`nuri:paymethod:${venueId}`) || '{}');
      setPayOrder((['cash', 'card', 'transfer'] as const).slice().sort((a, b) => (c[b] || 0) - (c[a] || 0)));
    } catch { setPayOrder(['cash', 'card', 'transfer']); }
  }, [venueId]);
  const [loading, setLoading] = useState(true);

  const upcoming = schedules
    .filter((s) => s.venueId === venueId && s.date >= d)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  // 스티키 상단 바 매장명 — 이 매장 포스터의 pubName 재사용(추가 조회 없음). 포스터가 없으면 일반 명칭 폴백.
  const venueName = schedules.find((s) => s.venueId === venueId)?.pubName || '내 매장';

  const reload = useCallback(() => {
    getLedgerSession(venueId, d).then(setSession).catch(() => {});
    getLedgerBuyins(venueId, d).then(setBuyins).catch(() => {});
    getLedgerPlayers(venueId, d).then(setPlayers).catch(() => {});
    getClockState(venueId).then(setClock).catch(() => {});
    getVenueClocks(venueId).then(setVenueClocks).catch(() => {});
    getPendingBuyinRequests(venueId, d).then(setPendingReqs).catch(() => {});
    getStaffSchedule(venueId, d, d).then(setShifts).catch(() => {});
    getStaffSchedule(venueId, mr.start, mr.end).then(setMonthShifts).catch(() => {});
    getStaffWages(venueId).then(setWages).catch(() => {});
    getLedgerRange(venueId, d14[0], d14[13]).then(setRange).catch(() => {});
    getVenueRegulars(venueId).then(setRegulars).catch(() => {});
    getVenueRankings(venueId, d).then(({ entries }) => setHasRankToday(entries.length > 0)).catch(() => {});
    getVenueWeeklyFunnel(venueId).then(setFunnel).catch(() => {});
    listStaleOpenSessions(venueId).then(setStaleOpen).catch(() => {});
    getPosterOpsSummaries(venueId).then((sums) => setPendingRanks(Object.values(sums).filter((s) => s.closed && !s.hasRankings && s.date < d).sort((a, b) => b.date.localeCompare(a.date)))).catch(() => {});
    const ids = schedules.filter((s) => s.venueId === venueId && s.date >= d).map((s) => s.id);
    if (ids.length) getReservationCounts(ids).then(setResCounts).catch(() => {});
    else setResCounts({});
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, d]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);
  // 숨김(다른 섹션·다른 탭 keep-alive) 동안 구독이 꺼져 있어 이벤트를 놓친다 —
  // 다시 보일 때(active 상승) 한 번 재검증해 마운트-당시 데이터로 굳는 것을 막는다.
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (active && !prevActiveRef.current) reload();
    prevActiveRef.current = active;
  }, [active, reload]);
  // ⚡ 실시간 구독은 대시보드를 실제로 보고 있을 때만(active) — 숨은 탭이 채널을 물고 있지 않게.
  useEffect(() => { if (active) return subscribeLedger(venueId, reload); }, [venueId, reload, active]);
  useEffect(() => { if (active) return subscribeClock(venueId, reload); }, [venueId, reload, active]);
  useEffect(() => { if (active) return subscribeBuyinRequests(venueId, reload); }, [venueId, reload, active]);
  // 예약은 내 매장의 다가오는 포스터만 서버 필터로 수신(전 매장 예약 수신 방지)
  const upcomingIds = useMemo(
    () => schedules.filter((s) => s.venueId === venueId && s.date >= d).map((s) => s.id),
    [schedules, venueId, d],
  );
  useEffect(() => { if (active) return subscribeReservations(reload, upcomingIds); }, [reload, upcomingIds, active]);
  useEffect(() => subscribeStaffSchedule(venueId, reload), [venueId, reload]);

  // ── 오늘 장부 집계 ──
  const fin = buyins.reduce(
    (a, b) => {
      if (!session) return a;
      const f = buyinFinance(b, session);
      a.paid += f.paid; a.unpaid += f.unpaid; a.entry += f.entry; a.ticket += f.ticketPaid;
      return a;
    },
    { paid: 0, unpaid: 0, entry: 0, ticket: 0 },
  );
  const started = !!session?.openedAt;
  // PL3①: 마지막 마감 회차 — '지난 게임 그대로 열기' 1탭(오늘 장부 미시작일 때 지금 할 일 후보)
  const [lastRound, setLastRound] = useState<LastClosedRound | null>(null);
  useEffect(() => {
    if (!caps.ledger) return;
    getLastClosedRound(venueId, d).then(setLastRound).catch(() => {});
  }, [venueId, d, caps.ledger]);
  // 장부 탭이 인텐트를 읽어 오늘 시작 화면에 지난 회차를 1회 자동 적용한다(파일 간 계약: nuri:last-round-intent)
  const gotoLedgerWithLastRound = () => {
    try { localStorage.setItem('nuri:last-round-intent', JSON.stringify({ venueId, at: Date.now() })); } catch { /* noop */ }
    onGoto('ledger');
  };
  const ledgerStatus = !started ? '미시작' : session?.closed ? '정산 마감' : session?.regClosed ? '레지 마감' : '진행중';
  const ledgerStatusCls = !started
    ? 'bg-surface-float text-ink-muted'
    : session?.closed ? 'bg-ink-muted/20 text-ink-secondary'
    : session?.regClosed ? 'bg-gold-400/15 text-gold-300'
    : 'bg-emerald-500/15 text-emerald-400';

  // ── 클락 ──
  const lvl = clock?.config.levels[clock.currentIndex];
  const clockActive = !!clock && (clock.running || clock.currentIndex > 0 || clock.endsAt != null);
  const levelNo = clock ? clock.config.levels.slice(0, clock.currentIndex + 1).filter((l) => l.kind === 'level').length : 0;
  // ── 위젯 멀티게임 — 활성 클락 게임 목록 + 선택 게임(widgetGame)의 라이브 값 ──
  const activeClocks = venueClocks.filter((c) => c.running || c.currentIndex > 0 || c.endsAt != null).sort((a, b) => a.gameSeq - b.gameSeq);
  const wClock = venueClocks.find((c) => c.gameSeq === widgetGame) ?? clock;
  const wActive = !!wClock && (wClock.running || wClock.currentIndex > 0 || wClock.endsAt != null);
  const wLvl = wClock?.config.levels[wClock.currentIndex];
  const wLevelNo = wClock ? wClock.config.levels.slice(0, wClock.currentIndex + 1).filter((l) => l.kind === 'level').length : 0;
  const clockRemainMs = wActive && wClock
    ? (wClock.running && wClock.endsAt ? Math.max(0, new Date(wClock.endsAt).getTime() - Date.now()) : Math.max(0, wClock.remainingMs))
    : 0;
  // 생존: 클락 liveStats(게임별 장부 합산) 우선 → 없으면 게임 장부 엔트리(메인=fin, 사이드=wEntries) + 보정 − 탈락
  const wEntriesEff = widgetGame === 1 ? Math.round(fin.entry) : wEntries;
  const survivors = wClock
    ? (wClock.liveStats?.alive ?? Math.max(0, (wEntriesEff ?? 0) + wClock.adjEntries + wClock.adjRebuys - wClock.eliminations))
    : 0;
  // 요청 게임의 바인 금액(결제 팝오버 표시) — 해당 게임 클락 liveStats 우선, 없으면 메인 세션
  const buyinAmountFor = (gameSeq: number | null) => venueClocks.find((c) => c.gameSeq === (gameSeq ?? 1))?.liveStats?.buyInAmount ?? session?.buyinAmount ?? null;
  const liveWidget = caps.ledger && (clockActive || activeClocks.length > 0 || pendingReqs.length > 0); // 진행 클락(메인/사이드) 또는 대기 요청
  // 위젯에서 보는 게임이 비활성이면 첫 활성 게임으로 자동 전환
  useEffect(() => {
    if (activeClocks.length > 0 && !activeClocks.some((c) => c.gameSeq === widgetGame)) setWidgetGame(activeClocks[0].gameSeq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueClocks]);
  // 위젯 사이드 게임 생존 정밀화 — 선택 게임이 사이드면 그 게임 장부 엔트리 합산(메인은 fin 사용, liveStats 없을 때 폴백)
  useEffect(() => {
    if (widgetGame === 1) { setWEntries(null); return; }
    let alive = true;
    Promise.all([getLedgerBuyins(venueId, d, widgetGame), getLedgerSession(venueId, d, widgetGame)])
      .then(([bs, s]) => { if (!alive) return; let e = 0; for (const b of bs) e += buyinFinance(b, s).entry; setWEntries(Math.round(e)); })
      .catch(() => { if (alive) setWEntries(null); });
    return () => { alive = false; };
  }, [venueId, d, widgetGame]);
  // 라이브 + 보이는 탭일 때만 1초 갱신(카운트다운·"분 전") — 숨김/평상시엔 멈춰 백그라운드 리렌더 방지
  useEffect(() => {
    if (!liveWidget || !active) return;
    const id = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [liveWidget, active]);
  const fmtClock = (ms: number) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const gameLabel = (g: number | null) => g == null ? '미지정' : g <= 1 ? '메인' : `사이드${g - 1}`;
  const timeAgo = (iso: string) => { const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000); return s < 60 ? '방금' : s < 3600 ? `${Math.floor(s / 60)}분 전` : `${Math.floor(s / 3600)}시간 전`; };
  // 위젯 인라인 승인/거절 — 장부로 안 넘어가고 즉시 처리(승인=요청 게임에 추가, 결제 기록은 장부에서 별도)
  const quickApprove = async (r: BuyinRequest) => {
    setReqBusy(r.id);
    try { await approveBuyinRequest(r.id, r.requestedGameSeq ?? 1, false); setPendingReqs((p) => p.filter((x) => x.id !== r.id)); toast.show(`${r.playerName} 참가 승인`, 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '승인 실패', 'error'); }
    finally { setReqBusy(null); }
  };
  const quickReject = async (r: BuyinRequest) => {
    setReqBusy(r.id);
    try { await rejectBuyinRequest(r.id); setPendingReqs((p) => p.filter((x) => x.id !== r.id)); toast.show(`${r.playerName} 요청 거절`, 'info'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '거절 실패', 'error'); }
    finally { setReqBusy(null); }
  };
  // ✓ 길게 누르기 → 결제수단(현금/카드/이체) 팝오버 → 바인 기록까지 승인. 짧게 탭 = 결제 기록 없이 게임 추가
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const cancelLP = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };
  const startLP = (r: BuyinRequest) => {
    lpFired.current = false; cancelLP();
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      const amt = buyinAmountFor(r.requestedGameSeq) ?? 0; // 기본 금액 프리필(수정 가능)
      setPayAmt(amt); setSplitOpen(false); setSplitVals({ cash: amt, card: 0, transfer: 0 });
      setPayFor(r.id);
    }, 480);
  };
  // 자주 쓰는 결제수단 학습 — 카운트++ 후 순서 갱신
  const bumpPay = (method: 'cash' | 'card' | 'transfer') => {
    try {
      const key = `nuri:paymethod:${venueId}`;
      const c = JSON.parse(localStorage.getItem(key) || '{}');
      c[method] = (c[method] || 0) + 1;
      localStorage.setItem(key, JSON.stringify(c));
      setPayOrder((['cash', 'card', 'transfer'] as const).slice().sort((a, b) => (c[b] || 0) - (c[a] || 0)));
    } catch { /* noop */ }
  };
  // 승인 + 바인 기록(금액/분할) — split 금액으로 기록, 우세 결제수단 학습
  const doApprove = async (r: BuyinRequest, split: { cash: number; card: number; transfer: number }) => {
    const sum = split.cash + split.card + split.transfer;
    if (sum <= 0) { toast.show('금액을 입력하세요', 'error'); return; }
    setPayFor(null); setReqBusy(r.id);
    try {
      await approveBuyinRequest(r.id, r.requestedGameSeq ?? 1, true, 'cash', split);
      bumpPay(split.cash >= split.card && split.cash >= split.transfer ? 'cash' : split.card >= split.transfer ? 'card' : 'transfer');
      setPendingReqs((p) => p.filter((x) => x.id !== r.id));
      toast.show(`${r.playerName} 승인 · 바인 ${wonToMan(sum)}만`, 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '승인 실패', 'error'); }
    finally { setReqBusy(null); }
  };
  const PM_LABEL: Record<'cash' | 'card' | 'transfer', string> = { cash: '현금', card: '카드', transfer: '이체' };

  // ── 예약 / 출근 ──
  const totalRes = upcoming.reduce((a, g) => a + (resCounts[g.id] ?? 0), 0);
  const workedStaff = shifts.filter((s) => s.checkIn);

  // ── 최근 7일 추세 + 객단가 ──
  // ⚠ 통계 패널과 동일하게 (날짜 + 게임) 키로 페어링 — 날짜만 쓰면 사이드 게임이 있는 날
  //   메인 바인이 사이드 단가로 계산돼 대시보드와 통계가 다른 숫자를 보여준다.
  const sessByGame = new Map<string, LedgerSession>();
  range.sessions.forEach((s) => { sessByGame.set(`${s.sessionDate}#${s.gameSeq}`, s); });
  const perDay = days.map((day) => {
    let entry = 0, paid = 0;
    for (const b of range.buyins) {
      if (b.sessionDate !== day) continue;
      const s = sessByGame.get(`${b.sessionDate}#${b.gameSeq}`);
      if (!s) continue;
      const f = buyinFinance(b, s);
      entry += f.entry; paid += f.paid;
    }
    return { day, dow: DOW[new Date(day + 'T00:00:00').getDay()], entry: Math.round(entry), paid };
  });
  const weekEntry = perDay.reduce((a, x) => a + x.entry, 0);
  const weekPaid = perDay.reduce((a, x) => a + x.paid, 0);
  const maxEntry = Math.max(1, ...perDay.map((x) => x.entry));
  const bestDay = perDay.reduce((a, x) => (x.entry > a.entry ? x : a), perDay[0]);
  const avgSpend = weekEntry > 0 ? Math.round(weekPaid / weekEntry) : 0; // 객단가(원/엔트리)

  // ── 위젯 미니 추세: 오늘 엔트리 vs 같은 요일 평소(최근 4주 동일 요일 평균 — dowStats 별도 로드) ──
  const todayDow = new Date(d + 'T00:00:00').getDay();
  const sameDowAvg = dowStats.avg;
  const todayEntries = Math.round(fin.entry);
  const dowDelta = sameDowAvg && sameDowAvg > 0 ? Math.round(((todayEntries - sameDowAvg) / sameDowAvg) * 100) : null;

  // ── 전주 대비(직전 7일) ──
  const prevDays = d14.slice(0, 7);
  const prevSet = new Set(prevDays);
  let prevEntry = 0, prevPaid = 0;
  for (const b of range.buyins) {
    if (!prevSet.has(b.sessionDate)) continue;
    const s = sessByGame.get(`${b.sessionDate}#${b.gameSeq}`);
    if (!s) continue;
    const f = buyinFinance(b, s);
    prevEntry += f.entry; prevPaid += f.paid;
  }
  prevEntry = Math.round(prevEntry);
  const entryDelta = prevEntry > 0 ? Math.round(((weekEntry - prevEntry) / prevEntry) * 100) : null;
  const paidDelta = prevPaid > 0 ? Math.round(((weekPaid - prevPaid) / prevPaid) * 100) : null;

  // ── 매장이용권(회수 티켓) 최근 7일 ──
  let weekTicket = 0;
  for (const b of range.buyins) {
    if (!days.includes(b.sessionDate)) continue;
    // 분납 티켓도 buyinFinance가 ticketPaid에 포함해 반환한다(과거엔 대시보드만 누락)
    const s = sessByGame.get(`${b.sessionDate}#${b.gameSeq}`);
    if (s) weekTicket += buyinFinance(b, s).ticketPaid;
  }
  // 매장이용권 발행/시상(세션 입력값) — 7일 / 오늘
  let weekVoucher = 0;
  for (const s of range.sessions) { if (days.includes(s.sessionDate)) weekVoucher += s.voucherIssued ?? 0; }
  const todayVoucher = session?.voucherIssued ?? 0;

  // ── 단골 TOP(바인·방문 횟수 기준, 관계자[직원] 제외) ──
  const staffNames = new Set(wages.map((w) => w.name.trim()));
  const topRegulars = regulars.filter((r) => !staffNames.has(r.name.trim())).slice(0, 5);

  // ── AI 주간 조언 — 주 단위 캐시. 월요 리포트(규칙 조언)와 짝: AI 실패 시 알림의 규칙 조언이 폴백 ──
  const aiWeekKey = (() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `nuri:ai-weekly:${venueId}:${d.toLocaleDateString('en-CA')}`;
  })();
  // ── AI 운영 요약 (Gemini 엣지 함수) ──
  const runAi = async () => {
    setAiBusy(true); setAiErr(''); setAiSummary('');
    try {
      const days7 = perDay.map((x) => `${x.dow} ${x.entry}엔트리/${wonToMan(x.paid)}만`).join(', ');
      const prompt = [
        `다음은 홀덤펍 운영 데이터다. 사장이 보기 좋게 한국어로 3~4문장 운영 요약과, 다음 주에 바로 실천할 조언 1~2개(약한 요일에 이벤트 제안 등 구체적으로)를 해줘. 과장·이모지 금지, 마크다운(별표·제목) 없이 평문으로, 숫자 근거 포함.`,
        `오늘(${mr.label}): 엔트리 ${Math.round(fin.entry)}, 완납 ${wonToMan(fin.paid)}만, 미수 ${wonToMan(fin.unpaid)}만.`,
        `최근7일: 합계 ${weekEntry}엔트리/${wonToMan(weekPaid)}만, 평균객단가 ${wonToMan(avgSpend)}만, 일별[${days7}].`,
        `전주대비: 엔트리 ${entryDelta == null ? 'N/A' : entryDelta + '%'}, 매출 ${paidDelta == null ? 'N/A' : paidDelta + '%'}.`,
        topRegulars.length ? `단골TOP: ${topRegulars.map((r) => `${r.name}(바인${r.buyins}/방문${r.visits})`).join(', ')}.` : '',
      ].filter(Boolean).join('\n');
      const text = await aiGenerate(prompt, '너는 홀덤펍 운영 컨설턴트다. 간결하고 실용적으로 답한다.');
      setAiSummary(text);
      try { localStorage.setItem(aiWeekKey, text); } catch { /* quota */ }
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : 'AI 요약 실패');
    } finally { setAiBusy(false); }
  };
  // 이번 주 캐시 복원, 없으면 월·화 첫 진입 시 자동 생성(주 1회)
  useEffect(() => {
    if (!caps.manage || loading) return;
    const cached = (() => { try { return localStorage.getItem(aiWeekKey); } catch { return null; } })();
    if (cached) { setAiSummary(cached); return; }
    const dow = new Date().getDay();
    if ((dow === 1 || dow === 2) && weekEntry > 0) void runAi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps.manage, loading, aiWeekKey]);

  // ── 직원 인건비(이번 달) ──
  const wageMap: Record<string, number> = Object.fromEntries(wages.map((w) => [w.name, w.hourlyWage]));
  let laborTotal = 0, laborHours = 0;
  for (const s of monthShifts) {
    const ci = hhmm(s.checkIn), co = hhmm(s.checkOut);
    if (ci == null || co == null) continue;
    let mins = co - ci; if (mins < 0) mins += 1440;
    const hrs = mins / 60;
    laborHours += hrs;
    laborTotal += hrs * (wageMap[s.name] ?? 0);
  }

  // ── 손님 유형 비중(오늘 명단) ──
  const typeCount: Record<string, number> = {};
  for (const p of players) {
    const key = visitorLabel(p.visitorType) || '기타';
    typeCount[key] = (typeCount[key] ?? 0) + 1;
  }
  const typeEntries = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
  const playerTotal = players.length;

  // 직원 권한에 따른 노출 — 권한 0이면 안내(권한 없는 화면으로의 진입 차단)
  const anyCap = caps.ledger || caps.manage || caps.voucher || caps.posters || caps.staff;
  if (!anyCap) {
    return (
      <div className="rounded-card border border-border-default bg-surface-low p-5 text-center space-y-2">
        <p className="text-sm font-bold text-ink-primary">아직 부여된 권한이 없습니다</p>
        <p className="t-desc break-keep text-ink-muted">업주에게 <span className="font-semibold text-ink-primary">장부·순위</span> 또는 <span className="font-semibold text-ink-primary">이용권 내역</span> 권한을 요청하면<br />이 매장의 운영 화면을 이용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RegularsModal open={regOpen} onClose={() => setRegOpen(false)} venueId={venueId} exclude={[...staffNames]} />
      <DealerShiftsModal open={dealerOpen} onClose={() => setDealerOpen(false)} venueId={venueId} monthKey={mr.start.slice(0, 7)} />
      <VoucherManageModal open={voucherOpen} onClose={() => { setVoucherOpen(false); setVoucherPrefill(''); }} venueId={venueId} prefillReceiver={voucherPrefill} />
      <CheckinModal open={checkinOpen} onClose={() => setCheckinOpen(false)} venueId={venueId} />
      <BoostContactModal open={boostOpen} onClose={() => setBoostOpen(false)} />

      {/* ① 공지 스트립 — 업주 운영 가이드(전폭·dismissible). 슬라이드(새 탭)·PDF. 닫으면 기억(IA3a) */}
      {/* ⚠ 375 에서 라벨이 '운영 가이'로 잘려 있었다 — 버튼 3개가 shrink-0 이라 라벨 폭이 먼저 죽는다.
          한 줄에 못 담으면 버튼 줄이 아래로 내려가게(flex-wrap) 바꿔 글자가 잘리지 않게 한다.
          PC(1280·1440)는 폭이 남아 예전과 똑같이 한 줄이다. */}
      {!guideHidden && (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-xs text-ink-secondary">
          <Icon name="bookmark" size={13} className="shrink-0 text-ink-muted" />
          <b className="text-ink-primary">운영 가이드</b><span className="hidden sm:inline">포스터→장부→클락→순위→정산 한눈에</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => window.open('/guide/manual.html', '_blank', 'noopener')}
            className="rounded-input border border-accent-400/40 bg-accent-300/10 px-3 py-1 text-2xs font-bold text-accent-300 transition-colors hover:bg-accent-300/20">
            사용설명서
          </button>
          <button type="button" onClick={() => window.open('/guide/owner.html', '_blank', 'noopener')}
            className="rounded-input border border-border-default px-3 py-1 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">
            슬라이드
          </button>
          <a href="/guide/owner.pdf" download="NURI-HOLDEM-업주가이드.pdf"
            className="rounded-input border border-border-default px-3 py-1 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">
            PDF
          </a>
          <button type="button" onClick={dismissGuide} aria-label="가이드 배너 닫기"
            className="px-1 py-1 text-ink-muted hover:text-ink-primary transition-colors">
            <Icon name="close" size={14} strokeWidth={2.4} />
          </button>
        </span>
      </div>
      )}

      {/* ② 스티키 상단 바 — 매장명 + 라이브 인디케이터 + 날짜. 컬럼 스코프 sticky(--stack-top 아래) */}
      <div className="sticky top-[calc(var(--stack-top,6.0625rem)-1px)] z-20 -mb-1 border-b border-border-subtle bg-surface-base py-2 before:pointer-events-none before:absolute before:inset-x-0 before:-top-3 before:h-3 before:bg-surface-base">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-bold text-ink-primary">{venueName}</span>
            {liveWidget && (
              <span className="flex shrink-0 items-center gap-1 text-2xs font-bold text-emerald-400">
                <span className="relative flex h-1.5 w-1.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                라이브
              </span>
            )}
          </span>
          <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{d.slice(5).replace('-', '/')} ({DOW[todayDow]})</span>
        </div>
      </div>

      {/* ③ KPI 헤드라인 — 오늘 장부 핵심 숫자를 헤더로 격상(eyebrow 상태 pill + 큰 숫자). 탭하면 장부로. */}
      {caps.ledger && (
        <button type="button" onClick={() => onGoto('ledger')}
          className="card-elev block w-full rounded-card border border-border-subtle bg-surface-low p-3 text-left transition-colors hover:border-border-default">
          <span className="flex items-center gap-2">
            <span className="text-2xs font-bold text-ink-muted">오늘 장부</span>
            <span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${ledgerStatusCls}`}>{ledgerStatus}</span>
          </span>
          {loading ? <div className="mt-2"><Skeleton /></div> : !started ? (
            <p className="mt-2 text-sm text-ink-muted">오늘 장부가 아직 시작되지 않았습니다.</p>
          ) : (
            <span className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-3">
              <span className="block">
                <span className="block text-2xs text-ink-muted">완납 매출</span>
                <span className="mt-1 block text-3xl font-extrabold leading-none tabular-nums text-gold-300">
                  {wonToMan(fin.paid)}<span className="ml-1 text-sm font-semibold text-ink-muted">만원</span>
                </span>
              </span>
              <span className="block">
                <span className="block text-2xs text-ink-muted">총 엔트리</span>
                <span className="mt-1 block text-2xl font-extrabold leading-none tabular-nums text-ink-primary">
                  <CountUp value={Math.round(fin.entry)} /><span className="ml-1 text-sm font-semibold text-ink-muted">엔트리</span>
                </span>
              </span>
              <span className="block">
                <span className="block text-2xs text-ink-muted">미수금</span>
                <span className={`mt-1 block text-2xl font-extrabold leading-none tabular-nums ${fin.unpaid > 0 ? 'text-danger-light' : 'text-ink-primary'}`}>
                  {wonToMan(fin.unpaid)}<span className="ml-1 text-sm font-semibold text-ink-muted">만원</span>
                </span>
              </span>
              <span className="block">
                <span className="block text-2xs text-ink-muted">회수 티켓</span>
                <span className="mt-1 block text-2xl font-extrabold leading-none tabular-nums text-ink-primary">
                  {fin.ticket}<span className="ml-1 text-sm font-semibold text-ink-muted">장</span>
                </span>
              </span>
            </span>
          )}
        </button>
      )}

      {/* 🔴 라이브 운영 현황 — 진행 클락 + 대기 바인요청을 한 카드에. 운영 중일 때만 노출(상황 인지형 커맨드센터) */}
      {!loading && liveWidget && (
        <section className="overflow-hidden rounded-card border border-accent-400/40 bg-gradient-to-br from-accent-300/[0.07] to-transparent">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-bold text-ink-primary">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              라이브 운영 현황
            </span>
            <span className="text-2xs text-ink-muted tabular-nums">{d.slice(5).replace('-', '/')}</span>
          </div>
          {/* 멀티게임 탭 — 메인+사이드 동시 진행 시 게임 전환 */}
          {activeClocks.length >= 2 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-2 py-2">
              {activeClocks.map((c) => {
                const on = c.gameSeq === widgetGame;
                return (
                  <button key={c.gameSeq} type="button" onClick={() => setWidgetGame(c.gameSeq)}
                    className={['shrink-0 rounded-input px-2 py-1 text-2xs font-bold transition-colors', on ? 'bg-accent-300 text-white' : 'bg-surface-float text-ink-secondary hover:text-ink-primary'].join(' ')}>
                    {c.gameSeq <= 1 ? '메인' : `사이드${c.gameSeq - 1}`}{c.running ? '' : ' · 정지'}
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-1 divide-y divide-border-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {/* 진행 클락(선택 게임) */}
            <button type="button" onClick={() => onGoto('clock')} className="flex items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-white/[0.02]">
              <div className="min-w-0">
                <p className="mb-1 text-2xs text-ink-muted">{activeClocks.length >= 2 ? (widgetGame <= 1 ? '메인' : `사이드${widgetGame - 1}`) + ' 클락' : '토너먼트 클락'}{wActive ? (wClock?.running ? ' · 진행' : ' · 일시정지') : ''}</p>
                {wActive && wLvl ? (
                  wLvl.kind === 'break' ? (
                    <p className="text-2xl font-extrabold leading-none text-ink-primary">BREAK</p>
                  ) : (
                    <>
                      <p className="text-xl font-extrabold leading-none text-ink-primary tabular-nums">{wLvl.sb.toLocaleString()}<span className="text-ink-muted">/</span>{wLvl.bb.toLocaleString()}</p>
                      <p className="mt-1 text-2xs text-ink-muted">레벨 {wLevelNo}{wLvl.ante > 0 ? ` · ante ${wLvl.ante.toLocaleString()}` : ''}</p>
                    </>
                  )
                ) : (
                  <p className="text-sm font-bold text-ink-secondary">클락 꺼짐 <span className="text-2xs font-normal text-ink-muted">눌러서 켜기</span></p>
                )}
              </div>
              {wActive && (
                <div className="shrink-0 text-right">
                  <p className={`text-3xl font-extrabold leading-none tabular-nums ${wClock?.running ? 'text-emerald-400' : 'text-gold-300'}`}>{fmtClock(clockRemainMs)}</p>
                  <p className="mt-1 text-2xs text-ink-muted">남은 인원 <b className="tabular-nums text-ink-primary">{survivors}</b></p>
                </div>
              )}
            </button>
            {/* 대기 바인요청 — 위젯에서 바로 ✓승인 / ✕거절(장부로 안 넘어감) */}
            <div className="flex flex-col p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xs text-ink-muted">대기중 바인 요청</p>
                <span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${pendingReqs.length > 0 ? 'bg-danger/15 text-danger-light' : 'bg-surface-float text-ink-muted'}`}>{pendingReqs.length}건</span>
              </div>
              {pendingReqs.length === 0 ? (
                <button type="button" onClick={() => onGoto('ledger')} className="flex-1 py-3 text-center text-2xs text-ink-muted hover:text-ink-secondary">대기중인 요청이 없습니다.</button>
              ) : (
                <>
                  <ul className="mt-2 space-y-1">
                    {pendingReqs.slice(0, 3).map((r) => (
                      <li key={r.id} className="relative flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-ink-secondary">{r.playerName}</span>
                        <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{timeAgo(r.createdAt)}</span>
                        <span className="shrink-0 rounded-badge bg-surface-float px-1 py-0.5 text-2xs text-ink-muted">{gameLabel(r.requestedGameSeq)}</span>
                        {/* ⚠ 승인(✓)과 거절(✕)이 24px 로 6px 간격에 붙어 있었다.
                            접수대에서 한 손으로 누르는 자리인데, 오탭하면 손님이 거절되거나
                            엉뚱한 사람이 명단에 들어간다 — 되돌리는 비용이 승인 1탭과 비대칭이다.
                            시각 크기는 유지하면서 히트영역만 40px 로 키우고(-my 로 줄 높이는 그대로),
                            둘 사이 간격을 벌려 손가락 하나 안에서 갈리지 않게 한다. */}
                        <button type="button" disabled={reqBusy === r.id}
                          onPointerDown={() => startLP(r)} onPointerUp={cancelLP} onPointerLeave={cancelLP} onPointerCancel={cancelLP}
                          onClick={() => { if (lpFired.current) { lpFired.current = false; return; } quickApprove(r); }}
                          title="탭: 승인(게임 추가) · 길게: 결제수단 선택해 바인 기록" aria-label="승인"
                          className="shrink-0 -my-2 ml-0.5 flex h-10 min-w-[2.5rem] items-center justify-center rounded-input bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 active:scale-95 disabled:opacity-40"><Icon name="check" size={15} strokeWidth={2.6} /></button>
                        <button type="button" disabled={reqBusy === r.id} onClick={() => quickReject(r)} title="거절" aria-label="거절"
                          className="shrink-0 -my-2 ml-2 flex h-10 min-w-[2.5rem] items-center justify-center rounded-input bg-danger/15 text-danger-light hover:bg-danger/25 active:scale-95 disabled:opacity-40"><Icon name="close" size={15} strokeWidth={2.6} /></button>
                        {payFor === r.id && (
                          <div className="absolute right-0 top-full z-30 mt-1 w-52 space-y-2 rounded-input border border-border-default bg-surface-float p-2 shadow-dialog">
                            {/* 바인 금액 직접 수정(리바인·할인) */}
                            <div className="flex items-center gap-1">
                              <span className="shrink-0 text-2xs text-ink-muted">바인</span>
                              <input type="number" inputMode="numeric" value={payAmt || ''} onChange={(e) => setPayAmt(Math.max(0, Number(e.target.value) || 0))}
                                className="min-w-0 flex-1 rounded-[5px] border border-border-default bg-surface-high px-1.5 py-1 text-xs tabular-nums text-ink-primary" placeholder="금액" />
                              <span className="shrink-0 text-2xs text-ink-muted">원</span>
                              <button type="button" onClick={() => setSplitOpen((v) => !v)} className={['shrink-0 rounded-[5px] px-1.5 py-1 text-2xs font-bold', splitOpen ? 'bg-accent-300 text-white' : 'bg-surface-high text-ink-secondary'].join(' ')}>분할</button>
                            </div>
                            {!splitOpen ? (
                              <div className="flex items-center gap-1">
                                {payOrder.map((m, i) => (
                                  <button key={m} type="button" onClick={() => doApprove(r, { cash: m === 'cash' ? payAmt : 0, card: m === 'card' ? payAmt : 0, transfer: m === 'transfer' ? payAmt : 0 })}
                                    className={['flex-1 rounded-[5px] py-1 text-2xs font-bold', i === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-high text-ink-secondary hover:text-accent-300'].join(' ')}>{PM_LABEL[m]}</button>
                                ))}
                                <button type="button" onClick={() => setPayFor(null)} aria-label="닫기" className="shrink-0 px-1 text-ink-muted hover:text-ink-secondary"><Icon name="close" size={12} /></button>
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-3 gap-1">
                                  {(['cash', 'card', 'transfer'] as const).map((m) => (
                                    <label key={m} className="flex flex-col gap-0.5">
                                      <span className="text-2xs text-ink-muted">{PM_LABEL[m]}</span>
                                      <input type="number" inputMode="numeric" value={splitVals[m] || ''} onChange={(e) => setSplitVals((s) => ({ ...s, [m]: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="w-full rounded-[5px] border border-border-default bg-surface-high px-1 py-1 text-2xs tabular-nums text-ink-primary" placeholder="0" />
                                    </label>
                                  ))}
                                </div>
                                <div className="flex items-center justify-between gap-1">
                                  <span className={['text-2xs tabular-nums', (splitVals.cash + splitVals.card + splitVals.transfer) === payAmt && payAmt > 0 ? 'text-emerald-400' : 'text-ink-muted'].join(' ')}>합계 {(splitVals.cash + splitVals.card + splitVals.transfer).toLocaleString()}{payAmt ? ` / ${payAmt.toLocaleString()}` : ''}</span>
                                  <span className="flex items-center gap-1">
                                    <button type="button" onClick={() => doApprove(r, splitVals)} className="rounded-[5px] bg-emerald-500/20 px-2 py-1 text-2xs font-bold text-emerald-300 hover:bg-emerald-500/30">승인</button>
                                    <button type="button" onClick={() => setPayFor(null)} aria-label="닫기" className="px-1 text-ink-muted hover:text-ink-secondary"><Icon name="close" size={12} /></button>
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => onGoto('ledger')} className="mt-auto pt-2 text-left text-2xs font-bold text-accent-300 hover:text-accent-200">{pendingReqs.length > 3 ? `외 ${pendingReqs.length - 3}건 · ` : ''}장부에서 전체 관리 →</button>
                </>
              )}
            </div>
          </div>
          {/* 미니 추세 — 오늘 vs 같은 요일 평소(4주 평균). 탭하면 주차별 막대 드릴다운 */}
          {(clockActive || activeClocks.length > 0) && sameDowAvg != null && (
            <div className="border-t border-border-subtle">
              <button type="button" onClick={() => setDowOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-2xs transition-colors hover:bg-white/[0.02]">
                <span className="text-ink-muted">오늘 vs 평소 <b className="text-ink-secondary">{DOW[todayDow]}요일</b></span>
                <span className="tabular-nums text-ink-secondary">
                  오늘 <b className="text-ink-primary">{todayEntries}</b> · 평소 <b className="text-ink-primary">{sameDowAvg}</b>
                  {dowDelta != null && <span className={['ml-1 font-bold', dowDelta > 0 ? 'text-emerald-400' : dowDelta < 0 ? 'text-danger-light' : 'text-ink-muted'].join(' ')}>{dowDelta > 0 ? '▲' : dowDelta < 0 ? '▼' : '–'}{Math.abs(dowDelta)}%</span>}
                  <span className="ml-1 text-ink-muted">{dowOpen ? '▲' : '▼'}</span>
                </span>
              </button>
              {dowOpen && (() => {
                const bars = [...dowStats.weeks, { label: '오늘', entries: todayEntries }];
                const max = Math.max(1, ...bars.map((b) => b.entries));
                return (
                  <div className="px-3 pb-3">
                    <p className="mb-2 text-2xs text-ink-muted">최근 {DOW[todayDow]}요일 엔트리 추이</p>
                    {/* 막대 트랙(h-16) + 4주 평균 점선 오버레이 */}
                    <div className="relative h-16">
                      {sameDowAvg != null && sameDowAvg > 0 && (
                        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: `${Math.min(98, (sameDowAvg / max) * 100)}%` }}>
                          <div className="border-t border-dashed border-ink-secondary/60" />
                          <span className="absolute -top-2 right-0 bg-surface-low/85 px-1 text-2xs tabular-nums text-ink-secondary">평균 {sameDowAvg}</span>
                        </div>
                      )}
                      <div className="flex h-full items-end justify-between gap-2">
                        {bars.map((b, i) => {
                          const isToday = i === bars.length - 1;
                          return (
                            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
                              <div className={['w-full max-w-[26px] rounded-sm', isToday ? 'bg-accent-300' : 'bg-accent-300/40'].join(' ')} style={{ height: `${Math.max(4, (b.entries / max) * 100)}%` }} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* 라벨(날짜·엔트리) */}
                    <div className="mt-1 flex justify-between gap-2">
                      {bars.map((b, i) => (
                        <span key={i} className={['flex-1 text-center text-2xs tabular-nums', i === bars.length - 1 ? 'font-bold text-ink-primary' : 'text-ink-muted'].join(' ')}>{b.label}<br />{b.entries}</span>
                      ))}
                    </div>
                    <button type="button" onClick={() => onGoto('stats')} className="mt-2 text-2xs font-bold text-accent-300 hover:text-accent-200">통계에서 자세히 →</button>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {/* 📊 주간 흐름(조회→예약→방문) — '왜 예약이 없는지'에 데이터로 답하는 첫 카드.
          조회수 추적(2026-08-17 신설)이 쌓이기 시작한 뒤부터 의미가 생긴다.
          ⚠ 카피에 '퍼널·전환율' 같은 외래 분석 용어 금지(오너 지시) — 자연스러운 한국어로 풀어 쓴다.
          card-elev: 위아래 DashCard·KPI 헤드라인과 같은 카드 문법으로 통일(이 카드만 평면이었다).
          surface-low 라 티어 규칙(index.css .card-elev 주석) 충족. 내부 3칸은 surface-high 라 손대지 않는다. */}
      {!loading && funnel && funnel.tournaments > 0 && (
        <section className="card-elev rounded-card border border-border-subtle bg-surface-low p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-primary"><Icon name="filter" size={13} className="shrink-0 text-ink-muted" />최근 7일 흐름 <span className="font-normal text-ink-muted">조회→예약→방문 · 대회 {funnel.tournaments}개</span></h3>
            <button type="button" onClick={() => onGoto('stats')} className="shrink-0 text-2xs font-bold text-accent-300">통계 →</button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-center">
            <div className="min-w-0 flex-1 rounded-input bg-surface-high px-1 py-2">
              <p className="text-lg font-extrabold tabular-nums text-ink-primary">{funnel.views}</p>
              <p className="mt-1 text-2xs text-ink-muted">포스터 조회</p>
            </div>
            <span aria-hidden className="shrink-0 text-ink-muted">→</span>
            <div className="min-w-0 flex-1 rounded-input bg-surface-high px-1 py-2">
              <p className="text-lg font-extrabold tabular-nums text-ink-primary">
                {funnel.reservations}
                {funnel.views > 0 && funnel.reservations > 0 && (
                  // '전환율' 대신 자연어 설명 — 숫자는 그대로, 뜻만 풀어준다
                  <span className="ml-1 text-2xs font-bold text-ink-secondary" title="포스터를 본 사람 중 예약으로 이어진 비율">{Math.round((funnel.reservations / funnel.views) * 100)}%</span>
                )}
              </p>
              <p className="mt-1 text-2xs text-ink-muted">예약</p>
            </div>
            <span aria-hidden className="shrink-0 text-ink-muted">→</span>
            <div className="min-w-0 flex-1 rounded-input bg-surface-high px-1 py-2">
              <p className="text-lg font-extrabold tabular-nums text-ink-primary">{funnel.checkins}</p>
              <p className="mt-1 text-2xs text-ink-muted">방문 체크인</p>
            </div>
          </div>
          {funnel.views === 0 && (
            <p className="mt-2 t-desc break-keep text-ink-muted">조회수는 손님이 포스터 상세를 열 때부터 쌓입니다. 이번 주부터 집계가 시작됐어요.</p>
          )}
        </section>
      )}

      {/* 지금 할 일 — 시간대·운영 상태 인지형 다음 행동 카드(대시보드 = 행동 안내판) */}
      {(() => {
        if (loading) return null;
        const todayPoster = schedules.some((s) => s.venueId === venueId && s.date === d && s.approved);
        const hour = new Date().getHours();
        let todo: { icon: IconName; title: string; desc: string; cta: string; onClick: () => void; tone: 'warn' | 'gold' | 'ok' } | null = null;
        if (caps.ledger && staleOpen.length > 0) {
          // 미마감 = 순위→시즌→머니인킹→전적 하류 전체 정지. 실제 라이브에서 두 달치가 쌓여 있었다.
          const list = staleOpen.slice(0, 3).map((x) => x.sessionDate.slice(5)).join(' · ');
          todo = { icon: 'alert', title: `지난 장부 ${staleOpen.length}건이 미마감이에요`, desc: `${list} · 마감해야 순위·시즌·전적에 반영되고 정산이 확정됩니다.`, cta:'장부에서 마감하기', onClick: () => onGoto('ledger'), tone: 'warn' };
        } else if (caps.ledger && session?.closed && hasRankToday === false) {
          todo = { icon: 'trophy', title: '순위 입력이 비어 있어요', desc: '마감한 장부의 참가자 명단으로 바로 채울 수 있어요. 입상 점수·아카이브에 반영됩니다.', cta: '순위 입력하기', onClick: () => onGoto('ranking'), tone: 'warn' };
        } else if (caps.ledger && started && !session?.closed) {
          todo = clockActive
            ? { icon: 'cards', title: `게임 진행 중 · 엔트리 ${Math.round(fin.entry)}`, desc:'바인 입력은 장부에서, 타이머·블라인드는 클락에서.', cta: '장부 보기', onClick: () => onGoto('ledger'), tone: 'gold' }
            : { icon: 'clock', title: '게임 진행 중인데 클락이 꺼져 있어요', desc: `엔트리 ${Math.round(fin.entry)} · 클락을 켜면 라이브 탭에도 실시간 송출됩니다.`, cta: '클락 켜기', onClick: () => onGoto('clock'), tone: 'gold' };
        } else if (caps.ledger && !started && todayPoster) {
          todo = { icon: 'cards', title: '오늘 게임이 있어요', desc: '포스터 정보 그대로 장부를 시작할 수 있어요(게임명·바인 자동 입력).', cta: '장부 시작하기', onClick: () => onGoto('ledger'), tone: 'gold' };
        } else if (caps.ledger && !started && !todayPoster && lastRound) {
          // PL3①: 매일 같은 게임을 여는 매장의 기본 동선 — 지난 회차(장부+클락 설정)를 1탭으로 그대로
          const lr = lastRound.session;
          todo = {
            icon: 'refresh',
            title: `지난 게임 그대로 열기 · ${lr.sessionDate.slice(5).replace('-', '/')} ${lr.title || '제목 없음'}`,
            desc: `단가·할인·딜러${lastRound.clockConfig ? '·블라인드·얼리' : ''}까지 한 번에 채워져요. 날짜·담당 직원만 확인하면 끝.`,
            cta: '그대로 열기', onClick: gotoLedgerWithLastRound, tone: 'gold',
          };
        } else if (caps.posters && !started && !todayPoster && hour >= 12) {
          todo = { icon: 'plus', title: '오늘 등록된 게임이 없어요', desc: '포스터를 올리면 일정 탐색에 노출되고 예약을 받을 수 있어요.', cta: '게임 등록하기', onClick: onCreatePoster, tone: 'gold' };
        } else if (caps.manage && session?.closed) {
          todo = { icon: 'check-circle', title: '오늘 운영 완료', desc: '수고하셨습니다. 주간 추세와 요일 분석을 확인해 보세요.', cta: '주간 리포트', onClick: () => onGoto('stats'), tone: 'ok' };
        }
        if (!todo) return null;
        const toneCls = todo.tone === 'warn'
          ? 'border-gold-400/50 bg-gold-400/[0.08]'
          : todo.tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-accent-400/40 bg-accent-300/[0.06]';
        const iconCls = todo.tone === 'warn' ? 'text-gold-300' : todo.tone === 'ok' ? 'text-emerald-400' : 'text-ink-secondary';
        return (
          <div className={`flex items-center gap-3 rounded-card border p-3 ${toneCls}`}>
            <Icon name={todo.icon} size={22} className={`shrink-0 ${iconCls}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-primary">{todo.title}</p>
              <p className="mt-1 t-desc break-keep text-ink-muted">{todo.desc}</p>
            </div>
            <button type="button" onClick={todo.onClick}
              className={todo.tone === 'warn' ? 'btn-primary shrink-0 px-4 py-2 text-xs !bg-none !bg-gold-400 !text-ink-inverse hover:!bg-gold-500' : 'btn-primary shrink-0 px-4 py-2 text-xs'}>
              {todo.cta}
            </button>
          </div>
        );
      })()}

      {/* 밀린 순위 미입력 대회 — 마감했지만 순위가 비어 있는 지난 대회(오늘 외) */}
      {caps.ledger && pendingRanks.length > 0 && (
        <button type="button" onClick={() => onGoto('ranking')}
          className="flex w-full items-center gap-3 rounded-card border border-gold-400/40 bg-gold-400/[0.06] p-3 text-left transition-colors hover:bg-gold-400/[0.1]">
          <Icon name="trophy" size={20} className="shrink-0 text-gold-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink-primary">순위 미입력 대회 {pendingRanks.length}개</p>
            <p className="mt-1 truncate text-2xs text-ink-muted">{pendingRanks.slice(0, 4).map((p) => p.date.slice(5).replace('-', '/')).join(', ')}{pendingRanks.length > 4 ? ' 외' : ''} — 마감했지만 순위가 비어 있어요. 입력하면 랭킹·아카이브에 반영됩니다.</p>
          </div>
          <span className="shrink-0 rounded-input bg-gold-400 px-3 py-2 text-xs font-bold text-ink-inverse">순위 입력</span>
        </button>
      )}

      {/* 미수·리스크 알림 (장부 권한) */}
      {caps.ledger && started && fin.unpaid > 0 && (
        <button type="button" onClick={() => onGoto('ledger')}
          className="flex w-full items-center gap-2 rounded-card border border-danger/40 bg-danger/[0.08] p-3 text-left hover:bg-danger/[0.12] transition-colors">
          <Icon name="alert" size={18} className="shrink-0 text-danger-light" />
          <span className="text-xs text-danger-light">오늘 <b className="tabular-nums">{wonToMan(fin.unpaid)}만원</b> 미수금이 있습니다. 장부에서 확인하세요.</span>
        </button>
      )}

      {/* 빠른 작업 — 권한 있는 항목만 */}
      {(caps.posters || caps.ledger) && (
        <div className="grid grid-cols-4 gap-3">
          {caps.posters && <QuickAction label="새 게임" onClick={onCreatePoster}
            icon={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} />}
          {caps.ledger && <QuickAction label="장부" onClick={() => onGoto('ledger')}
            icon={<><path d="M4 4h12a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z" /></>} />}
          {caps.ledger && <QuickAction label="클락" onClick={() => onGoto('clock')}
            icon={<><circle cx="12" cy="13" r="7" /><path d="M12 10v3l2 2" /><line x1="9" y1="2" x2="15" y2="2" /></>} />}
          {caps.ledger && <QuickAction label="순위·포인트" onClick={() => onGoto('ranking')}
            icon={<><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>} />}
        </div>
      )}

      {/* 카드 사이 간격을 8.5 → 12.75 로. 카드도 최상위 블록과 같은 위계인데
          블록 사이만 12.75, 카드 사이는 8.5 로 갈려 있었다(1440 실측) — 한 값으로 맞춘다. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* 오늘 장부 카드는 ③ KPI 헤드라인으로 격상(내용 동일 — 총 엔트리·완납 매출·미수금·회수 티켓) */}
        {/* 클락 — 라이브 위젯이 클락을 표시 중(clockActive)이면 중복 방지 위해 숨김 */}
        <DashCard show={moreOpen && caps.ledger && !clockActive} title="토너먼트 클락" onClick={() => onGoto('clock')}
          badge={clockActive
            ? <span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${clock?.running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gold-400/15 text-gold-300'}`}>{clock?.running ? '진행중' : '일시정지'}</span>
            : <span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-surface-float text-ink-muted">미실행</span>}>
          {loading ? <Skeleton /> : !clockActive || !lvl ? (
            <p className="py-3 text-center text-2xs text-ink-muted">실행 중인 클락이 없습니다.</p>
          ) : lvl.kind === 'break' ? (
            <div className="py-2 text-center">
              <p className="text-lg font-extrabold text-ink-primary">BREAK</p>
              <p className="mt-1 text-2xs text-ink-muted">휴식 시간</p>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-2xs text-ink-muted">레벨 {levelNo}</p>
                <p className="text-xl font-extrabold text-ink-primary tabular-nums leading-tight">{lvl.sb.toLocaleString()}/{lvl.bb.toLocaleString()}</p>
                {lvl.ante > 0 && <p className="text-2xs text-ink-muted">ante {lvl.ante.toLocaleString()}</p>}
              </div>
              <div className="text-right">
                <p className="text-2xs text-ink-muted">남은 인원</p>
                <p className="text-lg font-bold text-ink-primary tabular-nums">{Math.max(0, Math.round(fin.entry) + clock!.adjEntries + clock!.adjRebuys - clock!.eliminations)}</p>
              </div>
            </div>
          )}
        </DashCard>

        {/* 최근 7일 추세 + 객단가 */}
        <DashCard show={caps.manage} title="최근 7일 추세" onClick={() => onGoto('stats')}
          badge={<span className="text-2xs font-bold text-ink-muted">통계·AI →</span>}>
          {loading ? <Skeleton /> : weekEntry === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">최근 7일 장부 데이터가 없습니다.</p>
          ) : (
            <>
              <div className="mb-2 flex h-14 items-end justify-between gap-1">
                {perDay.map((x) => (
                  <div key={x.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div className="w-full max-w-[18px] rounded-sm bg-accent-300/80" style={{ height: `${Math.max(4, (x.entry / maxEntry) * 100)}%` }} title={`${x.dow} ${x.entry}엔트리`} />
                    <span className={`text-2xs ${x.day === d ? 'text-ink-primary font-bold' : 'text-ink-muted'}`}>{x.dow}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-2xs">
                <span className="text-ink-muted">7일 합계</span>
                <span className="text-ink-secondary tabular-nums"><b className="text-ink-primary">{weekEntry}</b>엔트리 · <b className="text-gold-300">{wonToMan(weekPaid)}</b>만</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-2xs">
                <span className="text-ink-muted">평균 객단가</span>
                <span className="text-ink-secondary tabular-nums"><b className="text-gold-300">{wonToMan(avgSpend)}</b>만 / 엔트리{bestDay.entry > 0 && <> · 활발 <b className="text-ink-primary">{bestDay.dow}</b></>}</span>
              </div>
              <div className="mt-2 border-t border-border-subtle pt-2">
                {aiSummary ? (
                  <p className="t-desc whitespace-pre-wrap break-keep text-ink-secondary">{aiSummary}</p>
                ) : aiErr ? (
                  <p className="t-desc break-keep text-danger-light">{aiErr}</p>
                ) : null}
                <button type="button" onClick={runAi} disabled={aiBusy}
                  className="mt-2 inline-flex items-center gap-1 text-2xs font-bold text-accent-300 hover:text-accent-200 disabled:opacity-50">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
                  {aiBusy ? 'AI 분석 중…' : aiSummary ? 'AI 다시 요약' : 'AI 운영 요약 생성'}
                </button>
              </div>
            </>
          )}
        </DashCard>

        {/* 전주 대비(주간 비교) */}
        <DashCard show={moreOpen && caps.manage} title="전주 대비" onClick={() => onGoto('stats')}
          badge={<span className="text-2xs font-bold text-ink-muted">주간 비교</span>}>
          {loading ? <Skeleton /> : (weekEntry === 0 && prevEntry === 0) ? (
            <p className="py-3 text-center text-2xs text-ink-muted">비교할 장부 데이터가 없습니다.</p>
          ) : (
            <div className="space-y-2 py-0.5">
              <CompareRow label="엔트리" now={weekEntry} prev={prevEntry} delta={entryDelta} />
              <CompareRow label="매출" now={weekPaid} prev={prevPaid} delta={paidDelta} won />
            </div>
          )}
        </DashCard>

        {/* 다가오는 예약 */}
        <DashCard show={caps.posters} title="다가오는 예약" onClick={() => onGoto('posters')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">예약 {totalRes}</span>}>
          {loading ? <Skeleton /> : upcoming.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">예정된 게임이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink-secondary"><span className="text-2xs text-ink-muted tabular-nums mr-1">{g.date.slice(5).replace('-', '/')}</span>{g.title}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">예약 {resCounts[g.id] ?? 0}명</span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 단골 TOP(바인·방문 횟수 · 직원 제외) */}
        <DashCard show={caps.ledger} title="단골 TOP" onClick={() => setRegOpen(true)}
          badge={<span className="text-2xs font-bold text-ink-muted">전체 보기 →</span>}>
          {loading ? <Skeleton /> : topRegulars.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">장부 바인 데이터가 아직 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {topRegulars.map((r, i) => (
                <li key={r.name} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 shrink-0 text-center text-2xs font-bold tabular-nums ${i === 0 ? 'text-gold-300' : 'text-ink-muted'}`}>{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-ink-secondary">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">바인 <b className="text-ink-secondary">{r.buyins}</b> · 방문 <b className="text-ink-secondary">{r.visits}</b>{r.buyins >= 5 && <span className="ml-1 font-bold text-ink-secondary">단골</span>}</span>
                  {/* CRM 행동 버튼 — 단골에게 바로 이용권 발급(받는 사람 자동 입력) */}
                  {caps.voucher && (
                    <span
                      role="button" tabIndex={0} title={`${r.name}님에게 이용권 보내기`}
                      onClick={(e) => { e.stopPropagation(); setVoucherPrefill(r.name); setVoucherOpen(true); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setVoucherPrefill(r.name); setVoucherOpen(true); } }}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-badge border border-accent-400/40 bg-accent-300/10 px-1.5 py-0.5 text-2xs font-bold text-accent-300 hover:bg-accent-300/20 active:opacity-80"
                    ><Icon name="gift" size={11} />보내기</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 오늘 출근 */}
        <DashCard show={moreOpen && caps.staff} title="오늘 출근" onClick={() => onGoto('staff')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">{workedStaff.length}/{shifts.length} 출근</span>}>
          {loading ? <Skeleton /> : shifts.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">오늘 배정된 직원이 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {shifts.map((s) => (
                <li key={s.name} className={`inline-flex items-center gap-0.5 rounded-badge px-2 py-0.5 text-2xs font-semibold ${s.checkIn ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-float text-ink-secondary'}`}>
                  {s.checkIn && <Icon name="check" size={10} strokeWidth={3} />}{s.name}
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 인건비 요약(이번 달) */}
        <DashCard show={moreOpen && caps.staff} title="인건비 요약" onClick={() => onGoto('staff')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-surface-float text-ink-secondary">{mr.label}</span>}>
          {loading ? <Skeleton /> : laborHours === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">이번 달 출퇴근 기록이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Stat label="총 인건비" value={wonToMan(laborTotal)} unit="만원" gold />
              <Stat label="총 근무" value={`${Math.round(laborHours)}`} unit="시간" />
            </div>
          )}
        </DashCard>

        {/* 매장이용권(회수 티켓) */}
        <DashCard show={moreOpen && caps.voucher} title="매장이용권" onClick={() => setVoucherOpen(true)}
          badge={<span className="text-2xs font-bold text-ink-muted">발급·관리 →</span>}>
          {loading ? <Skeleton /> : (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Stat label="7일 발행" value={`${weekVoucher}`} unit="장" />
                <Stat label="오늘 발행" value={`${todayVoucher}`} unit="장" />
                <Stat label="7일 회수" value={`${weekTicket}`} unit="장" />
                <Stat label="오늘 회수" value={`${fin.ticket}`} unit="장" />
              </div>
              <p className="mt-2 t-desc break-keep text-ink-muted">발행=장부에서 입력한 발급/시상 · 회수=티켓으로 바인한 합계.</p>
            </>
          )}
        </DashCard>

        {/* 🎂 생일 단골(7일 내) — 단골 TOP의 고객정보에서 생일 등록 시 자동 표시 */}
        <DashCard show={moreOpen && caps.manage} title="생일 단골" onClick={() => setRegOpen(true)}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">7일 내 {bdays.length}명</span>}>
          {bdays.length === 0 ? (
            <p className="t-desc break-keep py-3 text-center text-ink-muted">7일 내 생일인 단골이 없습니다.<br />생일은 단골 TOP → 고객정보에서 등록해요.</p>
          ) : (
            <ul className="space-y-1">
              {bdays.slice(0, 5).map((b) => (
                <li key={b.name} className="flex items-center gap-2 text-2xs">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{b.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">{b.birthday}</span>
                  <span className={['inline-flex shrink-0 items-center gap-0.5 rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums', b.dday === 0 ? 'bg-gold-400/15 text-gold-300' : 'bg-surface-float text-ink-secondary'].join(' ')}>
                    {b.dday === 0 ? <><Icon name="gift" size={10} />오늘</> : `D-${b.dday}`}
                  </span>
                </li>
              ))}
              <li className="pt-0.5 text-2xs text-ink-muted">축하 쿠폰은 단골 TOP → 고객정보 → 쿠폰 발급으로 보내세요.</li>
            </ul>
          )}
        </DashCard>

        {/* 손님 유형 비중(오늘) */}
        <DashCard show={moreOpen && caps.manage} title="손님 유형" onClick={() => onGoto('stats')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">{playerTotal}명</span>}>
          {loading ? <Skeleton /> : playerTotal === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">오늘 명단이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {typeEntries.map(([k, n]) => (
                <li key={k} className="flex items-center gap-2 text-2xs">
                  <span className="w-14 shrink-0 text-ink-secondary">{k}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-surface-high overflow-hidden">
                    <span className="block h-full rounded-full bg-accent-300/80" style={{ width: `${Math.round((n / playerTotal) * 100)}%` }} />
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-ink-muted">{n}명 {Math.round((n / playerTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>
      </div>

      {/* 더 보기 토글(IA3a) — 클락·전주 대비·직원·이용권·생일·손님 유형은 접힌 상태가 기본 */}
      <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
        className="flex w-full items-center justify-center gap-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">
        {moreOpen ? '간단히 보기' : '더 보기 · 클락 · 주간 비교 · 직원 · 이용권'}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          className={['transition-transform', moreOpen ? 'rotate-180' : ''].join(' ')} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {/* 유틸 줄(IA3a) — 카드 옷을 입던 순수 링크들. '그 자리에서 끝내거나, 유틸이거나' */}
      {caps.manage && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1 text-2xs">
          <button type="button" onClick={() => setCheckinOpen(true)} className="font-bold text-ink-muted transition-colors hover:text-accent-300">방문 체크·QR 명단</button>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => setDealerOpen(true)} className="font-bold text-ink-muted transition-colors hover:text-accent-300">딜러 로테이션·급여</button>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => setBoostOpen(true)} className="inline-flex items-center gap-1 font-bold text-ink-muted transition-colors hover:text-accent-300"><Icon name="flame" size={11} />포스터 상단 고정 문의</button>
        </div>
      )}
    </div>
  );
}

function DashCard({ title, badge, onClick, children, show = true }: { title: string; badge?: ReactNode; onClick: () => void; children: ReactNode; show?: boolean }) {
  if (!show) return null;
  return (
    <section className="card-elev rounded-card border border-border-subtle bg-surface-low p-3">
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-2 mb-2 group">
        <span className="flex items-center gap-2 text-sm font-bold text-ink-primary">{title}</span>
        <span className="flex items-center gap-1">
          {badge}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted group-hover:text-accent-300 transition-colors" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
        </span>
      </button>
      {children}
    </section>
  );
}

function Stat({ label, value, unit, gold, danger }: { label: string; value: string; unit?: string; gold?: boolean; danger?: boolean }) {
  return (
    <div>
      <p className="text-2xs text-ink-muted">{label}</p>
      <p className={`font-extrabold tabular-nums leading-tight ${danger ? 'text-danger-light' : gold ? 'text-gold-300' : 'text-ink-primary'}`}>
        <span className="text-lg">{/^[\d,]+$/.test(value) ? <CountUp value={Number(value.replace(/,/g, ''))} /> : value}</span>{unit && <span className="ml-0.5 text-2xs font-semibold text-ink-muted">{unit}</span>}
      </p>
    </div>
  );
}

function CompareRow({ label, now, prev, delta, won }: { label: string; now: number; prev: number; delta: number | null; won?: boolean }) {
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  const fmt = (n: number) => (won ? `${wonToMan(n)}만` : `${n}`);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-2xs text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span className="text-sm font-bold text-ink-primary">{fmt(now)}</span>
        <span className="text-2xs text-ink-muted">전주 {fmt(prev)}</span>
        {delta != null && (
          <span className={`text-2xs font-bold ${up ? 'text-emerald-400' : down ? 'text-danger-light' : 'text-ink-muted'}`}>
            {up ? '▲' : down ? '▼' : '–'}{Math.abs(delta)}%
          </span>
        )}
      </span>
    </div>
  );
}

// card-sink(카드 깊이) — 이 타일은 surface-high 라 card-elev 금지 티어(index.css .card-elev 주석).
// 아래를 낮추는 방향이라 대비는 오히려 오른다(ink-secondary 6.52→7.04 실측).
function QuickAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="card-sink flex flex-col items-center justify-center gap-1 rounded-card border border-border-default bg-surface-high py-3 text-ink-secondary hover:text-accent-300 hover:border-accent-400/50 transition-colors active:scale-[0.98]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>
      <span className="text-2xs font-bold">{label}</span>
    </button>
  );
}

// ── ⚡ 부스트(포스터 상단 고정) 문의 모달 ─────────────────────────────────────
// 연락처는 운영자가 관리자 설정 → 게시물 관리에서 입력(app_settings) — 미입력 시 준비 중 안내.
function BoostContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(() => {
    if (!open) return;
    getAppSetting(BOOST_CONTACT_EMAIL_KEY).then((v) => setEmail(v ?? '')).catch(() => {});
    getAppSetting(BOOST_CONTACT_PHONE_KEY).then((v) => setPhone(v ?? '')).catch(() => {});
  }, [open]);
  const hasContact = !!(email.trim() || phone.trim());
  return (
    <Modal open={open} onClose={onClose} title="포스터 상단 고정(부스트)" maxWidth="sm" variant="sheet">
      <div className="space-y-3 p-4">
        <div className="rounded-card border border-accent-400/30 bg-accent-300/[0.06] p-3 space-y-2">
          <p className="text-sm font-bold text-accent-300">이런 효과가 있어요</p>
          <ul className="space-y-1 text-sm leading-relaxed text-ink-secondary">
            <li>· 내 포스터가 일정탐색 <b className="text-ink-primary">맨 위에 고정</b>됩니다</li>
            <li>· 제목에 <b className="text-accent-300">TOP 뱃지</b>가 붙어 눈에 띕니다</li>
            <li>· 기간은 <b className="text-ink-primary">3 / 7 / 14 / 30일</b> 중 선택, 끝나면 자동 해제</li>
          </ul>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-low p-3 space-y-2">
          <p className="text-sm font-bold text-ink-primary">문의 방법</p>
          {hasContact ? (
            <div className="space-y-2">
              {email.trim() && (
                <a href={`mailto:${email.trim()}`} className="btn flex items-center gap-2 rounded-input border border-border-default bg-surface-high p-3 text-sm font-semibold text-ink-primary">
                  <Icon name="send" size={15} className="shrink-0 text-ink-muted" /> <span className="min-w-0 flex-1 truncate">{email.trim()}</span>
                  <span className="shrink-0 text-2xs text-accent-300">메일 보내기 →</span>
                </a>
              )}
              {phone.trim() && (
                <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="btn flex items-center gap-2 rounded-input border border-border-default bg-surface-high p-3 text-sm font-semibold text-ink-primary">
                  <Icon name="comment" size={15} className="shrink-0 text-ink-muted" /> <span className="min-w-0 flex-1 truncate">{phone.trim()}</span>
                  <span className="shrink-0 text-2xs text-accent-300">전화 걸기 →</span>
                </a>
              )}
            </div>
          ) : (
            <p className="py-2 text-center text-sm leading-relaxed text-ink-muted">문의 연락처를 준비하고 있습니다.<br />곧 이 자리에서 바로 연락하실 수 있어요.</p>
          )}
          <p className="text-xs text-ink-muted">문의 주시면 기간·비용 안내 후, 확인되는 대로 포스터를 상단에 올려드립니다.</p>
        </div>
      </div>
    </Modal>
  );
}

// Skeleton은 공용 atom(../atoms/Skeleton) 사용
