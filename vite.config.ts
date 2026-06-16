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
  build: {
    // 안정적인 대형 vendor 를 별도 청크로 — 배포마다 앱 코드만 바뀌어도 vendor 는 캐시 재사용(재방문 다운로드↓)
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // 항상 eager 로 로드되는 대형·안정 vendor 만 분리(캐싱↑). 나머지(qrcode·kakao-maps 등
          // lazy 라우트 전용)는 기본 분할에 맡겨 eager 화되지 않도록 한다 — catch-all 금지.
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('react/jsx') || id.includes('scheduler')) return 'vendor-react';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion';
          if (id.includes('@supabase')) return 'vendor-supabase';
        },
      },
    },
  },
});
