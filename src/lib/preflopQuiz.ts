// src/lib/preflopQuiz.ts
// 프리플랍 트레이너 문제 생성·채점 — 트레이너와 '오늘의 드릴'이 함께 쓰는 단일 소스.
//
// 왜 분리했나(2026-08-29): 드릴이 "PreflopTrainer 의 오답 재출제 큐"를 그대로 이어받아야 하는데,
//   문제 생성기(makeQuiz)와 오답 큐(localStorage)가 컴포넌트 안에 갇혀 있었다. 로직만 꺼냈고
//   채점 규칙·키 포맷·저장 키는 **한 글자도 바꾸지 않았다**(기존 기록 그대로 이어짐).
//
// 설계 배경(구 PreflopTrainer 주석 유지):
//  ① 균등 샘플이면 UTG 문제의 86%가 자명한 폴드 → 경계(혼합·경계 인접) 집중 샘플링
//  ② 통계가 state 뿐이면 새로고침에 소멸 → localStorage 영속 + 오답 재출제 큐
//  ③ 채점 근거는 Chen 근사가 아니라 가이드와 동일한 표준 차트/Nash 데이터
import { labelToCards, type Card } from './preflop';
import { buildFreq, gridName, freqFromArray, type FreqMap } from './ranges';
import { RANGE_SCENARIOS } from './ranges.data';
import { HAND_ORDER, nashRange } from './nash.data';

export type Mode = 'rfi' | 'push';

export const PUSH_POS: { k: number; label: string }[] = [
  { k: 8, label: 'UTG(9인)' }, { k: 6, label: 'UTG+2' }, { k: 5, label: 'LJ' }, { k: 4, label: 'HJ' },
  { k: 3, label: 'CO' }, { k: 2, label: 'BTN' }, { k: 1, label: 'SB' },
];
export const PUSH_STACKS = [5, 7, 8, 10, 12, 15]; // 실전 빈발 구간

export interface Quiz {
  mode: Mode;
  key: string; // 오답 재출제 식별자 — 'rfi|<scenarioId>|<hand>' | 'push|<k>-<stack>|<hand>'
  posLabel: string;
  situ: string; // 상황 설명(스택 등)
  hand: string;
  cards: [Card, Card];
  freq: number; // 정답 액션(오픈/올인) 빈도 0..1
  actionLabel: string; // '오픈' | '올인'
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

const RFI_LIST = RANGE_SCENARIOS.filter((s) => s.group === 'rfi6' || s.group === 'rfi9');
const rfiFreq = (id: string): FreqMap => buildFreq(RFI_LIST.find((s) => s.id === id)!.actions[0].spec);
const pushFreq = (k: number, stack: number): FreqMap => freqFromArray(nashRange('shove', k, stack, false), HAND_ORDER);

/** 키가 가리키는 모드('rfi'|'push'). 형식이 깨졌으면 null. */
export function modeOfKey(key: string): Mode | null {
  const m = key.split('|')[0];
  return m === 'rfi' || m === 'push' ? m : null;
}

/**
 * 문제 1건 생성. retryKey 를 주면 **그 문제를 그대로 복원**한다(오답 재출제·드릴 편성 보존).
 * 복원 실패(차트 개편으로 시나리오가 사라진 경우 등)면 조용히 새 문제를 뽑는다.
 */
export function makeQuiz(mode: Mode, retryKey?: string): Quiz {
  if (retryKey) {
    const [m, situ, hand] = retryKey.split('|');
    if (m === 'rfi') {
      const scen = RFI_LIST.find((s) => s.id === situ);
      if (scen) return { mode: 'rfi', key: retryKey, posLabel: scen.label, situ: '100bb · 첫 진입', hand, cards: labelToCards(hand), freq: rfiFreq(situ).get(hand) ?? 0, actionLabel: '오픈' };
    } else {
      const [k, stack] = situ.split('-').map(Number);
      const p = PUSH_POS.find((x) => x.k === k);
      if (p) return { mode: 'push', key: retryKey, posLabel: p.label, situ: `${stack}bb · 첫 진입`, hand, cards: labelToCards(hand), freq: pushFreq(k, stack).get(hand) ?? 0, actionLabel: '올인' };
    }
  }
  if (mode === 'rfi') {
    const scen = RFI_LIST[Math.floor(Math.random() * RFI_LIST.length)];
    const freq = rfiFreq(scen.id);
    const hand = weightedPick(freq);
    return { mode, key: `rfi|${scen.id}|${hand}`, posLabel: scen.label, situ: '100bb · 첫 진입', hand, cards: labelToCards(hand), freq: freq.get(hand) ?? 0, actionLabel: '오픈' };
  }
  const p = PUSH_POS[Math.floor(Math.random() * PUSH_POS.length)];
  const stack = PUSH_STACKS[Math.floor(Math.random() * PUSH_STACKS.length)];
  const freq = pushFreq(p.k, stack);
  const hand = weightedPick(freq);
  return { mode, key: `push|${p.k}-${stack}|${hand}`, posLabel: p.label, situ: `${stack}bb · 첫 진입`, hand, cards: labelToCards(hand), freq: freq.get(hand) ?? 0, actionLabel: '올인' };
}

/** 채점 — 혼합(25~75%)은 어느 쪽이든 정답. 순수 구간에서만 갈린다(GTO Wizard 류 표준 채점의 단순화). */
export const gradePreflop = (freq: number, chose: 'act' | 'fold'): boolean =>
  chose === 'act' ? freq >= 0.25 : freq <= 0.75;

/** 권장 액션 문구 — '오픈' / '혼합 (오픈 42%)' / '폴드' */
export const verdictOf = (q: Quiz): string =>
  q.freq >= 0.75 ? q.actionLabel : q.freq >= 0.25 ? `혼합 (${q.actionLabel} ${Math.round(q.freq * 100)}%)` : '폴드';

/**
 * 오답 노트에 보여 줄 '내 답' — 큐에는 키만 있고 무엇을 골랐는지는 저장돼 있지 않다.
 * 그러나 오답은 순수 구간에서만 생기므로(gradePreflop: 혼합 25~75% 는 어느 쪽이든 정답)
 * 권장의 반대가 곧 내 답이다. 혼합 구간(오답이 날 수 없는 문제)이면 null.
 */
export const wrongPickOf = (q: Quiz): string | null =>
  q.freq >= 0.75 ? '폴드' : q.freq <= 0.25 ? q.actionLabel : null;

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
