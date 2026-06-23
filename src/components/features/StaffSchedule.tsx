// src/components/features/StaffSchedule.tsx
// 딜러/직원 월별 출근 스케줄 — 직원 등록 → 월 캘린더 배정(출근/퇴근 시각) → 출근/휴무·근무시간 집계.
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import {
  getStaffSchedule, addStaffShift, removeStaffShift, setShiftTimes, confirmSchedule, notifyVenueStaff, subscribeStaffSchedule, type StaffShift,
} from '../../api/staffSchedule';
import { getMyVenueStaff } from '../../api/auth';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const thisMonth = () => ymOf(new Date());
function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
}
// HH:mm → 분. 퇴근<출근이면 익일로 간주(+24h) — 새벽 마감 대응.
function hoursBetween(inHm?: string | null, outHm?: string | null): number {
  if (!inHm || !outHm) return 0;
  const [ih, im] = inHm.split(':').map(Number); const [oh, om] = outHm.split(':').map(Number);
  let mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

export default function StaffSchedule({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [venueStaff, setVenueStaff] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [selDay, setSelDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => monthDays(month), [month]);
  const from = days[0], to = days[days.length - 1];

  const reload = () => { getStaffSchedule(venueId, from, to).then(setShifts).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { setLoading(true); reload(); setSelDay(null); /* eslint-disable-next-line */ }, [venueId, from, to]);
  // 실시간: 직원 셀프 출퇴근/배정 변경 자동 반영
  useEffect(() => subscribeStaffSchedule(venueId, reload), [venueId, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { getMyVenueStaff().then((s) => setVenueStaff(s.map((x) => x.name))).catch(() => {}); }, []);

  const roster = useMemo(() => {
    const set = new Set<string>();
    venueStaff.forEach((n) => set.add(n));
    shifts.forEach((s) => set.add(s.name));
    extraNames.forEach((n) => set.add(n));
    return [...set];
  }, [venueStaff, shifts, extraNames]);

  const byDate = useMemo(() => {
    const m = new Map<string, StaffShift[]>();
    for (const s of shifts) { const a = m.get(s.date) ?? []; a.push(s); m.set(s.date, a); }
    return m;
  }, [shifts]);
  const shiftOf = (date: string, name: string) => shifts.find((s) => s.date === date && s.name === name);

  const operatingDays = useMemo(() => new Set(shifts.map((s) => s.date)).size, [shifts]);
  const summary = useMemo(() => {
    const work = new Map<string, number>(), hrs = new Map<string, number>();
    for (const s of shifts) { work.set(s.name, (work.get(s.name) ?? 0) + 1); hrs.set(s.name, (hrs.get(s.name) ?? 0) + hoursBetween(s.checkIn, s.checkOut)); }
    return roster.map((n) => ({ name: n, work: work.get(n) ?? 0, off: Math.max(0, operatingDays - (work.get(n) ?? 0)), hours: hrs.get(n) ?? 0 }))
      .sort((a, b) => b.work - a.work);
  }, [shifts, roster, operatingDays]);

  const addName = () => { const n = newName.trim(); if (!n) return; if (!roster.includes(n)) setExtraNames((a) => [...a, n]); setNewName(''); };
  const isOn = (date: string, name: string) => !!shiftOf(date, name);
  const toggle = async (date: string, name: string) => {
    try {
      if (isOn(date, name)) { await removeStaffShift(venueId, date, name); setShifts((s) => s.filter((x) => !(x.date === date && x.name === name))); }
      else { await addStaffShift(venueId, date, name); setShifts((s) => [...s, { date, name }]); }
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
  };
  const setTime = async (date: string, name: string, field: 'startHm' | 'checkIn' | 'checkOut', val: string) => {
    setShifts((s) => s.map((x) => (x.date === date && x.name === name ? { ...x, [field]: val || null } : x)));
    try { await setShiftTimes(venueId, date, name, { [field]: val || null }); } catch { /* noop */ }
  };
  const confirm = async () => {
    setSaving(true);
    try {
      await confirmSchedule(venueId, from, to);
      setShifts((s) => s.map((x) => ({ ...x, confirmed: true })));
      const n = await notifyVenueStaff(venueId, '출근 스케줄 확정', `${month} 출근 스케줄이 확정되었습니다. 본인 일정을 확인하세요.`, '/staff-schedule').catch(() => 0);
      toast.show(`${month} 스케줄을 확정했습니다 — 직원 ${n}명에게 알림 발송`, 'success');
    }
    catch (e) { toast.show(e instanceof Error ? e.message : '확정 실패', 'error'); }
    finally { setSaving(false); }
  };

  const firstDow = new Date(`${month}-01T00:00:00`).getDay();
  const todayStr = new Date().toLocaleDateString('en-CA');
  const totalHours = summary.reduce((s, r) => s + r.hours, 0);

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-ink-primary">딜러 출근 스케줄</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">‹</button>
          <span className="text-xs font-bold text-accent-300 tabular-nums w-[4.5rem] text-center">{month}</span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">›</button>
          <button type="button" onClick={() => setMonth(thisMonth())} className="text-2xs text-ink-muted hover:text-accent-300 px-1">이번달</button>
        </div>
      </div>

      {/* 직원 등록 */}
      <div>
        <p className="text-2xs font-semibold text-ink-secondary mb-1">직원 등록 — 이름 입력(등록된 매장 직원 자동 포함)</p>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addName()} placeholder="직원 이름" maxLength={20} className="input flex-1 text-sm" />
          <button type="button" onClick={addName} className="btn-ghost text-xs px-3 shrink-0">+ 추가</button>
        </div>
        {roster.length > 0 && <p className="text-[10px] text-ink-muted mt-1">명부: {roster.join(' · ')}</p>}
      </div>

      {/* 월 캘린더 — 칸에 이름·출퇴근 시각 표시(가독성 확대) */}
      <div>
        <div className="grid grid-cols-7 gap-0.5 mb-0.5">
          {DOW.map((d, i) => <div key={d} className={['text-center text-[11px] font-bold py-0.5', i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-ink-muted'].join(' ')}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
          {days.map((date) => {
            const list = byDate.get(date) ?? [];
            const dn = Number(date.slice(8));
            const sel = selDay === date;
            const dow = new Date(`${date}T00:00:00`).getDay();
            return (
              <button key={date} type="button" onClick={() => setSelDay(sel ? null : date)}
                className={['min-h-[4rem] rounded-[6px] border p-1 text-left flex flex-col transition-colors',
                  sel ? 'border-accent-400 bg-accent-300/15' : date === todayStr ? 'border-accent-400/40 bg-surface-high' : 'border-border-subtle bg-surface-base hover:bg-surface-high'].join(' ')}>
                <span className={['text-[11px] font-bold leading-none mb-0.5', dow === 0 ? 'text-rose-400' : dow === 6 ? 'text-sky-400' : 'text-ink-secondary'].join(' ')}>{dn}</span>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {list.slice(0, 3).map((s) => {
                    const t = s.checkIn || s.startHm ? `${s.checkIn || s.startHm || ''}${s.checkOut ? `~${s.checkOut}` : ''}` : '';
                    return (
                      <span key={s.name} className="text-[10px] leading-tight px-1 rounded bg-accent-300/20 text-accent-100 truncate">
                        {s.name}{t ? ` ${t}` : ''}
                      </span>
                    );
                  })}
                  {list.length > 3 && <span className="text-[9px] text-ink-muted leading-none">+{list.length - 3}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 날짜 편집 — 배정 토글 + 출퇴근 시각 */}
      {selDay && (
        <div className="rounded-input border border-accent-400/40 bg-accent-300/[0.06] p-2.5 space-y-2">
          <p className="text-xs font-bold text-accent-300">{selDay} 출근 직원 · 시각 입력</p>
          {roster.length === 0 ? (
            <p className="text-2xs text-ink-muted">먼저 위에서 직원을 등록하세요.</p>
          ) : roster.map((n) => {
            const sh = shiftOf(selDay, n);
            const on = !!sh;
            return (
              <div key={n} className="flex items-center gap-1.5 flex-wrap">
                <button type="button" onClick={() => toggle(selDay, n)}
                  className={['text-xs font-semibold px-2.5 py-1.5 rounded-badge border transition-colors shrink-0 w-20 text-center',
                    on ? 'bg-accent-300 text-white border-accent-300' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>{n}</button>
                {on && (
                  <>
                    <label className="flex items-center gap-1 text-[10px] text-ink-muted">출근<input type="time" value={sh?.checkIn ?? sh?.startHm ?? ''} onChange={(e) => setTime(selDay, n, 'checkIn', e.target.value)} className="input text-xs py-1 w-[5.5rem]" /></label>
                    <label className="flex items-center gap-1 text-[10px] text-ink-muted">퇴근<input type="time" value={sh?.checkOut ?? ''} onChange={(e) => setTime(selDay, n, 'checkOut', e.target.value)} className="input text-xs py-1 w-[5.5rem]" /></label>
                    {sh?.checkIn && sh?.checkOut && <span className="text-[10px] text-emerald-400 tabular-nums">{hoursBetween(sh.checkIn, sh.checkOut).toFixed(1)}h</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 확정 */}
      <button type="button" onClick={confirm} disabled={saving || shifts.length === 0}
        className="w-full py-2 rounded-input bg-accent-300/15 text-accent-300 border border-accent-400/40 text-xs font-bold hover:bg-accent-300/25 disabled:opacity-50">
        ✓ {month} 스케줄 확정 (등록 직원에게 공유)
      </button>

      {/* 직원별 출근/휴무/근무시간 집계 */}
      <div>
        <p className="text-2xs font-semibold text-ink-secondary mb-1">직원별 집계 · {month} (영업 {operatingDays}일 · 총 {totalHours.toFixed(1)}h)</p>
        {summary.length === 0 ? (
          <p className="text-2xs text-ink-muted text-center py-2">아직 스케줄이 없습니다. 날짜를 눌러 직원을 배정하세요.</p>
        ) : (
          <div className="rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle">
            {summary.map((r) => (
              <div key={r.name} className="flex items-center gap-2 px-2.5 py-2 text-xs">
                <span className="flex-1 font-semibold text-ink-primary truncate">{r.name}</span>
                <span className="text-emerald-400 tabular-nums font-bold">출근 {r.work}일</span>
                <span className="text-ink-muted tabular-nums">휴무 {r.off}일</span>
                <span className="text-accent-300 tabular-nums">{r.hours.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {loading && <p className="text-center text-2xs text-ink-muted">불러오는 중…</p>}
    </section>
  );
}
