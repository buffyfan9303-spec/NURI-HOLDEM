// src/lib/posterPayload.ts — 포스터 폼 → 저장 페이로드(buy_in · structure · 규정/설명/사이드 이벤트)의 단일 정본.
//
// 🔴 W-02(2026-09-29 실측): 수정 저장이 `buy_in` 을 폼이 아는 여섯 칸으로 **통째로 새로 만들어** 덮었다.
//   폼에 칸이 없던 rebuy·rebuyLimit 가 아무것도 안 바꾼 저장에 사라졌고(상세 '리엔트리'가 '프리즈아웃'으로),
//   서버 트리거 prevent_self_approve_poster 는 buy_in 전체를 비교하므로 **승인된 포스터가 재심사로 내려갔다.**
// 규칙(앞으로 칸이 늘어도 같은 사고가 안 나게):
//   ① 저장본(base)을 먼저 펴고, 폼이 **소유한 키만** 덮는다 — 폼이 모르는 키는 절대 지우지 않는다.
//   ② 폼에서 **바꾸지 않은 칸은 저장본 값 그대로** 둔다(열었을 때의 폼 값 initial 과 비교).
//      그래서 아무것도 안 바꾼 저장은 buy_in·structure 를 **아예 싣지 않는다**(서버 값 불변 · 재심사 없음).
//   ③ 새 칸은 비워 두면 키를 만들지 않는다(기존 포스터·기존 동작 불변).
import type { BuyInInfo, Schedule, SideEvent } from '../api/schedules';
import { normalizeEarlyTiers, type EarlyTier, type PosterChipRules } from './chipRules';
import { posterChipRules } from './gameInherit';
import type { PosterFormData } from '../components/features/PosterFormModal';

export type PosterBuyIn = BuyInInfo & PosterChipRules;
export type PosterLevel = NonNullable<NonNullable<Schedule['structure']>['levels']>[number] & { label?: string };
export type PosterStructure = NonNullable<Schedule['structure']>;

/** 저장 페이로드를 만드는 데 필요한 폼 칸(PosterFormData 가 이 모양을 포함한다). */
export interface PosterSaveForm {
  buyIn: number;
  gameType: string;
  addonStack: number;
  addonCost: number;
  startStack: number;
  rebuyStack: number;
  /** 리엔트리 가격(원) — 참가비와 다를 때만. 0 = 미입력 */
  rebuyPrice: number;
  /** 리엔트리 최대 횟수. 0 = 미입력 */
  rebuyLimit: number;
  /** 회차별 리엔트리 스택(W-10). [] = 미입력(단일값 rebuyStack 만) */
  rebuyStacks: number[];
  /** 얼리 단계(W-04). undefined = 포스터가 얼리를 말하지 않음 · [] = 얼리 없음 */
  earlyTiers?: EarlyTier[];
  /** 애드온 1회 엔트리(W-06). 0 = 미입력 */
  addonEntry: number;
  /** 참가 1회 = 이용권 N장(W-01 폼 쪽). 0 = 미입력 */
  voucherPerEntry: number;
  blindLevels?: PosterLevel[];
  description: string;
  /** 운영 규정 — 한 줄에 하나 */
  rules: string[];
  sideEvents: SideEvent[];
}

/** 이번 저장에 실을 것. undefined = 그 칸은 **싣지 않는다**(서버 값 그대로). */
export interface PosterSaveParts {
  buyIn?: PosterBuyIn;
  structure?: PosterStructure;
  description?: string;
  rules?: string[];
  sideEvents?: SideEvent[];
}

const pos = (n: unknown): number | undefined => (Number(n) > 0 ? Number(n) : undefined);
const int = (n: unknown): number | undefined => pos(Math.floor(Number(n) || 0));

/** jsonb 와 같은 뜻의 비교 — 키 순서 무시, undefined 키 = 없는 키. */
export function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as object).sort()
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, canon((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** 폼이 **소유한** buy_in 키와 그 값. 목록에 없는 키는 폼이 모르는 키다(저장본 그대로 보존). */
export function buyInOwnedFields(f: PosterSaveForm): Record<string, unknown> {
  const stacks = (f.rebuyStacks ?? []).map((n) => Math.round(Number(n) || 0)).filter((n) => n > 0);
  return {
    amount: Number(f.buyIn) || 0,
    gameType: f.gameType?.trim() || undefined,
    addonStack: pos(f.addonStack),
    addon: pos(f.addonCost),
    startStack: pos(f.startStack),
    rebuyStack: pos(f.rebuyStack),
    rebuy: pos(f.rebuyPrice),
    rebuyLimit: int(f.rebuyLimit),
    rebuyStacks: stacks.length ? stacks : undefined,
    earlyTiers: f.earlyTiers === undefined ? undefined : normalizeEarlyTiers(f.earlyTiers),
    addonEntry: pos(f.addonEntry),
    voucherPerEntry: int(f.voucherPerEntry),
  };
}

/** 브레이크 원문(label)은 브레이크 행에만, 빈 값이면 키를 만들지 않는다. 행의 다른 키는 보존. */
function cleanLevels(levels: readonly PosterLevel[]): PosterLevel[] {
  return levels.map((l) => {
    const { label, ...rest } = l;
    const t = l.isBreak ? label?.trim() : '';
    return t ? { ...rest, label: t } : rest;
  });
}

const cleanRules = (rules: readonly string[]) => rules.map((r) => r.trim()).filter(Boolean);
const cleanSide = (list: readonly SideEvent[]): SideEvent[] => list
  .map((e) => ({
    name: e.name.trim(), startBefore: e.startBefore.trim(),
    ...(e.buyIn ? { buyIn: e.buyIn } : {}), ...(e.note?.trim() ? { note: e.note.trim() } : {}),
  }))
  .filter((e) => e.name);

/**
 * 폼 → 저장 부분. `base` = 수정 대상 저장본(신규면 null), `initial` = 폼을 열었을 때의 값(신규면 null).
 * 수정: 바뀐 칸만 싣는다. 신규: 값이 있는 칸만 싣는다(buy_in 은 참가비가 있어 늘 실린다).
 */
export function posterSaveParts(base: Pick<Schedule, 'buyIn' | 'structure'> | null, initial: PosterSaveForm | null, cur: PosterSaveForm): PosterSaveParts {
  const parts: PosterSaveParts = {};

  // buy_in — 저장본을 펴고 소유 키만 덮는다.
  const now = buyInOwnedFields(cur);
  const was = initial ? buyInOwnedFields(initial) : null;
  const buyIn: Record<string, unknown> = { ...(base?.buyIn ?? {}) };
  let buyInChanged = false;
  for (const k of Object.keys(now)) {
    if (was && sameJson(was[k], now[k])) continue;
    buyInChanged = true;
    if (now[k] === undefined) delete buyIn[k]; else buyIn[k] = now[k];
  }
  if (buyInChanged) parts.buyIn = buyIn as unknown as PosterBuyIn;

  // structure — 폼은 levels 만 소유한다(startingChips 등 저장본 키 보존).
  const lv = cleanLevels(cur.blindLevels ?? []);
  const lvWas = initial ? cleanLevels(initial.blindLevels ?? []) : null;
  if (lvWas ? !sameJson(lvWas, lv) : lv.length > 0) {
    const st: PosterStructure = { ...(base?.structure ?? {}) };
    if (lv.length) st.levels = lv; else delete st.levels;
    parts.structure = st;
  }

  // 규정·설명·사이드 이벤트 — 통째로 소유한다(배열/문자열 한 칸).
  const desc = cur.description.trim();
  const rules = cleanRules(cur.rules);
  const side = cleanSide(cur.sideEvents);
  if (initial) {
    if (desc !== initial.description.trim()) parts.description = desc;
    if (!sameJson(rules, cleanRules(initial.rules))) parts.rules = rules;
    if (!sameJson(side, cleanSide(initial.sideEvents))) parts.sideEvents = side;
  } else {
    if (desc) parts.description = desc;
    if (rules.length) parts.rules = rules;
    if (side.length) parts.sideEvents = side;
  }
  return parts;
}

/** 저장본 → 폼 값(수정 열기 · 지난 포스터 불러오기 공용). 폼에 칸이 있는 키는 **전부** 여기서 읽는다 —
 *  읽지 않은 칸은 저장 때 '비웠다'로 보이기 때문이다(W-02). */
export function posterFormFromSchedule(s: Schedule, date: string): PosterFormData {
  const b = s.buyIn ?? { amount: 0 };
  const rules = posterChipRules(s);
  return {
    title: s.title, date,
    startTime: s.startTime,
    regCloseTime: s.regCloseTime ?? '',
    duration: s.duration ?? '',
    blinds: s.blinds ?? '',
    prizeType: s.guaranteed ? 'GTD' : 'ENTRY',
    prizeAmount: s.prizePool ? Math.round(s.prizePool / 10000) : 0,
    prizePercent: s.prizePercent ?? 0,
    buyIn: b.amount, gameType: b.gameType ?? '', addonStack: b.addonStack ?? 0, addonCost: b.addon ?? 0,
    startStack: b.startStack ?? 0, rebuyStack: b.rebuyStack ?? 0,
    rebuyPrice: b.rebuy ?? 0, rebuyLimit: b.rebuyLimit ?? 0,
    rebuyStacks: rules.rebuyStacks ?? [], earlyTiers: rules.earlyTiers,
    addonEntry: rules.addonEntry ?? 0, voucherPerEntry: rules.voucherPerEntry ?? 0,
    region: s.region,
    isCompetition: s.isCompetition ?? false,
    grade: s.grade ?? null,
    paymentMethods: s.paymentMethods ?? ['현금'],
    partners: s.partners ?? [],
    prizes: s.seats?.map((x) => `${x.label} ${x.count}석`) ?? [],
    rankingPrizes: s.rankingPrizes?.map((r) => ({ rank: r.rank, amount: r.amount, unit: r.unit ?? '' })) ?? [],
    events: s.promotions ?? [], // 전 필드 왕복(detail·할인액·LV 포함) — 좁혀 담으면 수정 때마다 사라진다
    repeatWeeks: 1,
    blindLevels: (s.structure?.levels ?? []) as PosterLevel[],
    description: s.description ?? '',
    rules: s.rules ?? [],
    sideEvents: s.sideEvents ?? [],
    posterUrl: s.posterUrl,
    venueId: s.venueId, pubName: s.pubName,
  };
}
