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
