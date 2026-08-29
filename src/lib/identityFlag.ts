// src/lib/identityFlag.ts
// 본인인증 + 매장이용권 **통합 킬스위치**(오너 지시 2026-08-29).
//
// 오너 원문: "본인인증은 당분간은 비활성화 예정 이와 동시에 일단 매장이용권 관련 비활성화.
//            본인인증이 활성화 되면 그 때 매장이용권 활성화 예정"
// → 두 기능의 수명이 같으므로 **스위치도 하나**다. 두 개로 쪼개면 '인증은 껐는데 이용권은 켜진'
//   조합이 만들어지고, 그 조합은 서버가 인증을 강제하는 이용권 경로에서 곧바로 데드락이 된다
//   (인증 화면이 없는데 서버는 인증을 요구 → 사용자는 영원히 못 넘어간다).
//
// 왜 app_settings 인가: 앱에 이미 있는 킬스위치 관례다(App.tsx 의 tabbar_autohide_v2).
//   재배포·재빌드 없이 운영자가 값 하나만 바꾸면 전환된다. 삭제가 아니라 **비활성화**라는
//   오너 지시(되돌릴 수 있어야 한다)와 정확히 맞는 층이다.
//
// 값 규약: 'on' 이면 활성화, **그 외 전부(행 없음·null·'off'·오타) 비활성화**.
//   기본값이 비활성화이므로 '행이 없는 지금 상태 = 꺼짐' 이고, 켜는 것은 명시적 행위여야 한다.
//   (tabbar_autohide_v2 는 반대로 'off' 탈출구를 둔 기본-켜짐이다 — 여기는 기본-꺼짐이라 반전.)
//
// 되돌리는 법(운영자):
//   ① 앱 → 관리자 탭 → (운영자 계정) app_settings 저장 경로: setAppSetting('identity_voucher_enabled', 'on')
//   ② 또는 SQL 한 줄: select public.set_app_setting('identity_voucher_enabled', 'on');
//   ③ 끄기: 같은 자리에 'off' (또는 빈 문자열 → 행의 value 가 null 이 되어 꺼짐)
//   전환은 각 클라이언트가 다음에 이 값을 읽을 때(앱 재진입 / 아래 refresh) 반영된다.
import { useSyncExternalStore } from 'react';
import { getAppSetting } from '../api/settings';

export const IDENTITY_FLAG_KEY = 'identity_voucher_enabled';

// 마지막으로 확인한 값의 로컬 미러.
// 왜 필요한가: ensureVerified() 는 **동기** 함수다(호출부가 그 자리에서 return 한다).
//   네트워크 왕복을 기다릴 수 없으므로 '직전에 알던 값'을 즉시 답할 수 있어야 한다.
//   미러가 없으면 재방문자도 매번 기본값(꺼짐)으로 시작해, 기능을 켠 뒤에도 첫 탭이 게이트를 통과한다.
const LS_KEY = 'nuri:identity-gate';

function readMirror(): boolean {
  try { return localStorage.getItem(LS_KEY) === 'on'; } catch { return false; } // 사파리 프라이빗 등 — 기본값
}

let enabled = readMirror();
let started = false;
const subs = new Set<() => void>();

function commit(next: boolean): void {
  try { localStorage.setItem(LS_KEY, next ? 'on' : 'off'); } catch { /* noop */ }
  if (next === enabled) return;
  enabled = next;
  subs.forEach((f) => { try { f(); } catch { /* 구독자 하나가 나머지를 막지 않게 */ } });
}

/** 서버 값을 다시 읽어 미러를 갱신한다. 실패하면 **직전 값을 유지**한다(네트워크 순간 장애로 기능이 깜빡이지 않게). */
export function refreshIdentityFlag(): Promise<boolean> {
  return getAppSetting(IDENTITY_FLAG_KEY)
    .then((v) => { commit(v === 'on'); return enabled; })
    .catch(() => enabled);
}

/** 첫 사용 시 한 번만 서버 조회를 띄운다 — 모듈 임포트만으로 부팅 네트워크를 늘리지 않는다(부팅 예산). */
function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  refreshIdentityFlag().catch(() => {});
}

/**
 * 동기 판정 — 본인인증·매장이용권이 켜져 있는가.
 * 첫 호출이 서버 조회를 촉발하지만 **기다리지 않는다**(직전 값 즉답).
 * 아직 아무것도 모르는 첫 방문자는 기본값 false = 비활성화로 답한다 —
 * 지금 원하는 상태와 같은 방향이라 경합이 사용자에게 보이지 않는다.
 */
export function identityEnabled(): boolean {
  ensureStarted();
  return enabled;
}

function subscribe(cb: () => void): () => void {
  ensureStarted();
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/** React 구독형 — 서버 값이 늦게 도착해도 그 순간 화면이 따라온다. */
export function useIdentityEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => enabled);
}
