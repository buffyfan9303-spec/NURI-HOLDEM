// 스타팅 핸드 순위 — **정확 전수** 재산출(2026-09-25 gto-team). scripts/gen-starting-hand-rank.mjs(몬테카를로 100만회)를 대체한다.
// 무작위 한 손 상대 승률 = Σ_x N[h][x]·E[h][x] / 1225 — E 는 equity169-exact.mjs 의 전수 행렬(보드 C(48,5) 전부),
// N[h][x] 는 h 의 콤보 하나를 알 때 x 의 합법 콤보 수(합 1225). 무작위 상대라 무늬 대칭이고 대표 콤보 하나가 곧 그 핸드의 값이다.
// 옛 몬테카를로 값과의 차: 최대 0.10%p, 순위 자리 32칸이 바뀐다(표준오차 0.05%p 안쪽 이웃끼리).
// 실행(저장소 루트):
//   node scripts/gen-nash/equity169-exact.mjs /tmp/eq-exact.json
//   node scripts/gen-nash/starting-hand-exact.mjs /tmp/eq-exact.json src/components/features/tools/startingHandRank.data.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { combosOf } from './exactpair.mjs';

const [, , eqFile, outFile] = process.argv;
const EQ = JSON.parse(readFileSync(eqFile, 'utf-8'));
if (EQ.iterations !== 'exact') throw new Error('정확 전수 행렬이 아니다: ' + EQ.iterations);
const o = EQ.order; const n = 169; const CO = o.map(combosOf);
const rows = o.map((h, i) => {
  const a = CO[i][0]; let s = 0; let w = 0;
  for (let x = 0; x < n; x++) {
    let c = 0; for (const b of CO[x]) if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) c++;
    s += c * EQ.matrix[i * n + x]; w += c;
  }
  if (w !== 1225) throw new Error(`${h}: 합법 콤보 ${w}`);
  return [h, (s / w) * 100];
}).sort((x, y) => y[1] - x[1]);
const src = `// 자동 생성 — 손으로 고치지 마라. 생성기: scripts/gen-nash/starting-hand-exact.mjs (정확 전수, 2026-09-25)
// 스타팅 핸드 169개 — **무작위 한 손(헤즈업) 상대 프리플랍 올인 승률**(무승부는 1/2), 강한 순서.
// 계산: 169×169 에퀴티를 보드 C(48,5) 전부로 센 값(equity169-exact.mjs)을 카드 제거 가중으로 평균 — 표본오차 0.
//   (2026-09-23 첫 판은 몬테카를로 100만회/핸드였다 — 최대 0.10%p 어긋나 순위 32자리가 뒤섞여 있었다.)
// 표시는 소수 둘째 자리 반올림. 반올림 뒤 같은 값인 이웃은 정확값 순서대로 둔다.
// 검산: startingHandRank.data.test.ts (공표 기준값과 대조).

/** [핸드, 승률 %] — 강한 순서(1위가 첫 줄). */
export const STARTING_HAND_EQUITY: readonly (readonly [string, number])[] = [
${rows.map(([h, v]) => `  ['${h}', ${v.toFixed(2)}],`).join('\n')}
];
`;
writeFileSync(outFile, src.replace(/\n/g, '\r\n'));
console.log(`wrote ${rows.length} rows → ${outFile} · ${rows.slice(0, 3).map(([h, v]) => `${h} ${v.toFixed(3)}`).join(' | ')} … ${rows.slice(-2).map(([h, v]) => `${h} ${v.toFixed(3)}`).join(' | ')}`);
