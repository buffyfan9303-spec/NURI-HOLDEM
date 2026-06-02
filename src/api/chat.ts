// src/api/chat.ts — 중고장터 1:1 실시간 채팅
import { supabase, IS_MOCK } from '../lib/supabase';

export interface ChatMessage {
  id: string;
  listingId: string;
  buyerId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface ChatThread {
  buyerId: string;
  buyerName: string;
  lastContent: string;
  lastAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMsg(r: any): ChatMessage {
  return {
    id: r.id, listingId: r.listing_id, buyerId: r.buyer_id,
    senderId: r.sender_id, content: r.content, createdAt: r.created_at,
  };
}

export async function getMyId(): Promise<string | null> {
  if (IS_MOCK) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// 특정 스레드(매물 + 구매자)의 메시지 (시간순)
export async function getThreadMessages(listingId: string, buyerId: string): Promise<ChatMessage[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('listing_messages')
    .select('*')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToMsg);
}

export async function sendChatMessage(listingId: string, buyerId: string, content: string): Promise<ChatMessage> {
  if (IS_MOCK) throw new Error('데모 모드에서는 메시지를 보낼 수 없습니다');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const trimmed = content.trim();
  if (!trimmed) throw new Error('내용을 입력하세요');
  const { data, error } = await supabase
    .from('listing_messages')
    .insert({ listing_id: listingId, buyer_id: buyerId, sender_id: user.id, content: trimmed.slice(0, 1000) })
    .select('*').single();
  if (error) throw error;
  return rowToMsg(data);
}

// 판매자: 이 매물에 들어온 문의 스레드(구매자별 최신 메시지)
export async function getListingThreads(listingId: string): Promise<ChatThread[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('listing_messages')
    .select('buyer_id, content, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as { buyer_id: string; content: string; created_at: string }[];
  const seen = new Map<string, ChatThread>();
  for (const r of rows) {
    if (!seen.has(r.buyer_id)) {
      seen.set(r.buyer_id, { buyerId: r.buyer_id, buyerName: '구매자', lastContent: r.content, lastAt: r.created_at });
    }
  }
  const threads = Array.from(seen.values());
  const ids = threads.map((t) => t.buyerId);
  if (ids.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, nickname, name').in('id', ids);
    const nameById = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profs ?? []).forEach((p: any) => nameById.set(p.id, p.nickname || p.name || '구매자'));
    threads.forEach((t) => { t.buyerName = nameById.get(t.buyerId) ?? '구매자'; });
  }
  return threads;
}

// 실시간 구독 — 해당 스레드에 새 메시지가 도착하면 콜백 (RLS로 권한 제한)
export function subscribeThread(
  listingId: string,
  buyerId: string,
  onInsert: (m: ChatMessage) => void,
): () => void {
  if (IS_MOCK) return () => {};
  const channel = supabase
    .channel(`lm:${listingId}:${buyerId}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'listing_messages', filter: `listing_id=eq.${listingId}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        const m = rowToMsg(payload.new);
        if (m.buyerId === buyerId) onInsert(m);
      },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
