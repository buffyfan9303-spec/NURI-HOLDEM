// [DS] MO-9C — 에퀴티 워커 클라이언트.
// 워커 1개를 지연 생성해 요청을 id 로 짝짓는다. 워커 생성 실패·런타임 사망 시
// 기존 동기 엔진으로 폴백(결과 동일, 성능만 이전 수준) — 기능 회귀 0 원칙.
import {
  computeEquity, computeEquityVsRange, computeRangeVsRange, computeOuts, computeEquityMulti,
  type EquityResult, type OutsResult, type WeightedCombo, type MultiEquityResult,
} from './equityEngine';
import type { Card } from './gto.types';

type Pending = { resolve: (r: unknown) => void; fallback: () => unknown };

let worker: Worker | null | undefined; // undefined = 미시도, null = 사용 불가(동기 폴백)
const pending = new Map<number, Pending>();
let seq = 0;

function killWorker() {
  // 워커 사망 — 대기 중인 요청은 동기 엔진으로 즉시 완결하고 이후 호출은 폴백 경로
  try { worker?.terminate(); } catch { /* noop */ }
  worker = null;
  for (const p of pending.values()) p.resolve(p.fallback());
  pending.clear();
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./equity.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
      const p = pending.get(e.data.id);
      if (p) { pending.delete(e.data.id); p.resolve(e.data.result); }
    };
    worker.onerror = killWorker;
  } catch {
    worker = null;
  }
  return worker;
}

function post<T>(msg: Record<string, unknown>, fallback: () => T): Promise<T> {
  const w = getWorker();
  if (!w) return Promise.resolve(fallback());
  const id = ++seq;
  return new Promise<T>((resolve) => {
    pending.set(id, { resolve: resolve as (r: unknown) => void, fallback });
    w.postMessage({ id, ...msg });
  });
}

/** 2인 전수 결과 캐시 — 값이 입력의 순수 함수라 다시 열 때 다시 돌 이유가 없다(프리플랍 1회 ≈ 0.3s · 저가폰 수 초). */
const equityCache = new Map<string, Promise<EquityResult>>();
const EQUITY_CACHE_MAX = 200;
const cardsKey = (cs: readonly Card[]) => cs.map((c) => c.rank + c.suit).join('');

/** 2인 카드 대 카드 — 항상 전수(같은 입력 = 같은 값). 프리플랍은 1,712,304 보드라 워커에서 돈다. */
export function equityAsync(hero: [Card, Card], villain: [Card, Card], board: Card[]): Promise<EquityResult> {
  const key = `${cardsKey(hero)}/${cardsKey(villain)}/${cardsKey(board)}`;
  const hit = equityCache.get(key);
  if (hit) return hit;
  const p = post({ kind: 'equity', hero, villain, board }, () => computeEquity(hero, villain, board));
  if (equityCache.size >= EQUITY_CACHE_MAX) equityCache.delete(equityCache.keys().next().value as string);
  equityCache.set(key, p);
  return p;
}

/** 워커 없는 기기(생성 실패·사망)에서 동기 폴백이 메인스레드를 잡는 시간 상한 — 6인 10,000회는 1.3s 라 낮춘다. */
export const MULTI_FALLBACK_ITERATIONS = 2500;

/**
 * 멀티웨이(빌런 A~E). 워커가 없으면 **시행수를 낮춘** 동기 폴백 — 결과 모양은 같고 오차만 커진다
 * (호출부는 `iterations` 로 표본 수를 화면에 적으니 거짓말이 되지 않는다).
 */
export function equityMultiAsync(hero: [Card, Card], villains: Card[][], board: Card[], iterations?: number): Promise<MultiEquityResult> {
  return post({ kind: 'multi', hero, villains, board, iterations },
    () => computeEquityMulti(hero, villains, board, Math.min(iterations ?? MULTI_FALLBACK_ITERATIONS, MULTI_FALLBACK_ITERATIONS)));
}

export function equityVsRangeAsync(hero: [Card, Card], range: WeightedCombo[], board: Card[], iterations?: number): Promise<EquityResult> {
  return post({ kind: 'vsRange', hero, range, board, iterations },
    () => computeEquityVsRange(hero, range, board, iterations));
}

export function rangeVsRangeAsync(heroRange: WeightedCombo[], villainRange: WeightedCombo[], board: Card[], iterations?: number): Promise<EquityResult> {
  return post({ kind: 'rangeVsRange', heroRange, villainRange, board, iterations },
    () => computeRangeVsRange(heroRange, villainRange, board, iterations));
}

export function outsAsync(hero: [Card, Card], villain: [Card, Card], board: Card[]): Promise<OutsResult | null> {
  return post({ kind: 'outs', hero, villain, board },
    () => computeOuts(hero, villain, board));
}
