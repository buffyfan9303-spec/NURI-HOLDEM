// kakao-unlink — 탈퇴 회원의 카카오 연결 끊기. 판정은 전부 ./logic.ts(단위 테스트: src/api/kakaoUnlink.test.ts). 여기는 Supabase·카카오 배선만.
// 비밀: KAKAO_ADMIN_KEY(카카오 앱 어드민 키 — Supabase secrets 에만, VITE_* 금지). 크론 시크릿은 Vault push_shared_secret(get_push_shared_secret).
// 배포: supabase functions deploy kakao-unlink   (verify_jwt 기본값 true 그대로 — 앱은 사용자 JWT, 크론은 공개 anon JWT 를 싣는다.
//       verify_jwt 는 게이트가 아니다. 게이트는 logic.ts 첫 분기의 getUser / x-nuri-cron-secret 이다)
// 선행: supabase/migrations/20261007kb_kakao_unlink_queue.sql
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, makeLimiter, PER_MINUTE, UNLINK_URL, MAX_ATTEMPTS } from './logic.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const anon = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
const allow = makeLimiter(PER_MINUTE);

let secret = '';

Deno.serve((req) => handle(req, {
  adminKey: Deno.env.get('KAKAO_ADMIN_KEY'),
  async cronSecret() {
    if (secret) return secret;
    const { data } = await admin.rpc('get_push_shared_secret');
    if (typeof data === 'string' && data.length > 0) secret = data;
    return secret;
  },
  async getUserId(token) {
    const { data, error } = await anon.auth.getUser(token);
    return error ? null : data?.user?.id ?? null;
  },
  async getRole(uid) {
    const { data } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle();
    return data?.role ?? null;
  },
  async getKakaoId(uid) {
    const { data, error } = await admin.auth.admin.getUserById(uid);
    if (error) throw error;
    const i = data?.user?.identities?.find((x) => x.provider === 'kakao');
    if (!i) return null;
    // auth.identities.provider_id = 카카오 id_token 의 sub = 회원번호
    return String((i.identity_data as Record<string, unknown> | undefined)?.sub ?? i.id ?? '');
  },
  async unlink(kakaoId, adminKey) {
    const r = await fetch(UNLINK_URL, {
      method: 'POST',
      headers: { Authorization: `KakaoAK ${adminKey}`, 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({ target_id_type: 'user_id', target_id: kakaoId }),
      signal: AbortSignal.timeout(8000),
    });
    await r.body?.cancel();   // 본문(회원번호·카카오 원문)은 읽지도 남기지도 않는다
    return r.status;
  },
  async record(kakaoId, userId, ok, status) {
    const { error } = await admin.rpc('kakao_unlink_record', { p_provider_id: kakaoId, p_user_id: userId, p_ok: ok, p_status: status });
    if (error) throw error;
  },
  async pending() {
    const { data, error } = await admin.from('kakao_unlink_queue')
      .select('provider_id,user_id,attempts').is('done_at', null).lt('attempts', MAX_ATTEMPTS).order('created_at').limit(50);
    if (error) throw error;
    return data ?? [];
  },
  allow,
  log: (...a) => console.error(...a),
}));
