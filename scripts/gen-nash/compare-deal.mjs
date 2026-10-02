// solve-deal.mjs 산출과 게시 표(nash.data.ts)·외부 표를 칸 단위로 비교한다. 2026-10-01 gto-team (감사 N7).
// 실행: node scripts/gen-nash/compare-deal.mjs <solved.json> src/lib/nash.data.ts [ext.json]
//   ext.json(선택) = { "ante|8|2": [169 빈도], ... } — 외부 공개 표의 셔브 범위. **비교 전용**, 저장소에 넣지 않는다.
// 출력: 표마다 콤보% (우리 산출 · 게시 · 외부) · 차이 · 양자화 단계가 2 이상 다른 칸 수.
import { readFileSync } from 'node:fs';

const [, , solvedFile, dataFile, extFile] = process.argv;
const solved = JSON.parse(readFileSync(solvedFile, 'utf-8'));
const text = readFileSync(dataFile, 'utf-8');
const lit = (name) => JSON.parse(text.match(new RegExp(`const ${name}: [^=]+= (\\{[^\\r\\n]*\\});`))[1]);
const pub = { shove: lit('SHOVE'), callBB: lit('CALL_BB'), callSB: lit('CALL_SB') };
const ext = extFile ? JSON.parse(readFileSync(extFile, 'utf-8')) : {};
const ORDER = solved.order;
const CNT = ORDER.map((h) => (h.length === 2 ? 6 : h[2] === 's' ? 4 : 12));
const pct = (f) => { let t = 0; for (let i = 0; i < 169; i++) t += f[i] * CNT[i]; return (t / 1326) * 100; };
const dec = (s) => Array.from(s, (c) => Number(c) / 8);
const rows = [];
for (const r of Object.values(solved.res).sort((x, y) => (x.a + x.k + x.S).localeCompare(y.a + y.k + y.S) || x.k - y.k || x.S - y.S)) {
  for (const kind of ['shove', 'callBB', 'callSB']) {
    const raw = kind === 'shove' ? r.shove : kind === 'callBB' ? r.callBB : r.callSB;
    if (!raw) continue;
    const ours = dec(solved.tables[kind][r.a][r.k][r.S]);
    const p = pub[kind]?.[r.a]?.[String(r.k)]?.[String(r.S)];
    const pv = p ? dec(p) : null;
    let big = 0; if (pv) for (let i = 0; i < 169; i++) if (Math.abs(ours[i] - pv[i]) >= 0.25 - 1e-9) big++;
    const e = kind === 'shove' ? ext[`${r.a}|${r.k}|${r.S}`] : null;
    rows.push([r.a, `k${r.k}`, `${r.S}bb`, kind, pct(raw).toFixed(2), pct(ours).toFixed(2), pv ? pct(pv).toFixed(2) : '—', pv ? (pct(ours) - pct(pv)).toFixed(2) : '—', pv ? String(big) : '—', e ? pct(e).toFixed(1) : '—', e ? (pct(ours) - pct(e)).toFixed(1) : '—']);
  }
}
console.log(['앤티', 'k', '스택', '표', '산출(원값)', '산출(8단)', '게시', 'Δ게시', '2단+칸', '외부', 'Δ외부'].join('\t'));
for (const row of rows) console.log(row.join('\t'));
