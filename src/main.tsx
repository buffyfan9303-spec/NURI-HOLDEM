import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { BlockProvider } from './contexts/BlockContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/atoms/Toast';
import ErrorBoundary from './components/atoms/ErrorBoundary';
import { initErrorLog } from './lib/errorLog';
import { initMonitoring } from './lib/monitoring';

// 초기 테마 클래스는 ThemeProvider 가 마운트 시 적용한다.
// FOUC(깜빡임) 최소화를 위해 마운트 전에 저장된 테마를 즉시 반영.
const savedTheme = localStorage.getItem('nuri-theme');
document.documentElement.classList.add(savedTheme === 'light' ? 'light' : 'dark');

// 전역 에러 감시망 — 런타임 오류·프로미스 거부를 관리자 화면으로 수집
initErrorLog();
// 외부 실시간 오류 알림(Sentry) — VITE_SENTRY_DSN 설정 시에만 활성화(미설정 시 무동작)
initMonitoring();

// 서비스워커 등록 — 설치형 PWA/Play Store(TWA) 요건 + 앱 셸(해시 자산) 캐싱으로 재방문 즉시 로드 + 웹푸시.
// (기존엔 푸시 켤 때만 등록됐으나, 설치 가능·빠른 재방문을 위해 로드 시 항상 등록)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // 새 버전(배포) 감지 → 앱에 '업데이트 가능' 이벤트 발행(배너 표시)
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('nuri:sw-update'));
          }
        });
      });
    }).catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BlockProvider>
              <App />
            </BlockProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
