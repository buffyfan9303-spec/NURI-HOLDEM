// kakao-oidc-exchange 판정부 — 카카오 로그인(OpenID Connect)의 서버 쪽 두 단계. 배선은 ./index.ts,
// 단위 테스트는 src/api/kakaoOidcExchange.test.ts(이 파일을 그대로 import 한다).
//
// 왜 이 함수가 있나 (리드 결정 2026-10-07, B안):
//   Supabase 의 카카오 OAuth 공급자는 scope 에 account_email 을 **항상** 넣는다(supabase/auth internal/api/provider/kakao.go —
//   기본 scope 목록 + 추가 scope 는 덧붙기만 한다). account_email 은 비즈 앱만 설정할 수 있고, 우리 앱의 비즈 앱 전환은 거절됐다
//   (docs/legal/kakao-appreview-2026-09-24/01-재심사-소명서.md). 설정 안 된 항목을 요청하면 카카오가 KOE205 로 막는다.
//   → 우리가 직접 openid profile_nickname profile_image 만 요청하고, 받은 id_token 을 supabase.auth.signInWithIdToken 에 넘긴다.
//
// 두 단계
//   start    { action:'start', state, nonceHash } → { url }       카카오 인가 주소(REST API 키는 서버에만 있다)
//   exchange { action:'exchange', code }          → { id_token }  인가 코드 → id_token. access/refresh 토큰은 돌려주지 않는다.
//
// 보안(CLAUDE.md 보안 표준 4·6)
//   · 호출자는 아직 로그인 전이라 익명이다 — verify_jwt 는 끈다(supabase/config.toml). verify_jwt 는 anon 키 JWT 도 통과시키므로
//     어차피 게이트가 아니다. 대신 ① Origin 허용 목록 ② 입력 형식 ③ IP 당 분당 상한 ④ 카카오가 code·redirect_uri·client_secret 을 검증한다.
//   · redirect_uri 는 **클라이언트가 보내지 않는다.** 허용된 Origin 에서 서버가 정한다(열린 리다이렉트·코드 탈취 방지).
//   · 응답·로그에 카카오 원문(error_description)·비밀·토큰을 싣지 않는다. 로그는 상태 코드와 KOE 코드 모양만.

export const ALLOWED_ORIGINS = ['https://nuriholdem.com', 'https://www.nuriholdem.com'] as const;
export const CALLBACK_PATH = '/auth/kakao';
// 🔴 account_email 을 넣지 않는다 — 넣으면 자동 계정 병합 위험이 생긴다.
//   GoTrue 는 카카오가 준 이메일을 Verified:true 로 받아(supabase/auth internal/api/provider/oidc.go) 같은 이메일의
//   기존 이메일·구글 계정에 카카오 identity 를 자동으로 붙인다 — 남의 이메일로 카카오 계정을 만든 사람이 그 계정에 들어간다.
//   테스트(src/api/kakaoOidcExchange.test.ts)가 이 값에 account_email 이 없음을 고정한다(critical-211 P3-5).
export const SCOPE = 'openid profile_nickname profile_image';
export const AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
export const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
/** IP 당 분당 호출 상한(start + exchange 합산). 정상 로그인은 한 번에 2회다. */
export const PER_MINUTE = 20;

const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const NONCE_HASH_RE = /^[0-9a-f]{64}$/; // sha256 hex — Supabase 가 원문 nonce 를 sha256 hex 로 바꿔 id_token 의 nonce 와 비교한다
const CODE_RE = /^[A-Za-z0-9_-]{10,512}$/;
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface Deps {
  restApiKey: string | undefined;
  clientSecret: string | undefined;
  /** POST TOKEN_URL — 테스트는 가짜를 넣는다 */
  postToken(body: URLSearchParams): Promise<Response>;
  /** 분당 상한 — true 면 통과 */
  allow(ip: string): boolean;
  log(...a: unknown[]): void;
}

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(origin: string | null, obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

const IP_RE = /^[0-9A-Fa-f:.]{2,45}$/;
let warnedNoCf = false;

/**
 * 분당 상한의 키(요청자 IP) — critical-211 P3-2.
 * x-forwarded-for **첫 값**은 호출자가 적어 보낸 값이 그대로 앞에 남는다(Cloudflare 는 뒤에 덧붙이기만 한다) → 매번 바꾸면 상한이 무력하다.
 * cf-connecting-ip 는 Cloudflare 가 직접 채우는 값이라 호출자가 바꿀 수 없다. 우리 함수 주소(*.supabase.co)는 Cloudflare 뒤에 있다
 * (2026-10-07 실측: functions/v1 응답에 `Server: cloudflare`·`CF-Ray`).
 * ⚠ 그 헤더가 엣지 런타임까지 **전달되는지**는 공식 문서·라이브 배포로 확인하지 못했다(NOT_RUN). 없으면 x-forwarded-for 첫 값으로
 *   돌아가고 그때 상한은 **대략적**이다(위조 가능) — 데이터 피해는 없고 카카오 빈도 제한(KOE237)에 걸려 카카오 로그인만 멈추는 정도다.
 *   그 경우를 알 수 있게 인스턴스당 한 번 로그를 남긴다(IP 값은 남기지 않는다).
 */
export function clientIp(req: Request, log?: (...a: unknown[]) => void): string {
  const cf = (req.headers.get('cf-connecting-ip') ?? '').trim();
  if (IP_RE.test(cf)) return cf;
  if (!warnedNoCf && log) { warnedNoCf = true; log('[kakao-oidc] cf-connecting-ip 없음 — 분당 상한이 x-forwarded-for 첫 값(위조 가능) 기준으로 대략적이다'); }
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}

/** id_token 페이로드의 nonce 클레임 — 서명 검증은 signInWithIdToken(GoTrue)이 한다. 여기는 '있고 우리 형식인가'만 본다. */
export function idTokenNonce(idToken: string): string | null {
  try {
    const b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))));
    return typeof p?.nonce === 'string' ? p.nonce : null;
  } catch { return null; }
}

/**
 * IP 당 고정 창(60초) 카운터.
 * ponytail: 엣지 인스턴스(isolate)마다 따로 센다 — 인스턴스가 여럿 뜨면 실제 상한은 N배다.
 *   막는 대상은 '잘못된 코드로 카카오 토큰 엔드포인트를 두드려 우리 앱 키를 KOE237(빈도 제한)에 걸리게 하는' 남용이고,
 *   카카오가 코드를 검증하므로 통과해도 얻는 것은 없다. 인스턴스 공유 상한이 필요해지면 DB 카운터 RPC 로 바꾼다.
 */
export function makeLimiter(perMinute = PER_MINUTE, now: () => number = Date.now) {
  const hits = new Map<string, { start: number; n: number }>();
  return (ip: string): boolean => {
    const t = now();
    const h = hits.get(ip);
    if (!h || t - h.start >= 60_000) {
      if (hits.size > 5000) hits.clear(); // 메모리 상한 — 지우면 그 순간만 느슨해진다
      hits.set(ip, { start: t, n: 1 });
      return true;
    }
    h.n += 1;
    return h.n <= perMinute;
  };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json(origin, { error: 'POST만 허용됩니다.' }, 405);
  if (!origin || !(ALLOWED_ORIGINS as readonly string[]).includes(origin)) return json(origin, { error: '허용되지 않은 요청입니다.' }, 403);
  if (!deps.restApiKey || !deps.clientSecret) {
    deps.log('[kakao-oidc] KAKAO_REST_API_KEY/KAKAO_CLIENT_SECRET 미설정');
    return json(origin, { error: '카카오 로그인이 아직 준비되지 않았습니다.', code: 'not_configured' }, 503);
  }
  if (!deps.allow(clientIp(req, deps.log))) return json(origin, { error: '잠시 후 다시 시도해 주세요.', code: 'rate_limited' }, 429);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(origin, { error: '잘못된 요청입니다.' }, 400); }
  if (!body || typeof body !== 'object') return json(origin, { error: '잘못된 요청입니다.' }, 400);
  const redirectUri = origin + CALLBACK_PATH;

  if (body.action === 'start') {
    const state = body.state, nonceHash = body.nonceHash;
    if (typeof state !== 'string' || !STATE_RE.test(state) || typeof nonceHash !== 'string' || !NONCE_HASH_RE.test(nonceHash)) {
      return json(origin, { error: '잘못된 요청입니다.' }, 400);
    }
    const u = new URL(AUTHORIZE_URL);
    u.searchParams.set('client_id', deps.restApiKey);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPE);
    u.searchParams.set('state', state);
    u.searchParams.set('nonce', nonceHash);
    return json(origin, { url: u.toString() });
  }

  if (body.action === 'exchange') {
    const code = body.code;
    if (typeof code !== 'string' || !CODE_RE.test(code)) return json(origin, { error: '잘못된 요청입니다.' }, 400);
    let res: Response;
    try {
      res = await deps.postToken(new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: deps.restApiKey,
        redirect_uri: redirectUri,
        code,
        client_secret: deps.clientSecret,
      }));
    } catch {
      deps.log('[kakao-oidc] token fetch 실패');
      return json(origin, { error: '카카오 로그인을 완료하지 못했습니다. 다시 시도해 주세요.' }, 502);
    }
    let tok: Record<string, unknown> = {};
    try { tok = await res.json(); } catch { /* 본문 없음 */ }
    if (!res.ok) {
      const err = typeof tok.error === 'string' ? tok.error.slice(0, 40) : '';
      const koe = typeof tok.error_code === 'string' && /^KOE\d{3}$/.test(tok.error_code) ? tok.error_code : '';
      deps.log('[kakao-oidc] token 거절', { status: res.status, error: err, koe });
      // invalid_grant = 코드 만료·재사용·redirect_uri 불일치 — 사용자가 할 수 있는 일은 다시 시도뿐이다
      return err === 'invalid_grant'
        ? json(origin, { error: '로그인 시간이 지났습니다. 다시 시도해 주세요.', code: 'expired' }, 400)
        : json(origin, { error: '카카오 로그인을 완료하지 못했습니다. 다시 시도해 주세요.' }, 502);
    }
    const idToken = tok.id_token;
    if (typeof idToken !== 'string' || !JWT_RE.test(idToken)) {
      // openid scope 를 보냈는데 id_token 이 없다 = 콘솔에서 OpenID Connect 가 꺼져 있다
      deps.log('[kakao-oidc] id_token 없음 — 콘솔 OpenID Connect 활성화 확인');
      return json(origin, { error: '카카오 로그인이 아직 준비되지 않았습니다.', code: 'not_configured' }, 503);
    }
    // critical-211 P3-1: nonce 없는 id_token 은 돌려주지 않는다. GoTrue 는 토큰과 요청 **양쪽에** nonce 가 없으면 비교를 건너뛴다
    //   (token_oidc.go — tokenHasNonce != paramsHasNonce 일 때만 거절). 우리 버튼은 늘 nonce 를 넣지만, 공개된 client_id 로
    //   nonce 없는 인가 주소를 만들어 받은 코드가 새면 nonce 가 막지 못한다. 우리 형식(sha256 hex 64자)만 통과시킨다.
    if (!NONCE_HASH_RE.test(idTokenNonce(idToken) ?? '')) {
      deps.log('[kakao-oidc] id_token nonce 없음·형식 불일치 — 거절');
      return json(origin, { error: '카카오 로그인을 완료하지 못했습니다. 다시 시도해 주세요.', code: 'invalid' }, 400);
    }
    return json(origin, { id_token: idToken });
  }

  return json(origin, { error: '잘못된 요청입니다.' }, 400);
}
