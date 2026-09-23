// 스타팅 핸드 순위 생성기 (2026-09-23, 오너 요청 RULES-STARTING-HAND-RANK)
// 169개 시작 핸드의 **무작위 한 손(헤즈업) 상대 프리플랍 올인 승률(무승부 1/2)** 을 계산해
// src/components/features/tools/startingHandRank.data.ts 를 다시 쓴다.
//
// 계산은 새로 짜지 않는다 — 앱의 에퀴티 엔진 `computeEquityVsRange` 를 그대로 부른다(단일 출처).
//   · 빌런 레인지 = 1326콤보 전부 가중 1 → 엔진이 히어로 카드와 겹치는 콤보를 빼므로 남은 1225콤보에서 균등 = '무작위 한 손'
//   · 보드 5장은 엔진이 남은 덱에서 뽑는다. seed = 핸드 번호 + 1 → 같은 인자면 같은 결과(결정적)
//   · 대표 카드: 페어 AsAh · 수딧 AsKs · 오프 AsKh. 상대가 무작위라 무늬 대칭이고, 대표 하나가 곧 그 핸드의 값이다.
// 정확 열거가 아닌 이유: 핸드 하나에 (상대 1225 × 보드 C(48,5)=1,712,304) ≈ 21억 판 × 169 — 이 평가기로는 수 일이다.
// 표본 n 회의 표준오차 ≈ 0.5/√n (n=1,000,000 → 0.05%p). 검산 기준값은 startingHandRank.data.test.ts.
//
// 실행(저장소 루트): node scripts/gen-starting-hand-rank.mjs [iterations=1000000]
//   12코어(worker 11개) 1,000,000회 ≈ 수 분. 결과 파일은 CRLF 로 쓴다(작업트리 관례).
import { registerHooks } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

// 앱 소스는 확장자 없는 import('./gto.types') 를 쓴다 — Node 타입 제거 실행에서 .ts 를 붙여 풀어 준다.
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) {
      if (spec.startsWith('.') && !spec.endsWith('.ts')) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const ENGINE = new URL('../src/components/features/gto/equityEngine.ts', import.meta.url);
const OUT = new URL('../src/components/features/tools/startingHandRank.data.ts', import.meta.url);
const R = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/** 169개 이름 — 격자 순서(행 i·열 j: i==j 페어, i<j 수딧, i>j 오프). src/lib/ranges.ts gridName 과 같은 규칙. */
function hands() {
  const out = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    if (i === j) out.push(R[i] + R[j]);
    else if (i < j) out.push(`${R[i]}${R[j]}s`);
    else if (i > j) out.push(`${R[j]}${R[i]}o`);
  }
  return out;
}
const card = (rank, suit) => ({ rank, suit });
function rep(name) {
  const a = name[0]; const b = name[1];
  if (name.length === 2) return [card(a, 's'), card(a, 'h')];
  return name[2] === 's' ? [card(a, 's'), card(b, 's')] : [card(a, 's'), card(b, 'h')];
}

if (isMainThread) {
  const iters = Number(process.argv[2] ?? 1_000_000);
  const names = hands();
  const nWorkers = Math.max(1, Math.min(os.cpus().length - 1, names.length));
  const t0 = Date.now();
  const eq = new Map();
  const jobs = names.map((h, idx) => ({ h, idx }));
  await Promise.all(Array.from({ length: nWorkers }, (_, w) => new Promise((res, rej) => {
    const slice = jobs.filter((_, k) => k % nWorkers === w);
    const wk = new Worker(new URL(import.meta.url), { workerData: { slice, iters } });
    wk.on('message', ({ h, v }) => { eq.set(h, v); if (eq.size % 20 === 0) console.log(`${eq.size}/169 · ${Math.round((Date.now() - t0) / 1000)}s`); });
    wk.on('error', rej);
    wk.on('exit', res);
  })));
  if (eq.size !== 169) throw new Error(`169개가 아니다: ${eq.size}`);
  const sorted = [...eq.entries()].sort((x, y) => y[1] - x[1]);
  const se = (0.5 / Math.sqrt(iters)) * 100;
  const rows = sorted.map(([h, v]) => `  ['${h}', ${(v * 100).toFixed(2)}],`).join('\n');
  const src = `// 자동 생성 — 손으로 고치지 마라. 생성기: scripts/gen-starting-hand-rank.mjs (${iters.toLocaleString('en-US')}회/핸드, seed=격자번호+1)
// 스타팅 핸드 169개 — **무작위 한 손(헤즈업) 상대 프리플랍 올인 승률**(무승부는 1/2), 강한 순서.
// 계산: 앱 에퀴티 엔진 computeEquityVsRange(빌런 = 1326콤보 균등) 몬테카를로. 표준오차 ≈ ${se.toFixed(2)}%p.
// 순위는 이 값의 내림차순이다 — 값 차이가 표준오차 몇 배 안쪽인 이웃 핸드는 순서가 바뀔 수 있다(실전 의미 없음).
// 검산: startingHandRank.data.test.ts (공표 기준값과 대조).

/** [핸드, 승률 %] — 강한 순서(1위가 첫 줄). */
export const STARTING_HAND_EQUITY: readonly (readonly [string, number])[] = [
${rows}
];

export const STARTING_HAND_ITERATIONS = ${iters};
`;
  writeFileSync(OUT, src.replace(/\n/g, '\r\n'));
  console.log(`done 169 hands in ${Math.round((Date.now() - t0) / 1000)}s → ${OUT.pathname}`);
  console.log(sorted.slice(0, 5).map(([h, v]) => `${h} ${(v * 100).toFixed(2)}`).join(' | '), ' … ', sorted.slice(-3).map(([h, v]) => `${h} ${(v * 100).toFixed(2)}`).join(' | '));
} else {
  const { computeEquityVsRange } = await import(ENGINE.href);
  const { RANKS, SUITS } = await import(new URL('../src/components/features/gto/gto.types.ts', import.meta.url).href);
  const deck = RANKS.flatMap((r) => SUITS.map((s) => card(r, s)));
  const random = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) random.push({ cards: [deck[a], deck[b]], weight: 1 });
  const { slice, iters } = workerData;
  for (const { h, idx } of slice) {
    const r = computeEquityVsRange(rep(h), random, [], iters, idx + 1);
    if (r.kind !== 'monte_carlo' || r.accepted !== iters) throw new Error(`${h}: ${r.kind} ${r.accepted}`);
    parentPort.postMessage({ h, v: r.hero });
  }
}
