// src/lib/legalDeploy.ts — **정식 오픈일(배포일) 기준** 법적 문서 날짜의 단일 소스.
//
// 🔴 오너 결정(2026-10-06): "서비스에 사람이 없으니 목요일 기준으로 — 시행은 모든 약관상 목요일부터."
//   → 이번 개정은 전부 **공지일 = 시행일 = LEGAL_DEPLOY_ISO(2026-10-08 목, 정식 오픈)**. 7일·30일 사전 공지 간격을 두지 않는다.
//   대상: 처리방침 제3판(영구정지 5년 보관 포함) · 이용약관 제2판 보완 · 매장 운영자 이용약관 제1판 · 위치기반서비스 이용약관 제3판
//   (lib/locationTerms.ts 가 이 값을 쓴다 — 서버 _checkin_geo_required_from() 은 20261006o 가 같은 날로 맞춘다).
//   배포가 늦어지면 리드가 이 한 줄과 20261006o 의 시각을 같은 커밋에서 옮긴다.
// 이용약관 제3판(활동 포인트, 약관 재검토 P2-2)도 같은 날 공지·시행하고 그날부터 재동의를 받는다(아래 TERMS_V3_* · legalVersion CONSENT_GATES).

/** 정식 오픈일 = 이번 개정의 공지일·시행일(KST, ISO). */
export const LEGAL_DEPLOY_ISO = '2026-10-08';

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'(화면 표기). */
export const koDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${y}년 ${m}월 ${d}일`; };
/** 화면 표기용 정식 오픈일. */
export const LEGAL_DEPLOY_DATE = koDate(LEGAL_DEPLOY_ISO);

/** 처리방침 제3판 — 공지 = 시행 = 정식 오픈일. */
export const PRIVACY_V3_NOTICE_ISO = LEGAL_DEPLOY_ISO;
export const PRIVACY_V3_EFFECTIVE_ISO = LEGAL_DEPLOY_ISO;
export const PRIVACY_V3_NOTICE_DATE = LEGAL_DEPLOY_DATE;
export const PRIVACY_V3_EFFECTIVE_DATE = LEGAL_DEPLOY_DATE;

/** 이용약관 제2판 보완 — 공지 = 시행 = 정식 오픈일. */
export const TERMS_SUPPLEMENT_NOTICE_ISO = LEGAL_DEPLOY_ISO;
export const TERMS_SUPPLEMENT_EFFECTIVE_ISO = LEGAL_DEPLOY_ISO;
export const TERMS_SUPPLEMENT_NOTICE_DATE = LEGAL_DEPLOY_DATE;
export const TERMS_SUPPLEMENT_EFFECTIVE_DATE = LEGAL_DEPLOY_DATE;

/** 매장 운영자 이용약관(개인정보 처리위탁 포함 — src/pages/legal/OwnerTerms.tsx)의 판·시행일. 회원 약관 판(LEGAL_VERSION)과 별개.
 *  🔴 판을 올리면 서버 record_my_owner_terms_consent 의 현재 판 상수(20261006n)도 같은 커밋에서 올린다 — 서버는 현재 판만 받는다. */
export const OWNER_TERMS_VERSION = 1;
export const OWNER_TERMS_EFFECTIVE_DATE = LEGAL_DEPLOY_DATE;

/** 이용약관 제3판(약관 재검토 P2-2 활동 포인트) — **배포일(정식 오픈일) 하루에 공지·시행**(2026-10-06 오너 결정:
 *  "서비스에 사람이 없으니 목요일 기준 — 시행은 모든 약관상 목요일부터"). 조항별 7일/30일 분할은 하지 않는다.
 *  재동의 게이트는 시행일(=배포일)부터 제2판 동의자를 차단해 명시 동의를 받는다(legalVersion CONSENT_GATES — 시행일 기준 구조는 그대로).
 *  공지일 ≤ 시행일만 테스트가 잠근다(legal3-1006.contract.test). */
export const TERMS_V3_NOTICE_ISO = LEGAL_DEPLOY_ISO;
export const TERMS_V3_EFFECTIVE_ISO = LEGAL_DEPLOY_ISO;
export const TERMS_V3_NOTICE_DATE = LEGAL_DEPLOY_DATE;
export const TERMS_V3_EFFECTIVE_DATE = LEGAL_DEPLOY_DATE;
/** 제3판 시행 전까지 적용된 제2판 원문 보존본(origin/main 의 /legal/terms.html) — 배포일 폴더. 배포일이 바뀌면 같은 커밋에서 폴더도 옮긴다(테스트가 존재를 잠근다). sitemap 미포함·noindex. */
export const TERMS_V2_ARCHIVE_URL = `/legal/archive/${LEGAL_DEPLOY_ISO}/terms.html`;
