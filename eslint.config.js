import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import security from 'eslint-plugin-security'
import playwright from 'eslint-plugin-playwright'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    // Deno 엣지함수: 웹앱과 별개 툴체인(@ts-nocheck 의도적) — 웹앱 lint 게이트 대상 아님
    'supabase/functions',
    // 정적 서빙 파일(sw.js 등): 번들 대상이 아니라 lint 제외
    'public',
    // 병렬 작업용 git worktree 사본: 같은 소스를 두 번 린트할 뿐 아니라, 루트가 여럿이 되어
    // typescript-eslint 가 tsconfigRootDir 를 못 정하고 **전부 파싱 에러**로 떨어진다
    // (그 상태에서는 `npm run lint` 게이트 자체가 죽는다). 각 worktree 는 자기 안에서 린트한다.
    '.claude/worktrees',
    // Playwright 산출물(트레이스 리소스·리포트): 소스가 아니라 실행 잔여물이다.
    // 남아 있으면 `npx eslint .` 가 트레이스 안의 .js 를 열려다 ENOENT 로 **게이트 자체가 죽는다**
    // (실제로 2026-08-30 하위 탭 웨이브에서 물렸다 — 테스트를 돌린 뒤에만 재현돼 더 헷갈린다).
    'test-results',
    'playwright-report',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // 2026-09-02 보안 패스: eval·비리터럴 require·정규식 DoS·타이밍 비교 등 표면화(경고). 게이트를 죽이지 않고 리뷰에서 본다.
      security.configs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // obj[key] 전수 경고는 신호가 아니라 소음(React 코드베이스 수천 곳) — 입력이 흐르는 곳은 리뷰로 본다
      'security/detect-object-injection': 'off',
      // react-hooks v7 신규(React Compiler 기반) 진단 룰: 기존 코드에 소급 적용하려면
      // setState/컴포넌트 구조 리팩토링이 필요해 동작 변경 위험이 큼 → 게이트에서 제외(점진 도입 대상)
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  // 🔴 e2e 전용 — **거짓 통과하는 테스트**를 잡는 룰만 골랐다(2026-09-18).
  //   이 저장소가 실제로 겪었던 자리다: 부분일치 셀렉터가 엉뚱한 것을 잡아 toBeVisible 이 통과했고,
  //   음성 대조가 주석을 매칭해 거짓 통과했고, 571개 중 542개만 돌았는데 '전체 통과' 로 보고됐다.
  //   expect-expect(단언이 아예 없는 테스트)·no-conditional-expect(if 안에 숨어 안 돌 수도 있는 단언)가
  //   바로 그 부류다. 나머지 스타일 룰은 꺼 둔다 — 이 저장소는 waitForTimeout·수동 셀렉터를
  //   일부러 쓴다(모션 계측·CDP 터치). 소음을 늘리면 게이트를 안 보게 된다.
  {
    files: ['e2e/**/*.ts'],
    plugins: { playwright },
    rules: {
      'playwright/expect-expect': 'error',
      // 기존 43건이 있다 — 대부분 테마·폭 분기 안의 정당한 단언이라 일괄 error 로 올리면
      //   게이트가 통째로 막힌다. 경고로 띄워 두고 줄여 나간다(새로 쓰는 테스트는 피할 것).
      'playwright/no-conditional-expect': 'warn',
      'playwright/no-standalone-expect': 'error',
      'playwright/valid-expect': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-useless-await': 'warn',
    },
  },
])