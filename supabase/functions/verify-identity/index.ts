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
/** 지금의 **한국 달력 날짜**. UTC 접근자(getUTC*)로 읽으면 KST 연·월·일이 나온다.
 *  (weekly-report/index.ts 의 kstNow 와 같은 관용구 — 엣지 런타임 TZ 는 UTC 다.) */
function kstNow(): Date { return new Date(Date.now() + 9 * 3600_000); }

function ageFrom(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  // ⚠ 반드시 KST 로 센다. 서버 TZ 는 UTC 라 그냥 new Date() 를 쓰면 한국시간 00:00~08:59 동안
  //   '어제'를 오늘로 보고 age-- 가 한 번 더 돈다 — **생일 당일 새벽에 본인인증한 만 19세가 18세로
  //   판정돼 403 으로 거절**됐다(2026-09-11 점검). 한국 서비스의 만 나이는 한국 달력으로 세는 게 맞다.
  //   방향도 확인: KST 날짜 ≥ UTC 날짜라 이 수정은 나이를 **낮추지 않는다** — 미성년이 통과할 길은 생기지 않는다.
  const now = kstNow();
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

    // ── PortOne V2 REST 교차검증(Secret) ──────────────────────────────────────
    // 🔴 2026-09-17 오너 보고: PASS 문자인증까지 **끝낸 뒤** "본인인증 조회 실패".
    //   즉 PortOne 에 VERIFIED 기록은 있는데 **우리가 그걸 못 읽는** 상태다.
    //   원인 후보가 셋인데 화면에서는 전부 같은 문구로 보였다:
    //     ⓐ API Secret 이 무효(없음·V1 키·폐기)      ⓑ 다른 상점의 Secret      ⓒ 상점 지정이 필요한 계정 구조
    //   그래서 **묻지 말고 판별한다.**
    const lookup = (id: string, qs = '') =>
      fetch(`https://api.portone.io/identity-verifications/${encodeURIComponent(id)}${qs}`, {
        headers: { Authorization: `PortOne ${PORTONE}` },
      });

    let pres = await lookup(idv);

    // ⓒ 재시도 — 상점을 명시하면 읽히는 계정이 있다. storeId 는 클라이언트 공개값이고
    //   권한은 어디까지나 우리 Secret 이 쥐고 있으므로 신뢰 경계가 아니다(틀린 값이면 그냥 또 실패한다).
    const storeId = typeof body.storeId === 'string' ? body.storeId : '';
    let viaStore = false;
    if (!pres.ok && storeId) {
      const second = await lookup(idv, `?storeId=${encodeURIComponent(storeId)}`);
      if (second.ok) { pres = second; viaStore = true; console.warn('[verify-identity] storeId 를 붙여야 읽힌다 — 연동 설정 확인 필요'); }
    }

    if (!pres.ok) {
      // 원문은 서버 로그에만 — 응답에 실으면 로그인 유저 누구나 내부 문구를 탐색할 수 있다(보안 표준 6번).
      const raw = await pres.text();
      let code = `HTTP_${pres.status}`;
      try { const j = JSON.parse(raw); if (typeof j?.type === 'string') code = j.type; } catch { /* JSON 이 아니면 상태코드로 */ }

      // ── 차분 프로브 ──────────────────────────────────────────────────────
      // **일부러 없는 id** 로 같은 Secret 을 한 번 더 던진다. 대조군이 원인을 갈라 준다:
      //   · NOT_FOUND 계열 → Secret 은 **유효**하다(서버가 우리를 인증하고 "그런 건 없다"고 답한 것)
      //     ⇒ 원인은 ⓑ 상점 불일치 또는 그 건 자체
      //   · UNAUTHORIZED/FORBIDDEN → Secret 이 **무효**다 ⇒ 원인은 ⓐ
      // 한 번의 실패가 곧 진단이 되게 한다 — 오너에게 다시 시도해 달라고 부탁하는 왕복을 없앤다.
      let probe = 'skipped';
      try {
        const pr = await lookup('identity-verification-nuri-probe-0000');
        probe = `HTTP_${pr.status}`;
        try { const pj = JSON.parse(await pr.text()); if (typeof pj?.type === 'string') probe = pj.type; } catch { /* noop */ }
      } catch (pe) { probe = `probe_error:${String(pe).slice(0, 40)}`; }

      const secretOk = /NOT_FOUND/i.test(probe);
      console.error('[verify-identity] PortOne 조회 실패', { status: pres.status, code, probe, secretOk, viaStore, storeIdSent: !!storeId, raw: raw.slice(0, 500) });

      // 사용자에게는 **무엇을 해야 하는지**가 다른 두 문장으로 갈라 준다(같은 '실패'가 아니다).
      const hint = secretOk
        ? '인증 기록을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.'   // Secret 유효 → 그 건/상점 문제
        : '본인인증 서버 설정에 문제가 있습니다. 운영자에게 문의해 주세요.'; // Secret 무효 → 우리가 고칠 것
      return json({ error: `${hint} (${code}/${probe})`, code, probe, secretOk }, 502);
    }

    const iv = await pres.json();
    if (iv?.status !== 'VERIFIED') return json({ error: '본인인증이 완료되지 않았습니다.' }, 400);
    const vc = iv.verifiedCustomer ?? {};
    const ci: string | undefined = vc.ci;
    if (!ci) return json({ error: '인증 정보(CI)를 확인할 수 없습니다.' }, 422);

    // 만 19세 게이트(청소년보호법·게임산업법) — fail-closed: 생년 미확인(age null) 시에도 거부(우회 차단).
    const birth: string | null = vc.birthDate ?? null;
    const age = ageFrom(birth);
    if (age === null || age < 19) return json({ error: '만 19세 이상만 이용할 수 있습니다. (생년월일 확인 불가 시 가입 제한)' }, 403);

    // CI 원문은 DB 함수(verify_identity_commit) 트랜잭션 안에서 HMAC 해시로만 저장된다.
    // 중복명의(1인 1계정)·텀스톤 판정도 DB 내부에서 수행 — 원문·페퍼가 함수 밖으로 나가지 않는다.
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: commit, error: cErr } = await admin.rpc('verify_identity_commit', {
      p_uid: user.id,
      p_ci: ci,
      p_name: vc.name ?? null,
      p_phone: vc.phoneNumber ?? null,
      p_birth: birth,
      p_gender: vc.gender ?? null,
      p_carrier: vc.operator ?? null,
      // 인증 ID 일회성(20260904a) — 원문이 아니라 함수 안에서 HMAC 해시로 기록된다.
      // 같은 사용자의 재시도는 멱등 통과, 타인이 탈취해 재사용하면 code=reused 로 거절.
      p_idv: idv,
    });
    if (cErr) { console.error('[verify-identity] verify_identity_commit', cErr); return json({ error: '저장 실패' }, 500); }
    if (!commit?.ok) {
      if (commit?.code === 'dup') return json({ error: '이미 가입된 명의입니다.' }, 409);
      if (commit?.code === 'reused') return json({ error: '이미 사용된 인증입니다. 본인인증을 다시 진행해 주세요.' }, 409);
      // 20260911k — 제재성 탈퇴(영구정지·강제 탈퇴) 명의. 내부 사유는 노출하지 않는다.
      if (commit?.code === 'tombstoned') return json({ error: '서비스 이용이 제한된 명의입니다. 고객센터로 문의해 주세요.' }, 403);
      return json({ error: '저장 실패', detail: commit?.code ?? 'unknown' }, 500);
    }
    return json({ ok: true, name: vc.name ?? null });
  } catch (e) {
    console.error('[verify-identity]', e);
    return json({ error: '서버 오류' }, 500);
  }
});
