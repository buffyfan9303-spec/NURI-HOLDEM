// src/components/features/clock/ambience/scenes/scenes.ts — 코드로 그린 일러스트 모션 테마 14종.
//
// 오너 피드백 2026-09-30: "폭우 유리창 빼고 전부 별로 — 실사 위주·화질이 안 좋다. APIS 의 벚꽃처럼 해상도가 보장되면서
//   운치 있는 것. 휴대폰 배경화면 같은 느낌은 좋다." (리드 정정 전달)
//   → 사진·영상 없이 전부 캔버스로 그린다. 정지 일러스트(bg)는 화면 해상도로 한 번 그리고(1080p·4K 모두 선명),
//     움직이는 것(꽃잎·눈·안개·빛줄기·고래·학·반딧불)은 그 위에서 30fps 로 돈다.
//   · 번쩍임 없음: 밝기가 변하는 것은 모두 주기 ≥2초의 작은 면적(별·물비늘·반딧불) 이거나 아주 옅은 넓은 면(오로라·빛줄기 ≤0.1).
//   · 가독: 각 장면의 shade(중앙 타원 + 글자 영역 뒤 그림자)는 대비 실측(최저 픽셀 ≥4.5:1)으로 정했다 — 보고서 참고.
//   · 레퍼런스: APIS 클락 bg-sakura.jpg(1920×1080 정지 일러스트: 보랏빛 밤하늘·보름달·왼쪽 위 벚꽃 가지·양옆 꽃잎 호).

import { type Env, type Rng, clamp, makeSprite, mulberry32, rand } from '../ambienceEngine';
import type { AmbienceScene } from '../ambienceRenderer';
import { ambiencePresetById } from '../ambiencePresets';
import { combine, drift, meteor, sparkle } from './sceneFx';
import {
  type G, TAU, blossom, blurGroup, bud, canopyLine, cloud, glow, growBranch, linear, maplePath, moon, petalPath, pine, radial, reflect,
  ridge, sky, stars, streaks, strokeBranch, stripSprite, fogPaint, wrapDraw, grain, vignette,
} from './sceneKit';

/** 이름·강조색·바탕 색은 목록(ambiencePresets.ts) 한 곳에서 온다 — 테마 선택 화면과 장면이 같은 값을 말하게. */
function meta(id: string) {
  const m = ambiencePresetById(id);
  if (!m || m.kind !== 'scene') throw new Error(`scene meta missing: ${id}`);
  return { id: m.id, label: m.label, accent: m.accent, stops: m.stops };
}

// ── 입자 도안 ─────────────────────────────────────────────────────────────────
type Paint = (g: G, r: number) => void;
/** 벚꽃잎 — 밑동 진한 분홍 → 끝 연한 색, 가운데 옅은 결. 반투명. */
const petalPaint = (base: string, mid: string, tip: string): Paint => (g, r) => {
  g.save();
  g.translate(0, r * 0.95);
  const len = r * 1.9, wid = r * 1.3;
  g.fillStyle = linear(g, 0, 0, 0, -len, [[0, base], [0.45, mid], [1, tip]]);
  petalPath(g, len, wid);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.2)';
  g.lineWidth = r * 0.05;
  g.beginPath(); g.moveTo(0, -len * 0.12); g.quadraticCurveTo(wid * 0.06, -len * 0.5, 0, -len * 0.84); g.stroke();
  g.restore();
};
/** 단풍잎 — 가운데 진하고 끝이 물든다 + 잎맥 + 꼭지. */
const leafPaint = (inner: string, outer: string): Paint => (g, r) => {
  g.fillStyle = radial(g, 0, r * 0.1, r, [[0, inner], [1, outer]]);
  maplePath(g, r);
  g.fill();
  g.strokeStyle = 'rgba(60,10,5,.35)'; g.lineWidth = r * 0.045; g.lineCap = 'round';
  g.beginPath();
  for (const a of [-90, -38, 14, 166, 218]) { const t = (a * Math.PI) / 180; g.moveTo(0, 0); g.lineTo(Math.cos(t) * r * 0.78, Math.sin(t) * r * 0.78); }
  g.moveTo(0, 0); g.lineTo(0, r * 0.95);
  g.stroke();
};
/** 둥근 빛(눈송이·반딧불·먼지). core = 가운데 불투명도. */
const dotPaint = (rgb: string, core = 1, hard = 0.35): Paint => (g, r) => {
  g.fillStyle = radial(g, 0, 0, r, [[0, `rgba(${rgb},${core})`], [hard, `rgba(${rgb},${core * 0.75})`], [0.7, `rgba(${rgb},${core * 0.18})`], [1, `rgba(${rgb},0)`]]);
  g.fillRect(-r, -r, 2 * r, 2 * r);
};
/** 렌즈 보케 — 가장자리가 살짝 밝은 원반. */
const bokehPaint = (rgb: string): Paint => (g, r) => {
  g.fillStyle = radial(g, 0, 0, r, [[0, `rgba(${rgb},.5)`], [0.78, `rgba(${rgb},.62)`], [0.9, `rgba(${rgb},.85)`], [1, `rgba(${rgb},0)`]]);
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
};
/** 물비늘 — 가로로 긴 반짝임(sparkle stretch 로 더 눌린다). */
const glintPaint = (rgb: string): Paint => (g, r) => {
  g.fillStyle = radial(g, 0, 0, r, [[0, `rgba(${rgb},1)`], [0.18, `rgba(${rgb},.7)`], [0.5, `rgba(${rgb},.12)`], [1, `rgba(${rgb},0)`]]);
  g.fillRect(-r, -r, 2 * r, 2 * r);
};

const SAKURA = [
  petalPaint('rgba(232,120,156,.95)', 'rgba(255,190,208,.92)', 'rgba(255,232,238,.88)'),
  petalPaint('rgba(240,150,176,.95)', 'rgba(255,212,224,.92)', 'rgba(255,244,246,.9)'),
  petalPaint('rgba(214,98,138,.95)', 'rgba(248,170,194,.9)', 'rgba(255,220,230,.86)'),
];

// ── 공용 조각 ─────────────────────────────────────────────────────────────────
const dist = (x: number, y: number, a: number, b: number) => Math.hypot(x - a, y - b);
/** 광원 가까이일수록 1 — 꽃잎·눈이 빛을 받는 정도. */
const nearLight = (x: number, y: number, lx: number, ly: number, r: number) => { const d = clamp(1 - dist(x, y, lx, ly) / r, 0, 1); return d * d; };

/** 벚꽃 가지 한 그루(정지) — 굵은 가지는 비우고, 잔가지(끝 두 단)를 따라 꽃송이·봉오리를 드문드문 단다.
 *  깊이 세 층: 뒤(가지 뒤·어둡고 살짝 흐림) → 가지 → 가운데(선명) → 앞(크고 흐린 몇 송이 = 피사계심도). */
interface BranchStyle {
  bark: string; rim?: { color: string; ox: number; oy: number };
  back: [string, string]; front: [string, string]; edge?: string; stamen?: string;
  glowRgb?: string; glowA?: number; size: [number, number];
  /** 잔가지 길이 대비 꽃 자리 확률(0..1) */
  fill: number;
  bud?: [string, string];
  /** 수묵 — 가지 밑에 번진 먹, 위에 갈필 결 */
  ink?: boolean;
  /** 꽃 대신 잎(단풍) — (x, y, r, rot, 층 0 뒤·1 가운데·2 앞) */
  leaf?: (g: G, x: number, y: number, r: number, rot: number, layer: number) => void;
}
function sakuraBranch(g: G, rng: Rng, u: number, x: number, y: number, ang: number, len: number, wid: number, depth: number, o: BranchStyle) {
  const { segs } = growBranch(rng, x, y, ang, len * u, wid * u, depth, 0.2);
  type Spot = [number, number, number, number, number]; // x, y, r, rot, squash
  const back: Spot[] = [], mid: Spot[] = [], front: Spot[] = [], buds: Spot[] = [];
  for (const s of segs) {
    if (s.d > 1) continue;
    const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), n = Math.max(1, Math.round(L / (15 * u)));
    for (let k = 0; k < n; k++) {
      if (rng() > o.fill) continue;
      const t = (k + rand(rng, 0.2, 0.8)) / n, px = s.x0 + (s.x1 - s.x0) * t, py = s.y0 + (s.y1 - s.y0) * t;
      const c = rng() < 0.35 ? 1 : rng() < 0.7 ? 2 : 3;
      for (let j = 0; j < c; j++) {
        const sp: Spot = [px + rand(rng, -9, 9) * u, py + rand(rng, -9, 9) * u, rand(rng, o.size[0], o.size[1]) * u, rng() * TAU, rand(rng, 0.5, 1)];
        const roll = rng();
        (roll < 0.3 ? back : roll < 0.965 ? mid : front).push(sp);
      }
      if (o.bud && rng() < 0.25) buds.push([px + rand(rng, -10, 10) * u, py + rand(rng, -10, 10) * u, rand(rng, 3, 5) * u, rand(rng, -0.6, 0.6) + Math.PI, 1]);
    }
  }
  // 흐린 층은 blurGroup — 꽃잎마다 흐림을 걸면 수백 번 돈다(sceneKit 머리 주석)
  blurGroup(g, 1.1 * u, (t) => { for (const [bx, by, r, rot, sq] of back) { if (o.leaf) o.leaf(t, bx, by, r * 0.9, rot, 0); else blossom(t, bx, by, r * 0.9, rot, o.back[0], o.back[1], undefined, sq); } });
  if (o.ink) { g.save(); g.globalAlpha = 0.55; blurGroup(g, 3.2 * u, (t) => strokeBranch(t, segs.map((s) => ({ ...s, w: s.w * 1.4 })), '#050403')); g.restore(); }
  strokeBranch(g, segs, o.bark, o.rim);
  if (o.ink) {
    g.lineCap = 'round';
    for (const s of segs) if (s.w > 5 * u && rng() < 0.7) { g.strokeStyle = `rgba(120,110,96,${rand(rng, 0.15, 0.35)})`; g.lineWidth = s.w * rand(rng, 0.1, 0.22); const o2 = s.w * rand(rng, -0.25, 0.25); g.beginPath(); g.moveTo(s.x0, s.y0 + o2); g.lineTo(s.x1, s.y1 + o2); g.stroke(); }
  }
  if (o.glowRgb) for (let i = 0; i < mid.length; i += 5) glow(g, mid[i][0], mid[i][1], 42 * u, o.glowRgb, o.glowA ?? 0.12);
  if (o.bud) for (const [bx, by, r, rot] of buds) bud(g, bx, by, r, rot, o.bud[0], o.bud[1]);
  for (const [bx, by, r, rot, sq] of mid) { if (o.leaf) o.leaf(g, bx, by, r, rot, 1); else blossom(g, bx, by, r, rot, o.front[0], o.front[1], o.stamen, sq, o.edge); }
  g.save(); g.globalAlpha = 0.85;
  blurGroup(g, 3.2 * u, (t) => { for (const [bx, by, r, rot, sq] of front) { if (o.leaf) o.leaf(t, bx, by, r * 1.9, rot, 2); else blossom(t, bx, by, r * 1.9, rot, o.front[0], o.front[1], undefined, sq); } });
  g.restore();
}

/** 멀리 늘어선 벚나무 — 짧은 줄기 + 부드러운 꽃 수관(빛 덩어리) + 꽃 알갱이. sc = 크기 배율. lit·shade = 'r,g,b'. */
function blossomTrees(g: G, rng: Rng, w: number, u: number, base: number, sc: number, lit: string, shade: string, a: number, trunk: string, blurPx: number) {
  for (let x = rand(rng, -60, 40) * u; x < w + 100 * u; x += rand(rng, 150, 250) * u * sc) {
    const cw = rand(rng, 200, 300) * u * sc, ch = rand(rng, 90, 140) * u * sc, cy = base - rand(rng, 20, 50) * u * sc;
    g.strokeStyle = trunk; g.lineCap = 'round';
    g.lineWidth = rand(rng, 7, 13) * u * sc;
    g.beginPath(); g.moveTo(x, base + 30 * u); g.quadraticCurveTo(x + rand(rng, -12, 12) * u, base - 10 * u * sc, x + rand(rng, -20, 20) * u * sc, cy - ch * 0.3); g.stroke();
    cloud(g, rng, x, cy, cw, ch, lit, shade, a, 42, blurPx);
    for (let k = 0; k < 70 * sc; k++) {
      g.fillStyle = `rgba(255,${Math.round(rand(rng, 208, 234))},${Math.round(rand(rng, 224, 242))},${rand(rng, 0.25, 0.65) * a})`;
      g.beginPath(); g.arc(x + rand(rng, -0.42, 0.42) * cw, cy - rand(rng, 0.05, 0.85) * ch, rand(rng, 0.9, 2.4) * u * sc, 0, TAU); g.fill();
    }
  }
}

/** 해·빛 줄기(정지) — 광원에서 퍼지는 옅은 쐐기. */
function rays(g: G, x: number, y: number, len: number, n: number, rgb: string, a: number, rng: Rng, from = -Math.PI, to = 0) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  blurGroup(g, len * 0.012, (g) => {
    for (let i = 0; i < n; i++) {
      const t = from + (to - from) * ((i + rand(rng, 0.2, 0.8)) / n), wdt = rand(rng, 0.02, 0.06);
      g.fillStyle = radial(g, x, y, len, [[0, `rgba(${rgb},${a})`], [0.6, `rgba(${rgb},${a * 0.3})`], [1, `rgba(${rgb},0)`]]);
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + Math.cos(t - wdt) * len, y + Math.sin(t - wdt) * len);
      g.lineTo(x + Math.cos(t + wdt) * len, y + Math.sin(t + wdt) * len);
      g.closePath(); g.fill();
    }
  });
  g.restore();
}

/** 흐르는 안개 띠 — init 에서 도안, under 에서 오프셋만 옮긴다. */
interface Band { img: HTMLCanvasElement; y: number; h: number; speed: number; a: number }
function makeBand(w: number, scale: number, y: number, bh: number, speed: number, a: number, seed: number, rgb: string, blobA = 0.5, blobs = 26): Band {
  return { img: stripSprite(w * 1.6, bh, scale, fogPaint(seed, rgb, blobA, blobs)), y, h: bh, speed, a };
}
function drawBand(g: G, b: Band, e: Env) {
  const W = e.w * 1.6;
  const off = ((e.time * b.speed * e.u) % W + W) % W;
  g.globalAlpha = b.a;
  g.drawImage(b.img, off - W, b.y, W, b.h);
  g.drawImage(b.img, off, b.y, W, b.h);
  g.globalAlpha = 1;
}

const finish = (g: G, w: number, h: number, dpr: number, seed: number, vig = 0.45, gr = 0.05) => { vignette(g, w, h, vig); grain(g, w, h, dpr, seed, gr); };

// ═════════════════════════════════════════════════════════════════════════════
// 벚꽃 A — 해질녘 보케
// ═════════════════════════════════════════════════════════════════════════════
const duskSun = (w: number, h: number) => [w * 0.5, h * 0.86] as const;
const sakuraDusk: AmbienceScene<{ haze: Band }> = {
  ...meta('sakura-dusk'),
  shade: { veil: 0.2, zone: 0.62 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#171133'], [0.26, '#33205a'], [0.48, '#743872'], [0.62, '#b8566e'], [0.72, '#e6846a'], [0.79, '#fbb27c'], [0.84, '#ffd49a'], [1, '#ffd49a']]);
    const [sx, sy] = duskSun(w, h);
    glow(g, sx, sy, w * 0.8, '255,140,120', 0.34, 1, 0.42);
    glow(g, sx, sy, w * 0.3, '255,196,150', 0.42, 1, 0.55);
    streaks(g, rng, w, h * 0.56, h * 0.8, 16, '255,196,170', 0.14, u);
    for (const [cx, cy, cw, ch] of [[0.16, 0.3, 700, 120], [0.84, 0.25, 760, 130], [0.5, 0.12, 980, 90], [0.06, 0.52, 520, 80], [0.95, 0.5, 560, 90]] as const) {
      cloud(g, rng, w * cx, h * cy, cw * u, ch * u, '96,48,104', '255,170,160', 0.5, 44, 1.6 * u);
    }
    glow(g, sx, sy, 70 * u, '255,226,190', 0.9);
    glow(g, sx, sy, 22 * u, '255,250,236', 1);
    g.save(); g.filter = `blur(${2 * u}px)`;
    ridge(g, w, h, { base: h * 0.87, amp: h * 0.06, freq: 2.6, seed: 11, fill: linear(g, 0, h * 0.8, 0, h * 0.92, [[0, 'rgba(180,86,112,.9)'], [1, 'rgba(120,52,90,.96)']]) });
    g.restore();
    blossomTrees(g, rng, w, u, h * 0.9, 0.45, '240,150,176', '130,56,100', 0.7, '#4a1b3a', 2 * u);
    ridge(g, w, h, { base: h * 0.93, amp: h * 0.06, freq: 3.8, seed: 12, fill: linear(g, 0, h * 0.86, 0, h, [[0, '#4c1c3c'], [1, '#2a0e24']]), rim: { color: 'rgba(255,170,130,.28)', width: 1.3 * u } });
    ridge(g, w, h, { base: h * 0.99, amp: h * 0.05, freq: 5.5, seed: 13, fill: '#170814' });
    g.save(); // 멀리 뭉개진 빛망울(정지)
    g.globalCompositeOperation = 'lighter';
    blurGroup(g, 5 * u, (t) => {
      for (let i = 0; i < 26; i++) {
        const r = rand(rng, 16, 60) * u, x = rand(rng, 0, w), y = rand(rng, 0.05, 0.8) * h;
        t.fillStyle = `rgba(255,${Math.round(rand(rng, 150, 210))},${Math.round(rand(rng, 150, 190))},${rand(rng, 0.05, 0.12)})`;
        t.beginPath(); t.arc(x, y, r, 0, TAU); t.fill();
      }
    });
    g.restore();
    const opt: BranchStyle = {
      bark: '#22101c', rim: { color: 'rgba(255,170,140,.5)', ox: 0, oy: 1.3 * u },
      back: ['rgba(170,76,112,.8)', 'rgba(222,160,178,.62)'], front: ['rgba(228,104,142,.97)', 'rgba(255,232,236,.96)'],
      edge: 'rgba(170,60,96,.3)', stamen: 'rgba(255,214,150,.9)', glowRgb: '255,160,170', glowA: 0.12, size: [7, 12], fill: 0.62,
      bud: ['rgba(214,74,114,.95)', 'rgba(80,28,40,.9)'],
    };
    sakuraBranch(g, rng, u, w + 30 * u, h * 0.03, Math.PI * 0.97, 470, 24, 4, opt);
    sakuraBranch(g, rng, u, -30 * u, -h * 0.01, 0.22, 330, 17, 3, opt);
    finish(g, w, h, dpr, 101, 0.28);
  },
  init: (w, h, _u, scale) => ({ haze: makeBand(w, scale, h * 0.66, h * 0.2, 7, 0.55, 5, '255,170,150', 0.18) }),
  under(g, e, s) { drawBand(g, s.haze, e); },
  fx: combine(
    [drift({
      density: 96, maxAlpha: 0.9, size: [9, 46], fall: [22, 62], wind: 40, flow: 26, gust: 160, spin: 1.6, flip: true,
      alpha: [0.5, 0.88], paint: SAKURA, haze: 0.5,
      light: (x, y, e) => { const [sx, sy] = duskSun(e.w, e.h); return 0.7 * nearLight(x, y, sx, sy, e.w * 0.5); },
    }), 96],
    [drift({ density: 14, maxAlpha: 0.14, size: [44, 120], fall: [-4, -8], wind: 6, flow: 5, gust: 0, spin: 0, flip: false, alpha: [0.06, 0.14], paint: [bokehPaint('255,196,176')], additive: true, wander: 7 }), 14],
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
// 벚꽃 B — 수묵 여백
// ═════════════════════════════════════════════════════════════════════════════
const sakuraInk: AmbienceScene<{ mist: Band }> = {
  ...meta('sakura-ink'),
  shade: { veil: 0.2, zone: 0.5 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#26221c'], [0.55, '#1e1b16'], [1, '#141310']]);
    for (let i = 0; i < 46; i++) glow(g, rand(rng, 0, w), rand(rng, 0, h), rand(rng, 80, 280) * u, rng() < 0.55 ? '255,244,222' : '0,0,0', rand(rng, 0.02, 0.05));
    // 한지 결 — 짧게 휜 섬유
    g.lineCap = 'round';
    for (let i = 0; i < 1400; i++) {
      const x = rand(rng, 0, w), y = rand(rng, 0, h), l = rand(rng, 6, 44) * u, a = rng() * TAU;
      g.strokeStyle = rng() < 0.7 ? `rgba(255,246,228,${rand(rng, 0.018, 0.05)})` : `rgba(0,0,0,${rand(rng, 0.05, 0.1)})`;
      g.lineWidth = rand(rng, 0.4, 1.1) * u;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // 달 번짐 — 테두리 없는 옅은 먹 원
    glow(g, w * 0.74, h * 0.17, 180 * u, '236,226,204', 0.14);
    g.save(); g.filter = `blur(${1.5 * u}px)`; g.fillStyle = 'rgba(240,232,212,.2)'; g.beginPath(); g.arc(w * 0.74, h * 0.17, 56 * u, 0, TAU); g.fill(); g.restore();
    g.save(); g.filter = `blur(${2.5 * u}px)`; // 먼 산 — 옅은 먹 두 겹(산수의 깊이)
    ridge(g, w, h, { base: h * 0.86, amp: h * 0.28, freq: 1.6, seed: 21, ridged: true, fill: linear(g, 0, h * 0.55, 0, h * 0.9, [[0, 'rgba(120,112,98,.26)'], [1, 'rgba(120,112,98,0)']]) });
    ridge(g, w, h, { base: h * 0.95, amp: h * 0.22, freq: 2.3, seed: 22, ridged: true, fill: linear(g, 0, h * 0.7, 0, h, [[0, 'rgba(70,64,56,.4)'], [1, 'rgba(70,64,56,0)']]) });
    g.restore();
    // 가지 뒤 옅은 물번짐(먹색 가지가 읽히는 바탕)
    glow(g, w * 0.1, h * 0.62, 460 * u, '210,198,176', 0.09, 1.3, 0.8);
    const ink: BranchStyle = {
      bark: 'rgba(12,10,8,.94)', back: ['rgba(170,110,122,.45)', 'rgba(210,190,188,.35)'], front: ['rgba(206,122,140,.66)', 'rgba(240,222,220,.6)'],
      edge: 'rgba(180,100,118,.3)', size: [8, 14], fill: 0.42, bud: ['rgba(214,120,140,.7)', 'rgba(20,16,12,.85)'], ink: true,
    };
    sakuraBranch(g, rng, u, -40 * u, h * 0.9, -0.62, 380, 28, 4, ink);
    sakuraBranch(g, rng, u, -30 * u, h * 0.62, -0.18, 250, 14, 3, ink);
    finish(g, w, h, dpr, 202, 0.5, 0.08);
  },
  init: (w, h, _u, scale) => ({ mist: makeBand(w, scale, h * 0.3, h * 0.5, 4, 0.5, 9, '220,210,190', 0.1) }),
  under(g, e, s) { drawBand(g, s.mist, e); },
  fx: drift({
    density: 34, maxAlpha: 0.72, size: [10, 30], fall: [12, 30], wind: 20, flow: 14, gust: 70, spin: 1.1, flip: true,
    alpha: [0.35, 0.72], spawnX: [-0.2, 0.4],
    paint: [petalPaint('rgba(200,120,138,.9)', 'rgba(230,196,200,.86)', 'rgba(244,232,226,.82)'), petalPaint('rgba(214,150,160,.88)', 'rgba(236,214,214,.84)', 'rgba(248,242,236,.8)')],
  }),
};

// ═════════════════════════════════════════════════════════════════════════════
// 벚꽃 C — 밤 벚꽃 · 등불
// ═════════════════════════════════════════════════════════════════════════════
/** 등불 자리 — 머리말과 옆 패널 사이 띠에 두 줄로 걸린다. */
let lanternMemo: { k: string; v: [number, number, number][] } | null = null;
function lanterns(w: number, h: number) {
  const key = `${w}x${h}`;
  if (lanternMemo?.k === key) return lanternMemo.v; // 입자 빛 계산이 프레임마다 부른다 — 배열을 새로 만들지 않게
  const out: [number, number, number][] = [];
  const line = (x0: number, x1: number, y0: number, sag: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t;
      out.push([x * w, (y0 + sag * 4 * t * (1 - t)) * h, i]);
    }
  };
  line(-0.02, 0.44, 0.115, 0.05, 5);
  line(0.56, 1.02, 0.115, 0.05, 5);
  lanternMemo = { k: key, v: out };
  return out;
}
const sakuraNight: AmbienceScene<{ fog: Band; fog2: Band; lamps: [number, number, number][] }> = {
  ...meta('sakura-night'),
  shade: { veil: 0.2, zone: 0.6 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#050a22'], [0.45, '#0c1740'], [0.72, '#1b2458'], [0.9, '#2e2a62'], [1, '#2e2a62']]);
    glow(g, w * 0.5, h * 1.02, w * 0.9, '255,140,130', 0.14, 1, 0.3);
    stars(g, rng, w, h, 300, u, 0.6);
    moon(g, w * 0.15, h * 0.27, 54 * u, '180,190,255', rng);
    cloud(g, rng, w * 0.28, h * 0.33, 620 * u, 70 * u, '150,160,220', '40,44,96', 0.4, 36, 1.6 * u);
    cloud(g, rng, w * 0.62, h * 0.22, 520 * u, 50 * u, '120,130,200', '30,36,84', 0.3, 30, 1.6 * u);
    blossomTrees(g, rng, w, u, h * 0.78, 0.6, '176,140,210', '44,44,100', 0.7, '#0a0d26', 2.5 * u);
    glow(g, w * 0.5, h * 0.8, w * 0.8, '255,160,190', 0.1, 1, 0.12);
    blossomTrees(g, rng, w, u, h * 0.92, 1, '246,176,212', '96,60,128', 0.85, '#070918', 2 * u);
    g.fillStyle = linear(g, 0, h * 0.86, 0, h, [[0, 'rgba(4,6,20,0)'], [1, 'rgba(4,6,20,.9)']]);
    g.fillRect(0, h * 0.86, w, h * 0.14);
    const L = lanterns(w, h);
    g.strokeStyle = 'rgba(8,8,18,.85)'; g.lineWidth = 1.6 * u;
    for (const [x0, x1] of [[-0.02, 0.44], [0.56, 1.02]]) { g.beginPath(); for (let t = 0; t <= 1.001; t += 0.02) { const x = (x0 + (x1 - x0) * t) * w, y = (0.1 + 0.05 * 4 * t * (1 - t)) * h; if (t) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    for (const [x, y] of L) {
      glow(g, x, y + 22 * u, 150 * u, '255,150,90', 0.24);
      g.strokeStyle = 'rgba(8,8,18,.85)'; g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(x, y - 12 * u); g.lineTo(x, y + 2 * u); g.stroke();
      const bw = 17 * u, bh = 24 * u, cy = y + 24 * u;
      g.fillStyle = radial(g, x - bw * 0.2, cy - bh * 0.2, bw * 1.4, [[0, '#ffe8b4'], [0.45, '#ffa458'], [1, '#c2412c']]);
      g.beginPath(); g.ellipse(x, cy, bw, bh, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(120,30,20,.35)'; g.lineWidth = 0.8 * u;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.ellipse(x, cy, bw * (1 - Math.abs(k) * 0.02), bh * (0.25 + 0.18 * Math.abs(k)), 0, 0, TAU); g.stroke(); }
      g.fillStyle = '#16100e'; g.fillRect(x - bw * 0.55, cy - bh - 3 * u, bw * 1.1, 5 * u); g.fillRect(x - bw * 0.55, cy + bh - 2 * u, bw * 1.1, 5 * u);
    }
    sakuraBranch(g, rng, u, w + 30 * u, h * 0.2, Math.PI * 0.98, 420, 22, 4, {
      bark: '#080a18', rim: { color: 'rgba(255,170,120,.35)', ox: 0, oy: 1.3 * u },
      back: ['rgba(130,90,160,.75)', 'rgba(180,140,200,.55)'], front: ['rgba(232,116,158,.96)', 'rgba(255,228,238,.95)'],
      edge: 'rgba(150,60,110,.3)', stamen: 'rgba(255,220,160,.85)', glowRgb: '255,160,190', glowA: 0.12, size: [7, 12], fill: 0.62,
      bud: ['rgba(214,80,130,.95)', 'rgba(30,20,40,.9)'],
    });
    finish(g, w, h, dpr, 303, 0.3);
  },
  init: (w, h, _u, scale) => ({
    fog: makeBand(w, scale, h * 0.74, h * 0.26, 6, 0.6, 21, '150,150,210', 0.16),
    fog2: makeBand(w, scale, h * 0.82, h * 0.2, -9, 0.5, 22, '170,160,220', 0.14),
    lamps: lanterns(w, h),
  }),
  under(g, e, s) {
    drawBand(g, s.fog, e); drawBand(g, s.fog2, e);
    for (const [x, y, i] of s.lamps) { // 등불 숨결 — 주기 5~8초, ±10%
      const b = 0.9 + 0.1 * Math.sin(e.time * (0.8 + (i % 3) * 0.2) + i * 1.9);
      glow(g, x, y + 22 * e.u, 70 * e.u, '255,170,100', 0.16 * b, 1, 1, 'lighter');
    }
  },
  fx: combine(
    [drift({
      density: 88, maxAlpha: 0.86, size: [8, 40], fall: [18, 50], wind: 26, flow: 22, gust: 120, spin: 1.4, flip: true,
      alpha: [0.4, 0.8], paint: [petalPaint('rgba(214,120,160,.94)', 'rgba(250,196,216,.9)', 'rgba(255,232,240,.86)'), SAKURA[1], SAKURA[2]], haze: 0.6,
      light: (x, y, e) => {
        let l = nearLight(x, y, e.w * 0.15, e.h * 0.26, e.w * 0.22) * 0.5;
        for (const [lx, ly] of lanterns(e.w, e.h)) l = Math.max(l, nearLight(x, y, lx, ly + 24 * e.u, 230 * e.u));
        return l;
      },
    }), 88],
    [drift({ density: 16, maxAlpha: 0.5, size: [2, 6], fall: [-6, -12], wind: 4, flow: 6, gust: 0, spin: 0, flip: false, alpha: [0.25, 0.5], paint: [dotPaint('255,200,140')], additive: true, wander: 10, pulse: [3, 6] }), 16],
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
// 여름 — 달빛 밤바다
// ═════════════════════════════════════════════════════════════════════════════
const SEA_Y = 0.64;
const summerSea: AmbienceScene = {
  ...meta('summer-sea'),
  shade: { veil: 0.2, zone: 0.6 },
  paint(g, w, h, u, rng, dpr) {
    const hy = h * SEA_Y, mx = w * 0.72, my = h * 0.24;
    sky(g, w, h, [[0, '#050d26'], [0.35, '#0b1f47'], [0.52, '#1d3d6e'], [0.6, '#38598a'], [SEA_Y, '#6a7ca6'], [1, '#6a7ca6']]);
    glow(g, mx, hy, w * 0.7, '150,170,220', 0.18, 1, 0.3);
    stars(g, rng, w, h, 260, u, 0.5);
    moon(g, mx, my, 50 * u, '190,205,255', rng);
    for (const [cx, cy, cw, ch, a] of [[0.55, 0.3, 700, 70, 0.45], [0.88, 0.36, 560, 60, 0.4], [0.2, 0.2, 800, 80, 0.3], [0.35, 0.46, 900, 50, 0.3]] as const) {
      cloud(g, rng, w * cx, h * cy, cw * u, ch * u, '200,215,245', '50,70,120', a, 40, 1.6 * u);
    }
    streaks(g, rng, w, h * 0.5, hy - 6 * u, 12, '170,190,235', 0.12, u);
    g.save(); g.beginPath(); g.rect(0, 0, w * 0.34, h); g.clip();
    ridge(g, w, h, { base: hy + 2 * u, amp: h * 0.05, freq: 4, seed: 41, fill: '#101c3c' });
    g.restore();
    g.save(); g.beginPath(); g.rect(w * 0.86, 0, w * 0.14, h); g.clip();
    ridge(g, w, h, { base: hy + 2 * u, amp: h * 0.03, freq: 6, seed: 42, fill: '#132042' });
    g.restore();
    g.fillStyle = linear(g, 0, hy, 0, h, [[0, '#26467a'], [0.3, '#12284f'], [1, '#040c1f']]);
    g.fillRect(0, hy, w, h - hy);
    for (let k = 0; k < 8; k++) { const t = k / 7; glow(g, mx, hy + (h - hy) * t * 0.95, w * (0.03 + 0.12 * t), '200,215,255', 0.2 * (1 - t * 0.55), 1, 1.3 - t * 0.6); }
    for (let i = 0; i < 360; i++) {
      const t = Math.pow(rng(), 1.6), y = hy + t * (h - hy), spread = w * (0.03 + 0.18 * t);
      const nearMoon = rng() < 0.6;
      const x = nearMoon ? mx + (rng() + rng() - 1) * spread : rng() * w;
      const len = (20 + 220 * t) * u * rand(rng, 0.5, 1.3);
      g.fillStyle = nearMoon ? `rgba(215,228,255,${0.06 + 0.18 * (1 - Math.abs(x - mx) / spread)})` : `rgba(140,170,225,${0.03 + 0.05 * rng()})`;
      g.fillRect(x - len / 2, y, len, Math.max(0.7, (0.6 + 2 * t) * u));
    }
    finish(g, w, h, dpr, 404, 0.28);
  },
  fx: combine(
    [sparkle({
      density: 70, maxAlpha: 0.85, size: [8, 22], life: [1.2, 2.6], stretch: [3.2, 0.45], paint: glintPaint('225,235,255'),
      at: (rng, e) => { const hy = e.h * SEA_Y, t = Math.pow(rng(), 1.4), y = hy + 6 * e.u + t * (e.h - hy); return [e.w * 0.72 + (rng() + rng() - 1) * e.w * (0.02 + 0.15 * t), y]; },
    }), 70],
    [sparkle({ density: 26, maxAlpha: 0.7, size: [3, 6], life: [3, 6], paint: dotPaint('230,236,255', 1, 0.2), at: (rng, e) => [rng() * e.w, rng() * e.h * 0.5] }), 26],
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
// 가을 — 노을 단풍 능선
// ═════════════════════════════════════════════════════════════════════════════
const autumnSun = (w: number, h: number) => [w * 0.62, h * 0.74] as const;
const LEAVES = [leafPaint('rgba(214,52,34,.96)', 'rgba(150,20,18,.94)'), leafPaint('rgba(240,128,40,.96)', 'rgba(196,70,24,.94)'), leafPaint('rgba(236,170,58,.95)', 'rgba(204,110,30,.92)'), leafPaint('rgba(170,30,28,.95)', 'rgba(110,14,16,.94)')];
const autumnRidges: AmbienceScene<{ mist: Band }> = {
  ...meta('autumn-maple'),
  shade: { veil: 0.2, zone: 0.62 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#241430'], [0.24, '#5a2336'], [0.44, '#a33c30'], [0.6, '#dc6a30'], [0.7, '#ffa04a'], [0.75, '#ffd08a'], [1, '#ffd08a']]);
    const [sx, sy] = autumnSun(w, h);
    glow(g, sx, sy, w * 0.7, '255,150,70', 0.36, 1, 0.5);
    glow(g, sx, sy, w * 0.2, '255,210,140', 0.45);
    streaks(g, rng, w, h * 0.3, h * 0.66, 18, '255,170,110', 0.14, u);
    for (const [cx, cy, cw, ch] of [[0.2, 0.22, 800, 100], [0.72, 0.16, 700, 90], [0.4, 0.4, 600, 60]] as const) cloud(g, rng, w * cx, h * cy, cw * u, ch * u, '110,40,50', '255,150,90', 0.45, 40, 1.6 * u);
    glow(g, sx, sy, 60 * u, '255,236,200', 0.9);
    glow(g, sx, sy, 20 * u, '255,250,236', 1);
    const layers: [number, number, string, number][] = [[0.7, 0.12, 'rgba(220,120,80,.5)', 2], [0.75, 0.13, 'rgba(180,80,62,.72)', 2.6], [0.8, 0.13, 'rgba(130,48,48,.9)', 3.2], [0.86, 0.12, '#5c1f26', 3.8], [0.92, 0.11, '#34111a', 4.6], [0.99, 0.09, '#170709', 5.6]];
    layers.forEach(([b, a, c, f], i) => {
      ridge(g, w, h, { base: h * b, amp: h * a, freq: f, seed: 51 + i, fill: c, ridged: true, rim: i < 4 ? { color: 'rgba(255,170,100,.22)', width: 1.2 * u } : undefined });
      glow(g, w * 0.5, h * (b + 0.015), w * 0.8, '255,150,90', 0.12 - i * 0.018, 1, 0.07);
    });
    sakuraBranch(g, rng, u, -30 * u, h * 0.02, 0.24, 420, 22, 4, {
      bark: '#1a0a0c', rim: { color: 'rgba(255,160,90,.4)', ox: 0, oy: 1.2 * u }, back: ['', ''], front: ['', ''], size: [11, 18], fill: 0.5,
      glowRgb: '255,120,60', glowA: 0.08,
      leaf: (gg, x, y, r, rot, layer) => { gg.save(); gg.translate(x, y); gg.rotate(rot); if (layer === 0) gg.globalAlpha = 0.7; LEAVES[Math.floor(Math.abs(Math.sin(x * 12.9 + y)) * 97) % LEAVES.length](gg, r); gg.restore(); },
    });
    finish(g, w, h, dpr, 505, 0.28);
  },
  init: (w, h, _u, scale) => ({ mist: makeBand(w, scale, h * 0.74, h * 0.16, 5, 0.5, 31, '240,150,110', 0.12) }),
  under(g, e, s) { drawBand(g, s.mist, e); },
  fx: combine(
    [drift({
      density: 52, maxAlpha: 0.9, size: [12, 54], fall: [28, 72], wind: 32, flow: 24, gust: 150, spin: 2.2, flip: true,
      alpha: [0.5, 0.9], paint: LEAVES, haze: 0.5,
      light: (x, y, e) => { const [sx, sy] = autumnSun(e.w, e.h); return 0.6 * nearLight(x, y, sx, sy, e.w * 0.45); },
    }), 52],
    [drift({ density: 20, maxAlpha: 0.35, size: [2, 7], fall: [-4, -8], wind: 8, flow: 6, gust: 0, spin: 0, flip: false, alpha: [0.18, 0.35], paint: [dotPaint('255,200,140')], additive: true, wander: 9 }), 20],
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
// 겨울 — 달밤 설원 전나무숲
// ═════════════════════════════════════════════════════════════════════════════
const SNOW = [dotPaint('255,255,255', 0.95, 0.5)];
const winterForest: AmbienceScene<{ mist: Band }> = {
  ...meta('winter-forest'),
  shade: { veil: 0.2, zone: 0.6 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#050b1f'], [0.4, '#0e1c40'], [0.6, '#1f3766'], [0.7, '#3d5a8a'], [1, '#3d5a8a']]);
    stars(g, rng, w, h, 240, u, 0.55);
    moon(g, w * 0.78, h * 0.2, 46 * u, '190,210,255', rng);
    cloud(g, rng, w * 0.62, h * 0.3, 700 * u, 60 * u, '170,190,235', '50,70,120', 0.3, 30, 1.6 * u);
    ridge(g, w, h, { base: h * 0.68, amp: h * 0.24, freq: 2.2, seed: 61, ridged: true, fill: linear(g, 0, h * 0.44, 0, h * 0.7, [[0, 'rgba(206,220,245,.96)'], [0.5, 'rgba(140,160,205,.96)'], [1, 'rgba(70,90,138,.98)']]), rim: { color: 'rgba(240,246,255,.6)', width: 1.4 * u } });
    g.save(); g.globalAlpha = 0.55;
    ridge(g, w, h, { base: h * 0.7, amp: h * 0.2, freq: 3.4, seed: 64, ridged: true, fill: linear(g, 0, h * 0.5, 0, h * 0.7, [[0, 'rgba(40,56,100,.9)'], [1, 'rgba(30,44,84,.95)']]) });
    g.restore();
    glow(g, w * 0.5, h * 0.7, w * 0.8, '170,190,235', 0.2, 1, 0.1);
    const t1 = ridge(g, w, h, { base: h * 0.78, amp: h * 0.04, freq: 3, seed: 62, fill: '#2a3c64' });
    for (let x = 0; x < w; x += rand(rng, 12, 26) * u) pine(g, rng, x, t1(x) + 8 * u, rand(rng, 50, 110) * u, rand(rng, 22, 38) * u, '#223358', '170,190,232');
    glow(g, w * 0.5, h * 0.82, w * 0.8, '160,180,230', 0.14, 1, 0.08);
    const t2 = ridge(g, w, h, { base: h * 0.9, amp: h * 0.03, freq: 4, seed: 63, fill: linear(g, 0, h * 0.86, 0, h, [[0, '#5a70a0'], [1, '#243458']]), rim: { color: 'rgba(225,235,255,.45)', width: 1.2 * u } });
    for (let x = 0; x < w; x += rand(rng, 36, 80) * u) if (x < w * 0.28 || x > w * 0.72 || rng() < 0.2) pine(g, rng, x, t2(x) + 6 * u, rand(rng, 120, 230) * u, rand(rng, 46, 78) * u, '#101a34', '190,205,240');
    pine(g, rng, w * 0.015, h * 1.03, h * 0.98, 320 * u, '#070c1c', '205,218,248');
    pine(g, rng, w * 0.985, h * 1.03, h * 0.92, 300 * u, '#070c1c', '205,218,248');
    finish(g, w, h, dpr, 606, 0.3);
  },
  init: (w, h, _u, scale) => ({ mist: makeBand(w, scale, h * 0.6, h * 0.2, 5, 0.6, 41, '150,170,220', 0.14) }),
  under(g, e, s) { drawBand(g, s.mist, e); },
  fx: drift({ density: 150, maxAlpha: 0.78, size: [2.6, 24], fall: [24, 72], wind: 22, flow: 20, gust: 120, spin: 0, flip: false, alpha: [0.45, 0.72], paint: SNOW, haze: 0.3 }),
};

// ═════════════════════════════════════════════════════════════════════════════
// 날씨 — 운해 일출
// ═════════════════════════════════════════════════════════════════════════════
function cloudStrip(w: number, bh: number, scale: number, seed: number, lit: string, shade: string, blurPx: number) {
  return stripSprite(w * 1.6, bh, scale, (g, W, H) => {
    const r = mulberry32(seed);
    for (let i = 0; i < 16; i++) {
      const x = r() * W, cw = W * (0.1 + 0.12 * r()), ch = H * (0.3 + 0.35 * r()), cs = Math.floor(r() * 1e9);
      wrapDraw(W, (dx) => cloud(g, mulberry32(cs), x + dx, H * 0.78, cw, ch, lit, shade, 0.95, 40, blurPx * scale)); // 세 벌이 같은 모양(이음새 없음)
    }
  });
}
const cloudSea: AmbienceScene<{ b: Band[] }> = {
  ...meta('cloud-sea'),
  shade: { veil: 0.2, zone: 0.62 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#0b1638'], [0.24, '#2a2f66'], [0.4, '#6a4c86'], [0.52, '#c97a86'], [0.58, '#ffb48a'], [0.62, '#ffd9a8'], [1, '#ffd9a8']]);
    const sx = w * 0.3, sy = h * 0.63;
    glow(g, sx, sy, w * 0.8, '255,170,130', 0.34, 1, 0.45);
    glow(g, sx, sy, w * 0.2, '255,220,170', 0.5);
    streaks(g, rng, w, h * 0.3, h * 0.56, 18, '255,190,190', 0.13, u);
    glow(g, sx, sy, 50 * u, '255,244,220', 0.95);
    ridge(g, w, h, { base: h * 0.74, amp: h * 0.3, freq: 1.5, seed: 71, ridged: true, fill: 'rgba(80,66,120,.75)', rim: { color: 'rgba(255,190,160,.35)', width: 1.2 * u } });
    ridge(g, w, h, { base: h * 0.8, amp: h * 0.38, freq: 1.1, seed: 72, ridged: true, fill: linear(g, 0, h * 0.4, 0, h * 0.8, [[0, '#2a2548'], [1, '#161430']]), rim: { color: 'rgba(255,196,160,.55)', width: 1.4 * u } });
    g.fillStyle = linear(g, 0, h * 0.7, 0, h, [[0, 'rgba(150,124,176,1)'], [1, 'rgba(60,54,100,1)']]);
    g.fillRect(0, h * 0.76, w, h * 0.24);
    finish(g, w, h, dpr, 707, 0.26);
  },
  init: (w, h, _u, scale) => {
    const mk = (y: number, bh: number, sp: number, a: number, seed: number, lit: string, shade: string, bl: number): Band => ({ img: cloudStrip(w, bh, scale, seed, lit, shade, bl), y, h: bh, speed: sp, a });
    return {
      b: [
        mk(h * 0.56, h * 0.2, 6, 0.9, 1, '255,214,206', '150,126,176', 4),
        mk(h * 0.64, h * 0.24, 11, 0.92, 2, '246,196,196', '120,104,160', 3),
        mk(h * 0.76, h * 0.28, 18, 0.95, 3, '214,170,190', '84,76,130', 2),
      ],
    };
  },
  under(g, e, s) { for (const b of s.b) drawBand(g, b, e); },
  fx: drift({ density: 22, maxAlpha: 0.4, size: [2, 8], fall: [-3, -6], wind: 10, flow: 6, gust: 0, spin: 0, flip: false, alpha: [0.2, 0.4], paint: [dotPaint('255,220,190')], additive: true, wander: 8 }),
};

// ═════════════════════════════════════════════════════════════════════════════
// 날씨 — 은하수
// ═════════════════════════════════════════════════════════════════════════════
const milkyBand = (w: number, h: number) => (x: number, y: number) => {
  const ax = w * 0.08, ay = h * 1.0, bx = w * 0.98, by = -h * 0.05;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  const d = Math.abs((x - ax) * dy - (y - ay) * dx) / L;
  return Math.exp(-((d / (w * 0.1)) ** 2));
};
const milkyWay: AmbienceScene = {
  ...meta('milky-way'),
  shade: { veil: 0.2, zone: 0.62 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#03050e'], [0.55, '#070c20'], [0.82, '#111a33'], [1, '#1c2a3a']]);
    glow(g, w * 0.5, h * 1.0, w * 0.9, '70,140,120', 0.16, 1, 0.2);
    const band = milkyBand(w, h);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 90; i++) {
      const t = rng(), x = w * (0.08 + 0.9 * t) + rand(rng, -90, 90) * u, y = h * (1 - 1.05 * t) + rand(rng, -90, 90) * u;
      const warm = t < 0.45;
      glow(g, x, y, rand(rng, 90, 280) * u, warm ? '255,196,160' : rng() < 0.5 ? '160,150,255' : '140,196,255', rand(rng, 0.05, 0.1) * (warm ? 1.4 : 1));
    }
    g.restore();
    for (let i = 0; i < 40; i++) { const t = rng(); glow(g, w * (0.08 + 0.9 * t) + rand(rng, -30, 60) * u, h * (1 - 1.05 * t) + rand(rng, -20, 50) * u, rand(rng, 40, 130) * u, '2,3,10', rand(rng, 0.25, 0.45), 1.8, 0.45); }
    stars(g, rng, w, h, 1800, u * 0.8, 1);
    stars(g, rng, w, h, 7000, u * 0.7, 1, band);
    for (let i = 0; i < 30; i++) { const x = rng() * w, y = rng() * h * 0.8; glow(g, x, y, 12 * u, '220,230,255', 0.5); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 1.4 * u, 0, TAU); g.fill(); }
    const top = ridge(g, w, h, { base: h * 0.95, amp: h * 0.14, freq: 2.2, seed: 81, ridged: true, fill: '#03050b', rim: { color: 'rgba(120,170,160,.2)', width: 1.2 * u } });
    for (let x = 0; x < w; x += rand(rng, 6, 16) * u) pine(g, rng, x, top(x) + 3 * u, rand(rng, 18, 46) * u, rand(rng, 9, 16) * u, '#03050b');
    finish(g, w, h, dpr, 808, 0.26, 0.04);
  },
  fx: combine(
    [sparkle({ density: 64, maxAlpha: 0.9, size: [4, 9], life: [2.5, 5.5], paint: dotPaint('235,240,255', 1, 0.15), at: (rng, e) => { const b = milkyBand(e.w, e.h); for (let i = 0; i < 6; i++) { const x = rng() * e.w, y = rng() * e.h * 0.82; if (rng() < 0.35 + b(x, y)) return [x, y]; } return [rng() * e.w, rng() * e.h * 0.8]; } }), 64],
    [meteor([0.35, 0.02, 1, 0.3]), 2],
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
// 날씨 — 오로라 호수
// ═════════════════════════════════════════════════════════════════════════════
const AUR_Y = 0.66;
const aurora: AmbienceScene<{ ray: HTMLCanvasElement }> = {
  ...meta('aurora-lake'),
  shade: { veil: 0.2, zone: 0.64 },
  paint(g, w, h, u, rng, dpr) {
    const hy = h * AUR_Y;
    sky(g, w, h, [[0, '#020816'], [0.35, '#061a30'], [0.55, '#0b3044'], [AUR_Y, '#15475a'], [1, '#15475a']]);
    stars(g, rng, w, h, 360, u, AUR_Y);
    glow(g, w * 0.5, h * 0.36, w * 0.7, '60,220,160', 0.16, 1, 0.45);
    glow(g, w * 0.3, h * 0.2, w * 0.4, '150,90,230', 0.08, 1, 0.5);
    ridge(g, w, h, { base: hy, amp: h * 0.15, freq: 2.6, seed: 91, ridged: true, fill: linear(g, 0, hy - h * 0.15, 0, hy, [[0, '#0c2230'], [1, '#06121c']]), rim: { color: 'rgba(140,255,210,.25)', width: 1.3 * u } });
    const sh = ridge(g, w, h, { base: hy + 1, amp: h * 0.02, freq: 5, seed: 92, fill: '#040c14' });
    for (let x = 0; x < w; x += rand(rng, 8, 20) * u) if (x < w * 0.4 || x > w * 0.62) pine(g, rng, x, sh(x) + 2 * u, rand(rng, 20, 64) * u, rand(rng, 10, 18) * u, '#030a11');
    reflect(g, w, h, hy + 2 * u, dpr, rng, u, 0.5, 'rgba(3,12,22,1)');
    finish(g, w, h, dpr, 909, 0.26, 0.04);
  },
  init: (_w, _h, _u, scale) => ({
    ray: makeSprite(Math.max(4, Math.round(10 * scale)), Math.max(16, Math.round(420 * scale)), (g) => {
      const W = g.canvas.width, H = g.canvas.height;
      const gv = g.createLinearGradient(0, 0, 0, H);
      gv.addColorStop(0, 'rgba(160,90,255,0)'); gv.addColorStop(0.3, 'rgba(160,110,255,.28)'); gv.addColorStop(0.62, 'rgba(90,240,190,.7)');
      gv.addColorStop(0.9, 'rgba(140,255,200,1)'); gv.addColorStop(1, 'rgba(140,255,200,0)');
      g.fillStyle = gv; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-in';
      const gh = g.createLinearGradient(0, 0, W, 0);
      gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(0.5, 'rgba(0,0,0,1)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gh; g.fillRect(0, 0, W, H);
    }),
  }),
  under(g, e, s) {
    const { w, h, u, time: t } = e, hy = h * AUR_Y, N = 120;
    g.globalCompositeOperation = 'lighter';
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < N; i++) {
        const f = i / N, x = w * (-0.05 + 1.1 * f);
        const base = h * (0.4 + 0.07 * Math.sin(f * 7 + t * 0.12 + c * 2) + 0.035 * Math.sin(f * 19 - t * 0.2 + c));
        const len = h * (0.2 + 0.09 * Math.sin(f * 11 + t * 0.09 + c * 3));
        const b = Math.pow(0.5 + 0.5 * Math.sin(f * 13 - t * (0.35 + c * 0.12) + c), 2);
        const a = (0.07 + 0.16 * b) * (c ? 0.7 : 1);
        const cw = (w / N) * 2.6;
        g.globalAlpha = a;
        g.drawImage(s.ray, x - cw / 2, base - len, cw, len);
        const ry = 2 * hy - base; // 호수 반사(흐리고 어둡게)
        if (ry < h) { g.globalAlpha = a * 0.35; g.save(); g.translate(x, ry); g.scale(1, -1); g.drawImage(s.ray, -cw / 2 + Math.sin(i * 1.7 + t) * 2 * u, -len * 0.7, cw, len * 0.7); g.restore(); }
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // 수면 아래를 다시 눌러 반사가 하늘보다 어둡게
    g.fillStyle = 'rgba(2,8,16,.35)'; g.fillRect(0, hy + 2 * u, w, h - hy);
  },
  fx: sparkle({ density: 44, maxAlpha: 0.85, size: [4, 8], life: [3, 6], paint: dotPaint('230,245,255', 1, 0.15), at: (rng, e) => [rng() * e.w, rng() * e.h * AUR_Y * 0.95] }),
};

// ═════════════════════════════════════════════════════════════════════════════
// 날씨 — 첫눈 내리는 가로등 길
// ═════════════════════════════════════════════════════════════════════════════
let lampMemo: { k: string; v: { x: number; base: number; top: number; s: number }[] } | null = null;
const lamps = (w: number, h: number) => {
  const key = `${w}x${h}`;
  if (lampMemo?.k !== key) lampMemo = { k: key, v: [0, 1, 2, 3, 4, 5].map((i) => {
    const t = i / 5, x = w * (0.9 - 0.7 * t), base = h * (1.02 - 0.24 * t), ht = h * (0.66 - 0.5 * t);
    return { x, base, top: base - ht, s: 1 - 0.8 * t };
  }) };
  return lampMemo.v;
};
const firstSnow: AmbienceScene = {
  ...meta('first-snow'),
  shade: { veil: 0.2, zone: 0.62 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#0d0e2a'], [0.4, '#1f2150'], [0.66, '#3b3670'], [0.78, '#5a4a7e'], [1, '#2a2a52']]);
    glow(g, w * 0.35, h * 0.78, w * 0.7, '255,176,130', 0.16, 1, 0.3);
    canopyLine(g, rng, w, h, h * 0.75, h * 0.04, 34 * u, '28,28,66');
    g.fillStyle = linear(g, 0, h * 0.76, 0, h, [[0, '#4a4c7e'], [0.5, '#2c2d58'], [1, '#141530']]);
    g.fillRect(0, h * 0.76, w, h * 0.24);
    for (const side of [0.07, 0.95]) {
      const { segs } = growBranch(rng, w * side, h * 1.02, -Math.PI / 2 + (side < 0.5 ? 0.15 : -0.15), h * 0.3, 16 * u, 5, 0.28);
      strokeBranch(g, segs, '#0c0c22');
    }
    for (const L of lamps(w, h)) {
      const s = L.s * u;
      glow(g, L.x, L.base - 4 * s, 220 * s, '255,196,130', 0.26, 1, 0.3);
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = linear(g, 0, L.top, 0, L.base, [[0, 'rgba(255,205,140,.22)'], [1, 'rgba(255,205,140,0)']]);
      g.beginPath(); g.moveTo(L.x - 8 * s, L.top + 10 * s); g.lineTo(L.x + 8 * s, L.top + 10 * s); g.lineTo(L.x + 170 * s, L.base); g.lineTo(L.x - 170 * s, L.base); g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = '#0b0b20'; g.lineWidth = 7 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(L.x, L.base); g.lineTo(L.x, L.top); g.stroke();
      g.fillStyle = '#0e0e24'; g.fillRect(L.x - 14 * s, L.top - 6 * s, 28 * s, 10 * s);
      glow(g, L.x, L.top + 10 * s, 170 * s, '255,186,110', 0.4);
      glow(g, L.x, L.top + 10 * s, 26 * s, '255,240,210', 1);
    }
    finish(g, w, h, dpr, 1010, 0.28);
  },
  fx: drift({
    density: 130, maxAlpha: 0.8, size: [3, 22], fall: [18, 48], wind: 8, flow: 14, gust: 60, spin: 0, flip: false, alpha: [0.4, 0.72], paint: SNOW,
    light: (x, y, e) => {
      let l = 0;
      for (const L of lamps(e.w, e.h)) if (y > L.top) { const spread = 20 * e.u * L.s + (y - L.top) * 0.55; l = Math.max(l, clamp(1 - Math.abs(x - L.x) / spread, 0, 1) * clamp(1 - (y - L.top) / (L.base - L.top + 1), 0, 1)); }
      return l * 0.9;
    },
  }),
};

// ═════════════════════════════════════════════════════════════════════════════
// 날씨 — 물안개 호수 새벽
// ═════════════════════════════════════════════════════════════════════════════
const LAKE_Y = 0.6;
const mistyLake: AmbienceScene<{ b: Band[] }> = {
  ...meta('misty-lake'),
  shade: { veil: 0.2, zone: 0.62 },
  paint(g, w, h, u, rng, dpr) {
    const hy = h * LAKE_Y;
    sky(g, w, h, [[0, '#18244a'], [0.26, '#34416e'], [0.42, '#6a6a96'], [0.52, '#b08aa2'], [LAKE_Y, '#e9b4a6'], [1, '#e9b4a6']]);
    glow(g, w * 0.7, hy - 8 * u, w * 0.6, '255,200,170', 0.3, 1, 0.35);
    glow(g, w * 0.7, hy - 8 * u, 40 * u, '255,240,220', 0.9);
    streaks(g, rng, w, h * 0.3, hy - 20 * u, 14, '255,210,210', 0.12, u);
    canopyLine(g, rng, w, h, hy - 2 * u, h * 0.03, 26 * u, '112,98,136', 0.9);
    const t1 = ridge(g, w, h, { base: hy + 1, amp: h * 0.06, freq: 2, seed: 111, fill: '#3a3a62' });
    for (let x = 0; x < w; x += rand(rng, 10, 24) * u) if (x < w * 0.35 || x > w * 0.82) pine(g, rng, x, t1(x) + 3 * u, rand(rng, 30, 96) * u, rand(rng, 12, 26) * u, '#2a2a4c');
    reflect(g, w, h, hy + 2 * u, dpr, rng, u, 0.62, 'rgba(24,30,58,1)');
    finish(g, w, h, dpr, 1111, 0.28);
  },
  init: (w, h, _u, scale) => ({
    b: [
      makeBand(w, scale, h * (LAKE_Y - 0.1), h * 0.2, 5, 0.75, 51, '236,214,236', 0.26),
      makeBand(w, scale, h * (LAKE_Y - 0.03), h * 0.18, -7, 0.7, 52, '246,222,230', 0.24),
      makeBand(w, scale, h * (LAKE_Y + 0.08), h * 0.3, 10, 0.55, 53, '214,200,236', 0.2),
    ],
  }),
  under(g, e, s) { for (const b of s.b) drawBand(g, b, e); },
  fx: combine(
    [sparkle({ density: 24, maxAlpha: 0.7, size: [6, 14], life: [1.6, 3.2], stretch: [3, 0.45], paint: glintPaint('255,225,215'), at: (rng, e) => [e.w * 0.7 + (rng() + rng() - 1) * e.w * 0.12, e.h * LAKE_Y + rand(rng, 6, 140) * e.u] }), 24],
    [drift({ density: 14, maxAlpha: 0.3, size: [2, 6], fall: [-2, -5], wind: 6, flow: 5, gust: 0, spin: 0, flip: false, alpha: [0.15, 0.3], paint: [dotPaint('255,235,230')], additive: true, wander: 7 }), 14],
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
// 자연 — 고래 떼와 빛줄기
// ═════════════════════════════════════════════════════════════════════════════
type Pt = [number, number];
/** 혹등고래 옆모습 실루엣. x 는 머리 쪽 +. flex = 꼬리 오르내림(-1..1) — 꼬리지느러미는 옆에서 보면 가로로 납작한 초승달이다. */
function whale(g: G, x: number, y: number, L: number, flex: number, top: string, bottom: string, alpha: number, fin: number, finColor: string) {
  const bend = (p: Pt): Pt => (p[0] < -0.05 ? [p[0], p[1] + flex * 0.08 * ((-p[0] - 0.05) / 0.6) ** 2] : p);
  const P = (p: Pt) => { const b = bend(p); return [x + b[0] * L, y + b[1] * L] as const; };
  const path = (pts: Pt[][]) => {
    g.beginPath();
    { const [a0, b0] = P(pts[0][0]); g.moveTo(a0, b0); }
    for (const [c1, c2, e] of pts.slice(1) as [Pt, Pt, Pt][]) { const [a1, b1] = P(c1), [a2, b2] = P(c2), [a3, b3] = P(e); g.bezierCurveTo(a1, b1, a2, b2, a3, b3); }
    g.closePath();
  };
  g.save();
  g.globalAlpha = alpha;
  // 먼 쪽 가슴지느러미(몸 뒤)
  g.fillStyle = finColor;
  g.globalAlpha = alpha * 0.55;
  path([[[0.2, 0.06]], [[0.12, 0.16], [0.02, 0.24 + fin * 0.03], [-0.06, 0.27 + fin * 0.04]], [[0.02, 0.2], [0.1, 0.12], [0.15, 0.075]]]);
  g.fill();
  g.globalAlpha = alpha;
  g.fillStyle = linear(g, 0, y - L * 0.12, 0, y + L * 0.12, [[0, top], [0.7, bottom], [1, bottom]]);
  path([
    [[0.5, 0.0]],
    [[0.47, -0.06], [0.33, -0.105], [0.12, -0.11]],
    [[-0.08, -0.11], [-0.3, -0.07], [-0.46, -0.022]],
    [[-0.52, -0.02], [-0.6, -0.05], [-0.68, -0.045]],   // 꼬리지느러미 위 날개
    [[-0.64, -0.02], [-0.62, -0.006], [-0.6, 0.0]],     // 가운데 홈
    [[-0.62, 0.006], [-0.64, 0.02], [-0.68, 0.045]],
    [[-0.6, 0.05], [-0.52, 0.02], [-0.46, 0.022]],
    [[-0.3, 0.07], [-0.1, 0.115], [0.15, 0.105]],
    [[0.32, 0.098], [0.45, 0.06], [0.5, 0.0]],
  ]);
  g.fill();
  g.strokeStyle = 'rgba(160,210,230,.12)'; g.lineWidth = Math.max(1, L * 0.002); // 목주름
  for (let k = 0; k < 6; k++) { const yy = 0.06 + k * 0.009; const [a0, b0] = P([0.44, yy * 0.7]), [a1, b1] = P([0.12, yy + 0.02]); g.beginPath(); g.moveTo(a0, b0); g.lineTo(a1, b1); g.stroke(); }
  // 가까운 쪽 가슴지느러미 — 혹등고래 특유의 길고 흰 지느러미
  g.fillStyle = finColor;
  path([[[0.24, 0.07]], [[0.16, 0.18], [0.04, 0.27 + fin * 0.04], [-0.05, 0.31 + fin * 0.05]], [[0.05, 0.22], [0.13, 0.13], [0.18, 0.085]]]);
  g.fill();
  g.restore();
}
interface WhaleSpec { L: number; y: number; v: number; off: number; top: string; bottom: string; a: number; ph: number; fin: string }
const whales: AmbienceScene<{ ray: HTMLCanvasElement; caustic: Band; ws: WhaleSpec[] }> = {
  ...meta('whale-light'),
  shade: { veil: 0.2, zone: 0.6 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#2a93b8'], [0.1, '#1a7aa0'], [0.32, '#0d4d75'], [0.66, '#06294a'], [1, '#021326']]);
    glow(g, w * 0.5, -h * 0.05, w * 0.9, '170,235,255', 0.4, 1, 0.3);
    for (let i = 0; i < 30; i++) glow(g, rand(rng, 0, w), rand(rng, 0.1, 1) * h, rand(rng, 100, 320) * u, rng() < 0.5 ? '80,170,200' : '0,10,24', rand(rng, 0.04, 0.09));
    finish(g, w, h, dpr, 1212, 0.34, 0.05);
  },
  init: (w, h, u, scale) => ({
    ray: makeSprite(Math.max(8, Math.round(120 * scale)), Math.max(16, Math.round(900 * scale)), (g) => {
      const W = g.canvas.width, H = g.canvas.height;
      const gv = g.createLinearGradient(0, 0, 0, H);
      gv.addColorStop(0, 'rgba(170,235,255,1)'); gv.addColorStop(0.5, 'rgba(120,210,240,.45)'); gv.addColorStop(1, 'rgba(120,210,240,0)');
      g.fillStyle = gv; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-in';
      const gh = g.createLinearGradient(0, 0, W, 0);
      gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(0.5, 'rgba(0,0,0,1)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gh; g.fillRect(0, 0, W, H);
    }),
    caustic: makeBand(w, scale, -h * 0.02, h * 0.16, 9, 0.5, 61, '170,235,255', 0.3, 60),
    ws: [
      { L: w * 0.22, y: h * 0.3, v: 14 * u, off: 0.25, top: 'rgba(40,110,140,1)', bottom: 'rgba(24,76,104,1)', a: 0.45, ph: 0, fin: 'rgba(90,150,172,1)' },
      { L: w * 0.3, y: h * 0.82, v: 18 * u, off: 0.62, top: 'rgba(28,86,116,1)', bottom: 'rgba(12,44,68,1)', a: 0.6, ph: 1.7, fin: 'rgba(80,140,166,1)' },
      { L: w * 0.66, y: h * 0.56, v: 26 * u, off: 0.36, top: 'rgba(18,58,82,1)', bottom: 'rgba(3,14,26,1)', a: 0.95, ph: 3.1, fin: 'rgba(120,176,196,1)' },
    ],
  }),
  under(g, e, s) {
    const { w, h, u, time: t } = e;
    for (const W of s.ws) { // 멀리 → 가까이
      const span = w + W.L * 2.4;
      const x = ((W.off * span + t * W.v) % span) - W.L * 1.2;
      whale(g, x, W.y + Math.sin(t * 0.25 + W.ph) * 10 * u, W.L, Math.sin(t * 0.55 + W.ph), W.top, W.bottom, W.a, Math.sin(t * 0.4 + W.ph), W.fin);
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const x = w * (0.05 + i * 0.13) + Math.sin(t * 0.07 + i) * 40 * u;
      const ang = -0.22 + i * 0.03 + Math.sin(t * 0.09 + i * 1.3) * 0.04;
      const a = 0.09 * (0.65 + 0.35 * Math.sin(t * 0.21 + i * 1.7));
      g.save(); g.translate(x, -20 * u); g.rotate(ang); g.globalAlpha = a;
      g.drawImage(s.ray, -60 * u * (0.7 + (i % 3) * 0.3), 0, 120 * u * (0.7 + (i % 3) * 0.3), h * 1.05);
      g.restore();
    }
    g.globalAlpha = 1;
    drawBand(g, s.caustic, e);
    g.globalCompositeOperation = 'source-over';
  },
  fx: combine(
    [drift({ density: 100, maxAlpha: 0.55, size: [1.6, 16], fall: [3, 8], wind: 4, flow: 5, gust: 0, spin: 0, flip: false, alpha: [0.2, 0.5], paint: [dotPaint('200,235,245', 0.9, 0.3)], wander: 6, haze: 0.4 }), 100],
    [drift({ density: 10, maxAlpha: 0.12, size: [60, 140], fall: [-2, -4], wind: 3, flow: 3, gust: 0, spin: 0, flip: false, alpha: [0.05, 0.12], paint: [bokehPaint('150,220,240')], additive: true, wander: 5 }), 10],
  ),
};

// ═════════════════════════════════════════════════════════════════════════════
// 자연 — 학의 비상(노을 구름)
// ═════════════════════════════════════════════════════════════════════════════
/** 학 실루엣(옆모습, 오른쪽을 본다). s = 몸길이 기준 크기, flap = 날갯짓 위상. */
function crane(g: G, x: number, y: number, s: number, flap: number, color: string, alpha: number) {
  const a = Math.sin(flap);
  g.save();
  g.translate(x, y);
  g.globalAlpha = alpha;
  g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round';
  const wing = (k: number, al: number) => {
    const A = a * k;
    g.globalAlpha = alpha * al;
    g.beginPath();
    g.moveTo(0.12 * s, -0.02 * s);
    g.quadraticCurveTo(0.12 * s, -0.36 * s * A, 0.02 * s, -0.7 * s * A);
    for (const [fx, fy] of [[-0.05, -0.74], [-0.08, -0.66], [-0.12, -0.7], [-0.15, -0.62], [-0.19, -0.64], [-0.22, -0.56]]) g.lineTo(fx * s, fy * s * A);
    g.quadraticCurveTo(-0.2 * s, -0.24 * s * A, -0.12 * s, -0.02 * s);
    g.closePath(); g.fill();
  };
  wing(0.85, 0.7);
  g.globalAlpha = alpha;
  g.beginPath(); g.ellipse(0, 0, 0.22 * s, 0.055 * s, -0.04, 0, TAU); g.fill();
  g.lineWidth = 0.028 * s; g.beginPath(); g.moveTo(0.16 * s, -0.01 * s); g.quadraticCurveTo(0.4 * s, -0.06 * s, 0.62 * s, -0.05 * s); g.stroke();
  g.beginPath(); g.ellipse(0.64 * s, -0.052 * s, 0.035 * s, 0.022 * s, 0, 0, TAU); g.fill();
  g.lineWidth = 0.012 * s; g.beginPath(); g.moveTo(0.66 * s, -0.05 * s); g.lineTo(0.8 * s, -0.04 * s); g.stroke();
  g.lineWidth = 0.014 * s; g.beginPath(); g.moveTo(-0.18 * s, 0.015 * s); g.lineTo(-0.74 * s, 0.05 * s); g.moveTo(-0.18 * s, 0.03 * s); g.lineTo(-0.72 * s, 0.075 * s); g.stroke();
  wing(1, 1);
  g.restore();
}
const craneFlight: AmbienceScene<{ drift: Band }> = {
  ...meta('crane-flight'),
  shade: { veil: 0.2, zone: 0.62 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#141a38'], [0.26, '#34305a'], [0.48, '#76506a'], [0.64, '#c07a62'], [0.76, '#f0ac6c'], [0.8, '#ffd494'], [1, '#ffd494']]);
    const sx = w * 0.64, sy = h * 0.8;
    glow(g, sx, sy, w * 0.55, '255,170,110', 0.3, 1, 0.5);
    glow(g, sx, sy, w * 0.12, '255,210,150', 0.45);
    glow(g, sx, sy, 24 * u, '255,236,200', 0.95);
    for (const [cx, cy, cw, ch] of [[0.2, 0.3, 700, 90], [0.82, 0.22, 640, 80], [0.5, 0.52, 900, 70], [0.12, 0.6, 520, 60], [0.9, 0.6, 560, 60]] as const) {
      cloud(g, rng, w * cx, h * cy, cw * u, ch * u, '96,72,100', '240,160,120', 0.7, 44, 1.6 * u);
    }
    const layers: [number, number, string][] = [[0.8, 0.12, 'rgba(120,80,96,.7)'], [0.86, 0.12, 'rgba(70,46,64,.9)'], [0.93, 0.1, '#2a1c28'], [1.0, 0.08, '#140e18']];
    layers.forEach(([b, a, c], i) => { ridge(g, w, h, { base: h * b, amp: h * a, freq: 2.2 + i, seed: 131 + i, ridged: true, fill: c }); glow(g, w * 0.5, h * (b + 0.01), w * 0.7, '230,150,110', 0.08 - i * 0.015, 1, 0.07); });
    finish(g, w, h, dpr, 1313, 0.42);
  },
  init: (w, h, _u, scale) => ({ drift: makeBand(w, scale, h * 0.36, h * 0.24, 6, 0.4, 71, '220,160,140', 0.1) }),
  under(g, e, s) {
    drawBand(g, s.drift, e);
    const { w, h, u, time: t } = e;
    const flock: [number, number, number, number][] = [ // [앞뒤 오프셋 x, y, 크기, 위상]
      [0, 0, 1, 0], [-70, -34, 0.92, 0.7], [-140, -64, 0.86, 1.5], [-70, 36, 0.9, 2.2], [-140, 70, 0.84, 2.9], [-210, -92, 0.8, 3.6], [-215, 104, 0.78, 4.4],
    ];
    const span = w + 900 * u, cx = ((t * 34 * u + 0.45 * span) % span) - 450 * u, cy = h * 0.3 + Math.sin(t * 0.2) * 14 * u;
    for (const [dx, dy, sc, ph] of flock) crane(g, cx + dx * 1.5 * u, cy + dy * 1.5 * u + Math.sin(t * 0.6 + ph) * 5 * u, 190 * u * sc, t * 3.2 + ph, '#241828', 0.7);
    const span2 = w + 1400 * u, x2 = ((t * 52 * u + 0.12 * span2) % span2) - 700 * u; // 가까이 한 쌍
    crane(g, x2, h * 0.68, 300 * u, t * 2.6, '#110b14', 0.9);
    crane(g, x2 - 260 * u, h * 0.62, 260 * u, t * 2.6 + 1.2, '#110b14', 0.86);
  },
  fx: drift({ density: 22, maxAlpha: 0.38, size: [2, 7], fall: [-3, -6], wind: 9, flow: 6, gust: 0, spin: 0, flip: false, alpha: [0.18, 0.38], paint: [dotPaint('255,210,160')], additive: true, wander: 8 }),
};

// ═════════════════════════════════════════════════════════════════════════════
// 자연 — 반딧불 숲
// ═════════════════════════════════════════════════════════════════════════════
const fireflyForest: AmbienceScene<{ mist: Band }> = {
  ...meta('firefly-forest'),
  shade: { veil: 0.2, zone: 0.56 },
  paint(g, w, h, u, rng, dpr) {
    sky(g, w, h, [[0, '#07232c'], [0.3, '#0d3440'], [0.62, '#16505a'], [0.86, '#0e3036'], [1, '#07181c']]);
    rays(g, w * 0.78, -h * 0.15, h * 1.4, 7, '170,225,230', 0.08, rng, Math.PI * 0.5, Math.PI * 0.76);
    glow(g, w * 0.5, h * 0.7, w * 0.8, '110,180,160', 0.24, 1, 0.3);
    // 나무 — 층마다 굵기·기울기·흐림이 다르다(대기원근). 줄기에서 가지가 조금 뻗는다.
    const layer = (n: number, rgb: string, a: number, wid: [number, number], blurPx: number, branchy: boolean) => blurGroup(g, blurPx, (g) => {
      for (let i = 0; i < n; i++) {
        const x = rand(rng, -0.03, 1.03) * w, tw = rand(rng, wid[0], wid[1]) * u, lean = rand(rng, -0.05, 0.05) * h;
        g.fillStyle = `rgba(${rgb},${a})`;
        g.beginPath(); g.moveTo(x - tw * 0.9, h * 0.94); g.quadraticCurveTo(x - tw * 0.5, h * 0.55, x - tw * 0.3 + lean, -10); g.lineTo(x + tw * 0.3 + lean, -10); g.quadraticCurveTo(x + tw * 0.5, h * 0.55, x + tw * 0.9, h * 0.94); g.closePath(); g.fill();
        if (branchy) {
          g.strokeStyle = `rgba(${rgb},${a})`; g.lineCap = 'round';
          for (let k = 0; k < 3; k++) { const by = h * rand(rng, 0.08, 0.45), dir = rng() < 0.5 ? -1 : 1; g.lineWidth = tw * rand(rng, 0.12, 0.25); g.beginPath(); g.moveTo(x + lean * (1 - by / h), by); g.quadraticCurveTo(x + dir * tw * 1.5, by - h * 0.04, x + dir * tw * rand(rng, 2.5, 4.5), by - h * rand(rng, 0.06, 0.14)); g.stroke(); }
        }
      }
    });
    layer(30, '60,120,120', 0.4, [8, 20], 5 * u, false);
    glow(g, w * 0.5, h * 0.8, w * 0.9, '120,190,170', 0.16, 1, 0.2);
    layer(14, '24,64,70', 0.85, [18, 40], 2 * u, true);
    layer(5, '6,22,26', 1, [60, 110], 0, true);
    for (let i = 0; i < 46; i++) glow(g, rand(rng, 0, w), rand(rng, -0.06, 0.1) * h, rand(rng, 90, 220) * u, '4,16,18', 0.75, 1.4, 0.6);
    const gl = ridge(g, w, h, { base: h * 0.93, amp: h * 0.05, freq: 3, seed: 141, fill: '#051416' });
    g.strokeStyle = '#051416'; g.lineCap = 'round';
    for (let x = 0; x < w; x += rand(rng, 18, 44) * u) {
      const len = rand(rng, 50, 140) * u, dir = rng() < 0.5 ? -1 : 1, y0 = gl(x);
      g.lineWidth = 2.4 * u;
      g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + dir * len * 0.3, y0 - len * 0.8, x + dir * len, y0 - len * 0.55); g.stroke();
      g.lineWidth = 1.2 * u;
      for (let k = 1; k < 10; k++) { const t = k / 10, px = x + dir * len * (0.6 * t * t + 0.4 * t) * 0.9, py = y0 - len * (0.8 * t - 0.25 * t * t) * 0.9; g.beginPath(); g.moveTo(px, py); g.lineTo(px + dir * 9 * u * (1 - t * 0.5), py + 10 * u * (1 - t * 0.5)); g.moveTo(px, py); g.lineTo(px - dir * 3 * u, py - 10 * u * (1 - t * 0.5)); g.stroke(); }
    }
    finish(g, w, h, dpr, 1414, 0.3);
  },
  init: (w, h, _u, scale) => ({ mist: makeBand(w, scale, h * 0.74, h * 0.22, 4, 0.5, 81, '90,150,150', 0.14) }),
  under(g, e, s) { drawBand(g, s.mist, e); },
  fx: drift({
    density: 90, maxAlpha: 1, size: [6, 40], fall: [-1, 1], wind: 3, flow: 8, gust: 0, spin: 0, flip: false, alpha: [0.6, 1],
    paint: [dotPaint('214,255,120', 1, 0.18), dotPaint('240,255,150', 1, 0.14)], additive: true, wander: 14, pulse: [2.6, 5.2], haze: 0.3,
  }),
};

// ── 목록 ─────────────────────────────────────────────────────────────────────
export const AMBIENCE_SCENES: AmbienceScene[] = [
  sakuraDusk, sakuraInk, sakuraNight,
  summerSea, autumnRidges, winterForest,
  cloudSea, milkyWay, aurora, firstSnow, mistyLake,
  whales, craneFlight, fireflyForest,
];

export const ambienceSceneById = (id: string | null | undefined) => AMBIENCE_SCENES.find((s) => s.id === id) ?? null;

