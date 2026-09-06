import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// ⚠ 로그인 스펙(인증 스모크·오너 레이아웃 실측)은 E2E_EMAIL/E2E_PASSWORD 가 있을 때만 돈다.
//   그런데 값은 .env.local 에 있는데 이 설정이 그걸 안 읽어서, **자격증명이 있는데도 24개가 조용히
//   skip 되고 있었다**(auth-smoke 머리말: "이 파일은 한 번도 실행된 적이 없었다"). 실측으로 확인:
//   env 를 손으로 넣어 돌리자 그때서야 StatCard 정렬 회귀와 404 RPC 가 드러났다.
//   → 여기서 채운다. **이미 있는 값은 덮지 않는다**(CI 의 시크릿이 항상 이긴다).
//   dotenv 를 새로 들이지 않는 이유: 이 몇 줄이면 되고, 의존성은 적을수록 좋다.
try {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = /^\s*(E2E_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
} catch { /* .env.local 이 없으면 그대로 — 그 환경에서는 로그인 스펙이 skip 된다 */ }

// NURI HOLDEM E2E 스모크 — 배포 전 회귀 게이트.
//  실행: `npm run test:e2e` (헤드리스) / `npm run test:e2e:ui` (UI 모드)
//  기본은 **프로덕션 빌드**(vite build → preview, localhost:4173)를 자동 기동·재사용한다.
//  개발 서버가 아니다 — 이유는 아래 webServer 주석 참고. 다른 URL 검사 시 E2E_BASE_URL 지정.
//  인증 스모크(장부/클락 렌더)는 E2E_EMAIL·E2E_PASSWORD 가 있을 때만 동작(없으면 skip).
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0, // 2026-09-03: 러너 부하 플레이크(subtab-motion root 이동·clock-catchup·shout-queue)가 1회 재시도로는 안 걷힘
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // 앱 주 사용 환경(모바일 PWA) 기준 — 412px. 하단 탭바·모바일 헤더가 이 폭에서 렌더.
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  // E2E_BASE_URL 을 직접 주면(배포본 검사 등) 서버 기동 안 함.
  //
  // ⚠ 예전에는 여기서 `npm run dev` 를 띄웠다. 그게 하루를 통째로 날린 원인이었다.
  //   개발 서버는 React StrictMode 로 돌아서 useEffect 가 마운트마다 두 번 실행된다.
  //   그 이중 실행이 backstack 의 정리 로직과 경합해 **모달이 열리자마자 닫혔고**,
  //   그래서 로그인처럼 모달로 시작하는 흐름은 아예 검증이 불가능했다.
  //   정작 사용자에게 나가는 프로덕션 빌드는 멀쩡했으니, 테스트는 '나가지 않는 것' 을
  //   검사하며 실패하고 있었던 셈이다 — 잘못된 실패는 잘못된 통과만큼 해롭다.
  //
  //   그래서 **실제로 배포되는 산출물**(vite build → preview)을 물린다.
  //   빌드가 1~2초라 체감 비용이 거의 없고, 무엇보다 '테스트한 것 = 나가는 것' 이 된다.
  //   개발 중 HMR 로 눈으로 볼 때는 여전히 `npm run dev` 를 쓰면 된다.
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // ⚠ reuseExistingServer 를 켜면 안 된다. 이미 4173 이 떠 있으면 Playwright 는 command 를
    //   **통째로 건너뛴다** — 즉 `npm run build` 도 안 돈다. 그러면 소스를 고쳐도 예전 dist 를
    //   계속 검사하게 된다. 실제로 그것 때문에 '고쳤는데 그대로 실패' 하는 데 한참을 썼다.
    //   dev 서버 시절엔 HMR 이 있어 문제가 없었지만, 빌드 산출물을 검사하는 지금은 치명적이다.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
