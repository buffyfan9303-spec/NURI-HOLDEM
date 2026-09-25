// 7장 핸드 평가기(표 조회) — 정확 전수 계산(equity169-exact.mjs · hu-exact.mjs)용. 2026-09-25 gto-team.
// 값의 척도는 equity169.mjs 의 score5 와 같다(cat·15^5 + 타이브레이커) — 같은 규칙을 표로 굳혀 빠르게 한 것.
// 카드 = rank(0..12)*4 + suit(0..3).
//  · 비플러시: 랭크 다중집합만으로 정해진다. 키 = Σ RANK_KEY[rank] (7장 합이 다중집합마다 유일 — 표를 만들며 충돌을 검사한다)
//  · 플러시: 한 무늬의 13비트 마스크 → FLUSH[mask] (5비트 미만이면 0). 7장 값 = max(비플러시, 플러시)
// 검증: node scripts/gen-nash/eval7.mjs [n]  → score5 전수(21조합) 무작위 대조, 불일치 0 이어야 한다
export const RANK_KEY = [0, 1, 5, 22, 98, 453, 2031, 8698, 22854, 83661, 262349, 636345, 1479181];

function value(cat, tb) { const t = tb.slice(0, 5); while (t.length < 5) t.push(0); let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + t[i]; return v; }
/** ranks(2..14) 5장, 플러시 여부 → equity169.mjs score5 와 같은 값 */
export function score5r(ranksIn, flush) {
  const ranks = ranksIn.slice().sort((x, y) => y - x);
  let straight = false; let sHigh = 0;
  if (new Set(ranks).size === 5) {
    if (ranks[0] - ranks[4] === 4) { straight = true; sHigh = ranks[0]; }
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) { straight = true; sHigh = 5; }
  }
  const freq = new Map(); for (const r of ranks) freq.set(r, (freq.get(r) ?? 0) + 1);
  const groups = [...freq.entries()].sort((x, y) => (y[1] - x[1]) || (y[0] - x[0]));
  const counts = groups.map((g) => g[1]); const gr = groups.map((g) => g[0]);
  let cat;
  if (straight && flush) cat = 8; else if (counts[0] === 4) cat = 7; else if (counts[0] === 3 && counts[1] === 2) cat = 6;
  else if (flush) cat = 5; else if (straight) cat = 4; else if (counts[0] === 3) cat = 3;
  else if (counts[0] === 2 && counts[1] === 2) cat = 2; else if (counts[0] === 2) cat = 1; else cat = 0;
  const tb = (cat === 8 || cat === 4) ? [sHigh] : (cat === 5 || cat === 0) ? ranks : gr;
  return value(cat, tb);
}
const C5of7 = []; for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) C5of7.push([a, b, c, d, e]);

export const NF = new Uint32Array(4 * 1479181 + 3 * 636345 + 1);
export const FLUSH = new Uint32Array(8192);
{
  const cnt = new Array(13).fill(0);
  const rec = (r, left) => {
    if (r < 0) {
      if (left) return;
      const rs = []; let key = 0;
      for (let i = 0; i < 13; i++) for (let c = 0; c < cnt[i]; c++) { rs.push(i + 2); key += RANK_KEY[i]; }
      let best = 0; for (const idx of C5of7) { const s = score5r(idx.map((j) => rs[j]), false); if (s > best) best = s; }
      if (NF[key] && NF[key] !== best) throw new Error(`rank key collision at ${key}`);
      NF[key] = best; return;
    }
    for (let c = 0; c <= Math.min(4, left); c++) { cnt[r] = c; rec(r - 1, left - c); }
    cnt[r] = 0;
  };
  rec(12, 7);
  for (let m = 0; m < 8192; m++) {
    const rs = []; for (let i = 12; i >= 0; i--) if (m & (1 << i)) rs.push(i + 2);
    if (rs.length < 5) continue;
    let best = 0; const L = rs.length;
    for (let a = 0; a < L; a++) for (let b = a + 1; b < L; b++) for (let c = b + 1; c < L; c++) for (let d = c + 1; d < L; d++) for (let e = d + 1; e < L; e++) {
      const s = score5r([rs[a], rs[b], rs[c], rs[d], rs[e]], true); if (s > best) best = s;
    }
    FLUSH[m] = best;
  }
}
/** 임의 7장 평가 — 검증·소량용. 대량 전수는 호출부가 키·마스크를 증분으로 쌓는다. */
export function eval7(cards) {
  let key = 0; const sm = [0, 0, 0, 0];
  for (const c of cards) { key += RANK_KEY[c >> 2]; sm[c & 3] |= 1 << (c >> 2); }
  let v = NF[key];
  for (let s = 0; s < 4; s++) { const f = FLUSH[sm[s]]; if (f > v) v = f; }
  return v;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/eval7.mjs')) {
  let s = 12345; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const best7 = (cs) => { let b = 0; for (const idx of C5of7) { const f = idx.every((j) => (cs[j] & 3) === (cs[idx[0]] & 3)); const v = score5r(idx.map((j) => (cs[j] >> 2) + 2), f); if (v > b) b = v; } return b; };
  const N = Number(process.argv[2] ?? 200000); let bad = 0;
  for (let t = 0; t < N; t++) {
    const d = []; while (d.length < 7) { const c = Math.floor(rnd() * 52); if (!d.includes(c)) d.push(c); }
    // 플러시가 자주 나오도록 절반은 한 무늬로 치우친 손도 섞는다
    if (t & 1) for (let i = 0; i < 4; i++) { const c = (d[i] & ~3) | 2; if (!d.includes(c)) d[i] = c; }
    if (eval7(d) !== best7(d)) { bad++; if (bad < 5) console.log('mismatch', d); }
  }
  console.log(`eval7 self-check: ${N} random hands, mismatches=${bad}`);
  process.exit(bad ? 1 : 0);
}
