// src/lib/monitoring.ts
// 외부 오류 모니터링(Sentry) 스캐폴드.
//  - 인앱 수집/관리자 화면 표시는 errorLog.ts가 담당(이미 동작 중).
//  - 이 모듈은 외부 실시간 알림(Sentry)을 담당하며, VITE_SENTRY_DSN 환경변수가 있을 때만 활성화.
//
// ▶ 활성화 방법(런칭 시):
//   1) `npm i @sentry/react`
//   2) 아래 동적 import 블록의 주석을 해제
//   3) Vercel(또는 .env)에 VITE_SENTRY_DSN = <Sentry 프로젝트 DSN> 설정
//   재배포하면 자동으로 외부 알림이 켜집니다. (DSN이 없으면 아무 일도 하지 않음 — 빌드/런타임 안전)

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initMonitoring(): void {
  if (!DSN) return; // DSN 미설정 → 비활성. 인앱 errorLog(관리자 화면 수집)는 그대로 동작.

  // @sentry/react 를 동적 import — DSN 이 있을 때만 로드되는 별도 청크(메인 번들 비대화 없음).
  import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,        // 성능 트레이스 10% 샘플
      replaysSessionSampleRate: 0,  // 세션 리플레이 미사용(비용/프라이버시)
      replaysOnErrorSampleRate: 0,
    });
  }).catch((e) => console.warn('[monitoring] Sentry init 실패', e));
}
