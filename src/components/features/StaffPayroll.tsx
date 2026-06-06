// src/components/features/StaffPayroll.tsx
// 인건비 관리(시급/급여일/휴무) · 인건비 정산(월 급여·평균출퇴근·총인건비) · 출근일지(일별 출퇴근).
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { getStaffSchedule, getStaffWages, saveStaffWage, setShiftTimes, subscribeStaffSchedule, type StaffShift, type StaffWage } from '../../api/staffSchedule';
import { getMyVenueStaff } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';

const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const thisMonth = () => ymOf(new Date());
function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}
function shiftMonth(month: string, d: number): string { const [y, m] = month.split('-').map(Number); return ymOf(new Date(y, m - 1 + d, 1)); }
function hours(inHm?: string | null, outHm?: string | null): number {
  if (!inHm || !outHm) return 0;
  const [ih, im] = inHm.split(':').map(Number); const [oh, om] = outHm.split(':').map(Number);
  let mins = (oh * 60 + om) - (ih * 60 + im); if (mins < 0) mins += 1440; return mins / 60;
}
function avgHm(list: (string | null | undefined)[]): string {
  const v = list.filter(Boolean) as string[];
  if (!v.length) return '—';
  const mins = v.map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  const a = Math.round(mins.reduce((s, x) => s + x, 0) / mins.length);
  return `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

function useRoster(venueId: string) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    Promise.all([getMyVenueStaff(), getStaffSchedule(venueId, '2000-01-01', '2999-12-31').catch(() => [] as StaffShift[])])
      .then(([staff, shifts]) => {
        const set = new Set<string>(); staff.forEach((s) => set.add(s.name)); shifts.forEach((s) => set.add(s.name));
        setNames([...set]);
      }).catch(() => {});
  }, [venueId]);
  return names;
}

// ── 인건비 관리 ──────────────────────────────────────────────────────────────
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function StaffWageManager({ venueId }: { venueId: string }) {
  const toast = useToast();
  const roster = useRoster(venueId);
  const [wages, setWages] = useState<Record<string, StaffWage>>({});
  useEffect(() => { getStaffWages(venueId).then((ws) => { const m: Record<string, StaffWage> = {}; ws.forEach((w) => (m[w.name] = w)); setWages(m); }).catch(() => {}); }, [venueId]);

  const get = (n: string): StaffWage => wages[n] ?? { name: n, hourlyWage: 0, payday: 0, weeklyOff: '', memo: '' };
  const set = (n: string, patch: Partial<StaffWage>) => setWages((w) => ({ ...w, [n]: { ...get(n), ...patch } }));
  const save = async (n: string) => { try { await saveStaffWage(venueId, get(n)); toast.show(`${n} 인건비 설정을 저장했습니다`, 'success'); } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); } };
  const toggleOff = (n: string, d: string) => { const cur = get(n).weeklyOff.split(',').filter(Boolean); const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]; set(n, { weeklyOff: next.join(',') }); };

  return (
    <div className="space-y-2">
      <p className="text-2xs text-ink-muted">시급제 기준(기본급 없음). 직원별 시급·급여일·휴무 요일을 설정하세요.</p>
      {roster.length === 0 ? <p className="text-2xs text-ink-muted text-center py-4">등록된 직원이 없습니다. 「출근 스케줄」에서 직원을 등록하세요.</p> : roster.map((n) => {
        const w = get(n); const offs = w.weeklyOff.split(',').filter(Boolean);
        return (
          <div key={n} className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink-primary">{n}</span>
              <button type="button" onClick={() => save(n)} className="btn-ghost text-2xs px-2.5 py-1">저장</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="block text-[10px] text-ink-muted mb-0.5">시급(원)</span>
                <input type="number" value={w.hourlyWage || ''} onChange={(e) => set(n, { hourlyWage: +e.target.value || 0 })} placeholder="예) 12000" className="input w-full text-sm tabular-nums" /></label>
              <label className="block"><span className="block text-[10px] text-ink-muted mb-0.5">급여일(매월)</span>
                <input type="number" min="0" max="31" value={w.payday || ''} onChange={(e) => set(n, { payday: Math.min(31, +e.target.value || 0) })} placeholder="예) 10" className="input w-full text-sm tabular-nums" /></label>
            </div>
            <div>
              <span className="block text-[10px] text-ink-muted mb-0.5">휴무 요일</span>
              <div className="flex gap-1">
                {DOW.map((d) => (
                  <button key={d} type="button" onClick={() => toggleOff(n, d)}
                    className={['flex-1 py-1 rounded text-2xs font-bold border', offs.includes(d) ? 'bg-rose-500/15 text-rose-300 border-rose-500/40' : 'bg-surface-high text-ink-muted border-border-subtle'].join(' ')}>{d}</button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 인건비 정산 ──────────────────────────────────────────────────────────────
export function StaffSettlement({ venueId }: { venueId: string }) {
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [wages, setWages] = useState<Record<string, number>>({});
  const [from, to] = monthRange(month);
  useEffect(() => { getStaffSchedule(venueId, from, to).then(setShifts).catch(() => {}); }, [venueId, from, to]);
  useEffect(() => { getStaffWages(venueId).then((ws) => { const m: Record<string, number> = {}; ws.forEach((w) => (m[w.name] = w.hourlyWage)); setWages(m); }).catch(() => {}); }, [venueId]);

  const rows = useMemo(() => {
    const byName = new Map<string, StaffShift[]>();
    for (const s of shifts) { const a = byName.get(s.name) ?? []; a.push(s); byName.set(s.name, a); }
    return [...byName.entries()].map(([name, list]) => {
      const days = list.length;
      const hrs = list.reduce((s, x) => s + hours(x.checkIn, x.checkOut), 0);
      const pay = Math.round(hrs * (wages[name] ?? 0));
      return { name, days, hrs, pay, avgIn: avgHm(list.map((x) => x.checkIn)), avgOut: avgHm(list.map((x) => x.checkOut)) };
    }).sort((a, b) => b.pay - a.pay);
  }, [shifts, wages]);
  const totalPay = rows.reduce((s, r) => s + r.pay, 0);
  const totalHrs = rows.reduce((s, r) => s + r.hrs, 0);
  const avgIn = avgHm(shifts.map((s) => s.checkIn));
  const avgOut = avgHm(shifts.map((s) => s.checkOut));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-1">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-gold-300">‹</button>
        <span className="text-sm font-bold text-gold-300 tabular-nums w-[5rem] text-center">{month}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-gold-300">›</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-card border border-gold-400/40 bg-gold-300/[0.07] p-2.5 text-center">
          <p className="text-[10px] text-ink-muted">총 인건비</p>
          <p className="text-xl font-extrabold text-gold-200 tabular-nums">{totalPay.toLocaleString()}원</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-base p-2.5 text-center">
          <p className="text-[10px] text-ink-muted">총 근무시간</p>
          <p className="text-xl font-extrabold text-ink-primary tabular-nums">{totalHrs.toFixed(1)}h</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-input border border-border-subtle bg-surface-base py-2 text-center"><p className="text-[11px] text-ink-muted">평균 출근</p><p className="text-base font-bold text-ink-primary tabular-nums">{avgIn}</p></div>
        <div className="rounded-input border border-border-subtle bg-surface-base py-2 text-center"><p className="text-[11px] text-ink-muted">평균 퇴근</p><p className="text-base font-bold text-ink-primary tabular-nums">{avgOut}</p></div>
      </div>
      {rows.length === 0 ? <p className="text-2xs text-ink-muted text-center py-3">{month} 출근 기록이 없습니다.</p> : (
        <div className="overflow-x-auto scrollbar-none">
          <table className="w-full text-center border-separate border-spacing-0 min-w-[20rem]">
            <thead><tr className="text-[11px] text-ink-muted"><th className="py-1 text-left pl-1">직원</th><th>출근</th><th>시간</th><th>평균 출/퇴</th><th>급여</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="text-xs">
                  <td className="py-1.5 text-left pl-1 font-bold text-ink-primary">{r.name}</td>
                  <td className="text-ink-secondary tabular-nums">{r.days}일</td>
                  <td className="text-ink-secondary tabular-nums">{r.hrs.toFixed(1)}h</td>
                  <td className="text-ink-muted tabular-nums text-[11px]">{r.avgIn}/{r.avgOut}</td>
                  <td className="text-gold-300 tabular-nums font-bold">{r.pay.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-ink-muted">급여 = 근무시간 × 시급(「인건비 관리」 설정). 시간은 출퇴근이 모두 기록된 날만 합산됩니다.</p>
    </div>
  );
}

// ── 출근 일지 ────────────────────────────────────────────────────────────────
export function StaffWorkLog({ venueId }: { venueId: string }) {
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [from, to] = monthRange(month);
  useEffect(() => { getStaffSchedule(venueId, from, to).then(setShifts).catch(() => {}); }, [venueId, from, to]);
  const sorted = useMemo(() => [...shifts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name))), [shifts]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-1">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-gold-300">‹</button>
        <span className="text-sm font-bold text-gold-300 tabular-nums w-[5rem] text-center">{month}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-gold-300">›</button>
      </div>
      {sorted.length === 0 ? <p className="text-2xs text-ink-muted text-center py-3">기록이 없습니다.</p> : (
        <div className="rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle max-h-[24rem] overflow-y-auto">
          {sorted.map((s, i) => (
            <div key={`${s.date}-${s.name}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <span className="w-14 shrink-0 text-2xs text-gold-300 tabular-nums">{s.date.slice(5)}</span>
              <span className="flex-1 font-semibold text-ink-primary truncate">{s.name}</span>
              <span className="text-ink-secondary tabular-nums">{s.checkIn || s.startHm || '—'}~{s.checkOut || '—'}</span>
              <span className="w-12 text-right text-emerald-400 tabular-nums">{(s.checkIn && s.checkOut) ? `${hours(s.checkIn, s.checkOut).toFixed(1)}h` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 직원 본인 출퇴근 입력(셀프) ───────────────────────────────────────────────
export function StaffSelfAttendance({ venueId }: { venueId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [from, to] = monthRange(month);
  const myNames = [user?.name, user?.nickname].filter(Boolean) as string[];
  const today = new Date().toLocaleDateString('en-CA');
  const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  useEffect(() => {
    const reload = () => getStaffSchedule(venueId, from, to).then((ss) => setShifts(ss.filter((s) => myNames.includes(s.name)))).catch(() => {});
    reload();
    return subscribeStaffSchedule(venueId, reload); // 실시간 동기화
    /* eslint-disable-next-line */
  }, [venueId, from, to, user]);
  const setT = async (s: StaffShift, field: 'checkIn' | 'checkOut', val: string) => {
    setShifts((arr) => arr.map((x) => (x.date === s.date && x.name === s.name ? { ...x, [field]: val || null } : x)));
    try { await setShiftTimes(venueId, s.date, s.name, { [field]: val || null }); } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
  };
  const sorted = [...shifts].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-primary">내 출근 관리 (출퇴근 기록)</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-gold-300">‹</button>
          <span className="text-xs font-bold text-gold-300 tabular-nums w-[4.5rem] text-center">{month}</span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-gold-300">›</button>
        </div>
      </div>
      {!user ? <p className="text-2xs text-ink-muted">로그인이 필요합니다.</p> : sorted.length === 0 ? (
        <p className="text-2xs text-ink-muted text-center py-4">배정된 출근 일정이 없습니다 (내 이름: {myNames.join(' / ') || '-'}).<br />업주가 스케줄에 본인 이름으로 배정하면 여기서 출퇴근을 기록할 수 있습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((s) => {
            const isToday = s.date === today;
            return (
              <div key={s.date} className={['rounded-input border p-2.5', isToday ? 'border-gold-400/50 bg-gold-300/[0.06]' : 'border-border-subtle bg-surface-base'].join(' ')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink-primary">{s.date.slice(5)}{isToday ? ' (오늘)' : ''}{s.confirmed && <span className="ml-1.5 text-2xs text-emerald-400">확정</span>}</span>
                  {isToday && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setT(s, 'checkIn', nowHm())} className="text-2xs font-bold px-2 py-1 rounded-input bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">지금 출근</button>
                      <button type="button" onClick={() => setT(s, 'checkOut', nowHm())} className="text-2xs font-bold px-2 py-1 rounded-input bg-rose-500/15 text-rose-300 border border-rose-500/40">지금 퇴근</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <label className="flex items-center gap-1 text-[10px] text-ink-muted">출근<input type="time" value={s.checkIn ?? s.startHm ?? ''} onChange={(e) => setT(s, 'checkIn', e.target.value)} className="input text-xs py-1 w-[6rem]" /></label>
                  <label className="flex items-center gap-1 text-[10px] text-ink-muted">퇴근<input type="time" value={s.checkOut ?? ''} onChange={(e) => setT(s, 'checkOut', e.target.value)} className="input text-xs py-1 w-[6rem]" /></label>
                  {s.checkIn && s.checkOut && <span className="text-2xs text-gold-300 tabular-nums font-bold">{hours(s.checkIn, s.checkOut).toFixed(1)}h</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
