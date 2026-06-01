// ============================================================================
// Supabase Edge Function: notify-sanction
//  관리자가 회원을 정지/영구정지/강제탈퇴 처리할 때 호출되어,
//  해당 회원 이메일로 "사유 + 처리 결과"를 담은 안내 메일을 자동 발송한다.
//
// 호출(클라이언트): supabase.functions.invoke('notify-sanction', {
//   body: { userId, status, reason, suspendedUntil }
// })
//
// 필요한 환경변수(Supabase 대시보드 → Edge Functions → Secrets):
//   - SUPABASE_URL              (자동 주입)
//   - SUPABASE_SERVICE_ROLE_KEY (자동 주입) — profiles 이메일 조회용
//   - RESEND_API_KEY            (직접 등록) — Resend 발송 키
//   - SANCTION_FROM             (직접 등록) — 예: "NURI HOLDEM <no-reply@nuriholdem.com>"
//
// 배포: supabase functions deploy notify-sanction
// ============================================================================
// @ts-nocheck  (Deno 런타임 — 로컬 TS 빌드 대상 아님)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STATUS_KO: Record<string, string> = {
  suspended: '일시 정지',
  banned:    '영구 정지',
  withdrawn: '강제 탈퇴',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  try {
    const { userId, status, reason, suspendedUntil } = await req.json();
    if (!userId || !status) {
      return json({ error: 'userId, status는 필수입니다' }, 400);
    }

    // service role 로 회원 이메일·닉네임 조회 (RLS 우회)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: profile, error } = await admin
      .from('profiles')
      .select('email, nickname, name')
      .eq('id', userId)
      .single();
    if (error || !profile?.email) {
      return json({ error: '회원 이메일을 찾을 수 없습니다' }, 404);
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from      = Deno.env.get('SANCTION_FROM') ?? 'NURI HOLDEM <onboarding@resend.dev>';
    if (!resendKey) {
      // 키 미설정 시 발송은 생략하되 200으로 응답(상태 변경 자체는 이미 완료됨)
      return json({ sent: false, reason: 'RESEND_API_KEY 미설정' }, 200);
    }

    const statusKo = STATUS_KO[status] ?? status;
    const display  = profile.nickname ?? profile.name ?? '회원';
    const untilTxt = suspendedUntil
      ? `<p>정지 해제 예정일: <b>${new Date(suspendedUntil).toLocaleString('ko-KR')}</b></p>`
      : '';

    const html = `
      <div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a1a1a">
        <h2 style="color:#b91c1c;margin:0 0 12px">[NURI HOLDEM] 계정 ${statusKo} 안내</h2>
        <p>${display}님, 회원님의 계정이 아래와 같이 <b>${statusKo}</b> 처리되었음을 안내드립니다.</p>
        <div style="background:#f7f7f8;border-radius:8px;padding:14px;margin:14px 0">
          <p style="margin:0 0 6px"><b>처리 내용:</b> ${statusKo}</p>
          <p style="margin:0"><b>사유:</b> ${escapeHtml(reason || '운영정책 위반')}</p>
          ${untilTxt}
        </div>
        <p style="font-size:13px;color:#555">
          본 조치에 이의가 있으시면 고객센터로 문의해 주세요. 건전한 마인드 스포츠 문화를 위해 협조 부탁드립니다.
        </p>
        <p style="font-size:12px;color:#999;margin-top:18px">© NURI HOLDEM</p>
      </div>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: profile.email,
        subject: `[NURI HOLDEM] 계정 ${statusKo} 안내`,
        html,
      }),
    });
    if (!r.ok) {
      const body = await r.text();
      return json({ sent: false, error: `Resend 오류: ${body}` }, 502);
    }
    return json({ sent: true }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
