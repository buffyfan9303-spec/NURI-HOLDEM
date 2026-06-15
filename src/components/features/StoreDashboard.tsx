import { useCallback, useEffect, useState, type ReactNode } from 'react';
import CountUp from '../atoms/CountUp';
import type { Schedule } from '../../api/schedules';
import {
  getLedgerSession, getLedgerBuyins, getLedgerPlayers, getLedgerRange, buyinFinance, wonToMan, visitorLabel, subscribeLedger,
  getPosterOpsSummaries, getPendingBuyinRequests, subscribeBuyinRequests, approveBuyinRequest, rejectBuyinRequest,
  type LedgerSession, type LedgerBuyin, type LedgerPlayer, type BuyinRequest,
} from '../../api/ledger';
import { useToast } from '../atoms/Toast';
import { getClockState, subscribeClock, type ClockState } from '../../api/clock';
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
const monthRange = () => {
  const n = new Date();
  return {
    start: new Date(n.getFullYear(), n.getMonth(), 1).toLocaleDateString('en-CA'),
    end: new Date(n.getFullYear(), n.getMonth() + 1, 0).toLocaleDateString('en-CA'),
    label: `${n.getMonth() + 1}월`,
  };
};
const hhmm = (s?: string | null) => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };

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
  const [pendingReqs, setPendingReqs] = useState<BuyinRequest[]>([]); // 라이브 위젯: 대기중 바인 요청
  const [reqBusy, setReqBusy] = useState<string | null>(null); // 인라인 승인/거절 진행 중 요청 id
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
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherPrefill, setVoucherPrefill] = useState(''); // 단골 행 '이용권 보내기' 프리필
  const [hasRankToday, setHasRankToday] = useState<boolean | null>(null); // 지금 할 일 카드(순위 입력 유도)
  const [pendingRanks, setPendingRanks] = useState<{ date: string }[]>([]); // 마감됐는데 순위 미입력인 지난 대회(밀린 것)
  // 다가오는 생일 단골(7일 내) — CRM 생일 필드 기반
  const [bdays, setBdays] = useState<{ name: string; birthday: string; dday: number }[]>([]);
  useEffect(() => {
    if (!caps.manage) return;
    getUpcomingBirthdays(venueId).then(setBdays).catch(() => {});
  }, [venueId, caps.manage]);
  const [loading, setLoading] = useState(true);

  const upcoming = schedules
    .filter((s) => s.venueId === venueId && s.date >= d)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const reload = useCallback(() => {
    getLedgerSession(venueId, d).then(setSession).catch(() => {});
    getLedgerBuyins(venueId, d).then(setBuyins).catch(() => {});
    getLedgerPlayers(venueId, d).then(setPlayers).catch(() => {});
    getClockState(venueId).then(setClock).catch(() => {});
    getPendingBuyinRequests(venueId, d).then(setPendingReqs).catch(() => {});
    getStaffSchedule(venueId, d, d).then(setShifts).catch(() => {});
    getStaffSchedule(venueId, mr.start, mr.end).then(setMonthShifts).catch(() => {});
    getStaffWages(venueId).then(setWages).catch(() => {});
    getLedgerRange(venueId, d14[0], d14[13]).then(setRange).catch(() => {});
    getVenueRegulars(venueId).then(setRegulars).catch(() => {});
    getVenueRankings(venueId, d).then(({ entries }) => setHasRankToday(entries.length > 0)).catch(() => {});
    getPosterOpsSummaries(venueId).then((sums) => setPendingRanks(Object.values(sums).filter((s) => s.closed && !s.hasRankings && s.date < d).sort((a, b) => b.date.localeCompare(a.date)))).catch(() => {});
    const ids = schedules.filter((s) => s.venueId === venueId && s.date >= d).map((s) => s.id);
    if (ids.length) getReservationCounts(ids).then(setResCounts).catch(() => {});
    else setResCounts({});
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, d]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);
  useEffect(() => subscribeLedger(venueId, reload), [venueId, reload]);
  useEffect(() => subscribeClock(venueId, reload), [venueId, reload]);
  useEffect(() => subscribeBuyinRequests(venueId, reload), [venueId, reload]);
  useEffect(() => subscribeReservations(reload), [reload]);
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
  const ledgerStatus = !started ? '미시작' : session?.closed ? '정산 마감' : session?.regClosed ? '레지 마감' : '진행중';
  const ledgerStatusCls = !started
    ? 'bg-surface-float text-ink-muted'
    : session?.closed ? 'bg-ink-muted/20 text-ink-secondary'
    : session?.regClosed ? 'bg-amber-500/15 text-amber-400'
    : 'bg-emerald-500/15 text-emerald-400';

  // ── 클락 ──
  const lvl = clock?.config.levels[clock.currentIndex];
  const clockActive = !!clock && (clock.running || clock.currentIndex > 0 || clock.endsAt != null);
  const levelNo = clock ? clock.config.levels.slice(0, clock.currentIndex + 1).filter((l) => l.kind === 'level').length : 0;
  // 라이브 위젯: 클락 남은시간(진행=endsAt 기준, 일시정지=remainingMs) · 생존 인원
  const clockRemainMs = clockActive && clock
    ? (clock.running && clock.endsAt ? Math.max(0, new Date(clock.endsAt).getTime() - Date.now()) : Math.max(0, clock.remainingMs))
    : 0;
  const survivors = clock ? Math.max(0, Math.round(fin.entry) + clock.adjEntries + clock.adjRebuys - clock.eliminations) : 0;
  const liveWidget = caps.ledger && (clockActive || pendingReqs.length > 0); // 진행 클락 또는 대기 요청이 있을 때만 노출
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

  // ── 예약 / 출근 ──
  const totalRes = upcoming.reduce((a, g) => a + (resCounts[g.id] ?? 0), 0);
  const workedStaff = shifts.filter((s) => s.checkIn);

  // ── 최근 7일 추세 + 객단가 ──
  const sessByDate: Record<string, LedgerSession> = {};
  range.sessions.forEach((s) => { sessByDate[s.sessionDate] = s; });
  const perDay = days.map((day) => {
    const s = sessByDate[day];
    let entry = 0, paid = 0;
    if (s) for (const b of range.buyins) {
      if (b.sessionDate !== day) continue;
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

  // ── 위젯 미니 추세: 오늘 엔트리 vs 같은 요일 평소(최근 2주 내 동일 요일 평균) ──
  const todayDow = new Date(d + 'T00:00:00').getDay();
  let sdSum = 0, sdN = 0;
  for (const day of d14) {
    if (day === d || new Date(day + 'T00:00:00').getDay() !== todayDow) continue;
    const s = sessByDate[day]; if (!s) continue;
    let e = 0; for (const b of range.buyins) { if (b.sessionDate === day) e += buyinFinance(b, s).entry; }
    sdSum += e; sdN++;
  }
  const sameDowAvg = sdN > 0 ? Math.round(sdSum / sdN) : null;
  const todayEntries = Math.round(fin.entry);
  const dowDelta = sameDowAvg && sameDowAvg > 0 ? Math.round(((todayEntries - sameDowAvg) / sameDowAvg) * 100) : null;

  // ── 전주 대비(직전 7일) ──
  const prevDays = d14.slice(0, 7);
  const prevSet = new Set(prevDays);
  let prevEntry = 0, prevPaid = 0;
  for (const b of range.buyins) {
    if (!prevSet.has(b.sessionDate)) continue;
    const s = sessByDate[b.sessionDate];
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
    const s = sessByDate[b.sessionDate];
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
      <div className="rounded-card border border-border-default bg-surface-low p-6 text-center space-y-2">
        <p className="text-sm font-bold text-ink-primary">아직 부여된 권한이 없습니다</p>
        <p className="text-2xs leading-relaxed text-ink-muted">업주에게 <span className="font-semibold text-gold-300">장부·순위</span> 또는 <span className="font-semibold text-gold-300">이용권 내역</span> 권한을 요청하면<br />이 매장의 운영 화면을 이용할 수 있습니다.</p>
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

      {/* 🔴 라이브 운영 현황 — 진행 클락 + 대기 바인요청을 한 카드에. 운영 중일 때만 노출(상황 인지형 커맨드센터) */}
      {!loading && liveWidget && (
        <section className="overflow-hidden rounded-card border border-gold-400/40 bg-gradient-to-br from-gold-300/[0.07] to-transparent">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink-primary">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              라이브 운영 현황
            </span>
            <span className="text-2xs text-ink-muted tabular-nums">{d.slice(5).replace('-', '/')}</span>
          </div>
          <div className="grid grid-cols-1 divide-y divide-border-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {/* 진행 클락 */}
            <button type="button" onClick={() => onGoto('clock')} className="flex items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.02]">
              <div className="min-w-0">
                <p className="mb-0.5 text-2xs text-ink-muted">토너먼트 클락{clockActive ? (clock?.running ? ' · 진행' : ' · 일시정지') : ''}</p>
                {clockActive && lvl ? (
                  lvl.kind === 'break' ? (
                    <p className="text-2xl font-extrabold leading-none text-gold-300">BREAK</p>
                  ) : (
                    <>
                      <p className="text-xl font-extrabold leading-none text-ink-primary tabular-nums">{lvl.sb.toLocaleString()}<span className="text-ink-muted">/</span>{lvl.bb.toLocaleString()}</p>
                      <p className="mt-1 text-2xs text-ink-muted">레벨 {levelNo}{lvl.ante > 0 ? ` · ante ${lvl.ante.toLocaleString()}` : ''}</p>
                    </>
                  )
                ) : (
                  <p className="text-sm font-bold text-ink-secondary">클락 꺼짐 <span className="text-2xs font-normal text-ink-muted">— 눌러서 켜기</span></p>
                )}
              </div>
              {clockActive && (
                <div className="shrink-0 text-right">
                  <p className={`text-3xl font-extrabold leading-none tabular-nums ${clock?.running ? 'text-emerald-400' : 'text-amber-400'}`}>{fmtClock(clockRemainMs)}</p>
                  <p className="mt-1.5 text-2xs text-ink-muted">남은 인원 <b className="text-gold-300">{survivors}</b></p>
                </div>
              )}
            </button>
            {/* 대기 바인요청 — 위젯에서 바로 ✓승인 / ✕거절(장부로 안 넘어감) */}
            <div className="flex flex-col px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xs text-ink-muted">대기중 바인 요청</p>
                <span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${pendingReqs.length > 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-surface-float text-ink-muted'}`}>{pendingReqs.length}건</span>
              </div>
              {pendingReqs.length === 0 ? (
                <button type="button" onClick={() => onGoto('ledger')} className="flex-1 py-3 text-center text-2xs text-ink-muted hover:text-ink-secondary">대기중인 요청이 없습니다.</button>
              ) : (
                <>
                  <ul className="mt-1.5 space-y-1">
                    {pendingReqs.slice(0, 3).map((r) => (
                      <li key={r.id} className="flex items-center gap-1.5 text-xs">
                        <span className="min-w-0 flex-1 truncate text-ink-secondary">{r.playerName}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{timeAgo(r.createdAt)}</span>
                        <span className="shrink-0 rounded-badge bg-surface-float px-1 py-0.5 text-[10px] text-ink-muted">{gameLabel(r.requestedGameSeq)}</span>
                        <button type="button" disabled={reqBusy === r.id} onClick={() => quickApprove(r)} title="승인 — 요청 게임에 추가(결제는 장부에서)"
                          className="shrink-0 rounded-input bg-emerald-500/15 px-1.5 py-1 text-2xs font-bold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40">✓</button>
                        <button type="button" disabled={reqBusy === r.id} onClick={() => quickReject(r)} title="거절"
                          className="shrink-0 rounded-input bg-rose-500/15 px-1.5 py-1 text-2xs font-bold text-rose-300 hover:bg-rose-500/25 disabled:opacity-40">✕</button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => onGoto('ledger')} className="mt-auto pt-1.5 text-left text-2xs font-bold text-gold-300 hover:text-gold-200">{pendingReqs.length > 3 ? `외 ${pendingReqs.length - 3}건 · ` : ''}장부에서 전체 관리 →</button>
                </>
              )}
            </div>
          </div>
          {/* 미니 추세 — 오늘 엔트리 vs 같은 요일 평소(최근 2주 동일 요일 평균) */}
          {clockActive && sameDowAvg != null && (
            <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-3 py-2 text-2xs">
              <span className="text-ink-muted">오늘 vs 평소 <b className="text-ink-secondary">{DOW[todayDow]}요일</b></span>
              <span className="tabular-nums text-ink-secondary">
                오늘 <b className="text-gold-300">{todayEntries}</b> · 평소 <b className="text-ink-primary">{sameDowAvg}</b>
                {dowDelta != null && <span className={['ml-1 font-bold', dowDelta > 0 ? 'text-emerald-400' : dowDelta < 0 ? 'text-danger-light' : 'text-ink-muted'].join(' ')}>{dowDelta > 0 ? '▲' : dowDelta < 0 ? '▼' : '–'}{Math.abs(dowDelta)}%</span>}
              </span>
            </div>
          )}
        </section>
      )}

      {/* 지금 할 일 — 시간대·운영 상태 인지형 다음 행동 카드(대시보드 = 행동 안내판) */}
      {(() => {
        if (loading) return null;
        const todayPoster = schedules.some((s) => s.venueId === venueId && s.date === d && s.approved);
        const hour = new Date().getHours();
        let todo: { emoji: string; title: string; desc: string; cta: string; onClick: () => void; tone: 'warn' | 'gold' | 'ok' } | null = null;
        if (caps.ledger && session?.closed && hasRankToday === false) {
          todo = { emoji: '🏆', title: '순위 입력이 비어 있어요', desc: '마감한 장부의 참가자 명단으로 바로 채울 수 있어요 — 입상 점수·아카이브에 반영됩니다.', cta: '순위 입력하기', onClick: () => onGoto('ranking'), tone: 'warn' };
        } else if (caps.ledger && started && !session?.closed) {
          todo = clockActive
            ? { emoji: '📒', title: `게임 진행 중 — 엔트리 ${Math.round(fin.entry)}`, desc: '바인 입력은 장부에서, 타이머·블라인드는 클락에서.', cta: '장부 보기', onClick: () => onGoto('ledger'), tone: 'gold' }
            : { emoji: '⏱', title: '게임 진행 중인데 클락이 꺼져 있어요', desc: `엔트리 ${Math.round(fin.entry)} · 클락을 켜면 라이브 탭에도 실시간 송출됩니다.`, cta: '클락 켜기', onClick: () => onGoto('clock'), tone: 'gold' };
        } else if (caps.ledger && !started && todayPoster) {
          todo = { emoji: '📒', title: '오늘 게임이 있어요', desc: '포스터 정보 그대로 장부를 시작할 수 있어요(게임명·바인 자동 입력).', cta: '장부 시작하기', onClick: () => onGoto('ledger'), tone: 'gold' };
        } else if (caps.posters && !started && !todayPoster && hour >= 12) {
          todo = { emoji: '➕', title: '오늘 등록된 게임이 없어요', desc: '포스터를 올리면 일정 탐색에 노출되고 예약을 받을 수 있어요.', cta: '게임 등록하기', onClick: onCreatePoster, tone: 'gold' };
        } else if (caps.manage && session?.closed) {
          todo = { emoji: '✅', title: '오늘 운영 완료', desc: '수고하셨습니다 — 주간 추세와 요일 분석을 확인해 보세요.', cta: '주간 리포트', onClick: () => onGoto('stats'), tone: 'ok' };
        }
        if (!todo) return null;
        const toneCls = todo.tone === 'warn'
          ? 'border-amber-500/50 bg-amber-500/[0.08]'
          : todo.tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-gold-400/40 bg-gold-300/[0.06]';
        return (
          <div className={`flex items-center gap-3 rounded-card border px-3 py-3 ${toneCls}`}>
            <span className="text-2xl" aria-hidden>{todo.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-primary">{todo.title}</p>
              <p className="mt-0.5 text-2xs leading-snug text-ink-muted">{todo.desc}</p>
            </div>
            <button type="button" onClick={todo.onClick}
              className={todo.tone === 'warn' ? 'btn-primary shrink-0 px-3.5 py-2 text-xs !bg-amber-400 hover:!bg-amber-500' : 'btn-primary shrink-0 px-3.5 py-2 text-xs'}>
              {todo.cta}
            </button>
          </div>
        );
      })()}

      {/* 밀린 순위 미입력 대회 — 마감했지만 순위가 비어 있는 지난 대회(오늘 외) */}
      {caps.ledger && pendingRanks.length > 0 && (
        <button type="button" onClick={() => onGoto('ranking')}
          className="flex w-full items-center gap-3 rounded-card border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-amber-500/[0.1]">
          <span className="text-xl" aria-hidden>🏆</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink-primary">순위 미입력 대회 {pendingRanks.length}개</p>
            <p className="mt-0.5 truncate text-2xs text-ink-muted">{pendingRanks.slice(0, 4).map((p) => p.date.slice(5).replace('-', '/')).join(', ')}{pendingRanks.length > 4 ? ' 외' : ''} — 마감했지만 순위가 비어 있어요. 입력하면 랭킹·아카이브에 반영됩니다.</p>
          </div>
          <span className="shrink-0 rounded-input bg-amber-400 px-3 py-1.5 text-xs font-bold text-ink-inverse">순위 입력</span>
        </button>
      )}

      {/* 미수·리스크 알림 (장부 권한) */}
      {caps.ledger && started && fin.unpaid > 0 && (
        <button type="button" onClick={() => onGoto('ledger')}
          className="flex w-full items-center gap-2 rounded-card border border-danger/40 bg-danger/[0.08] px-3 py-2.5 text-left hover:bg-danger/[0.12] transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-danger-light" aria-hidden><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span className="text-xs text-danger-light">오늘 <b className="tabular-nums">{wonToMan(fin.unpaid)}만원</b> 미수금이 있습니다 — 장부에서 확인하세요.</span>
        </button>
      )}

      {/* 빠른 작업 — 권한 있는 항목만 */}
      {(caps.posters || caps.ledger) && (
        <div className="grid grid-cols-4 gap-2">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* 오늘 장부 */}
        <DashCard show={caps.ledger} title="오늘 장부" onClick={() => onGoto('ledger')}
          badge={<span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${ledgerStatusCls}`}>{ledgerStatus}</span>}>
          {loading ? <Skeleton /> : !started ? (
            <p className="py-3 text-center text-2xs text-ink-muted">오늘 장부가 아직 시작되지 않았습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Stat label="총 엔트리" value={`${Math.round(fin.entry)}`} unit="엔트리" accent />
              <Stat label="완납 매출" value={wonToMan(fin.paid)} unit="만원" />
              <Stat label="미수금" value={wonToMan(fin.unpaid)} unit="만원" danger={fin.unpaid > 0} />
              <Stat label="회수 티켓" value={`${fin.ticket}`} unit="장" />
            </div>
          )}
        </DashCard>

        {/* 클락 — 라이브 위젯이 클락을 표시 중(clockActive)이면 중복 방지 위해 숨김 */}
        <DashCard show={caps.ledger && !clockActive} title="토너먼트 클락" onClick={() => onGoto('clock')}
          badge={clockActive
            ? <span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${clock?.running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{clock?.running ? '진행중' : '일시정지'}</span>
            : <span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-surface-float text-ink-muted">미실행</span>}>
          {loading ? <Skeleton /> : !clockActive || !lvl ? (
            <p className="py-3 text-center text-2xs text-ink-muted">실행 중인 클락이 없습니다.</p>
          ) : lvl.kind === 'break' ? (
            <div className="py-2 text-center">
              <p className="text-lg font-extrabold text-gold-300">BREAK</p>
              <p className="text-2xs text-ink-muted mt-0.5">휴식 시간</p>
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
                <p className="text-lg font-bold text-gold-300 tabular-nums">{Math.max(0, Math.round(fin.entry) + clock!.adjEntries + clock!.adjRebuys - clock!.eliminations)}</p>
              </div>
            </div>
          )}
        </DashCard>

        {/* 최근 7일 추세 + 객단가 */}
        <DashCard show={caps.manage} title="최근 7일 추세" onClick={() => onGoto('stats')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-violet-500/15 text-violet-300">통계·AI →</span>}>
          {loading ? <Skeleton /> : weekEntry === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">최근 7일 장부 데이터가 없습니다.</p>
          ) : (
            <>
              <div className="flex items-end justify-between gap-1 h-14 mb-1.5">
                {perDay.map((x) => (
                  <div key={x.day} className="flex flex-1 flex-col items-center justify-end gap-0.5 h-full">
                    <div className="w-full max-w-[18px] rounded-sm bg-gold-300/80" style={{ height: `${Math.max(4, (x.entry / maxEntry) * 100)}%` }} title={`${x.dow} ${x.entry}엔트리`} />
                    <span className={`text-[9px] ${x.day === d ? 'text-gold-300 font-bold' : 'text-ink-muted'}`}>{x.dow}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-2xs border-t border-border-subtle pt-1.5">
                <span className="text-ink-muted">7일 합계</span>
                <span className="text-ink-secondary tabular-nums"><b className="text-gold-300">{weekEntry}</b>엔트리 · <b className="text-ink-primary">{wonToMan(weekPaid)}</b>만</span>
              </div>
              <div className="flex items-center justify-between text-2xs mt-1">
                <span className="text-ink-muted">평균 객단가</span>
                <span className="text-ink-secondary tabular-nums"><b className="text-ink-primary">{wonToMan(avgSpend)}</b>만 / 엔트리{bestDay.entry > 0 && <> · 활발 <b className="text-gold-300">{bestDay.dow}</b></>}</span>
              </div>
              <div className="mt-2 border-t border-border-subtle pt-2">
                {aiSummary ? (
                  <p className="text-2xs leading-relaxed text-ink-secondary whitespace-pre-wrap">{aiSummary}</p>
                ) : aiErr ? (
                  <p className="text-2xs text-danger-light leading-relaxed">{aiErr}</p>
                ) : null}
                <button type="button" onClick={runAi} disabled={aiBusy}
                  className="mt-1.5 inline-flex items-center gap-1 text-2xs font-bold text-violet-300 hover:text-violet-200 disabled:opacity-50">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg>
                  {aiBusy ? 'AI 분석 중…' : aiSummary ? 'AI 다시 요약' : 'AI 운영 요약 생성'}
                </button>
              </div>
            </>
          )}
        </DashCard>

        {/* 전주 대비(주간 비교) */}
        <DashCard show={caps.manage} title="전주 대비" onClick={() => onGoto('stats')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-violet-500/15 text-violet-300">주간 비교</span>}>
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
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">예약 {totalRes}</span>}>
          {loading ? <Skeleton /> : upcoming.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">예정된 게임이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
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
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">전체 보기 →</span>}>
          {loading ? <Skeleton /> : topRegulars.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">장부 바인 데이터가 아직 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {topRegulars.map((r, i) => (
                <li key={r.name} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 shrink-0 text-center text-2xs font-bold tabular-nums ${i === 0 ? 'text-gold-300' : 'text-ink-muted'}`}>{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-ink-secondary">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">바인 <b className="text-ink-secondary">{r.buyins}</b> · 방문 <b className="text-ink-secondary">{r.visits}</b>{r.buyins >= 5 && <span className="ml-1 text-gold-300 font-bold">단골</span>}</span>
                  {/* CRM 행동 버튼 — 단골에게 바로 이용권 발급(받는 사람 자동 입력) */}
                  {caps.voucher && (
                    <span
                      role="button" tabIndex={0} title={`${r.name}님에게 이용권 보내기`}
                      onClick={(e) => { e.stopPropagation(); setVoucherPrefill(r.name); setVoucherOpen(true); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setVoucherPrefill(r.name); setVoucherOpen(true); } }}
                      className="shrink-0 cursor-pointer rounded-badge border border-gold-400/40 bg-gold-300/10 px-1.5 py-0.5 text-2xs font-bold text-gold-300 hover:bg-gold-300/20 active:opacity-80"
                    >🎟 보내기</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 오늘 출근 */}
        <DashCard show={caps.staff} title="오늘 출근" onClick={() => onGoto('staff')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">{workedStaff.length}/{shifts.length} 출근</span>}>
          {loading ? <Skeleton /> : shifts.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">오늘 배정된 직원이 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {shifts.map((s) => (
                <li key={s.name} className={`rounded-badge px-2 py-0.5 text-2xs font-semibold ${s.checkIn ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-float text-ink-secondary'}`}>
                  {s.checkIn ? '✓ ' : ''}{s.name}
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 인건비 요약(이번 달) */}
        <DashCard show={caps.staff} title="인건비 요약" onClick={() => onGoto('staff')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-surface-float text-ink-secondary">{mr.label}</span>}>
          {loading ? <Skeleton /> : laborHours === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">이번 달 출퇴근 기록이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Stat label="총 인건비" value={wonToMan(laborTotal)} unit="만원" accent />
              <Stat label="총 근무" value={`${Math.round(laborHours)}`} unit="시간" />
            </div>
          )}
        </DashCard>

        {/* 매장이용권(회수 티켓) */}
        <DashCard show={caps.voucher} title="매장이용권" onClick={() => setVoucherOpen(true)}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">발급·관리 →</span>}>
          {loading ? <Skeleton /> : (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Stat label="7일 발행" value={`${weekVoucher}`} unit="장" accent />
                <Stat label="오늘 발행" value={`${todayVoucher}`} unit="장" />
                <Stat label="7일 회수" value={`${weekTicket}`} unit="장" />
                <Stat label="오늘 회수" value={`${fin.ticket}`} unit="장" />
              </div>
              <p className="mt-1.5 text-[10px] text-ink-muted">발행=장부에서 입력한 발급/시상 · 회수=티켓으로 바인한 합계.</p>
            </>
          )}
        </DashCard>

        {/* 딜러 관리(로테이션·급여) */}
        <DashCard show={caps.manage} title="딜러 관리" onClick={() => setDealerOpen(true)}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">로테이션·급여 →</span>}>
          <p className="py-3 text-center text-2xs text-ink-muted">딜러 시프트 등록 + 월 급여 명세를 관리합니다.</p>
        </DashCard>

        {/* 🎂 생일 단골(7일 내) — 단골 TOP의 고객정보에서 생일 등록 시 자동 표시 */}
        <DashCard show={caps.manage} title="🎂 생일 단골" onClick={() => setRegOpen(true)}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-pink-500/15 text-pink-300">7일 내 {bdays.length}명</span>}>
          {bdays.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">7일 내 생일인 단골이 없습니다.<br />생일은 단골 TOP → 고객정보에서 등록해요.</p>
          ) : (
            <ul className="space-y-1.5">
              {bdays.slice(0, 5).map((b) => (
                <li key={b.name} className="flex items-center gap-2 text-2xs">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{b.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">{b.birthday}</span>
                  <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-[10px] font-bold', b.dday === 0 ? 'bg-pink-500/20 text-pink-300' : 'bg-surface-float text-ink-secondary'].join(' ')}>
                    {b.dday === 0 ? '오늘 🎉' : `D-${b.dday}`}
                  </span>
                </li>
              ))}
              <li className="pt-0.5 text-[10px] text-ink-muted">축하 쿠폰은 단골 TOP → 고객정보 → 쿠폰 발급으로 보내세요.</li>
            </ul>
          )}
        </DashCard>

        {/* 고객 분석 — 방문 손님 전체 행동 통계 */}
        <DashCard show={caps.manage} title="고객 분석" onClick={() => onGoto('stats')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">바인·머니인·미수 →</span>}>
          <p className="py-3 text-center text-2xs text-ink-muted">방문 손님 리스트 — 바인·머니인 비율·결제수단·방문 시간대·미수까지 한눈에.</p>
        </DashCard>

        {/* 예약·방문 체크 — 고정 QR 스캔(출석 도장) + 오늘 방문 명단(체크인·이용권) */}
        <DashCard show={caps.manage} title="예약·방문 체크" onClick={() => setCheckinOpen(true)}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">방문 명단 →</span>}>
          <p className="py-3 text-center text-2xs text-ink-muted">손님이 <b className="text-ink-secondary">고정 QR을 스캔</b>하거나 매장이용권을 결제하면 <b className="text-gold-300">방문</b>으로 표시됩니다. 오늘 방문 명단·출석 도장 실시간.</p>
        </DashCard>

        {/* ⚡ 포스터 부스트 안내 — 상단 고정 광고 문의 */}
        <DashCard show={caps.manage} title="⚡ 포스터 상단 고정" onClick={() => setBoostOpen(true)}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">부스트 문의 →</span>}>
          <p className="py-3 text-center text-2xs text-ink-muted">내 포스터를 일정탐색 맨 위에 N일 동안 고정하고 TOP 뱃지를 답니다. 눌러서 문의 방법을 확인하세요.</p>
        </DashCard>

        {/* 매장 꾸미기 — 매장 페이지 탭 순서·순위 탭·칭호 */}
        <DashCard show={caps.manage} title="매장 꾸미기" onClick={() => onGoto('page')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">탭·순위·칭호 →</span>}>
          <p className="py-3 text-center text-2xs text-ink-muted">매장 페이지 탭 순서, 순위 탭 구성(1~2개), 1~3등 칭호·기준 점수를 설정합니다.</p>
        </DashCard>

        {/* 손님 유형 비중(오늘) */}
        <DashCard show={caps.manage} title="손님 유형" onClick={() => onGoto('stats')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-gold-300/15 text-gold-300">{playerTotal}명</span>}>
          {loading ? <Skeleton /> : playerTotal === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">오늘 명단이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {typeEntries.map(([k, n]) => (
                <li key={k} className="flex items-center gap-2 text-2xs">
                  <span className="w-14 shrink-0 text-ink-secondary">{k}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-surface-high overflow-hidden">
                    <span className="block h-full rounded-full bg-gold-300/80" style={{ width: `${Math.round((n / playerTotal) * 100)}%` }} />
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-ink-muted">{n}명 {Math.round((n / playerTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>
      </div>
    </div>
  );
}

function DashCard({ title, badge, onClick, children, show = true }: { title: string; badge?: ReactNode; onClick: () => void; children: ReactNode; show?: boolean }) {
  if (!show) return null;
  return (
    <section className="rounded-card border border-border-subtle bg-surface-low p-3">
      <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-2 mb-2 group">
        <span className="flex items-center gap-1.5 text-sm font-bold text-ink-primary">{title}</span>
        <span className="flex items-center gap-1">
          {badge}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted group-hover:text-gold-300 transition-colors" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
        </span>
      </button>
      {children}
    </section>
  );
}

function Stat({ label, value, unit, accent, danger }: { label: string; value: string; unit?: string; accent?: boolean; danger?: boolean }) {
  return (
    <div>
      <p className="text-2xs text-ink-muted">{label}</p>
      <p className={`font-extrabold tabular-nums leading-tight ${danger ? 'text-danger-light' : accent ? 'text-gold-300' : 'text-ink-primary'}`}>
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
      <span className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-sm font-bold text-ink-primary">{fmt(now)}</span>
        <span className="text-[10px] text-ink-muted">전주 {fmt(prev)}</span>
        {delta != null && (
          <span className={`text-2xs font-bold ${up ? 'text-emerald-400' : down ? 'text-danger-light' : 'text-ink-muted'}`}>
            {up ? '▲' : down ? '▼' : '–'}{Math.abs(delta)}%
          </span>
        )}
      </span>
    </div>
  );
}

function QuickAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-card border border-border-default bg-surface-high py-3 text-ink-secondary hover:text-gold-300 hover:border-gold-400/50 transition-colors active:scale-[0.98]">
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
    <Modal open={open} onClose={onClose} title="⚡ 포스터 상단 고정(부스트)" maxWidth="sm" variant="sheet">
      <div className="space-y-3 p-4">
        <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.06] p-3 space-y-1.5">
          <p className="text-sm font-bold text-gold-300">이런 효과가 있어요</p>
          <ul className="space-y-1 text-sm leading-relaxed text-ink-secondary">
            <li>· 내 포스터가 일정탐색 <b className="text-ink-primary">맨 위에 고정</b>됩니다</li>
            <li>· 제목에 <b className="text-gold-300">TOP 뱃지</b>가 붙어 눈에 띕니다</li>
            <li>· 기간은 <b className="text-ink-primary">3 / 7 / 14 / 30일</b> 중 선택, 끝나면 자동 해제</li>
          </ul>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-low p-3 space-y-2">
          <p className="text-sm font-bold text-ink-primary">문의 방법</p>
          {hasContact ? (
            <div className="space-y-1.5">
              {email.trim() && (
                <a href={`mailto:${email.trim()}`} className="btn flex items-center gap-2 rounded-input border border-border-default bg-surface-high px-3 py-2.5 text-sm font-semibold text-ink-primary">
                  ✉️ <span className="min-w-0 flex-1 truncate">{email.trim()}</span>
                  <span className="shrink-0 text-2xs text-gold-300">메일 보내기 →</span>
                </a>
              )}
              {phone.trim() && (
                <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="btn flex items-center gap-2 rounded-input border border-border-default bg-surface-high px-3 py-2.5 text-sm font-semibold text-ink-primary">
                  📞 <span className="min-w-0 flex-1 truncate">{phone.trim()}</span>
                  <span className="shrink-0 text-2xs text-gold-300">전화 걸기 →</span>
                </a>
              )}
            </div>
          ) : (
            <p className="py-2 text-center text-sm text-ink-muted">문의 연락처를 준비하고 있습니다.<br />곧 이 자리에서 바로 연락하실 수 있어요.</p>
          )}
          <p className="text-xs text-ink-muted">문의 주시면 기간·비용 안내 후, 확인되는 대로 포스터를 상단에 올려드립니다.</p>
        </div>
      </div>
    </Modal>
  );
}

// Skeleton은 공용 atom(../atoms/Skeleton) 사용
