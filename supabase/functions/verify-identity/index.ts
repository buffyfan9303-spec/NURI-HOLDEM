import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle } from './logic.ts';

// NURI HOLDEM — PortOne V2 본인인증 교차검증 + CI 기반 1인 1계정 + 만19세 게이트.
// 판정은 전부 ./logic.ts(단위 테스트: src/api/verifyIdentity.test.ts). 여기는 Supabase·PortOne 배선만.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const ANON = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PORTONE = Deno.env.get('PORTONE_V2_API_SECRET');

Deno.serve((req: Request) => handle(req, {
  portoneConfigured: !!PORTONE,
  supabaseConfigured: !!(SUPABASE_URL && ANON && SERVICE),
  async getUserId(authHeader) {
    const userClient = createClient(SUPABASE_URL!, ANON!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error } = await userClient.auth.getUser();
    return error || !user ? null : user.id;
  },
  async consumeQuota(userId, limit) {
    const admin = createClient(SUPABASE_URL!, SERVICE!);
    const { data, error } = await admin.rpc('consume_ai_quota', { p_user_id: userId, p_kind: 'identity', p_limit: limit });
    if (error || !data) { console.error('[verify-identity] consume_ai_quota', error); return null; }
    return { ok: !!(data as { ok?: boolean }).ok };
  },
  lookup: (id, qs = '') =>
    fetch(`https://api.portone.io/identity-verifications/${encodeURIComponent(id)}${qs}`, {
      headers: { Authorization: `PortOne ${PORTONE}` },
    }),
  async commit(p) {
    const admin = createClient(SUPABASE_URL!, SERVICE!);
    const { data, error } = await admin.rpc('verify_identity_commit', p);
    return { data, error };
  },
  // 2026-10-06 P2-6 — 만 19세 미만 확인 시 이용 제한 + 관리자 알림(20261006n restrict_underage_account · service_role 전용).
  async restrictUnderage(userId) {
    const admin = createClient(SUPABASE_URL!, SERVICE!);
    const { error } = await admin.rpc('restrict_underage_account', { p_uid: userId });
    return { error };
  },
  log: (...a) => console.error(...a),
}));
