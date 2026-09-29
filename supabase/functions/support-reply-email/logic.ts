// supabase/functions/support-reply-email/logic.ts — 1:1 문의 답변 메일 발송의 판정부(순수 — 입출력은 deps 로 주입).
// Deno 전용 import 가 없다 — 웹앱 vitest(src/api/supportReplyEmail.test.ts)가 이 파일을 그대로 import 해 잠근다.
//
// 🔴 보안 계약(CLAUDE.md 보안 표준 §4·§5·§6·§7)
//   · 첫 분기에서 호출자 증명: Bearer 유저 JWT → auth.getUser → profiles.role === 'admin'. 아니면 401/403(fail-closed).
//     verify_jwt 는 anon 키 JWT 도 통과시키므로 게이트가 아니다.
//   · 입력은 inquiryId(uuid) **하나**. 받는 사람·제목·본문은 서버가 service role 로 조회한 값만 쓴다 —
//     본문에 to/html/subject 를 실어 보내도 읽지 않는다(피싱 통로 차단 — notify-sanction 2026-09-02 사고와 같은 부류).
//   · 같은 답변(answered_at 판)은 한 번만: answer_emailed_for 를 비교-교환(CAS)으로 선점한 뒤 보낸다.
//     답변을 **수정**하면 answered_at 이 바뀌어 새 판으로 한 번 더 보낸다(제목 '수정되었습니다').
//     Resend 에도 Idempotency-Key 를 실어 재시도 중복을 한 겹 더 막는다. 발송 실패면 선점을 되돌린다.
//   · 응답·오류에는 고정 문구만 — 받는 사람 주소·내부 오류 원문은 싣지 않는다(서버 로그에만).
import { supportReplyEmail } from '../_shared/email/supportReply.ts';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InquiryRow {
  id: string;
  user_id: string;
  user_name: string | null;
  category: string;
  title: string;
  answer: string | null;
  status: string;
  answered_at: string | null;
  answer_emailed_for: string | null;
}

export interface Deps {
  /** 유저 JWT → uid. 무효·anon 키면 null */
  getUserId(token: string): Promise<string | null>;
  getRole(uid: string): Promise<string | null>;
  getInquiry(id: string): Promise<InquiryRow | null>;
  /** 문의자의 로그인 이메일(auth.users) */
  getRecipient(userId: string): Promise<string | null>;
  getResend(): Promise<{ key: string; from: string } | null>;
  /** answer_emailed_for: prev → answeredAt 비교-교환. 선점했으면 true */
  claim(id: string, answeredAt: string, prev: string | null): Promise<boolean>;
  /** 발송 실패 시 선점 되돌리기: answeredAt → prev (내가 선점한 값일 때만) */
  release(id: string, answeredAt: string, prev: string | null): Promise<void>;
  send(msg: { key: string; from: string; to: string; subject: string; html: string; idempotencyKey: string }): Promise<{ ok: boolean; status: number }>;
  log(...args: unknown[]): void;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const fail = (status: number, code: string, error: string) => json({ sent: false, code, error }, status);

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', '허용되지 않은 요청입니다');
  try {
    // ① 호출자 증명 — 다른 무엇보다 먼저
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return fail(401, 'login', '로그인이 필요합니다');
    const uid = await deps.getUserId(auth.slice(7).trim());
    if (!uid) return fail(401, 'login', '로그인이 필요합니다');
    if ((await deps.getRole(uid)) !== 'admin') return fail(403, 'forbidden', '관리자만 보낼 수 있습니다');

    // ② 입력 — inquiryId 하나만 읽는다
    const body = await req.json().catch(() => null) as { inquiryId?: unknown } | null;
    const id = typeof body?.inquiryId === 'string' ? body.inquiryId : '';
    if (!UUID_RE.test(id)) return fail(400, 'bad_input', '잘못된 요청입니다');

    // ③ 서버가 조회한 값으로만 판정
    const q = await deps.getInquiry(id);
    if (!q) return fail(404, 'not_found', '문의를 찾을 수 없습니다');
    if (q.status !== 'answered' || !q.answer?.trim() || !q.answered_at) return fail(409, 'not_answered', '답변이 등록되지 않은 문의입니다');
    if (q.answer_emailed_for === q.answered_at) return fail(409, 'already_sent', '이 답변은 이미 메일로 보냈습니다');

    const to = await deps.getRecipient(q.user_id);
    if (!to) return fail(404, 'no_email', '문의자의 이메일을 찾을 수 없습니다');
    const resend = await deps.getResend();
    if (!resend) return fail(503, 'not_configured', '메일 발송이 설정되지 않았습니다');

    // ④ 선점 — 동시에 두 번 눌러도, 그 사이 답변이 바뀌어도 한 번만 나간다
    if (!(await deps.claim(q.id, q.answered_at, q.answer_emailed_for))) return fail(409, 'already_sent', '이 답변은 이미 메일로 보냈습니다');

    const { subject, html } = supportReplyEmail({
      nickname: q.user_name, category: q.category, title: q.title, answer: q.answer,
      answeredAt: q.answered_at, isUpdate: q.answer_emailed_for !== null,
    });
    const r = await deps.send({
      key: resend.key, from: resend.from, to, subject, html,
      idempotencyKey: `support-reply/${q.id}/${Date.parse(q.answered_at) || q.answered_at}`,
    }).catch((e) => { deps.log('[support-reply-email] send', e); return { ok: false, status: 0 }; }); // 네트워크 예외도 선점을 되돌린다
    if (!r.ok) {
      deps.log('[support-reply-email] Resend', r.status);
      await deps.release(q.id, q.answered_at, q.answer_emailed_for);
      return fail(502, 'send_failed', '메일을 보내지 못했습니다');
    }
    return json({ sent: true });
  } catch (e) {
    deps.log('[support-reply-email]', e);
    return fail(500, 'server', '서버 오류');
  }
}
