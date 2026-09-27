// 실행: npx vitest run src/lib/avatarCrop.test.ts
// 프로필 사진 크롭 — '원 안에 보인 것 = 저장되는 것' 과 손가락 조작(핀치·드래그·확대)의 좌표를 잠근다(2026-09-27 오너 요청 3).
import { describe, it, expect } from 'vitest';
import { clampState, coverScale, cropSource, initialState, pinchStep, zoomAt, MAX_ZOOM, type CropGeom, type CropState } from './avatarCrop';

const G: CropGeom = { nw: 1000, nh: 500, box: 256 };   // 가로 사진
const T: CropGeom = { nw: 600, nh: 1200, box: 256 };   // 세로 사진

/** 화면 틀의 한 점(bx, by)이 가리키는 원본 픽셀 — 화면에 그려진 대로(translate(x,y) + eff 배율). */
const shownAt = (g: CropGeom, s: CropState, bx: number, by: number) => {
  const eff = coverScale(g) * s.zoom;
  return { x: (bx - s.x) / eff, y: (by - s.y) / eff };
};
/** 저장 결과(out × out)의 한 점이 가리키는 원본 픽셀 — cropSource 로 drawImage 한 대로. */
const savedAt = (g: CropGeom, s: CropState, ox: number, oy: number, out = 320) => {
  const c = cropSource(g, s);
  return { x: c.sx + (ox * c.size) / out, y: c.sy + (oy * c.size) / out };
};

describe('avatarCrop — 원 안에 보인 것이 그대로 저장된다', () => {
  it('처음 연 모습: 가로 사진은 가운데 정사각(짧은 변 = 틀)', () => {
    const r = (c: { sx: number; sy: number; size: number }) => [c.sx, c.sy, c.size].map((v) => Math.round(v * 1e6) / 1e6 + 0);
    expect(r(cropSource(G, initialState(G)))).toEqual([250, 0, 500]);
    expect(r(cropSource(T, initialState(T)))).toEqual([0, 300, 600]);
  });

  it('확대·이동 뒤에도 틀의 네 모서리·가운데가 저장 이미지의 같은 자리와 같은 원본 픽셀을 가리킨다', () => {
    let s = initialState(G);
    s = zoomAt(G, s, 2.4, 60, 200);                 // 왼쪽 아래를 짚고 확대
    s = clampState(G, { ...s, x: s.x - 90, y: s.y + 30 }); // 드래그
    for (const [bx, by] of [[0, 0], [256, 0], [0, 256], [256, 256], [128, 128], [37, 211]]) {
      const a = shownAt(G, s, bx, by), b = savedAt(G, s, (bx * 320) / 256, (by * 320) / 256);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
    }
  });

  it('어떤 조작 뒤에도 저장 영역이 원본 밖으로 나가지 않는다(빈 곳·검은 띠 없음)', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const g of [G, T, { nw: 257, nh: 4000, box: 256 }, { nw: 80, nh: 60, box: 256 }]) {
      let s = initialState(g);
      for (let i = 0; i < 400; i++) {
        const k = rnd();
        if (k < 0.34) s = zoomAt(g, s, s.zoom * (0.5 + rnd() * 1.5), rnd() * 256, rnd() * 256);
        else if (k < 0.67) s = clampState(g, { ...s, x: s.x + (rnd() - 0.5) * 900, y: s.y + (rnd() - 0.5) * 900 });
        else s = pinchStep(g, s, { x: rnd() * 256, y: rnd() * 256 }, 50 + rnd() * 100, { x: rnd() * 256, y: rnd() * 256 }, 50 + rnd() * 100);
        const c = cropSource(g, s);
        expect(s.zoom).toBeGreaterThanOrEqual(1);
        expect(s.zoom).toBeLessThanOrEqual(MAX_ZOOM);
        expect(c.sx).toBeGreaterThanOrEqual(-1e-6);
        expect(c.sy).toBeGreaterThanOrEqual(-1e-6);
        expect(c.sx + c.size).toBeLessThanOrEqual(g.nw + 1e-6);
        expect(c.sy + c.size).toBeLessThanOrEqual(g.nh + 1e-6);
      }
    }
  });

  it('확대·축소는 짚은 점 아래의 원본 픽셀을 제자리에 둔다', () => {
    const s0 = zoomAt(G, initialState(G), 2, 128, 128);
    const before = shownAt(G, s0, 100, 90);
    const s1 = zoomAt(G, s0, 3, 100, 90);
    const after = shownAt(G, s1, 100, 90);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('두 손가락을 벌리지 않고 함께 끌면 사진이 손가락을 따라 움직인다(핀치 중 이동)', () => {
    const s0 = zoomAt(G, initialState(G), 2, 128, 128);
    const m0 = { x: 120, y: 120 };
    const under = shownAt(G, s0, m0.x, m0.y);
    const s1 = pinchStep(G, s0, m0, 80, { x: 150, y: 140 }, 80);
    expect(s1.zoom).toBeCloseTo(2, 6);
    const now = shownAt(G, s1, 150, 140);
    expect(now.x).toBeCloseTo(under.x, 6);
    expect(now.y).toBeCloseTo(under.y, 6);
  });

  it('벌리면서 끌어도 처음 짚은 사진 점이 두 손가락 가운데를 따라온다', () => {
    const s0 = initialState(T);
    const m0 = { x: 100, y: 110 };
    const under = shownAt(T, s0, m0.x, m0.y);
    const s1 = pinchStep(T, s0, m0, 60, { x: 118, y: 95 }, 120); // 2배 벌림 + 이동
    expect(s1.zoom).toBeCloseTo(2, 6);
    const now = shownAt(T, s1, 118, 95);
    expect(now.x).toBeCloseTo(under.x, 6);
    expect(now.y).toBeCloseTo(under.y, 6);
  });
});
