// src/components/features/clock/ambience/scenes/sceneKit.ts — 일러스트 장면을 그리는 캔버스 붓 모음.
//
// 오너 피드백 2026-09-30: "실사 위주라 화질이 안 좋다 — APIS 벚꽃처럼 해상도가 보장되는, 운치 있는 장면".
//   → 사진·영상 대신 **코드로 그린다**. 모든 좌표는 CSS px × u(짧은 변/1080) 로 적어, 1080p·4K 어디서든
//     벡터처럼 다시 그린다(비트맵 확대 없음). 평면 도형 느낌을 피하려고 그라데이션·빛번짐·대기원근·결(grain)을 쓴다.
// 이 파일은 순수 그리기 도우미다 — 상태를 들고 있지 않고, 난수는 호출부가 넘긴 시드 난수만 쓴다.

import { type Rng, clamp, makeSprite, mulberry32, rand } from '../ambienceEngine';

export const TAU = Math.PI * 2;
export type G = CanvasRenderingContext2D;
export type Stops = [number, string][];

const addStops = (gr: CanvasGradient, stops: Stops) => { for (const [o, c] of stops) gr.addColorStop(o, c); return gr; };
export const linear = (g: G, x0: number, y0: number, x1: number, y1: number, stops: Stops) => addStops(g.createLinearGradient(x0, y0, x1, y1), stops);
export const radial = (g: G, x: number, y: number, r: number, stops: Stops) => addStops(g.createRadialGradient(x, y, 0, x, y, r), stops);

// ── 흐림 한 번에 ─────────────────────────────────────────────────────────────
// ctx.filter 는 그리기 호출마다 따로 걸린다 — 구름 덩어리·꽃잎 수백~수천 개면 흐림도 그만큼 돈다.
// 실측(2026-09-30, Chrome, 1920×1080): 장면 첫 그림이 벚꽃 0.7초·4K 1.7초, 소프트웨어 래스터(GPU 없는 TV 박스와 같은 조건)에서는 30초 넘게
// 메인 스레드를 막았다. 그래서 도형들을 흐림 없이 한 판에 모은 뒤 그 판을 **한 번** 흐려 얹는다.
// 흐림 폭은 캔버스 픽셀이다(ctx.filter 는 변환 행렬을 따르지 않는다 — 실측) — 판을 얹을 때 변환을 풀어 종전과 같은 폭이 된다.
const scratch: HTMLCanvasElement[] = [];
let depth = 0, freeing = false;
/** draw 가 그린 것을 px 로 한 번 흐려 g 에 얹는다. draw 안의 합성은 g 의 현재 합성을 따르고, g 의 globalAlpha 는 판 전체에 한 번 걸린다.
 *  box = 그림이 들어갈 사각형(현재 좌표계) — 주면 그 안만 비우고 흐린다(작은 구름 수십 개가 화면 전체를 매번 흐리지 않게). */
export function blurGroup(g: G, px: number, draw: (t: G) => void, box?: [number, number, number, number]) {
  if (!(px > 0) || typeof document === 'undefined') { g.save(); if (px > 0) g.filter = `blur(${px}px)`; draw(g); g.restore(); return; }
  const cv = g.canvas as HTMLCanvasElement;
  // 판은 캔버스보다 M 만큼 넓다 — 화면 밖으로 걸친 도형도 흐림에 들어가야 가장자리 한 줄이 어두워지지 않는다(종전 도형별 흐림과 같게)
  const M = Math.ceil(px * 3 + 2);
  const s = (scratch[depth] ??= document.createElement('canvas'));
  if (s.width < cv.width + 2 * M || s.height < cv.height + 2 * M) { // 키우기만 한다(흐림 폭마다 다시 만들지 않게)
    s.width = Math.max(s.width, cv.width + 2 * M); s.height = Math.max(s.height, cv.height + 2 * M);
  }
  const m = g.getTransform();
  let x0 = -M, y0 = -M, x1 = cv.width + M, y1 = cv.height + M; // 캔버스 픽셀 좌표
  if (box) { // 확대·이동만 있는 변환(장면 그리기는 dpr 배율뿐)이라 두 점으로 충분하다
    x0 = Math.max(x0, Math.floor(Math.min(m.a * box[0], m.a * box[2]) + m.e - M)); x1 = Math.min(x1, Math.ceil(Math.max(m.a * box[0], m.a * box[2]) + m.e + M));
    y0 = Math.max(y0, Math.floor(Math.min(m.d * box[1], m.d * box[3]) + m.f - M)); y1 = Math.min(y1, Math.ceil(Math.max(m.d * box[1], m.d * box[3]) + m.f + M));
    if (x1 <= x0 || y1 <= y0) return;
  }
  const t = s.getContext('2d')!;
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.clearRect(x0 + M, y0 + M, x1 - x0, y1 - y0);
  t.setTransform(m.a, m.b, m.c, m.d, m.e + M, m.f + M);
  t.globalAlpha = 1; t.globalCompositeOperation = g.globalCompositeOperation; t.filter = 'none';
  depth++;
  try { draw(t); } finally { depth--; }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.filter = `blur(${px}px)`;
  g.drawImage(s, x0 + M, y0 + M, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  g.restore();
  if (!freeing) { // 그리기(동기)가 끝나면 판을 돌려준다 — 4K 판 한 장이 33MB 다
    freeing = true;
    setTimeout(() => { for (const c of scratch) { c.width = 0; c.height = 0; } freeing = false; }, 0);
  }
}

/** 세로 하늘 — stops 는 위(0)→아래(1). */
export function sky(g: G, w: number, h: number, stops: Stops) {
  g.fillStyle = linear(g, 0, 0, 0, h, stops);
  g.fillRect(0, 0, w, h);
}

/** 가우시안에 가까운 부드러운 빛(띠 없이 끝이 녹는다). sx·sy 로 타원. */
export function glow(g: G, x: number, y: number, r: number, rgb: string, a: number, sx = 1, sy = 1, op: GlobalCompositeOperation = 'source-over') {
  if (!(r > 0) || a <= 0) return;
  g.save();
  g.globalCompositeOperation = op;
  g.translate(x, y);
  g.scale(sx, sy);
  g.fillStyle = radial(g, 0, 0, r, [
    [0, `rgba(${rgb},${a})`], [0.12, `rgba(${rgb},${a * 0.8})`], [0.3, `rgba(${rgb},${a * 0.45})`],
    [0.55, `rgba(${rgb},${a * 0.16})`], [0.8, `rgba(${rgb},${a * 0.04})`], [1, `rgba(${rgb},0)`],
  ]);
  g.fillRect(-r, -r, 2 * r, 2 * r);
  g.restore();
}

// ── 잡음 ─────────────────────────────────────────────────────────────────────
export type Noise1 = (x: number) => number;
/** 1차원 값 잡음(0..1, 매끈). */
export function noise1(seed: number): Noise1 {
  const r = mulberry32(seed);
  const T = Array.from({ length: 512 }, () => r());
  return (x) => {
    const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    const a = T[i & 511], b = T[(i + 1) & 511];
    return a + (b - a) * s;
  };
}
/** 프랙탈 합(0..1). ridged = 봉우리가 뾰족한 산 능선. */
export function fbm(n: Noise1, x: number, oct = 5, ridged = false) {
  let v = 0, amp = 0.5, fr = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    let s = n(x * fr + o * 17.3);
    if (ridged) s = 1 - Math.abs(2 * s - 1);
    v += amp * s; norm += amp; amp *= 0.5; fr *= 2.03;
  }
  return v / norm;
}

// ── 지형 ─────────────────────────────────────────────────────────────────────
export interface RidgeOpt {
  base: number; amp: number; freq: number; seed: number;
  fill: string | CanvasGradient; oct?: number; ridged?: boolean;
  /** 윗선에 얇은 테두리 빛(역광·달빛) */
  rim?: { color: string; width: number };
}
/** 산 능선·숲 윤곽 실루엣. 반환값 = x→윗선 y 함수(그 위에 나무를 세울 때). */
export function ridge(g: G, w: number, h: number, o: RidgeOpt): (x: number) => number {
  const n = noise1(o.seed);
  const top = (x: number) => o.base - o.amp * fbm(n, (x / w) * o.freq, o.oct ?? 5, o.ridged);
  const step = Math.max(1, w / 480);
  g.beginPath();
  g.moveTo(-2, h + 2);
  for (let x = -2; x <= w + step; x += step) g.lineTo(x, top(x));
  g.lineTo(w + 2, h + 2);
  g.closePath();
  g.fillStyle = o.fill;
  g.fill();
  if (o.rim) {
    g.beginPath();
    g.moveTo(-2, top(-2));
    for (let x = -2 + step; x <= w + step; x += step) g.lineTo(x, top(x));
    g.strokeStyle = o.rim.color; g.lineWidth = o.rim.width; g.lineJoin = 'round';
    g.stroke();
  }
  return top;
}

/** 전나무 실루엣 — 아래로 처진 가지 층(부드러운 곡선) + 가지 끝 불규칙. snow = 층 윗면 눈빛 'r,g,b'. */
export function pine(g: G, rng: Rng, x: number, yBase: number, hgt: number, wid: number, fill: string, snow?: string) {
  const tiers = Math.max(4, Math.round(hgt / (wid * 0.42)));
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x - wid * 0.04, yBase); g.lineTo(x + wid * 0.04, yBase); g.lineTo(x + wid * 0.02, yBase - hgt); g.lineTo(x - wid * 0.02, yBase - hgt); g.closePath(); g.fill();
  const tops: [number, number, number][] = [];
  for (let i = 0; i < tiers; i++) {
    const t = (i + 1) / tiers;
    const ty = yBase - hgt + hgt * (i / tiers) * 0.92;
    const by = ty + hgt * 0.95 / tiers * 1.6;
    const half = (wid / 2) * (0.18 + 0.82 * t) * rand(rng, 0.85, 1.1);
    const dl = rand(rng, 0.9, 1.1), dr = rand(rng, 0.9, 1.1);
    g.beginPath();
    g.moveTo(x, ty);
    g.quadraticCurveTo(x - half * 0.35, ty + (by - ty) * 0.35, x - half * dl, by + (by - ty) * 0.08);
    g.quadraticCurveTo(x - half * 0.5, by - (by - ty) * 0.12, x, by - (by - ty) * 0.18);
    g.quadraticCurveTo(x + half * 0.5, by - (by - ty) * 0.12, x + half * dr, by + (by - ty) * 0.08);
    g.quadraticCurveTo(x + half * 0.35, ty + (by - ty) * 0.35, x, ty);
    g.fill();
    tops.push([ty, by, half]);
  }
  if (snow) {
    g.fillStyle = `rgba(${snow},.22)`;
    for (const [ty, by, half] of tops) {
      if (rng() < 0.35) continue;
      const hy = ty + (by - ty) * 0.55;
      g.beginPath();
      g.moveTo(x, ty + (by - ty) * 0.08);
      g.quadraticCurveTo(x + half * 0.35, ty + (by - ty) * 0.4, x + half * rand(rng, 0.55, 0.85), hy);
      g.quadraticCurveTo(x + half * 0.3, hy - (by - ty) * 0.05, x, ty + (by - ty) * 0.3);
      g.closePath(); g.fill();
    }
  }
}

/** 활엽수 숲 윤곽 — 부드러운 수관 덩어리가 이어진 띠(반원 도장이 아니라 불규칙한 뭉게). rgb = 'r,g,b'. */
export function canopyLine(g: G, rng: Rng, w: number, h: number, base: number, amp: number, bump: number, rgb: string, a = 1) {
  g.fillStyle = `rgba(${rgb},${a})`;
  g.fillRect(-2, base, w + 4, h - base + 2);
  for (let x = -bump; x < w + bump; x += bump * rand(rng, 0.7, 1.3)) {
    cloud(g, rng, x, base + bump * 0.3, bump * rand(rng, 2, 3.4), (amp + bump) * rand(rng, 0.7, 1.2), rgb, rgb, a, 16, 0.6);
  }
}

// ── 가지·꽃 ───────────────────────────────────────────────────────────────────
export interface BranchSeg { x0: number; y0: number; x1: number; y1: number; w: number; d: number }
/** 재귀 가지 — 마디마다 조금씩 휘고, 끝으로 갈수록 가늘어진다. 선분과 꽃자리(끝·잔가지)를 모아 돌려준다. */
export function growBranch(rng: Rng, x: number, y: number, ang: number, len: number, wid: number, depth: number, bend = 0.18,
  segs: BranchSeg[] = [], tips: [number, number, number][] = []) {
  const parts = 4;
  let cx = x, cy = y, a = ang;
  for (let i = 0; i < parts; i++) {
    a += rand(rng, -bend, bend);
    const l = len / parts;
    const nx = cx + Math.cos(a) * l, ny = cy + Math.sin(a) * l;
    const w0 = wid * (1 - (i / parts) * 0.35);
    segs.push({ x0: cx, y0: cy, x1: nx, y1: ny, w: w0, d: depth });
    if (depth <= 2 && rng() < 0.7) tips.push([nx, ny, depth]);
    cx = nx; cy = ny;
    if (depth > 0 && i >= 1 && rng() < 0.42) {
      const side = rng() < 0.5 ? -1 : 1;
      growBranch(rng, cx, cy, a + side * rand(rng, 0.45, 0.95), len * rand(rng, 0.38, 0.6), w0 * 0.55, depth - 1, bend * 1.1, segs, tips);
    }
  }
  tips.push([cx, cy, depth]);
  if (depth > 0) {
    growBranch(rng, cx, cy, a + rand(rng, -0.35, 0.35), len * rand(rng, 0.62, 0.8), wid * 0.64, depth - 1, bend, segs, tips);
    if (rng() < 0.55) growBranch(rng, cx, cy, a + (rng() < 0.5 ? -1 : 1) * rand(rng, 0.4, 0.8), len * rand(rng, 0.45, 0.65), wid * 0.5, depth - 1, bend, segs, tips);
  }
  return { segs, tips };
}

/** 가지 선분을 그린다. rim = 광원 쪽 테두리 빛(ox, oy 만큼 비껴 먼저 칠한다). */
export function strokeBranch(g: G, segs: BranchSeg[], color: string, rim?: { color: string; ox: number; oy: number }) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (rim) {
    g.strokeStyle = rim.color;
    for (const s of segs) { g.lineWidth = s.w * 1.08; g.beginPath(); g.moveTo(s.x0 + rim.ox, s.y0 + rim.oy); g.lineTo(s.x1 + rim.ox, s.y1 + rim.oy); g.stroke(); }
  }
  g.strokeStyle = color;
  for (const s of segs) { g.lineWidth = s.w; g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke(); }
}

/** 벚꽃잎 한 장의 윤곽(단위: 길이 1, 밑동 (0,0) → 끝 (0,-1), 끝에 갈라진 홈). */
export function petalPath(g: G, len: number, wid: number) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-wid * 0.55, -len * 0.18, -wid * 0.62, -len * 0.78, -wid * 0.2, -len * 0.98);
  g.quadraticCurveTo(-wid * 0.06, -len * 1.0, 0, -len * 0.88);
  g.quadraticCurveTo(wid * 0.06, -len * 1.0, wid * 0.2, -len * 0.98);
  g.bezierCurveTo(wid * 0.62, -len * 0.78, wid * 0.55, -len * 0.18, 0, 0);
  g.closePath();
}

/** 다섯 장 벚꽃 한 송이. c0 = 꽃 가운데(진한 분홍), c1 = 꽃잎 끝(연한 색).
 *  sq = 원근 눌림(1 = 정면, 0.5 = 비스듬히), edge = 꽃잎 테두리 선(일러스트 윤곽). */
export function blossom(g: G, x: number, y: number, r: number, rot: number, c0: string, c1: string, stamen?: string, sq = 1, edge?: string) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(1, sq);
  g.fillStyle = radial(g, 0, 0, r, [[0, c0], [0.3, c0], [1, c1]]);
  if (edge) { g.strokeStyle = edge; g.lineWidth = Math.max(0.5, r * 0.06); }
  for (let k = 0; k < 5; k++) {
    g.save();
    g.rotate((k * TAU) / 5 + (k % 2) * 0.06);
    petalPath(g, r, r * 0.74);
    g.fill();
    if (edge) g.stroke();
    g.restore();
  }
  if (stamen) {
    g.strokeStyle = stamen; g.fillStyle = stamen; g.lineWidth = Math.max(0.4, r * 0.035);
    for (let k = 0; k < 9; k++) {
      const a = (k * TAU) / 9 + 0.3, d = r * (0.3 + 0.08 * (k % 3));
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * d, Math.sin(a) * d); g.stroke();
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.5, r * 0.055), 0, TAU); g.fill();
    }
  }
  g.restore();
}

/** 꽃봉오리 — 작은 타원 + 꽃받침. */
export function bud(g: G, x: number, y: number, r: number, rot: number, fill: string, cap: string) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = fill; g.beginPath(); g.ellipse(0, -r * 0.4, r * 0.55, r * 0.85, 0, 0, TAU); g.fill();
  g.fillStyle = cap; g.beginPath(); g.ellipse(0, r * 0.35, r * 0.35, r * 0.4, 0, 0, TAU); g.fill();
  g.restore();
}

/** 단풍잎 윤곽(다섯 갈래, 단위 반지름 1). */
export function maplePath(g: G, r: number) {
  const D = Math.PI / 180;
  const lobes: [number, number][] = [[-90, 1], [-38, 0.86], [14, 0.66], [166, 0.66], [218, 0.86]];
  g.beginPath();
  lobes.forEach(([a, ra], i) => {
    const [b, rb] = lobes[(i + 1) % lobes.length];
    const A = a * D, B = (i === lobes.length - 1 ? b + 360 : b) * D;
    const deep = a === 14 ? 0.12 : 0.34;
    const pt = (ang: number, rr: number) => [Math.cos(ang) * rr * r, Math.sin(ang) * rr * r] as const;
    const seq = [pt(A, ra), pt(A + (B - A) * 0.2, ra * 0.7), pt(A + (B - A) * 0.32, ra * 0.78), pt((A + B) / 2, deep), pt(A + (B - A) * 0.68, rb * 0.78), pt(A + (B - A) * 0.8, rb * 0.7)];
    seq.forEach(([px, py], j) => (i === 0 && j === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
  });
  g.closePath();
}

// ── 하늘의 것 ─────────────────────────────────────────────────────────────────
/** 달 — 가장자리 어둡기·얼룩·후광. */
export function moon(g: G, x: number, y: number, r: number, halo: string, rng: Rng, tint = '246,242,228') {
  glow(g, x, y, r * 9, halo, 0.16);
  glow(g, x, y, r * 3.2, halo, 0.3);
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
  g.fillStyle = radial(g, x - r * 0.25, y - r * 0.25, r * 1.35, [[0, `rgba(${tint},1)`], [0.7, `rgba(${tint},0.96)`], [1, 'rgba(200,196,188,0.9)']]);
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
  for (let i = 0; i < 9; i++) glow(g, x + rand(rng, -0.6, 0.6) * r, y + rand(rng, -0.6, 0.6) * r, r * rand(rng, 0.18, 0.42), '150,150,160', rand(rng, 0.08, 0.16));
  g.restore();
}

/** 정지 별 — 크기·밝기·색온도가 제각각. band 가 있으면 그 띠에 몰린다(은하수). */
export function stars(g: G, rng: Rng, w: number, h: number, n: number, u: number, yMax = 1, band?: (x: number, y: number) => number) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h * yMax;
    if (band && rng() > band(x, y)) continue;
    const m = Math.pow(rng(), 3);
    const r = (0.45 + 1.4 * m) * u;
    const warm = rng();
    const col = warm < 0.2 ? '255,222,196' : warm < 0.4 ? '200,220,255' : '255,255,255';
    g.fillStyle = `rgba(${col},${0.25 + 0.7 * m})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (m > 0.8) glow(g, x, y, r * 6, col, 0.18);
  }
}

/** 뭉게구름·운해·꽃나무 수관 — 부드러운 빛 덩어리 n 개를 돔 모양으로 쌓는다. 색은 덩어리의 높이로 섞는다
 *  (top = 윗면, bottom = 아랫면 — 노을처럼 아래서 비추면 bottom 을 밝게). 가장자리는 가우시안처럼 녹아 윤곽선이 없다. 'r,g,b'. */
export function cloud(g: G, rng: Rng, x: number, y: number, cw: number, ch: number, top: string, bottom: string, a = 1, n = 36, blurPx = 0) {
  const T = top.split(',').map(Number), B = bottom.split(',').map(Number);
  const blobs: [number, number, number][] = [];
  n = Math.max(n, Math.round((cw / Math.max(1, ch)) * 12)); // 가로로 긴 구름도 덩어리가 끊기지 않게
  for (let i = 0; i < n; i++) {
    const t = rand(rng, -1, 1), dome = Math.sqrt(Math.max(0, 1 - t * t));
    const r = ch * (0.25 + 0.55 * dome) * rand(rng, 0.6, 1.1);
    blobs.push([x + t * cw * 0.5, Math.min(y - r * 0.2, y - dome * ch * rand(rng, 0.1, 0.7)), r]);
  }
  blobs.sort((p, q) => p[1] - q[1]); // 위 → 아래(아랫면이 위에 덮인다)
  // 덩어리 반지름 ≤ 0.88·ch, 중심 y ∈ [y − 0.7·ch, y] → 상자는 여유 있게 가로 ±(cw/2 + ch), 세로 [y − 1.7·ch, y + ch]
  blurGroup(g, blurPx, (t) => {
    for (const [px, py, r] of blobs) {
      const k = clamp((py - (y - ch)) / ch, 0, 1);
      const c = `${Math.round(T[0] + (B[0] - T[0]) * k)},${Math.round(T[1] + (B[1] - T[1]) * k)},${Math.round(T[2] + (B[2] - T[2]) * k)}`;
      t.fillStyle = radial(t, px, py, r, [[0, `rgba(${c},${a})`], [0.4, `rgba(${c},${a * 0.72})`], [0.72, `rgba(${c},${a * 0.26})`], [1, `rgba(${c},0)`]]);
      t.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
  }, [x - cw / 2 - ch, y - 1.7 * ch, x + cw / 2 + ch, y + ch]);
}

/** 가는 층운(노을 띠구름) — 가로로 긴 부드러운 줄 여러 개. */
export function streaks(g: G, rng: Rng, w: number, y0: number, y1: number, n: number, rgb: string, a: number, u: number) {
  for (let i = 0; i < n; i++) {
    const y = rand(rng, y0, y1), len = rand(rng, 0.15, 0.45) * w, x = rand(rng, -0.1, 1.1) * w, th = rand(rng, 4, 16) * u;
    glow(g, x, y, len / 2, rgb, a * rand(rng, 0.5, 1), 1, th / (len / 2));
  }
}

/** 수면 반사 — 수평선(hy) 위를 뒤집어 아래에 옅게 비추고, 가는 물결 줄로 끊는다. */
export function reflect(g: G, w: number, h: number, hy: number, dpr: number, rng: Rng, u: number, strength = 0.5, water = 'rgba(4,10,20,1)') {
  const cv = g.canvas;
  const H = Math.round(hy * dpr), R = Math.min(H, cv.height - H);
  if (R <= 0) return;
  const tmp = makeSprite(cv.width, R, (t) => t.drawImage(cv, 0, H - R, cv.width, R, 0, 0, cv.width, R));
  g.save();
  g.setTransform(1, 0, 0, -1, 0, 2 * H);
  g.globalAlpha = strength;
  g.drawImage(tmp, 0, H - R);
  g.restore();
  g.fillStyle = linear(g, 0, hy, 0, h, [[0, water.replace(/[\d.]+\)$/, '0.25)')], [1, water.replace(/[\d.]+\)$/, '0.85)')]]);
  g.fillRect(0, hy, w, h - hy);
  for (let i = 0; i < 170; i++) { // 물결 줄 — 수평선 가까이 촘촘하게(원근)
    const t = Math.pow(rng(), 1.8);
    const y = hy + t * (h - hy);
    const len = (30 + 260 * t) * u * rand(rng, 0.5, 1.4);
    const x = rng() * w;
    g.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${0.02 + 0.03 * (1 - t)})` : `rgba(0,0,0,${0.08 + 0.1 * t})`;
    g.fillRect(x - len / 2, y, len, Math.max(0.7, (0.6 + 2.2 * t) * u));
  }
}

// ── 마감 ─────────────────────────────────────────────────────────────────────
/** 필름 결 — 그라데이션 띠(banding)를 없애고 '그림' 질감을 준다. 256px 잡음 타일을 overlay 로 한 번 깐다. */
export function grain(g: G, w: number, h: number, dpr: number, seed: number, amount = 0.05) {
  const r = mulberry32(seed);
  const tile = makeSprite(256, 256, (t) => {
    const d = t.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() + r() - 1) * 127; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    t.putImageData(d, 0, 0);
  });
  const pat = g.createPattern(tile, 'repeat');
  if (!pat) return;
  pat.setTransform?.(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
  g.save();
  g.globalAlpha = amount;
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** 가장자리 어둡게(렌즈 비네트) — 화면 모서리를 눌러 가운데 무대로 시선이 모이게. */
export function vignette(g: G, w: number, h: number, a = 0.45) {
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(w / h, 1);
  g.fillStyle = radial(g, 0, 0, h * 0.78, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${a})`]]);
  g.fillRect(-h, -h, 2 * h, 2 * h);
  g.restore();
}

/** 가로로 이어지는 띠(안개·구름·수면 빛) 도안 — 폭 w·높이 bh(CSS px) 를 scale 배 해상도로.
 *  paint 는 wrapX(그리기, x) 로 좌우 끝을 넘는 것을 반대편에도 그려 이음새를 없앤다. */
export function stripSprite(w: number, bh: number, scale: number, paint: (g: G, W: number, H: number) => void) {
  const W = Math.max(8, Math.round(w * scale)), H = Math.max(8, Math.round(bh * scale));
  return makeSprite(W, H, (g) => paint(g, W, H));
}
/** 좌우로 이어지게 세 번 그린다(띠 도안 전용). */
export const wrapDraw = (W: number, draw: (dx: number) => void) => { draw(0); draw(-W); draw(W); };

/** 부드러운 덩어리 여러 개로 안개 띠를 칠한다(stripSprite 의 paint 로 쓴다). */
export function fogPaint(seed: number, rgb: string, a: number, blobs = 26) {
  return (g: G, W: number, H: number) => {
    const r = mulberry32(seed);
    for (let i = 0; i < blobs; i++) {
      const x = r() * W, y = H * (0.35 + 0.35 * r()), rx = W * (0.05 + 0.1 * r()), ry = H * (0.22 + 0.25 * r());
      const aa = a * (0.5 + 0.5 * r());
      wrapDraw(W, (dx) => glow(g, x + dx, y, rx, rgb, aa, 1, ry / rx));
    }
  };
}

/** 흐린 도안: ctx.filter 가 되면 가우시안, 아니면 축소-확대(오래된 TV 브라우저). */
export function blurred(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  if (px <= 0.3) return src;
  return makeSprite(src.width, src.height, (g) => {
    if ('filter' in g) { g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); if (g.filter !== 'none') return; }
    const f = Math.max(2, px / 2);
    const small = makeSprite(Math.max(2, Math.round(src.width / f)), Math.max(2, Math.round(src.height / f)), (s) => s.drawImage(src, 0, 0, src.width / f, src.height / f));
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 0, 0, src.width, src.height);
  });
}
