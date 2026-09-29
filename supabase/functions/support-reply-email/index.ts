// support-reply-email — 관리자가 1:1 문의 답변을 저장한 뒤 문의자에게 답변 메일을 보낸다(2026-09-30).
// 호출자: 관리자 화면 SupportInquiriesPanel(src/components/features/AdminTab.tsx) → src/api/support.ts sendInquiryReplyEmail.
// 판정은 전부 ./logic.ts(단위 테스트: src/api/supportReplyEmail.test.ts). 여기는 Supabase·Resend 배선만.
// 선행: supabase/migrations/20260930a_support_reply_email.sql(answer_emailed_for 컬럼). 발신은 회신 불가 주소(RESEND_FROM) — Reply-To 를 싣지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle, type InquiryRow } from './logic.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const anon = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });

Deno.serve((req) => handle(req, {
  async getUserId(token) {
    const { data, error } = await anon.auth.getUser(token);
    return error ? null : data?.user?.id ?? null;
  },
  async getRole(uid) {
    const { data } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle();
    return data?.role ?? null;
  },
  async getInquiry(id) {
    const { data, error } = await admin.from('support_inquiries')
      .select('id,user_id,user_name,category,title,answer,status,answered_at,answer_emailed_for').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as InquiryRow | null) ?? null;
  },
  async getRecipient(userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    const u = error ? null : data?.user;
    return { email: u?.email ?? null, confirmed: !!u?.email_confirmed_at };
  },
  async getResend() {
    // weekly-email-digest 와 같은 관행: secret_settings(service_role 전용) 우선, 없으면 함수 환경변수.
    const { data } = await admin.from('secret_settings').select('key,value').in('key', ['RESEND_API_KEY', 'RESEND_FROM']);
    const key = data?.find((s) => s.key === 'RESEND_API_KEY')?.value ?? Deno.env.get('RESEND_API_KEY');
    const from = data?.find((s) => s.key === 'RESEND_FROM')?.value ?? 'NURI HOLDEM <noreply@nuriholdem.com>';
    return key ? { key, from } : null;
  },
  async claim(id, answeredAt, prev) {
    let q = admin.from('support_inquiries').update({ answer_emailed_for: answeredAt }).eq('id', id).eq('answered_at', answeredAt);
    q = prev === null ? q.is('answer_emailed_for', null) : q.eq('answer_emailed_for', prev);
    const { data, error } = await q.select('id');
    if (error) throw error;
    return (data?.length ?? 0) === 1;
  },
  async release(id, answeredAt, prev) {
    await admin.from('support_inquiries').update({ answer_emailed_for: prev }).eq('id', id).eq('answer_emailed_for', answeredAt);
  },
  async send({ key, from, to, subject, html, idempotencyKey }) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    return { ok: r.ok, status: r.status };
  },
  log: (...a) => console.error(...a),
}));
