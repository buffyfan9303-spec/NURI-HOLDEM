// 두 구체 콤보의 정확 에퀴티 — 남은 48장에서 보드 5장 전수(1,712,304). 2026-09-25 gto-team.
// equity169-exact.mjs · hu-exact.mjs 가 공유한다.
import { RANK_KEY as RK, NF, FLUSH } from './eval7.mjs';

// 보드 무늬 개수(무늬당 3비트) → 3장 이상인 무늬(없으면 -1). 5장 보드에서 3장 이상인 무늬는 최대 하나다.
const FSUIT = new Int8Array(4096).fill(-1);
for (let p = 0; p < 4096; p++) for (let s = 0; s < 4; s++) if (((p >> (s * 3)) & 7) >= 3) FSUIT[p] = s;

const deck = new Int32Array(48); const dk = new Int32Array(48); const ds = new Int32Array(48); const db = new Int32Array(48); const dp = new Int32Array(48);

/** a0,a1 vs b0,b1 → [승, 무, 판수] (히어로 = a) */
export function exactPair(a0, a1, b0, b1) {
  let m = 0;
  for (let c = 0; c < 52; c++) if (c !== a0 && c !== a1 && c !== b0 && c !== b1) {
    deck[m] = c; dk[m] = RK[c >> 2]; ds[m] = c & 3; db[m] = 1 << (c >> 2); dp[m] = 1 << ((c & 3) * 3); m++;
  }
  const hk = RK[a0 >> 2] + RK[a1 >> 2]; const vk = RK[b0 >> 2] + RK[b1 >> 2];
  const hm = [0, 0, 0, 0]; hm[a0 & 3] |= 1 << (a0 >> 2); hm[a1 & 3] |= 1 << (a1 >> 2);
  const vm = [0, 0, 0, 0]; vm[b0 & 3] |= 1 << (b0 >> 2); vm[b1 & 3] |= 1 << (b1 >> 2);
  const bm = new Int32Array(4 * 6);   // 레벨별 무늬 마스크
  let win = 0; let tie = 0; let n = 0;
  for (let i1 = 0; i1 < 44; i1++) {
    const k1 = dk[i1]; const p1 = dp[i1];
    bm[4] = 0; bm[5] = 0; bm[6] = 0; bm[7] = 0; bm[4 + ds[i1]] |= db[i1];
    for (let i2 = i1 + 1; i2 < 45; i2++) {
      const k2 = k1 + dk[i2]; const p2 = p1 + dp[i2];
      bm[8] = bm[4]; bm[9] = bm[5]; bm[10] = bm[6]; bm[11] = bm[7]; bm[8 + ds[i2]] |= db[i2];
      for (let i3 = i2 + 1; i3 < 46; i3++) {
        const k3 = k2 + dk[i3]; const p3 = p2 + dp[i3];
        bm[12] = bm[8]; bm[13] = bm[9]; bm[14] = bm[10]; bm[15] = bm[11]; bm[12 + ds[i3]] |= db[i3];
        for (let i4 = i3 + 1; i4 < 47; i4++) {
          const k4 = k3 + dk[i4]; const p4 = p3 + dp[i4];
          bm[16] = bm[12]; bm[17] = bm[13]; bm[18] = bm[14]; bm[19] = bm[15]; bm[16 + ds[i4]] |= db[i4];
          for (let i5 = i4 + 1; i5 < 48; i5++) {
            const k5 = k4 + dk[i5]; const p5 = p4 + dp[i5];
            let hv = NF[hk + k5]; let vv = NF[vk + k5];
            const fs = FSUIT[p5];
            if (fs >= 0) {
              const b = bm[16 + fs] | (ds[i5] === fs ? db[i5] : 0);
              const hf = FLUSH[b | hm[fs]]; if (hf > hv) hv = hf;
              const vf = FLUSH[b | vm[fs]]; if (vf > vv) vv = vf;
            }
            if (hv > vv) win++; else if (hv === vv) tie++;
            n++;
          }
        }
      }
    }
  }
  return [win, tie, n];
}

const R = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const HAND_ORDER = (() => { const out = []; for (let hi = 12; hi >= 0; hi--) for (let lo = hi; lo >= 0; lo--) { if (hi === lo) out.push(R[hi] + R[lo]); else { out.push(R[hi] + R[lo] + 's'); out.push(R[hi] + R[lo] + 'o'); } } return out; })();
export function combosOf(name) {
  const a = R.indexOf(name[0]); const b = R.indexOf(name[1]); const out = [];
  if (a === b) { for (let s = 0; s < 4; s++) for (let t = s + 1; t < 4; t++) out.push([a * 4 + s, a * 4 + t]); }
  else if (name[2] === 's') { for (let s = 0; s < 4; s++) out.push([a * 4 + s, b * 4 + s]); }
  else { for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if (s !== t) out.push([a * 4 + s, b * 4 + t]); }
  return out;
}
export const card = (s) => R.indexOf(s[0]) * 4 + 'cdhs'.indexOf(s[1]);
