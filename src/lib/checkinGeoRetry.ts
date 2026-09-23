// src/lib/checkinGeoRetry.ts — 출석 위치 확인 실패의 **화면 분기** (CHECKIN-GEO 재시도 시트, 2026-09-24)
//
// 소비처: App.tsx runCheckin(QR 딥링크 · 로그인 왕복 뒤 보류 의도 재개).
// `CheckinGeoError` 는 운영 스위치(checkin_geo_enabled='on')가 켜졌을 때만 checkIn() 이 던진다(src/lib/checkinGeo.ts).
//   · 위치를 못 얻음(CheckinGeoError) → 토스트가 아니라 **재시도 시트**. 딥링크·로그인 왕복 직후엔 사용자 제스처가 없어
//     권한 창이 안 뜨는 브라우저가 있다 — 시트의 버튼을 누르는 순간이 그 제스처다.
//   · 서버 거부(평범한 Error — 거리 초과·매장 좌표 없음 등) → 종전 그대로 토스트.
import { CHECKIN_GEO_MESSAGE, CheckinGeoError, type CheckinGeoErrorCode } from './checkinGeo';

export type CheckinFailureAction =
  | { kind: 'sheet'; code: CheckinGeoErrorCode }
  | { kind: 'toast'; message: string };

export function checkinFailureAction(e: unknown): CheckinFailureAction {
  if (e instanceof CheckinGeoError) return { kind: 'sheet', code: e.code };
  return { kind: 'toast', message: e instanceof Error ? e.message : '출석 실패' };
}

export const isKakaoInApp = (ua: string) => /KAKAOTALK/i.test(ua);

/** 시트 본문 — 사유(store-team 문구 그대로) + 다음 행동 한 줄. */
export function checkinGeoRetryCopy(code: CheckinGeoErrorCode, ua: string): { reason: string; hint: string | null } {
  const reason = CHECKIN_GEO_MESSAGE[code];
  if (isKakaoInApp(ua)) {
    return { reason, hint: '카카오톡 안에서는 위치 확인이 막힐 수 있어요. 오른쪽 아래(또는 위) 메뉴에서 ‘다른 브라우저로 열기’를 누른 뒤 다시 출석해 주세요' };
  }
  if (code === 'denied') {
    return { reason, hint: '주소창 왼쪽 자물쇠(또는 ⓘ) → 권한 → 위치를 ‘허용’으로 바꾼 뒤 아래 버튼을 눌러 주세요' };
  }
  return { reason, hint: null };
}
