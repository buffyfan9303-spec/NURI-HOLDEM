// src/lib/chipRules.ts — 포스터가 정하는 칩·엔트리 규칙(얼리 단계 · 리엔트리 계단 스택 · 애드온 엔트리)의 단일 정본.
//
// 요구: W단계 1차 결함표 W-03·W-04·W-05·W-27·W-06·W-10(2026-09-30 오너·리드 결정).
//   · 얼리칩은 포스터에 단계별로 입력한다(최대 4단, 없으면 0). "N레벨 시작 전(=N-1레벨까지)" 은 **앞 브레이크 포함**.
//   · 경계는 반열림 한 규칙: 정확히 창 끝 분에 온 손님은 그 단계가 **아니다**(levelNoAtMinutes 와 같은 규칙).
//   · 레지 마감 "N LV" = N레벨이 끝나고 **뒤 브레이크까지** 등록 가능 = N+1레벨이 시작하는 순간 마감.
//   · 리엔트리 스택은 회차별 배열(없으면 기존 단일값), 애드온 엔트리 값은 게임별(기본 0).
//
// 서버 `_clock_ledger_part`(supabase/migrations/20260930e_*.sql)가 같은 식을 SQL 로 쓴다 —
// 두 쪽은 공용 픽스처 src/api/clockLedgerPart.fixtures.json 으로 묶여 있다(clockLedgerPart.contract.test.ts).
// ⚠ 이 파일은 api/ 를 import 하지 않는다(업주 장부 청크를 첫 화면으로 끌고 오지 않게 — regStatus 머리말과 같은 이유).

/** 얼리 한 단계 — `level` 레벨까지(뒤 브레이크 포함) 첫 바인한 손님에게 `chips` 를 더 준다. */
export interface EarlyTier { level: number; chips: number }
/** 장부 세션에 **시작 시점 값으로 굳혀** 저장하는 얼리 창(오너 결정 #1 — 진행 중 구조 편집이 바꾸지 않는다). */
export interface EarlyTierWindow { min: number; chips: number }

export const MAX_EARLY_TIERS = 4;

/** KW-1b — 참가 1회 이용권 상한. 서버 approve_buyin_request(20260930g)도 같은 값으로 자른다. */
export const MAX_VOUCHER_PER_ENTRY = 100;
/** 참가 1회 이용권 N장 × 1장 값(wonPerVoucher = units TICKET_WON, 1만원 — 오너 결정 W-01)이 참가비와 다른가. 폼은 경고만 한다(저장은 허용). */
export function voucherPerEntryMismatch(perEntry: number, buyInWon: number, wonPerVoucher: number): boolean {
  return perEntry > 0 && buyInWon > 0 && perEntry * wonPerVoucher !== buyInWon;
}

/** 포스터 buy_in(jsonb) 에 새로 얹는 칸 — 없으면 기존 동작이다(api/schedules BuyInInfo 를 넓히지 않고 여기서 읽는다). */
export interface PosterChipRules {
  /** 얼리 단계. undefined = 포스터가 얼리를 말하지 않음(기존 동작: 클락 설정 그대로) · [] = 얼리 없음. */
  earlyTiers?: EarlyTier[];
  /** 회차별 리엔트리 스택(0번 = 첫 리엔트리). 비어 있지 않으면 단일값 rebuyStack 보다 우선, 마지막 값이 이후 회차에 반복된다. */
  rebuyStacks?: number[];
  /** 애드온(부스터) 1회가 정산 엔트리에 더하는 값(예: 0.5). 기본 0. */
  addonEntry?: number;
  /** 이 게임 참가 1회에 쓰는 매장 이용권 장수(예: 키키 10장). 없으면 기존 동작(1장 = 1회) — 서버·장부 소비는 KW-1b(W-01). */
  voucherPerEntry?: number;
}

interface LevelLike { kind?: 'level' | 'break'; minutes?: number }

/** `levelNo`(1-based) 레벨이 시작하는 분(앞의 모든 레벨·브레이크 합). 그 레벨이 없으면 구조 전체 길이. */
export function levelStartMinute(levels: readonly LevelLike[], levelNo: number): number {
  let acc = 0, n = 0;
  for (const l of levels) {
    if (l.kind !== 'break') { n++; if (n >= levelNo) return acc; }
    acc += l.minutes || 0;
  }
  return acc;
}

/** "`level` 레벨까지(뒤 브레이크 포함)" 창의 끝 분 = level+1 레벨 시작 분. 0 이하 레벨 = 창 없음(0). */
export function windowEndMinute(levels: readonly LevelLike[], level: number): number {
  return level > 0 ? levelStartMinute(levels, level + 1) : 0;
}

/** 입력 정리 — 레벨·칩이 양수인 단계만, 레벨 오름차순, 최대 4단. 같은 레벨이 겹치면 먼저 온 것. */
export function normalizeEarlyTiers(tiers: readonly EarlyTier[] | null | undefined): EarlyTier[] {
  const out: EarlyTier[] = [];
  for (const t of [...(tiers ?? [])].sort((a, b) => (a?.level ?? 0) - (b?.level ?? 0))) {
    const level = Math.floor(Number(t?.level) || 0), chips = Math.round(Number(t?.chips) || 0);
    if (level <= 0 || chips <= 0 || out.some((x) => x.level === level)) continue;
    out.push({ level, chips });
    if (out.length >= MAX_EARLY_TIERS) break;
  }
  return out;
}

/** 단계 → 세션에 굳힐 분 창. */
export function earlyTierWindows(tiers: readonly EarlyTier[] | null | undefined, levels: readonly LevelLike[]): EarlyTierWindow[] {
  return normalizeEarlyTiers(tiers).map((t) => ({ min: windowEndMinute(levels, t.level), chips: t.chips }));
}

/** 경과 분 → 얼리 단계 번호(0 = 가장 이른 단계) · -1 = 얼리 아님. 반열림 `0 ≤ m < min`. */
export function earlyTierIndexAt(mins: number, windows: readonly EarlyTierWindow[]): number {
  if (!(mins >= 0)) return -1;
  for (let i = 0; i < windows.length; i++) if (windows[i].min > 0 && mins < windows[i].min) return i;
  return -1;
}

/** 얼리 카운트 1단위(칩) = 단계 칩 중 가장 작은 양수. 없으면 0(= 1건 1단위). */
export function tierUnitChips(windows: readonly { chips: number }[]): number {
  const pos = windows.map((w) => w.chips).filter((c) => c > 0);
  return pos.length ? Math.min(...pos) : 0;
}

/** 단계 하나의 얼리 단위 수 — 서버 `floor(chips / unit + 0.5)` 와 같은 반올림. */
export function tierUnits(chips: number, unit: number): number {
  return unit > 0 ? Math.floor(chips / unit + 0.5) : 1;
}

/** `ord`번째 리엔트리(1-based)의 스택 — 배열이 있으면 배열(넘치면 마지막 값), 없으면 단일값. */
export function rebuyStackAt(ord: number, stacks: readonly number[] | null | undefined, single: number): number {
  const s = (stacks ?? []).filter((n) => n > 0);
  if (!s.length) return single;
  return s[Math.min(Math.max(1, ord), s.length) - 1];
}

/** 회차별 리엔트리 수(rebuyOrd[j] = j+1 번째 리엔트리를 한 사람 수) → 리엔트리 칩 합. */
export function rebuyChipsOf(rebuyOrd: readonly number[], stacks: readonly number[] | null | undefined, single: number): number {
  let sum = 0;
  rebuyOrd.forEach((n, j) => { sum += (n || 0) * rebuyStackAt(j + 1, stacks, single); });
  return sum;
}

/** 등록 마감까지 남은 ms — "N LV" = N레벨 끝 + 뒤 브레이크까지. 곧 N+1레벨 시작 순간 마감.
 *  N 이 마지막 레벨이면 구조가 끝나는 순간(= 그때까지 남은 전체 시간).
 *  null = 판정 불가(미설정 · 구조에 N레벨이 없다) · 0 = 이미 마감 · 양수 = 남은 ms.
 *  index/remaining 은 실효 값(effectiveLevel)이어야 한다. */
export function msToRegCloseAt(levels: readonly LevelLike[], target: number, index: number, remaining: number): number | null {
  if (!(target > 0)) return null;
  let num = 0;
  for (let i = 0; i <= index && i < levels.length; i++) if (levels[i]?.kind === 'level') num++;
  if (num > target) return 0;
  let acc = remaining;
  for (let i = index + 1; i < levels.length; i++) {
    if (levels[i].kind === 'level') { num++; if (num > target) return acc; }
    acc += (levels[i].minutes || 0) * 60_000;
  }
  return num >= target ? acc : null;
}

/** 포스터의 순위 표기 한 칸이 몇 자리인가 — '11-15th' · '11~16th' · '12~13위' → 5 · 6 · 2. 범위가 아니면 1. */
export function prizePlaceCount(rank: string | null | undefined): number {
  const m = /(\d+)\s*(?:st|nd|rd|th|위|등)?\s*[-~–]\s*(\d+)/i.exec(rank ?? '');
  if (!m) return 1;
  const a = Number(m[1]), b = Number(m[2]);
  return b >= a ? b - a + 1 : 1;
}

/** GTD ÷ 참가비 = 기준 엔트리(W-19). 둘 중 하나라도 없으면 0(= 미설정). */
export function targetEntriesOf(guaranteed: boolean | undefined, prizePool: number | null | undefined, buyIn: number | null | undefined): number {
  if (!guaranteed || !(prizePool && prizePool > 0) || !(buyIn && buyIn > 0)) return 0;
  return Math.round(prizePool / buyIn);
}

/** 두 칸(더블·1얼리)의 값을 1·2단에 덮어쓴다 — 3·4단은 그대로. 0 인 칸은 그 단을 비운다(normalize 가 걸러 낸다). */
export function mergeLegacyEarly(
  tiers: readonly EarlyTier[],
  l: { doubleLevel: number; doubleChips: number; singleLevel: number; singleChips: number },
): EarlyTier[] {
  const sorted = normalizeEarlyTiers(tiers);
  return [
    { level: l.doubleLevel, chips: l.doubleChips },
    { level: l.singleLevel, chips: l.singleChips },
    ...sorted.slice(2),
  ];
}
