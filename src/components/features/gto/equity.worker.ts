// [DS] MO-9C — 에퀴티 계산 전용 Web Worker.
// setTimeout(0) 체인은 프레임 사이 양보만 할 뿐 실행 자체는 메인스레드 롱태스크였다.
// Vite 네이티브 워커 문법(new Worker(new URL(...), {type:'module'}))이라 의존성 0.
// 엔진(equityEngine.ts)은 순수 모듈 그대로 재사용 — 계산 결과는 동기 경로와 동일.
import {
  computeEquity, computeEquityVsRange, computeRangeVsRange, computeOuts,
  type WeightedCombo,
} from './equityEngine';
import type { Card } from './gto.types';

export type EquityJob =
  | { id: number; kind: 'equity'; hero: [Card, Card]; villain: [Card, Card]; board: Card[]; iterations?: number }
  | { id: number; kind: 'vsRange'; hero: [Card, Card]; range: WeightedCombo[]; board: Card[]; iterations?: number }
  | { id: number; kind: 'rangeVsRange'; heroRange: WeightedCombo[]; villainRange: WeightedCombo[]; board: Card[]; iterations?: number }
  | { id: number; kind: 'outs'; hero: [Card, Card]; villain: [Card, Card]; board: Card[] };

self.onmessage = (e: MessageEvent<EquityJob>) => {
  const job = e.data;
  let result: unknown;
  switch (job.kind) {
    case 'equity': result = computeEquity(job.hero, job.villain, job.board, job.iterations); break;
    case 'vsRange': result = computeEquityVsRange(job.hero, job.range, job.board, job.iterations); break;
    case 'rangeVsRange': result = computeRangeVsRange(job.heroRange, job.villainRange, job.board, job.iterations); break;
    case 'outs': result = computeOuts(job.hero, job.villain, job.board); break;
  }
  (self as unknown as Worker).postMessage({ id: job.id, result });
};
