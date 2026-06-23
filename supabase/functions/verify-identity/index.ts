import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// NURI HOLDEM — PortOne V2 본인인증 교차검증 + CI 기반 1인 1계정 + 만19세 게이트.
// CI/실명/전화/생년/성별/통신사 추출·저장은 서버에서만. 클라이언트는 식별자만 전달.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function ageFrom(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST만 허용됩니다.' }, 405);
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const ANON = Deno.env.get('SUPABASE_ANON_KEY');
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const PORTONE = Deno.env.get('PORTONE_V2_API_SECRET');
    if (!PORTONE) return json({ error: '본인인증 미설정: PORTONE_V2_API_SECRET 시크릿을 등록하세요.' }, 503);
    if (!SUPABASE_URL || !ANON || !SERVICE) return json({ error: '서버 설정 오류' }, 500);

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: '로그인이 필요합니다.' }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const idv = typeof body.identityVerificationId === 'string' ? body.identityVerificationId
      : (typeof body.identity_id === 'string' ? body.identity_id : (typeof body.tx_id === 'string' ? body.tx_id : ''));
    if (!idv) return json({ error: 'identityVerificationId가 필요합니다.' }, 400);

    // PortOne V2 REST 교차검증(Secret)
    const pres = await fetch(`https://api.portone.io/identity-verifications/${encodeURIComponent(idv)}`, {
      headers: { Authorization: `PortOne ${PORTONE}` },
    });
    if (!pres.ok) {
      const t = await pres.text();
      return json({ error: '본인인증 조회 실패', detail: t.slice(0, 300) }, 502);
    }
    const iv = await pres.json();
    if (iv?.status !== 'VERIFIED') return json({ error: '본인인증이 완료되지 않았습니다.' }, 400);
    const vc = iv.verifiedCustomer ?? {};
    const ci: string | undefined = vc.ci;
    if (!ci) return json({ error: '인증 정보(CI)를 확인할 수 없습니다.' }, 422);

    // 만 19세 게이트(청소년보호법·게임산업법)
    const birth: string | null = vc.birthDate ?? null;
    const age = ageFrom(birth);
    if (age !== null && age < 19) return json({ error: '만 19세 이상만 이용할 수 있습니다.' }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: dup } = await admin.from('profiles').select('id').eq('ci', ci).neq('id', user.id).limit(1).maybeSingle();
    if (dup) return json({ error: '이미 가입된 명의입니다.' }, 409);

    const { error: upErr } = await admin.from('profiles').update({
      ci,
      real_name: vc.name ?? null,
      phone: vc.phoneNumber ?? null,
      birth_date: birth,
      gender: vc.gender ?? null,
      carrier: vc.operator ?? null,
      verified_at: new Date().toISOString(),
    }).eq('id', user.id);
    if (upErr) {
      if (upErr.code === '23505' || /duplicate|unique/i.test(upErr.message || '')) return json({ error: '이미 가입된 명의입니다.' }, 409);
      return json({ error: '저장 실패', detail: upErr.message }, 500);
    }
    return json({ ok: true, name: vc.name ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
