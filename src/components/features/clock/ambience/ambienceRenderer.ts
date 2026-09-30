// src/components/features/clock/ambience/ambienceRenderer.ts — 모션 배경의 '한 프레임 그리기' 한 곳.
//
// ClockAmbience(운영 화면)와 미리보기 녹화기가 **같은 함수**로 그린다 — 두 벌이 되면 시안과 실제가 갈린다.
// 층(아래→위):
//   bg    정지 일러스트(장면) — 리사이즈 때 한 번, 화면 실제 해상도(dpr ≤ 2)로 다시 그린다(4K 선명)
//   mid   움직이는 배경(안개·구름·빛줄기·고래/학 실루엣) — 매 프레임, 가림막 없음(어두운 것·옅은 것만 둔다)
//   shade 가독 그늘 — 중앙 타원 + 글자 영역 뒤 부드러운 그림자(정지, 영역이 바뀔 때만 다시)
//   fx    입자(꽃잎·눈·반딧불…) — 매 프레임, 글자 영역은 destination-out 으로 지운다
// 실사 영상 테마(폭우 유리창 등)는 bg·mid·shade 없이 fx 만 쓴다(영상·막은 ClockAmbience 의 DOM 층).

import {
  type AmbienceEffect, type Env, type Rng, type Sprites, type Zone,
  ambienceUnit, createAmbienceSim, makeSprite, mulberry32,
} from './ambienceEngine';

export interface AmbienceScene<S = unknown> {
  id: string;
  label: string;
  /** 테마 강조색(레벨·블라인드·인원 글자) — 장면의 가장 밝은 stop 위에서도 4.5:1(테스트) */
  accent: string;
  /** 장면이 그려지기 전·실패 시의 CSS 바탕 세 색 [위(가장 밝음) · 중간 · 바탕] — 대비 계산의 기준 */
  stops: [string, string, string];
  /** 정지 일러스트. g 는 이미 dpr 배율이 걸려 있다(좌표 = CSS px). */
  paint(g: CanvasRenderingContext2D, w: number, h: number, u: number, rng: Rng, dpr: number): void;
  /** 입자(가림막 적용) */
  fx?: AmbienceEffect | null;
  /** 움직이는 배경의 준비물(도안 캐시) — 리사이즈 때 한 번. scale = u × dpr */
  init?(w: number, h: number, u: number, scale: number, rng: Rng): S;
  /** 움직이는 배경 한 프레임(가림막 없음). g 는 dpr 배율, 좌표 = CSS px. */
  under?(g: CanvasRenderingContext2D, e: Env, state: S): void;
  /** 가독 그늘 — veil: 중앙 타원 최대 어둡기, zone: 글자 영역 뒤 그림자 불투명도, frost: 글자 영역 뒤 흐린 유리(기본 0.9). 대비 실측으로 정한다. */
  shade: { veil: number; zone: number; frost?: number };
}

export interface RendererCanvases {
  fx: HTMLCanvasElement;
  bg?: HTMLCanvasElement | null;
  mid?: HTMLCanvasElement | null;
  shade?: HTMLCanvasElement | null;
}

export interface AmbienceRenderer {
  readonly env: Env;
  readonly quality: number;
  readonly count: number;
  resize(w: number, h: number, devicePixelRatio: number): void;
  setZones(zones: Zone[]): void;
  step(dt: number): void;
  render(): void;
  setQuality(q: number): void;
}

/** 장면 층의 해상도 상한 — 4K(dpr 2) TV 에서도 일러스트를 확대하지 않는다. 실사 영상 효과 층은 1(ambienceEngine). */
export const SCENE_DPR_CAP = 2;

export function createAmbienceRenderer(cv: RendererCanvases, effect: AmbienceEffect | null, scene: AmbienceScene | null, seed: number, dprCap: number): AmbienceRenderer {
  const rng = mulberry32(seed);
  const sim = effect ? createAmbienceSim(effect, rng) : null;
  const env: Env = sim ? sim.env : { w: 0, h: 0, u: 1, time: 0, zones: [] };
  const ctx = cv.fx.getContext('2d');
  const mctx = cv.mid?.getContext('2d') ?? null;
  let dpr = 1, sprites: Sprites = {}, mask: HTMLCanvasElement | null = null, zoneKey = '', state: unknown = null;

  const size = (c: HTMLCanvasElement | null | undefined, w: number, h: number) => { if (c) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); } };

  // 글자 영역을 지우는 마스크 — 가장자리 5겹 부드러운 띠 + 영역 자체는 불투명 1(=완전히 지움).
  const buildMask = (zones: Zone[]) => {
    if (!zones.length || !cv.fx.width) return null;
    return makeSprite(cv.fx.width, cv.fx.height, (g) => {
      const F = 28 * env.u * dpr;
      g.fillStyle = '#000';
      for (const z of zones) {
        const x0 = z.x0 * dpr, y0 = z.y0 * dpr, x1 = z.x1 * dpr, y1 = z.y1 * dpr;
        g.globalAlpha = 0.4;
        for (let k = 5; k >= 1; k--) { const d = (F * k) / 5; g.fillRect(x0 - d, y0 - d, x1 - x0 + 2 * d, y1 - y0 + 2 * d); }
        g.globalAlpha = 1;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    });
  };

  // 가독 그늘 — 무대 조명처럼: 정보가 앉는 자리는 그늘, 둘레는 장면이 빛난다.
  const paintShade = () => {
    const c = cv.shade, g = c?.getContext('2d');
    if (!c || !g || !scene) return;
    const { w, h, u } = env;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = scene.shade.veil;
    if (v > 0) {
      g.save();
      g.translate(w * 0.5, h * 0.47);
      g.scale(w * 0.36, h * 0.44);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, `rgba(0,0,0,${v})`); gr.addColorStop(0.55, `rgba(0,0,0,${v * 0.72})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(-1, -1, 2, 2);
      g.restore();
    }
    const za = scene.shade.zone;
    if (za > 0 && env.zones.length) {
      // 글자 영역 모양(가장자리 깃털) — 서리 유리·그림자 둘 다 이 모양을 쓴다
      const rects = (pad: number, sigma: number) => makeSprite(c.width, c.height, (t) => {
        t.filter = `blur(${sigma * dpr}px)`;
        t.fillStyle = '#000';
        t.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const z of env.zones) t.fillRect(z.x0 - pad, z.y0 - pad, z.x1 - z.x0 + 2 * pad, z.y1 - z.y0 + 2 * pad);
      });
      const tight = rects(16 * u, 18 * u);
      const frost = scene.shade.frost ?? 0.9;
      if (frost > 0 && cv.bg) { // 서리 유리 — 뒤 그림을 흐려 별·달 같은 작은 밝은 점이 글자 뒤에 남지 않게(iOS 위젯의 재질)
        const f = makeSprite(c.width, c.height, (t) => { t.filter = `blur(${18 * u * dpr}px)`; t.drawImage(cv.bg!, 0, 0); t.filter = 'none'; t.globalCompositeOperation = 'destination-in'; t.drawImage(tight, 0, 0); });
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = frost;
        g.drawImage(f, 0, 0);
      }
      const wide = rects(40 * u, 70 * u); // 넓게 번진 그늘(무대 조명의 가장자리) + 좁고 진한 그늘
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = za * 0.55; g.drawImage(wide, 0, 0);
      g.globalAlpha = za; g.drawImage(tight, 0, 0);
      g.globalAlpha = 1;
    }
  };

  const paintBg = () => {
    const c = cv.bg, g = c?.getContext('2d');
    if (!c || !g || !scene) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    scene.paint(g, env.w, env.h, env.u, mulberry32(seed ^ 0x5eed), dpr);
    g.setTransform(1, 0, 0, 1, 0, 0);
  };

  return {
    env,
    get quality() { return sim?.quality ?? 1; },
    get count() { return sim?.particles.length ?? 0; },
    resize(w, h, devicePixelRatio) {
      if (!(w > 0 && h > 0)) return;
      dpr = Math.min(devicePixelRatio || 1, dprCap);
      size(cv.fx, w, h); size(cv.bg, w, h); size(cv.mid, w, h); size(cv.shade, w, h);
      if (sim) sim.resize(w, h); else { env.w = w; env.h = h; env.u = ambienceUnit(w, h); }
      sprites = effect?.sprites?.(env.u * dpr) ?? {};
      paintBg();
      state = scene?.init?.(w, h, env.u, env.u * dpr, mulberry32(seed ^ 0x1717)) ?? null;
      zoneKey = '';
      const zones = env.zones;
      env.zones = [];
      this.setZones(zones);
    },
    setZones(zones) {
      const key = zones.map((z) => `${z.x0 | 0},${z.y0 | 0},${z.x1 | 0},${z.y1 | 0}`).join(';');
      if (key === zoneKey) return;
      zoneKey = key;
      if (sim) sim.setZones(zones); else env.zones = zones;
      mask = buildMask(zones);
      paintShade();
    },
    step(dt) {
      if (sim) sim.step(dt); else if (dt > 0) env.time += dt;
    },
    render() {
      if (mctx && scene?.under) {
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.globalAlpha = 1; mctx.globalCompositeOperation = 'source-over';
        mctx.clearRect(0, 0, cv.mid!.width, cv.mid!.height);
        mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        scene.under(mctx, env, state);
        mctx.globalAlpha = 1; mctx.globalCompositeOperation = 'source-over';
      }
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, cv.fx.width, cv.fx.height);
      if (sim && effect) effect.draw(ctx, sim.particles, env, sprites, dpr);
      if (mask) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    setQuality(q) { sim?.setQuality(q); },
  };
}

/** 글자 금지 영역 읽기 — root 안의 selector 요소 사각형(캔버스 기준 CSS px). 보드 전체를 감싸는 큰 요소는 뺀다. */
export function readZones(root: Element, canvas: HTMLCanvasElement, selector: string): Zone[] {
  const cr = canvas.getBoundingClientRect();
  const pad = 8 * ambienceUnit(cr.width, cr.height);
  const zones: Zone[] = [];
  root.querySelectorAll(selector).forEach((el) => {
    if (el.contains(canvas)) return;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || r.width * r.height > cr.width * cr.height * 0.6) return;
    zones.push({ x0: r.left - cr.left - pad, y0: r.top - cr.top - pad, x1: r.right - cr.left + pad, y1: r.bottom - cr.top + pad });
  });
  return zones;
}
