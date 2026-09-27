// src/lib/avatarCrop.ts — 프로필 사진 크롭 편집기(AvatarCropper)의 좌표 계산 정본(2026-09-27 오너 요청 3).
//
// 화면의 정사각 틀(box × box, 원형으로 보인다) 안에 사진을 `zoom` 배로 깔고 `offset` 만큼 옮긴다.
//   · 표시 배율 eff = cover × zoom — cover 는 사진의 짧은 변이 틀을 꽉 채우는 배율(zoom 1 = 빈 곳 없음)
//   · 저장은 틀 안에 보이는 정사각 영역 그대로(cropSource) — 원 안에 보인 것이 대시보드·헤더·글 작성자 아바타에 그대로 간다
// 이 파일은 순수 함수만 둔다 — 컴포넌트는 이벤트를 받아 여기로 넘기고, 단위 테스트(avatarCrop.test.ts)가 좌표를 잠근다.

export interface CropGeom { nw: number; nh: number; box: number }
export interface CropState { zoom: number; x: number; y: number }

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

/** 사진의 짧은 변이 틀을 꽉 채우는 배율. */
export const coverScale = (g: CropGeom): number => g.box / Math.min(g.nw, g.nh);

/** 틀 안에 빈 곳이 생기지 않게 위치를 가둔다(사진의 왼쪽 위가 틀 왼쪽 위보다 안쪽으로 못 들어오고, 오른쪽 아래도 마찬가지). */
export function clampState(g: CropGeom, s: CropState): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom));
  const eff = coverScale(g) * zoom;
  const w = g.nw * eff, h = g.nh * eff;
  return { zoom, x: Math.min(0, Math.max(g.box - w, s.x)), y: Math.min(0, Math.max(g.box - h, s.y)) };
}

/** 처음 연 모습 — zoom 1, 가운데. */
export const initialState = (g: CropGeom): CropState => {
  const eff = coverScale(g);
  return { zoom: 1, x: (g.box - g.nw * eff) / 2, y: (g.box - g.nh * eff) / 2 };
};

/** 틀 좌표(fx, fy)를 중심으로 확대·축소 — 그 점 아래의 사진 픽셀이 제자리에 남는다(가둠 전). */
export function zoomAt(g: CropGeom, s: CropState, zoom: number, fx: number, fy: number): CropState {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const ratio = next / s.zoom;
  return clampState(g, { zoom: next, x: fx - (fx - s.x) * ratio, y: fy - (fy - s.y) * ratio });
}

/** 두 손가락 — 시작할 때 두 손가락 가운데(m0) 아래 있던 사진 점이 지금 가운데(m) 아래로 온다(벌림 = 확대, 함께 끌기 = 이동).
 *  start 는 두 번째 손가락이 닿은 순간의 상태, d0·d 는 그때와 지금의 손가락 사이 거리. */
export function pinchStep(g: CropGeom, start: CropState, m0: { x: number; y: number }, d0: number, m: { x: number; y: number }, d: number): CropState {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.zoom * (d / (d0 || 1))));
  const ratio = next / start.zoom;
  return clampState(g, { zoom: next, x: m.x - (m0.x - start.x) * ratio, y: m.y - (m0.y - start.y) * ratio });
}

/** 저장할 원본 영역(원본 픽셀) — 틀 전체(정사각)가 보여 주는 그 부분. drawImage(img, sx, sy, size, size, 0, 0, out, out). */
export function cropSource(g: CropGeom, s: CropState): { sx: number; sy: number; size: number } {
  const eff = coverScale(g) * s.zoom;
  return { sx: -s.x / eff, sy: -s.y / eff, size: g.box / eff };
}
