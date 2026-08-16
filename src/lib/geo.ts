// src/lib/geo.ts — 거리순 정렬용 하버사인 거리(km).
// 지도 SDK 없이 순수 계산 — venues.lat/lng(카카오 지오코딩 라이트백)와
// navigator.geolocation 한 번이면 '가까운 순'이 성립한다.

const R = 6371; // 지구 반지름(km)
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 사람이 읽는 거리 표기 — 1km 미만은 m, 이상은 소수 1자리 km */
export function fmtKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}
