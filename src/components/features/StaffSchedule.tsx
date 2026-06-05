// src/components/features/StaffSchedule.tsx
// 딜러/직원 월별 출근 스케줄 — 직원 등록 → 월 캘린더로 출근 배정 → 직원별 출근/휴무 집계.
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { getStaffSchedule, addStaffShift, removeStaffShift, type StaffShift } from '../../api/staffSchedule';
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

export default function StaffSchedule({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [venueStaff, setVenueStaff] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [selDay, setSelDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => monthDays(month), [month]);
  const from = days[0], to = days[days.length - 1];

  useEffect(() => {
    setLoading(true);
    getStaffSchedule(venueId, from, to).then(setShifts).catch(() => {}).finally(() => setLoading(false));
    setSelDay(null);
  }, [venueId, from, to]);
  useEffect(() => { getMyVenueStaff().then((s) => setVenueStaff(s.map((x) => x.name))).catch(() => {}); }, []);

  // 명부: 매장 등록직원 ∪ 이번달 배정된 이름 ∪ 수동 등록
  const roster = useMemo(() => {
    const set = new Set<string>();
    venueStaff.forEach((n) => set.add(n));
    shifts.forEach((s) => set.add(s.name));
    extraNames.forEach((n) => set.add(n));
    return [...set];
  }, [venueStaff, shifts, extraNames]);

  const byDate = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of shifts) { const a = m.get(s.date) ?? []; a.push(s.name); m.set(s.date, a); }
    return m;
  }, [shifts]);

  const operatingDays = useMemo(() => new Set(shifts.map((s) => s.date)).size, [shifts]);
  const summary = useMemo(() => {
    const work = new Map<string, number>();
    for (const s of shifts) work.set(s.name, (work.get(s.name) ?? 0) + 1);
    return roster.map((n) => ({ name: n, work: work.get(n) ?? 0, off: Math.max(0, operatingDays - (work.get(n) ?? 0)) }))
      .sort((a, b) => b.work - a.work);
  }, [shifts, roster, operatingDays]);

  const addName = () => {
    const n = newName.trim();
    if (!n) return;
    if (!roster.includes(n)) setExtraNames((a) => [...a, n]);
    setNewName('');
  };
  const isOn = (date: string, name: string) => (byDate.get(date) ?? []).includes(name);
  const toggle = async (date: string, name: string) => {
    const on = isOn(date, name);
    try {
      if (on) { await removeStaffShift(venueId, date, name); setShifts((s) => s.filter((x) => !(x.date === date && x.name === name))); }
      else { await addStaffShift(venueId, date, name); setShifts((s) => [...s, { date, name }]); }
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
  };

  const firstDow = new Date(`${month}-01T00:00:00`).getDay();
  const todayStr = new Date().toLocaleDateString('en-CA');

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-primary">딜러 출근 스케줄</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-gold-300">‹</button>
          <span className="text-xs font-bold text-gold-300 tabular-nums w-[4.5rem] text-center">{month}</span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="w-7 h-7 rounded-input bg-surface-high text-ink-secondary hover:text-gold-300">›</button>
          <button type="button" onClick={() => setMonth(thisMonth())} className="text-2xs text-ink-muted hover:text-gold-300 px-1">이번달</button>
        </div>
      </div>

      {/* 직원 등록 */}
      <div>
        <p className="text-2xs font-semibold text-ink-secondary mb-1">직원 등록 — 이름 입력(등록된 매장 직원은 자동 포함)</p>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addName()} placeholder="직원 이름" maxLength={20} className="input flex-1 text-sm" />
          <button type="button" onClick={addName} className="btn-ghost text-xs px-3 shrink-0">+ 추가</button>
        </div>
        {roster.length > 0 && <p className="text-[10px] text-ink-muted mt-1">명부: {roster.join(' · ')}</p>}
      </div>

      {/* 월 캘린더 */}
      <div>
        <div className="grid grid-cols-7 gap-0.5 mb-0.5">
          {DOW.map((d, i) => <div key={d} className={['text-center text-[10px] font-bold py-0.5', i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-ink-muted'].join(' ')}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
          {days.map((date) => {
            const names = byDate.get(date) ?? [];
            const dn = Number(date.slice(8));
            const sel = selDay === date;
            const dow = new Date(`${date}T00:00:00`).getDay();
            return (
              <button key={date} type="button" onClick={() => setSelDay(sel ? null : date)}
                className={['min-h-[3.4rem] rounded-[6px] border p-0.5 text-left flex flex-col transition-colors',
                  sel ? 'border-gold-400 bg-gold-300/15' : date === todayStr ? 'border-gold-400/40 bg-surface-high' : 'border-border-subtle bg-surface-base hover:bg-surface-high'].join(' ')}>
                <span className={['text-[10px] font-bold leading-none', dow === 0 ? 'text-rose-400' : dow === 6 ? 'text-sky-400' : 'text-ink-secondary'].join(' ')}>{dn}</span>
                <div className="flex flex-col gap-0.5 mt-0.5 overflow-hidden">
                  {names.slice(0, 3).map((n) => <span key={n} className="text-[8px] leading-tight px-1 rounded bg-gold-300/20 text-gold-200 truncate">{n}</span>)}
                  {names.length > 3 && <span className="text-[8px] text-ink-muted leading-none">+{names.length - 3}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 날짜 편집 */}
      {selDay && (
        <div className="rounded-input border border-gold-400/40 bg-gold-300/[0.06] p-2.5">
          <p className="text-xs font-bold text-gold-300 mb-1.5">{selDay} 출근 직원 · 탭하여 토글</p>
          {roster.length === 0 ? (
            <p className="text-2xs text-ink-muted">먼저 위에서 직원을 등록하세요.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {roster.map((n) => {
                const on = isOn(selDay, n);
                return (
                  <button key={n} type="button" onClick={() => toggle(selDay, n)}
                    className={['text-xs font-semibold px-2.5 py-1.5 rounded-badge border transition-colors',
                      on ? 'bg-gold-300 text-ink-inverse border-gold-300' : 'bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>{n}</button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 직원별 출근/휴무 집계 */}
      <div>
        <p className="text-2xs font-semibold text-ink-secondary mb-1">직원별 출근/휴무 · {month} (영업 {operatingDays}일 기준)</p>
        {summary.length === 0 ? (
          <p className="text-2xs text-ink-muted text-center py-2">아직 스케줄이 없습니다. 날짜를 눌러 직원을 배정하세요.</p>
        ) : (
          <div className="rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle">
            {summary.map((r) => (
              <div key={r.name} className="flex items-center gap-2 px-2.5 py-2 text-xs">
                <span className="flex-1 font-semibold text-ink-primary truncate">{r.name}</span>
                <span className="text-emerald-400 tabular-nums font-bold">출근 {r.work}일</span>
                <span className="text-ink-muted tabular-nums">휴무 {r.off}일</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {loading && <p className="text-center text-2xs text-ink-muted">불러오는 중…</p>}
    </section>
  );
}
