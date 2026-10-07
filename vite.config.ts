import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { cssOklabToRgb } from './src/lib/cssOklabToRgb';
import { cssModernOnly } from './src/lib/cssModernOnly';
import { visualizer } from 'rollup-plugin-visualizer';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// ANALYZE=1 일 때만 번들 treemap 을 만든다(평소 빌드엔 꺼짐 — 예산 게이트가 보는 dist 에
// stats.html 이 섞이지 않게 `npm run analyze` 전용 outDir 로만 켠다).
const analyze = process.env.ANALYZE === '1';
// SENTRY_AUTH_TOKEN 이 있을 때만 활성 — 없으면(CI/Vercel 미등록 상태) 완전 no-op, 빌드 동작 불변.
const sentryToken = process.env.SENTRY_AUTH_TOKEN;

// Tailwind v4 가 투명도 수식어(text-white/70 등)를 oklab(...) 리터럴로 굳힌다 — 색은 v3 rgb() 와 같지만 크롬이 흰 oklab 글자를
//   다르게 안티에일리어싱해(최대 10/255) v3 화면과 달라졌다. 8비트로 정확히 떨어지는 리터럴만 rgb() 로 되돌린다(src/lib/cssOklabToRgb.ts).
//   빌드 산출 CSS 에만 건다(dev 는 원본 그대로 — 화면 비교·게이트는 빌드본을 잰다).
// 먼저 cssModernOnly 로 v4 가 옛 브라우저용으로 찍는 폴백(@layer properties · color-mix/그라디언트 @supports 이중 선언 ·
//   늘 거짓인 @supports not)을 걷어낸다 — 지원 하한(Chrome 111+·Safari 16.4+)이 이미 고르던 값만 남아 화면은 그대로이고
//   CSS gz 가 약 1.3KB 준다(2026-09-28 ⑤-3 실측 36310→34992B). 근거·범위는 src/lib/cssModernOnly.ts 머리 주석.
function oklabToRgbPlugin(): Plugin {
  return {
    name: 'nuri:oklab-to-rgb',
    apply: 'build',
    generateBundle(_opts, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type !== 'asset' || !f.fileName.endsWith('.css')) continue;
        const src = typeof f.source === 'string' ? f.source : new TextDecoder().decode(f.source);
        f.source = cssOklabToRgb(cssModernOnly(src).css).css;
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    // Tailwind v4(2026-09-28 이관) — PostCSS 플러그인 대신 공식 Vite 플러그인. 설정은 src/index.css(@theme) 한 곳이다.
    tailwindcss(),
    oklabToRgbPlugin(),
    // filename 은 project root 기준(빌드 outDir 과 무관) — 프로젝트 루트에 흘리지 않게 고정 경로로 못박는다.
    analyze ? visualizer({ filename: '.analyze/stats.html', gzipSize: true, brotliSize: true, open: false }) : null,
    sentryToken ? sentryVitePlugin({
      authToken: sentryToken,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
    }) : null,
  ].filter(Boolean),
  // 2026-10-07 번들 감축 PR A ①: supabase-js 가 정적으로 부르는 storage-js·functions-js 를 첫 호출 때 불러오는 대리로 돌린다
  //   (첫 화면 −7KB gz 대). 정확히 이 두 이름만 — 대리 파일은 하위 경로로 진짜를 불러 여기 다시 걸리지 않는다.
  //   이유·지원 범위는 src/lib/sbStorageLazy.ts 머리 주석. vitest 는 이 파일을 읽지 않는다(별칭 없음).
  resolve: {
    alias: [
      { find: /^@supabase\/storage-js$/, replacement: fileURLToPath(new URL('./src/lib/sbStorageLazy.ts', import.meta.url)) },
      { find: /^@supabase\/functions-js$/, replacement: fileURLToPath(new URL('./src/lib/sbFunctionsLazy.ts', import.meta.url)) },
    ],
  },
  server: {
    port: 5173,
    // 백엔드 Express 서버로 API 요청 프록시
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // 환경변수 기본값 (VITE_API_URL 미설정 시 프록시 사용)
  define: {
    'import.meta.env.VITE_APP_NAME': JSON.stringify('홀덤 캘린더'),
  },
  // lucide-react 는 아이콘 1000개짜리 배럴이라 사전번들을 명시해 둔다(dev 콜드 스타트 안정화).
  // optimizeDeps 는 dev 에만 영향을 준다 — 빌드 산출물은 무변경.
  //
  // 📌 2026-09-04 함정 기록: dev 에서 lucide 아이콘이 **전부 빈 <svg>** 로 나온 적이 있다
  //   (빈 svg 34~55개 · `class="lucide lucide-*"` 0개). Icon.tsx 의 `const L = LUCIDE[name]` 이
  //   undefined 라 PATHS 폴백으로 떨어진 것인데, **에러가 하나도 안 난다** — 아이콘만 조용히 사라진다.
  //   범인은 이 옵션이 아니라 **stale 서비스 워커 캐시**였다(public/sw.js 가 dev 에도 등록돼 옛 모듈을 준다).
  //   Vite 캐시 삭제·서버 재시작·이 옵션 추가 **전부 무효**였고, SW unregister + caches.delete 후
  //   재로드하자 즉시 정상(빈 svg 0 · lucide 59)이 됐다.
  //   → dev 에서 "코드는 맞는데 화면만 이상하다" 싶으면 **SW부터 지우고 다시 본다.**
  optimizeDeps: { include: ['lucide-react'] },
  // Sentry 가 원본 파일:줄을 읽으려면 소스맵이 있어야 한다 — 토큰 없을 땐 플러그인도 없으니
  // 이 옵션만으로 dist 에 .map 이 남지 않는다(플러그인이 있을 때만 업로드 후 삭제된다).
  build: {
    sourcemap: sentryToken ? 'hidden' : false,
    // 안정적인 대형 vendor 를 별도 청크로 — 배포마다 앱 코드만 바뀌어도 vendor 는 캐시 재사용(재방문 다운로드↓)
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // 항상 eager 로 로드되는 대형·안정 vendor 만 분리(캐싱↑). 나머지(qrcode·kakao-maps 등
          // lazy 라우트 전용)는 기본 분할에 맡겨 eager 화되지 않도록 한다 — catch-all 금지.
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('react/jsx') || id.includes('scheduler')) return 'vendor-react';
          // (vendor-motion 청크는 framer-motion 제거로 소멸 — FLIP 공용 유틸이 대체)
          // storage-js·functions-js 는 첫 호출 때 불러온다(위 resolve.alias) — 여기 묶으면 eager 청크로 도로 들어온다.
          if (id.includes('@supabase/storage-js') || id.includes('@supabase/functions-js')) return;
          if (id.includes('@supabase')) return 'vendor-supabase';
        },
      },
    },
  },
});
