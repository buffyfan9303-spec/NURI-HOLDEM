// scripts/legal-ssr-entry.tsx — 정적 약관 HTML 생성 전용 SSR 진입점.
// scripts/gen-legal.mjs 가 이 파일을 Vite SSR 로 번들해 renderToStaticMarkup 으로 찍는다.
// 앱이 보여주는 컴포넌트를 그대로 렌더하므로 "앱의 약관"과 "공개된 약관"이 두 벌이 될 수 없다.
export { default as terms } from '../src/pages/legal/TermsOfService';
export { default as privacy } from '../src/pages/legal/PrivacyPolicy';
export { default as antiGambling } from '../src/pages/legal/LegalNotice';
export { default as marketing } from '../src/pages/legal/MarketingConsent';
export { default as refund } from '../src/pages/legal/RefundPolicy';
