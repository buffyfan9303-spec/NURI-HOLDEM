// src/lib/errorLog.ts — 전역 에러 감시망.
// window.onerror / unhandledrejection / ErrorBoundary에서 client_errors 테이블로 자동 수집.
// 읽기는 관리자만(RLS). 같은 메시지 반복·세션당 과다 전송은 클라에서 차단.
import { supabase, IS_MOCK } from './supabase';

const sent = new Map<string, number>(); // message → 마지막 전송 시각
let sessionCount = 0;
const MAX_PER_SESSION = 20;
const DEDUP_MS = 60_000;

export function logClientError(message: string, stack?: string | null): void {
  if (IS_MOCK || !message) return;
  const key = message.slice(0, 200);
  const now = Date.now();
  if (sessionCount >= MAX_PER_SESSION) return;
  const last = sent.get(key);
  if (last && now - last < DEDUP_MS) return;
  sent.set(key, now);
  sessionCount += 1;
  // 실패해도 앱에 영향 없도록 완전 비동기 + 무시
  void (async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from('client_errors').insert({
        user_id: u.user?.id ?? null,
        message: key,
        stack: stack?.slice(0, 3000) ?? null,
        url: typeof location !== 'undefined' ? location.href.slice(0, 300) : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      });
    } catch { /* 감시망 자체 오류는 무시 */ }
  })();
}

/** 앱 부팅 시 1회 — 전역 에러/프로미스 거부 수집 */
export function initErrorLog(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    // 외부 스크립트의 무의미한 "Script error." 는 제외
    if (e.message && e.message !== 'Script error.') {
      logClientError(e.message, e.error?.stack ?? `${e.filename}:${e.lineno}`);
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    logClientError(
      r instanceof Error ? `[promise] ${r.message}` : `[promise] ${String(r).slice(0, 200)}`,
      r instanceof Error ? r.stack : null,
    );
  });
}
