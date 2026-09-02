// src/lib/preflopQuiz.ts
// 프리플랍 트레이너 문제 생성·채점 — 트레이너와 '오늘의 드릴'·오답 노트가 함께 쓰는 단일 소스.
//
// 왜 분리했나(2026-08-29): 드릴이 "PreflopTrainer 의 오답 재출제 큐"를 그대로 이어받아야 하는데,
//   문제 생성기(makeQuiz)와 오답 큐(localStorage)가 컴포넌트 안에 갇혀 있었다. 로직만 꺼냈고
//   채점 규칙·키 포맷·저장 키는 **한 글자도 바꾸지 않았다**(기존 기록 그대로 이어짐).
// 모드 확장(2026-09-03): 오픈·푸시폴드 2모드 → 3벳·블라인드 수비·vs 3벳·올인 콜까지 6모드.
//   차트(ranges.data)의 defend/threebet/vs3bet 스팟과 Nash 콜 레인지는 차트로만 보였고 한 번도 채점되지 않았다.
//   문제는 '액션 N개(3벳/콜 등) + 폴드' 로 일반화했다 — 기존 키('rfi|' 'push|')·저장 형태는 그대로.
//
// 설계 배경(구 PreflopTrainer 주석 유지):
//  ① 균등 샘플이면 UTG 문제의 86%가 자명한 폴드 → 경계(혼합·경계 인접) 집중 샘플링
//  ② 통계가 state 뿐이면 새로고침에 소멸 → localStorage 영속 + 오답 재출제 큐
//  ③ 채점 근거는 Chen 근사가 아니라 가이드와 동일한 표준 차트/Nash 데이터
import { labelToCards, type Card } from './preflop';
import { buildFreq, gridName, freqFromArray, type FreqMap } from './ranges';
import { RANGE_SCENARIOS, type RangeScenario } from './ranges.data';
import { HAND_ORDER, nashRange } from './nash.data';

export type Mode = 'rfi' | 'threebet' | 'defend' | 'vs3bet' | 'push' | 'call';
export const MODES: { id: Mode; label: string }[] = [
  { id: 'rfi', label: '오픈' }, { id: 'threebet', label: '3벳' }, { id: 'defend', label: '수비' },
  { id: 'vs3bet', label: 'vs 3벳' }, { id: 'push', label: '푸시폴드' }, { id: 'call', label: '올인 콜' },
];
/** 키 접두 — 기존 'rfi'·'push' 는 저장된 오답 큐·SRS 와의 호환을 위해 그대로 */
const KEY_PREFIX: Record<Mode, string> = { rfi: 'rfi', threebet: '3b', defend: 'def', vs3bet: 'v3b', push: 'push', call: 'call' };
const CHART_GROUPS: Partial<Record<Mode, RangeScenario['group'][]>> = {
  rfi: ['rfi6', 'rfi9'], threebet: ['threebet'], defend: ['defend'], vs3bet: ['vs3bet'],
};
export const FOLD = '폴드';

export const PUSH_POS: { k: number; label: string }[] = [
  { k: 8, label: 'UTG(9인)' }, { k: 6, label: 'UTG+2' }, { k: 5, label: 'LJ' }, { k: 4, label: 'HJ' },
  { k: 3, label: 'CO' }, { k: 2, label: 'BTN' }, { k: 1, label: 'SB' },
];
export const PUSH_STACKS = [5, 7, 8, 10, 12, 15]; // 실전 빈발 구간
/** 올인 콜 자리 — SB 콜 레인지는 셔버가 SB 가 아닌 k≥2 에서만 존재(nash.data) */
const CALL_SEATS = [{ id: 'bb', kind: 'callBB' as const, label: 'BB', minK: 1 }, { id: 'sb', kind: 'callSB' as const, label: 'SB', minK: 2 }];

export interface QuizAct { label: string; freq: number } // 폴드가 아닌 선택지 — '오픈' '3벳' '콜' … 와 그 빈도 0..1
export interface Quiz {
  mode: Mode;
  key: string; // 오답 재출제 식별자 — '<prefix>|<scenarioId>|<hand>' | 'push|<k>-<stack>|<hand>' | 'call|<seat>-<k>-<stack>|<hand>'
  posLabel: string;
  situ: string; // 상황 설명 한 줄(스택·상대 액션 등)
  hand: string;
  cards: [Card, Card];
  stackBb: number;
  /** 상대(오픈·3벳·올인한 사람) — RFI·푸시폴드처럼 상대가 없으면 생략. bb 는 상대 액션 크기(AI 해설 문맥용) */
  vs?: { label: string; bb: number };
  acts: QuizAct[]; // 버튼 순서. 폴드 빈도 = 1 − Σacts
}

// 경계 집중 샘플링 — 혼합 셀 3배, 경계 인접 폴드 1.5배, 깊은 폴드 0.15배
function weightedPick(freqMap: FreqMap): string {
  const f = (n: string) => freqMap.get(n) ?? 0;
  const items: { n: string; w: number }[] = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const n = gridName(i, j);
    const v = f(n);
    let w: number;
    if (v > 0 && v < 1) w = 3;
    else if (v >= 1) w = 1;
    else {
      const near = [gridName(Math.max(0, i - 1), j), gridName(Math.min(12, i + 1), j), gridName(i, Math.max(0, j - 1)), gridName(i, Math.min(12, j + 1))]
        .some((m) => f(m) > 0);
      w = near ? 1.5 : 0.15;
    }
    items.push({ n, w });
  }
  const sum = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * sum;
  for (const x of items) { r -= x.w; if (r <= 0) return x.n; }
  return items[items.length - 1].n;
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const scenariosOf = (mode: Mode): RangeScenario[] => RANGE_SCENARIOS.filter((s) => CHART_GROUPS[mode]?.includes(s.group));
const nashFreq = (kind: 'shove' | 'callBB' | 'callSB', k: number, stack: number): FreqMap => freqFromArray(nashRange(kind, k, stack, false), HAND_ORDER);

/** 차트 스팟 1개의 액션별 FreqMap + continue 합(샘플링용 — 3벳 0.5 + 콜 0.5 는 continue 1) */
function chartFreqs(scen: RangeScenario): { acts: { label: string; freq: FreqMap }[]; total: FreqMap } {
  const acts = scen.actions.map((a) => ({ label: a.label, freq: buildFreq(a.spec) }));
  const total: FreqMap = new Map();
  for (const a of acts) for (const [h, f] of a.freq) total.set(h, (total.get(h) ?? 0) + f);
  return { acts, total };
}
/** 상대 사이즈 — 데이터 서술 기준 오픈 2.5bb(SB 3bb)·3벳 ≈ 8bb. AI 해설 문맥용 근사이며 채점에는 쓰지 않는다.
 *  vs 3벳 스팟 일부는 상대가 특정되지 않는다('LJ vs 3벳') — 그래도 '첫 진입'으로 읽히면 안 되므로 상대를 비워 두지 않는다. */
function vsOf(scen: RangeScenario): Quiz['vs'] {
  if (scen.group === 'vs3bet') return { label: scen.vs ?? '뒤 포지션', bb: 8 };
  return scen.vs ? { label: scen.vs, bb: scen.vs === 'SB' ? 3 : 2.5 } : undefined;
}

function chartQuiz(mode: Mode, scen: RangeScenario, hand: string): Quiz {
  return {
    mode, key: `${KEY_PREFIX[mode]}|${scen.id}|${hand}`, posLabel: scen.label,
    situ: mode === 'rfi' ? '100bb · 첫 진입' : scen.desc,
    hand, cards: labelToCards(hand), stackBb: 100, vs: vsOf(scen),
    acts: chartFreqs(scen).acts.map((a) => ({ label: a.label, freq: a.freq.get(hand) ?? 0 })),
  };
}
function pushQuiz(k: number, stack: number, hand: string): Quiz | null {
  const p = PUSH_POS.find((x) => x.k === k);
  if (!p) return null;
  return {
    mode: 'push', key: `push|${k}-${stack}|${hand}`, posLabel: p.label, situ: `${stack}bb · 첫 진입`,
    hand, cards: labelToCards(hand), stackBb: stack, acts: [{ label: '올인', freq: nashFreq('shove', k, stack).get(hand) ?? 0 }],
  };
}
function callQuiz(seatId: string, k: number, stack: number, hand: string): Quiz | null {
  const seat = CALL_SEATS.find((s) => s.id === seatId);
  const shover = PUSH_POS.find((x) => x.k === k);
  if (!seat || !shover || k < seat.minK) return null;
  return {
    mode: 'call', key: `call|${seat.id}-${k}-${stack}|${hand}`, posLabel: seat.label, situ: `${stack}bb · ${shover.label} 올인`,
    hand, cards: labelToCards(hand), stackBb: stack, vs: { label: shover.label, bb: stack },
    acts: [{ label: '콜', freq: nashFreq(seat.kind, k, stack).get(hand) ?? 0 }],
  };
}

/** 키가 가리키는 모드. 형식이 깨졌으면 null. */
export function modeOfKey(key: string): Mode | null {
  const p = key.split('|')[0];
  return (Object.keys(KEY_PREFIX) as Mode[]).find((m) => KEY_PREFIX[m] === p) ?? null;
}

/**
 * 문제 1건 생성. retryKey 를 주면 **그 문제를 그대로 복원**한다(오답 재출제·드릴 편성 보존).
 * 복원 실패(차트 개편으로 시나리오가 사라진 경우 등)면 조용히 새 문제를 뽑는다.
 */
export function makeQuiz(mode: Mode, retryKey?: string): Quiz {
  if (retryKey) {
    const [, situ = '', hand = ''] = retryKey.split('|');
    const m = modeOfKey(retryKey);
    let q: Quiz | null = null;
    if (m === 'push') { const [k, stack] = situ.split('-').map(Number); q = pushQuiz(k, stack, hand); }
    else if (m === 'call') { const [seat, k, stack] = situ.split('-'); q = callQuiz(seat, Number(k), Number(stack), hand); }
    else if (m) { const scen = scenariosOf(m).find((s) => s.id === situ); q = scen ? chartQuiz(m, scen, hand) : null; }
    if (q && q.key === retryKey) return q;
  }
  if (mode === 'push') {
    const k = pick(PUSH_POS).k, stack = pick(PUSH_STACKS);
    return pushQuiz(k, stack, weightedPick(nashFreq('shove', k, stack)))!;
  }
  if (mode === 'call') {
    const seat = pick(CALL_SEATS);
    const k = pick(PUSH_POS.filter((p) => p.k >= seat.minK)).k, stack = pick(PUSH_STACKS);
    return callQuiz(seat.id, k, stack, weightedPick(nashFreq(seat.kind, k, stack)))!;
  }
  const scen = pick(scenariosOf(mode));
  return chartQuiz(mode, scen, weightedPick(chartFreqs(scen).total));
}

export const foldFreq = (q: Quiz): number => Math.max(0, 1 - q.acts.reduce((s, a) => s + a.freq, 0));
const freqOf = (q: Quiz, chose: string): number => (chose === FOLD ? foldFreq(q) : q.acts.find((a) => a.label === chose)?.freq ?? 0);

/** 채점 — 고른 선택지의 빈도가 25% 이상이면 정답(혼합은 어느 쪽이든 정답). 폴드 빈도 = 1 − Σ액션. */
export const gradePreflop = (q: Quiz, chose: string): boolean => freqOf(q, chose) >= 0.25;

/** 권장 액션 문구 — '오픈' / '혼합 (3벳 50% · 콜 50%)' / '폴드' */
export function verdictOf(q: Quiz): string {
  const main = q.acts.find((a) => a.freq >= 0.75);
  if (main) return main.label;
  if (foldFreq(q) > 0.75) return FOLD; // 폴드 정확히 75%(액션 25%)는 둘 다 정답인 혼합 구간 — 기존 규칙과 동일
  return `혼합 (${q.acts.filter((a) => a.freq > 0).map((a) => `${a.label} ${Math.round(a.freq * 100)}%`).join(' · ')})`;
}

/**
 * 오답 노트에 보여 줄 '내 답' — 큐에는 키만 있고 무엇을 골랐는지는 저장돼 있지 않다.
 * 오답은 빈도 25% 미만인 선택지에서만 나므로, 그런 선택지가 **하나뿐이면** 그것이 곧 내 답이다.
 * 둘 이상(3택에서 둘이 같이 틀리는 스팟)이거나 없으면(혼합) null.
 */
export function wrongPickOf(q: Quiz): string | null {
  const wrong = [...q.acts, { label: FOLD, freq: foldFreq(q) }].filter((c) => c.freq < 0.25);
  return wrong.length === 1 ? wrong[0].label : null;
}

/* 기록(localStorage) — 키·형태 기존 그대로(마이그레이션 0). wrong = 오답 재출제 큐(최근 40개). */
export interface PreflopStats { total: number; correct: number; streak: number; best: number; wrong: string[] }
export const PREFLOP_STAT_KEY = 'nuri:trainer:preflop:v2';
export const EMPTY_PREFLOP_STATS: PreflopStats = { total: 0, correct: 0, streak: 0, best: 0, wrong: [] };

export const loadPreflopStats = (): PreflopStats => {
  try { return { ...EMPTY_PREFLOP_STATS, wrong: [], ...JSON.parse(localStorage.getItem(PREFLOP_STAT_KEY) || '{}') }; }
  catch { return { ...EMPTY_PREFLOP_STATS, wrong: [] }; }
};
export const savePreflopStats = (s: PreflopStats): void => {
  try { localStorage.setItem(PREFLOP_STAT_KEY, JSON.stringify(s)); } catch { /* quota */ }
};

/**
 * 답 1건을 기록에 반영한 다음 상태를 만든다(순수 함수 — 저장은 호출부).
 * 정답이면 오답 큐에서 빼고, 오답이면 큐 맨 뒤로(중복 없이) 넣는다. 트레이너·드릴 공용.
 */
export function applyPreflopAnswer(s: PreflopStats, key: string, correct: boolean): PreflopStats {
  const streak = correct ? s.streak + 1 : 0;
  const rest = s.wrong.filter((k) => k !== key);
  return {
    total: s.total + 1,
    correct: s.correct + (correct ? 1 : 0),
    streak,
    best: Math.max(s.best, streak),
    wrong: correct ? rest : [...rest, key].slice(-40),
  };
}
