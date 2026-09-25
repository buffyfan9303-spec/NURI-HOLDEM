// src/components/features/StaffPayroll.tsx
// 인건비 관리(시급/급여일/휴무) · 인건비 정산(월 급여·평균출퇴근·총인건비) · 출근일지(일별 출퇴근).
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { getStaffSchedule, getStaffWages, saveStaffWage, setMyShiftTime, subscribeStaffSchedule, type StaffShift, type StaffWage } from '../../api/staffSchedule';
import { getMyVenueStaff } from '../../api/auth';
// 급여 시스템이 두 벌이다 — 직원(staff_schedule × staff_wage)과 딜러 로테이션(dealer_shifts).
// 딜러는 시급이 **시프트 행에 직접** 붙어 있어 staff_wage 와 무관하다. 합계는 둘을 더해야 맞다.
import { getDealerShifts, type DealerShift } from '../../api/dealerShifts';
import { usePayRules } from '../../api/payrollRules';
import { belowMinWage, laborSummary, weekStartOf, type LaborRow, type PayRules } from '../../lib/staffPay';
import { useAuth } from '../../contexts/AuthContext';
import { msgOf } from '../../lib/dbError';
import { kstToday } from '../../lib/kst';

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
    // getMyVenueStaff 에 venueId 를 넘겨야 한다 — 생략하면 서버가 '내가 소유한 첫 매장'으로
    // 폴백해서 운영자(admin)나 매장을 2개 이상 가진 업주에겐 명부가 통째로 비었다.
    // staff_wage 도 명부 소스다('출근 스케줄'의 이름만 등록이 여기에 쌓인다).
    Promise.all([
      getMyVenueStaff(venueId).catch(() => []),
      getStaffWages(venueId).catch(() => [] as StaffWage[]),
      getStaffSchedule(venueId, '2000-01-01', '2999-12-31').catch(() => [] as StaffShift[]),
    ]).then(([staff, wages, shifts]) => {
      const set = new Set<string>();
      staff.forEach((s) => set.add(s.name));
      wages.forEach((w) => set.add(w.name));
      shifts.forEach((s) => set.add(s.name));
      setNames([...set]);
    }).catch(() => {});
  }, [venueId]);
  return names;
}

// ── 급여 계산 설정(매장) ─────────────────────────────────────────────────────
// 법적 판단이 매장마다 달라 앱이 정하지 않는 것만 스위치로 둔다(PAYROLL-LAW 2026-09-26). 근거 조문을 옆에 짧게.
const RULE_ROWS: { key: keyof PayRules; label: string; law: string }[] = [
  { key: 'autoBreak', label: '휴게 자동 공제', law: '근로기준법 제54조 — 4시간에 30분, 8시간에 1시간 이상. 실제 휴게 기록이 있으면 그것을 씁니다.' },
  { key: 'weeklyHoliday', label: '주휴수당 계산', law: '제55조 — 주 소정근로 15시간 이상·개근 시. 주 15시간 미만(제18조③)은 제외.' },
  { key: 'fivePlus', label: '상시 근로자 5인 이상', law: '제11조·제56조 — 켜면 연장·야간(22~06시)·휴일 근로 50% 가산을 따로 계산합니다.' },
  { key: 'earlyCredit', label: '조기 출근 인정', law: '끄면 계획 시작 전 출근은 세지 않습니다. 일찍 나오도록 지시하는 매장은 켜세요.' },
];

export function PayRulesPanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const { rules, state, err, save } = usePayRules(venueId);
  const [draft, setDraft] = useState<PayRules>(rules);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(rules); }, [rules]);
  const dirty = RULE_ROWS.some((r) => draft[r.key] !== rules[r.key]);
  // 못 불러온 설정을 덮어쓰지 않는다 — StaffWageManager 의 loadErr 와 같은 이유.
  const canSave = state === 'ready' && dirty && !saving;
  const onSave = async () => {
    setSaving(true);
    try { await save(draft); toast.show('급여 계산 설정을 저장했습니다', 'success'); }
    catch (e) { toast.show(msgOf(e, '급여 계산 설정 저장 실패'), 'error'); }
    finally { setSaving(false); }
  };
  return (
    <div data-testid="pay-rules" className="space-y-1.5 rounded-input border border-border-subtle bg-surface-base p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink-primary">급여 계산 설정</span>
        <button type="button" onClick={onSave} disabled={!canSave} className="btn-ghost px-3 py-1.5 text-2xs disabled:opacity-40">{saving ? '저장 중…' : '저장'}</button>
      </div>
      <p className="text-2xs text-ink-muted break-keep">기본은 모두 꺼져 있습니다. 해당하는 매장만 켜세요.</p>
      {state === 'error' && <p role="alert" className="text-2xs text-danger-light">{err} — 기본값으로 보여 주며 저장은 막아 두었습니다.</p>}
      {state === 'missing' && <p className="text-2xs text-ink-muted">설정 저장은 준비 중입니다. 지금은 기본값으로 계산합니다.</p>}
      {RULE_ROWS.map((r) => (
        <label key={r.key} className="flex items-start gap-2 py-1">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={draft[r.key]} disabled={state !== 'ready'}
            onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.checked }))} />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-ink-primary">{r.label}</span>
            <span className="block text-2xs text-ink-muted break-keep">{r.law}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** 최저임금 미만 경고 — 저장은 막지 않는다(수습 감액 등 예외가 있다). */
export function MinWageNote({ wage }: { wage: number }) {
  const m = belowMinWage(wage, kstToday());
  if (!m) return null;
  return (
    <p data-testid="min-wage-warn" className="text-2xs text-amber-700 dark:text-amber-300 break-keep">
      {m.year}년 최저임금(시간급 {m.wage.toLocaleString()}원)보다 낮습니다. 수습 감액 등 예외가 아니면 확인해 주세요.
    </p>
  );
}

// ── 인건비 관리 ──────────────────────────────────────────────────────────────
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function StaffWageManager({ venueId }: { venueId: string }) {
  const toast = useToast();
  const roster = useRoster(venueId);
  const [wages, setWages] = useState<Record<string, StaffWage>>({});
  // ⚠ 조회 실패를 삼키면 **데이터가 사라진다**(표시 버그가 아니다).
  //   wages 가 빈 채로 남으면 get(n) 이 모든 직원에게 hourlyWage:0 폴백을 돌려주고,
  //   폼은 빈칸으로 그려진다. 여기서 「저장」을 누르면 saveStaffWage 가 **실제 시급을 0으로 덮어쓴다**.
  //   읽지 못한 값을 읽기-수정-쓰기 하면 안 된다 — 실패 중에는 저장을 막는다(2026-09-11 감사).
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => {
    setLoadErr(null);
    getStaffWages(venueId)
      .then((ws) => { const m: Record<string, StaffWage> = {}; ws.forEach((w) => (m[w.name] = w)); setWages(m); })
      .catch((e) => { setWages({}); setLoadErr(msgOf(e, '시급 설정을 불러오지 못했습니다')); });
  }, [venueId]);

  const get = (n: string): StaffWage => wages[n] ?? { name: n, hourlyWage: 0, payday: 0, weeklyOff: '', memo: '' };
  const set = (n: string, patch: Partial<StaffWage>) => setWages((w) => ({ ...w, [n]: { ...get(n), ...patch } }));
  const save = async (n: string) => { try { await saveStaffWage(venueId, get(n)); toast.show(`${n} 인건비 설정을 저장했습니다`, 'success'); } catch (e) { toast.show(msgOf(e, '인건비 설정 저장 실패'), 'error'); } };
  const toggleOff = (n: string, d: string) => { const cur = get(n).weeklyOff.split(',').filter(Boolean); const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]; set(n, { weeklyOff: next.join(',') }); };

  return (
    <div className="space-y-2">
      <PayRulesPanel venueId={venueId} />
      <p className="text-2xs text-ink-muted">시급제 (기본급 없음)</p>
      {loadErr && (
        <p role="alert" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">
          {loadErr} — 지금 저장하면 기존 시급이 0으로 덮어써지므로 저장을 막아 두었습니다. 새로고침 후 다시 시도하세요.
        </p>
      )}
      {roster.length === 0 ? <p className="text-2xs text-ink-muted text-center py-4">등록된 직원이 없습니다. 「출근 스케줄」에서 직원을 등록하세요.</p> : roster.map((n) => {
        const w = get(n); const offs = w.weeklyOff.split(',').filter(Boolean);
        return (
          <div key={n} className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink-primary">{n}</span>
              <button type="button" onClick={() => save(n)} disabled={!!loadErr}
                className="btn-ghost px-3 py-1.5 text-2xs disabled:opacity-40">저장</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="block text-2xs text-ink-muted mb-0.5">시급(원)</span>
                <input type="number" inputMode="numeric" min="0" value={w.hourlyWage || ''} onChange={(e) => set(n, { hourlyWage: Math.max(0, +e.target.value || 0) })} placeholder="예) 12000" className="input w-full text-sm tabular-nums" /></label>
              <label className="block"><span className="block text-2xs text-ink-muted mb-0.5">급여일(매월)</span>
                <input type="number" inputMode="numeric" min="0" max="31" value={w.payday || ''} onChange={(e) => set(n, { payday: Math.min(31, +e.target.value || 0) })} placeholder="예) 10" className="input w-full text-sm tabular-nums" /></label>
            </div>
            <MinWageNote wage={w.hourlyWage} />
            <div>
              <span className="block text-2xs text-ink-muted mb-0.5">휴무 요일</span>
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
/** 가산·주휴 내역 — 금액이 있거나 확인이 필요한 사람만. 항목마다 한 덩어리(nowrap)로 그린다. */
function extrasText(r: LaborRow): string[] {
  const parts: string[] = [];
  // 계획 시작과 출근이 6h 넘게 어긋난 교대 — 기록 오류일 수 있어 금액을 믿기 전에 확인한다(critical-reviewer 반례①).
  if (r.planMismatch) parts.push(`계획과 다른 출근 ${r.planMismatch}건 확인 필요`);
  if (r.breakMin) parts.push(`휴게 −${(r.breakMin / 60).toFixed(1)}h`);
  if (r.overtime) parts.push(`연장 ${r.overtime.toLocaleString()}`);
  if (r.night) parts.push(`야간 ${r.night.toLocaleString()}`);
  if (r.holiday) parts.push(`휴일 ${r.holiday.toLocaleString()}`);
  if (r.weeklyHoliday) parts.push(`주휴 ${r.weeklyHolidayWeeks}주 ${r.weeklyHoliday.toLocaleString()}`);
  if (r.weeklyHolidayUnknown) parts.push(`주휴 확인 필요 ${r.weeklyHolidayUnknown}주`);
  return parts;
}

export function StaffSettlement({ venueId, active = true }: { venueId: string; active?: boolean }) {
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [wages, setWages] = useState<Record<string, number>>({});
  // ⚠ 시급 조회 **실패**를 '시급 0원'과 구분한다. 예전엔 catch(() => {}) 라, 조회가 죽으면
  //   wages 가 빈 채로 남아 모든 급여가 0으로 계산되고 **'총 인건비 0원'이 정상 숫자처럼** 떴다
  //   (2026-09-11 감사). 돈 화면에서 '못 불러옴'과 '정말 0원'이 같아 보이면 안 된다.
  const [wageErr, setWageErr] = useState<string | null>(null);
  // ⚠ 출근 기록·딜러 근무 조회 실패도 같은 부류다(F3·F6, 2026-09-13). 예전엔 둘 다 catch 로 삼켜
  //   shifts=[]·dealers=[] → 총 인건비 '0원' 이 정상 숫자로 떴고, '없는 달' 과 '못 불러온 달' 이 같은 문장으로 끝났다.
  const [shiftErr, setShiftErr] = useState<string | null>(null);
  const [dealerErr, setDealerErr] = useState<string | null>(null);
  const [shiftTick, setShiftTick] = useState(0);
  const [dealers, setDealers] = useState<DealerShift[]>([]);
  const pay = usePayRules(venueId);
  const [from, to] = monthRange(month);
  // 주 40h·주휴는 주 단위라 첫 주 월요일부터 읽는다(그 앞날 금액은 staffPay 가 이 달에 넣지 않는다).
  const loadFrom = weekStartOf(from);
  useEffect(() => {
    const reload = () => getStaffSchedule(venueId, loadFrom, to)
      .then((ss) => { setShifts(ss); setShiftErr(null); })
      .catch((e) => setShiftErr(msgOf(e, '출근 기록을 불러오지 못했습니다')));
    // 숨은 판(내 매장 keep-alive)은 채널을 놓는다 — 다시 보이면(active) 이 효과가 다시 돌며 조용히 한 번 읽는다(로딩 표시 없음).
    if (!active) return;
    reload();
    return subscribeStaffSchedule(venueId, reload); // 실시간: 직원 출퇴근/배정 변경 반영
  }, [venueId, loadFrom, to, shiftTick, active]);
  useEffect(() => {
    getDealerShifts(venueId, loadFrom, to)
      .then((ds) => { setDealers(ds); setDealerErr(null); })
      .catch((e) => setDealerErr(msgOf(e, '딜러 근무 기록을 불러오지 못했습니다')));
  }, [venueId, loadFrom, to, shiftTick]);
  useEffect(() => {
    setWageErr(null);
    getStaffWages(venueId)
      .then((ws) => { const m: Record<string, number> = {}; ws.forEach((w) => (m[w.name] = w.hourlyWage)); setWages(m); })
      .catch((e) => { setWages({}); setWageErr(msgOf(e, '시급을 불러오지 못했습니다')); });
  }, [venueId]);

  /** 직원·딜러 모두 staffPay.laborSummary 한 식으로 센다 — 대시보드 인건비 요약도 같은 함수다. */
  const labor = useMemo(() => laborSummary({ from, to, today: kstToday(), rules: pay.rules, staff: shifts, wages, dealers }),
    [from, to, pay.rules, shifts, wages, dealers]);
  const monthShifts = useMemo(() => shifts.filter((s) => s.date >= from), [shifts, from]);
  const avgBy = useMemo(() => {
    const m = new Map<string, StaffShift[]>();
    for (const s of monthShifts) m.set(s.name, [...(m.get(s.name) ?? []), s]);
    return m;
  }, [monthShifts]);
  const rows = labor.staff;
  const dealerRows = labor.dealers;
  /** 시급이 등록되지 않은 직원 — 급여 0원으로 조용히 빠진다. 합계를 믿기 전에 이름을 봐야 한다. */
  const noWage = rows.filter((r) => r.netMin > 0 && wages[r.name] == null).map((r) => r.name);
  const { staffPay, dealerPay, total: totalPay } = labor;
  const totalHrs = labor.netMin / 60;
  const avgIn = avgHm(monthShifts.map((s) => s.checkIn));
  const avgOut = avgHm(monthShifts.map((s) => s.checkOut));
  /** 넷 중 하나라도 못 불러왔으면 합계는 숫자가 아니다 — 먼저 난 실패 문장을 보여 준다. */
  const payErr = wageErr ?? shiftErr ?? dealerErr ?? pay.err;
  const extras = [...rows, ...dealerRows].filter((r) => extrasText(r).length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-1">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="h-9 w-9 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">‹</button>
        <span className="text-sm font-bold text-accent-300 dark:text-accent-200 tabular-nums w-[5rem] text-center">{month}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="h-9 w-9 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">›</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-card border border-accent-400/40 bg-accent-300/[0.07] p-2.5 text-center">
          <p className="text-2xs text-ink-muted">총 인건비</p>
          {payErr
            ? <p className="text-base font-extrabold text-danger-light">—</p>
            : <p data-testid="labor-total" className="text-xl font-extrabold text-accent-200 tabular-nums">{totalPay.toLocaleString()}원</p>}
          {!payErr && dealerPay > 0 && (
            <p className="text-[11px] text-ink-muted tabular-nums">직원 {staffPay.toLocaleString()} · 딜러 {dealerPay.toLocaleString()}</p>
          )}
        </div>
        <div className="rounded-card border card-aura-sub p-2.5 text-center">
          <p className="text-2xs text-ink-muted">총 근무시간</p>
          {shiftErr || dealerErr
            ? <p className="text-base font-extrabold text-danger-light">—</p>
            : <p className="text-xl font-extrabold text-ink-primary tabular-nums">{totalHrs.toFixed(1)}h</p>}
        </div>
      </div>
      {wageErr && (
        <p role="alert" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">
          {wageErr} — 급여 합계를 계산할 수 없습니다. 아래 표의 급여는 0원으로 보일 수 있습니다.
        </p>
      )}
      {!wageErr && pay.err && (
        <p role="alert" className="rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">
          {pay.err} — 급여 계산 설정을 알 수 없어 합계를 계산하지 않습니다. 아래 표는 기본 설정으로 센 값입니다.
        </p>
      )}
      {(shiftErr || dealerErr) && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">
          <span className="min-w-0 flex-1">{shiftErr ?? dealerErr} — 합계를 계산할 수 없습니다. 아래 표는 이번 달 기록의 전부가 아닐 수 있습니다.</span>
          <button type="button" onClick={() => setShiftTick((t) => t + 1)}
            className="shrink-0 rounded-badge border border-danger/40 px-2.5 py-1 text-2xs font-bold text-danger-light hover:bg-danger/15 transition-colors">다시 시도</button>
        </div>
      )}
      {!payErr && noWage.length > 0 && (
        <p className="rounded-input border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-2xs text-amber-700 dark:text-amber-300">
          시급이 없는 직원 {noWage.length}명({noWage.slice(0, 4).join(' · ')}{noWage.length > 4 ? ' 외' : ''}) — 급여가 0원으로 빠져 총 인건비가 실제보다 적습니다.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-input border border-border-subtle bg-surface-base py-2 text-center"><p className="text-[11px] text-ink-muted">평균 출근</p><p className="text-base font-bold text-ink-primary tabular-nums">{avgIn}</p></div>
        <div className="rounded-input border border-border-subtle bg-surface-base py-2 text-center"><p className="text-[11px] text-ink-muted">평균 퇴근</p><p className="text-base font-bold text-ink-primary tabular-nums">{avgOut}</p></div>
      </div>
      {shiftErr ? null : rows.length === 0 ? <p className="text-2xs text-ink-muted text-center py-3">{month} 출근 기록이 없습니다.</p> : (
        <div className="overflow-x-auto scrollbar-none">
          {/* 숫자 칼럼은 우측 정렬 + tabular-nums — 자릿수 비교가 세로로 맞아떨어지게.
              min-w 를 두지 않는다: 375px 에서 표가 340px 로 자라 **급여 칸이 잘렸는데**
              컨테이너가 scrollbar-none 이라 잘렸다는 사실조차 보이지 않았다(실측 sw340/cw314).
              가장 중요한 숫자가 조용히 사라지는 것보다 '평균 출/퇴' 가 두 줄로 접히는 게 낫다. */}
          <table className="w-full border-separate border-spacing-0">
            <thead><tr className="text-[11px] text-ink-muted"><th className="py-1 text-left pl-1 font-semibold">직원</th><th className="text-right font-semibold">출근</th><th className="text-right font-semibold">시간</th><th className="text-center font-semibold">평균 출/퇴</th><th className="text-right pr-1 font-semibold">급여</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const list = avgBy.get(r.name) ?? [];
                return (
                  <tr key={r.name} data-testid="staff-pay-row" className="text-xs">
                    <td className="py-1.5 text-left pl-1 font-bold text-ink-primary">{r.name}</td>
                    <td className="text-right text-ink-secondary tabular-nums">{r.days}일</td>
                    <td className="text-right text-ink-secondary tabular-nums">{(r.netMin / 60).toFixed(1)}h</td>
                    {/* 좁은 폭에서 줄바꿈 지점을 준다 — 18:00/02:30 은 공백이 없어 그대로면 안 접힌다 */}
                    <td className="text-center text-ink-muted tabular-nums text-[11px]">{avgHm(list.map((x) => x.checkIn))}/<wbr />{avgHm(list.map((x) => x.checkOut))}</td>
                    <td className="text-right pr-1 text-accent-300 dark:text-accent-200 tabular-nums font-bold">{r.total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dealerRows.length > 0 && (
        <div className="space-y-1 rounded-input border border-border-subtle bg-surface-low p-2">
          <p className="text-[11px] font-bold text-ink-secondary">딜러 로테이션 (시급은 시프트마다 입력)</p>
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              {dealerRows.map((r) => (
                <tr key={r.name} data-testid="dealer-pay-row" className="text-xs">
                  <td className="py-1 pl-1 text-left font-bold text-ink-primary">{r.name}</td>
                  <td className="text-right text-ink-secondary tabular-nums">{r.days}일</td>
                  <td className="text-right text-ink-secondary tabular-nums">{(r.netMin / 60).toFixed(1)}h</td>
                  <td className="pr-1 text-right font-bold text-accent-300 tabular-nums dark:text-accent-200">{r.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {extras.length > 0 && (
        <div data-testid="pay-extras" className="space-y-0.5 rounded-input border border-border-subtle bg-surface-low p-2">
          <p className="text-[11px] font-bold text-ink-secondary">계산 내역 (급여에 포함)</p>
          {extras.map((r) => (
            <p key={r.name} className="text-2xs text-ink-muted tabular-nums break-keep">
              <b className="text-ink-secondary">{r.name}</b>
              {extrasText(r).map((t) => (
                <span key={t} data-testid={t.startsWith('계획과 다른 출근') ? 'plan-mismatch' : undefined}
                  className={t.startsWith('계획과 다른 출근') ? 'whitespace-nowrap font-semibold text-amber-700 dark:text-amber-300' : 'whitespace-nowrap'}> · {t}</span>
              ))}
            </p>
          ))}
        </div>
      )}
      <p className="text-2xs text-ink-muted">
        급여 = 근무시간 × 시급(「인건비 관리」 설정). 시간은 출퇴근이 모두 기록된 날만 분 단위로 합산하고, 금액은 사람별 합계에서 한 번만 반올림합니다.
        딜러 로테이션은 시프트에 적은 시급으로 따로 계산해 <b className="text-ink-secondary">총 인건비에 함께</b> 넣습니다.
        「인건비 관리」의 급여 계산 설정에서 켠 항목만 더해 계산합니다.
      </p>
      <p data-testid="pay-disclaimer" className="text-2xs text-ink-muted">
        참고용 계산입니다. 실제 지급액과 법정 수당은 매장이 확인하세요(고용노동부 상담 1350).
      </p>
    </div>
  );
}

// ── 출근 일지 ────────────────────────────────────────────────────────────────
export function StaffWorkLog({ venueId, active = true }: { venueId: string; active?: boolean }) {
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  // F3: 조회 실패를 '기록이 없습니다' 로 그리지 않는다.
  const [shiftErr, setShiftErr] = useState<string | null>(null);
  const [shiftTick, setShiftTick] = useState(0);
  const [from, to] = monthRange(month);
  useEffect(() => {
    const reload = () => getStaffSchedule(venueId, from, to)
      .then((ss) => { setShifts(ss); setShiftErr(null); })
      .catch((e) => setShiftErr(msgOf(e, '출근 기록을 불러오지 못했습니다')));
    // 숨은 판(내 매장 keep-alive)은 채널을 놓는다 — 다시 보이면(active) 이 효과가 다시 돌며 조용히 한 번 읽는다(로딩 표시 없음).
    if (!active) return;
    reload();
    return subscribeStaffSchedule(venueId, reload); // 실시간: 직원 출퇴근/배정 변경 반영
  }, [venueId, from, to, shiftTick, active]);
  const sorted = useMemo(() => [...shifts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name))), [shifts]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-1">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="h-9 w-9 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">‹</button>
        <span className="text-sm font-bold text-accent-300 dark:text-accent-200 tabular-nums w-[5rem] text-center">{month}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="h-9 w-9 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">›</button>
      </div>
      {shiftErr ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">
          <span className="min-w-0 flex-1">{shiftErr}</span>
          <button type="button" onClick={() => setShiftTick((t) => t + 1)}
            className="shrink-0 rounded-badge border border-danger/40 px-2.5 py-1 text-2xs font-bold text-danger-light hover:bg-danger/15 transition-colors">다시 시도</button>
        </div>
      ) : sorted.length === 0 ? <p className="text-2xs text-ink-muted text-center py-3">기록이 없습니다.</p> : (
        <div className="rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle max-h-[24rem] overflow-y-auto">
          {sorted.map((s, i) => (
            <div key={`${s.date}-${s.name}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <span className="w-14 shrink-0 text-2xs text-accent-300 dark:text-accent-200 tabular-nums">{s.date.slice(5)}</span>
              <span className="flex-1 font-semibold text-ink-primary truncate">{s.name}</span>
              <span className="text-ink-secondary tabular-nums">{s.checkIn || s.startHm || '—'}~{s.checkOut || '—'}</span>
              <span className="w-12 text-right text-emerald-700 dark:text-emerald-400 tabular-nums">{(s.checkIn && s.checkOut) ? `${hours(s.checkIn, s.checkOut).toFixed(1)}h` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 직원 본인 출퇴근 입력(셀프) ───────────────────────────────────────────────
export function StaffSelfAttendance({ venueId, active = true }: { venueId: string; active?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  // F3: 조회 실패를 '배정된 출근 일정이 없습니다' 로 그리지 않는다 — 직원이 자기 이름 배정을 의심하게 만든다.
  const [shiftErr, setShiftErr] = useState<string | null>(null);
  const [shiftTick, setShiftTick] = useState(0);
  const [from, to] = monthRange(month);
  const myNames = [user?.name, user?.nickname].filter(Boolean) as string[];
  // 20260925g N5: 서버(set_my_shift_time)는 KST 오늘·어제만 받는다 — 기기 로컬 날짜가 아니라 같은 KST 기준으로 판단한다.
  const today = kstToday();
  const yesterday = kstToday(Date.now() - 86_400_000);
  const canSelfEdit = (d: string) => d === today || d === yesterday;
  const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  useEffect(() => {
    const reload = () => getStaffSchedule(venueId, from, to)
      .then((ss) => { setShifts(ss.filter((s) => myNames.includes(s.name))); setShiftErr(null); })
      .catch((e) => setShiftErr(msgOf(e, '출근 기록을 불러오지 못했습니다')));
    if (!active) return; // 숨은 판은 채널을 놓는다 — 다시 보이면 조용히 한 번 읽는다
    reload();
    return subscribeStaffSchedule(venueId, reload); // 실시간 동기화
    /* eslint-disable-next-line */
  }, [venueId, from, to, shiftTick, user, active]);
  const setT = async (s: StaffShift, field: 'checkIn' | 'checkOut', val: string) => {
    const prev = s[field] ?? null;
    setShifts((arr) => arr.map((x) => (x.date === s.date && x.name === s.name ? { ...x, [field]: val || null } : x)));
    try { await setMyShiftTime(venueId, s.date, field, val || null); }
    catch (e) {
      setShifts((arr) => arr.map((x) => (x.date === s.date && x.name === s.name ? { ...x, [field]: prev } : x)));
      toast.show(msgOf(e, '출퇴근 기록 저장 실패'), 'error');
    }
  };
  const sorted = [...shifts].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <section className="rounded-aura border card-aura p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-primary">내 출근 관리 (출퇴근 기록)</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="h-9 w-9 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">‹</button>
          <span className="text-xs font-bold text-accent-300 dark:text-accent-200 tabular-nums w-[4.5rem] text-center">{month}</span>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="h-9 w-9 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">›</button>
        </div>
      </div>
      {!user ? <p className="text-2xs text-ink-muted">로그인이 필요합니다.</p> : shiftErr ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">
          <span className="min-w-0 flex-1">{shiftErr}</span>
          <button type="button" onClick={() => setShiftTick((t) => t + 1)}
            className="shrink-0 rounded-badge border border-danger/40 px-2.5 py-1 text-2xs font-bold text-danger-light hover:bg-danger/15 transition-colors">다시 시도</button>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-2xs text-ink-muted text-center py-4">배정된 출근 일정이 없습니다 (내 이름: {myNames.join(' / ') || '-'}).<br />업주가 스케줄에 본인 이름으로 배정하면 여기서 출퇴근을 기록할 수 있습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((s) => {
            const isToday = s.date === today;
            return (
              <div key={s.date} className={['rounded-input border p-2.5', isToday ? 'border-accent-400/50 bg-accent-300/[0.06]' : 'border-border-subtle bg-surface-base'].join(' ')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink-primary">{s.date.slice(5)}{isToday ? ' (오늘)' : ''}{s.confirmed && <span className="ml-1.5 text-2xs text-emerald-700 dark:text-emerald-400">확정</span>}</span>
                  {canSelfEdit(s.date) && (
                    <div className="flex gap-1">
                      {isToday && <button type="button" onClick={() => setT(s, 'checkIn', nowHm())} className="text-2xs font-bold px-2.5 py-1.5 rounded-input bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">지금 출근</button>}
                      {/* 자정을 넘긴 야간 근무 — 어제 행에도 '지금 퇴근' 을 둔다(서버가 어제까지 받는다) */}
                      <button type="button" onClick={() => setT(s, 'checkOut', nowHm())} className="text-2xs font-bold px-2.5 py-1.5 rounded-input bg-rose-500/15 text-rose-300 border border-rose-500/40">지금 퇴근</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <label className="flex items-center gap-1 text-2xs text-ink-muted">출근<input type="time" value={s.checkIn ?? s.startHm ?? ''} disabled={!canSelfEdit(s.date)} onChange={(e) => setT(s, 'checkIn', e.target.value)} className="input text-xs py-1 w-[6rem] disabled:opacity-60" /></label>
                  <label className="flex items-center gap-1 text-2xs text-ink-muted">퇴근<input type="time" value={s.checkOut ?? ''} disabled={!canSelfEdit(s.date)} onChange={(e) => setT(s, 'checkOut', e.target.value)} className="input text-xs py-1 w-[6rem] disabled:opacity-60" /></label>
                  {s.checkIn && s.checkOut && <span className="text-2xs text-accent-300 dark:text-accent-200 tabular-nums font-bold">{hours(s.checkIn, s.checkOut).toFixed(1)}h</span>}
                  {!canSelfEdit(s.date) && <span data-testid="shift-locked-note" className="basis-full text-2xs text-ink-muted">오늘·어제 근무만 직접 기록할 수 있어요. 지난 근무는 업주에게 수정을 요청해 주세요.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
