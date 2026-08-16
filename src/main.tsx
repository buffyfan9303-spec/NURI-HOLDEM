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
// storage 전면 차단 환경(일부 웹뷰/시크릿 설정)에서 SecurityError로 부팅이 죽지 않게 try
let savedTheme: string | null = null;
try { savedTheme = localStorage.getItem('nuri-theme'); } catch { /* storage 차단 환경 */ }
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

// ── 서드파티(GA·AdSense) 지연 주입 ──────────────────────────────────────────
// 왜 index.html 이 아니라 여기인가: <head> 에 두면 앱 번들과 '같은 순간' 다운로드·파싱이 시작된다.
// 라이브 실측에서 adsbygoogle.js 가 t=23ms 로 index/vendor-react/vendor-supabase 와 동시에 출발해
// decoded 665KB 를 파싱했고(앱 셸 839KB 의 80%), 서드파티 호스트 6곳으로 요청 11건이 퍼졌다.
// 첫 화면에는 광고가 필요 없고(src 에 광고 슬롯 0개), 사용자가 기다리는 건 대회 목록이다.
// 그래서 '첫 페인트가 끝나고 브라우저가 한가해진 뒤'로 미룬다 — 수익 로직은 그대로 살아 있다.
function loadThirdParty() {
  const srcs = [
    'https://www.googletagmanager.com/gtag/js?id=G-9T7JZNEQE8',
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6018943099120763',
  ];
  for (const src of srcs) {
    if (document.querySelector(`script[src="${src}"]`)) continue;
    const el = document.createElement('script');
    el.async = true;
    el.crossOrigin = 'anonymous';
    el.src = src;
    document.head.appendChild(el);
  }
}
// requestIdleCallback 이 없으면(사파리 구버전) 타이머로 폴백. timeout 은 '한가해지지 않아도 결국 로드'.
type IdleWin = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
const w = window as IdleWin;
// ⚠ '시간을 기다리는' 방식은 두 번 실패했다.
//   1차: 유휴 콜백만 → 붐비는 기기에서 앱의 첫 데이터 요청보다 유휴 창이 먼저 열렸다.
//   2차: load 후 유휴 → 이번엔 빠른 환경(로컬 캐시·프리뷰)에서 load 가 React 이펙트보다
//        먼저 떠서 또 앞질렀다(실측 third → third → data). 느려도 빨라도 지는 레이스였다.
//   결론: 순서는 시간이 아니라 **신호**로 보장해야 한다. 앱(App.tsx)이 첫 화면 데이터 요청을
//   쏘는 순간 'nuri:first-data-requested' 이벤트를 낸다. 서드파티는 load 와 그 신호가
//   **둘 다** 도착한 뒤 유휴에 출발한다 — 기기 속도와 무관하게 구조적으로 뒤다.
//   신호가 영영 안 오는 비정상 상황(모의 모드·부팅 크래시)엔 load 후 8초 폴백으로 어차피 나간다.
let tpLoaded = false, tpWindowLoaded = false, tpDataRequested = false;
const tpAfterIdle = () => {
  if (tpLoaded) return;
  tpLoaded = true;
  if (w.requestIdleCallback) w.requestIdleCallback(loadThirdParty, { timeout: 8000 });
  else setTimeout(loadThirdParty, 5000);
};
const tpMaybe = () => { if (tpWindowLoaded && tpDataRequested) tpAfterIdle(); };
window.addEventListener('nuri:first-data-requested', () => { tpDataRequested = true; tpMaybe(); }, { once: true });
const tpOnLoad = () => {
  tpWindowLoaded = true; tpMaybe();
  setTimeout(tpAfterIdle, 8000); // 신호 유실 폴백 — 광고·GA 가 영영 안 뜨는 것보단 늦게라도
};
if (document.readyState === 'complete') tpOnLoad();
else window.addEventListener('load', tpOnLoad, { once: true });
