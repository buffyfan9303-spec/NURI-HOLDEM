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

// ── 통합 메시지함 ────────────────────────────────────────────────────────────
export interface InboxThread {
  listingId: string;
  buyerId: string;
  role: 'buyer' | 'seller';      // 내 역할
  counterpartyName: string;       // 상대방(판매자 또는 구매자)
  counterpartyColor: string;
  listingTitle: string;
  listingImage: string | null;
  listingPrice: number;
  listingStatus: string;
  lastContent: string;
  lastAt: string;
}

/** 내가 참여한 모든 대화(구매자=나 OR 판매자=나) — listing+buyer 단위로 묶어 최신순 */
export async function getMyChatThreads(): Promise<InboxThread[]> {
  if (IS_MOCK) return [];
  const me = await getMyId();
  if (!me) return [];
  // RLS(lm_select)로 내 대화만 반환됨
  const { data, error } = await supabase
    .from('listing_messages')
    .select('listing_id, buyer_id, content, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as { listing_id: string; buyer_id: string; content: string; created_at: string }[];
  const map = new Map<string, { listingId: string; buyerId: string; lastContent: string; lastAt: string }>();
  for (const r of rows) {
    const key = `${r.listing_id}|${r.buyer_id}`;
    if (!map.has(key)) map.set(key, { listingId: r.listing_id, buyerId: r.buyer_id, lastContent: r.content, lastAt: r.created_at });
  }
  const convs = [...map.values()];
  if (!convs.length) return [];

  const listingIds = [...new Set(convs.map((c) => c.listingId))];
  const buyerIds = [...new Set(convs.map((c) => c.buyerId))];
  const [{ data: ls }, { data: profs }] = await Promise.all([
    supabase.from('marketplace_listings').select('id, title, images, price, status, seller_id, seller_name, seller_avatar_color').in('id', listingIds),
    supabase.from('profiles').select('id, nickname, name, avatar_color').in('id', buyerIds),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lById = new Map<string, any>(); (ls ?? []).forEach((l: any) => lById.set(l.id, l));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pById = new Map<string, any>(); (profs ?? []).forEach((p: any) => pById.set(p.id, p));

  const out: InboxThread[] = [];
  for (const c of convs) {
    const l = lById.get(c.listingId);
    if (!l) continue;
    const iAmBuyer = c.buyerId === me;
    let name: string, color: string;
    if (iAmBuyer) { name = l.seller_name || '판매자'; color = l.seller_avatar_color || '#5A6175'; }
    else { const p = pById.get(c.buyerId); name = p?.nickname || p?.name || '구매자'; color = p?.avatar_color || '#0EA5E9'; }
    out.push({
      listingId: c.listingId, buyerId: c.buyerId, role: iAmBuyer ? 'buyer' : 'seller',
      counterpartyName: name, counterpartyColor: color,
      listingTitle: l.title, listingImage: (l.images && l.images[0]) || null, listingPrice: l.price, listingStatus: l.status,
      lastContent: c.lastContent, lastAt: c.lastAt,
    });
  }
  out.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return out;
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
