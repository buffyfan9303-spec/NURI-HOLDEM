// src/components/features/StaffSchedule.tsx
// 딜러/직원 월별 출근 스케줄 — 직원 등록 → 월 캘린더 배정(출근/퇴근 시각) → 출근/휴무·근무시간 집계.
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import {
  getStaffSchedule, addStaffShift, removeStaffShift, setShiftTimes, confirmSchedule, notifyVenueStaff, subscribeStaffSchedule,
  getStaffWages, addStaffName, removeStaffName, type StaffShift,
} from '../../api/staffSchedule';
import { getMyVenueStaff } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { msgOf } from '../../lib/dbError';

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
  const { user } = useAuth();
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [venueStaff, setVenueStaff] = useState<{ id: string; name: string }[]>([]);
  const [wageNames, setWageNames] = useState<string[]>([]); // 배정 전에 이름만 등록해 둔 명부(staff_wage)
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [selDay, setSelDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0); // 명부 저장 후 재조회

  const days = useMemo(() => monthDays(month), [month]);
  const from = days[0], to = days[days.length - 1];

  const reload = () => { getStaffSchedule(venueId, from, to).then(setShifts).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { setLoading(true); reload(); setSelDay(null); }, [venueId, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  // 실시간: 직원 셀프 출퇴근/배정 변경 자동 반영
  useEffect(() => subscribeStaffSchedule(venueId, reload), [venueId, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  // venueId 를 반드시 넘긴다 — 생략하면 서버가 '내가 소유한 첫 매장'으로 폴백해서
  // 운영자(admin)가 매장을 골라 들어오면 구성원 목록엔 직원이 보이는데 이 명부만 0명이 된다.
  useEffect(() => { getMyVenueStaff(venueId).then((s) => setVenueStaff(s.map((x) => ({ id: x.id, name: x.name })))).catch(() => {}); }, [venueId]);

  // 이름 → 계정 id. 동명이인이면 **일부러 비운다** — 잘못된 주인을 행에 못박는 것보다
  // 이름만으로 두는 편이 안전하다(서버 판정이 동명이인을 페일클로즈로 처리한다, 20260829a).
  const staffIdByName = useMemo(() => {
    const count = new Map<string, number>(), id = new Map<string, string>();
    const add = (n: string | undefined | null, uid: string) => {
      const k = (n ?? '').trim().toLowerCase();
      if (!k || id.get(k) === uid) return; // 같은 사람의 name·nickname 이 같으면 두 번 세지 않는다
      count.set(k, (count.get(k) ?? 0) + 1); id.set(k, uid);
    };
    venueStaff.forEach((s) => add(s.name, s.id));
    // 업주 본인은 getMyVenueStaff(venue_staff 한정)에 없다 — 자기 시프트에도 주인을 적을 수 있게 더한다.
    if (user) { add(user.name, user.id); add(user.nickname, user.id); }
    const m = new Map<string, string>();
    for (const [k, n] of count) if (n === 1) m.set(k, id.get(k)!);
    return m;
  }, [venueStaff, user]);
  useEffect(() => { getStaffWages(venueId).then((ws) => setWageNames(ws.map((w) => w.name))).catch(() => {}); }, [venueId, tick]);

  const roster = useMemo(() => {
    const set = new Set<string>();
    venueStaff.forEach((s) => set.add(s.name));
    wageNames.forEach((n) => set.add(n));
    shifts.forEach((s) => set.add(s.name));
    extraNames.forEach((n) => set.add(n));
    return [...set];
  }, [venueStaff, wageNames, shifts, extraNames]);

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

  // '등록' 은 저장까지 간다 — 예전엔 state 에만 넣어서 배정 전에 새로고침하면 이름이 사라졌다.
  const addName = async () => {
    const n = newName.trim();
    if (!n) { toast.show('직원 이름을 입력하세요', 'info'); return; }
    if (roster.includes(n)) { toast.show(`${n} 은(는) 이미 명부에 있습니다`, 'info'); setNewName(''); return; }
    setExtraNames((a) => [...a, n]); setNewName('');
    try { await addStaffName(venueId, n); setTick((t) => t + 1); }
    catch (e) { setExtraNames((a) => a.filter((x) => x !== n)); toast.show(msgOf(e, '직원 등록에 실패했습니다'), 'error'); }
  };
  // 오타로 등록한 이름이 영구히 남지 않게 — 구성원도 아니고 배정 이력도 없는 이름만 뺄 수 있다.
  const dropName = async (n: string) => {
    setExtraNames((a) => a.filter((x) => x !== n));
    setWageNames((a) => a.filter((x) => x !== n));
    try { await removeStaffName(venueId, n); }
    catch (e) { toast.show(msgOf(e, '명부에서 제거하지 못했습니다'), 'error'); setTick((x) => x + 1); }
  };
  const isOn = (date: string, name: string) => !!shiftOf(date, name);
  const toggle = async (date: string, name: string) => {
    try {
      if (isOn(date, name)) { await removeStaffShift(venueId, date, name); setShifts((s) => s.filter((x) => !(x.date === date && x.name === name))); }
      else {
        // 이름이 구성원 한 명으로 확정될 때만 주인(user_id)을 함께 적는다 — 동명이인이면 이름만.
        await addStaffShift(venueId, date, name, staffIdByName.get(name.trim().toLowerCase()) ?? null);
        setShifts((s) => [...s, { date, name }]);
      }
    } catch (e) { toast.show(msgOf(e, '저장 실패'), 'error'); }
  };
  // 실패를 삼키지 않는다 — 예전엔 catch{noop} 이라 저장이 안 돼도 입력칸엔 값이 남아
  // '저장된 것처럼' 보였다(배정 없는 날에 시각을 넣으면 서버가 0행을 고치고 200 을 준다).
  const setTime = async (date: string, name: string, field: 'startHm' | 'checkIn' | 'checkOut', val: string) => {
    const prev = shiftOf(date, name)?.[field] ?? null;
    setShifts((s) => s.map((x) => (x.date === date && x.name === name ? { ...x, [field]: val || null } : x)));
    try { await setShiftTimes(venueId, date, name, { [field]: val || null }); }
    catch (e) {
      setShifts((s) => s.map((x) => (x.date === date && x.name === name ? { ...x, [field]: prev } : x)));
      toast.show(msgOf(e, '시각을 저장하지 못했습니다'), 'error');
    }
  };
  const confirm = async () => {
    setSaving(true);
    try {
      await confirmSchedule(venueId, from, to);
      setShifts((s) => s.map((x) => ({ ...x, confirmed: true })));
      // 링크(/staff-schedule)를 받을 핸들러가 아직 없어 클릭이 토스트로 끝난다 —
      // 그래서 메시지가 갈 곳을 직접 말한다(알림이 지키지 못할 약속을 하지 않게).
      const n = await notifyVenueStaff(venueId, '출근 스케줄 확정',
        `${month} 출근 스케줄이 확정되었습니다. 「내 매장 → 출근 관리」에서 본인 일정을 확인하세요.`, '/staff-schedule').catch(() => 0);
      // 발송 인원은 **호출자를 뺀 구성원 수**다(20260829a). 0명이면 숫자 대신 이유를 말한다 —
      // "직원 0명에게 발송" 은 성공 문구의 얼굴을 한 막다른 길이다.
      toast.show(n > 0
        ? `${month} 스케줄을 확정했습니다 — 직원 ${n}명에게 알림 발송`
        : `${month} 스케줄을 확정했습니다 — 알림 받을 매장 구성원이 아직 없습니다`, 'success');
    }
    catch (e) { toast.show(msgOf(e, '확정 실패'), 'error'); }
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
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="h-9 w-9 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">‹</button>
          <span className="text-xs font-bold text-accent-300 dark:text-accent-200 tabular-nums w-[4.5rem] text-center">{month}</span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="h-9 w-9 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">›</button>
          <button type="button" onClick={() => setMonth(thisMonth())} className="h-9 px-2 rounded-input text-2xs text-ink-muted hover:text-accent-300">이번달</button>
        </div>
      </div>

      {/* 직원 등록 */}
      <div>
        <p className="text-2xs font-semibold text-ink-secondary mb-1">직원 등록 — 이름 입력(등록된 매장 직원 자동 포함)</p>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; /* 한글 조합 확정 Enter 를 제출로 오인하지 않게 */ if (e.key === 'Enter') void addName(); }} placeholder="직원 이름" maxLength={20} className="input flex-1 text-sm" />
          <button type="button" onClick={() => void addName()} className="btn-ghost text-xs px-3 shrink-0">+ 추가</button>
        </div>
        {roster.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-2xs text-ink-muted mr-0.5">명부</span>
            {roster.map((n) => {
              // 구성원(계정 연동)과 배정 이력이 있는 이름은 임의로 빼지 않는다 — 집계·정산의 근거다.
              const removable = !venueStaff.some((v) => v.name === n) && !shifts.some((s) => s.name === n);
              return (
                <span key={n} className="inline-flex items-center gap-0.5 rounded-badge border border-border-subtle bg-surface-high pl-2 pr-1 py-0.5 text-2xs text-ink-secondary">
                  {n}
                  {removable && (
                    <button type="button" onClick={() => void dropName(n)} aria-label={`${n} 명부에서 제거`} title="명부에서 제거"
                      className="px-1 leading-none text-ink-muted hover:text-danger-light">×</button>
                  )}
                </span>
              );
            })}
          </div>
        )}
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
                      <span key={s.name} className="text-2xs leading-tight px-1 rounded bg-accent-300/20 text-accent-100 truncate">
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
          <p className="text-xs font-bold text-accent-300 dark:text-accent-200">{selDay} 출근 직원 · 시각 입력</p>
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
                    <label className="flex items-center gap-1 text-2xs text-ink-muted">출근<input type="time" value={sh?.checkIn ?? sh?.startHm ?? ''} onChange={(e) => setTime(selDay, n, 'checkIn', e.target.value)} className="input text-xs py-1 w-[5.5rem]" /></label>
                    <label className="flex items-center gap-1 text-2xs text-ink-muted">퇴근<input type="time" value={sh?.checkOut ?? ''} onChange={(e) => setTime(selDay, n, 'checkOut', e.target.value)} className="input text-xs py-1 w-[5.5rem]" /></label>
                    {sh?.checkIn && sh?.checkOut && <span className="text-2xs text-emerald-700 dark:text-emerald-400 tabular-nums">{hoursBetween(sh.checkIn, sh.checkOut).toFixed(1)}h</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 확정 */}
      <button type="button" onClick={confirm} disabled={saving || shifts.length === 0}
        className="w-full py-2 rounded-input bg-accent-300/15 text-accent-300 dark:text-accent-200 border border-accent-400/40 text-xs font-bold hover:bg-accent-300/25 disabled:opacity-50">
        ✓ {month} 스케줄 확정 (등록 직원에게 공유)
      </button>

      {/* 직원별 출근/휴무/근무시간 집계 */}
      <div>
        <p className="text-2xs font-semibold text-ink-secondary mb-1">직원별 집계 · {month} (영업 {operatingDays}일 · 총 {totalHours.toFixed(1)}h)</p>
        {shifts.length === 0 ? (
          <p className="text-2xs text-ink-muted text-center py-2">아직 스케줄이 없습니다. 날짜를 눌러 직원을 배정하세요.</p>
        ) : (
          <div className="rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle">
            {summary.map((r) => (
              <div key={r.name} className="flex items-center gap-2 px-2.5 py-2 text-xs">
                <span className="flex-1 font-semibold text-ink-primary truncate">{r.name}</span>
                <span className="text-emerald-700 dark:text-emerald-400 tabular-nums font-bold">출근 {r.work}일</span>
                <span className="text-ink-muted tabular-nums">휴무 {r.off}일</span>
                <span className="text-accent-300 dark:text-accent-200 tabular-nums">{r.hours.toFixed(1)}h</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {loading && <p className="text-center text-2xs text-ink-muted">불러오는 중…</p>}
    </section>
  );
}
