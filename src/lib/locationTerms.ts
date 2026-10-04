// src/lib/locationTerms.ts — 위치기반서비스 이용약관의 판·공지일·시행일·책임자 **단일 소스**(작은 상수만 — 첫 화면 번들에 실려도 된다).
//
// 왜 locationConsent.ts 에서 뺐나: 약관 이력(legalHistory)·개인정보처리방침(정적 HTML SSR)이 이 날짜를 써야 하는데,
//   locationConsent.ts 는 react-dom/client·supabase·동의 API 를 끌고 온다. 날짜 몇 개 때문에 그걸 끌어오지 않는다.
//
// 제3판(2026-10-04 오너 결정 (다)): 위치 확인을 켠 매장에서는 동의하지 않거나 위치를 확인하지 못하면 QR 출석이 되지 않는다.
//   동의하지 않는 이용자에게 불리할 수 있는 변경이라 이용약관 제16조제2항("회원에게 불리한 변경의 경우에는 적용일 30일 전부터
//   서비스 내에 공지")과 개인정보처리방침 제14조제2항(중대한 변경 30일 전)을 따른다 → 공지일 + 31일 = 시행일.
//   🔴 공지(marketplace_notices)가 공지일보다 늦게 올라가면 **세 곳을 같은 커밋에서** 미룬다:
//      ① 아래 두 날짜 ② supabase/migrations/20261004d_*.sql 의 _checkin_geo_required_from() ③ 그 마이그레이션 적용.
//      (locationTerms.contract.test.ts 가 ①·②가 같은지와 30일 간격을 잠근다.)

/** 위치기반서비스 이용약관 판(版). 동의 기록(location_consents.terms_version)과 서버 check_in 의 `terms_version >= N` 이 같은 값이다. */
export const LOCATION_TERMS_VERSION = 3;
/** 제3판 공지일(사전 고지 시작일). */
export const LOCATION_TERMS_NOTICE = '2026-10-05';
/** 제3판 시행일 = 위치 확인 출석 매장에서 동의·위치가 없으면 QR 출석을 거부하기 시작하는 날(KST 0시). */
export const LOCATION_TERMS_EFFECTIVE = '2026-11-05';
/** 화면 문구용(한국어 날짜). */
export const LOCATION_TERMS_EFFECTIVE_KO = '2026년 11월 5일';
/** 직전판(제2판) 시행일과 원문 보존본 — 처리방침 제14조③ '이전 방침을 함께 게시'와 같은 원칙. */
export const LOCATION_TERMS_PREV_EFFECTIVE = '2026-09-26';
export const LOCATION_TERMS_PREV_ARCHIVE_URL = `/legal/archive/${LOCATION_TERMS_PREV_EFFECTIVE}/location.html`;

/** 서버 _checkin_geo_required_from() 과 같은 시각. 클라에서는 **문구·시트 모드 힌트로만** 쓴다 — 거부 판정은 서버만 한다. */
export const GEO_REQUIRED_FROM_MS = Date.parse(`${LOCATION_TERMS_EFFECTIVE}T00:00:00+09:00`);
export const isGeoRequiredNow = (now: number = Date.now()) => now >= GEO_REQUIRED_FROM_MS;

/** 위치정보관리책임자(위치정보법 시행령 제20조제1항제1호 · 제25조의2제3호) — 2026-09-30 오너 지정, 2026-10-04 연락처 확인(대표 겸임). */
export const LOCATION_OFFICER = { name: '김윤혜(대표)', contact: 'ace@nuriholdem.com' } as const;

/** 위치 확인 출석 매장에서 QR 출석이 안 될 때 안내하는 대체 경로(오너 결정 (다)-(a)). 동의 시트·재시도 시트·약관이 같은 사실을 말한다. */
export const CHECKIN_ALT_PATH = "매장 직원에게 참가를 요청하거나, 오늘 대회 상세의 '참가 신청'으로 요청하면 매장이 승인합니다";
