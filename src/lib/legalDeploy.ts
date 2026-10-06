// src/lib/legalDeploy.ts — **배포일 기준** 법적 문서 날짜의 단일 소스(2026-10-06 리드 결정 ④).
//
// 🔴 리드가 배포 직전에 LEGAL_DEPLOY_ISO **한 줄만** 바꾼다. 아래 날짜는 전부 여기서 계산된다(손으로 따로 고치지 마라).
//   · 처리방침 제3판(PR #188 + 약관 재검토 P1-2·P1-3·P1-5·P2-5·P2-6) — 공지일 = 배포일, 시행일 = +30일(처리방침 제14조②)
//   · 이용약관 제2판 보완(제2조제1호·제3조①⑥⑦·제5조⑦~⑩) — 공지일 = 배포일, 시행일 = +7일(약관 제16조②)
//   · 매장 운영자 이용약관 제1판 — 시행일 = 배포일(업주 개별 동의로 효력이 생기는 신설 문서)
// 공지는 배포(= 화면에 개정 안내가 뜨는 날)로 시작한다. 배포가 늦어지면 이 값을 같은 커밋에서 미룬다 — 그래야 공지 기간이 모자라지 않는다.
// 이용약관 제3판(P2-2 활동 포인트)은 배포와 별개로 리드가 날짜를 정한다(TERMS_NEXT — 아직 null).

/** 배포일(KST, ISO). */
export const LEGAL_DEPLOY_ISO = '2026-10-08';

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ko = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${y}년 ${m}월 ${d}일`; };

/** 처리방침 제3판 — 공지 = 배포일, 시행 = 공지 + 30일. */
export const PRIVACY_V3_NOTICE_ISO = LEGAL_DEPLOY_ISO;
export const PRIVACY_V3_EFFECTIVE_ISO = addDays(LEGAL_DEPLOY_ISO, 30);
export const PRIVACY_V3_NOTICE_DATE = ko(PRIVACY_V3_NOTICE_ISO);
export const PRIVACY_V3_EFFECTIVE_DATE = ko(PRIVACY_V3_EFFECTIVE_ISO);

/** 이용약관 제2판 보완 — 공지 = 배포일, 시행 = 공지 + 7일(회원에게 불리하지 않은 변경). */
export const TERMS_SUPPLEMENT_NOTICE_ISO = LEGAL_DEPLOY_ISO;
export const TERMS_SUPPLEMENT_EFFECTIVE_ISO = addDays(LEGAL_DEPLOY_ISO, 7);
export const TERMS_SUPPLEMENT_NOTICE_DATE = ko(TERMS_SUPPLEMENT_NOTICE_ISO);
export const TERMS_SUPPLEMENT_EFFECTIVE_DATE = ko(TERMS_SUPPLEMENT_EFFECTIVE_ISO);

/** 매장 운영자 이용약관(개인정보 처리위탁 포함 — src/pages/legal/OwnerTerms.tsx)의 판·시행일. 회원 약관 판(LEGAL_VERSION)과 별개. */
export const OWNER_TERMS_VERSION = 1;
export const OWNER_TERMS_EFFECTIVE_DATE = ko(LEGAL_DEPLOY_ISO);

/** 이용약관 제3판 — **공지 예정(초안)**(약관 재검토 P2-2). 본문 초안은 src/lib/termsNextDraft.ts.
 *  활동 포인트 조항(회수·탈퇴 시 소멸)이 회원에게 불리할 수 있어 공지 30일 + 재동의 게이트가 필요하다.
 *  🔴 공지일·시행일은 리드가 정한다 — 정하기 전에는 null 로 두고 LEGAL_VERSION(2)·DB current_legal_version() 을 올리지 않는다.
 *     시행 전환 = 두 값을 채우고(시행일 ≥ 공지일 + 30일) 초안을 TermsOfService 에 옮긴 뒤 LEGAL_VERSION·LEGAL_*·legalHistory·
 *     current_legal_version() 을 같은 커밋에서 올린다(legal2-1006.contract.test 가 잠근다). */
export const TERMS_NEXT: { version: number; noticeIso: string | null; effectiveIso: string | null } = {
  version: 3, noticeIso: null, effectiveIso: null,
};
