// api/health.test.js — /api/health 계약 테스트 (Vercel 함수는 e2e(vite preview)에서 돌지 않으므로 여기서 고정)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './health.js';

function fakeRes() {
  const r = { headers: {}, code: 0, body: '' };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}

const ENV = { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-public' };

describe('/api/health', () => {
  beforeEach(() => { Object.assign(process.env, ENV); });
  afterEach(() => { vi.useRealTimers(); delete process.env.VITE_SUPABASE_URL; delete process.env.VITE_SUPABASE_ANON_KEY; });

  it('DB 프로브 성공 → 200 ok · no-store · 비밀 미노출', async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    const res = fakeRes();
    await handler({}, res, { fetch });
    expect(res.code).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toContain('application/json');
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.db.ok).toBe(true);
    expect(typeof body.db.ms).toBe('number');
    // 응답 어디에도 키·URL 이 실리지 않는다
    expect(res.body).not.toContain('anon-public');
    expect(res.body).not.toContain('x.supabase.co');
    // 프로브는 값싼 읽기 1행
    expect(fetch.mock.calls[0][0]).toBe('https://x.supabase.co/rest/v1/venues?select=id&limit=1');
  });

  it('업스트림 비정상(HTTP 500) → 503 degraded', async () => {
    const res = fakeRes();
    await handler({}, res, { fetch: async () => ({ ok: false, status: 500 }) });
    expect(res.code).toBe(503);
    expect(JSON.parse(res.body).db).toEqual({ ok: false, reason: 'upstream' });
  });

  it('네트워크 예외 → 503, 내부 오류 문자열은 응답에 싣지 않는다', async () => {
    const res = fakeRes();
    await handler({}, res, { fetch: async () => { throw new Error('ECONNREFUSED internal-host-name'); } });
    expect(res.code).toBe(503);
    expect(res.body).not.toContain('internal-host-name');
    expect(JSON.parse(res.body).db.reason).toBe('upstream');
  });

  it('3초 무응답 → 타임아웃으로 503 (모니터를 영원히 기다리게 하지 않는다)', async () => {
    vi.useFakeTimers();
    const fetch = (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    });
    const res = fakeRes();
    const p = handler({}, res, { fetch });
    await vi.advanceTimersByTimeAsync(3001);
    await p;
    expect(res.code).toBe(503);
    expect(JSON.parse(res.body).db).toEqual({ ok: false, reason: 'timeout' });
  });

  it('환경변수 미설정 → 503 unconfigured (프로브 시도 없음)', async () => {
    delete process.env.VITE_SUPABASE_URL;
    const fetch = vi.fn();
    const res = fakeRes();
    await handler({}, res, { fetch });
    expect(res.code).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).db).toEqual({ ok: false, reason: 'unconfigured' });
  });
});
