// src/components/features/clock/ambience/scenes/sceneFx.ts — 일러스트 장면의 움직이는 입자(엔진 AmbienceEffect 규격).
//
// drift  : 바람 흐름장(사인 합) + 가끔 지나가는 돌풍 앞머리를 타고 흩날리는 것 — 꽃잎·단풍·눈·반딧불·부유물.
//          깊이 4층(멀리: 작고 선명·옅음 / 가운데: 선명 / 가까이: 흐림 / 맨 앞: 크게 흐린 보케) = 피사계심도.
//          꽃잎·잎은 뒤집힘(3D)을 가로 축 눌림 + 뒷면 어둡게로 흉내 낸다.
// sparkle: 제자리에서 천천히 빛났다 사라지는 것 — 별 반짝임·물비늘·등불 빛가루. 주기 ≥2초라 번쩍이지 않는다.
// meteor : 가끔 한 줄 긋고 사라지는 유성(가는 선 하나 · 화면 밝기 변화 없음).
// combine: 한 장면에 여러 종류를 섞는다(슬롯을 비율로 나눈다 — 할당 0).
//
// 공통: 글자 금지 영역·중앙 타원은 엔진 fadeP 로 0 에 가깝게 누르고, 캔버스 마스크가 한 번 더 지운다(ClockAmbience).
//       도안은 scale(=u×dpr) 해상도로 다시 그린다 — 4K 에서도 확대 번짐 없음.

import { type AmbienceEffect, type Env, type P, type Rng, type Sprites, blit, clamp, makeSprite, rand } from '../ambienceEngine';
import { fadeP } from '../ambienceEffects';
import { TAU, blurred } from './sceneKit';

const mk = (o: Partial<P>): P => ({
  k: 0, x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, s: 1, a: 0, ph: 0, t: 0, life: Infinity, c: 0, z: 0.5, q: 0, ...o,
});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 도안 여백 배율 — 흐림이 잘리지 않게 도안 캔버스를 모양보다 크게 만든다. blit 크기도 이만큼 키운다. */
export const PAD = 1.7;

/** 모양 하나를 여백 있는 정사각 도안으로. paint 는 (0,0) 중심·반지름 px/2 기준으로 그린다. */
export function shapeSprite(px: number, paint: (g: CanvasRenderingContext2D, r: number) => void) {
  const S = Math.max(8, Math.ceil(px * PAD));
  return makeSprite(S, S, (g) => { g.translate(S / 2, S / 2); paint(g, px / 2); });
}

// ── 바람 ─────────────────────────────────────────────────────────────────────
/** 돌풍: 11초마다 한 번, 왼쪽에서 오른쪽으로 앞머리가 지나간다(시간만의 함수 — 결정적). 0..1 */
export function gustAt(x: number, y: number, e: Env, period = 11): number {
  const idx = Math.floor(e.time / period), f = e.time / period - idx;
  if (f > 0.6) return 0;
  const h = Math.sin(idx * 12.9898) * 43758.5453, rnd = h - Math.floor(h);
  const front = (-0.35 + 1.9 * (f / 0.6)) * e.w;
  const env = Math.sin(Math.PI * (f / 0.6)); // 돌풍 전체가 부드럽게 일었다 잦아든다
  const d = (x - front) / (0.2 * e.w);
  const band = 0.55 + 0.45 * Math.sin(y / (180 * e.u) + idx * 1.7);
  return (0.55 + 0.45 * rnd) * env * Math.exp(-d * d) * band;
}

export interface DriftCfg {
  density: number; maxAlpha: number;
  /** 1080 기준 크기(px) — 멀리(z=0) · 가까이(z=1) */
  size: [number, number];
  /** 떨어지는 속도(px/s, 음수면 떠오름) — 멀리·가까이 */
  fall: [number, number];
  /** 기본 바람(px/s, 가까이 기준) */
  wind: number;
  /** 흐름장 세기(px/s) */
  flow: number;
  /** 돌풍 세기(px/s). 0 = 없음 */
  gust: number;
  /** 제자리 회전(rad/s 최대) */
  spin: number;
  /** 3D 뒤집힘(꽃잎·잎) */
  flip: boolean;
  /** 불투명도 — 멀리·가까이 */
  alpha: [number, number];
  /** 도안(선명) 만들기 — px 는 캔버스 픽셀 지름. 여러 장이면 입자마다 하나를 고른다. */
  paint: ((g: CanvasRenderingContext2D, r: number) => void)[];
  /** 멀리 층을 하늘색 쪽으로 옅게(대기원근) — 0..1 */
  haze?: number;
  /** 빛을 받는 정도(0..1) — 이 값만큼 밝게(가산 광택). 등불·달 근처 꽃잎 반짝임. */
  light?: (x: number, y: number, e: Env) => number;
  /** 반딧불처럼 천천히 숨 쉬듯 밝아졌다 어두워짐 [최소 주기 s, 최대 주기 s] */
  pulse?: [number, number];
  /** 가산 합성(빛 입자) */
  additive?: boolean;
  /** 떠다님(반딧불·부유물) — 제자리 배회 세기(px/s) */
  wander?: number;
  /** 스폰 가로 범위(0..1) — 한쪽 구석 가지에서만 떨어지게 할 때 */
  spawnX?: [number, number];
}

type Bin = 0 | 1 | 2 | 3; // 0 멀리(선명) 1 가운데(선명) 2 가까이(흐림) 3 보케
const binOf = (z: number): Bin => (z < 0.35 ? 0 : z < 0.72 ? 1 : z < 0.9 ? 2 : 3);

export function drift(cfg: DriftCfg): AmbienceEffect {
  const sizeAt = (z: number) => lerp(cfg.size[0], cfg.size[1], z * z);
  const variants = cfg.paint.length;
  return {
    density: cfg.density, maxAlpha: cfg.maxAlpha,
    spawn(rng, e, _k, i, n, initial) {
      const u = e.u;
      const z = clamp((i + rng()) / Math.max(1, n), 0, 0.999); // 슬롯 순서 = 깊이 순서(멀리부터 그린다)
      const s = sizeAt(z) * u * rand(rng, 0.8, 1.15);
      const [sx0, sx1] = cfg.spawnX ?? [-0.25, 1];
      let x: number, y: number;
      if (initial || cfg.wander) { x = rand(rng, 0, 1) * e.w; y = rand(rng, 0, 1) * e.h; }
      else if (cfg.fall[1] < 0) { x = rand(rng, 0, 1) * e.w; y = e.h + s * 2; }
      else if (cfg.wind > 0 && rng() < clamp(cfg.wind / (cfg.wind + Math.abs(cfg.fall[1]) * 2), 0, 0.6)) { x = -s * 2; y = rand(rng, -0.1, 0.8) * e.h; }
      else { x = rand(rng, sx0, sx1) * e.w; y = -s * 2; }
      const fall = lerp(cfg.fall[0], cfg.fall[1], z) * u;
      return mk({
        z, x, y, s, vx: cfg.wind * u * (0.4 + 0.6 * z), vy: fall,
        r: rand(rng, 0, TAU), vr: rand(rng, -1, 1) * cfg.spin, ph: rand(rng, 0, TAU), q: rand(rng, 0, TAU),
        a: lerp(cfg.alpha[0], cfg.alpha[1], z) * rand(rng, 0.8, 1), c: Math.floor(rng() * variants),
        life: cfg.pulse ? rand(rng, cfg.pulse[0], cfg.pulse[1]) : Infinity, t: rand(rng, 0, 30),
      });
    },
    step(p, dt, e) {
      const u = e.u, sp = 0.45 + 0.55 * p.z, t = e.time;
      p.t += dt;
      let tx: number, ty: number;
      if (cfg.wander) {
        tx = cfg.wander * u * sp * Math.sin(p.t * 0.31 + p.ph) + cfg.flow * u * Math.sin(p.y / (260 * u) + t * 0.2);
        ty = cfg.wander * u * sp * Math.cos(p.t * 0.27 + p.ph * 1.3) + lerp(cfg.fall[0], cfg.fall[1], p.z) * u;
      } else {
        const fx = Math.sin(p.y / (230 * u) + t * 0.21 + p.z * 3) * 0.6 + Math.sin((p.x * 0.6 + p.y) / (470 * u) - t * 0.17) * 0.4;
        const fy = Math.sin(p.x / (310 * u) + t * 0.23 + p.z * 2);
        const gu = cfg.gust ? gustAt(p.x, p.y, e) : 0;
        tx = (cfg.wind + cfg.flow * fx + cfg.gust * gu) * u * sp + Math.sin(p.t * 2.1 + p.ph) * 12 * u * sp * (cfg.flip ? 1 : 0.4);
        ty = (lerp(cfg.fall[0], cfg.fall[1], p.z) + cfg.flow * 0.45 * fy - cfg.gust * 0.3 * gu) * u;
        p.vr += (gu * 2.2 * Math.sign(p.vr || 1) - (p.vr - clamp(p.vr, -cfg.spin, cfg.spin)) * 0.5) * dt;
        p.q = (p.q ?? 0) + (1.6 + Math.abs(p.vr) * 0.8 + gu * 5) * dt; // 뒤집힘 — 돌풍에 빨라진다
      }
      const k = Math.min(1, dt * 1.6); // 관성 — 바람을 천천히 따라간다(곡선 궤적)
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      const m = p.s * PAD;
      if (cfg.wander) { // 화면 밖으로 새지 않고 감아 돈다
        if (p.x < -m) p.x += e.w + 2 * m; else if (p.x > e.w + m) p.x -= e.w + 2 * m;
        if (p.y < -m) p.y += e.h + 2 * m; else if (p.y > e.h + m) p.y -= e.h + 2 * m;
        return true;
      }
      return p.x < e.w + m && p.x > -m * 3 && p.y < e.h + m && p.y > -m * 4;
    },
    alpha(p) {
      if (!cfg.pulse) return p.a;
      const ph = (p.t / p.life) * TAU + p.ph;
      const b = Math.pow(0.5 + 0.5 * Math.sin(ph), 2.2); // 천천히 밝아졌다 어두워짐 — 주기 ≥ pulse[0] 초
      return p.a * (0.12 + 0.88 * b);
    },
    sprites(scale) {
      const out: Sprites = {};
      const sharpPx = sizeAt(0.72) * scale * 1.1, softPx = sizeAt(0.9) * scale * 0.7, bokehPx = sizeAt(1) * scale * 0.5;
      cfg.paint.forEach((paint, v) => {
        out[`s${v}`] = shapeSprite(sharpPx, paint);
        const soft = shapeSprite(softPx, paint);
        out[`n${v}`] = blurred(soft, softPx * 0.07);
        const bk = shapeSprite(bokehPx, paint);
        out[`k${v}`] = blurred(bk, bokehPx * 0.16);
      });
      return out;
    },
    draw(ctx, ps, e, sp, dpr) {
      if (cfg.additive) ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        if (p.k !== K) continue;
        const bin = binOf(p.z);
        const img = sp[(bin <= 1 ? 's' : bin === 2 ? 'n' : 'k') + p.c];
        if (!img) continue;
        let a = this.alpha(p, e) * fadeP(p, e);
        if (a <= 0.004) continue;
        let sx = 1;
        if (cfg.flip) {
          const c = Math.cos(p.q ?? 0);
          sx = Math.max(0.12, Math.abs(c));
          if (c < 0) a *= 0.78; // 뒷면은 조금 어둡다
        }
        if (cfg.haze && bin === 0) a *= 1 - cfg.haze * (1 - p.z / 0.35) * 0.5;
        blit(ctx, img, p.x, p.y, p.r, sx, 1, p.s * PAD, a, dpr);
        if (cfg.light) { // 빛을 받는 순간 — 같은 도안을 가산으로 한 번 더(면이 광원을 향할 때 가장 밝다)
          const l = cfg.light(p.x, p.y, e) * (cfg.flip ? Math.pow(Math.abs(Math.cos(p.q ?? 0)), 3) : 1);
          if (l > 0.03) {
            ctx.globalCompositeOperation = 'lighter';
            blit(ctx, img, p.x, p.y, p.r, sx, 1, p.s * PAD, a * l * 0.9, dpr);
            ctx.globalCompositeOperation = cfg.additive ? 'lighter' : 'source-over';
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  };
}
/** 지금 그리는 효과 번호 — combine 이 draw 직전에 정한다(단독이면 0). draw 는 동기라 한 번에 하나만 돈다. */
let K = 0;

export interface SparkleCfg {
  density: number; maxAlpha: number;
  /** 한 점 뽑기(CSS px) */
  at: (rng: Rng, e: Env) => [number, number];
  size: [number, number];
  /** 한 번 빛나는 길이(s) — 길수록 차분하다 */
  life: [number, number];
  /** 가로·세로 늘림(물비늘은 가로로 길다) */
  stretch?: [number, number];
  paint: (g: CanvasRenderingContext2D, r: number) => void;
  additive?: boolean;
  /** 옆으로 천천히 흐름(px/s) */
  drift?: number;
}
export function sparkle(cfg: SparkleCfg): AmbienceEffect {
  const [sx, sy] = cfg.stretch ?? [1, 1];
  return {
    density: cfg.density, maxAlpha: cfg.maxAlpha,
    spawn(rng, e, _k, _i, _n, initial) {
      const [x, y] = cfg.at(rng, e);
      const life = rand(rng, cfg.life[0], cfg.life[1]);
      return mk({ x, y, s: rand(rng, cfg.size[0], cfg.size[1]) * e.u, a: cfg.maxAlpha * rand(rng, 0.55, 1), life, t: initial ? rand(rng, 0, life) : 0, ph: rand(rng, 0, TAU), vx: (cfg.drift ?? 0) * e.u * rand(rng, 0.5, 1) });
    },
    step(p, dt) { p.t += dt; p.x += p.vx * dt; return p.t < p.life; },
    alpha(p) { const f = Math.sin(Math.PI * clamp(p.t / p.life, 0, 1)); return p.a * f * f; },
    sprites(scale) { return { g: shapeSprite(Math.max(...cfg.size) * scale, cfg.paint) }; },
    draw(ctx, ps, e, sp, dpr) {
      if (cfg.additive !== false) ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        if (p.k !== K) continue;
        blit(ctx, sp.g, p.x, p.y, 0, sx, sy, p.s * PAD, this.alpha(p, e) * fadeP(p, e), dpr);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  };
}

/** 유성 — 슬롯 몇 개가 대부분의 시간을 '대기'로 보내다가 한 번 긋는다(평균 7초에 하나). */
export function meteor(region: [number, number, number, number], color = '220,235,255'): AmbienceEffect {
  const FLY = 0.9;
  return {
    density: 2, maxAlpha: 0.8,
    spawn(rng, e) {
      const [x0, y0, x1, y1] = region;
      const ang = rand(rng, 0.35, 0.6);
      const v = rand(rng, 700, 1000) * e.u;
      return mk({ x: rand(rng, x0, x1) * e.w, y: rand(rng, y0, y1) * e.h, vx: -Math.cos(ang) * v, vy: Math.sin(ang) * v, s: rand(rng, 140, 240) * e.u, a: rand(rng, 0.45, 0.8), t: -rand(rng, 3, 12) });
    },
    step(p, dt) { p.t += dt; if (p.t > 0) { p.x += p.vx * dt; p.y += p.vy * dt; } return p.t < FLY; },
    alpha(p) { if (p.t <= 0) return 0; const f = Math.sin(Math.PI * p.t / FLY); return p.a * f; },
    draw(ctx, ps, e, _sp, dpr) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        if (p.k !== K) continue;
        const a = this.alpha(p, e) * fadeP(p, e);
        if (a <= 0.01) continue;
        const sp = Math.hypot(p.vx, p.vy), tx = p.x - (p.vx / sp) * p.s, ty = p.y - (p.vy / sp) * p.s;
        const gr = ctx.createLinearGradient(p.x, p.y, tx, ty);
        gr.addColorStop(0, `rgba(${color},${a})`); gr.addColorStop(1, `rgba(${color},0)`);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = gr; ctx.lineWidth = 1.6 * e.u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

/** 여러 효과를 한 장면에 — 슬롯을 비율로 나눠 k(=효과 번호)를 붙인다. 입자 상한은 엔진이 합계로 지킨다. */
export function combine(...parts: [AmbienceEffect, number][]): AmbienceEffect {
  const total = parts.reduce((s, [, w]) => s + w, 0);
  const ranges = (n: number) => { // [시작, 개수][]
    let acc = 0;
    return parts.map(([, w], idx) => {
      const start = Math.round((acc / total) * n);
      acc += w;
      const end = idx === parts.length - 1 ? n : Math.round((acc / total) * n);
      return [start, Math.max(0, end - start)] as const;
    });
  };
  const fx = parts.map(([f]) => f);
  let lastSp: Sprites | null = null, subs: Sprites[] = [];
  return {
    density: parts.reduce((s, [f]) => s + f.density, 0),
    maxAlpha: Math.max(...fx.map((f) => f.maxAlpha)),
    kindOf(i, n) { const r = ranges(n); for (let k = r.length - 1; k >= 0; k--) if (i >= r[k][0]) return k; return 0; },
    spawn(rng, e, k, i, n, initial) {
      const [start, cnt] = ranges(n)[k];
      const p = fx[k].spawn(rng, e, 0, i - start, cnt, initial);
      p.k = k;
      return p;
    },
    step(p, dt, e, rng) { return fx[p.k].step(p, dt, e, rng); },
    alpha(p, e) { return fx[p.k].alpha(p, e); },
    sprites(scale) {
      const out: Sprites = {};
      fx.forEach((f, k) => { const s = f.sprites?.(scale) ?? {}; for (const key in s) out[`${k}:${key}`] = s[key]; });
      return out;
    },
    draw(ctx, ps, e, sp, dpr) {
      if (sp !== lastSp) { // 도안 묶음이 바뀔 때(리사이즈)만 효과별로 나눈다 — 프레임마다 객체를 만들지 않게
        lastSp = sp;
        subs = fx.map((_, k) => {
          const sub: Sprites = {}, pre = `${k}:`;
          for (const key in sp) if (key.startsWith(pre)) sub[key.slice(pre.length)] = sp[key];
          return sub;
        });
      }
      for (let k = 0; k < fx.length; k++) { K = k; fx[k].draw(ctx, ps, e, subs[k], dpr); }
      K = 0;
    },
  };
}
