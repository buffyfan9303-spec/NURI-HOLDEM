// 주간 이메일 다이제스트 — 팔로우 매장의 향후 7일 대회 요약을 Resend 로 발송.
// 호출: 크론(금 10:30 KST — public.cron_weekly_email_digest() 가 Vault 공유 시크릿을 x-nuri-cron-secret 로 동봉)
//       또는 수동 테스트({"test_to":"..."}, 같은 헤더 필요).
// 2026-09-02 보안: 이전엔 공개 anon Bearer 만으로 열려 있어 인터넷 어디서든 전 회원 발송을 트리거할 수 있었다.
//   send-push 와 같은 시크릿(get_push_shared_secret, service_role 전용 RPC)을 대조한다 — 부재·불일치 전부 401(fail-closed).
// 키는 secret_settings(RLS 잠김·service_role 전용)에서 읽는다 — 코드에 하드코딩 금지.
// 2026-10-06 법령 점검 P1-1(정보통신망법 §50): 수신자 = 마케팅 동의자(서버 weekly_email_digest_rows, 20261006l) ·
//   제목 '(광고)' · 본문에 전송자 명칭·연락처·수신거부 방법 · 21~08시 KST 발송 금지 — 문구·판정은 _shared/email/weeklyDigest.ts
//   (vitest src/lib/emailTemplates.test.ts 가 직접 import 해 잠근다).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAdQuietHoursKst, UNSUBSCRIBE_MAILTO, weeklyDigestEmail } from '../_shared/email/weeklyDigest.ts';

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
  // DB 오류 원문은 서버 로그에만 — 응답은 고정 문구(보안 표준 §6).
  if (sErr) { console.error('[weekly-email-digest] secret_settings', sErr); return json({ error: 'secrets 조회 실패' }, 500); }
  const apiKey = secrets?.find((s) => s.key === 'RESEND_API_KEY')?.value;
  const from = secrets?.find((s) => s.key === 'RESEND_FROM')?.value ?? 'NURI HOLDEM <noreply@nuriholdem.com>';
  if (!apiKey) return json({ error: 'RESEND_API_KEY not set' }, 500);

  const send = async (to: string, subject: string, html: string) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      // List-Unsubscribe: 메일 앱의 '구독 취소' 버튼 — 로그인 없이 고객센터로 수신거부 메일을 보낸다.
      body: JSON.stringify({ from, to: [to], subject, html, headers: { 'List-Unsubscribe': `<${UNSUBSCRIBE_MAILTO}>` } }),
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body };
  };

  const payload = await req.json().catch(() => ({} as Record<string, unknown>));

  // 수동 테스트 — 2026-09-04 nuriholdem.com 도메인 인증 완료(DKIM·SPF·MX). 이제 임의 수신자에게 도달한다.
  if (typeof payload.test_to === 'string' && payload.test_to) {
    const t = weeklyDigestEmail({ nickname: '테스트', vname: '로티아레나', vn: 1, n: 3 });
    const r = await send(payload.test_to, t.subject, t.html);
    return json({ mode: 'test', ...r }, r.ok ? 200 : 502);
  }

  // §50③ 야간(21~08시 KST) 광고성 정보 전송 금지 — 크론(금 10:30)이 늦게 돌거나 수동으로 불려도 밤에는 보내지 않는다.
  if (isAdQuietHoursKst()) return json({ mode: 'digest', skipped: 'quiet-hours' });
  // 정기 발송 — 대상 집계는 SQL(서비스 롤 전용 RPC, 마케팅 동의자만)로
  const { data: rows, error } = await admin.rpc('weekly_email_digest_rows');
  if (error) { console.error('[weekly-email-digest] weekly_email_digest_rows', error); return json({ error: '대상 집계 실패' }, 500); }
  let sent = 0, failed = 0;
  for (const row of rows ?? []) {
    const m = weeklyDigestEmail({ nickname: row.nickname, vname: row.vname, vn: row.vn, n: row.n });
    const r = await send(row.email, m.subject, m.html);
    if (r.ok) sent++; else failed++;
    await new Promise((res) => setTimeout(res, 600)); // Resend 무료 플랜 레이트(2/s) 여유
  }
  return json({ mode: 'digest', candidates: rows?.length ?? 0, sent, failed });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
