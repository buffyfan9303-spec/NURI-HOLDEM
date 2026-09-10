// src/lib/monitoring.ts
// 외부 오류 모니터링(Sentry) 스캐폴드.
//  - 인앱 수집/관리자 화면 표시는 errorLog.ts가 담당(이미 동작 중).
//  - 이 모듈은 외부 실시간 알림(Sentry)을 담당하며, VITE_SENTRY_DSN 환경변수가 있을 때만 활성화.
//
// ▶ 활성화: Vercel(또는 .env)에 VITE_SENTRY_DSN = <Sentry 프로젝트 DSN> 만 설정하고 재배포한다.
//   패키지(@sentry/react)·initMonitoring() 호출(main.tsx)은 이미 갖춰져 있다 — 설치·주석 해제 불필요.
//   (DSN이 없으면 아무 일도 하지 않음 — 빌드/런타임 안전)
//   릴리스 식별자는 VITE_SENTRY_RELEASE(수동) 또는 Vercel 시스템 env 자동 노출(VITE_VERCEL_GIT_COMMIT_SHA)로 들어온다.

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
// 배포 단위 식별자 — 없으면 Sentry 가 오류를 릴리스별로 묶지 못하고(회귀 감지·'다음 릴리스에서 해결' 불가),
// 나중에 소스맵을 올려도 맞출 키가 없다. DSN 처럼 env 로만 넣는다(vite define 없음).
// 빈 문자열도 '미지정' 으로 — Vercel 이 비워서 내려주는 경우가 있어 ?? 대신 || 를 쓴다.
const RELEASE = (import.meta.env.VITE_SENTRY_RELEASE || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || undefined) as string | undefined;

// ── [DS] MO-1 — 모션 계측(라이브러리 0줄) ─────────────────────────────────────
// 코드베이스에 PerformanceObserver 가 0개였다 — 지금까지의 모션 최적화가 전부 눈대중.
// LoAF(스크립트 범인·강제 동기 레이아웃), layout-shift(시프트 유발 요소), INP 후보(200ms+)를
// 기존 관리자 errorLog 파이프로 보낸다([perf:*] 프리픽스) — 새 인프라 0.
// 미지원 브라우저(웨일·삼성인터넷 구버전)는 try/catch 로 조용히 스킵.
import { logClientError } from './errorLog';

export function initMotionTelemetry(): void {
  let sent = 0;
  const report = (kind: string, detail: string) => {
    if (sent >= 30) return; // 세션당 상한 — client_errors 도배 방지
    sent += 1;
    try { logClientError(`[perf:${kind}] ${detail}`.slice(0, 480), null); } catch { /* noop */ }
  };
  type LoAFScript = { sourceURL?: string; sourceFunctionName?: string; invoker?: string; duration?: number; forcedStyleAndLayoutDuration?: number };
  type LoAFEntry = PerformanceEntry & { blockingDuration?: number; firstUIEventTimestamp?: number; scripts?: LoAFScript[] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as LoAFEntry[]) {
        if ((e.blockingDuration ?? 0) > 100 && (e.firstUIEventTimestamp ?? 0) > 0) {
          const top = (e.scripts ?? []).slice().sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
          const who = top ? `${top.sourceFunctionName || top.invoker || '?'}@${(top.sourceURL || '').split('/').pop()} forced:${Math.round(top.forcedStyleAndLayoutDuration ?? 0)}ms` : 'no-script';
          report('loaf', `${Math.round(e.blockingDuration ?? 0)}ms ${who}`);
        }
      }
    }).observe({ type: 'long-animation-frame', buffered: true } as PerformanceObserverInit);
  } catch { /* 미지원 스킵 */ }
  try {
    new PerformanceObserver((l) => {
      type ShiftEntry = PerformanceEntry & { value?: number; hadRecentInput?: boolean; sources?: { node?: Element | null }[] };
      for (const e of l.getEntries() as ShiftEntry[]) {
        if ((e.value ?? 0) > 0.05 && !e.hadRecentInput) {
          const n = e.sources?.[0]?.node as Element | null | undefined;
          const sel = n ? `${n.tagName?.toLowerCase() ?? '?'}${n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').slice(0, 2).join('.') : ''}` : '?';
          report('cls', `${(e.value ?? 0).toFixed(3)} @${sel}`);
        }
      }
    }).observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);
  } catch { /* 미지원 스킵 */ }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.duration > 200) report('inp', `${Math.round(e.duration)}ms ${e.name}`);
    }).observe({ type: 'event', buffered: true, durationThreshold: 200 } as unknown as PerformanceObserverInit);
  } catch { /* 미지원 스킵 */ }
}

export function initMonitoring(): void {
  if (!DSN) return; // DSN 미설정 → 비활성. 인앱 errorLog(관리자 화면 수집)는 그대로 동작.

  // @sentry/react 를 동적 import — DSN 이 있을 때만 로드되는 별도 청크(메인 번들 비대화 없음).
  import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: DSN,
      release: RELEASE,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,        // 성능 트레이스 10% 샘플
      replaysSessionSampleRate: 0,  // 세션 리플레이 미사용(비용/프라이버시)
      replaysOnErrorSampleRate: 0,
    });
  }).catch((e) => console.warn('[monitoring] Sentry init 실패', e));
}
