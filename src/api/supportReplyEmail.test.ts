// 1:1 문의 답변 메일(엣지 함수 support-reply-email) — 판정부를 **같은 파일 그대로** import 해 잰다(2026-09-30).
//   권한(401/403) · 남의 문의 · 받는 사람 고정 · 중복 차단 · 실패 시 선점 되돌림 · 이스케이프.
// 실행: npx vitest run src/api/supportReplyEmail.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handle, type Deps, type InquiryRow } from '../../supabase/functions/support-reply-email/logic.ts';

const ROOT = join(__dirname, '..', '..');
const ADMIN = 'admin-uid', USER = 'user-uid', OTHER = 'other-uid';
const QID = '11111111-2222-4333-8444-555555555555';
const AT = '2026-09-30T05:12:00.123456+00:00';

function world(over: Partial<InquiryRow> = {}) {
  const row: InquiryRow = {
    id: QID, user_id: OTHER, user_name: '리버의신', category: '결제·이용권', title: '이용권 문의',
    answer: '확인했습니다.\n지금은 반영됐어요.', status: 'answered', answered_at: AT, answer_emailed_for: null, ...over,
  };
  const sent: Parameters<Deps['send']>[0][] = [];
  const calls = { getInquiry: 0, release: 0 };
  let sendOk = true;
  const deps: Deps = {
    getUserId: async (t) => ({ 'tok-admin': ADMIN, 'tok-user': USER, 'tok-other': OTHER } as Record<string, string>)[t] ?? null,
    getRole: async (uid) => (uid === ADMIN ? 'admin' : 'user'),
    getInquiry: async (id) => { calls.getInquiry++; return id === row.id ? { ...row } : null; },
    getRecipient: async (uid) => (uid === OTHER ? { email: 'owner@example.com', confirmed: true }
      : uid === 'unconfirmed' ? { email: 'someone-else@example.com', confirmed: false } : { email: null, confirmed: false }),
    getResend: async () => ({ key: 're_test', from: 'NURI HOLDEM <noreply@nuriholdem.com>' }),
    // DB 의 CAS 를 흉내: answered_at 이 같고 answer_emailed_for 가 prev 일 때만 교환
    claim: async (id, at, prev) => {
      if (id !== row.id || row.answered_at !== at || row.answer_emailed_for !== prev) return false;
      row.answer_emailed_for = at; return true;
    },
    release: async (id, at, prev) => { calls.release++; if (id === row.id && row.answer_emailed_for === at) row.answer_emailed_for = prev; },
    send: async (m) => { sent.push(m); return { ok: sendOk, status: sendOk ? 200 : 500 }; },
    log: () => {},
  };
  return { row, sent, calls, deps, failSend: () => { sendOk = false; } };
}

const post = (token: string | null, body: unknown) => new Request('https://x/functions/v1/support-reply-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const run = async (w: ReturnType<typeof world>, token: string | null, body: unknown = { inquiryId: QID }) => {
  const r = await handle(post(token, body), w.deps);
  return { status: r.status, body: await r.json() as { sent: boolean; code?: string; error?: string } };
};

describe('support-reply-email — 호출자 증명', () => {
  it('토큰 없음·무효 토큰(anon 키 포함)은 401 이고 문의를 조회조차 하지 않는다', async () => {
    const w = world();
    expect((await run(w, null)).status).toBe(401);
    expect((await run(w, 'anon-key-jwt')).status).toBe(401);
    expect(w.calls.getInquiry).toBe(0);
    expect(w.sent).toHaveLength(0);
  });

  it('로그인한 일반 회원은 403 — 남의 문의 id 도, 자기 문의 id 도 보낼 수 없다', async () => {
    const w = world();
    expect((await run(w, 'tok-user')).status).toBe(403);   // 남의 문의(OTHER 소유)
    expect((await run(w, 'tok-other')).status).toBe(403);  // 자기 문의라도 관리자가 아니면 거부
    expect(w.calls.getInquiry).toBe(0);
    expect(w.sent).toHaveLength(0);
  });

  it('POST 외 메서드는 405, OPTIONS 는 CORS 응답', async () => {
    const w = world();
    expect((await handle(new Request('https://x', { method: 'GET' }), w.deps)).status).toBe(405);
    expect((await handle(new Request('https://x', { method: 'OPTIONS' }), w.deps)).status).toBe(200);
  });
});

describe('support-reply-email — 입력·받는 사람은 서버가 정한다', () => {
  it('inquiryId 가 uuid 가 아니거나 본문이 깨지면 400', async () => {
    const w = world();
    expect((await run(w, 'tok-admin', { inquiryId: "1' or 1=1" })).status).toBe(400);
    expect((await run(w, 'tok-admin', {})).status).toBe(400);
    expect((await run(w, 'tok-admin', 'not-json')).status).toBe(400);
  });

  it('본문에 to·subject·html 을 실어도 무시하고 문의자 본인 주소로 서버 조회 본문만 보낸다', async () => {
    const w = world();
    const r = await run(w, 'tok-admin', { inquiryId: QID, to: 'attacker@evil.test', subject: 'x', html: '<a href="https://evil">클릭</a>' });
    expect(r).toEqual({ status: 200, body: { sent: true } });
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0].to).toBe('owner@example.com');
    expect(w.sent[0].html).not.toContain('evil');
    expect(w.sent[0].subject).toBe('[NURI HOLDEM] 1:1 문의에 답변이 등록되었습니다');
    // 응답에 받는 사람 주소를 싣지 않는다(보안 표준 §6)
    expect(JSON.stringify(r.body)).not.toContain('@');
  });

  it('없는 문의 404 · 답변 전 문의 409 · 문의자 이메일 없음 404', async () => {
    expect((await run(world(), 'tok-admin', { inquiryId: '99999999-2222-4333-8444-555555555555' })).status).toBe(404);
    expect((await run(world({ status: 'open', answer: null, answered_at: null }), 'tok-admin')).body.code).toBe('not_answered');
    expect((await run(world({ user_id: 'ghost' }), 'tok-admin')).body.code).toBe('no_email');
  });
});

describe('support-reply-email — 미인증 주소(보안 검토 R2)', () => {
  it('email_confirmed_at 이 없는 문의자에게는 보내지 않고 건너뛴다 — 선점도 남기지 않는다', async () => {
    const w = world({ user_id: 'unconfirmed' });
    const r = await run(w, 'tok-admin');
    expect(r).toEqual({ status: 200, body: { sent: false, skipped: true, code: 'unconfirmed' } });
    expect(w.sent).toHaveLength(0);
    expect(w.row.answer_emailed_for).toBeNull();
  });
});

describe('support-reply-email — 중복 발송 차단', () => {
  it('같은 답변은 두 번째 호출에서 409 already_sent 이고 메일은 한 통뿐이다', async () => {
    const w = world();
    expect((await run(w, 'tok-admin')).status).toBe(200);
    const second = await run(w, 'tok-admin');
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('already_sent');
    expect(w.sent).toHaveLength(1);
  });

  it('동시에 두 번 눌러도 CAS 선점으로 한 통만 나간다', async () => {
    const w = world();
    const [a, b] = await Promise.all([run(w, 'tok-admin'), run(w, 'tok-admin')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(w.sent).toHaveLength(1);
  });

  it('답변을 수정하면(answered_at 새 판) 한 번 더 — 제목이 "수정" 으로 바뀐다', async () => {
    const w = world({ answer_emailed_for: '2026-09-29T00:00:00+00:00' });
    expect((await run(w, 'tok-admin')).status).toBe(200);
    expect(w.sent[0].subject).toContain('수정');
    expect(w.sent[0].idempotencyKey).toBe(`support-reply/${QID}/${Date.parse(AT)}`);
  });

  it('Resend 실패면 502 이고 선점을 되돌려 재시도할 수 있다', async () => {
    const w = world();
    w.failSend();
    const r = await run(w, 'tok-admin');
    expect(r.status).toBe(502);
    expect(w.calls.release).toBe(1);
    expect(w.row.answer_emailed_for).toBeNull();
  });

  it('조회 중 예외는 500 고정 문구 — 내부 오류 원문을 싣지 않는다', async () => {
    const w = world();
    w.deps.getInquiry = async () => { throw new Error('relation "support_inquiries" does not exist'); };
    const r = await run(w, 'tok-admin');
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('relation');
  });
});

describe('support-reply-email — 이스케이프(보안 표준 §7)', () => {
  it('제목·카테고리·닉네임·답변의 마크업은 글자로 나가고, 답변 줄바꿈은 <br> 로 보존된다', async () => {
    const w = world({
      title: '<img src=x onerror=alert(1)>', category: '<script>x</script>', user_name: '"><b>닉</b>',
      answer: '첫 줄 <a href="https://evil">링크</a>\n둘째 줄',
    });
    await run(w, 'tok-admin');
    const html = w.sent[0].html;
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>x');
    expect(html).not.toContain('<a href="https://evil"');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('첫 줄 &lt;a href=&quot;https://evil&quot;&gt;링크&lt;/a&gt;<br>둘째 줄');
    expect(w.sent[0].subject).not.toContain('<');
  });
});

describe('배선 계약', () => {
  const code = (p: string) => readFileSync(join(ROOT, p), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('엣지 함수는 logic.handle 로만 응답하고 Reply-To 를 싣지 않는다(발신 전용)', () => {
    const idx = code('supabase/functions/support-reply-email/index.ts');
    expect(idx).toMatch(/Deno\.serve\(\(req\) => handle\(req,/);
    expect(idx.toLowerCase()).not.toContain('reply_to');
    expect(idx.toLowerCase()).not.toContain('reply-to');
    expect(idx).toContain("'Idempotency-Key': idempotencyKey");
    // 보안 검토 R3: Resend 오류 본문은 수신 주소를 되풀이할 수 있다 — 상태 코드만 남긴다(logic 의 deps.log(status)).
    expect(idx).not.toMatch(/\br\.(text|json)\(/);
  });
  it('관리자 답변 화면은 저장 성공 뒤에만 메일을 부르고, 메일 실패를 따로 알린다', () => {
    const src = code('src/components/features/AdminTab.tsx');
    const i = src.indexOf('await answerInquiry(id, text)');
    const j = src.indexOf('await sendInquiryReplyEmail(id)');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(src).toContain('답변은 등록했지만 메일을 보내지 못했습니다');
  });
  it('클라이언트는 문의 id 하나만 보낸다', () => {
    expect(code('src/api/support.ts')).toContain("functions.invoke('support-reply-email', { body: { inquiryId: id } })");
    expect(code('src/api/support.ts')).toContain("if (data?.skipped === true) return 'skipped';");
  });
});
