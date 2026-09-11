// src/lib/spotEvaluate.ts — NURI SPOT 분석의 단일 진입점 (2026-09-11 오너 지시)
//
// ── 이 파일이 지키는 약속 ────────────────────────────────────────────────────
// **없는 근거로 액션을 추천하지 않는다.** 그게 전부다.
//
// 예전 useDeepGto.actionFromEquity 는 에퀴티 62% 이상이면 raise 85%/call 13%/fold 2% 처럼
// 구간별 상수를 돌려줬다. 그 숫자는 어떤 솔버에서도 나온 적이 없다 — 사람이 정한 눈금이다.
// 화면에서는 차트 빈도와 똑같이 생긴 막대로 보였으니, 사용자는 그걸 GTO 라고 읽었다.
//
// 여기서는 결과에 **지원 등급**을 붙여 그 혼동을 구조적으로 없앤다:
//   exact_solver         실제 솔버 산출  → **이 저장소에는 없다**(아래 참고). 도달 불가.
//   chart_nash           자체 차트·Nash 데이터와 **정확히** 일치
//   normalized_reference 허용 범위 안의 가까운 참조 스팟 — 무엇이 다른지 화면에 적는다
//   math_only            에퀴티·팟오즈·필요 승률만. 추천 액션 없음
//   unsupported          분석 범위 밖. 리플레이·저장·토론은 되지만 액션은 만들지 않는다
//
// ── 왜 exact_solver 가 도달 불가인가(2026-09-11 확인) ───────────────────────
// 저장소의 전략 데이터는 셋뿐이고 어느 것도 검증된 포스트플랍 솔버 산출이 아니다:
//   · src/lib/ranges.data.ts   사람이 만든 100bb 학습용 프리플랍 차트
//   · src/lib/nash.data.ts     자체 fictitious play 푸시/폴드(2~20bb) — 생성기 유실로 재현 불가
//   · gto.deep.data.ts         **사람이 쓴 설명문에 빈도를 적어 넣은 예시** — 솔버 산출 아님
// 그래서 이 파일은 exact_solver 를 반환하는 경로를 아예 갖지 않는다.
// 나중에 검증된 데이터가 들어오면 evaluateSpot 안의 `lookupSolver` 자리 한 곳만 채우면 된다.
import { RANGE_SCENARIOS } from './ranges.data';
import { KEY_PREFIX, PUSH_POS, PUSH_STACKS, type Mode } from './preflopQuiz';
import { buildFreq } from './ranges';
import { nashRange, NASH_STACKS, HAND_ORDER } from './nash.data';
import {
  potBb, heroComboId, validateSpot, hasBlocker, positionsFor,
  type SpotReview, type SpotActionType, type SpotIssue,
} from './spot';

// ── 결과 타입 ─────────────────────────────────────────────────────────────────

export type CoverageKind =
  | 'exact_solver' | 'chart_nash' | 'normalized_reference' | 'math_only' | 'unsupported';

export const COVERAGE_LABEL: Record<CoverageKind, string> = {
  exact_solver: '솔버 기준',
  chart_nash: '차트/Nash 기준',
  normalized_reference: '유사 스팟 참고',
  math_only: '수학 참고',
  unsupported: '정확한 분석 범위 밖',
};

/** 내 선택에 대한 평가. 'improve' 는 **검증된 차트에 정확히 걸렸을 때만** 쓴다. */
export type Verdict = 'good' | 'mixed' | 'improve' | 'reference' | 'math' | 'out_of_scope';

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: '좋은 선택',
  mixed: '허용되는 혼합',
  improve: '개선 필요',
  reference: '유사 스팟 참고',
  math: '수학 참고',
  out_of_scope: '정확한 분석 범위 밖',
};

/** 액션별 빈도(0~1). 합은 1. 이 앱의 차트는 fold/call/raise 세 갈래만 쓴다. */
export interface ActionMix { fold: number; call: number; raise: number }

export interface MathFacts {
  /** 결정 지점의 팟(BB) — 액션 합산값 */
  potBb: number;
  /** 콜에 필요한 금액(BB). 앞에 벳/레이즈가 없으면 0 */
  toCallBb: number;
  /** 팟오즈 — 콜 금액이 (팟+콜) 에서 차지하는 비율 % */
  potOddsPct: number | null;
  /** 손익분기 승률 % — 이 승률보다 높으면 콜이 이득 */
  neededEquityPct: number | null;
  /** 몬테카를로 에퀴티 %(호출부가 워커로 계산해 넘긴다). 없으면 null */
  heroEquityPct: number | null;
}

interface Base {
  /** 데이터 버전 — 게시 시점 보존용. 엔진이 바뀌어도 옛 글의 결론이 말없이 바뀌지 않게 한다. */
  datasetVersion: string;
  verdict: Verdict;
  /** 사용자에게 보여줄 근거 문장들 */
  notes: string[];
  /** 검증 경고(blocker 아님) */
  issues: SpotIssue[];
  math: MathFacts;
}

export type SpotEvaluation =
  | (Base & {
    kind: 'chart_nash' | 'normalized_reference';
    /** 어떤 표를 봤는가 — 화면·게시글에 그대로 남는다 */
    sourceLabel: string;
    mix: ActionMix;
    /** 내가 고른 액션의 차트 빈도(0~1). heroAction 이 없으면 null */
    heroFreq: number | null;
    /** normalized_reference 일 때 **무엇이 달랐는가**. 비어 있으면 정확 일치 */
    differences: string[];
    /** 이 표를 그대로 푸는 트레이너 문제. 옛 글에는 없을 수 있다(optional) */
    drill?: DrillLink;
  })
  | (Base & { kind: 'math_only'; })
  | (Base & { kind: 'unsupported'; reason: string; });

/** 데이터가 바뀌면 이 값을 올린다 — 게시글에 저장돼 '그때의 기준'을 증명한다. */
export const DATASET_VERSION = 'nuri-charts-2026-09-11';

// ── 차트 조회 ─────────────────────────────────────────────────────────────────

const CHART_STACK_BB = 100;                 // ranges.data 의 모든 표가 100bb 한 벌이다
const NORMALIZE_BAND: [number, number] = [70, 150]; // 이 밖이면 유사 스팟으로도 안 본다

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => Math.round(n * 1000) / 10;

/** 시나리오의 한 액션에서 이 콤보의 빈도(0~1). 표에 없으면 0. */
function freqOf(scenarioId: string, actionKey: string, combo: string): number {
  const sc = RANGE_SCENARIOS.find((s) => s.id === scenarioId);
  const act = sc?.actions.find((a) => a.key === actionKey);
  if (!act) return 0;
  return clamp01(buildFreq(act.spec).get(combo) ?? 0);
}

/** 히어로 앞에 액션이 하나도 없는가(첫 진입). */
const isFirstIn = (s: SpotReview) => s.actions.length === 0;

/** 히어로가 마주한 마지막 벳/레이즈(콜에 필요한 금액). 없으면 0. */
function facingBet(s: SpotReview): number {
  for (let i = s.actions.length - 1; i >= 0; i -= 1) {
    const a = s.actions[i];
    if (a.actor === 'villain' && (a.type === 'bet' || a.type === 'raise')) return a.sizeBb ?? 0;
    if (a.actor === 'hero') break;
  }
  return 0;
}

interface ChartHit {
  sourceLabel: string;
  mix: ActionMix;
  differences: string[];
  /** 이 표를 그대로 연습할 수 있는 트레이너 문제. 대응 문제가 없으면 없음 */
  drill?: DrillLink;
}

/**
 * '이 표로 연습' 링크. **평가가 실제로 참조한 그 표**만 가리킨다 —
 * 스팟 사이의 거리를 재는 수단이 이 저장소에 없으므로, 그 밖의 '비슷함'은 지어낸 것이 된다.
 * key 는 preflopQuiz 의 문제 식별자 형식 그대로다('<접두>|<시나리오>|<핸드>').
 */
export interface DrillLink {
  mode: Mode;
  key: string;
}

/**
 * 프리플랍 차트 조회. 정확히 걸리면 differences 가 빈 배열,
 * 스택만 허용 범위 안에서 다르면 그 차이를 differences 에 담아 돌려준다.
 * 걸리지 않으면 null — **비슷하게 맞춰서 억지로 돌려주지 않는다.**
 */
function lookupPreflopChart(s: SpotReview, combo: string): ChartHit | null {
  if (s.street !== 'preflop') return null;

  const stackDiff: string[] = [];
  if (Math.abs(s.effectiveBb - CHART_STACK_BB) > 0.5) {
    if (s.effectiveBb < NORMALIZE_BAND[0] || s.effectiveBb > NORMALIZE_BAND[1]) return null;
    stackDiff.push(`이 표는 ${CHART_STACK_BB}BB 기준인데 입력은 ${s.effectiveBb}BB 입니다.`);
  }
  if (s.anteBb > 0) stackDiff.push(`이 표는 앤티 없는 기준입니다(입력 앤티 ${s.anteBb}BB).`);

  // ① 첫 진입 오픈(RFI) — 앞에 아무 액션이 없다
  if (isFirstIn(s)) {
    const group = s.tableSize >= 8 ? 'rfi9' : 'rfi6';
    const sc = RANGE_SCENARIOS.find((x) => x.group === group && x.hero === s.heroPos);
    if (!sc) return null;
    const diffs = [...stackDiff];
    const want = group === 'rfi9' ? 9 : 6;
    if (s.tableSize !== want) diffs.push(`이 표는 ${want}인 기준인데 입력은 ${s.tableSize}인입니다.`);
    const raise = freqOf(sc.id, 'raise', combo);
    return {
      sourceLabel: `프리플랍 레인지 차트 · ${sc.label} 오픈`,
      mix: { raise, call: 0, fold: clamp01(1 - raise) },
      differences: diffs,
      drill: { mode: 'rfi', key: `${KEY_PREFIX.rfi}|${sc.id}|${combo}` },
    };
  }

  // ② BB 수비 — 상대의 오픈 레이즈 하나만 앞에 있다
  const onlyOpen = s.actions.length === 1
    && s.actions[0].actor === 'villain'
    && s.actions[0].type === 'raise';
  if (onlyOpen && s.heroPos === 'BB') {
    const sc = RANGE_SCENARIOS.find((x) => x.group === 'defend' && x.vs === s.villainPos);
    if (!sc) return null;
    const diffs = [...stackDiff];
    if (s.tableSize !== 6) diffs.push(`이 표는 6인 기준인데 입력은 ${s.tableSize}인입니다.`);
    const raise = freqOf(sc.id, 'raise', combo);   // 3벳
    const call = freqOf(sc.id, 'call', combo);
    return {
      sourceLabel: `프리플랍 레인지 차트 · ${sc.label}`,
      mix: { raise, call, fold: clamp01(1 - raise - call) },
      differences: diffs,
      drill: { mode: 'defend', key: `${KEY_PREFIX.defend}|${sc.id}|${combo}` },
    };
  }

  return null;
}

/**
 * 숏스택 푸시/폴드(Nash) 조회 — 첫 진입 올인만 다룬다.
 * nash.data 는 스택 2~20BB 의 이산 값만 갖는다. 그 사이 값은 **보간하지 않는다**
 * (전략 빈도를 임의로 섞으면 그건 더 이상 그 데이터가 아니다).
 */
function lookupNash(s: SpotReview, combo: string): ChartHit | null {
  if (s.street !== 'preflop' || !isFirstIn(s)) return null;
  const seats = positionsFor(s.tableSize);
  const at = seats.indexOf(s.heroPos);
  if (at < 0) return null;
  const k = seats.length - 1 - at;      // 내 뒤에 남은 인원(BB=0 은 셔브 주체가 아니다)
  if (k < 1 || k > 8) return null;

  const idx = HAND_ORDER.indexOf(combo);
  if (idx < 0) return null;

  const exact = NASH_STACKS.find((v) => Math.abs(v - s.effectiveBb) < 0.01);
  const stack = exact ?? NASH_STACKS.find((v) => Math.abs(v - s.effectiveBb) <= 1);
  if (stack === undefined) return null;

  const arr = nashRange('shove', k, stack, s.anteBb > 0);
  if (!arr || arr.length <= idx) return null;
  const shove = clamp01(arr[idx]);

  const diffs: string[] = [];
  if (exact === undefined) diffs.push(`이 표는 ${stack}BB 기준인데 입력은 ${s.effectiveBb}BB 입니다.`);
  return {
    sourceLabel: `푸시·폴드 차트 · ${stack}BB · 뒤 ${k}명${s.anteBb > 0 ? ' · BB앤티' : ''}`,
    // 올인은 레이즈 갈래로 표시한다 — 이 차트에 콜 갈래는 없다(첫 진입 셔브/폴드 두 갈래)
    mix: { raise: shove, call: 0, fold: clamp01(1 - shove) },
    differences: diffs,
    // ⚠ 트레이너 푸시 문제는 PUSH_POS 자리만 낸다(k=7 = 9인 UTG+1 은 없다).
    //   없는 자리로 키를 만들면 makeQuiz 가 **조용히 무관한 문제**를 낸다 — 그게 CTA 를
    //   거짓말로 만드는 가장 현실적인 경로다. 있는 자리에만 링크를 싣는다.
    ...(PUSH_POS.some((x) => x.k === k) && PUSH_STACKS.includes(stack)
      ? { drill: { mode: 'push' as const, key: `${KEY_PREFIX.push}|${k}-${stack}|${combo}` } }
      : {}),
  };
}

// ── 수학 ──────────────────────────────────────────────────────────────────────

function mathFacts(s: SpotReview, heroEquityPct: number | null): MathFacts {
  const pot = potBb(s);
  const toCall = facingBet(s);
  if (toCall <= 0) {
    return { potBb: pot, toCallBb: 0, potOddsPct: null, neededEquityPct: null, heroEquityPct };
  }
  const needed = toCall / (pot + toCall);
  return {
    potBb: pot,
    toCallBb: toCall,
    potOddsPct: pct(needed),
    neededEquityPct: pct(needed),
    heroEquityPct,
  };
}

// ── 판정 ──────────────────────────────────────────────────────────────────────

/** 차트 빈도 → 평가. 정확 일치일 때만 '개선 필요' 를 쓴다. */
function verdictFromFreq(freq: number | null, exact: boolean): Verdict {
  if (freq === null) return exact ? 'mixed' : 'reference';
  if (!exact) return 'reference';           // 조건이 달랐으면 옳고 그름을 단정하지 않는다
  if (freq >= 0.5) return 'good';
  if (freq > 0) return 'mixed';
  return 'improve';
}

/** heroAction → 차트 갈래. 이 앱의 차트는 fold/call/raise 세 갈래다. */
function mixKeyOf(a: SpotActionType): keyof ActionMix | null {
  if (a === 'fold') return 'fold';
  if (a === 'call') return 'call';
  if (a === 'raise' || a === 'bet') return 'raise';
  return null;   // check 는 프리플랍 차트에 대응 갈래가 없다
}

export interface EvaluateOptions {
  /** 워커가 계산한 히어로 에퀴티(0~1). 없으면 수학 지표에서 에퀴티 항목이 비어 나온다. */
  heroEquity?: number | null;
}

/**
 * 스팟 하나를 평가한다. **순수 함수** — 네트워크·워커를 부르지 않는다.
 * 에퀴티가 필요하면 호출부가 워커로 계산해 options.heroEquity 로 넘긴다
 * (그래야 오래된 워커 응답이 최신 결과를 덮는 문제를 호출부에서 한 곳으로 다룰 수 있다).
 */
export function evaluateSpot(s: SpotReview, options: EvaluateOptions = {}): SpotEvaluation {
  const issues = validateSpot(s);
  const warns = issues.filter((i) => i.level === 'warn');
  const heroEquityPct = typeof options.heroEquity === 'number' ? pct(options.heroEquity) : null;
  const math = mathFacts(s, heroEquityPct);
  const base = { datasetVersion: DATASET_VERSION, issues: warns, math };

  if (hasBlocker(issues)) {
    return {
      ...base, kind: 'unsupported', verdict: 'out_of_scope',
      reason: '입력에 고칠 점이 있어 분석하지 않았습니다.',
      notes: issues.filter((i) => i.level === 'blocker').map((i) => i.message),
    };
  }

  const combo = heroComboId(s.hero);
  if (!combo) {
    return {
      ...base, kind: 'unsupported', verdict: 'out_of_scope',
      reason: '내 카드 2장이 있어야 분석할 수 있습니다.',
      notes: ['카드를 채우면 에퀴티와 팟오즈부터 계산해 드립니다.'],
    };
  }

  // ① 실제 솔버 — 이 저장소에 검증된 데이터가 없다. 들어오면 여기 한 곳만 채운다.
  //    (가짜 표본을 넣지 않는다는 것이 이 자리의 전부다.)

  // ② 차트 · Nash
  const hit = lookupPreflopChart(s, combo) ?? lookupNash(s, combo);
  if (hit) {
    const exact = hit.differences.length === 0;
    const key = s.heroAction ? mixKeyOf(s.heroAction) : null;
    const heroFreq = key ? hit.mix[key] : null;
    const notes: string[] = [hit.sourceLabel];
    if (s.heroAction && !key) {
      notes.push(`이 표에는 '${s.heroAction}' 갈래가 없어 내 선택과 직접 비교하지 않았습니다.`);
    }
    if (!exact) notes.push(...hit.differences);
    if (heroFreq !== null && heroFreq > 0 && heroFreq < 0.5) {
      notes.push('이 핸드는 표에서도 갈리는 자리입니다 — 한쪽만 정답이 아닙니다.');
    }
    return {
      ...base,
      kind: exact ? 'chart_nash' : 'normalized_reference',
      sourceLabel: hit.sourceLabel,
      mix: hit.mix,
      ...(hit.drill ? { drill: hit.drill } : {}),
      heroFreq,
      differences: hit.differences,
      verdict: verdictFromFreq(heroFreq, exact),
      notes,
    };
  }

  // ③ 수학만 — 추천 액션을 만들지 않는다
  const notes: string[] = [];
  if (s.street === 'preflop') {
    notes.push('이 조건에 맞는 검증된 프리플랍 표가 없어 수치만 계산했습니다.');
  } else {
    notes.push('이 앱에는 검증된 포스트플랍 솔버 데이터가 없습니다 — 에퀴티·팟오즈만 계산했습니다.');
  }
  if (math.toCallBb > 0) {
    notes.push(`${math.toCallBb}BB 를 콜하려면 승률이 ${math.neededEquityPct}% 보다 높아야 손해가 아닙니다.`);
  } else {
    notes.push('앞에 벳이 없어 팟오즈는 계산하지 않았습니다.');
  }
  notes.push('여기에는 GTO 추천 액션이 없습니다. 어떤 선택이 정답인지 말하지 않습니다.');
  return { ...base, kind: 'math_only', verdict: 'math', notes };
}
