// src/lib/locationConsent.ts — 출석 위치 확인의 '위치정보 이용 동의'(LOCATION-READY 2026-09-26).
//
// 위치정보법 제15조① — 동의 없이 개인위치정보를 수집·이용하지 않는다. 제19조① — 약관에 적은 뒤 동의를 받는다.
// 그래서 출석이 좌표를 보내기 **전에** 여기서 동의를 확인한다(checkins.ts checkIn 한 곳).
//   · 동의함(현재 약관 판)     → true — 좌표를 보낸다
//   · 동의 안 함(기록됨)       → false — 묻지 않고 좌표 없이 출석(거절해도 서비스 이용 가능)
//   · 기록 없음·옛 약관 판     → 시트로 묻는다. 닫으면 이번 출석만 좌표 없이(기록하지 않음 — 다음에 다시 묻는다)
//   · 조회·저장 실패           → false — 좌표를 보내지 않는다(서버도 동의 행이 없으면 좌표를 버린다 — 20260926b)
// 서버가 최종 게이트다: 스위치 'on' + 동의 행이 있어야만 좌표를 쓴다. 이 파일은 묻고 기록하는 화면 쪽일 뿐이다.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { getMyLocationConsent, setMyLocationConsent, type LocationConsentState } from '../api/locationPrivacy';

/** 위치기반서비스 이용약관 판(版). 약관의 수집·이용 조항을 바꾸면 올린다 — 옛 판 동의자는 다음 출석 때 다시 묻는다. */
export const LOCATION_TERMS_VERSION = 2;
/** 제2판 시행일(표기용). ⚠ 배포일과 다르면 배포 담당이 맞춘다. */
export const LOCATION_TERMS_EFFECTIVE = '2026-09-26';

/** 지금 동의가 유효한가 — 현재 판 이상의 동의만 유효. */
export const isConsentCurrent = (s: LocationConsentState) =>
  s.state === 'granted' && (s.termsVersion ?? 0) >= LOCATION_TERMS_VERSION;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR') : '');
/** 내 정보 화면의 상태 한 줄. */
export function consentSummary(s: LocationConsentState): string {
  if (isConsentCurrent(s)) return `동의함 · 제${s.termsVersion}판${s.grantedAt ? ` · ${fmt(s.grantedAt)}` : ''}`;
  if (s.state === 'granted') return `옛 약관(제${s.termsVersion ?? '?'}판) 동의 — 다음 출석 때 다시 여쭤요`;
  if (s.state === 'denied') return `동의하지 않음${s.revokedAt ? ` · 철회 ${fmt(s.revokedAt)}` : ''}`;
  return '아직 선택하지 않음 — 위치 확인 출석을 처음 쓸 때 여쭤요';
}

/** 동의 변경 알림 — 내 정보 화면이 다시 읽는다. */
export const LOCATION_CONSENT_EVENT = 'nuri:location-consent';

export async function saveLocationConsent(granted: boolean): Promise<LocationConsentState> {
  const s = await setMyLocationConsent(granted, LOCATION_TERMS_VERSION);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCATION_CONSENT_EVENT));
  return s;
}

/** 이 시트가 마운트되는 별도 루트의 표식(아래 askLocationConsent 가 붙인다). */
export const CONSENT_HOST_ATTR = 'data-location-consent-host';
/** 다른 게이트 시트(로그인 AuthModal · 본인인증 VerifyGateSheet — Modal layer='gate' 의 z-[65] 층)가 열려 있거나 닫히는 중인가.
 *  🔴 2026-09-26 design-reviewer 실측: `?checkin=` 딥링크에서 로그인 시트와 이 시트가 같은 z-65 로 겹쳐, 동의 시트가 뜨는 순간
 *    로그인 카드가 0.3~1초 비쳤다. 위치 동의는 **사용자별**이라 로그인이 끝나(시트가 퇴장까지 마치고 DOM 에서 빠진) 뒤에만 연다.
 *  퇴장 모션 중에도 요소는 DOM 에 남으므로(useDelayedUnmount 220ms) '빠질 때까지' 기다리면 퇴장 프레임과도 겹치지 않는다. */
export function otherGateOpen(doc: Document = document): boolean {
  return [...doc.querySelectorAll('[data-scroll-lock].z-\\[65\\]')].some((el) => !el.closest(`[${CONSENT_HOST_ATTR}]`));
}

/** 동의 시트를 띄우고 답을 돌려준다 — true 동의 · false 동의 안 함 · null 닫음.
 *  출석 경로 3곳(App runCheckin · MyVoucherSheet · VenuePage)이 모두 checkIn() 으로 모이므로, 시트는 호출부와 독립된
 *  별도 루트에 스스로 마운트한다(Modal 은 컨텍스트 의존이 없다). 시트 모듈은 지연 로드 — 첫 화면 번들에 안 실린다.
 *  두 번 불려도 한 장만 뜨게 진행 중 Promise 를 공유한다. */
let pending: Promise<boolean | null> | null = null;
export function askLocationConsent(): Promise<boolean | null> {
  if (pending) return pending;
  pending = import('../components/features/LocationConsentSheet').then(({ default: View }) =>
    new Promise<boolean | null>((resolve) => {
      const host = document.createElement('div');
      host.setAttribute(CONSENT_HOST_ATTR, ''); // 시트가 '다른 게이트'에서 자기 자신을 빼는 표식(otherGateOpen)
      document.body.appendChild(host);
      const root = createRoot(host);
      root.render(createElement(View, {
        onChoose: (v: boolean | null) => {
          pending = null;
          resolve(v);
          window.setTimeout(() => { root.unmount(); host.remove(); }, 600); // 닫힘 모션 뒤 걷는다
        },
      }));
    }));
  pending.catch(() => { pending = null; });
  return pending;
}

export async function ensureLocationConsent(ask: () => Promise<boolean | null> = askLocationConsent): Promise<boolean> {
  let s: LocationConsentState;
  try { s = await getMyLocationConsent(); } catch { return false; }
  if (isConsentCurrent(s)) return true;
  if (s.state === 'denied') return false;
  let choice: boolean | null;
  try { choice = await ask(); } catch { return false; }
  if (choice === null) return false;
  try { return isConsentCurrent(await saveLocationConsent(choice)); } catch { return false; }
}
