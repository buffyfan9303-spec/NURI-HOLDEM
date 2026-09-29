// 클락 모션 배경(엠비언스) — 순수 부분 계약. 캔버스·영상은 스크래치 하네스에서 실측한다(ambience-report.md).
import { describe, expect, it } from 'vitest';
import {
  AMBIENCE_MAX_PARTICLES, type Zone,
  ambienceCount, createAmbienceSim, fadeAt, insideZone, mulberry32, READ_ZONE, zoneFade,
} from './ambienceEngine';
import { AMBIENCE_EFFECTS, type AmbienceMotionId, fadeP, spotOutside } from './ambienceEffects';
import { AMBIENCE_THEMES, ambienceVideoSrc } from './ambienceThemes';
import { CLOCK_TEXTURE_DEFAULT_TINT, CLOCK_TEXTURES, clockTextureLayers, safeTint, withClockTexture } from './clockTexture';
import { CLOCK_ACCENT_SWATCHES, CLOCK_THEME_PRESETS, CLOCK_TIMER_INK } from '../clockTheme';

const W = 1920, H = 1080;
/** 1920×1080 보드의 글자 묶음(시안 레이아웃 실측 근사) — 머리말 제목·시각, 시상 열, LEVEL·타이머·블라인드, 지표 열, 하단 지표. */
const BOARD: Zone[] = [
  { x0: 56, y0: 18, x1: 800, y1: 104 }, { x0: 1590, y0: 18, x1: 1864, y1: 104 },
  { x0: 56, y0: 236, x1: 492, y1: 812 }, { x0: 812, y0: 256, x1: 1108, y1: 334 },
  { x0: 660, y0: 360, x1: 1260, y1: 620 }, { x0: 620, y0: 640, x1: 1300, y1: 800 },
  { x0: 1428, y0: 236, x1: 1864, y1: 812 }, { x0: 56, y0: 950, x1: 1864, y1: 1062 },
];
const IDS = Object.keys(AMBIENCE_EFFECTS) as AmbienceMotionId[];

const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe('엔진 — 예산·가독 보호', () => {
  it('시드 난수는 결정적이다', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('입자 수: 16:9·9:16 은 설계값 그대로, 품질은 반감, 어떤 경우에도 상한 이하', () => {
    expect(ambienceCount({ density: 60 }, 1920, 1080)).toBe(60);
    expect(ambienceCount({ density: 60 }, 1080, 1920)).toBe(60);
    expect(ambienceCount({ density: 60 }, 3840, 2160)).toBe(60); // 4K 는 크기(u)만 커지고 수는 같다
    expect(ambienceCount({ density: 60 }, 1920, 1080, 0.5)).toBe(30);
    expect(ambienceCount({ density: 10_000 }, 5000, 1000)).toBe(AMBIENCE_MAX_PARTICLES);
    expect(ambienceCount({ density: 60 }, 0, 1080)).toBe(0);
    for (const id of IDS) expect(ambienceCount(AMBIENCE_EFFECTS[id], 1920, 1080)).toBeLessThanOrEqual(AMBIENCE_MAX_PARTICLES);
  });

  it('중앙 타원: 가운데는 floor, 모서리는 1, 바깥으로 갈수록 줄지 않는다', () => {
    expect(fadeAt(READ_ZONE.cx, READ_ZONE.cy)).toBe(READ_ZONE.floor);
    expect(fadeAt(0, 0)).toBe(1);
    let prev = 0;
    for (let x = 0.5; x <= 1; x += 0.02) { const f = fadeAt(x, READ_ZONE.cy); expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
  });

  it('글자 영역: 안은 0, 여백 안은 0~1, 멀면 1', () => {
    const z = [{ x0: 100, y0: 100, x1: 200, y1: 200 }];
    expect(zoneFade(150, 150, z, 36)).toBe(0);
    expect(zoneFade(100, 100, z, 36)).toBe(0);
    const mid = zoneFade(218, 150, z, 36);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
    expect(zoneFade(400, 400, z, 36)).toBe(1);
    expect(zoneFade(150, 150, [], 36)).toBe(1);
  });
});

describe('효과 10종 — 20초 시뮬레이션', () => {
  for (const id of IDS) {
    it(`${id}: 값이 유한하고, 불투명도는 0~maxAlpha, 글자 영역 안의 입자는 불투명도 0`, () => {
      const fx = AMBIENCE_EFFECTS[id];
      const sim = createAmbienceSim(fx, mulberry32(7));
      sim.resize(W, H);
      sim.setZones(BOARD);
      const n = sim.particles.length;
      expect(n).toBeGreaterThan(0);
      // 입자마다 expect 를 부르면 15만 번이라 전체 스위트 부하에서 시간 초과가 난다 — 위반을 세고 끝에 한 번 단언한다.
      let inZoneVisible = 0, seenInZone = 0, nonFinite = 0, badAlpha = 0, countDrift = 0;
      for (let f = 0; f < 600; f++) {
        sim.step(1 / 30);
        if (sim.particles.length !== n) countDrift++;
        for (const p of sim.particles) {
          if (!(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.s))) nonFinite++;
          const a = fx.alpha(p, sim.env);
          if (!(a >= 0 && a <= fx.maxAlpha + 1e-9)) badAlpha++;
          if (insideZone(p.x, p.y, BOARD)) { seenInZone++; if (a * fadeP(p, sim.env) > 0) inZoneVisible++; }
        }
      }
      expect({ countDrift, nonFinite, badAlpha, inZoneVisible }).toEqual({ countDrift: 0, nonFinite: 0, badAlpha: 0, inZoneVisible: 0 });
      // 거짓 통과 방지: 떠다니는 효과는 실제로 글자 영역을 지나간다(0 이면 위 단언이 아무것도 안 본 것)
      if (!['rain-glass', 'glints', 'mist'].includes(id)) expect(seenInZone).toBeGreaterThan(0);
    });
  }

  it('물방울 자국은 글자 영역 밖에서 생긴다', () => {
    const rng = mulberry32(3);
    const env = { w: W, h: H, u: 1, time: 0, zones: BOARD };
    for (let i = 0; i < 200; i++) {
      const [x, y] = spotOutside(rng, env);
      expect(zoneFade(x, y, BOARD, 36)).toBeGreaterThan(0.99);
    }
  });

  it('리사이즈: 입자 수가 같으면 위치를 비율로 옮기고, 품질 강등은 입자를 반으로 줄인다', () => {
    const sim = createAmbienceSim(AMBIENCE_EFFECTS.sakura, mulberry32(1));
    sim.resize(1920, 1080);
    const x0 = sim.particles[0].x, n = sim.particles.length;
    sim.resize(1280, 720);
    expect(sim.particles.length).toBe(n);
    expect(sim.particles[0].x).toBeCloseTo(x0 * (1280 / 1920), 6);
    sim.setQuality(0.5);
    expect(sim.particles.length).toBe(Math.round(n / 2));
    sim.setQuality(0.01);
    expect(sim.quality).toBe(0.25);
  });
});

describe('테마 14종', () => {
  it('구성: 계절 4 · 날씨 5 · 동물 5, id 모양·중복·기존 프리셋 충돌 없음', () => {
    const count = (g: string) => AMBIENCE_THEMES.filter((t) => t.group === g).length;
    expect([count('season'), count('weather'), count('animal')]).toEqual([4, 5, 5]);
    const ids = AMBIENCE_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
      expect(CLOCK_THEME_PRESETS.some((p) => p.id === id)).toBe(false);
    }
  });

  for (const t of AMBIENCE_THEMES) {
    it(`${t.id}: 강조색 대비 ≥4.5(가장 밝은 stop 위), 스와치와 겹치지 않음, 타이머 잠금, 색은 마지막 레이어`, () => {
      expect(contrast(t.accent, t.stops[0])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(CLOCK_TIMER_INK, t.stops[0])).toBeGreaterThanOrEqual(7);
      expect(CLOCK_ACCENT_SWATCHES.some((s) => s.value.toLowerCase() === t.accent.toLowerCase())).toBe(false);
      expect(t.timer).toBe(CLOCK_TIMER_INK);
      expect(t.bg.endsWith(`, ${t.stops[2]}`)).toBe(true);
      expect(t.motion === null || t.motion in AMBIENCE_EFFECTS).toBe(true);
      expect(t.video).toMatch(/^[a-z0-9-]+$/);
      expect(ambienceVideoSrc(t).mp4).toBe(`/clock-ambience/${t.video}.mp4`);
    });
  }
});

describe('배경 결 B3·B4·B5', () => {
  it('기존 프리셋 전부에 붙는다 — 원래 bg 는 그대로 맨 뒤에 남는다(색은 마지막 레이어)', () => {
    for (const p of CLOCK_THEME_PRESETS) for (const x of CLOCK_TEXTURES) {
      const out = withClockTexture(p.bg, x.id, p.accent);
      expect(out.endsWith(p.bg)).toBe(true);
      expect(out.length).toBeGreaterThan(p.bg.length);
    }
  });

  it('모르는 결·빈 값이면 bg 그대로', () => {
    expect(withClockTexture('#000', null)).toBe('#000');
    expect(withClockTexture('#000', 'nope' as never)).toBe('#000');
  });

  it('틴트는 #RRGGBB 만 — CSS 탈출 문자열은 기본 틴트로 바뀐다', () => {
    expect(safeTint('#a1b2c3')).toBe('#A1B2C3');
    for (const bad of ['red', '#fff', '#000000);background:url(x', '"#000000"', null, 12]) expect(safeTint(bad)).toBe(CLOCK_TEXTURE_DEFAULT_TINT);
    const suit = clockTextureLayers('suit', '#000000")');
    expect(suit.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(suit.slice(5, suit.indexOf('") '))).not.toMatch(/["\s]/); // url("…") 안에 따옴표·공백이 없다(괄호는 따옴표 안이라 문자열을 못 끝낸다)
  });
});
