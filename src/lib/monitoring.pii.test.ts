// 2026-10-01 독립 검토 병합 조건 1 — Sentry 로 나가는 payload 에 개인정보 0.
//   증거: review-dberror-1001.md §3 — 23502 의 details `Failing row contains (…)` 가 profiles 행 전체(전화·이메일·ci_hash)를 싣고,
//   새 logInternal 이 그 details 를 Sentry 로 보냈다. 막는 길 둘: ① logInternal 이 원문을 아예 안 보낸다(1차)
//   ② monitoring.ts beforeSend 스크러빙이 앱 전체 이벤트(콘솔 breadcrumb 포함)를 닦는다(2차).
//   음성 대조: ① dbError.ts logInternal 의 extra 에 raw 를 다시 싣거나 ② monitoring.ts 의 `beforeSend: scrubSentryEvent` 줄을 지우면 빨개진다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrubPii, scrubSentryEvent } from './monitoring';

const EMAIL = 'victim.kim@example.com';
const PHONE_A = '010-1234-5678';
const PHONE_B = '+82 10-9876-5432';
const PHONE_C = '01055556666';
// 가짜 JWT(예제 값) — 비밀 탐지기가 소스 글자를 토큰으로 오인하지 않게 실행할 때 조립한다.
const b64u = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const JWT = [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ sub: '1234567890', role: 'anon' }), 'c2lnbmF0dXJlLW5vdC1yZWFs'].join('.');
const CI_HASH = 'a3f5c9e1b7d24680a3f5c9e1b7d24680a3f5c9e1b7d24680a3f5c9e1b7d24680';
const UID = '8f1c2d3e-4a5b-4c6d-8e7f-1234567890ab';
const ROW = `Failing row contains (${UID}, 홍길동, ${PHONE_A}, ${EMAIL}, ${CI_HASH}, null).`;
const KEY = `Key (phone)=(${PHONE_A}) already exists.`;

/** 위 개인정보 조각이 하나라도 남아 있으면 그 조각을 돌려준다. */
function leaks(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  return [EMAIL, PHONE_A, '10-9876-5432', PHONE_C, JWT, 'eyJhbGci', CI_HASH, '홍길동'].filter((p) => text.includes(p));
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('@sentry/react'); vi.restoreAllMocks(); });

describe('① scrubSentryEvent — 앱 전체 Sentry 이벤트의 개인정보 0', () => {
  it('Failing row contains (…) — 행 전체를 끝까지 지운다(전화·이메일·ci_hash·이름)', () => {
    const out = scrubPii(`null value in column "phone" of relation "profiles" violates not-null constraint\nDetail: ${ROW}`);
    expect(leaks(out)).toEqual([]);
    expect(out).toContain('Failing row contains (***)');
  });

  it('Key (col)=(값) — 컬럼=값 쌍', () => {
    const out = scrubPii(KEY);
    expect(leaks(out)).toEqual([]);
    expect(out).toContain('Key (***)=(***)');
  });

  it('이메일·전화(010·+82·붙여쓰기)·JWT·Bearer 토큰', () => {
    const out = scrubPii(`mail ${EMAIL} tel ${PHONE_A} / ${PHONE_B} / ${PHONE_C} Authorization: Bearer ${JWT} token=${JWT}`);
    expect(leaks(out)).toEqual([]);
    expect(out).not.toMatch(/9876|5555|6666/);
  });

  it('이벤트 구조 전체 — message·exception·extra·breadcrumbs(콘솔 warn 포함)·user·중첩 배열', () => {
    const event = {
      event_id: '0123456789abcdef0123456789abcdef',
      message: `[db] ${ROW}`,
      exception: { values: [{ type: 'Error', value: `저장 실패 ${EMAIL}` }] },
      extra: { code: '23502', raw: ROW, nested: { list: [KEY, { deep: `tel ${PHONE_A}` }] } },
      breadcrumbs: [
        { category: 'console', level: 'warning', message: `[db] 23502 ${ROW}`, data: { arguments: ['[db]', '23502', ROW] } },
        { category: 'fetch', data: { url: `https://x.supabase.co/rest/v1/profiles?phone=eq.${PHONE_C}&email=eq.${EMAIL}` } },
      ],
      request: { headers: { Authorization: `Bearer ${JWT}`, apikey: JWT } },
      user: { id: 'u1', email: EMAIL, ip_address: '1.2.3.4', username: '홍길동' },
    };
    const out = scrubSentryEvent(event);
    expect(leaks(out)).toEqual([]);
    expect(out.user).toEqual({ id: 'u1' });                    // 식별 id 는 남기고 email·ip·이름은 지운다
    expect(out.event_id).toBe(event.event_id);                 // 이벤트 id 는 훼손하지 않는다
    expect(event.extra.raw).toBe(ROW);                         // 입력 객체를 바꾸지 않는다(복사본을 돌려준다)
  });

  it('정상 문장·숫자는 건드리지 않는다(과잉 마스킹 방지)', () => {
    const ok = { message: '12초 뒤에 다시 올릴 수 있습니다', extra: { code: '23502', n: 1759312345123, ts: '2026-10-01T09:00:00Z' } };
    expect(scrubSentryEvent(ok)).toEqual(ok);
  });
});

describe('② Sentry 로 가는 실제 경로', () => {
  it('logInternal — 23502 + Failing row details 를 msgOf 에 넣으면 captureMessage payload 에 개인정보 0', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://k@o0.ingest.sentry.io/1');
    vi.resetModules();
    const captureMessage = vi.fn();
    vi.doMock('@sentry/react', () => ({ captureMessage }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { msgOf } = await import('./dbError');
    const out = msgOf({ code: '23502', message: 'null value in column "phone" of relation "profiles" violates not-null constraint', details: ROW }, '가입 실패');
    expect(out).toBe('가입 실패');                              // 화면에도 안 나간다
    await vi.waitFor(() => expect(captureMessage).toHaveBeenCalled());
    expect(captureMessage.mock.calls.length).toBe(1);
    expect(leaks(captureMessage.mock.calls)).toEqual([]);
    expect(JSON.stringify(captureMessage.mock.calls)).not.toMatch(/Failing row|profiles|phone/);   // details·원문 자체를 안 보낸다
    expect(JSON.stringify(captureMessage.mock.calls)).toContain('23502');                            // 분류(코드)는 남는다
  });

  it('initMonitoring — Sentry.init 에 beforeSend·beforeBreadcrumb 가 걸려 있고, 걸린 함수가 PII 를 지운다', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://k@o0.ingest.sentry.io/1');
    vi.resetModules();
    const init = vi.fn();
    vi.doMock('@sentry/react', () => ({ init }));
    const { initMonitoring } = await import('./monitoring');
    initMonitoring();
    await vi.waitFor(() => expect(init).toHaveBeenCalled());
    const cfg = init.mock.calls[0][0] as { beforeSend?: (e: object) => object; beforeBreadcrumb?: (b: object) => object };
    expect(typeof cfg.beforeSend).toBe('function');
    expect(typeof cfg.beforeBreadcrumb).toBe('function');
    const sent = cfg.beforeSend!({ message: ROW, extra: { details: ROW, mail: EMAIL }, user: { email: EMAIL } });
    expect(leaks(sent)).toEqual([]);
    expect(leaks(cfg.beforeBreadcrumb!({ category: 'console', message: `[db] 23502 ${ROW}` }))).toEqual([]);
  });
});
