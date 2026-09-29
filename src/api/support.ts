// src/api/support.ts — 1:1 고객센터 문의. 회원 접수 + 운영자 답변(RLS로 권한 강제).
import { supabase, IS_MOCK } from '../lib/supabase';
import { mustAffect } from './_mustAffect';
import { currentUser } from './_session';

export const INQUIRY_CATEGORIES = ['이용 문의', '신고/제재', '결제·이용권', '버그/오류', '기타'] as const;
export type InquiryCategory = typeof INQUIRY_CATEGORIES[number];

export interface SupportInquiry {
  id: string;
  userId: string;
  userName: string;
  category: string;
  title: string;
  content: string;
  status: 'open' | 'answered';
  answer?: string;
  answeredAt?: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowTo(r: any): SupportInquiry {
  return {
    id: r.id, userId: r.user_id, userName: r.user_name ?? '회원', category: r.category,
    title: r.title, content: r.content, status: r.status, answer: r.answer ?? undefined,
    answeredAt: r.answered_at ?? undefined, createdAt: r.created_at,
  };
}

/** 문의 접수 — 본인 명의로만(RLS) */
export async function submitInquiry(input: { category: string; title: string; content: string; userName?: string }): Promise<void> {
  if (IS_MOCK) return;
  const me = await currentUser();
  if (!me) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('support_inquiries').insert({
    user_id: me.id, user_name: input.userName ?? null,
    category: input.category, title: input.title.trim(), content: input.content.trim(),
  });
  if (error) throw new Error(error.message);
}

/** 내 문의 내역(답변 포함) */
export async function getMyInquiries(): Promise<SupportInquiry[]> {
  if (IS_MOCK) return [];
  const me = await currentUser();
  if (!me) return [];
  const { data, error } = await supabase.from('support_inquiries')
    .select('*').eq('user_id', me.id).order('created_at', { ascending: false });
  // 실패를 빈 배열로 돌려주면 화면이 '접수한 문의가 없습니다'로 단언한다 — 운영자 답변이 통째로 사라져 보인다.
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowTo);
}

/** 운영자: 전체 문의(미답변 우선) */
export async function getAllInquiries(): Promise<SupportInquiry[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('support_inquiries')
    .select('*').order('status', { ascending: true }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowTo);
}

/** 운영자: 답변 등록(RLS로 admin만 update 허용) */
export async function answerInquiry(id: string, answer: string): Promise<void> {
  if (IS_MOCK) return;
  // 0행을 성공으로 넘기면 '답변을 등록했습니다' 뒤에 초안이 비워진다 — 운영자가 쓴 답변이 통째로 사라진다.
  await mustAffect(supabase.from('support_inquiries')
    .update({ answer: answer.trim(), status: 'answered', answered_at: new Date().toISOString() })
    .eq('id', id));
}

/** 운영자: 답변 저장 **뒤** 문의자에게 답변 메일 발송(엣지 함수 support-reply-email).
 *  보내는 것은 문의 id 하나 — 받는 사람·본문은 서버가 DB 에서 조회한다. 같은 답변은 서버가 한 번만 보낸다('already').
 *  실패는 던진다(서버의 고정 문구) — 답변 저장은 이미 끝났으므로 호출자는 저장 성공과 따로 알린다. */
export async function sendInquiryReplyEmail(id: string): Promise<'sent' | 'already' | 'skipped'> {
  if (IS_MOCK) return 'sent';
  const { data, error } = await supabase.functions.invoke('support-reply-email', { body: { inquiryId: id } });
  if (!error) {
    if (data?.sent === true) return 'sent';
    if (data?.skipped === true) return 'skipped'; // 이메일 미인증 회원 — 서버가 일부러 보내지 않았다
    throw new Error('답변 메일을 보내지 못했습니다');
  }
  // FunctionsHttpError: error.context 가 Response — 서버의 code·고정 문구를 꺼낸다(identity.ts 와 같은 조리법).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (error as any).context;
  let j: { code?: unknown; error?: unknown } | null = null;
  if (ctx && typeof ctx.json === 'function') { try { j = await ctx.json(); } catch { /* 본문 없음(미배포 등) */ } }
  if (j?.code === 'already_sent') return 'already';
  throw new Error(typeof j?.error === 'string' && j.error ? j.error : '답변 메일을 보내지 못했습니다');
}

/** 본인: 문의 삭제(취소) */
export async function deleteMyInquiry(id: string): Promise<void> {
  if (IS_MOCK) return;
  await mustAffect(supabase.from('support_inquiries').delete().eq('id', id));
}

// #14 실시간 — 신규 문의/답변을 즉시 반영(RLS가 수신 범위를 강제: 운영자=전체, 회원=본인). 변경 시 reload 콜백.
export function subscribeInquiries(onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const channel = supabase
    .channel(`support:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_inquiries' }, () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
