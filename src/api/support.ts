// src/api/support.ts — 1:1 고객센터 문의. 회원 접수 + 운영자 답변(RLS로 권한 강제).
import { supabase, IS_MOCK } from '../lib/supabase';

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
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('support_inquiries').insert({
    user_id: me.user.id, user_name: input.userName ?? null,
    category: input.category, title: input.title.trim(), content: input.content.trim(),
  });
  if (error) throw new Error(error.message);
}

/** 내 문의 내역(답변 포함) */
export async function getMyInquiries(): Promise<SupportInquiry[]> {
  if (IS_MOCK) return [];
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) return [];
  const { data, error } = await supabase.from('support_inquiries')
    .select('*').eq('user_id', me.user.id).order('created_at', { ascending: false });
  if (error) return [];
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
  const { error } = await supabase.from('support_inquiries')
    .update({ answer: answer.trim(), status: 'answered', answered_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** 본인: 문의 삭제(취소) */
export async function deleteMyInquiry(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('support_inquiries').delete().eq('id', id);
  if (error) throw new Error(error.message);
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
