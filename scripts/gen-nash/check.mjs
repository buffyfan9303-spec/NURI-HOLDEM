// 통과 기준 검사 — 산출 표(solved.json)에 대해: ① 단조성 ② 경계 연속 ③ 상식 ④ (수렴은 converge.mjs)
// 실행: node check.mjs <solved.json> [ante=1]
import { readFileSync } from 'node:fs';

const S = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
const anteKey = (process.argv[3] ?? '1') === '1' ? 'ante' : 'no';
// argv[5] = 검사할 최소 깊이. 2026-09-19 리드 최종 결정: **k≥2 는 12bb 이상만 게시**(단일 콜러 근사가 성립하는
//   신뢰도 지점 — P(2명+ 콜) k8 기준 12bb 11.8% ≈ 검증된 노앤티 7bb 의 13.5%) · **k=1 은 전 깊이 게시**.
//   그래서 k≥2 만 볼 때는 12 를 주고, k=1 을 함께 볼 때는 2 를 준다(기본 2). 전 구간을 보려면 2.
const MIN_STACK = Number(process.argv[5] ?? 2);
const ORDER = S.order;
const COMBO = ORDER.map((h) => (h.length === 2 ? 6 : h[2] === 's' ? 4 : 12));
const STACKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].filter((s) => s >= MIN_STACK);
const KS = [1, 2, 3, 4, 5, 6, 7, 8];
const tab = (kind, k, s) => { const str = S.tables[kind][anteKey]?.[k]?.[s]; return str ? Array.from(str).map((c) => Number(c) / 8) : null; };
const pct = (arr) => { let t = 0; for (let i = 0; i < 169; i++) t += arr[i] * COMBO[i]; return (t / 1326) * 100; };
const idx = (h) => ORDER.indexOf(h);
const bad = [];
const f1 = (x) => x.toFixed(1);

// ① 단조성
for (const s of STACKS) {
  const live = KS.filter((k) => tab('shove', k, s));
  for (let i = 0; i + 1 < live.length; i++) { const a = pct(tab('shove', live[i], s)); const b = pct(tab('shove', live[i + 1], s)); if (!(a >= b - 1.0)) bad.push(`shove ${s}bb k${live[i]}=${f1(a)} < k${live[i + 1]}=${f1(b)}`); }
  for (const kind of ['callBB', 'callSB']) {
    // k=1 은 SB 가 히어로라 SB 의 0.5 가 데드머니가 아니고 BB 팟오즈가 달라 사과-배다 — 사슬에서 뺀다.
    // ⚠ `src/lib/ranges.test.ts` 의 콜 표 단조성 계약은 **k=1 을 포함**한다(규칙 불일치, 2026-09-19 기록).
    //   지금은 k1↔k2 역전이 전부 격리 깊이라 통과하지만 격리를 풀면 그쪽이 거짓 빨강을 낼 수 있다 — README '알려진 규칙 불일치'.
    const liveK = KS.filter((k) => k >= 2 && tab(kind, k, s));
    for (let i = 0; i + 1 < liveK.length; i++) { const a = pct(tab(kind, liveK[i], s)); const b = pct(tab(kind, liveK[i + 1], s)); if (!(a >= b - 1.0)) bad.push(`${kind} ${s}bb k${liveK[i]}=${f1(a)} < k${liveK[i + 1]}=${f1(b)}`); }
  }
}
const info = [];
for (const k of KS) {
  for (let i = 0; i + 1 < STACKS.length; i++) { const a = tab('shove', k, STACKS[i]); const b = tab('shove', k, STACKS[i + 1]); if (a && b && !(pct(a) >= pct(b) - 1.0)) bad.push(`shove k${k}: ${STACKS[i]}bb=${f1(pct(a))} < ${STACKS[i + 1]}bb=${f1(pct(b))} (스택이 작을수록 넓어야)`); }
  // "BB 콜 < 올인" 은 일반 법칙이 아니다 — BB 는 마지막에 팟오즈를 받고 액션을 닫는다. 옛 노앤티 표도 5bb k2 에서 콜 47.5 > 셔브 40.9 다.
  //   기존 계약(ranges.test)이 잠근 자리는 k=1 · 10bb · 노앤티 한 칸뿐이다. 여기서는 참고로만 센다.
  for (const s of STACKS) { const sh = tab('shove', k, s); const cb = tab('callBB', k, s); if (sh && cb && pct(cb) > pct(sh) + 1.0) info.push(`callBB k${k} ${s}bb=${f1(pct(cb))} > shove ${f1(pct(sh))}`); }
}
// 기존 계약과 같은 사슬([1,2,5,8])도 따로 센다 — 이것이 ranges.test.ts 가 실제로 판정하는 비교다
for (const s of STACKS) {
  const live = [1, 2, 5, 8].filter((k) => tab('shove', k, s));
  for (let i = 0; i + 1 < live.length; i++) { const a = pct(tab('shove', live[i], s)); const b = pct(tab('shove', live[i + 1], s)); if (!(a >= b - 1.0)) bad.push(`[계약 사슬] shove ${s}bb k${live[i]}=${f1(a)} < k${live[i + 1]}=${f1(b)}`); }
}
// ⑤ 🔴 빅앤티 vs 노앤티 교차 검사(리드 게이트 2026-09-19) — 같은 (kind, k, stack) 에서 **빅앤티가 노앤티보다 넓어야** 한다.
//    데드머니가 많으면 셔브도 콜도 넓어진다 — 표가 아니라 포커의 구조다. 위반이 하나라도 있으면 모델이 앤티를 잘못 넣은 것이다.
//    기준점은 둘: (a) 기존 노앤티 표(사용자가 보는 값) (b) 같은 모델의 노앤티.
//    ⚠ 2026-09-19 정정: 여기 "옛 노앤티 k=1 표가 다른 단순화(SB 데드머니)로 만들어져 기준점이 못 된다" 고 적고
//      callBB k=1 을 건너뛰었는데 **그 전제가 틀렸다**. 옛 k=1 표는 맞았고, 안 맞던 것은 이 생성기 쪽
//      `deadIfAllFold` 가 k=1 만 포스팅 전 기준(`1 + A`)을 쓰던 것이다(solve.mjs 주석 참고). 고친 모델은
//      옛 노앤티 k=1 을 평균 0.6%p 로 되살린다 — `K1_MODEL=dead` 는 정답 변형이 아니라 **오차를 상쇄하던 우연**이다.
//      그래서 k=1 도 교차 검사에 넣는다(실측 위반 0).
const existingFile = process.argv[4];
const EXIST = existingFile ? JSON.parse(readFileSync(existingFile, 'utf-8')).tables : null;
const cross = [];
let crossChecked = 0;
const gaps = { 기존노앤티: [], 모델노앤티: [] };     // { kind, k, s, gap }
if (anteKey === 'ante') {
  for (const kind of ['shove', 'callBB', 'callSB']) for (const k of KS) for (const s of STACKS) {
    const a = tab(kind, k, s); if (!a) continue;
    const pa = pct(a);
    const noModelStr = S.tables[kind].no?.[k]?.[s];
    const bases = [];
    if (EXIST) { const e = EXIST[`${kind}|no|${k}|${s}`]; if (e) bases.push(['기존노앤티', pct(e)]); }
    if (noModelStr) bases.push(['모델노앤티', pct(Array.from(noModelStr).map((c) => Number(c) / 8))]);
    for (const [label, pn] of bases) {
      crossChecked += 1;
      gaps[label].push({ kind, k, s, gap: pa - pn });
      if (!(pa >= pn - 1.0)) cross.push(`${kind} k${k} ${s}bb: 빅앤티 ${f1(pa)} < ${label} ${f1(pn)}`);
    }
  }
}
// 허용치(−1.0%p)가 **실제로 쓰였는지** 숫자로 남긴다(리드 2026-09-19): 분포·(−1,0] 구간 셀·스택별 평균 격차(경향)
function gapReport(label) {
  const g = gaps[label]; if (!g.length) return `  ${label}: 비교 없음`;
  const sorted = g.map((x) => x.gap).sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  const inBand = g.filter((x) => x.gap > -1.0 && x.gap <= 0);
  const byStack = STACKS.map((s) => { const xs = g.filter((x) => x.s === s).map((x) => x.gap); return xs.length ? `${s}bb:${f1(xs.reduce((p, q) => p + q, 0) / xs.length)}` : null; }).filter(Boolean);
  return `  ${label}: n=${g.length} · 최소 ${f1(sorted[0])} · 중앙값 ${f1(med)} · 최대 ${f1(sorted[sorted.length - 1])} (%p)\n` +
    `    (−1.0, 0] 구간 셀 ${inBand.length}개${inBand.length ? ': ' + inBand.map((x) => `${x.kind} k${x.k} ${x.s}bb(${f1(x.gap)})`).join(' · ') : ' — 허용치는 한 번도 쓰이지 않았다(사실상 엄격한 검사)'}\n` +
    `    스택별 평균 격차(작을수록 커져야 정상): ${byStack.join(' ')}`;
}
// ② 경계 연속(6↔7bb) — 같은 모델이면 자동이지만 숫자로 남긴다
const edge = [];
for (const k of KS) for (const kind of ['shove', 'callBB', 'callSB']) { const a = tab(kind, k, 6); const b = tab(kind, k, 7); if (a && b) edge.push(`${kind} k${k}: 6bb ${f1(pct(a))} → 7bb ${f1(pct(b))}`); }
// ③ 상식 — UTG(k8) 가 K2o·32o 를 100% 잼하지 않는다(5bb 이상), UTG < SB
//   ⚠ '22' 는 목록에서 뺐다(2026-09-19 리드 결정). 통과시키려고 뺀 것이 아니다: 옛 **검증 통과** 노앤티 표도 UTG 22 를
//     4·5bb 100% · 6bb 12.5% 로 밀고, 빅앤티 1bb 는 팟을 키워 2bb 쯤 더 깊게 민다(모델: 5~7bb 100% · 8bb 25%). 22 는 랜덤 핸드 상대 ~50%
//     라 데드머니가 있으면 UTG 잼이 정상이다. 옛 버그의 증상은 "K2o·22 100% **+ k 순서 역전**" 이었고 그 역전은 ① 이 따로 잡는다.
//     8bb 25% 는 한 핸드(6콤보)라 반복수에 따라 흔들릴 수 있다 — 값이 아니라 방향(깊을수록 덜 밈)만 본다.
for (const s of STACKS.filter((x) => x >= 5)) {
  const u = tab('shove', 8, s); const sb = tab('shove', 1, s);
  if (u) { for (const h of ['K2o', '32o']) if (u[idx(h)] >= 1) bad.push(`상식: k8 ${s}bb ${h} 100% 잼`); }
  if (u && sb && pct(u) > pct(sb)) bad.push(`상식: k8 ${s}bb ${f1(pct(u))} > SB ${f1(pct(sb))}`);
}
console.log('경계 6↔7bb:\n  ' + edge.join('\n  '));
console.log(`\n위반 ${bad.length}건${bad.length ? ':\n  ' + bad.join('\n  ') : ' — 통과'}`);
console.log(`\n참고(콜이 올인보다 넓은 칸 — 법칙 아님) ${info.length}건${info.length ? ': ' + info.slice(0, 6).join(' · ') + (info.length > 6 ? ' …' : '') : ''}`);
if (anteKey === 'ante') {
  console.log(`\n⑤ 빅앤티 vs 노앤티 교차 검사: ${crossChecked}건 비교 · 위반 ${cross.length}건${cross.length ? ':\n  ' + cross.join('\n  ') : ' — 통과'}`);
  console.log(gapReport('기존노앤티'));
  console.log(gapReport('모델노앤티'));
  if (cross.length) process.exitCode = 1;
}
if (bad.length) process.exitCode = 1;
// 요약표
for (const kind of ['shove', 'callBB', 'callSB']) {
  console.log(`\n${kind} (${anteKey}) 콤보% k=1..8`);
  for (const s of STACKS) console.log(`${String(s).padStart(2)}bb ` + KS.map((k) => { const t = tab(kind, k, s); return t ? f1(pct(t)).padStart(5) : '    -'; }).join(' '));
}
