import { defineConfig, devices } from '@playwright/test';

// NURI HOLDEM E2E 스모크 — 배포 전 회귀 게이트.
//  실행: `npm run test:e2e` (헤드리스) / `npm run test:e2e:ui` (UI 모드)
//  기본은 로컬 dev 서버(localhost:5173)를 자동 기동·재사용. 다른 URL 검사 시 E2E_BASE_URL 지정.
//  인증 스모크(장부/클락 렌더)는 E2E_EMAIL·E2E_PASSWORD 가 있을 때만 동작(없으면 skip).
const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // 앱 주 사용 환경(모바일 PWA) 기준 — 412px. 하단 탭바·모바일 헤더가 이 폭에서 렌더.
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  // E2E_BASE_URL 을 직접 주면(배포본 검사 등) 서버 기동 안 함. 아니면 dev 서버 자동 기동·재사용.
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
