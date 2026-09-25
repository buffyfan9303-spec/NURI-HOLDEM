// src/lib/staffPay.ts — 인건비 계산 **정본**(오너 2026-09-24 규칙 + 2026-09-26 PAYROLL-LAW 법령 정합).
//
// 급여 정산 화면(StaffSettlement)·대시보드 인건비 요약·딜러 로테이션 급여가 **모두 이 파일만** 쓴다(식 한 벌).
// 경계표: src/lib/staffPay.test.ts.
//
// ⚠ 서버 초안 20260924e 의 staff_pay_summary 는 아직 옛 식(휴게·가산·주휴 없음)이다 — payForPeriod(…, RAW_PAY_RULES)
//   와만 같다. 서버를 정본으로 올리기 전에 그 함수를 이 규칙에 맞춰야 한다(리드 조정 사항).
//
// 항상
//   근무 분 = floor((퇴근 − 인정 시작) / 1분), 음수면 0, 출·퇴근 둘 다 있을 때만. 초는 교대마다 버린다
//     (근로기준법 제43조 전액 지급 — 15·30분 단위로 깎지 않는다).
//     인정 시작 = 계획 시작이 있으면 max(출근, 계획 시작)(지휘·감독 없는 조기 출근 불인정), 없으면 출근.
//     퇴근은 계획 종료로 자르지 않는다.
//   지각 분 = floor((출근 − 계획 시작) / 1분), 음수면 0. 금액에서 따로 빼지 않는다.
//   반올림 = 한 사람·한 기간의 **최종 지급액 한 번만** 원 단위 half-up. 중간은 1/600원 정수로 정확히 더한다.
// 매장 설정(PayRules)
//   earlyCredit   조기 출근 인정 — 켜면 출근 시각부터 센다(업주가 일찍 나오라고 지시하는 매장).
//   autoBreak     (기본 끔) 제54조 — 체류 4h30 이상 30분, 9h 이상 60분 공제(공제 뒤 근로가 4h·8h 에 닿는 문턱).
//                 기록된 휴게가 있으면 그것 우선.
//   fivePlus      (기본 끔) 제56조(제11조: 상시 5인 이상만) — 연장(일 8h·주 40h 초과)·야간(22~06 겹침)·휴일(8h 이내 50%, 초과 100%) 가산.
//   weeklyHoliday (기본 끔) 제55조·시행령 제30조·제18조③ — 주 소정 15h 이상 + 개근이면 min(소정, 40h)/40 × 8h × 시급.
//                 계획 종료가 없거나 주가 안 끝났으면 **확인 필요**로 세고 지급·미지급을 정하지 않는다.
// 가산·주휴는 시급제(WageShift)에만 계산한다 — 일급·주급·월급의 통상시급 환산은 하지 않는다.

export type PayType = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface PayShift {
  workDate: string;             // YYYY-MM-DD (KST 영업일)
  startAt?: number | null;      // 계획 시작 epoch ms
  endAt?: number | null;        // 계획 종료 epoch ms
  checkInAt?: number | null;    // 실제 출근 epoch ms
  checkOutAt?: number | null;   // 실제 퇴근 epoch ms
  breakMinutes?: number | null; // 실제 기록된 휴게(분). 있으면 자동 공제보다 우선
}
export interface WageShift extends PayShift { wage: number }
export interface PayRate { payType: PayType; amount: number; effectiveFrom: string }
export interface PayContract { start?: string | null; end?: string | null }
export interface PayRules { earlyCredit: boolean; autoBreak: boolean; fivePlus: boolean; weeklyHoliday: boolean }

/** 매장 설정이 없을 때의 기본값 — **전부 끔**(오너 2026-09-26: "전부 비정규직이라 필요 없다, 필요한 경우에만 켤 수 있게").
 *  휴일 가산은 fivePlus 안에서만 계산되고, 주휴('확인 필요' 포함)는 weeklyHoliday 를 켠 매장만 센다. */
export const DEFAULT_PAY_RULES: PayRules = { earlyCredit: false, autoBreak: false, fivePlus: false, weeklyHoliday: false };
/** 휴게·가산·주휴 없이 근무 분 × 시급만 — 서버 초안 20260924e 와 같은 식. */
export const RAW_PAY_RULES: PayRules = { earlyCredit: false, autoBreak: false, fivePlus: false, weeklyHoliday: false };

const MIN = 60_000;
const DAY = 86_400_000;
const H = 3_600_000;

// ── 법정 상수 ────────────────────────────────────────────────────────────────
/** 최저임금 시간급(최저임금법 제6조). 2026 = 고용노동부 고시 제2025-47호. 매년 8월 고시 뒤 한 줄 추가한다. */
export const MIN_WAGE_BY_YEAR: Record<number, number> = { 2026: 10_320 };

/** 그날 기준 최저임금(알려진 해 가운데 그해 이하 가장 최근). 모르면 null. */
export function minWageFor(day: string): { year: number; wage: number } | null {
  const y = Number(day.slice(0, 4));
  const known = Object.keys(MIN_WAGE_BY_YEAR).map(Number).filter((k) => k <= y).sort((a, b) => b - a)[0];
  return known == null ? null : { year: known, wage: MIN_WAGE_BY_YEAR[known] };
}
/** 시급이 최저임금 미만이면 그 기준을, 아니면(0·미입력 포함) null. 저장은 막지 않는다(수습 감액 등 예외). */
export function belowMinWage(wage: number, day: string): { year: number; wage: number } | null {
  const m = minWageFor(day);
  return m && wage > 0 && wage < m.wage ? m : null;
}

/** 2026 관공서 공휴일·대체공휴일·지방선거일·근로자의 날 — 휴일 가산 판정용. 매년 확인해 추가한다.
 *  ponytail: 공휴일만 센다 — 직원별 주휴일 근무는 모른다(휴무 요일은 휴일이 아닐 수 있다). 필요하면 직원별 주휴일 칸을 둔다. */
export const KR_HOLIDAYS: ReadonlySet<string> = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-01', '2026-05-05',
  '2026-05-24', '2026-05-25', '2026-06-03', '2026-06-06', '2026-07-17', '2026-08-15', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
]);

// ── 시각 ────────────────────────────────────────────────────────────────────
/** KST 벽시계(YYYY-MM-DD, HH:mm[:ss]) → epoch ms. 서버의 `(date + time) at time zone 'Asia/Seoul'` 과 같다. */
export const kstAt = (day: string, hm: string) => Date.parse(`${day}T${hm.length === 5 ? `${hm}:00` : hm}+09:00`);
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** 그 주 월요일(주 = 월~일). */
export function weekStartOf(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0=일
  return addDays(day, -((dow + 6) % 7));
}

/** HH:mm 문자열 기록(운영 staff_schedule·dealer_shifts) → PayShift.
 *  출근은 계획 시작 기준 ±12h 안으로 맞춘다(계획 23:00·출근 00:10 → 다음 날 00:10). 계획이 없으면 그날.
 *  퇴근·계획 종료가 시작 이하이면 다음 날(자정 넘김). */
export function shiftFromHm(workDate: string, t: { startHm?: string | null; endHm?: string | null; checkIn?: string | null; checkOut?: string | null }): PayShift {
  const startAt = t.startHm ? kstAt(workDate, t.startHm) : null;
  let endAt = t.endHm ? kstAt(workDate, t.endHm) : null;
  if (endAt != null && startAt != null && endAt <= startAt) endAt += DAY;
  let checkInAt = t.checkIn ? kstAt(workDate, t.checkIn) : null;
  if (checkInAt != null && startAt != null) {
    if (startAt - checkInAt > 12 * H) checkInAt += DAY;
    else if (checkInAt - startAt > 12 * H) checkInAt -= DAY;
  }
  let checkOutAt = t.checkOut ? kstAt(workDate, t.checkOut) : null;
  if (checkOutAt != null && checkInAt != null) {
    while (checkOutAt <= checkInAt) checkOutAt += DAY;
    while (checkOutAt - checkInAt > DAY) checkOutAt -= DAY; // HH:mm 두 개로는 체류가 24h 를 넘을 수 없다(반례①)
  }
  return { workDate, startAt, endAt, checkInAt, checkOutAt };
}

// ── 한 교대 ─────────────────────────────────────────────────────────────────
function paidStartOf(s: PayShift, earlyCredit: boolean): number | null {
  if (s.checkInAt == null) return null;
  return s.startAt == null || earlyCredit ? s.checkInAt : Math.max(s.checkInAt, s.startAt);
}

/** 계획 시작과 출근이 6h 넘게 어긋났는가 — 기록 오류일 가능성이 커 금액을 믿으면 안 된다(화면에 '확인 필요'). */
export const planMismatch = (s: PayShift) => s.startAt != null && s.checkInAt != null && Math.abs(s.checkInAt - s.startAt) > 6 * H;

/** 체류 분(휴게 공제 전). */
export function workedMinutes(s: PayShift, earlyCredit = false): number {
  const start = paidStartOf(s, earlyCredit);
  if (start == null || s.checkOutAt == null) return 0;
  return Math.max(0, Math.floor((s.checkOutAt - start) / MIN));
}

/** 제54조 최소 휴게 — 공제 뒤 근로가 4h·8h 에 닿는 체류(4h30·9h)부터. 근로자에게 가장 덜 깎는 해석. */
export function autoBreakMinutes(stay: number): number {
  return stay >= 540 ? 60 : stay >= 270 ? 30 : 0;
}

/** 체류·휴게·실근로 분. */
export function netMinutes(s: PayShift, rules: PayRules): { stay: number; brk: number; net: number } {
  const stay = workedMinutes(s, rules.earlyCredit);
  const brk = s.breakMinutes != null ? Math.min(stay, Math.max(0, Math.floor(s.breakMinutes)))
    : rules.autoBreak ? autoBreakMinutes(stay) : 0;
  return { stay, brk, net: stay - brk };
}

export function plannedMinutes(s: PayShift): number | null {
  if (s.startAt == null || s.endAt == null) return null;
  return Math.floor((s.endAt - s.startAt) / MIN);
}

export function lateMinutes(checkInAt?: number | null, startAt?: number | null): number | null {
  if (checkInAt == null || startAt == null) return null;
  return Math.max(0, Math.floor((checkInAt - startAt) / MIN));
}

/** epoch 0 부터 t 까지 KST 22:00~06:00 에 든 ms(누적). 두 시각의 차가 그 구간의 야간 ms 다. */
function nightMsUntil(t: number): number {
  const u = t + 9 * H;
  const days = Math.floor(u / DAY), rem = u - days * DAY;
  return days * 8 * H + Math.min(rem, 6 * H) + Math.max(0, rem - 22 * H);
}
/** 교대가 공휴일(KST 0~24시)과 겹친 분을 공휴일 날짜별로. 야간처럼 날짜가 아니라 **시각 구간**으로 센다(반례②). */
export function holidayMinutesByDate(s: PayShift, hol: ReadonlySet<string>, earlyCredit = false): Map<string, number> {
  const out = new Map<string, number>();
  const start = paidStartOf(s, earlyCredit);
  if (start == null || s.checkOutAt == null || s.checkOutAt <= start) return out;
  const kstDay = (t: number) => new Date(t + 9 * H).toISOString().slice(0, 10);
  for (let day = kstDay(start), last = kstDay(s.checkOutAt); day <= last; day = addDays(day, 1)) {
    if (!hol.has(day)) continue;
    const a = Math.max(start, kstAt(day, '00:00')), b = Math.min(s.checkOutAt, kstAt(day, '00:00') + DAY);
    if (b > a) out.set(day, Math.floor((b - a) / MIN));
  }
  return out;
}

/** 교대의 야간(22~06, 제56조③) 분 — 인정 시작~퇴근 구간과 겹친 만큼. 자정·여러 날에 걸쳐도 맞다. */
export function nightMinutes(s: PayShift, earlyCredit = false): number {
  const start = paidStartOf(s, earlyCredit);
  if (start == null || s.checkOutAt == null || s.checkOutAt <= start) return 0;
  return Math.floor((nightMsUntil(s.checkOutAt) - nightMsUntil(start)) / MIN);
}

// ── 한 사람·한 기간 ─────────────────────────────────────────────────────────
export interface PayLines {
  stayMin: number; breakMin: number; netMin: number;
  base: number;
  overtimeMin: number; overtime: number;
  nightMin: number; night: number;
  holidayMin: number; holiday: number;
  weeklyHolidayWeeks: number; weeklyHoliday: number;
  /** 주휴 판정 불가 주 수(계획 종료 없음·주가 안 끝남). 지급·미지급을 정하지 않은 주다. */
  weeklyHolidayUnknown: number;
  /** 계획 시작과 출근이 6h 넘게 어긋난 교대 수 — 금액은 센 대로 두되 '확인 필요'로 보여 준다(반례①). */
  planMismatch: number;
  /** 최종 지급액(원) — 여기서만 반올림한다. 항목별 금액은 표시용 반올림이라 더하면 1원 다를 수 있다. */
  total: number;
  /** 반올림 전 합계(1/600원). payForPeriod 가 다른 급여 유형과 더할 때만 쓴다. */
  raw: number;
}

const round600 = (n: number) => Math.floor((n + 300) / 600);

/**
 * 시급제 인건비. shifts 는 기간 첫 주의 월요일(weekStartOf(from))부터 넘겨야 첫 주의 주 40h·주휴가 맞다.
 *   · 근무·휴게·야간·일 연장 → 그 교대/날의 workDate 가 [from, to] 안일 때
 *   · 휴일 → 겹친 공휴일 날짜가 [from, to] 안일 때(날짜별 8h 문턱)
 *   · 주 40h 연장·주휴 → 그 주의 일요일이 [from, to] 안일 때(한 주는 한 기간에만 잡힌다)
 * 단위: 1/600원 정수 — 기본 ×10, 50% 가산 ×5, 100% 가산 ×10, 주휴 min(소정,2400)×2 (= ÷5분 ×10).
 */
export function computePay(shifts: WageShift[], rules: PayRules, o: { from: string; to: string; today: string; holidays?: ReadonlySet<string> }): PayLines {
  const hol = o.holidays ?? KR_HOLIDAYS;
  const inP = (d: string) => d >= o.from && d <= o.to;
  const L: PayLines = { stayMin: 0, breakMin: 0, netMin: 0, base: 0, overtimeMin: 0, overtime: 0, nightMin: 0, night: 0,
    holidayMin: 0, holiday: 0, weeklyHolidayWeeks: 0, weeklyHoliday: 0, weeklyHolidayUnknown: 0, planMismatch: 0, total: 0, raw: 0 };
  let nBase = 0, nOt = 0, nNight = 0, nHol = 0, nWh = 0;
  // 날마다 **휴일 아닌** 실근로 합과 그날 최고 시급(딜러는 교대마다 시급이 다를 수 있다 — 가산 단가는 근로자에게 유리한 쪽).
  // 휴일 몫은 공휴일 날짜별로 따로 모은다(자정을 넘어 휴일로 들어가거나 휴일에서 나오는 교대).
  const days = new Map<string, { net: number; wage: number }>();
  const holDays = new Map<string, { min: number; wage: number }>();
  for (const s of shifts) {
    const { stay, brk, net } = netMinutes(s, rules);
    // ponytail: 휴게 위치를 모르니 휴일 분에서 빼지 않고 실근로를 넘지 않게만 자른다(야간과 같은 근로자 유리 쪽).
    let holLeft = net, holSum = 0;
    for (const [hd, m] of holidayMinutesByDate(s, hol, rules.earlyCredit)) {
      const take = Math.min(m, holLeft); holLeft -= take; holSum += take;
      const h = holDays.get(hd) ?? { min: 0, wage: 0 };
      h.min += take; h.wage = Math.max(h.wage, s.wage); holDays.set(hd, h);
    }
    const d = days.get(s.workDate) ?? { net: 0, wage: 0 };
    d.net += net - holSum; d.wage = Math.max(d.wage, s.wage); days.set(s.workDate, d);
    if (!inP(s.workDate)) continue;
    if (planMismatch(s)) L.planMismatch += 1;
    L.stayMin += stay; L.breakMin += brk; L.netMin += net;
    nBase += net * s.wage * 10;
    if (rules.fivePlus && net > 0) {
      // ponytail: 휴게가 언제였는지 모르니 야간에서 빼지 않는다(근로자 유리). 실근로 분을 넘지는 않게 자른다.
      const nm = Math.min(net, nightMinutes(s, rules.earlyCredit));
      L.nightMin += nm; nNight += nm * s.wage * 5;
    }
  }
  const weeks = new Map<string, string[]>();
  for (const day of [...days.keys()].sort()) {
    const w = weekStartOf(day);
    weeks.set(w, [...(weeks.get(w) ?? []), day]);
  }
  if (rules.fivePlus) {
    for (const [hd, h] of holDays) {
      if (!inP(hd)) continue;
      const in8 = Math.min(h.min, 480);
      L.holidayMin += h.min; nHol += in8 * h.wage * 5 + (h.min - in8) * h.wage * 10;
    }
    for (const [day, d] of days) {
      if (!inP(day)) continue;
      const ot = Math.max(0, d.net - 480);
      L.overtimeMin += ot; nOt += ot * d.wage * 5;
    }
    // 주 40h — 휴일 아닌 근로의 날마다 8h 이내 몫을 날짜 순으로 쌓아 2,400분을 넘는 몫(일 연장과 이중 계산 안 함).
    for (const [w, list] of weeks) {
      if (!inP(addDays(w, 6))) continue;
      let cum = 0;
      for (const day of list) {
        const d = days.get(day)!;
        const before = cum;
        cum += Math.min(d.net, 480);
        const ex = Math.max(0, cum - 2400) - Math.max(0, before - 2400);
        if (ex > 0) { L.overtimeMin += ex; nOt += ex * d.wage * 5; }
      }
    }
  }
  if (rules.weeklyHoliday) {
    for (const w of weeks.keys()) {
      const end = addDays(w, 6);
      if (!inP(end)) continue;
      const ws = shifts.filter((s) => s.workDate >= w && s.workDate <= end).sort((a, b) => (a.workDate < b.workDate ? -1 : 1));
      if (!ws.length) continue;
      if (end > o.today) { L.weeklyHolidayUnknown += 1; continue; } // 주가 아직 안 끝났다
      let planned: number | null = 0, wagePlanned = 0;
      for (const s of ws) {
        const p = plannedMinutes(s);
        if (p == null) { planned = null; break; }
        const pn = Math.max(0, p - (rules.autoBreak ? autoBreakMinutes(p) : 0));
        planned += pn; wagePlanned += pn * s.wage;
      }
      if (planned == null) { L.weeklyHolidayUnknown += 1; continue; } // 소정근로시간(계획 종료)을 모른다
      if (planned < 900) continue;                                   // 초단시간 — 제18조③
      if (ws.some((s) => s.checkInAt == null)) continue;             // 결근 — 개근 아님(지각·조퇴는 출근으로 본다)
      // ponytail: 초단시간은 법상 4주 평균인데 그 주 소정만 본다(리드 결정). 4주 평균이 필요하면 앞 3주를 더 읽는다.
      // 단가 = 그 주 소정근로 시간 가중 평균 시급(반례③). 주휴는 1일 소정근로시간분의 통상임금이라
      //   시급이 교대마다 다르면(딜러·주중 시급 변경) 마지막 교대 하나로 정하면 그 주의 소정근로를 대표하지 못한다.
      L.weeklyHolidayWeeks += 1;
      nWh += Math.min(planned, 2400) * 2 * wagePlanned / planned;
    }
  }
  L.base = round600(nBase); L.overtime = round600(nOt); L.night = round600(nNight);
  L.holiday = round600(nHol); L.weeklyHoliday = round600(nWh);
  L.raw = nBase + nOt + nNight + nHol + nWh;
  L.total = round600(L.raw);
  return L;
}

// ── 화면 공용: 한 달 인건비(직원 + 딜러) ─────────────────────────────────────
export interface HmStaffShift { date: string; name: string; startHm?: string | null; endHm?: string | null; checkIn?: string | null; checkOut?: string | null }
export interface HmDealerShift { dealerName: string; shiftDate: string; startTime: string | null; endTime: string | null; hourlyWage: number }
export interface LaborRow extends PayLines { name: string; days: number }

/** 딜러 시프트 → WageShift. 시프트 시각이 곧 실제 근무다(계획 없음). */
export const dealerWageShift = (d: HmDealerShift): WageShift =>
  ({ ...shiftFromHm(d.shiftDate, { checkIn: d.startTime, checkOut: d.endTime }), wage: d.hourlyWage });

// ponytail: 사람은 **이름**으로 묶는다(staff_schedule·dealer_shifts 에 사람 id 가 없다) — 동명이인은 한 사람으로 합산된다.
//   20260924e 의 user_id 가 채워지면 그것으로 묶는다(critical-reviewer 관찰 2026-09-26, 이번엔 한계만 기록).
function rowsOf<T>(items: T[], nameOf: (x: T) => string, dateOf: (x: T) => string, toShift: (x: T) => WageShift,
  rules: PayRules, o: { from: string; to: string; today: string }): LaborRow[] {
  const by = new Map<string, T[]>();
  for (const x of items) by.set(nameOf(x), [...(by.get(nameOf(x)) ?? []), x]);
  return [...by.entries()].map(([name, list]) => ({
    name, days: list.filter((x) => dateOf(x) >= o.from && dateOf(x) <= o.to).length,
    ...computePay(list.map(toShift), rules, o),
  })).filter((r) => r.days > 0 || r.total > 0).sort((a, b) => b.total - a.total);
}

/** 급여 정산 화면과 대시보드가 **같은 값**을 내도록 한 함수로 센다. 기록은 weekStartOf(from)~to 를 넘긴다. */
export function laborSummary(o: { from: string; to: string; today: string; rules: PayRules;
  staff: HmStaffShift[]; wages: Record<string, number>; dealers: HmDealerShift[] }) {
  const staff = rowsOf(o.staff, (s) => s.name, (s) => s.date,
    (s) => ({ ...shiftFromHm(s.date, s), wage: o.wages[s.name] ?? 0 }), o.rules, o);
  const dealers = rowsOf(o.dealers, (d) => d.dealerName, (d) => d.shiftDate, dealerWageShift, o.rules, o);
  const staffPay = staff.reduce((a, r) => a + r.total, 0);
  const dealerPay = dealers.reduce((a, r) => a + r.total, 0);
  const netMin = [...staff, ...dealers].reduce((a, r) => a + r.netMin, 0);
  return { staff, dealers, staffPay, dealerPay, total: staffPay + dealerPay, netMin };
}

// ── 급여 유형 4종(서버 초안 20260924e 쌍) ────────────────────────────────────
/** YYYY-MM-DD 의 그 달 일수(2월 윤년 포함). */
export function daysInMonth(day: string): number {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** from~to(포함) 날짜 목록. 문자열 날짜라 시간대와 무관하다. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end; t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function rateOn(rates: PayRate[], day: string): PayRate | null {
  let best: PayRate | null = null;
  for (const r of rates) if (r.effectiveFrom <= day && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  return best;
}

/** 한 사람의 기간 인건비(원). 시급 부분은 computePay 로 센다(식 한 벌). 기본 RAW_PAY_RULES = 서버 초안과 같은 값.
 *  ponytail: 일급·주급·월급은 float 합 — 서버는 numeric. 그 유형이 섞인 기간은 x.5 경계에서 1원 어긋날 수 있다. */
export function payForPeriod(from: string, to: string, shifts: PayShift[], rates: PayRate[], contract?: PayContract | null,
  rules: PayRules = RAW_PAY_RULES): number {
  const hourly: WageShift[] = [];
  let other = 0;
  for (const day of eachDay(from, to)) {
    const r = rateOn(rates, day);
    if (!r) continue;
    const inContract = (!contract?.start || day >= contract.start) && (!contract?.end || day <= contract.end);
    const todays = shifts.filter((s) => s.workDate === day);
    if (r.payType === 'hourly') {
      for (const s of todays) hourly.push({ ...s, wage: r.amount });
    } else if (r.payType === 'daily') {
      other += todays.reduce((a, s) => {
        const p = plannedMinutes(s), w = workedMinutes(s, rules.earlyCredit);
        return a + (p != null && p > 0 ? Math.min(1, w / p) : w > 0 ? 1 : 0);
      }, 0) * r.amount;
    } else if (r.payType === 'weekly') {
      if (inContract) other += r.amount / 7;
    } else if (inContract) {
      other += r.amount / daysInMonth(day);
    }
  }
  const hp = hourly.length ? computePay(hourly, rules, { from, to, today: to }) : null;
  if (other === 0) return hp?.total ?? 0;
  return Math.round((hp ? hp.raw / 600 : 0) + other);
}
