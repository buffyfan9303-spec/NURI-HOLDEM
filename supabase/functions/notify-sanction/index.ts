// ============================================================================
// Supabase Edge Function: notify-sanction
//  관리자가 회원을 정지/영구정지/강제탈퇴 처리할 때 호출되어, 해당 회원 이메일로
//  "사유 + 처리 결과"를 담은 안내 메일을 자동 발송한다. (다크 카지노 테마 + 로고)
//
//  호출(클라이언트): supabase.functions.invoke('notify-sanction', {
//    body: { userId, status, reason, suspendedUntil }
//  })  ← updateUserStatus()가 DB 상태변경 성공 직후 비동기 호출
//
//  필요한 환경변수(Supabase 대시보드 → Edge Functions → Secrets):
//    - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (자동 주입)
//    - RESEND_API_KEY (직접 등록), SANCTION_FROM (직접 등록)
// ============================================================================
// @ts-nocheck  (Deno 런타임 — 로컬 TS 빌드 대상 아님)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── 브랜드 테마 ───────────────────────────────────────────────────────────────
const LOGO = 'https://nuriholdem.com/2.png'; // 다크 배경용 흰색 워드마크
const C = {
  bg:   '#0A0C0F',
  card: '#14171F',
  line: '#2C3140',
  gold: '#FFD100',
  text: '#F0F4FF',
  sub:  '#8B95A8',
  red:  '#FF6B6B',
};

function shell(inner: string): string {
  return `
  <div style="margin:0;padding:0;background:${C.bg};">
    <div style="max-width:520px;margin:0 auto;padding:32px 20px;font-family:'Apple SD Gothic Neo','Malgun Gothic',Roboto,sans-serif;">
      <div style="text-align:center;margin-bottom:24px;">
        <img src="${LOGO}" alt="NURI HOLDEM" width="150" style="max-width:150px;height:auto;display:inline-block;" />
      </div>
      <div style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:28px 24px;">
        ${inner}
      </div>
      <p style="text-align:center;color:${C.sub};font-size:11px;line-height:1.6;margin-top:20px;">
        본 메일은 발신 전용입니다. 조치에 이의가 있으시면 고객센터로 문의해 주세요.<br/>
        건전한 마인드 스포츠 문화를 위해 협조 부탁드립니다.<br/>© NURI HOLDEM
      </p>
    </div>
  </div>`;
}

function infoBox(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0E1117;border:1px solid ${C.line};border-radius:10px;margin:18px 0;">
    <tr><td style="padding:14px 16px;">${rows}</td></tr></table>`;
}
function row(label: string, value: string, valueColor = C.text): string {
  return `<p style="margin:0 0 8px;color:${C.sub};font-size:13px;">
    <span style="display:inline-block;min-width:84px;color:${C.sub};">${label}</span>
    <span style="color:${valueColor};font-weight:700;">${value}</span></p>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  try {
    const { userId, status, reason, suspendedUntil } = await req.json();
    if (!userId || !status) return json({ error: 'userId, status는 필수입니다' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: profile, error } = await admin
      .from('profiles').select('email, nickname, name').eq('id', userId).single();
    if (error || !profile?.email) return json({ error: '회원 이메일을 찾을 수 없습니다' }, 404);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from      = Deno.env.get('SANCTION_FROM') ?? 'NURI HOLDEM <onboarding@resend.dev>';
    if (!resendKey) return json({ sent: false, reason: 'RESEND_API_KEY 미설정' }, 200);

    const display = escapeHtml(profile.nickname ?? profile.name ?? '회원');
    const safeReason = escapeHtml(reason || '운영원칙 위반');

    let subject = '';
    let inner   = '';

    if (status === 'suspended') {
      const end  = suspendedUntil ? new Date(suspendedUntil) : null;
      const days = end ? Math.max(1, Math.ceil((end.getTime() - Date.now()) / 86400000)) : null;
      const endTxt = end ? end.toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' }) : '별도 안내';
      subject = '[누리 홀덤] 서비스 이용 정지 안내';
      inner = `
        <h1 style="color:${C.gold};font-size:20px;margin:0 0 14px;">서비스 이용 정지 안내</h1>
        <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0;">
          <b>${display}</b>님, 운영원칙 위반으로 회원님의 계정이 아래와 같이 <b style="color:${C.gold};">이용 정지</b> 처리되었음을 안내드립니다.
        </p>
        ${infoBox(
          row('처리 내용', '이용 정지') +
          row('정지 기간', days ? `${days}일 (${endTxt}까지)` : endTxt) +
          row('상세 사유', safeReason)
        )}
        <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0;">
          정지 기간 동안 서비스 이용이 제한되며, 기간 만료 후 자동으로 해제됩니다.
        </p>`;
    } else {
      // banned / withdrawn — 강제 탈퇴 및 영구 이용 제한
      subject = '[누리 홀덤] 서비스 강제 탈퇴 및 이용 제한 안내';
      inner = `
        <h1 style="color:${C.red};font-size:20px;margin:0 0 14px;">서비스 강제 탈퇴 및 이용 제한 안내</h1>
        <p style="color:${C.text};font-size:14px;line-height:1.7;margin:0;">
          <b>${display}</b>님, 심각한 운영원칙 위반으로 회원님의 계정이 <b style="color:${C.red};">강제 탈퇴</b> 처리되었음을 안내드립니다.
        </p>
        ${infoBox(
          row('처리 내용', '강제 탈퇴 / 영구 이용 제한', C.red) +
          row('상세 사유', safeReason)
        )}
        <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0;">
          관련 법령 및 서비스 이용약관에 따라 본 조치 이후 <b style="color:${C.text};">동일인의 재가입이 제한</b>됩니다.
          불법 환전·사행성 행위 등 중대한 위반은 관계 법령에 따라 처리될 수 있습니다.
        </p>`;
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: profile.email, subject, html: shell(inner) }),
    });
    if (!r.ok) return json({ sent: false, error: `Resend 오류: ${await r.text()}` }, 502);
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
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
