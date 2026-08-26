// [DS] MO-9C — 에퀴티 워커 클라이언트.
// 워커 1개를 지연 생성해 요청을 id 로 짝짓는다. 워커 생성 실패·런타임 사망 시
// 기존 동기 엔진으로 폴백(결과 동일, 성능만 이전 수준) — 기능 회귀 0 원칙.
import {
  computeEquity, computeEquityVsRange, computeRangeVsRange, computeOuts,
  type EquityResult, type OutsResult, type WeightedCombo,
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

export function equityAsync(hero: [Card, Card], villain: [Card, Card], board: Card[], iterations?: number): Promise<EquityResult> {
  return post({ kind: 'equity', hero, villain, board, iterations },
    () => computeEquity(hero, villain, board, iterations));
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
