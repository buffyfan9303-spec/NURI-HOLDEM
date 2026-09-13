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
import { RANGE_SCENARIOS, type TablePos, type RangeScenario } from './ranges.data';
import { KEY_PREFIX, PUSH_POS, PUSH_STACKS, type Mode } from './preflopQuiz';
import { buildFreq } from './ranges';
import { nashRange, NASH_STACKS, HAND_ORDER } from './nash.data';
import {
  potBb, heroComboId, validateSpot, hasBlocker, positionsFor,
  type SpotReview, type SpotActionType, type SpotIssue, type SpotPosition,
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
/** 금액이 붙는 액션 — `potBb` 의 SIZED 와 같은 집합이다. */
const SIZED_ACTION = new Set<SpotActionType>(['bet', 'raise', 'call']);

/**
 * 프리플랍에 그 자리가 **이미 내고 시작하는 돈**. 포스트플랍은 0 이다.
 */
function blindOf(s: SpotReview, pos: SpotPosition): number {
  if (s.street !== 'preflop') return 0;
  if (pos === 'BB') return 1;
  if (pos === 'SB') return Number.isFinite(s.sbBb) ? s.sbBb : 0;
  return 0;
}

/**
 * **이번 스트리트에 그 사람이 넣은 총액** — 액션 원장의 최소 단위다.
 *
 * `SpotAction.sizeBb` 는 "이번에 추가로 넣은 돈"(증분)이다. `potBb`(spot.ts)가
 * 블라인드에 모든 액션 금액을 그냥 더하는 것이 그 증거다 — 레이즈가 총액이라면 팟이 부풀 것이다.
 * 그래서 한 사람의 투입액은 **블라인드 + 그 스트리트 증분의 합**이다.
 */
function investedThisStreet(s: SpotReview, actor: 'hero' | 'villain'): number {
  let invested = blindOf(s, actor === 'hero' ? s.heroPos : s.villainPos);
  for (const a of s.actions) {
    if (a.street !== s.street || a.actor !== actor) continue;
    if (!SIZED_ACTION.has(a.type)) continue;
    invested += Number.isFinite(a.sizeBb) ? (a.sizeBb as number) : 0;
  }
  return invested;
}

/**
 * 히어로가 **더 넣어야 하는 돈** = 빌런의 이번 스트리트 총액 − 히어로의 총액.
 *
 * 예전에는 빌런의 **마지막 증분**을 그대로 콜 금액으로 썼다. 두 군데가 틀렸다:
 *  ① 히어로가 이미 낸 돈을 빼지 않았다 — BB vs 2.5x 오픈에서 `2.5/(4+2.5)`=38.5% 가 나왔다.
 *     BB 는 1BB 를 이미 냈으니 1.5 만 더 넣으면 되고 정답은 `1.5/(4+1.5)`=**27.3%** 다.
 *  ② 한 스트리트에 레이즈가 두 번 이상 오가면 마지막 증분이 상대의 총액이 아니다.
 *     (BTN 2.5 → BB 3벳 +8 → BTN 4벳 +22 이면 BTN 총액 24.5, BB 총액 9, 콜은 15.5 다.)
 *
 * 두 사람의 **총액 차이**로 재면 둘 다 자연히 맞고, 히어로가 이미 콜해 금액이 같으면 0 이 된다.
 */
export function amountToCall(s: SpotReview): number {
  const diff = investedThisStreet(s, 'villain') - investedThisStreet(s, 'hero');
  return Math.round(Math.max(0, diff) * 100) / 100;
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
 * 스팟 포지션 → 차트 포지션.
 *
 * 두 축의 철자가 **한 자리에서만** 다르다: 스팟은 'UTG1', 차트는 'UTG+1'.
 * 9개 중 8개가 겹쳐서 TypeScript 는 `spotPos === tablePos` 비교를 막지 못한다
 * (겹치는 멤버가 하나도 없어야 에러가 난다). 그래서 UTG+1 자리는 어떤 입력으로도
 * 표에 걸리지 않았다 — 2026-09-11 실측: 9인 오픈·BB 수비 둘 다 **그 자리만** math_only.
 *
 * 'UTG1' 쪽을 바꾸지 않는 이유: 이미 저장된 스팟(post_spots.spot jsonb · spot_reviews)과
 * 스냅샷에 그 문자열이 들어 있다. 표기를 바꾸면 옛 글이 조용히 자리 없는 스팟이 된다.
 * 그래서 **경계에서 옮긴다** — 이 함수가 두 축이 만나는 유일한 지점이다.
 *
 * 10인의 'UTG2' 는 차트 축에 **없다**(ranges.data 에 10인 표가 없다) → null.
 * 이웃 자리(UTG+1)로 접지 않는다 — 없는 표를 있는 것처럼 보여 주는 것이 되기 때문이다.
 * null 이면 호출부가 차트 조회를 건너뛰고 Nash 또는 math_only 로 간다.
 */
export const toTablePos = (p: SpotPosition): TablePos | null =>
  p === 'UTG1' ? 'UTG+1' : p === 'UTG2' ? null : p;

/** 그 인원 테이블에서 이 자리 뒤에 남은 사람 수. 자리가 없으면 null. */
function behindOf(tableSize: number, pos: SpotPosition): number | null {
  const seats = positionsFor(tableSize);
  const at = seats.indexOf(pos);
  return at < 0 ? null : seats.length - 1 - at;
}

/**
 * 표가 상정한 인원과 입력 인원이 다를 때 적는 차이.
 * 9인 이하는 이름이 같으면 뒤 인원이 같지만(positionsFor 가 앞을 자른다), 10인은 UTG2 가 끼어
 * **UTG·UTG+1 의 뒤 인원이 9인 표보다 1명 많다** — 그 표를 참조는 하되 그 사실도 같이 적는다.
 */
function tableSizeDiff(s: SpotReview, want: number, pos: SpotPosition, who: string): string[] {
  if (s.tableSize === want) return [];
  const out = [`이 표는 ${want}인 기준인데 입력은 ${s.tableSize}인입니다.`];
  const have = behindOf(s.tableSize, pos);
  const chart = behindOf(want, pos);
  if (have !== null && chart !== null && have !== chart) {
    out.push(`${who} ${pos} 는 ${want}인 표보다 뒤 인원이 ${Math.abs(have - chart)}명 더 ${have > chart ? '많' : '적'}습니다.`);
  }
  return out;
}

/**
 * BB 수비 표 조회 — **배열 순서에 기대지 않는다.**
 *
 * defend 그룹에는 같은 vs 로 BB 표와 SB 표가 나란히 들어 있다(`bb_vs_btn` 과 `sb_vs_btn`).
 * hero 를 걸지 않으면 `find` 가 배열에서 먼저 만난 쪽을 집는다 — 지금 데이터가 BB 를 앞에 둬서
 * **우연히** 맞고 있었을 뿐이고, 표를 한 줄만 옮기면 조용히 SB 표(3벳-or-폴드)를 본다.
 *
 * 목록을 인자로 받는 이유는 그 우연에 기대지 않았음을 **순서를 뒤집어 검증할 수 있게** 하려는 것이다.
 * 인자가 없으면 이 함수는 실제 데이터 순서로만 테스트되고, 순서가 바뀐 날 조용히 틀린다.
 */
export const findDefendChart = (
  list: readonly RangeScenario[],
  villainPos: SpotPosition,
): RangeScenario | null => {
  const vs = toTablePos(villainPos);
  if (!vs) return null;
  return list.find((x) => x.group === 'defend' && x.hero === 'BB' && x.vs === vs) ?? null;
};

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
    const hero = toTablePos(s.heroPos);
    const sc = hero ? RANGE_SCENARIOS.find((x) => x.group === group && x.hero === hero) : undefined;
    if (!sc) return null;
    const want = group === 'rfi9' ? 9 : 6;
    const diffs = [...stackDiff, ...tableSizeDiff(s, want, s.heroPos, '내 자리')];
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
    // hero 도 같이 건다 — 같은 vs 로 BB 표와 SB 표가 나란히 있어 순서에 기대면 조용히 틀린다.
    const sc = findDefendChart(RANGE_SCENARIOS, s.villainPos);
    if (!sc) return null;
    // 표마다 상정 인원이 다르다 — 얼리(UTG·UTG+1·MP) 오픈 수비 표는 9인용이다.
    // 6인으로 단정하면 9인 입력에 **없는 차이를 적어** 정확 일치를 유사 스팟으로 끌어내린다.
    const want = sc.baseTableSize ?? 6;
    const diffs = [...stackDiff, ...tableSizeDiff(s, want, s.villainPos, '상대 자리')];
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
  // nash.data 의 앤티 표는 **BB앤티 1BB** 한 벌뿐이다. 0.5BB 처럼 다른 총액이면 그 표를 참조하되 차이로 남긴다.
  if (s.anteBb > 0 && Math.abs(s.anteBb - 1) > 0.01) {
    diffs.push(`이 표는 BB앤티 1BB 기준인데 입력 앤티는 ${s.anteBb}BB 입니다.`);
  }
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
  // 빌런의 레이즈는 **총액**이라 히어로가 이미 낸 돈을 빼야 실제로 더 넣는 돈이 된다.
  const toCall = amountToCall(s);
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
