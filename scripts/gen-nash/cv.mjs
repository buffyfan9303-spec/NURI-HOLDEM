// 표본 밖 교차 검증 착취가능도 — solve-deal.mjs 산출 전략이 '실제 게임' 에서 얼마나 착취당하는가. 2026-10-02 gto-team (N7).
// 실행: node scripts/gen-nash/cv.mjs <solved.json> <evalA.json> <evalB.json>
//   evalA/B = 같은 전략을 서로 다른 salt 의 새 딜에서 잰 것(EVAL_JSON=<solved.json> node solve-deal.mjs <evalX.json> <M> 0 <jobs> <salt>).
// 정의: 선수 j 의 정보집합(전체 게임 = 앞 콜 마스크)마다 A 표본에서 최선응답을 고르고(u_A>0 → 콜/셔브), B 표본의 u_B 로 이득을 잰다.
//   ε_cv(j) = Σ (BR_A − σ)·u_B. A·B 를 바꿔 한 번 더 재고 평균한다. 단위 = '히어로까지 폴드된 판' 1회당 bb.
//   같은 표본으로 고르고 재면(solve-deal 의 ε전체) 잡음 max(0,u) 가 이득으로 잡혀 부풀려진다 — 이 값이 정직한 쪽이다.
//   표본 잡음이 BR 선택을 흐리므로 진짜 착취가능도의 **하한 쪽 추정**이다(선택이 정확할수록 커진다). 보고에 그렇게 적는다.
import { readFileSync } from 'node:fs';
const [, , solvedF, aF, bF] = process.argv;
const solved = JSON.parse(readFileSync(solvedF, 'utf-8')); const A = JSON.parse(readFileSync(aF, 'utf-8')).res; const B = JSON.parse(readFileSync(bF, 'utf-8')).res;
const n = 169; const full = solved.info === 'full'; const CMAX = solved.cmax;
const rows = [];
for (const [key, r] of Object.entries(solved.res)) {
  const ua = A[key]?.uFull, ub = B[key]?.uFull; if (!ua || !ub) { rows.push([key, 'eval 없음']); continue; }
  const per = [];
  for (let j = 0; j < r.strat.length; j++) {
    let g = 0;
    const cells = ua[j].length / n;
    for (let mk = 0; mk < cells; mk++) {
      let c = 0; for (let b = mk; b; b &= b - 1) c++; c = c < CMAX ? c : CMAX;
      for (let h = 0; h < n; h++) {
        const sg = j === 0 ? r.strat[0][h] : r.strat[j][(full ? mk : c) * n + h];
        const i = mk * n + h;
        g += 0.5 * (((ua[j][i] > 0 ? 1 : 0) - sg) * ub[j][i] + ((ub[j][i] > 0 ? 1 : 0) - sg) * ua[j][i]);
      }
    }
    per.push(g);
  }
  // 게시 표는 0~8 단계로 반올림한다 — 게시되는 세 칸(히어로 셔브 · BB 의 '앞 전원 폴드' · SB 의 '앞 전원 폴드')의 반올림 손실(판당 bb).
  const q8 = (f) => Math.round(f * 8) / 8; let qLoss = 0; const k = r.strat.length - 1;
  for (const j of k >= 2 ? [0, k - 1, k] : [0, k]) for (let h = 0; h < n; h++) {
    const sg = r.strat[j][h]; const u = 0.5 * (ua[j][h] + ub[j][h]);   // 마스크 0 = 앞 전원 폴드(히어로 제외) — count·full 둘 다 첫 n 칸
    qLoss += (sg - q8(sg)) * u;
  }
  rows.push([key, per.reduce((x, y) => x + y, 0), Math.max(...per), per, qLoss]);
}
console.log('표	ε_cv 합(bb/판)	최대 선수	히어로(셔브 표)	8단 반올림 손실	선수별');
for (const [key, t, mx, per, ql] of rows.sort((x, y) => String(x[0]).localeCompare(String(y[0])))) console.log(typeof t === 'number' ? `${key}	${t.toExponential(2)}	${mx.toExponential(2)}	${per[0].toExponential(2)}	${ql.toExponential(1)}	${per.map((x) => x.toExponential(1)).join(' ')}` : `${key}	${t}`);
