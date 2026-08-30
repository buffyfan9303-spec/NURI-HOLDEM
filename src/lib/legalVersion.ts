// src/lib/legalVersion.ts — 약관 버전·시행일의 **단일 소스**.
//
// 왜 상수로 뽑았나
//   2026-08-30 이전에는 시행일 문자열('2026년 6월 15일')이 6곳(약관 4문서 + LegalDocsModal + …)에
//   따로 박혀 있었다. 다음 개정에서 한 곳만 고치면 "가입 화면에서 동의한 시행일 ≠ 공개 문서의 시행일"이
//   되고, 그건 허위 고지다. 시행일·버전을 여기 한 곳에서만 정의한다.
//   (문서별 '무엇이 바뀌었나' 이력은 src/lib/legalHistory.ts — 첫 화면 임계 경로에서 빼기 위한 분리다.)
//
// 왜 시행일이 '오늘'이 아니라 30일 뒤인가 (2026-08-30 결정)
//   2026-08-30 배포로 약관 본문이 실질적으로 바뀌었다(이용약관 7→16조, 처리방침 7→14조).
//   그중 제14조(손해배상·책임의 제한)·제15조(위반 제재 및 회사의 손해배상청구)는 **회원에게 불리한
//   변경**이다. 불리한 변경은 사전 고지 기간이 법·자체 약관 양쪽에서 요구된다.
//     · 「약관의 규제에 관한 법률」 §3 — 약관의 명시·설명의무(사전에 알 수 있어야 한다)
//     · 「전자상거래 등에서의 소비자보호에 관한 법률」 §21①1 — 소비자를 속이거나 오인시키는 행위 금지
//     · 본 서비스 이용약관 제16조제2항 — "적용일 7일 전부터, 회원에게 불리한 변경의 경우에는
//       적용일 30일 전부터 서비스 내에 공지합니다"
//     · 개인정보처리방침 제14조제2항 — "정보주체의 권리에 중대한 영향을 미치는 변경은 최소 30일 전 고지"
//   → 공지일 2026-08-30 + 30일 = **시행일 2026-09-29**. 그때까지는 직전판(2026-06-15)이 적용되며,
//     공개 문서와 앱은 '개정 예정' 상태로 새 본문을 미리 보여준다(그것이 곧 사전 고지다).
//
// 버전을 왜 정수로 두나
//   profiles.consented_legal_version 과 비교해 '언제 것에 동의했는지'를 판정한다. 날짜 문자열로
//   비교하면 타임존·표기 흔들림으로 게이트가 오작동한다. 개정할 때마다 +1 하고,
//   legalHistory.ts 에 한 줄, DB current_legal_version() 에 같은 숫자를 남긴다(테스트가 셋을 맞댄다).

/** 현재(개정판) 약관 버전. 개정 시 +1 하고 legalHistory.ts 의 LEGAL_HISTORY 에 항목을 추가한다. */
export const LEGAL_VERSION = 2;

/** 개정판 시행일(KST, ISO) — 이 날부터 재동의 게이트가 '차단'으로 바뀐다. */
export const LEGAL_EFFECTIVE_ISO = '2026-09-29';
/** 화면 표기용 시행일. */
export const LEGAL_EFFECTIVE_DATE = '2026년 9월 29일';

/** 개정 공지일(사전 고지 시작일). */
export const LEGAL_NOTICE_ISO = '2026-08-30';
export const LEGAL_NOTICE_DATE = '2026년 8월 30일';

/** 직전판 시행일 — 시행일 전까지 실제로 적용되는 약관. */
export const LEGAL_PREV_EFFECTIVE_DATE = '2026년 6월 15일';
export const LEGAL_PREV_EFFECTIVE_ISO = '2026-06-15';

/** 기기 시간대와 무관한 KST 기준 오늘(YYYY-MM-DD).
 *  왜 필요한가: 기기가 UTC·PST 로 맞춰져 있으면 시행일이 사람마다 하루 어긋나 게이트가
 *  누구에겐 뜨고 누구에겐 안 뜬다. 서버(Asia/Seoul)와 같은 기준으로 못 박는다. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 재동의 상태 판정.
 *   ok       — 현재 버전에 이미 동의함(또는 그보다 높은 버전).
 *   notice   — 구버전 동의자이고 아직 시행일 전 → **차단하지 않는** 사전 고지(안내).
 *   required — 구버전 동의자이고 시행일이 지남 → 차단 게이트(동의 또는 로그아웃).
 *
 * 시행일 전에 차단하면 아직 효력이 없는 약관을 강제하는 것이 되고, 시행일이 지나도 안 물으면
 * '동의 없는 이용'이 된다. 그래서 3-state 다.
 */
export type LegalConsentStage = 'ok' | 'notice' | 'required';
export function legalConsentStage(
  consentedVersion: number | null | undefined,
  now: Date = new Date(),
): LegalConsentStage {
  const v = typeof consentedVersion === 'number' ? consentedVersion : 0;
  if (v >= LEGAL_VERSION) return 'ok';
  return kstToday(now) >= LEGAL_EFFECTIVE_ISO ? 'required' : 'notice';
}
