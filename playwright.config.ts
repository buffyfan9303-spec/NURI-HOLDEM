import { defineConfig, devices } from '@playwright/test';

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
  retries: process.env.CI ? 1 : 0,
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
