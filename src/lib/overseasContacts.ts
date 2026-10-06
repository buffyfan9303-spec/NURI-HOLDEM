// src/lib/overseasContacts.ts — 국외 이전받는 자의 개인정보 문의 연락처(개인정보 보호법 §28의8②3 · 시행령 §31①2).
// 처리방침 두 벌(PrivacyPolicy 표 · LegalDocsModal 본문)이 같은 값을 쓰도록 한 곳에 둔다.
// 출처: 각 사 공식 개인정보처리방침의 문의처 문장 — 2026-10-06 WebFetch 로 확인(legal.md P2-2).
//   Vercel  https://vercel.com/legal/privacy-policy  "please contact us at privacy@vercel.com"
//   Cloudflare https://www.cloudflare.com/privacypolicy/  "please contact us at privacyquestions@cloudflare.com" (권리 요청은 sar@cloudflare.com)
//   GitHub  https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement  "privacy[at]github[dot]com"
//   Sentry  https://sentry.io/privacy/  "sending us an email at compliance@sentry.io"
//   Resend  https://resend.com/legal/privacy-policy  "By email: support@resend.com"
//   Google  https://policies.google.com/privacy  — 이메일 대신 문의 양식 링크("you can contact us")
// 업체가 문의처를 바꾸면 이 파일만 고치고 `npm run legal` 로 정적 문서를 다시 만든다.
export const OVERSEAS_CONTACT = {
  vercel: 'privacy@vercel.com',
  cloudflare: 'privacyquestions@cloudflare.com',
  github: 'privacy@github.com',
  sentry: 'compliance@sentry.io',
  resend: 'support@resend.com',
  google: 'https://support.google.com/policies?p=privpol_privts',
} as const;
