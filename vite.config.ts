import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
  build: {
    // 안정적인 대형 vendor 를 별도 청크로 — 배포마다 앱 코드만 바뀌어도 vendor 는 캐시 재사용(재방문 다운로드↓)
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // 항상 eager 로 로드되는 대형·안정 vendor 만 분리(캐싱↑). 나머지(qrcode·kakao-maps 등
          // lazy 라우트 전용)는 기본 분할에 맡겨 eager 화되지 않도록 한다 — catch-all 금지.
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('react/jsx') || id.includes('scheduler')) return 'vendor-react';
          // (vendor-motion 청크는 framer-motion 제거로 소멸 — FLIP 공용 유틸이 대체)
          if (id.includes('@supabase')) return 'vendor-supabase';
        },
      },
    },
  },
});
