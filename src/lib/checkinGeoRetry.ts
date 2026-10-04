// src/lib/checkinGeoRetry.ts — 출석 위치 확인 실패의 **화면 분기** (CHECKIN-GEO 재시도 시트, 2026-09-24)
//
// 소비처: App.tsx runCheckin(QR 딥링크 · 로그인 왕복 뒤 보류 의도 재개).
// `CheckinGeoError` 는 위치 확인 출석 매장에서 위치를 못 얻었고 **서버도 좌표 없이 받지 않았을 때만** checkIn() 이 던진다
//   (시행일 전·스위치 꺼짐이면 서버가 좌표 없이 받아 성공한다 — src/api/checkins.ts).
//   · 위치를 못 얻음(CheckinGeoError) → 토스트가 아니라 **재시도 시트**. 딥링크·로그인 왕복 직후엔 사용자 제스처가 없어
//     권한 창이 안 뜨는 브라우저가 있다 — 시트의 버튼을 누르는 순간이 그 제스처다.
//   · 서버 거부(평범한 Error — 거리 초과·매장 좌표 없음 등) → 종전 그대로 토스트.
//   · 20261004d — 위치 확인을 켠 매장(시행일 뒤)에서 서버가 동의·위치 없이 받지 않은 출석(CheckinGeoRequiredError)도 같은 시트.
//     code 'consent' = 동의가 없어 거부. 시트 버튼은 checkIn(venueId, { geoRequired: true }) — 동의를 다시 묻는다.
//   이 시트가 뜨는 것은 이제 **위치 확인 출석 매장뿐**이라(그 밖의 매장은 위치를 묻지 않는다) 대체 경로(alt)를 늘 함께 적는다.
import { CHECKIN_GEO_MESSAGE, CheckinGeoError, CheckinGeoRequiredError, type CheckinGeoErrorCode } from './checkinGeo';
import { CHECKIN_ALT_PATH } from './locationTerms';
import { msgOf } from './dbError';

export type CheckinRetryCode = CheckinGeoErrorCode | 'consent';
export type CheckinFailureAction =
  | { kind: 'sheet'; code: CheckinRetryCode }
  | { kind: 'toast'; message: string };

export function checkinFailureAction(e: unknown): CheckinFailureAction {
  if (e instanceof CheckinGeoError) return { kind: 'sheet', code: e.code };
  // 서버가 '좌표 없음'으로 거부했는데 클라가 위치를 시도하지 않은 경우(동의 창을 닫음 등)도 시트 — 버튼이 다시 묻고 위치를 받는다.
  if (e instanceof CheckinGeoRequiredError) return { kind: 'sheet', code: e.reason === 'consent' ? 'consent' : 'unavailable' };
  return { kind: 'toast', message: msgOf(e, '출석 실패') };
}

/** critical L3(2026-10-04) — 매장 페이지 출석 버튼(VenuePage)·이용권 시트 카메라(MyVoucherSheet)도 같은 재시도 시트(대체 경로 안내)를 쓴다.
 *  시트는 App 한 곳에 있다 — 이 이벤트로 연다(detail: { venueId, code }). App.tsx 가 받는다. */
export const CHECKIN_RETRY_EVENT = 'nuri:checkin-geo-retry';
/** 위치 확인 출석 거부·위치 실패면 App 의 재시도 시트를 열고 true. 아니면 false(호출부가 종전 토스트). */
export function requestCheckinRetrySheet(venueId: string, e: unknown): boolean {
  const act = checkinFailureAction(e);
  if (act.kind !== 'sheet' || typeof window === 'undefined') return false;
  window.dispatchEvent(new CustomEvent(CHECKIN_RETRY_EVENT, { detail: { venueId, code: act.code } }));
  return true;
}

export const isKakaoInApp = (ua: string) => /KAKAOTALK/i.test(ua);

const CONSENT_REASON = '이 매장은 위치 확인 출석 매장입니다. 위치정보 이용에 동의해야 이 매장에서 출석할 수 있습니다';

/** 시트 본문 — 사유(store-team 문구 그대로) + 다음 행동 한 줄 + 대체 경로 + 버튼 문구. */
export function checkinGeoRetryCopy(code: CheckinRetryCode, ua: string): { reason: string; hint: string | null; alt: string; action: string } {
  const alt = `동의하기 어렵거나 위치를 켤 수 없으면 ${CHECKIN_ALT_PATH}`;
  if (code === 'consent') return { reason: CONSENT_REASON, hint: null, alt, action: '동의하고 출석' };
  const reason = CHECKIN_GEO_MESSAGE[code];
  const action = '위치 확인 후 출석';
  if (isKakaoInApp(ua)) {
    return { reason, hint: '카카오톡 안에서는 위치 확인이 막힐 수 있습니다. 오른쪽 아래(또는 위) 메뉴에서 ‘다른 브라우저로 열기’를 누른 뒤 다시 출석해 주세요', alt, action };
  }
  if (code === 'denied') {
    return { reason, hint: '주소창 왼쪽 자물쇠(또는 ⓘ) → 권한 → 위치를 ‘허용’으로 바꾼 뒤 아래 버튼을 눌러 주세요', alt, action };
  }
  return { reason, hint: null, alt, action };
}
