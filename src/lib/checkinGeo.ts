// src/lib/checkinGeo.ts — 출석 위치 확인(CHECKIN-GEO 2단계 클라이언트).
//
// 서버 check_in(p_venue_id, p_lat, p_lng, p_accuracy)(20260923b)가 거리 판정을 한다 — 반경 300m + 오차 최대 200m 보정,
// 오차 1km 초과 거부, 매장 좌표 없으면 거부. 여기서는 **폰 위치를 얻는 것**만 한다(판정을 두 벌로 두지 않는다).
// 원좌표는 어디에도 저장하지 않는다(서버도 판정에만 쓴다).
//
// 호출부: src/api/checkins.ts checkIn() 한 곳(손님 출석 3경로가 전부 여기로 모인다) · 업주 '출석 위치' 설정 칸.
import { useEffect, useState } from 'react';
import { getAppSetting } from '../api/settings';

// ── 운영 스위치(리드 결정 2026-09-23) ─────────────────────────────────────────
// 손님 출석이 위치를 보낼지. app_settings(읽기 공개) 의 이 키가 **'on' 일 때만** 켜짐 — 행 없음·null·'off'·오타는 꺼짐.
// 왜 스위치인가: 매장 좌표가 0/4 인 상태에서도 업주 '출석 위치' 칸을 먼저 배포해 좌표를 채우게 하려고.
//   좌표를 보내는 순간 서버(20260923b)는 좌표 없는 매장의 출석을 거부하므로, 좌표가 찰 때까지 꺼 둔다.
// 켜기(운영자): select public.set_app_setting('checkin_geo_enabled', 'on');
export const CHECKIN_GEO_FLAG_KEY = 'checkin_geo_enabled';
export const parseCheckinGeoEnabled = (v: string | null | undefined): boolean => v === 'on';

let flagCache: Promise<boolean> | null = null;
/** 스위치 값(세션 캐시 — 성공한 조회만 캐시, 실패는 다음 호출에서 다시 묻는다).
 *  🔴 조회 실패 = **꺼짐**(fail-open). 서버 check_in 은 3단계 전까지 좌표 없는 호출을 통과시키므로,
 *  꺼짐으로 읽으면 결과가 이 번들 이전 운영과 똑같다. 켜짐으로 읽으면 네트워크가 한 번 흔들린 손님이
 *  좌표 없는 매장에서 출석을 거부당한다 — 막지 않는 쪽이 기존 동작이다. */
export function isCheckinGeoEnabled(): Promise<boolean> {
  if (flagCache) return flagCache;
  const p: Promise<boolean> = getAppSetting(CHECKIN_GEO_FLAG_KEY)
    .then(parseCheckinGeoEnabled, () => { if (flagCache === p) flagCache = null; return false; });
  flagCache = p;
  return p;
}
/** 테스트 전용 — 세션 캐시 비우기. */
export function resetCheckinGeoFlagCache(): void { flagCache = null; }

/** 화면용. 첫 값은 false(꺼짐) — 켜짐일 때만 보여야 하는 안내가 거짓으로 먼저 뜨지 않게. */
export function useCheckinGeoEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => { const v = await isCheckinGeoEnabled(); if (alive) setOn(v); })();
    return () => { alive = false; };
  }, []);
  return on;
}

export type CheckinGeoErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export const CHECKIN_GEO_MESSAGE: Record<CheckinGeoErrorCode, string> = {
  denied: '위치 권한을 허용해야 출석할 수 있어요. 브라우저 설정에서 이 사이트의 위치 권한을 켜 주세요',
  unavailable: '현재 위치를 확인할 수 없어요. 휴대폰 위치(GPS)를 켜고 매장 안에서 다시 시도해 주세요',
  timeout: '위치 확인이 늦어지고 있어요. 매장 안에서 다시 시도해 주세요',
  unsupported: '이 브라우저에서는 위치를 확인할 수 없어요. 다른 브라우저로 열어 주세요',
};

/** 위치를 못 얻은 이유. home-team 재시도 시트가 `instanceof CheckinGeoError` + `.code` 로 분기한다. */
export class CheckinGeoError extends Error {
  readonly code: CheckinGeoErrorCode;
  constructor(code: CheckinGeoErrorCode) {
    super(CHECKIN_GEO_MESSAGE[code]);
    this.name = 'CheckinGeoError';
    this.code = code;
  }
}

export interface CheckinPosition { lat: number; lng: number; accuracy: number }

/** GeolocationPositionError.code(1 권한 거부 · 2 위치 불가 · 3 시간 초과) → 우리 코드. 모르는 값은 'unavailable'. */
export function geoErrorCodeOf(code: number | undefined): CheckinGeoErrorCode {
  return code === 1 ? 'denied' : code === 3 ? 'timeout' : 'unavailable';
}

/** 업주 등록 시 경고 기준 — 이보다 오차가 크면 등록 전에 한 번 묻는다. */
export const OWNER_ACCURACY_WARN_M = 100;
export const isLowAccuracy = (accuracy: number, limit = OWNER_ACCURACY_WARN_M) => !(accuracy <= limit);

/** 지금 위치 1회. 캐시 위치를 쓰지 않는다(maximumAge 0) — 집에서 받은 위치로 매장 출석이 되면 안 된다. */
export function getCheckinPosition(): Promise<CheckinPosition> {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo || typeof geo.getCurrentPosition !== 'function') return Promise.reject(new CheckinGeoError('unsupported'));
  return new Promise((resolve, reject) => {
    geo.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) { reject(new CheckinGeoError('unavailable')); return; }
        resolve({ lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : 0 });
      },
      (e) => reject(new CheckinGeoError(geoErrorCodeOf(e?.code))),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}
