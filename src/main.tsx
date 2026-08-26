import { StrictMode } from 'react';
// 삼성 인터넷: 브라우저 자체 '맨 위로' 원형 버튼(하단 중앙)이 탭바 가운데 칸을 가린다(오너 스크린샷)
// → html.samsung 으로 탭바를 --tabbar-lift 만큼 올려 회피(index.css).
if (/SamsungBrowser/i.test(navigator.userAgent)) document.documentElement.classList.add('samsung');

import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { BlockProvider } from './contexts/BlockContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/atoms/Toast';
import ErrorBoundary from './components/atoms/ErrorBoundary';
import { initErrorLog } from './lib/errorLog';
import { initMonitoring, initMotionTelemetry } from './lib/monitoring';

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
// [DS] MO-1 모션 계측 — LoAF·CLS·INP 후보를 관리자 errorLog 로(순수 PerformanceObserver, 번들 +0)
initMotionTelemetry();

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

// ── 서드파티(GA) 지연 주입 ──────────────────────────────────────────
// 왜 index.html 이 아니라 여기인가: <head> 에 두면 앱 번들과 '같은 순간' 다운로드·파싱이 시작된다.
// 그래서 '첫 페인트가 끝나고 브라우저가 한가해진 뒤'로 미룬다.
//
// ⚠️ AdSense(Auto Ads) 제거 — 2026-08 정책 위반("게시자 콘텐츠 없는 화면에 광고") 대응.
//    이 앱은 수동 광고 슬롯이 0개, adsbygoogle.js 로더만 실어 Auto Ads 가 캘린더 목록·모달 등
//    "행동 목적 화면"에 광고를 자동 삽입했고, 그게 위반 판정의 원인이다.
//    심사 통과 후 재도입할 땐 Auto Ads 가 아니라 콘텐츠가 있는 화면(포스트 상세·전적 대시보드 등)에만
//    수동 <ins class="adsbygoogle"> 슬롯으로 넣을 것. (누리 마인드 AdSlot 패턴 참고)
function loadThirdParty() {
  const srcs = [
    'https://www.googletagmanager.com/gtag/js?id=G-9T7JZNEQE8',
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
  // 신호(load+첫 데이터 응답) 직후는 사용자가 첫 상호작용을 하는 구간 — 3.5초 더 물러나
  // 서드파티 파싱을 유휴 구간으로 밀어낸다.
  setTimeout(() => {
    if (w.requestIdleCallback) w.requestIdleCallback(loadThirdParty, { timeout: 8000 });
    else setTimeout(loadThirdParty, 5000);
  }, 3500);
};
const tpMaybe = () => { if (tpWindowLoaded && tpDataRequested) tpAfterIdle(); };
window.addEventListener('nuri:first-data-requested', () => { tpDataRequested = true; tpMaybe(); }, { once: true });
const tpOnLoad = () => {
  tpWindowLoaded = true; tpMaybe();
  setTimeout(tpAfterIdle, 8000); // 신호 유실 폴백 — 광고·GA 가 영영 안 뜨는 것보단 늦게라도
};
if (document.readyState === 'complete') tpOnLoad();
else window.addEventListener('load', tpOnLoad, { once: true });
