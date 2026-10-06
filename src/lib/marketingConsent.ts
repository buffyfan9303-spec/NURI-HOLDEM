// src/lib/marketingConsent.ts — 마케팅 정보 수신 동의·철회 '처리 결과' 문구 한 곳(2026-10-06 법령 점검 P1-3).
// 정보통신망법 §50⑦·시행령 §62의2: ① 전송자 명칭 ② 동의·철회 사실과 그 날짜 ③ 처리 결과를 알린다.
// 화면(토스트·설정 줄)은 이 문구를, 알림함은 서버 트리거 _notify_marketing_consent(20261006l)가 같은 세 요소를 남긴다.
import { BIZ_REQUIRED } from '../components/features/BusinessFooter';
import { kstToday } from './legalVersion';

export const AD_SENDER = `${BIZ_REQUIRED.find(([k]) => k === '상호')?.[1] ?? ''}(NURI HOLDEM)`;

export function marketingConsentNotice(on: boolean, now: Date = new Date()): string {
  return `마케팅 정보 수신 ${on ? '동의' : '동의 철회'}가 처리되었습니다 · 전송자 ${AD_SENDER} · 처리일 ${kstToday(now)} · ${
    on ? '광고성 정보(푸시·이메일)를 받습니다' : '광고성 정보(푸시·이메일)를 더 보내지 않습니다'}`;
}
