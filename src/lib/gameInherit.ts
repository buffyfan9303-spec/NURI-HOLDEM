// W4 PL1 — 포스터(Schedule) → 장부/클락 자동 상속 어댑터(순수 함수).
// §13-B: 상속 배관은 이미 절반 깔려 있었지만 폭이 3필드(title·buyIn·guaranteed)뿐이라
// 블라인드·스택·레지레벨·상금이 포스터에 있는데도 무시됐다. 이 모듈이 상속의 단일 소스.
// ⚠ 금액(원·PL1b)은 lib/units 정규형 경유 — 만원/원 혼동 오기록('1만 배' 사고)의 재발 차단.
import type { Schedule } from '../api/schedules';
import type { ClockConfig, ClockLevel, ClockPrizeRow } from '../api/clock';
import type { GamePresetData, PresetClockData } from '../api/presets';
import { presetBuyInWon } from '../api/presets';
import type { LedgerSession } from '../api/ledger';
import type { PosterFormData } from '../components/features/PosterFormModal';
import { manToWon, presetPrizeWon, rankingPrizeWon } from './units';
import { regCloseLevelOf } from './regClose';
import { normalizeEarlyTiers, prizePlaceCount, targetEntriesOf, type PosterChipRules } from './chipRules';

/** 포스터 buy_in 의 새 칸(얼리 단계·계단 스택·애드온 엔트리)을 읽는다 — 없으면 undefined(= 기존 동작). */
export function posterChipRules(sc: Pick<Schedule, 'buyIn'>): PosterChipRules {
  const b = (sc.buyIn ?? {}) as PosterChipRules;
  return {
    earlyTiers: Array.isArray(b.earlyTiers) ? normalizeEarlyTiers(b.earlyTiers) : undefined,
    rebuyStacks: Array.isArray(b.rebuyStacks) ? b.rebuyStacks.map((n) => Math.round(Number(n) || 0)).filter((n) => n > 0) : undefined,
    addonEntry: b.addonEntry != null && Number(b.addonEntry) >= 0 ? Number(b.addonEntry) : undefined,
    voucherPerEntry: Number.isInteger(Number(b.voucherPerEntry)) && Number(b.voucherPerEntry) >= 1 ? Number(b.voucherPerEntry) : undefined,
  };
}

/** 포스터가 말하는 애드온 — 장부 폼(isAddon·스택·가격)과 클락 패치(isAddon·스택)가 이 한 판정을 쓴다.
 *  🔴 roti-1009(오너 '부스터데이는 애드온') — 예전엔 두 곳 다 애드온을 **켜기만** 했다. 부스터데이 클락이 남은 채
 *    다음 날 애드온 없는 깐부전 장부를 시작하면 isAddon·스택 50,000 이 그대로 넘어가 TV 에 ADD-ON 이 떴다
 *    (ClockStage 는 스택 > 0 만으로도 띄운다). 리엔트리 계단·얼리 단계처럼 '포스터에 없으면 끈다'로 맞췄다.
 *  · 가격만 있고 스택이 없으면 애드온은 켜고 스택은 0 — 지난 게임의 스택을 이 게임 것으로 추측하지 않는다. */
export function posterAddonOf(sc: Pick<Schedule, 'buyIn'>): { isAddon: boolean; addonStack: number; addonAmount: number } {
  const stack = Math.round(Number(sc.buyIn?.addonStack) || 0);
  const amount = Math.round(Number(sc.buyIn?.addon) || 0);
  const addonStack = stack > 0 ? stack : 0, addonAmount = amount > 0 ? amount : 0;
  return { isAddon: addonStack > 0 || addonAmount > 0, addonStack, addonAmount };
}

/** 연동 장부 세션 → 클락 애드온 두 칸(클락 설정 화면의 시드). 세션 = 클락 — 세션이 애드온 없음이면 **둘 다** 끈다
 *  (isAddon 만 끄고 스택을 남기면 체크박스는 꺼졌는데 TV 는 ADD-ON 을 띄운다, roti-1009 P3).
 *  세션 스택이 0 이면 0 — 클락에 남은 스택(지난 게임일 수 있다)으로 되돌리지 않는다(posterAddonOf 와 같은 원칙, review-256 P3-2). */
export function clockAddonFromSession(
  sess: Pick<LedgerSession, 'isAddon' | 'addonStack'>, base: Pick<ClockConfig, 'isAddon' | 'addonStack'>,
): Pick<ClockConfig, 'isAddon' | 'addonStack'> {
  if (sess.isAddon == null) return { isAddon: base.isAddon, addonStack: base.addonStack };
  if (!sess.isAddon) return { isAddon: false, addonStack: 0 };
  return { isAddon: true, addonStack: sess.addonStack > 0 ? sess.addonStack : 0 };
}

/** 포스터 → 장부 세션 칸(W-06 애드온 엔트리 · W-19 기준 엔트리 = GTD ÷ 참가비). '있는 것만' 키를 만든다. */
export function ledgerPatchFromSchedule(sc: Schedule): Pick<Partial<LedgerSession>, 'targetEntries' | 'addonEntry'> {
  const p: Pick<Partial<LedgerSession>, 'targetEntries' | 'addonEntry'> = {};
  const target = targetEntriesOf(sc.guaranteed, sc.prizePool, sc.buyIn?.amount);
  if (target > 0) p.targetEntries = target;
  const ae = posterChipRules(sc).addonEntry;
  if (ae !== undefined) p.addonEntry = ae;
  return p;
}

/** 포스터 structure.levels → 클락 levels (isBreak 플래그 → kind 판별).
 *  브레이크 원문 label 도 넘긴다(2026-10-09 — 버려져서 장부(포스터 연결)로 시작한 클락 TV 에 'BREAK' 만 보였다).
 *  저장 규칙(posterPayload.cleanLevels)과 같이 브레이크 행에만, 빈 값이면 키를 만들지 않는다. */
export function posterLevelsToClock(
  levels: NonNullable<NonNullable<Schedule['structure']>['levels']>,
): ClockLevel[] {
  return levels.map((l) => {
    const label = l.isBreak ? l.label?.trim() : '';
    return {
      kind: l.isBreak ? 'break' as const : 'level' as const,
      minutes: l.minutes, sb: l.sb, bb: l.bb, ante: l.ante ?? 0,
      ...(label ? { label } : {}),
    };
  });
}

/** PL1a 무금액 상속 — 클락 cfg 병합 패치. 소비처는 반드시 '진행 중 아님'을 확인할 것(비파괴 병합 가드). */
export function clockPatchFromSchedule(sc: Schedule): Partial<ClockConfig> {
  const p: Partial<ClockConfig> = {};
  if (sc.title) p.title = sc.title;
  const lv = sc.structure?.levels;
  if (lv && lv.length > 0) p.levels = posterLevelsToClock(lv);
  // ⚠ 2026-09-13: 이 줄은 **한 번도 터지지 않았다.** `structure.lateRegLevels` 를 쓰는 코드가 앱에 없다
  //   (PosterFormModal 은 레벨+시각을 합쳐 `regCloseTime='16LV 00:12'` 로만 저장하고,
  //    App.handleSubmitPoster 의 structure 는 `{ levels }` 뿐이다 — 쓰기는 mock/data.ts 에만 있다).
  //   그래서 포스터가 '16레벨'이라고 광고하는 동안 클락은 defaultClockConfig 의 12 로 돌았고,
  //   ScheduleDetailModal 한 화면에 '레지 마감 · LV12'(라이브)와 '16LV 00:12'(포스터)가 같이 떴다.
  //   정본은 **업주가 유저에게 광고한 포스터 값**이다(12 는 아무도 입력한 적 없는 기본값).
  //   판정은 regClose.regCloseLevelOf 한 곳뿐이다 — 여기서 우선순위를 다시 쓰면 또 갈린다.
  //   ⚠ 2026-09-13(2차): 이 줄만 `lateRegLevels` 를 먼저 봐서 **소비처 넷 중 혼자 답이 달랐다**
  //     (포스터 `{ regCloseTime:'16LV 00:12', structure:{ lateRegLevels:20 } }` → 카드 16 · 블라인드 표 16 ·
  //      상속 20). 정본은 유저가 보는 `regCloseTime` 이라 그쪽으로 통일했다 — regCloseLevelOf 주석 참조.
  //   ⚠ 폴백이 없으면 **키 자체를 만들지 않는다**. 소비처가 `{ ...baseCfg, ...schedPatch }` 로 펴기 때문에
  //     `regCloseLevel: undefined` 를 넣으면 업주가 직접 친 값을 undefined 로 덮어 버린다.
  const lateReg = regCloseLevelOf(sc);
  if (lateReg) p.regCloseLevel = lateReg;
  const start = sc.buyIn?.startStack ?? sc.structure?.startingChips;
  if (start) p.startStack = start;
  const rebuy = sc.buyIn?.rebuyStack ?? sc.structure?.rebuyStack;
  if (rebuy) p.rebuyStack = rebuy;
  // 애드온 — 포스터에 없으면 **끈다**(posterAddonOf 주석). 키를 늘 만든다: 소비처가 `{ ...baseCfg, ...schedPatch }` 로 펴서 지난 클락 값을 덮어야 한다.
  const addon = posterAddonOf(sc);
  p.isAddon = addon.isAddon; p.addonStack = addon.addonStack;
  // W-10 — 회차별 리엔트리 스택. 포스터에 없으면 **빈 배열로 지운다** — 지난 포스터의 계단이 이 게임으로 새지 않게(단일값 = 기존 동작).
  const rules = posterChipRules(sc);
  p.rebuyStacks = rules.rebuyStacks ?? [];
  if (rules.rebuyStacks?.length) p.rebuyStack = rules.rebuyStacks[0];
  // W-04 — 얼리 단계. 포스터가 말하면(빈 배열 = 얼리 없음) 그것이 정본이고 두 칸(더블·1얼리)은 1·2단 거울값이다.
  //   포스터가 말하지 않으면 키를 undefined 로 **명시해** 지난 포스터의 단계를 지운다(두 칸 = 기존 동작).
  if (rules.earlyTiers) {
    const t = rules.earlyTiers;
    p.earlyTiers = t;
    p.earlyDoubleLevel = t[0]?.level ?? 0; p.doubleEarlyBonus = t[0]?.chips ?? 0;
    p.earlySingleLevel = t[1]?.level ?? 0; p.earlyBonus = t[1]?.chips ?? 0;
  } else {
    p.earlyTiers = undefined;
  }
  return p;
}

/** 순위 상금 행 → 클락 상금 행 — 포스터·프리셋이 같은 규칙을 쓴다.
 *  · 만원·원(또는 단위 없음)은 원으로 정규화한다(기존 동작 — 1만 배 오기록 차단).
 *  · 그 밖의 단위(T·GP·포인트·초대권…)는 **입력한 단위 그대로**(W-25, 원 환산 병기 안 함 — §28).
 *  · 빈 문자열 단위('')는 돈으로도 단위로도 추측하지 않고 뺀다(PL1b).
 *  · '11-15th' 같은 범위 순위는 자리 수를 count 로 싣는다 — 총액 = Σ amount × count(W-12). */
/** 순위 상금 행의 단위가 돈(원 환산 대상)인가 — 단위 없음(구형)·만원·원. T·GP·포인트 등은 아니다(W-25). */
export const isMoneyUnit = (unit: string | null | undefined): boolean => unit == null || unit === '만원' || unit === '원';

export function clockPrizeRowsOf(rows: readonly { rank: string; amount?: number; unit?: string; amountWon?: number }[] | null | undefined): ClockPrizeRow[] {
  const out: ClockPrizeRow[] = [];
  for (const r of rows ?? []) {
    const unit = (r.unit ?? '').trim();
    // T 행은 프리셋에서 amountWon(원 환산)을 함께 달고 온다 — 단위가 돈이 아니면 amountWon 이 있어도 단위를 따른다.
    const money = r.unit == null || unit === '만원' || unit === '원' || (!unit && r.amountWon != null);
    if (!money && !unit) continue;
    const amount = money ? rankingPrizeWon(r) : Math.round(Number(r.amount) || 0);
    if (!(amount > 0)) continue;
    const count = prizePlaceCount(r.rank);
    out.push({ place: r.rank, amount, ...(money ? {} : { unit }), ...(count > 1 ? { count } : {}) });
  }
  return out;
}

/** PL1b 금액 상속 — 포스터 순위별 상금 → 클락 prizes.
 *  🔴 W-13(2026-09-30 리드): 시상이 없거나 전부 뺄 단위면 **빈 배열**을 돌려준다(예전엔 null → 지난 클락·기본값 상금표가 TV 에 남았다).
 *  소비처는 포스터가 연결됐을 때만 이 값을 쓴다 — 포스터 없는 장부는 부르지 않는다. */
export function clockPrizesFromSchedule(sc: Schedule): ClockPrizeRow[] {
  return clockPrizeRowsOf(sc.rankingPrizes);
}

/** PL3 생성 경로 역전 — '지난 게임(포스터)에서 프리셋 만들기'.
 *  이미 20번 연 게임을 빈 폼에 다시 치는 구조가 프리셋 탭 방치의 원인이었다(§13-B).
 *  금액은 전부 원 정규형(*Won)으로 적고, 구형 필드는 표시 호환용으로만 함께 채운다. */
export function presetFromSchedule(sc: Schedule): GamePresetData {
  const prizes = (sc.rankingPrizes ?? [])
    .filter((r) => (r.amount ?? 0) > 0 && (isMoneyUnit(r.unit) || !!r.unit?.trim()))
    // LC-F1(2026-10-09) — 돈이 아닌 단위(T·GP·포인트…)는 장수·단위 그대로, 원 환산(amountWon)을 붙이지 않는다(W-25·§28).
    //   예전엔 T 에 amountWon 을 붙여 applyToPoster 가 400T 를 400만원으로 바꿨고, GP 등은 아예 빠졌다.
    .map((r) => !isMoneyUnit(r.unit)
      ? ({ rank: r.rank, amount: r.amount, unit: r.unit!.trim() })
      : ({ rank: r.rank, amount: r.unit === '원' ? Math.round(r.amount / 10_000) : r.amount, unit: '만원', amountWon: rankingPrizeWon(r) }));
  return {
    title: sc.title,
    gameType: sc.buyIn?.gameType ?? '',
    buyIn: sc.buyIn?.amount ?? 0,
    startStack: sc.buyIn?.startStack ?? sc.structure?.startingChips ?? 0,
    rebuyStack: sc.buyIn?.rebuyStack ?? sc.structure?.rebuyStack ?? 0,
    addonStack: sc.buyIn?.addonStack ?? 0,
    addonCost: sc.buyIn?.addon ?? 0,
    prizeType: sc.guaranteed ? 'GTD' : 'ENTRY',
    prizeAmountWon: sc.guaranteed ? (sc.prizePool ?? 0) : 0,
    prizeAmount: sc.guaranteed ? Math.round((sc.prizePool ?? 0) / 10_000) : 0, // 구형 표시 호환
    prizePercent: !sc.guaranteed ? (sc.prizePercent ?? 0) : 0,
    duration: sc.duration ?? '',
    blindLevels: sc.structure?.levels?.length ? posterLevelsToClock(sc.structure.levels) : undefined,
    isCompetition: !!sc.isCompetition,
    rankingPrizes: prizes.length ? prizes : undefined,
    // PL2a: 정규형 병기 + 네임스페이스 — 포스터에서 온 프리셋은 포스터 전용 항목까지 담는다.
    buyInWon: sc.buyIn?.amount ?? 0,
    poster: dropEmpty({
      startTime: sc.startTime || undefined,
      regCloseTime: sc.regCloseTime || undefined,
      region: sc.region || undefined,
      grade: sc.grade ?? undefined,
      paymentMethods: sc.paymentMethods?.length ? sc.paymentMethods : undefined,
      partners: sc.partners?.length ? sc.partners : undefined,
      prizes: sc.seats?.length ? sc.seats.map((x) => `${x.label} ${x.count}석`) : undefined,
      // 할인액·자동 레벨까지 통째로 — 예전에 {badge,title} 로 좁혀 프리셋을 거치면 할인이 사라졌다.
      events: sc.promotions?.length ? sc.promotions.map((p) => ({ ...p })) : undefined,
      posterUrl: sc.posterUrl || undefined,
    }),
    // 같은 다리(위 clockPatchFromSchedule 주석 참조) — 프리셋 경유도 포스터의 'NNLv' 를 잇는다.
    clock: dropEmpty({ regCloseLevel: regCloseLevelOf(sc) || undefined }),
  };
}

// ── PL2a 어댑터 3개 — 프리셋 1개 → 포스터/장부/클락 3폼 프리필. 단위 환산은 여기서만. ──
// 규칙: '있는 것만' 키를 만든다 — 빈 네임스페이스·빈 값은 패치에 등장하지 않아
// 부분 프리셋(clock 만 있는 프리셋)이 다른 폼을 건드리지 않는다(§13-B·DoD).

/** 빈 오브젝트면 undefined — 네임스페이스에 빈 껍데기를 남기지 않는다 */
function dropEmpty<T extends object>(o: T): T | undefined {
  const e = Object.entries(o).filter(([, v]) => v !== undefined);
  return e.length ? (Object.fromEntries(e) as T) : undefined;
}

/** 돈 단위 순위상금만(%·pts 등 제외) — 클락 prizes(원) 행으로.
 *  ⚠ 빈 단위('')는 돈으로 추측하지 않는다(PL1b와 동일 규칙) — 자유입력 단위의 만원 오추정이 곧 1만 배 사고다. */
function moneyPrizeRows(d: GamePresetData): ClockPrizeRow[] {
  return clockPrizeRowsOf(d.rankingPrizes);
}

/** 프리셋 → 클락 설정 패치. TournamentClock.applyGamePreset(PL1a③)을 승격 + clock 네임스페이스 반영.
 *  소비처는 반드시 withDerivedEarly 경유(레벨→분 파생) + '진행 중 아님' 가드를 지킬 것. */
export function applyToClock(d: GamePresetData): Partial<ClockConfig> {
  const p: Partial<ClockConfig> = {};
  if (d.title) p.title = d.title;
  if (d.blindLevels?.length) p.levels = d.blindLevels;
  if (d.startStack) p.startStack = d.startStack;
  if (d.rebuyStack) p.rebuyStack = d.rebuyStack;
  if (d.addonStack) { p.addonStack = d.addonStack; p.isAddon = true; }
  const prizes = moneyPrizeRows(d);
  if (prizes.length) p.prizes = prizes;
  const c: PresetClockData = d.clock ?? {};
  // L-08(audit-link-1002) — 프리셋 한 개 안에 레지 마감이 두 칸(poster.regCloseTime 원문 · clock.regCloseLevel)이라
  //   둘이 다르면 손님에게 광고하는 레벨(포스터)과 클락이 도는 레벨이 갈렸다. 정본은 포스터 원문이다(regCloseLevelOf 와 같은 규칙) —
  //   원문에 'NNLv' 가 있으면 그것, 없을 때만 클락 칸.
  const reg = regCloseLevelOf({ regCloseTime: d.poster?.regCloseTime }) ?? c.regCloseLevel;
  if (reg) p.regCloseLevel = reg;
  if (c.maxLevel) p.maxLevel = c.maxLevel;
  if (c.earlyBonus) p.earlyBonus = c.earlyBonus;
  if (c.doubleEarlyBonus) p.doubleEarlyBonus = c.doubleEarlyBonus;
  if (c.earlyDoubleLevel) p.earlyDoubleLevel = c.earlyDoubleLevel;
  if (c.earlySingleLevel) p.earlySingleLevel = c.earlySingleLevel;
  if (c.mysteryBountyWon) p.mysteryBounty = c.mysteryBountyWon; // 클락 프라이즈와 동일한 원 단위
  if (c.isAddon != null) p.isAddon = c.isAddon;
  return p;
}

/** 프리셋 → 포스터 폼 패치. 포스터 폼 단위(바이인=원 · GTD=만원 · 순위상금=만원)로 환산해 넘긴다. */
export function applyToPoster(d: GamePresetData): Partial<PosterFormData> {
  const p: Partial<PosterFormData> = {};
  if (d.title) p.title = d.title;
  if (d.gameType) p.gameType = d.gameType;
  const buyWon = presetBuyInWon(d);
  if (buyWon) p.buyIn = buyWon;
  if (d.startStack) p.startStack = d.startStack;
  if (d.rebuyStack) p.rebuyStack = d.rebuyStack;
  if (d.addonStack) p.addonStack = d.addonStack;
  if (d.addonCost) p.addonCost = d.addonCost;
  if (d.prizeType) p.prizeType = d.prizeType;
  const gtdWon = presetPrizeWon(d);
  if (d.prizeType === 'GTD' && gtdWon) p.prizeAmount = Math.round(gtdWon / 10_000); // 폼 입력 단위=만원
  if (d.prizeType === 'ENTRY' && d.prizePercent) p.prizePercent = d.prizePercent;
  if (d.duration) p.duration = d.duration;
  if (d.blinds) p.blinds = d.blinds;
  if (d.blindLevels?.length) {
    p.blindLevels = d.blindLevels.map((l) => ({ sb: l.sb, bb: l.bb, ante: l.ante, minutes: l.minutes, isBreak: l.kind === 'break' }));
  }
  if (d.isCompetition != null) p.isCompetition = d.isCompetition;
  if (d.rankingPrizes?.length) {
    // 정규형(amountWon·원)이 있으면 만원으로 환산, 구형·비화폐(%·pts) 행은 원문 그대로(무손실)
    //   LC-F1 — amountWon 이 있어도 단위가 돈(만원·원·빈 단위)일 때만 환산한다. 이전 판이 T 행에 붙인 amountWon 은 무시.
    p.rankingPrizes = d.rankingPrizes.map((r) => (
      r.amountWon != null && (isMoneyUnit(r.unit) || !r.unit)
        ?{ rank: r.rank, amount: Math.round(r.amountWon / 10_000), unit: '만원' }
        : { rank: r.rank, amount: r.amount, unit: r.unit ?? '' }
    ));
  }
  const ns = d.poster ?? {};
  if (ns.startTime) p.startTime = ns.startTime;
  if (ns.regCloseTime) p.regCloseTime = ns.regCloseTime;
  // L-08(audit-link-1002) — 프리셋 → 포스터 → 장부 시작 경로에서 프리셋의 클락 몫이 포스터를 못 건너 클락에 오지 않았다
  //   (장부 시작은 포스터만 읽는다 — clockPatchFromSchedule). 포스터에 칸이 있는 것은 포스터로 옮긴다:
  //   · 레지 마감 레벨 — 원문이 없을 때만 'NNLV'(포스터 원문이 정본이라 덮지 않는다)
  //   · 얼리 단계 — 더블(1단)·1얼리(2단) 거울값을 earlyTiers 로. 칩 0·레벨 0 단계는 뺀다.
  //   maxLevel·미스터리 바운티는 포스터에 칸이 없어 여전히 못 건넌다(리드 결정 대기 — store-link-1002 보고).
  //   ⚠ 클락 몫'만' 있는 부분 프리셋은 그대로 포스터 폼 불간섭이다(§13-B · gameInherit.test '빈 패치') — 이미 포스터를 채우는 프리셋일 때만 싣는다.
  const c = d.clock ?? {};
  if (Object.keys(p).length > 0) {
    if (!ns.regCloseTime && c.regCloseLevel) p.regCloseTime = `${c.regCloseLevel}LV`;
    const tiers = [
      { level: c.earlyDoubleLevel ?? 0, chips: c.doubleEarlyBonus ?? 0 },
      { level: c.earlySingleLevel ?? 0, chips: c.earlyBonus ?? 0 },
    ].filter((t) => t.level > 0 && t.chips > 0);
    if (tiers.length) p.earlyTiers = tiers;
  }
  if (ns.region) p.region = ns.region;
  if (ns.grade !== undefined) p.grade = ns.grade;
  if (ns.paymentMethods?.length) p.paymentMethods = ns.paymentMethods;
  if (ns.partners?.length) p.partners = ns.partners;
  if (ns.prizes?.length) p.prizes = ns.prizes;
  if (ns.events?.length) p.events = ns.events.map((e) => ({ ...e }));
  if (ns.posterUrl) p.posterUrl = ns.posterUrl;
  return p;
}

/** 프리셋 → 장부 세션 패치(+ tournamentStartTime 은 날짜와 합쳐 쓰라고 별도 키로).
 *  장부 저장 단위는 이미 원 — 정규형 그대로 통과, 구형 buyIn 은 폴백 리더 경유. */
export function applyToLedger(d: GamePresetData): Partial<LedgerSession> & { tournamentStartTime?: string } {
  const p: Partial<LedgerSession> & { tournamentStartTime?: string } = {};
  if (d.title) p.title = d.title;
  const buyWon = presetBuyInWon(d);
  if (buyWon) p.buyinAmount = buyWon;
  if (d.prizeType) p.gameType = d.prizeType === 'GTD' ? 'gtd' : 'entry';
  if (d.addonStack) { p.isAddon = true; p.addonStack = d.addonStack; }
  if (d.addonCost) { p.isAddon = true; p.addonAmount = d.addonCost; }   // 애드온 가격(원) — 장부 애드온 행 금액(2026-09-28)
  const ns = d.ledger ?? {};
  if (ns.cardAmountWon != null) p.cardAmount = ns.cardAmountWon;
  if (ns.targetEntries) p.targetEntries = ns.targetEntries;
  if (ns.maxEntries) p.maxEntries = ns.maxEntries;
  // level 까지 옮긴다 — 빠뜨리면 프리셋을 불러온 순간 레벨 자동 할인이 꺼진 채로 시작한다.
  // kind(적용 조건)도 — 빠뜨리면 '첫 바인 16LV 까지' 가 리엔트리에도 자동으로 걸린다(roti-1009 C-2). 없으면 칸을 만들지 않는다(옛 프리셋 그대로).
  if (ns.discounts?.length) p.discounts = ns.discounts.map((x) => ({ label: x.label ?? '', amount: x.amountWon ?? 0, level: x.level ?? 0, ...(x.kind ? { kind: x.kind } : {}) }));
  if (ns.dealers) p.dealers = ns.dealers;
  if (ns.eventMemo) p.eventMemo = ns.eventMemo;
  if (ns.tournamentStartTime) p.tournamentStartTime = ns.tournamentStartTime;
  return p;
}

// ── PL3 변환기 — 클락 프리셋 흡수 + 회차 스냅샷 → 프리셋 authoring ────────────────

/** 구 clock_presets 1건 → 게임 프리셋 데이터(1회 변환 버튼용). 클락 prizes(원) → 정규형 병기. */
export function presetFromClockConfig(cfg: ClockConfig): GamePresetData {
  // 단위가 있는 행(T·GP·포인트 — W-25)은 그 단위 그대로 옮긴다. 원 행만 만원 표시 + amountWon 병기.
  const prizes = (cfg.prizes ?? [])
    .filter((p) => (p.amount ?? 0) > 0)
    .map((p) => (p.unit
      ? { rank: p.place, amount: p.amount, unit: p.unit }
      : { rank: p.place, amount: Math.round(p.amount / 10_000), unit: '만원', amountWon: p.amount }));
  return {
    title: cfg.title || undefined,
    startStack: cfg.startStack || undefined,
    rebuyStack: cfg.rebuyStack || undefined,
    addonStack: cfg.addonStack || undefined,
    blindLevels: cfg.levels?.length ? cfg.levels : undefined,
    rankingPrizes: prizes.length ? prizes : undefined,
    clock: dropEmpty({
      regCloseLevel: cfg.regCloseLevel || undefined,
      maxLevel: cfg.maxLevel || undefined,
      earlyBonus: cfg.earlyBonus || undefined,
      doubleEarlyBonus: cfg.doubleEarlyBonus || undefined,
      earlyDoubleLevel: cfg.earlyDoubleLevel || undefined,
      earlySingleLevel: cfg.earlySingleLevel || undefined,
      mysteryBountyWon: cfg.mysteryBounty || undefined,
      isAddon: cfg.isAddon || undefined,
    }),
  };
}

/** 포스터 폼 값 → 게임 프리셋 데이터('이 설정을 프리셋으로도 저장' — 등록 직후 부산물 저장).
 *  폼 단위(GTD·순위상금=만원 입력)를 원 정규형으로 환산해 병기한다. */
export function presetFromPosterForm(f: PosterFormData): GamePresetData {
  const prizes = (f.rankingPrizes ?? [])
    .filter((r) => (r.amount ?? 0) > 0)
    .map((r) => {
      // 빈 단위('')는 돈으로 추측하지 않고 원문 유지(PL1b 규칙) — 만원 오추정 = 1만 배 사고
      const money = r.unit === '만원' || r.unit === '원';
      if (!money) return { rank: r.rank, amount: r.amount, unit: r.unit ?? '' }; // %·pts·빈 단위는 원문 유지
      const won = r.unit === '원' ? r.amount : manToWon(r.amount);
      return { rank: r.rank, amount: Math.round(won / 10_000), unit: '만원', amountWon: won };
    });
  return {
    title: f.title || undefined,
    gameType: f.gameType || undefined,
    buyIn: f.buyIn || undefined,
    buyInWon: f.buyIn || undefined,
    startStack: f.startStack || undefined,
    rebuyStack: f.rebuyStack || undefined,
    addonStack: f.addonStack || undefined,
    addonCost: f.addonCost || undefined,
    prizeType: f.prizeType,
    prizeAmount: f.prizeType === 'GTD' ? (f.prizeAmount || 0) : 0,
    prizeAmountWon: f.prizeType === 'GTD' ? manToWon(f.prizeAmount || 0) : 0,
    prizePercent: f.prizeType === 'ENTRY' ? (f.prizePercent || 0) : 0,
    duration: f.duration || undefined,
    blinds: f.blinds || undefined,
    blindLevels: f.blindLevels?.length
      ? f.blindLevels.map((l) => ({ kind: l.isBreak ? 'break' as const : 'level' as const, sb: l.sb, bb: l.bb, ante: l.ante ?? 0, minutes: l.minutes }))
      : undefined,
    isCompetition: !!f.isCompetition,
    rankingPrizes: prizes.length ? prizes : undefined,
    poster: dropEmpty({
      startTime: f.startTime || undefined,
      regCloseTime: f.regCloseTime || undefined,
      region: f.region || undefined,
      grade: f.grade ?? undefined,
      paymentMethods: f.paymentMethods?.length ? f.paymentMethods : undefined,
      partners: f.partners?.length ? f.partners : undefined,
      prizes: f.prizes?.length ? f.prizes : undefined,
      events: f.events?.length ? f.events : undefined,
      posterUrl: f.posterUrl || undefined,
    }),
    // 🔴 2026-09-17: 여기에 `clock` 네임스페이스가 통째로 없었다. presetFromSchedule(:102)은 담는데
    //   이쪽만 빠져서, 포스터에 '16LV' 라고 적고 "프리셋으로도 저장"한 뒤 클락에서 그 프리셋을 불러오면
    //   등록 마감이 기본 12 로 돌아갔다 — TV 의 '등록 마감' 표시와 블라인드 자동생성이 포스터와 어긋난다.
    //   2026-09-13 에 고친 '포스터 16 vs 클락 12' 사고의 남은 경로다.
    //   판정은 `regCloseLevelOf` **한 곳**을 그대로 쓴다(여기서 다시 파싱하면 또 갈린다).
    clock: dropEmpty({ regCloseLevel: regCloseLevelOf({ regCloseTime: f.regCloseTime }) || undefined }),
  };
}

/** 'HH:MM' 추출(로컬) — 회차 스냅샷의 스타트 시각을 날짜 없이 프리셋에 담기 위함 */
function localHHMM(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return undefined;
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** 회차(마감 장부 + 연동 클락 설정 + 연결 포스터) → 게임 프리셋 데이터.
 *  '이 게임을 프리셋으로 저장할까요?'(마감 직후)와 '지난 게임에서 프리셋 만들기'의 단일 재료. */
export function presetFromRound(sess: LedgerSession, clockCfg?: ClockConfig | null, sched?: Schedule | null): GamePresetData {
  const base: GamePresetData = sched ? presetFromSchedule(sched) : {};
  const out: GamePresetData = {
    ...base,
    title: sess.title || base.title,
    // 장부 단가(원)가 그 회차의 실제 참가비 — 포스터 값보다 우선
    buyIn: sess.buyinAmount || base.buyIn,
    buyInWon: sess.buyinAmount || base.buyInWon,
    prizeType: base.prizeType ?? (sess.gameType === 'entry' ? 'ENTRY' : 'GTD'),
    ledger: dropEmpty({
      cardAmountWon: sess.cardAmount ?? undefined,
      targetEntries: sess.targetEntries || undefined,
      maxEntries: sess.maxEntries || undefined,
      discounts: sess.discounts?.length ? sess.discounts.map((x) => ({ label: x.label ?? '', amountWon: x.amount ?? 0, level: x.level ?? 0, ...(x.kind ? { kind: x.kind } : {}) })) : undefined,
      dealers: sess.dealers || undefined,
      eventMemo: sess.eventMemo || undefined,
      tournamentStartTime: localHHMM(sess.tournamentStart),
    }),
  };
  if (sess.isAddon && sess.addonStack) out.addonStack = sess.addonStack;
  if (sess.isAddon && sess.addonAmount) out.addonCost = sess.addonAmount;
  if (clockCfg) {
    // 운영 중 고친 클락 값이 최종본 — 스택·블라인드·클락 네임스페이스는 클락 설정이 이긴다
    const fromClock = presetFromClockConfig(clockCfg);
    if (fromClock.startStack) out.startStack = fromClock.startStack;
    if (fromClock.rebuyStack) out.rebuyStack = fromClock.rebuyStack;
    if (fromClock.addonStack) out.addonStack = fromClock.addonStack;
    if (fromClock.blindLevels) out.blindLevels = fromClock.blindLevels;
    if (fromClock.rankingPrizes) out.rankingPrizes = fromClock.rankingPrizes;
    if (fromClock.clock) out.clock = { ...out.clock, ...fromClock.clock };
  }
  return out;
}
