import { defineConfig } from 'vitest/config';

// 단위 테스트 설정 — 순수 로직(금액 계산 등)만 담당한다.
// e2e/ 는 Playwright 전용이라 반드시 제외해야 한다(vitest가 집으면
// "Playwright Test did not expect test.describe() to be called here" 로 실패).
export default defineConfig({
  test: {
    // api/ 의 Vercel 함수는 순수 JS 라 tsc 밖이다 — 테스트만 여기서 집는다(health 엔드포인트 계약).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.js'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
