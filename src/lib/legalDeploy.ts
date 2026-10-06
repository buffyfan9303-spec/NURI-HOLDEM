// src/lib/legalDeploy.ts — **정식 오픈일(배포일) 기준** 법적 문서 날짜의 단일 소스.
//
// 🔴 오너 결정(2026-10-06): "서비스에 사람이 없으니 목요일 기준으로 — 시행은 모든 약관상 목요일부터."
//   → 이번 개정은 전부 **공지일 = 시행일 = LEGAL_DEPLOY_ISO(2026-10-08 목, 정식 오픈)**. 7일·30일 사전 공지 간격을 두지 않는다.
//   대상: 처리방침 제3판(영구정지 5년 보관 포함) · 이용약관 제2판 보완 · 매장 운영자 이용약관 제1판 · 위치기반서비스 이용약관 제3판
//   (lib/locationTerms.ts 가 이 값을 쓴다 — 서버 _checkin_geo_required_from() 은 20261006o 가 같은 날로 맞춘다).
//   배포가 늦어지면 리드가 이 한 줄과 20261006o 의 시각을 같은 커밋에서 옮긴다.
// 이용약관 제3판(활동 포인트)은 NURI/legal3-1006(다른 에이전트)이 이 파일의 공통 날짜를 쓴다 — TERMS_NEXT 는 그쪽 몫.

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

/** 이용약관 제3판 — **공지 예정(초안)**(약관 재검토 P2-2). 본문 초안은 src/lib/termsNextDraft.ts. 날짜·시행 전환은 NURI/legal3-1006 의 몫.
 *  정하기 전에는 null 로 두고 LEGAL_VERSION(2)·DB current_legal_version() 을 올리지 않는다(legal2-1006.contract.test 가 잠근다). */
export const TERMS_NEXT: { version: number; noticeIso: string | null; effectiveIso: string | null } = {
  version: 3, noticeIso: null, effectiveIso: null,
};
