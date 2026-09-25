// ICM 계산기 '판정 예시' 벤치 승률(src/lib/icm.ts BENCH_EQUITY) — **정확 전수** 재산출(2026-09-25 gto-team).
// 대표 콤보 1개 vs 올인 레인지(SHOVE_RANGES 표기) 전 콤보 × 보드 C(48,5) 전부. 레인지가 무늬 대칭이라 대표 콤보 하나가 곧 그 핸드의 값이다.
// 옛 값(엔진 몬테카를로 6만회)은 '±0.2%p' 라 적혀 있었는데 실제 차는 최대 0.5%p(wide JJ 69.5 → 70.0)였다.
// 실행(저장소 루트): node scripts/gen-nash/icm-bench-exact.mjs   (≈2분) → 둘째 열(소수 첫째 자리)을 BENCH_EQUITY 에 옮긴다.
// ⚠ SHOVE_RANGES 표기를 바꾸면 여기 ranges 도 같이 바꾸고 다시 돌려라(두 벌 — icm.test.ts 가 콤보 % 를 대조한다).
import { exactPair, combosOf } from './exactpair.mjs';
const R = '23456789TJQKA';
const ranges = {
  tight: '66+, A9s+, KJs+, QJs, AJo+, KQo',
  mid: '22+, A2s+, K8s+, Q9s+, J9s+, T9s, 98s, A8o+, KTo+, QTo+, JTo',
  wide: '22+, A2s+, K4s+, Q7s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K8o+, Q9o+, J9o+, T9o',
};
function expand(str) {
  const out = new Set();
  for (const t0 of str.split(',').map((s) => s.trim())) {
    const plus = t0.endsWith('+'); const t = plus ? t0.slice(0, -1) : t0;
    const a = R.indexOf(t[0]), b = R.indexOf(t[1]);
    if (a === b) { for (let r = a; r <= (plus ? 12 : a); r++) out.add(R[r] + R[r]); }
    else { for (let r = b; r <= (plus ? a - 1 : b); r++) out.add(R[a] + R[r] + t[2]); }
  }
  return [...out];
}
const BENCH = ['AA', 'QQ', 'JJ', 'TT', 'AKo', '99', 'AQo', '88', 'AJo', '77', '55', 'A5s', 'KQo', '22'];
for (const [id, s] of Object.entries(ranges)) {
  const hands = expand(s); const combos = hands.flatMap(combosOf);
  const row = [];
  for (const h of BENCH) {
    const [a0, a1] = combosOf(h)[0];
    let w = 0, t = 0, n = 0;
    for (const [b0, b1] of combos) { if (b0 === a0 || b0 === a1 || b1 === a0 || b1 === a1) continue; const r = exactPair(a0, a1, b0, b1); w += r[0]; t += r[1]; n += r[2]; }
    row.push(((w + t / 2) / n) * 100);
  }
  console.log(id, (combos.length / 1326 * 100).toFixed(2) + '%', combos.length, JSON.stringify(row.map((x) => Math.round(x * 10) / 10)), JSON.stringify(row.map((x) => +x.toFixed(3))));
}
