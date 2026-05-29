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
});
