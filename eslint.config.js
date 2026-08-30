import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
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
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
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
])
