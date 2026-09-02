// @ts-nocheck
// notify-sanction — 제재(정지/영구정지/강제탈퇴) 안내 메일. 호출자: 관리자 화면(src/api/auth.ts, 유저 JWT 동봉).
// 2026-09-02 보안: 이전엔 본문의 userId 만 있으면 **누구나(anon 키)** 임의 회원에게 제재 메일을 보낼 수 있었다(피싱 통로).
//   → Authorization 의 유저 JWT 를 검증하고 profiles.role = 'admin' 인 경우에만 진행(fail-closed 401/403).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOGO = 'https://nuriholdem.com/2.png';
const C = {
  bg: '#0A0C0F', band: '#101218', card: '#14171F', inner: '#0E1117',
  line: '#2C3140', gold: '#FFD100', text: '#F0F4FF', sub: '#8B95A8', faint: '#5A6175', red: '#FF6B6B',
};

function shell(inner) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
   <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;font-family:'Apple SD Gothic Neo','Malgun Gothic',Roboto,Arial,sans-serif;">
      <tr><td style="height:4px;background:${C.gold};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center" style="background:${C.band};padding:28px 24px 20px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
        <img src="${LOGO}" alt="NURI HOLDEM" width="140" style="width:140px;max-width:140px;height:auto;display:block;border:0;" />
      </td></tr>
      <tr><td style="background:${C.card};padding:30px 26px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
        ${inner}
      </td></tr>
      <tr><td style="background:${C.band};padding:18px 24px;border:1px solid ${C.line};border-top:none;border-radius:0 0 14px 14px;text-align:center;">
        <p style="color:${C.faint};font-size:11px;line-height:1.7;margin:0;">본 메일은 발신 전용입니다. 조치에 이의가 있으시면 고객센터로 문의해 주세요.<br/>건전한 마인드 스포츠 문화를 위해 협조 부탁드립니다.<br/>&copy; NURI HOLDEM</p>
      </td></tr>
    </table>
   </td></tr>
  </table></body></html>`;
}

function pill(label, color) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:${color}1F;border:1px solid ${color};border-radius:999px;padding:5px 14px;"><span style="color:${color};font-size:12px;font-weight:700;letter-spacing:0.3px;">${label}</span></td></tr></table>`;
}
function infoBox(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.inner};border:1px solid ${C.line};border-radius:10px;margin:18px 0;"><tr><td style="padding:16px 18px;">${rows}</td></tr></table>`;
}
function row(label, value, valueColor) {
  valueColor = valueColor || C.text;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr><td width="86" valign="top" style="color:${C.faint};font-size:12px;padding-top:1px;">${label}</td><td style="color:${valueColor};font-size:14px;font-weight:700;line-height:1.5;">${value}</td></tr></table>`;
}

/** 호출자 검증 — 유저 JWT → profiles.role === 'admin'. anon 키 JWT·부재·비관리자는 전부 거절. */
async function requireAdmin(req, admin) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return { ok: false, status: 401 };
  const token = auth.slice(7).trim();
  const userClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'));
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user?.id) return { ok: false, status: 401 };
  const { data: me } = await admin.from('profiles').select('role').eq('id', data.user.id).single();
  if (me?.role !== 'admin') return { ok: false, status: 403 };
  return { ok: true, status: 200 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const gate = await requireAdmin(req, admin);
    if (!gate.ok) return json({ error: gate.status === 401 ? '로그인이 필요합니다' : '관리자만 호출할 수 있습니다' }, gate.status);

    const { userId, status, reason, suspendedUntil } = await req.json();
    if (!userId || !status) return json({ error: 'userId, status는 필수입니다' }, 400);

    const { data: profile, error } = await admin.from('profiles').select('email, nickname, name').eq('id', userId).single();
    if (error || !profile?.email) return json({ error: '회원 이메일을 찾을 수 없습니다' }, 404);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('SANCTION_FROM') ?? 'NURI HOLDEM <onboarding@resend.dev>';
    if (!resendKey) return json({ sent: false, reason: 'RESEND_API_KEY 미설정' }, 200);

    const display = escapeHtml(profile.nickname ?? profile.name ?? '회원');
    const safeReason = escapeHtml(reason || '운영원칙 위반');
    let subject = '', inner = '';

    if (status === 'suspended') {
      const end = suspendedUntil ? new Date(suspendedUntil) : null;
      const days = end ? Math.max(1, Math.ceil((end.getTime() - Date.now()) / 86400000)) : null;
      const endTxt = end ? end.toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' }) : '별도 안내';
      subject = '[누리 홀덴] 서비스 이용 정지 안내';
      inner = `${pill('이용 정지', C.gold)}<h1 style="color:${C.text};font-size:21px;margin:0 0 12px;font-weight:800;">서비스 이용 정지 안내</h1><p style="color:${C.sub};font-size:14px;line-height:1.75;margin:0;"><b style="color:${C.text};">${display}</b>님, 운영원칙 위반으로 회원님의 계정이 아래와 같이 일시 정지되었음을 안내드립니다.</p>${infoBox(row('처리 내용', '이용 정지') + row('정지 기간', days ? `${days}일 · ${endTxt}까지` : endTxt) + row('상세 사유', safeReason))}<p style="color:${C.sub};font-size:13px;line-height:1.75;margin:0;">정지 기간 동안 서비스 이용이 제한되며, 기간 만료 후 자동으로 해제됩니다.</p>`;
    } else {
      subject = '[누리 홀덴] 서비스 강제 탈퇴 및 이용 제한 안내';
      inner = `${pill('강제 탈퇴 · 영구 제한', C.red)}<h1 style="color:${C.text};font-size:21px;margin:0 0 12px;font-weight:800;">서비스 강제 탈퇴 안내</h1><p style="color:${C.sub};font-size:14px;line-height:1.75;margin:0;"><b style="color:${C.text};">${display}</b>님, 심각한 운영원칙 위반으로 회원님의 계정이 강제 탈퇴 처리되었음을 안내드립니다.</p>${infoBox(row('처리 내용', '강제 탈퇴 / 영구 이용 제한', C.red) + row('상세 사유', safeReason))}<p style="color:${C.sub};font-size:13px;line-height:1.75;margin:0;">관련 법령 및 서비스 이용약관에 따라 본 조치 이후 <b style="color:${C.text};">동일인의 재가입이 제한</b>됩니다. 불법 환전·사행성 행위 등 중대한 위반은 관계 법령에 따라 처리될 수 있습니다.</p>`;
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
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
