// 주간 이메일 다이제스트 — 팔로우 매장의 향후 7일 대회 요약을 Resend 로 발송.
// 호출: 크론(금 10:30 KST — public.cron_weekly_email_digest() 가 Vault 공유 시크릿을 x-nuri-cron-secret 로 동봉)
//       또는 수동 테스트({"test_to":"..."}, 같은 헤더 필요).
// 2026-09-02 보안: 이전엔 공개 anon Bearer 만으로 열려 있어 인터넷 어디서든 전 회원 발송을 트리거할 수 있었다.
//   send-push 와 같은 시크릿(get_push_shared_secret, service_role 전용 RPC)을 대조한다 — 부재·불일치 전부 401(fail-closed).
// 키는 secret_settings(RLS 잠김·service_role 전용)에서 읽는다 — 코드에 하드코딩 금지.
import { createClient } from 'npm:@supabase/supabase-js@2';

let expectedSecret = '';
// deno-lint-ignore no-explicit-any
async function loadExpectedSecret(admin: any): Promise<string> {
  if (expectedSecret) return expectedSecret;
  const { data } = await admin.rpc('get_push_shared_secret');
  if (typeof data === 'string' && data.length > 0) expectedSecret = data;
  return expectedSecret;
}
function timingSafeEq(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const provided = req.headers.get('x-nuri-cron-secret') ?? '';
  const expected = await loadExpectedSecret(admin);
  if (!expected || !provided || !timingSafeEq(provided, expected)) return json({ error: 'unauthorized' }, 401);

  const { data: secrets, error: sErr } = await admin
    .from('secret_settings').select('key,value').in('key', ['RESEND_API_KEY', 'RESEND_FROM']);
  if (sErr) return json({ error: 'secrets: ' + sErr.message }, 500);
  const apiKey = secrets?.find((s) => s.key === 'RESEND_API_KEY')?.value;
  const from = secrets?.find((s) => s.key === 'RESEND_FROM')?.value ?? 'NURI HOLDEM <onboarding@resend.dev>';
  if (!apiKey) return json({ error: 'RESEND_API_KEY not set' }, 500);

  const send = async (to: string, subject: string, html: string) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body };
  };

  const payload = await req.json().catch(() => ({} as Record<string, unknown>));

  // 수동 테스트 — 도메인 인증 전에는 Resend 계정 소유자 주소로만 도달한다(onboarding 발신)
  if (typeof payload.test_to === 'string' && payload.test_to) {
    const r = await send(
      payload.test_to,
      '[NURI HOLDEM] 이메일 다이제스트 발송 테스트',
      digestHtml('테스트', '로티아레나', 1, 3),
    );
    return json({ mode: 'test', ...r }, r.ok ? 200 : 502);
  }

  // 정기 발송 — 대상 집계는 SQL(서비스 롤 전용 RPC)로
  const { data: rows, error } = await admin.rpc('weekly_email_digest_rows');
  if (error) return json({ error: error.message }, 500);
  let sent = 0, failed = 0;
  for (const row of rows ?? []) {
    const r = await send(
      row.email,
      `[NURI HOLDEM] 이번 주 팔로우 매장 대회 ${row.n}개`,
      digestHtml(row.nickname ?? '회원', row.vname, row.vn, row.n),
    );
    if (r.ok) sent++; else failed++;
    await new Promise((res) => setTimeout(res, 600)); // Resend 무료 플랜 레이트(2/s) 여유
  }
  return json({ mode: 'digest', candidates: rows?.length ?? 0, sent, failed });
});

function digestHtml(nick: string, vname: string, vn: number, n: number): string {
  const more = vn > 1 ? ` 외 ${vn - 1}곳` : '';
  return `<div style="font-family:'Apple SD Gothic Neo',Pretendard,sans-serif;max-width:480px;margin:0 auto;background:#0b0c10;color:#e8e9ed;border-radius:14px;padding:28px">
  <p style="font-size:12px;letter-spacing:2px;color:#8b94e8;margin:0 0 6px">NURI HOLDEM</p>
  <h1 style="font-size:20px;margin:0 0 14px">📅 ${nick}님, 이번 주 대회 ${n}개가 기다려요</h1>
  <p style="font-size:14px;line-height:1.7;color:#b9bdcd;margin:0 0 20px">팔로우하신 <b style="color:#e8e9ed">${vname}${more}</b>에서 오늘부터 7일 안에 <b style="color:#ffd100">${n}개 대회</b>가 열려요. 자리가 차기 전에 미리 예약하세요!</p>
  <a href="https://www.nuriholdem.com/" style="display:block;text-align:center;background:#5e6ad2;color:#fff;text-decoration:none;font-weight:700;font-size:15px;border-radius:10px;padding:14px">일정 보며 예약하기</a>
  <p style="font-size:11px;color:#6b7080;margin:18px 0 0">이 메일은 매장 팔로우 회원에게 주 1회 발송됩니다. 앱 프로필에서 팔로우를 해제하면 받지 않아요.</p>
</div>`;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
