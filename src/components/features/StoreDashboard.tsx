import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Schedule } from '../../api/schedules';
import {
  getLedgerSession, getLedgerBuyins, getLedgerRange, buyinFinance, wonToMan, subscribeLedger,
  type LedgerSession, type LedgerBuyin,
} from '../../api/ledger';
import { getClockState, subscribeClock, type ClockState } from '../../api/clock';
import { getReservationCounts, subscribeReservations } from '../../api/reservations';
import { getStaffSchedule, subscribeStaffSchedule, type StaffShift } from '../../api/staffSchedule';

const localToday = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD (로컬)
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const last7 = () => Array.from({ length: 7 }, (_, i) => {
  const dt = new Date(); dt.setDate(dt.getDate() - (6 - i));
  return dt.toLocaleDateString('en-CA');
});

interface Props {
  venueId: string;
  schedules: Schedule[];
  onGoto: (section: string) => void;
  onCreatePoster: () => void;
}

/**
 * 매장 대시보드 — 오늘 장부·클락·예약·출근 + 최근 7일 추세 + 미수 알림을 실시간 요약.
 * 모든 카드는 해당 운영 화면으로 바로가기. (실시간: 장부·클락·예약·출근 구독)
 */
export default function StoreDashboard({ venueId, schedules, onGoto, onCreatePoster }: Props) {
  const d = localToday();
  const days = last7();
  const [session, setSession] = useState<LedgerSession | null>(null);
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [resCounts, setResCounts] = useState<Record<string, number>>({});
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [range, setRange] = useState<{ sessions: LedgerSession[]; buyins: LedgerBuyin[] }>({ sessions: [], buyins: [] });
  const [loading, setLoading] = useState(true);

  const upcoming = schedules
    .filter((s) => s.venueId === venueId && s.date >= d)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const reload = useCallback(() => {
    getLedgerSession(venueId, d).then(setSession).catch(() => {});
    getLedgerBuyins(venueId, d).then(setBuyins).catch(() => {});
    getClockState(venueId).then(setClock).catch(() => {});
    getStaffSchedule(venueId, d, d).then(setShifts).catch(() => {});
    getLedgerRange(venueId, days[0], days[6]).then(setRange).catch(() => {});
    const ids = schedules.filter((s) => s.venueId === venueId && s.date >= d).map((s) => s.id);
    if (ids.length) getReservationCounts(ids).then(setResCounts).catch(() => {});
    else setResCounts({});
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, d]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);
  useEffect(() => subscribeLedger(venueId, reload), [venueId, reload]);
  useEffect(() => subscribeClock(venueId, reload), [venueId, reload]);
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

  // ── 예약 / 출근 ──
  const totalRes = upcoming.reduce((a, g) => a + (resCounts[g.id] ?? 0), 0);
  const workedStaff = shifts.filter((s) => s.checkIn);

  // ── 최근 7일 추세 ──
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

  return (
    <div className="space-y-3">
      {/* 미수·리스크 알림 */}
      {started && fin.unpaid > 0 && (
        <button type="button" onClick={() => onGoto('ledger')}
          className="flex w-full items-center gap-2 rounded-card border border-danger/40 bg-danger/[0.08] px-3 py-2.5 text-left hover:bg-danger/[0.12] transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-danger-light" aria-hidden><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span className="text-xs text-danger-light">오늘 <b className="tabular-nums">{wonToMan(fin.unpaid)}만원</b> 미수금이 있습니다 — 장부에서 확인하세요.</span>
        </button>
      )}

      {/* 빠른 작업 */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction label="새 게임" onClick={onCreatePoster}
          icon={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} />
        <QuickAction label="장부" onClick={() => onGoto('ledger')}
          icon={<><path d="M4 4h12a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z" /></>} />
        <QuickAction label="클락" onClick={() => onGoto('clock')}
          icon={<><circle cx="12" cy="13" r="7" /><path d="M12 10v3l2 2" /><line x1="9" y1="2" x2="15" y2="2" /></>} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 오늘 장부 */}
        <DashCard title="오늘 장부" onClick={() => onGoto('ledger')}
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

        {/* 클락 */}
        <DashCard title="토너먼트 클락" onClick={() => onGoto('clock')}
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

        {/* 최근 7일 추세 */}
        <DashCard title="최근 7일 추세" onClick={() => onGoto('stats')}
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
              {bestDay.entry > 0 && <p className="text-[10px] text-ink-muted mt-1">가장 활발: <b className="text-gold-300">{bestDay.dow}요일</b> ({bestDay.entry}엔트리)</p>}
            </>
          )}
        </DashCard>

        {/* 다가오는 예약 */}
        <DashCard title="다가오는 예약" onClick={() => onGoto('posters')}
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

        {/* 오늘 출근 */}
        <DashCard title="오늘 출근" onClick={() => onGoto('staff')}
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
      </div>
    </div>
  );
}

function DashCard({ title, badge, onClick, children }: { title: string; badge?: ReactNode; onClick: () => void; children: ReactNode }) {
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
        <span className="text-lg">{value}</span>{unit && <span className="ml-0.5 text-2xs font-semibold text-ink-muted">{unit}</span>}
      </p>
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

function Skeleton() {
  return <div className="h-12 rounded-input bg-surface-high/60 animate-pulse" />;
}
