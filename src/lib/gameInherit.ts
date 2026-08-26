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

/** 포스터 structure.levels → 클락 levels (isBreak 플래그 → kind 판별) */
export function posterLevelsToClock(
  levels: NonNullable<NonNullable<Schedule['structure']>['levels']>,
): ClockLevel[] {
  return levels.map((l) => ({
    kind: l.isBreak ? 'break' as const : 'level' as const,
    minutes: l.minutes, sb: l.sb, bb: l.bb, ante: l.ante ?? 0,
  }));
}

/** PL1a 무금액 상속 — 클락 cfg 병합 패치. 소비처는 반드시 '진행 중 아님'을 확인할 것(비파괴 병합 가드). */
export function clockPatchFromSchedule(sc: Schedule): Partial<ClockConfig> {
  const p: Partial<ClockConfig> = {};
  if (sc.title) p.title = sc.title;
  const lv = sc.structure?.levels;
  if (lv && lv.length > 0) p.levels = posterLevelsToClock(lv);
  if (sc.structure?.lateRegLevels) p.regCloseLevel = sc.structure.lateRegLevels;
  const start = sc.buyIn?.startStack ?? sc.structure?.startingChips;
  if (start) p.startStack = start;
  const rebuy = sc.buyIn?.rebuyStack ?? sc.structure?.rebuyStack;
  if (rebuy) p.rebuyStack = rebuy;
  if (sc.buyIn?.addonStack) { p.addonStack = sc.buyIn.addonStack; p.isAddon = true; }
  return p;
}

/** PL1b 금액 상속 — 포스터 순위별 상금(만원 표기) → 클락 prizes(원).
 *  단위가 돈이 아닌 항목(%·pts·이용권 등)은 오환산 위험이라 제외한다. */
export function clockPrizesFromSchedule(sc: Schedule): ClockPrizeRow[] | null {
  const rows = (sc.rankingPrizes ?? [])
    .filter((r) => (r.amount ?? 0) > 0 && (r.unit == null || r.unit === '만원' || r.unit === '원'))
    .map((r) => ({ place: r.rank, amount: rankingPrizeWon(r) }));
  return rows.length > 0 ? rows : null;
}

/** PL3 생성 경로 역전 — '지난 게임(포스터)에서 프리셋 만들기'.
 *  이미 20번 연 게임을 빈 폼에 다시 치는 구조가 프리셋 탭 방치의 원인이었다(§13-B).
 *  금액은 전부 원 정규형(*Won)으로 적고, 구형 필드는 표시 호환용으로만 함께 채운다. */
export function presetFromSchedule(sc: Schedule): GamePresetData {
  const prizes = (sc.rankingPrizes ?? [])
    .filter((r) => (r.amount ?? 0) > 0 && (r.unit == null || r.unit === '만원' || r.unit === '원'))
    .map((r) => ({ rank: r.rank, amount: r.unit === '원' ? Math.round(r.amount / 10_000) : r.amount, unit: '만원', amountWon: rankingPrizeWon(r) }));
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
      events: sc.promotions?.length ? sc.promotions.map((p) => ({ badge: p.badge, title: p.title })) : undefined,
      posterUrl: sc.posterUrl || undefined,
    }),
    clock: dropEmpty({ regCloseLevel: sc.structure?.lateRegLevels || undefined }),
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
  return (d.rankingPrizes ?? [])
    .filter((r) => ((r.amountWon ?? r.amount) ?? 0) > 0 && (r.amountWon != null || r.unit == null || r.unit === '만원' || r.unit === '원'))
    .map((r) => ({ place: r.rank, amount: rankingPrizeWon(r) }));
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
  if (c.regCloseLevel) p.regCloseLevel = c.regCloseLevel;
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
    p.rankingPrizes = d.rankingPrizes.map((r) => (
      r.amountWon != null
        ? { rank: r.rank, amount: Math.round(r.amountWon / 10_000), unit: '만원' }
        : { rank: r.rank, amount: r.amount, unit: r.unit ?? '' }
    ));
  }
  const ns = d.poster ?? {};
  if (ns.startTime) p.startTime = ns.startTime;
  if (ns.regCloseTime) p.regCloseTime = ns.regCloseTime;
  if (ns.region) p.region = ns.region;
  if (ns.grade !== undefined) p.grade = ns.grade;
  if (ns.paymentMethods?.length) p.paymentMethods = ns.paymentMethods;
  if (ns.partners?.length) p.partners = ns.partners;
  if (ns.prizes?.length) p.prizes = ns.prizes;
  if (ns.events?.length) p.events = ns.events.map((e) => ({ badge: e.badge, title: e.title }));
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
  const ns = d.ledger ?? {};
  if (ns.cardAmountWon != null) p.cardAmount = ns.cardAmountWon;
  if (ns.targetEntries) p.targetEntries = ns.targetEntries;
  if (ns.maxEntries) p.maxEntries = ns.maxEntries;
  if (ns.discounts?.length) p.discounts = ns.discounts.map((x) => ({ label: x.label ?? '', amount: x.amountWon ?? 0 }));
  if (ns.dealers) p.dealers = ns.dealers;
  if (ns.eventMemo) p.eventMemo = ns.eventMemo;
  if (ns.tournamentStartTime) p.tournamentStartTime = ns.tournamentStartTime;
  return p;
}

// ── PL3 변환기 — 클락 프리셋 흡수 + 회차 스냅샷 → 프리셋 authoring ────────────────

/** 구 clock_presets 1건 → 게임 프리셋 데이터(1회 변환 버튼용). 클락 prizes(원) → 정규형 병기. */
export function presetFromClockConfig(cfg: ClockConfig): GamePresetData {
  const prizes = (cfg.prizes ?? [])
    .filter((p) => (p.amount ?? 0) > 0)
    .map((p) => ({ rank: p.place, amount: Math.round(p.amount / 10_000), unit: '만원', amountWon: p.amount }));
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
      discounts: sess.discounts?.length ? sess.discounts.map((x) => ({ label: x.label ?? '', amountWon: x.amount ?? 0 })) : undefined,
      dealers: sess.dealers || undefined,
      eventMemo: sess.eventMemo || undefined,
      tournamentStartTime: localHHMM(sess.tournamentStart),
    }),
  };
  if (sess.isAddon && sess.addonStack) out.addonStack = sess.addonStack;
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
