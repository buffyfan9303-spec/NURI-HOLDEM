import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handle, makeLimiter, TOKEN_URL } from './logic.ts';

// NURI HOLDEM — 카카오 로그인(OpenID Connect) 인가 주소 발급 + 코드→id_token 교환. 판정은 전부 ./logic.ts.
// 비밀은 Supabase secrets 에만 둔다: KAKAO_REST_API_KEY · KAKAO_CLIENT_SECRET (VITE_* 금지 — 번들에 박힌다).
// 배포: supabase functions deploy kakao-oidc-exchange --no-verify-jwt  (supabase/config.toml 에도 같은 값)
const allow = makeLimiter();

Deno.serve((req: Request) => handle(req, {
  restApiKey: Deno.env.get('KAKAO_REST_API_KEY'),
  clientSecret: Deno.env.get('KAKAO_CLIENT_SECRET'),
  postToken: (body) => fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
    signal: AbortSignal.timeout(8000),
  }),
  allow,
  log: (...a) => console.error(...a),
}));
