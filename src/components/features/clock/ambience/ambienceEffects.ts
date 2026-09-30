// src/components/features/clock/ambience/ambienceEffects.ts — 실사 영상 위에 얹는 효과 층(캔버스) 10종.
//
// 2026-09-29 밤 방향 전환(오너 "모션이 너무 약하다 · 웅장하게 · 만화 같은 도안 말고"):
//   배경은 실사 영상 루프가 맡고, 이 층은 **앞에 떠다니는 것**만 그린다 — 벚꽃잎·낙엽·눈보라·유리창 물방울·운무·유성·
//   기포·윤슬·빛먼지. 해파리·코이·나비·고래·철새 같은 그림 도안은 지웠다.
//   · 깊이(z): 뒤(작고 느리고 옅다) ↔ 앞(크고 빠르고, 맨 앞 20% 는 초점 밖처럼 흐리게) — 영상과 겹쳐 입체감을 만든다.
//   · 글자 금지 영역(Env.zones)에서는 불투명도 0(fadeP), 캔버스 마스크가 한 번 더 지운다(ClockAmbience).
//   · **번개·불꽃놀이·화면 전체 밝기 변화 없음**(WCAG 2.3.1). 유성은 가는 선 하나다.
//   · 도안은 코드로 그린다(외부 이미지·글꼴 글리프 0). 캔버스 API 는 오래된 TV 브라우저에도 있는 것만.

import {
  type AmbienceEffect, type Env, type P, type Rng,
  blit, clamp, fadeAt, glowSprite, makeSprite, rand, zoneFade,
} from './ambienceEngine';

export type AmbienceMotionId =
  | 'sakura' | 'maple' | 'blizzard' | 'snow'
  | 'rain-glass' | 'mist' | 'meteor'
  | 'bubbles' | 'glints' | 'dust';

const TAU = Math.PI * 2;
/** 글자 영역 가장자리에서 입자가 부드럽게 사라지는 폭(1080 기준 px). */
const ZONE_MARGIN = 36;
/** 이 깊이 이상은 '앞 레이어' — 흐린 도안으로 그린다. */
const FRONT = 0.8;

const mk = (o: Partial<P>): P => ({
  k: 0, x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, s: 1, a: 0, ph: 0, t: 0, life: Infinity, c: 0, z: 0.5, ...o,
});

/** 깊이 → 배율. 앞일수록 크고(최대 1.8배) 빠르고 진하다. */
export const depthScale = (z: number) => ({ size: 0.55 + 1.25 * z * z, speed: 0.6 + 0.9 * z, alpha: 0.55 + 0.45 * z });

/** 글자 영역·중앙 타원 밖의 한 점 — 물방울처럼 '한 자리에 머무는' 것은 처음부터 숫자 옆에 생기지 않게 한다. */
export function spotOutside(rng: Rng, e: Env, minFade = 0.9): [number, number] {
  let x = 0, y = 0;
  // 스폰 때만 부르므로 넉넉히 뽑는다. 앞 100번은 중앙 타원도 피하고, 그래도 없으면 글자 영역만 피한다.
  // 끝내 못 찾으면(글자가 화면을 거의 덮는 좁은 보드) 마지막 후보를 쓰되 그 자리는 fadeP 가 0 으로 누른다.
  for (let i = 0; i < 200; i++) {
    x = rand(rng, 0.03, 0.97) * e.w;
    y = rand(rng, 0.05, 0.95) * e.h;
    if ((i >= 100 || fadeAt(x / e.w, y / e.h) >= minFade) && zoneFade(x, y, e.zones, ZONE_MARGIN * 1.5 * e.u) >= 0.999) break;
  }
  return [x, y];
}

/** 입자 가독 배율 = 중앙 타원 × 글자 영역. 글자 영역 안이면 0. */
export const fadeP = (p: P, e: Env) => fadeAt(p.x / e.w, p.y / e.h) * zoneFade(p.x, p.y, e.zones, ZONE_MARGIN * e.u);
const base = (ctx: CanvasRenderingContext2D, dpr: number) => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const wrapX = (p: P, e: Env, m: number) => { if (p.x < -m) p.x += e.w + 2 * m; else if (p.x > e.w + m) p.x -= e.w + 2 * m; };

// ── 도안 ─────────────────────────────────────────────────────────────────────
const dot = (rgb: string) => glowSprite(64, [[0, `rgba(${rgb},1)`], [0.35, `rgba(${rgb},.75)`], [1, `rgba(${rgb},0)`]]);

/** 초점 밖(앞 레이어) — 1/5 로 줄였다가 다시 키워 흐리게. ctx.filter 없이 모든 브라우저에서 같다. */
function soften(img: HTMLCanvasElement, f = 5): HTMLCanvasElement {
  const small = makeSprite(Math.max(4, Math.round(img.width / f)), Math.max(4, Math.round(img.height / f)), (g) => g.drawImage(img, 0, 0, img.width / f, img.height / f));
  return makeSprite(img.width, img.height, (g) => { g.imageSmoothingEnabled = true; g.drawImage(small, 0, 0, img.width, img.height); });
}

function petal(inner: string, edge: string) {
  return makeSprite(64, 64, (g) => {
    g.translate(32, 32);
    const gr = g.createRadialGradient(0, 10, 2, 0, 0, 30);
    gr.addColorStop(0, inner); gr.addColorStop(1, edge);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, 27);
    g.bezierCurveTo(-24, 12, -19, -21, -6, -27);
    g.lineTo(0, -20); // 벚꽃잎 끝의 갈라진 홈
    g.lineTo(6, -27);
    g.bezierCurveTo(19, -21, 24, 12, 0, 27);
    g.fill();
  });
}

/** 단풍잎 — 다섯 갈래 + 톱니 + 잎맥 + 꼭지. */
function maple(fill: string, vein: string) {
  return makeSprite(64, 64, (g) => {
    g.translate(32, 32);
    const D = Math.PI / 180;
    const lobes: [number, number][] = [[-142, 24], [-90, 28], [-38, 24], [18, 18], [162, 18]];
    const pt = (ang: number, r: number) => [Math.cos(ang) * r, Math.sin(ang) * r] as const;
    g.beginPath();
    lobes.forEach(([a, ra], i) => {
      const [b0, rb] = lobes[(i + 1) % lobes.length];
      const A = a * D, B = (i === lobes.length - 1 ? b0 + 360 : b0) * D;
      const bottom = a === 18;
      const seq: (readonly [number, number])[] = [
        pt(A, ra), pt(A + (B - A) * 0.22, ra * 0.62), pt((A + B) / 2, bottom ? 5 : 10), pt(A + (B - A) * 0.78, rb * 0.62),
      ];
      seq.forEach(([x, y], j) => (i === 0 && j === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    });
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = vein; g.lineWidth = 1.2;
    g.beginPath();
    for (const [a, r] of lobes) { const [x, y] = pt(a * D, r * 0.85); g.moveTo(0, 0); g.lineTo(x, y); }
    g.moveTo(0, 0); g.lineTo(0, 30);
    g.stroke();
  });
}

/** 비눗방울 같은 기포 — 테두리가 밝고 속은 비어 있다. */
const bubbleSprite = () => makeSprite(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 18, 32, 32, 31);
  gr.addColorStop(0, 'rgba(200,235,255,0)'); gr.addColorStop(0.8, 'rgba(200,235,255,.35)'); gr.addColorStop(1, 'rgba(220,245,255,.9)');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 31, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(22, 20, 7, 4, -0.6, 0, TAU); g.fill();
});

// ── 흩날림 계열(벚꽃·단풍) 공통 ────────────────────────────────────────────────
interface FlutterCfg { density: number; maxAlpha: number; size: [number, number]; vx: [number, number]; vy: [number, number]; a: [number, number]; sway: number; colors: number }
function flutter(cfg: FlutterCfg, sprites: () => HTMLCanvasElement[], flipAxis: 'x' | 'y'): AmbienceEffect {
  return {
    density: cfg.density, maxAlpha: cfg.maxAlpha,
    spawn(rng, e, _k, _i, _n, initial) {
      const u = e.u, z = rng(), d = depthScale(z);
      return mk({
        z, x: (initial ? rand(rng, 0, 1) : rand(rng, -0.4, 0.9)) * e.w,
        y: initial ? rand(rng, -0.05, 1) * e.h : -rand(rng, 30, 120) * u,
        vx: rand(rng, ...cfg.vx) * u * d.speed, vy: rand(rng, ...cfg.vy) * u * d.speed,
        r: rand(rng, 0, TAU), vr: rand(rng, -1, 1), s: rand(rng, ...cfg.size) * u * d.size,
        a: rand(rng, ...cfg.a) * d.alpha * (z >= FRONT ? 0.8 : 1), ph: rand(rng, 0, TAU), t: rand(rng, 0, 20),
        c: Math.floor(rng() * cfg.colors),
      });
    },
    step(p, dt, e) {
      p.t += dt;
      const gust = 1 + 0.35 * Math.sin(e.time * 0.4 + p.ph * 0.2); // 바람이 세졌다 약해졌다
      p.x += (p.vx * gust + Math.sin(p.t * 0.8 + p.ph) * cfg.sway * e.u) * dt;
      p.y += (p.vy + Math.sin(p.t * 1.7 + p.ph) * 5 * e.u) * dt;
      p.r += p.vr * dt;
      return p.y < e.h + p.s && p.x < e.w + p.s * 2;
    },
    alpha: (p) => p.a,
    sprites: () => {
      const list = sprites();
      const out: Record<string, HTMLCanvasElement> = {};
      list.forEach((img, i) => { out[`n${i}`] = img; out[`b${i}`] = soften(img); });
      return out;
    },
    draw(ctx, ps, e, sp, dpr) {
      for (const front of [false, true]) {
        for (const p of ps) {
          if ((p.z >= FRONT) !== front) continue;
          const f = 0.3 + 0.7 * Math.abs(Math.cos(p.t * 1.9 + p.ph));
          const img = sp[(front ? 'b' : 'n') + p.c];
          blit(ctx, img, p.x, p.y, p.r, flipAxis === 'x' ? f : 1, flipAxis === 'y' ? f : 1, p.s, this.alpha(p, e) * fadeP(p, e), dpr);
        }
      }
    },
  };
}

/** 봄 — 벚꽃잎이 바람에 흩날린다. 60장, 깊이 3단. */
const sakura = flutter(
  { density: 60, maxAlpha: 0.72, size: [16, 26], vx: [20, 50], vy: [26, 46], a: [0.5, 0.72], sway: 22, colors: 3 },
  () => [petal('#FDE3EA', '#F2A3BA'), petal('#FFF0F4', '#F5BCCB'), petal('#F9CCD9', '#E68AA3')], 'y');

/** 가을 — 단풍잎이 팔랑이며 바람에 실려 간다. */
const mapleFx = flutter(
  { density: 30, maxAlpha: 0.72, size: [24, 38], vx: [14, 40], vy: [30, 52], a: [0.5, 0.72], sway: 30, colors: 4 },
  () => [maple('#D9542B', 'rgba(120,30,10,.55)'), maple('#E8892F', 'rgba(130,60,10,.5)'), maple('#B8321E', 'rgba(90,20,10,.55)'), maple('#E0A73A', 'rgba(130,80,10,.5)')], 'x');

// ── 눈 ───────────────────────────────────────────────────────────────────────
function snowfall(o: { density: number; maxAlpha: number; wind: [number, number]; vy: [number, number]; size: [number, number]; a: [number, number]; gust: number }): AmbienceEffect {
  return {
    density: o.density, maxAlpha: o.maxAlpha,
    spawn(rng, e, _k, _i, _n, initial) {
      const u = e.u, z = rng(), d = depthScale(z);
      return mk({
        z, x: rand(rng, -0.1, 1) * e.w, y: initial ? rand(rng, 0, 1) * e.h : -12 * u * d.size,
        vx: rand(rng, ...o.wind) * u * d.speed, vy: rand(rng, ...o.vy) * u * d.speed,
        s: rand(rng, ...o.size) * u * d.size, a: rand(rng, ...o.a) * d.alpha, ph: rand(rng, 0, TAU), t: rand(rng, 0, 30),
      });
    },
    step(p, dt, e) {
      p.t += dt;
      const g = 1 + o.gust * (0.6 * Math.sin(e.time * 0.35) + 0.4 * Math.sin(e.time * 1.1 + 1.3)); // 돌풍
      p.x += (p.vx * g + Math.sin(p.t * 0.55 + p.ph) * 10 * e.u) * dt;
      p.y += p.vy * dt;
      wrapX(p, e, 20 * e.u);
      return p.y < e.h + p.s * 2;
    },
    alpha: (p) => p.a,
    sprites: () => { const d = dot('255,255,255'); return { d, b: soften(d, 3) }; },
    draw(ctx, ps, e, sp, dpr) {
      for (const p of ps) blit(ctx, p.z >= FRONT ? sp.b : sp.d, p.x, p.y, 0, 1, 1, p.s * 2.4, this.alpha(p, e) * fadeP(p, e), dpr);
    },
  };
}

/** 겨울 설원 눈보라 — 옆바람이 세고 돌풍이 분다. 입자 수 상한까지 쓴다. */
const blizzard = snowfall({ density: 150, maxAlpha: 0.8, wind: [70, 150], vy: [45, 95], size: [2.4, 4.6], a: [0.45, 0.8], gust: 0.45 });
/** 첫눈 — 크고 느린 송이가 드문드문. */
const snow = snowfall({ density: 55, maxAlpha: 0.75, wind: [-4, 10], vy: [14, 26], size: [4, 7.5], a: [0.45, 0.75], gust: 0.15 });

// ── 비(유리창) ───────────────────────────────────────────────────────────────
const SPLASH = 0.3;

/** 폭우 유리창 — 유리에 물방울(k1)이 튀어 맺히고, 커진 방울 일부는 자국을 남기며 흘러내린다. 가는 빗줄기(k0)는 영상 앞을 스친다.
 *  r = 흘러내리기 시작한 y(자국의 위 끝), vr = 1 이면 흘러내리는 방울. */
const rainGlass: AmbienceEffect = {
  density: 60, maxAlpha: 0.7,
  kindOf: (i, n) => (i >= n - Math.min(22, Math.floor(n * 0.4)) ? 1 : 0),
  spawn(rng, e, k, _i, _n, initial) {
    const u = e.u;
    if (k === 0) {
      const z = rng(), vy = rand(rng, 900, 1300) * u * depthScale(z).speed;
      return mk({
        z, x: rand(rng, -0.1, 1) * e.w, y: initial ? rand(rng, -0.1, 1) * e.h : -rand(rng, 40, 300) * u,
        vy, vx: vy * 0.12, s: rand(rng, 40, 90) * u * depthScale(z).size, a: rand(rng, 0.12, 0.26),
      });
    }
    const [x, y] = spotOutside(rng, e);
    const slide = rng() < 0.45;
    return mk({
      k: 1, x, y, r: y, vr: slide ? 1 : 0, vy: 0, s: rand(rng, 6, 15) * u, a: rand(rng, 0.5, 0.7), ph: rand(rng, 0, TAU),
      t: initial ? -rand(rng, 0, 3) : -rand(rng, 0.3, 3.5), life: rand(rng, 3, 6),
    });
  },
  step(p, dt, e) {
    if (p.k === 0) { p.x += p.vx * dt; p.y += p.vy * dt; return p.y - p.s < e.h; }
    p.t += dt;
    if (p.vr === 1 && p.t > SPLASH + 0.8) { // 맺혔다가 무게를 못 이기고 흘러내린다(가속)
      p.vy = Math.min(p.vy + 90 * e.u * dt, 260 * e.u);
      p.y += p.vy * dt;
      p.x += Math.sin(p.t * 6 + p.ph) * 6 * e.u * dt;
    }
    return p.t < p.life + SPLASH && p.y < e.h + p.s;
  },
  alpha(p) {
    if (p.k === 0) return p.a;
    if (p.t < 0) return 0;
    if (p.t < SPLASH) return p.a;
    const tt = p.t - SPLASH;
    return p.a * Math.min(1, tt / 0.25, clamp(p.life - tt, 0, 1));
  },
  draw(ctx, ps, e, _sp, dpr) {
    const u = e.u;
    base(ctx, dpr);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgb(200,218,235)';
    ctx.lineWidth = 1.5 * u;
    for (let b = 1; b <= 6; b++) { // 빗줄기 — 불투명도 6단 묶음(stroke 6번)
      ctx.beginPath();
      for (const p of ps) {
        if (p.k !== 0) continue;
        if (Math.min(6, Math.max(1, Math.round((p.a * fadeP(p, e)) / 0.045))) !== b) continue;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / p.vy) * p.s, p.y - p.s);
      }
      ctx.globalAlpha = b * 0.045;
      ctx.stroke();
    }
    for (const p of ps) {
      if (p.k !== 1 || p.t < 0) continue;
      const f = fadeP(p, e);
      if (f <= 0.003) continue;
      if (p.t < SPLASH) { // 튀는 순간 — 퍼지는 고리 + 작은 방울 넷
        const q = p.t / SPLASH;
        ctx.globalAlpha = p.a * (1 - q) * 0.8 * f;
        ctx.strokeStyle = 'rgb(215,232,248)'; ctx.lineWidth = 1.1 * u;
        ctx.beginPath(); ctx.arc(p.x, p.y, (3 + 20 * q) * u, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgb(225,238,252)';
        ctx.beginPath();
        for (let j = 0; j < 4; j++) {
          const ang = p.ph + j * 1.7, d = (5 + 24 * q) * u;
          const dx = p.x + Math.cos(ang) * d, dy = p.y + Math.sin(ang) * d + 60 * u * p.t * p.t;
          ctx.moveTo(dx + 1.6 * u, dy); ctx.arc(dx, dy, 1.6 * u, 0, TAU);
        }
        ctx.fill();
      }
      const env = this.alpha(p, e) / p.a;
      const grow = Math.min(1, p.t / 0.2);
      if (env <= 0 || grow <= 0) continue;
      const r = p.s * grow;
      if (p.vr === 1 && p.y - p.r > r) { // 흘러내린 자국
        ctx.globalAlpha = 0.16 * env * f;
        ctx.strokeStyle = 'rgb(205,225,245)'; ctx.lineWidth = r * 0.55;
        ctx.beginPath(); ctx.moveTo(p.x, p.r); ctx.lineTo(p.x, p.y - r * 0.5); ctx.stroke();
      }
      ctx.globalAlpha = 0.18 * env * f;
      ctx.fillStyle = 'rgb(190,215,240)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.35 * env * f;
      ctx.strokeStyle = 'rgb(0,0,0)'; ctx.lineWidth = 1.2 * u;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      ctx.globalAlpha = p.a * env * 0.6 * f;
      ctx.strokeStyle = 'rgb(228,240,255)'; ctx.lineWidth = 1 * u;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.68, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
      ctx.globalAlpha = p.a * env * f;
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.26, 0, TAU); ctx.fill();
    }
  },
};

// ── 운무 · 유성 · 기포 · 윤슬 · 빛먼지 ─────────────────────────────────────────
/** 운해 — 아주 큰 옅은 구름 덩어리가 화면 아래쪽을 따라 흐른다. 밝기 변화는 수십 초 주기라 번쩍임이 없다. */
const mist: AmbienceEffect = {
  density: 10, maxAlpha: 0.16,
  spawn(rng, e, _k, _i, _n, initial) {
    const u = e.u, s = rand(rng, 800, 1300) * u;
    return mk({
      s, x: initial ? rand(rng, -0.2, 1.1) * e.w : -s / 2, y: rand(rng, 0.45, 1.02) * e.h,
      vx: rand(rng, 12, 26) * u, a: rand(rng, 0.08, 0.16), ph: rand(rng, 0, TAU), t: rand(rng, 0, 60),
    });
  },
  step(p, dt, e) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += Math.sin(p.t * 0.05 + p.ph) * 4 * e.u * dt;
    return p.x - p.s / 2 < e.w;
  },
  alpha: (p) => p.a * (0.75 + 0.25 * Math.sin(p.t * 0.12 + p.ph)),
  sprites: () => ({ f: glowSprite(128, [[0, 'rgba(220,226,232,1)'], [0.5, 'rgba(220,226,232,.45)'], [1, 'rgba(220,226,232,0)']]) }),
  draw(ctx, ps, e, sp, dpr) {
    // 큰 덩어리라 중심점 하나로 글자 영역 판정을 하면 통째로 꺼진다 — 중앙 타원만 곱하고 글자 영역은 캔버스 마스크가 지운다.
    for (const p of ps) blit(ctx, sp.f, p.x, p.y, 0, 1, 0.45, p.s, this.alpha(p, e) * fadeAt(p.x / e.w, p.y / e.h), dpr);
  },
};

/** 은하수 — 옅은 별 반짝임(k0, 영상이 없을 때도 하늘이 비지 않게) + 6~12초마다 유성(k1) 하나. */
const meteor: AmbienceEffect = {
  density: 60, maxAlpha: 0.8,
  kindOf: (i, n) => (i === n - 1 && n > 4 ? 1 : 0),
  spawn(rng, e, k, _i, _n, initial) {
    const u = e.u;
    if (k === 0) {
      return mk({ x: rand(rng, 0, 1) * e.w, y: Math.pow(rng(), 1.4) * e.h, s: rand(rng, 3, 7) * u, a: rand(rng, 0.2, 0.55), ph: rand(rng, 0, TAU), vr: rand(rng, 0.4, 1.4) });
    }
    const ang = rand(rng, 0.25, 0.45), dir = rng() < 0.5 ? 1 : -1, v = rand(rng, 900, 1200) * u;
    return mk({
      k: 1, x: (dir > 0 ? rand(rng, 0.05, 0.55) : rand(rng, 0.45, 0.95)) * e.w, y: rand(rng, 0.02, 0.22) * e.h,
      vx: Math.cos(ang) * v * dir, vy: Math.sin(ang) * v, s: rand(rng, 240, 340) * u, a: 0.8,
      t: initial ? -rand(rng, 2, 6) : -rand(rng, 6, 12), life: 1.3,
    });
  },
  step(p, dt) {
    p.t += dt;
    if (p.k === 1) { if (p.t > 0) { p.x += p.vx * dt; p.y += p.vy * dt; } return p.t < p.life; }
    return true;
  },
  alpha(p) {
    if (p.k === 1) return p.t < 0 ? 0 : p.a * Math.sin((Math.PI * clamp(p.t, 0, p.life)) / p.life);
    return p.a * (0.7 + 0.3 * Math.sin(p.t * p.vr + p.ph));
  },
  sprites: () => ({ d: dot('255,250,240') }),
  draw(ctx, ps, e, sp, dpr) {
    for (const p of ps) {
      const a = this.alpha(p, e) * fadeP(p, e);
      if (p.k === 0) { blit(ctx, sp.d, p.x, p.y, 0, 1, 1, p.s, a, dpr); continue; }
      if (a <= 0.003) continue;
      const v = Math.hypot(p.vx, p.vy) || 1;
      const tx = p.x - (p.vx / v) * p.s, ty = p.y - (p.vy / v) * p.s;
      base(ctx, dpr);
      const g = ctx.createLinearGradient(tx, ty, p.x, p.y);
      g.addColorStop(0, 'rgba(255,250,235,0)'); g.addColorStop(1, 'rgba(255,250,235,1)');
      ctx.globalAlpha = a; ctx.strokeStyle = g; ctx.lineWidth = 2 * e.u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
      blit(ctx, sp.d, p.x, p.y, 0, 1, 1, 12 * e.u, a, dpr);
    }
  },
};

/** 수중 — 기포가 흔들리며 떠오른다. 앞 레이어 기포는 크고 흐리다(카메라 앞을 지나가는 느낌). */
const bubbles: AmbienceEffect = {
  density: 40, maxAlpha: 0.6,
  spawn(rng, e, _k, _i, _n, initial) {
    const u = e.u, z = rng(), d = depthScale(z);
    return mk({
      z, x: rand(rng, 0.02, 0.98) * e.w, y: initial ? rand(rng, 0, 1) * e.h : e.h + 20 * u * d.size,
      vy: -rand(rng, 30, 60) * u * d.speed, s: rand(rng, 6, 14) * u * d.size, a: rand(rng, 0.35, 0.6) * d.alpha,
      ph: rand(rng, 0, TAU), t: rand(rng, 0, 20),
    });
  },
  step(p, dt, e) {
    p.t += dt;
    p.y += p.vy * dt;
    p.x += Math.sin(p.t * 2.2 + p.ph) * 14 * e.u * dt;
    return p.y > -p.s * 2;
  },
  alpha: (p) => p.a,
  sprites: () => { const b = bubbleSprite(); return { b, f: soften(b, 4) }; },
  draw(ctx, ps, e, sp, dpr) {
    for (const p of ps) blit(ctx, p.z >= FRONT ? sp.f : sp.b, p.x, p.y, 0, 1, 1, p.s * 2, this.alpha(p, e) * fadeP(p, e), dpr);
  },
};

/** 여름 바다 윤슬 — 수면(화면 아래 55%)에 짧게 반짝이는 빛. 가로로 납작한 빛점이 0.6~1.6초 켜졌다 꺼진다. */
const glints: AmbienceEffect = {
  density: 80, maxAlpha: 0.7,
  spawn(rng, e, _k, _i, _n, initial) {
    const u = e.u, y = rand(rng, 0.45, 1) * e.h, near = (y / e.h - 0.45) / 0.55; // 아래(가까운 물결)일수록 크다
    return mk({
      x: rand(rng, 0, 1) * e.w, y, s: (18 + 50 * near) * u * rand(rng, 0.7, 1.3), a: rand(rng, 0.35, 0.7),
      t: initial ? -rand(rng, 0, 2) : -rand(rng, 0.1, 2), life: rand(rng, 0.6, 1.6),
    });
  },
  step(p, dt, e) { p.t += dt; p.x += 6 * e.u * dt; return p.t < p.life; },
  alpha(p) { if (p.t < 0) return 0; const s = Math.sin((Math.PI * p.t) / p.life); return p.a * s * s; },
  sprites: () => ({ g: dot('255,244,220') }),
  draw(ctx, ps, e, sp, dpr) {
    for (const p of ps) blit(ctx, sp.g, p.x, p.y, 0, 1, 0.16, p.s, this.alpha(p, e) * fadeP(p, e), dpr);
  },
};

/** 빛먼지 — 햇살 속을 떠도는 먼지·꽃가루. 앞 레이어는 큰 보케(흐린 원)로 영화 같은 깊이를 준다. */
const dust: AmbienceEffect = {
  density: 50, maxAlpha: 0.55,
  spawn(rng, e, _k, _i, _n, initial) {
    const u = e.u, z = rng(), d = depthScale(z);
    return mk({
      z, x: initial ? rand(rng, 0, 1) * e.w : -20 * u, y: rand(rng, 0, 1) * e.h,
      vx: rand(rng, 8, 22) * u * d.speed, vy: -rand(rng, 2, 10) * u * d.speed,
      s: (z >= FRONT ? rand(rng, 40, 80) : rand(rng, 5, 12)) * u * d.size, a: (z >= FRONT ? rand(rng, 0.1, 0.2) : rand(rng, 0.3, 0.55)) * d.alpha,
      ph: rand(rng, 0, TAU), t: rand(rng, 0, 20), vr: rand(rng, 0.5, 1.2),
    });
  },
  step(p, dt, e) {
    p.t += dt;
    p.x += (p.vx + Math.sin(p.t * 0.4 + p.ph) * 6 * e.u) * dt;
    p.y += (p.vy + Math.cos(p.t * 0.33 + p.ph) * 5 * e.u) * dt;
    if (p.y < -p.s) p.y += e.h + 2 * p.s;
    return p.x < e.w + p.s;
  },
  alpha: (p) => p.a * (0.6 + 0.4 * Math.sin(p.t * p.vr + p.ph)),
  sprites: () => ({
    d: dot('255,228,170'),
    bokeh: glowSprite(64, [[0, 'rgba(255,230,180,.55)'], [0.7, 'rgba(255,230,180,.45)'], [0.85, 'rgba(255,236,200,.6)'], [1, 'rgba(255,230,180,0)']]),
  }),
  draw(ctx, ps, e, sp, dpr) {
    for (const p of ps) blit(ctx, p.z >= FRONT ? sp.bokeh : sp.d, p.x, p.y, 0, 1, 1, p.s, this.alpha(p, e) * fadeP(p, e), dpr);
  },
};

export const AMBIENCE_EFFECTS: Record<AmbienceMotionId, AmbienceEffect> = {
  sakura, maple: mapleFx, blizzard, snow,
  'rain-glass': rainGlass, mist, meteor,
  bubbles, glints, dust,
};
