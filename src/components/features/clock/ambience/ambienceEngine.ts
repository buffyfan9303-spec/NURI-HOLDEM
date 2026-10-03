// src/components/features/clock/ambience/ambienceEngine.ts — 클락 모션 배경(엠비언스) 엔진의 순수 부분.
//
// 오너 지시 2026-09-29 밤: "계절별·날씨별·동물 모션 테마 … 모션은 자연스럽게 — 벚꽃이 조금씩 흩날림,
//   비가 조금씩 내리며 물방울이 화면에 조금 튐 정도".
//
// 이 파일은 **DOM 을 만지지 않는다**(vitest node 환경에서 그대로 돈다). 캔버스·rAF·관찰자는 ClockAmbience.tsx 에 있다.
// 여기서 잠그는 것 — 테스트가 직접 본다:
//   · 입자 수 상한(AMBIENCE_MAX_PARTICLES) · 화면 크기에 따른 예산(ambienceCount)
//   · 가독 보호(fadeAt): 타이머·블라인드가 앉는 중앙 타원 안에서는 입자를 옅게 누른다
//   · 시뮬레이션(createAmbienceSim): 스폰·스텝·리사이즈 — 시드 난수라 결정적이다

/** 시드 난수(mulberry32) — 미리보기·테스트가 같은 장면을 다시 그릴 수 있게 한다. */
export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 입자 한 개. 필드 의미는 효과마다 조금씩 다르다(각 효과 주석 참고) — 객체를 새로 만들지 않고 재사용한다(GC 0). */
export interface P {
  k: number;    // 종류(효과 안에서: 0 = 주 입자, 1·2 = 보조 — 빗방울 자국·유성 등)
  x: number; y: number;
  vx: number; vy: number;
  r: number; vr: number; // 회전·회전 속도(rad, rad/s)
  s: number;    // 크기(CSS px — 이미 화면 배율 u 가 곱해진 값)
  a: number;    // 기본 불투명도(시간 변화 전)
  ph: number;   // 위상(흔들림·깜빡임을 입자마다 어긋나게)
  t: number;    // 나이(s). 음수면 '대기 중'(아직 안 보임)
  life: number; // 수명(s). Infinity = 화면을 벗어날 때까지
  c: number;    // 색 인덱스(또는 효과별 보조 값)
  z: number;    // 깊이 0(멀리)…1(가까이) — 크기·속도·불투명도·초점(흐림)을 함께 정한다
  q?: number;   // 보조 위상(장면 효과: 꽃잎 뒤집힘 누적각 등)
}

/** 글자 금지 영역(캔버스 CSS px). 헤더 제목·시각, 시상·지표 열, 타이머·블라인드, 하단 지표 — 보드가 알려 준다. */
export interface Zone { x0: number; y0: number; x1: number; y1: number }

/** 한 프레임의 화면 정보. u = 짧은 변 / 1080 — 모든 크기·속도는 1080 기준 설계값에 u 를 곱한다. */
export interface Env { w: number; h: number; u: number; time: number; zones: Zone[] }

export type Sprites = Record<string, HTMLCanvasElement>;

export interface AmbienceEffect {
  /** 1920×1080 한 화면 기준 입자 수(품질 1). 실제 수는 ambienceCount 가 정한다. */
  density: number;
  /** 입자 하나가 가질 수 있는 최대 불투명도 — alpha() 가 이 값을 넘지 않는다(테스트가 잠근다). */
  maxAlpha: number;
  /** i 번째 슬롯의 종류(보조 입자가 있는 효과만). 기본 0. */
  kindOf?(i: number, n: number): number;
  spawn(rng: Rng, e: Env, k: number, i: number, n: number, initial: boolean): P;
  /** false 를 돌려주면 그 슬롯을 새로 스폰한다(화면 밖으로 나갔거나 수명이 끝났다). */
  step(p: P, dt: number, e: Env, rng: Rng): boolean;
  /** 지금 이 순간의 불투명도(가독 보호 fadeAt 적용 전). 순수 함수. */
  alpha(p: P, e: Env): number;
  /** 캔버스 그리기 — 한 효과의 입자를 한 번에 그린다(같은 스타일은 한 path 로 묶기 위해). */
  draw(ctx: CanvasRenderingContext2D, ps: P[], e: Env, sp: Sprites, dpr: number): void;
  /** 미리 그려 두는 도안(입자마다 path 를 다시 만들지 않게). 마운트·리사이즈 때 한 번.
   *  scale = CSS px → 캔버스 px 배율(u × dpr) — 4K 에서도 도안을 확대하지 않고 그 해상도로 다시 그린다. */
  sprites?(scale: number): Sprites;
}

// ── 예산 ─────────────────────────────────────────────────────────────────────
/** 입자 수 절대 상한 — 어떤 효과·화면 크기·품질에서도 넘지 않는다.
 *  근거(2026-09-29 실측, ambience-report.md 성능표): 가장 무거운 효과(별밤 121개)도 4× CPU 스로틀에서
 *  프레임당 스크립트가 수 ms 이고, 160 은 그 위 여유다. 저사양 TV 스틱은 아래 자동 품질 강등이 한 번 더 막는다. */
export const AMBIENCE_MAX_PARTICLES = 160;
/** 목표 프레임률 — 배경 장식이라 30 이면 충분하고, 60 의 절반만 그린다(저사양 TV·발열). */
export const AMBIENCE_FPS = 30;
/** 캔버스 해상도 상한(devicePixelRatio). 입자가 전부 부드러운 도안이라 1 배로 그려도 번짐이 안 보이고,
 *  4K(dpr 2) TV 에서 채우기 비용이 4 배가 되는 것을 막는다. */
export const AMBIENCE_DPR_CAP = 1;
/** 한 프레임(스텝+그리기) 이동평균이 이 값을 넘으면 입자를 절반으로 줄인다(최대 두 번 → 1/4). */
export const AMBIENCE_FRAME_BUDGET_MS = 8;

export function ambienceUnit(w: number, h: number): number {
  return Math.max(0.05, Math.min(w, h) / 1080);
}

/** 화면 크기·품질 → 입자 수. 크기는 u(짧은 변) 로 이미 커지므로, 수는 **설계 단위 면적 비**로만 늘린다
 *  (16:9 든 9:16 이든 1.0 — 1280×900 같은 4:3 쪽은 0.8). 품질은 1 → 0.5 → 0.25. */
export function ambienceCount(fx: Pick<AmbienceEffect, 'density'>, w: number, h: number, quality = 1): number {
  if (!(w > 0) || !(h > 0)) return 0;
  const u = ambienceUnit(w, h);
  const area = clamp((w * h) / (u * u * 1920 * 1080), 0.5, 1.5);
  return clamp(Math.round(fx.density * area * quality), 1, AMBIENCE_MAX_PARTICLES);
}

// ── 가독 보호 ────────────────────────────────────────────────────────────────
/** 타이머·LEVEL·블라인드가 앉는 중앙 타원(정규 좌표). ClockStage 의 중앙 열(가로 보드 약 34~66%)과
 *  타이머 세로 중심(본문 중앙 ≈ 47%) 기준. 이 안에서는 입자를 FLOOR 배로 누르고, 1.6 배 반경까지 부드럽게 푼다. */
export const READ_ZONE = { cx: 0.5, cy: 0.47, rx: 0.24, ry: 0.34, floor: 0.22, outer: 1.6 } as const;

/** 정규 좌표(nx, ny ∈ 0..1) → 불투명도 배율(floor..1). 순수 함수. */
export function fadeAt(nx: number, ny: number): number {
  const dx = (nx - READ_ZONE.cx) / READ_ZONE.rx;
  const dy = (ny - READ_ZONE.cy) / READ_ZONE.ry;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= 1) return READ_ZONE.floor;
  if (d >= READ_ZONE.outer) return 1;
  const t = (d - 1) / (READ_ZONE.outer - 1);
  const s = t * t * (3 - 2 * t); // smoothstep
  return READ_ZONE.floor + (1 - READ_ZONE.floor) * s;
}

/** 글자 금지 영역 바깥 거리 → 불투명도 배율. 영역 안 = 0, 가장자리에서 margin 만큼 벗어나면 1(smoothstep).
 *  리드 지시 2026-09-29: "입자/생물은 글자·숫자 영역을 피하거나 그 위에서는 투명도를 크게 낮춰라" — 엔진 공통 규칙.
 *  캔버스 쪽에서도 같은 영역을 destination-out 으로 한 번 더 지운다(ClockAmbience) — 큰 도형(고래·안개)까지 픽셀 단위로 0. */
export function zoneFade(x: number, y: number, zones: readonly Zone[], margin: number): number {
  let f = 1;
  for (const z of zones) {
    const dx = Math.max(z.x0 - x, 0, x - z.x1), dy = Math.max(z.y0 - y, 0, y - z.y1);
    if (dx === 0 && dy === 0) return 0;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < margin) { const t = d / margin; f = Math.min(f, t * t * (3 - 2 * t)); }
  }
  return f;
}

/** 기본 글자 금지 영역 — ClockStage 가 이미 가진 앵커 + 명시 표식(ClockAmbience 의 avoidSelector 기본값). */
export const AMBIENCE_AVOID_DEFAULT = [
  '[data-amb-avoid]', 'header',
  '[data-testid="clk-timer"]', '[data-testid="clk-level"]', '[data-testid="clk-paused"]',
  '[data-testid="clk-cur-blinds"]', '[data-testid="clk-next-blinds"]',
  '[data-testid="clk-prizes"]', '[data-testid="clk-prizes-band"]', '[data-testid="clk-rails"]', '[data-testid="clk-rails-band"]',
].join(', ');

export const insideZone = (x: number, y: number, zones: readonly Zone[]) =>
  zones.some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);

// ── 시뮬레이션 ───────────────────────────────────────────────────────────────
export interface AmbienceSim {
  readonly particles: P[];
  readonly env: Env;
  readonly quality: number;
  /** 화면 크기가 바뀌었다. 입자 수가 같으면 위치를 비율로 옮기고, 다르면 새로 흩뿌린다. */
  resize(w: number, h: number): void;
  /** dt 초만큼 진행. dt 는 호출부가 자른다(탭 복귀 때 몇 초가 한 번에 오지 않게). */
  step(dt: number): void;
  /** 품질 변경(자동 강등). */
  setQuality(q: number): void;
  /** 글자 금지 영역 교체(보드 레이아웃이 바뀔 때). */
  setZones(zones: Zone[]): void;
}

export function createAmbienceSim(fx: AmbienceEffect, rng: Rng): AmbienceSim {
  const particles: P[] = [];
  const env: Env = { w: 0, h: 0, u: 1, time: 0, zones: [] };
  let quality = 1;

  const fill = () => {
    const n = ambienceCount(fx, env.w, env.h, quality);
    particles.length = 0;
    for (let i = 0; i < n; i++) particles.push(fx.spawn(rng, env, fx.kindOf?.(i, n) ?? 0, i, n, true));
  };

  return {
    particles,
    env,
    get quality() { return quality; },
    resize(w, h) {
      if (!(w > 0) || !(h > 0)) return;
      const prevW = env.w, prevH = env.h;
      env.w = w; env.h = h; env.u = ambienceUnit(w, h);
      const n = ambienceCount(fx, w, h, quality);
      if (n !== particles.length || !(prevW > 0)) { fill(); return; }
      const sx = w / prevW, sy = h / prevH, su = env.u / ambienceUnit(prevW, prevH);
      for (const p of particles) { p.x *= sx; p.y *= sy; p.s *= su; p.vx *= su; p.vy *= su; }
    },
    step(dt) {
      if (!(dt > 0) || !(env.w > 0)) return;
      env.time += dt;
      const n = particles.length;
      for (let i = 0; i < n; i++) {
        const p = particles[i];
        if (!fx.step(p, dt, env, rng)) particles[i] = fx.spawn(rng, env, p.k, i, n, false);
      }
    },
    setQuality(q) {
      quality = clamp(q, 0.25, 1);
      if (env.w > 0) fill();
    },
    setZones(zones) {
      env.zones = zones;
    },
  };
}

// ── 그리기 도우미(캔버스 인자만 받는다 — 호출은 ClockAmbience 에서만) ───────────
/** 도안 한 장을 (x,y) 중심·회전·축 배율·크기로 찍는다. setTransform 한 번이라 save/restore 가 필요 없다. */
export function blit(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number,
  rot: number, sx: number, sy: number, size: number, alpha: number, dpr: number,
): void {
  if (alpha <= 0.003) return;
  const c = Math.cos(rot), s = Math.sin(rot);
  ctx.globalAlpha = alpha;
  ctx.setTransform(dpr * c * sx, dpr * s * sx, -dpr * s * sy, dpr * c * sy, dpr * x, dpr * y);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
}

/** 도안용 작은 캔버스. document 가 없는 환경(테스트)에서는 부르지 않는다. */
export function makeSprite(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (g) paint(g);
  return c;
}

/** 방사형 번짐 도안. stops: [위치, rgba 문자열][] */
export function glowSprite(size: number, stops: [number, string][]): HTMLCanvasElement {
  return makeSprite(size, size, (g) => {
    const r = size / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  });
}
