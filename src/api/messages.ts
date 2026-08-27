// src/api/messages.ts — 쪽지(개인 메시지) v1
// DB: public.user_messages(id, sender_id, recipient_id, body(≤2000), created_at, read_at,
//     sender_deleted, recipient_deleted) — 라이브 적용 완료.
// RLS: 본인 송수신만 select · 발신은 본인인증(ci_hash) 회원 + 차단관계 불가(서버 강제) ·
//     update 는 수신자=read_at·recipient_deleted / 발신자=sender_deleted 만(가드 트리거).
// 수신자 검색은 기존 RPC find_user_for_transfer 재사용(vouchers.ts) — 여기서 중복 구현하지 않는다.
// 실시간(Realtime) 구독 금지(연결 예산) — 뱃지는 App 의 90s 폴링 + 패널 열 때 갱신.
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** 내가 보낸 쪽지인가 (말풍선 좌/우 정렬용) */
  mine: boolean;
}

export interface MessageThread {
  otherId: string;
  otherName: string;
  otherColor: string | null;
  lastBody: string;
  lastAt: string;
  /** 최신 1건이 내 발신인가 ("나: ..." 프리픽스용) */
  lastMine: boolean;
  unread: number;
}

interface MsgRow {
  id: string; sender_id: string; recipient_id: string; body: string;
  created_at: string; read_at: string | null; sender_deleted: boolean; recipient_deleted: boolean;
}

/** 내 화면에서 지운 쪽지인가 — RLS 는 소프트삭제를 모르는 채 반환하므로 클라에서 거른다 */
function hiddenForMe(r: MsgRow, me: string): boolean {
  return (r.sender_id === me && r.sender_deleted) || (r.recipient_id === me && r.recipient_deleted);
}

// ── 스레드 목록 — 상대별 최신 1건 + 미읽음 수 (클라 그룹핑, chat.ts getMyChatThreads 관행) ──
export async function listMyThreads(): Promise<MessageThread[]> {
  if (IS_MOCK) return [];
  const me = await currentUser();
  if (!me) return [];
  const { data, error } = await supabase
    .from('user_messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at, sender_deleted, recipient_deleted')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MsgRow[];

  const map = new Map<string, MessageThread>();
  for (const r of rows) {
    if (hiddenForMe(r, me.id)) continue;
    const otherId = r.sender_id === me.id ? r.recipient_id : r.sender_id;
    let t = map.get(otherId);
    if (!t) {
      // 최신순 정렬이라 첫 등장 행이 곧 스레드의 최신 쪽지
      t = { otherId, otherName: '회원', otherColor: null, lastBody: r.body, lastAt: r.created_at, lastMine: r.sender_id === me.id, unread: 0 };
      map.set(otherId, t);
    }
    if (r.recipient_id === me.id && !r.read_at) t.unread += 1;
  }
  const threads = [...map.values()];
  if (threads.length > 0) {
    const { data: profs } = await supabase.from('profiles')
      .select('id, nickname, name, avatar_color').in('id', threads.map((t) => t.otherId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pById = new Map<string, any>(); (profs ?? []).forEach((p: any) => pById.set(p.id, p));
    threads.forEach((t) => {
      const p = pById.get(t.otherId);
      t.otherName = p?.nickname || p?.name || '회원';
      t.otherColor = p?.avatar_color || null;
    });
  }
  threads.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return threads;
}

// ── 한 스레드의 쪽지(시간순) ─────────────────────────────────────────────────
export async function listThread(otherId: string): Promise<DirectMessage[]> {
  if (IS_MOCK) return [];
  const me = await currentUser();
  if (!me) return [];
  // RLS 가 이미 '내 송수신'으로 좁히므로 상대만 조건으로 걸면 그 상대와의 대화가 된다
  const { data, error } = await supabase
    .from('user_messages')
    .select('id, sender_id, recipient_id, body, created_at, read_at, sender_deleted, recipient_deleted')
    .or(`sender_id.eq.${otherId},recipient_id.eq.${otherId}`)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as MsgRow[])
    .filter((r) => !hiddenForMe(r, me.id))
    .map((r) => ({
      id: r.id, senderId: r.sender_id, recipientId: r.recipient_id, body: r.body,
      createdAt: r.created_at, readAt: r.read_at, mine: r.sender_id === me.id,
    }));
}

// ── 보내기 — 미인증/차단은 서버(RLS·트리거)가 거부, error.message 를 그대로 토스트 ──
export async function sendMessage(recipientId: string, body: string): Promise<DirectMessage> {
  if (IS_MOCK) throw new Error('데모 모드에서는 쪽지를 보낼 수 없습니다');
  const me = await currentUser();
  if (!me) throw new Error('로그인이 필요합니다');
  const trimmed = body.trim();
  if (!trimmed) throw new Error('내용을 입력해 주세요');
  if (trimmed.length > 2000) throw new Error('쪽지는 2,000자까지 보낼 수 있어요');
  const { data, error } = await supabase
    .from('user_messages')
    .insert({ sender_id: me.id, recipient_id: recipientId, body: trimmed })
    .select('id, sender_id, recipient_id, body, created_at, read_at, sender_deleted, recipient_deleted')
    .single();
  if (error) throw new Error(error.message);
  const r = data as MsgRow;
  return {
    id: r.id, senderId: r.sender_id, recipientId: r.recipient_id, body: r.body,
    createdAt: r.created_at, readAt: r.read_at, mine: true,
  };
}

// ── 스레드 읽음 — 그 상대가 보낸 미읽음 전부 read_at 스탬프(수신자만 RLS 허용) ──
export async function markThreadRead(otherId: string): Promise<void> {
  if (IS_MOCK) return;
  const me = await currentUser();
  if (!me) return;
  const { error } = await supabase
    .from('user_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('sender_id', otherId)
    .eq('recipient_id', me.id)
    .is('read_at', null);
  if (error) throw new Error(error.message);
}

// ── 미읽음 총계 — 헤더 뱃지(알림 미읽음과 합산)용. head 카운트라 본문 전송 없음 ──
export async function myUnreadMessageCount(): Promise<number> {
  if (IS_MOCK) return 0;
  const me = await currentUser();
  if (!me) return 0;
  const { count, error } = await supabase
    .from('user_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', me.id)
    .eq('recipient_deleted', false)
    .is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}
