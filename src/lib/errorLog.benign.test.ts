// 2026-10-03 E3 L-5 — 장부를 열 때마다 client_errors 로 'ResizeObserver loop completed with undelivered notifications'
// 1건씩 쌓였다(브라우저 무해 경고). 걸러내되, 다른 실제 오류는 계속 수집돼야 한다.
// 음성 대조: errorLog.ts logClientError 의 `BENIGN_RO_WARNING.test(...)` 조건을 지우면 ①이, 그 정규식을 넓혀 전부 삼키게 하면 ②가 빨개진다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const insert = vi.fn(async () => ({ error: null }));
vi.mock('./supabase', () => ({ IS_MOCK: false, supabase: { from: () => ({ insert }) } }));
vi.mock('../api/_session', () => ({ currentUser: async () => null }));

beforeEach(() => { insert.mockClear(); vi.resetModules(); });
afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock('@sentry/react'); });

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('errorLog — 무해한 ResizeObserver 경고는 client_errors 로 안 보낸다', () => {
  it('① 두 가지 문구 모두 전송 0', async () => {
    const { logClientError } = await import('./errorLog');
    logClientError('ResizeObserver loop completed with undelivered notifications.');
    logClientError('ResizeObserver loop limit exceeded');
    await flush();
    expect(insert).not.toHaveBeenCalled();
  });

  it('② 다른 실제 오류·비슷한 접두 문구는 계속 수집된다', async () => {
    const { logClientError } = await import('./errorLog');
    logClientError("Cannot read properties of undefined (reading 'x')");
    logClientError('[promise] ResizeObserver loop 에서 던진 진짜 오류');
    logClientError('TypeError: ResizeObserver loop completed with undelivered notifications. is not a function');
    await flush();
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it('③ Sentry 도 같은 문구를 ignoreErrors 로 거른다(구형 문구 포함) — 기본 필터는 한 문구뿐', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://k@o0.ingest.sentry.io/1');
    const init = vi.fn();
    vi.doMock('@sentry/react', () => ({ init }));
    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    const cfg = init.mock.calls[0][0] as { ignoreErrors?: RegExp[] };
    const hit = (m: string) => (cfg.ignoreErrors ?? []).some((re) => re.test(m));
    expect(hit('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(hit('ResizeObserver loop limit exceeded')).toBe(true);
    expect(hit('TypeError: x is not a function')).toBe(false);
  });
});
