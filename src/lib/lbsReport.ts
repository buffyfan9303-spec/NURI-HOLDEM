// src/lib/lbsReport.ts
// 위치기반서비스사업 신고(소상공인 등의 위치기반서비스사업 신고 — 「위치정보의 보호 및 이용 등에 관한 법률」 제9조의2) 수리 사실의 단일 소스.
//
// 원본: 방송미디어통신사무소 신고수리 통지(시행 방송미디어통신사무소-4306), 2026-10-08 수리, 신고번호 제1717호.
//   신고 사업 내용: 이용자 위치기반 성인 대상 홀덤 매장 안내 서비스.
// 이 값은 아래 네 곳이 같이 쓴다 — 한 곳만 고치면 "약관과 푸터가 다른 번호" 가 되므로 반드시 여기만 고친다.
//   · 위치기반서비스 이용약관 제2조(LegalDocsModal.tsx LOCATION → /legal/location.html 이 같은 문자열을 찍는다)
//   · 상시 푸터(BusinessFooter.tsx) · 사행성 배제 공지의 사업자 정보(LegalNotice.tsx) · 개인정보처리방침 ⑨(PrivacyPolicy.tsx)
// 일부러 의존성이 없는 파일이다: locationTerms.ts 가 BusinessFooter 를 import 하므로 여기서 그쪽을 import 하면 순환이 된다.
export const LBS_REPORT_LABEL = '위치기반서비스사업 신고';
export const LBS_REPORT_NO = '제1717호';
export const LBS_REPORT_OFFICE = '방송미디어통신사무소';
/** 약관·방침에 이 사실을 적어 넣은 날(부칙·개정 이력의 날짜) — 수리일과 다르다. */
export const LBS_REPORT_ADDED = '2026-10-09';
export const LBS_REPORT_DATE_KO = '2026년 10월 8일';
/** 예: 제1717호(방송미디어통신사무소, 2026년 10월 8일 수리) */
export const LBS_REPORT_VALUE = `${LBS_REPORT_NO}(${LBS_REPORT_OFFICE}, ${LBS_REPORT_DATE_KO} 수리)`;
