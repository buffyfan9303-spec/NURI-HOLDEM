// 카카오 OIDC 엣지 함수(kakao-oidc-exchange) — 판정부를 **같은 파일 그대로** import 해 잰다(verifyIdentity.test.ts 와 같은 방식).
// 잠그는 것: Origin 허용 목록 · redirect_uri 를 서버가 정함 · scope 에 account_email 없음 · 입력 형식 · 분당 상한 ·
//           응답은 id_token 만(access/refresh 없음) · 카카오 원문·비밀이 응답에 안 실림.
// 실행: npx vitest run src/api/kakaoOidcExchange.test.ts
import { describe, it, expect } from 'vitest';
import { handle, makeLimiter, clientIp, SCOPE, type Deps } from '../../supabase/functions/kakao-oidc-exchange/logic.ts';

const OK_ORIGIN = 'https://nuriholdem.com';
// 가짜 JWT(예제 값, 서명 'sig') — 비밀 탐지기가 소스 글자를 토큰으로 오인하지 않게 실행할 때 조립한다.
const b64u = (s: string) => Buffer.from(s).toString('base64url');
const jwtRaw = (payloadText: string) => [b64u('{"alg":"RS256"}'), b64u(payloadText), 'c2ln'].join('.');
const jwt = (payload: unknown) => jwtRaw(JSON.stringify(payload));
const ID_TOKEN = jwt({ sub: '1', nonce: 'b'.repeat(64), nickname: '누리' });
const tokenResp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function world(over: Partial<Deps> = {}) {
  const sent: URLSearchParams[] = [];
  const logs: unknown[][] = [];
  const deps: Deps = {
    restApiKey: 'REST_KEY_X', clientSecret: 'SECRET_Y',
    postToken: async (b) => { sent.push(b); return tokenResp(200, { id_token: ID_TOKEN, access_token: 'AT', refresh_token: 'RT', token_type: 'bearer' }); },
    allow: () => true,
    log: (...a) => { logs.push(a); },
    ...over,
  };
  return { deps, sent, logs };
}
const post = (body: unknown, origin: string | null = OK_ORIGIN, ip = '1.1.1.1') => new Request('https://x/functions/v1/kakao-oidc-exchange', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...(origin ? { Origin: origin } : {}) },
  body: JSON.stringify(body),
});
const run = async (w: ReturnType<typeof world>, req: Request) => {
  const r = await handle(req, w.deps);
  const text = await r.text();
  return { status: r.status, body: JSON.parse(text) as Record<string, unknown>, text, acao: r.headers.get('access-control-allow-origin') };
};
const START = { action: 'start', state: 'S'.repeat(32), nonceHash: 'a'.repeat(64) };

describe('start — 인가 주소', () => {
  it('허용 Origin 이면 카카오 인가 주소를 만든다 — redirect_uri 는 서버가 Origin 으로 정하고 scope 에 account_email 이 없다', async () => {
    const r = await run(world(), post(START));
    expect(r.status).toBe(200);
    expect(r.acao).toBe(OK_ORIGIN);
    const u = new URL(String(r.body.url));
    expect(u.origin + u.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('REST_KEY_X');
    expect(u.searchParams.get('redirect_uri')).toBe('https://nuriholdem.com/auth/kakao');
    expect(u.searchParams.get('scope')).toBe('openid profile_nickname profile_image');
    expect(SCOPE).not.toMatch(/account_email/);
    expect(u.searchParams.get('nonce')).toBe('a'.repeat(64));
    expect(u.searchParams.get('state')).toBe('S'.repeat(32));
  });

  it('www 에서 오면 www 콜백으로', async () => {
    const r = await run(world(), post(START, 'https://www.nuriholdem.com'));
    expect(new URL(String(r.body.url)).searchParams.get('redirect_uri')).toBe('https://www.nuriholdem.com/auth/kakao');
  });

  it('클라이언트가 redirect_uri 를 보내도 무시한다(열린 리다이렉트·코드 탈취 방지)', async () => {
    const r = await run(world(), post({ ...START, redirect_uri: 'https://evil.example/cb' }));
    expect(new URL(String(r.body.url)).searchParams.get('redirect_uri')).toBe('https://nuriholdem.com/auth/kakao');
  });

  it.each([
    ['다른 Origin', post(START, 'https://evil.example')],
    ['Origin 없음', post(START, null)],
    ['비슷한 도메인', post(START, 'https://nuriholdem.com.evil.example')],
  ])('%s → 403, CORS 허용 헤더 없음', async (_n, req) => {
    const r = await run(world(), req);
    expect(r.status).toBe(403);
    expect(r.acao).toBeNull();
  });

  it.each([
    ['짧은 state', { ...START, state: 'abc' }],
    ['state 에 특수문자', { ...START, state: 'S'.repeat(20) + '"><' }],
    ['nonce 해시 길이', { ...START, nonceHash: 'a'.repeat(63) }],
    ['nonce 원문을 보냄', { ...START, nonceHash: 'NOT-A-HASH-'.repeat(6) }],
    ['action 없음', { state: START.state, nonceHash: START.nonceHash }],
  ])('%s → 400', async (_n, body) => {
    expect((await run(world(), post(body))).status).toBe(400);
  });
});

describe('exchange — 코드 → id_token', () => {
  it('id_token 만 돌려준다 — access/refresh 토큰은 응답 어디에도 없다', async () => {
    const w = world();
    const r = await run(w, post({ action: 'exchange', code: 'C'.repeat(86) }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id_token: ID_TOKEN });
    expect(r.text).not.toMatch(/"AT"|"RT"|access_token|refresh_token/);
    // 카카오에 보낸 값 — redirect_uri 는 서버가 정한 값, 비밀은 서버 env
    const b = w.sent[0];
    expect(Object.fromEntries(b)).toEqual({
      grant_type: 'authorization_code', client_id: 'REST_KEY_X', redirect_uri: 'https://nuriholdem.com/auth/kakao',
      code: 'C'.repeat(86), client_secret: 'SECRET_Y',
    });
  });

  it.each([
    ['빈 코드', ''], ['짧은 코드', 'abc'], ['특수문자', 'C'.repeat(20) + '&x=1'], ['너무 긴 코드', 'C'.repeat(600)],
  ])('%s → 400, 카카오를 부르지 않는다', async (_n, code) => {
    const w = world();
    expect((await run(w, post({ action: 'exchange', code }))).status).toBe(400);
    expect(w.sent).toHaveLength(0);
  });

  it('카카오 거절(invalid_grant) — 사람 말 문장만, 원문·비밀 없음', async () => {
    const w = world({ postToken: async () => tokenResp(400, { error: 'invalid_grant', error_description: 'ZZLEAK authorization code not found', error_code: 'KOE320' }) });
    const r = await run(w, post({ action: 'exchange', code: 'C'.repeat(40) }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('expired');
    expect(r.text).not.toMatch(/ZZLEAK|KOE320|SECRET_Y|REST_KEY_X/);
    expect(JSON.stringify(w.logs)).not.toMatch(/ZZLEAK|SECRET_Y/); // 로그에도 원문·비밀을 남기지 않는다
  });

  it('카카오가 id_token 없이 답하면(콘솔 OpenID Connect 꺼짐) not_configured', async () => {
    const w = world({ postToken: async () => tokenResp(200, { access_token: 'AT' }) });
    const r = await run(w, post({ action: 'exchange', code: 'C'.repeat(40) }));
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('not_configured');
    expect(r.text).not.toMatch(/"AT"/);
  });

  // critical-211 P3-1 — GoTrue 는 토큰·요청 양쪽에 nonce 가 없으면 비교를 건너뛴다. nonce 없는 인가 주소로 받은 코드를 막는 한 겹.
  it.each([
    ['nonce 클레임 없음', jwt({ sub: '1' })],
    ['nonce 가 원문(해시 아님)', jwt({ sub: '1', nonce: 'raw-nonce-value' })],
    ['nonce 대문자 hex', jwt({ sub: '1', nonce: 'B'.repeat(64) })],
    ['페이로드가 JSON 아님', jwtRaw('not-json')],
  ])('%s → 400, id_token 을 돌려주지 않는다', async (_n, tok) => {
    const w = world({ postToken: async () => tokenResp(200, { id_token: tok }) });
    const r = await run(w, post({ action: 'exchange', code: 'C'.repeat(40) }));
    expect(r.status).toBe(400);
    expect(r.text).not.toContain(tok);
  });

  it('네트워크 실패 → 502 고정 문장', async () => {
    const w = world({ postToken: async () => { throw new Error('ZZLEAK socket'); } });
    const r = await run(w, post({ action: 'exchange', code: 'C'.repeat(40) }));
    expect(r.status).toBe(502);
    expect(r.text).not.toMatch(/ZZLEAK/);
  });
});

describe('설정·남용', () => {
  it('비밀이 없으면 503 not_configured — 카카오를 부르지 않는다', async () => {
    const w = world({ clientSecret: undefined });
    const r = await run(w, post({ action: 'exchange', code: 'C'.repeat(40) }));
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('not_configured');
    expect(w.sent).toHaveLength(0);
  });

  it('분당 상한 — 같은 IP 21번째부터 429, 다른 IP 는 통과, 1분 뒤 다시 통과', async () => {
    let t = 0;
    const allow = makeLimiter(20, () => t);
    const w = world({ allow });
    for (let i = 0; i < 20; i++) expect((await run(w, post(START))).status).toBe(200);
    expect((await run(w, post(START))).status).toBe(429);
    expect((await run(w, post(START, OK_ORIGIN, '2.2.2.2'))).status).toBe(200);
    t = 60_000;
    expect((await run(w, post(START))).status).toBe(200);
  });

  // critical-211 P3-2 — x-forwarded-for 첫 값은 호출자가 마음대로 적는다. Cloudflare 가 채우는 cf-connecting-ip 를 키로 쓴다.
  it('x-forwarded-for 를 매번 바꿔도 cf-connecting-ip 가 같으면 21번째부터 429', async () => {
    const w = world({ allow: makeLimiter(20, () => 0) });
    const spoof = (i: number) => new Request('https://x/functions/v1/kakao-oidc-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: OK_ORIGIN, 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` },
      body: JSON.stringify(START),
    });
    for (let i = 0; i < 20; i++) expect((await run(w, spoof(i))).status).toBe(200);
    expect((await run(w, spoof(99))).status).toBe(429);
  });

  it('cf-connecting-ip 가 없으면 x-forwarded-for 첫 값으로 돌아가고 그 사실을 로그로 남긴다(IP 값은 안 남김)', () => {
    const logs: unknown[][] = [];
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '198.51.100.9, 10.1.1.1' } });
    expect(clientIp(req, (...a) => logs.push(a))).toBe('198.51.100.9');
    expect(clientIp(new Request('https://x', { headers: { 'cf-connecting-ip': 'not an ip<>', 'x-forwarded-for': '198.51.100.9' } }))).toBe('198.51.100.9');
    expect(JSON.stringify(logs)).not.toContain('198.51.100.9');
  });

  it('OPTIONS 는 허용 Origin 에만 CORS 를 연다', async () => {
    const pre = (o: string) => handle(new Request('https://x', { method: 'OPTIONS', headers: { Origin: o } }), world().deps);
    expect((await pre(OK_ORIGIN)).headers.get('access-control-allow-origin')).toBe(OK_ORIGIN);
    expect((await pre('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull();
  });
});
