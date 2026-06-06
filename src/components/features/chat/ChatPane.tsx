// src/components/features/chat/ChatPane.tsx
// 1:1 대화 패널(메시지 목록 + 입력) — 중고장터 채팅/메시지함 공용.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../atoms/Toast';
import type { ChatMessage } from '../../../api/chat';
import { getThreadMessages, sendChatMessage, subscribeThread, markThreadRead, getThreadReads } from '../../../api/chat';
import { relativeTime } from '../MarketplaceTab';

export default function ChatPane({ listingId, buyerId, meId, emptyHint, onRead }: {
  listingId: string; buyerId: string; meId: string; emptyHint?: string; onRead?: () => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [coReadAt, setCoReadAt] = useState(0); // 상대가 마지막으로 읽은 시각(ms)
  const scrollRef = useRef<HTMLDivElement>(null);

  // 상대 '읽음' 시각 새로고침
  const refreshReads = useCallback(() => {
    if (!buyerId) return;
    getThreadReads(listingId, buyerId).then((rs) => {
      const co = rs.find((r) => r.readerId !== meId);
      setCoReadAt(co ? new Date(co.lastReadAt).getTime() : 0);
    }).catch(() => {});
  }, [listingId, buyerId, meId]);

  // 이 스레드를 내가 읽음 처리(열람 시 + 새 메시지 도착 시) + 상대 읽음 폴링
  useEffect(() => {
    if (!buyerId) return;
    markThreadRead(listingId, buyerId).then(() => onRead?.()).catch(() => {});
    refreshReads();
    const id = setInterval(refreshReads, 5000);
    return () => clearInterval(id);
  }, [listingId, buyerId, refreshReads, onRead]);

  useEffect(() => {
    if (!buyerId) { setMessages([]); return; }
    let active = true;
    setLoading(true);
    getThreadMessages(listingId, buyerId)
      .then((ms) => { if (active) setMessages(ms); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    const unsub = subscribeThread(listingId, buyerId, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (m.senderId !== meId) markThreadRead(listingId, buyerId).catch(() => {}); // 보는 중이면 읽음
    });
    return () => { active = false; unsub(); };
  }, [listingId, buyerId, meId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setDraft('');
    try {
      const m = await sendChatMessage(listingId, buyerId, text);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      refreshReads();
    } catch (err) {
      setDraft(text);
      toast.show(err instanceof Error ? err.message : '전송에 실패했습니다', 'error');
    } finally { setSending(false); }
  };

  const lastMineIdx = messages.reduce((acc, m, i) => (m.senderId === meId ? i : acc), -1);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} className="flex flex-col gap-1.5 px-4 py-4 flex-1 min-h-[200px] overflow-y-auto bg-surface-base/40">
        {loading ? (
          <p className="m-auto text-2xs text-ink-muted">불러오는 중…</p>
        ) : messages.length === 0 ? (
          <p className="m-auto text-center text-xs text-ink-muted leading-relaxed">{emptyHint ?? '첫 메시지를 보내보세요'}</p>
        ) : messages.map((m, i) => {
          const mine = m.senderId === meId;
          const prev = messages[i - 1];
          const grouped = prev && prev.senderId === m.senderId && (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 60_000);
          const readByCo = mine && i === lastMineIdx && coReadAt >= new Date(m.createdAt).getTime();
          return (
            <div key={m.id} className={['flex flex-col', mine ? 'items-end' : 'items-start', grouped ? 'mt-0' : 'mt-1.5'].join(' ')}>
              <div className={['group max-w-[78%] px-3 py-2 text-sm leading-snug whitespace-pre-wrap break-words shadow-sm',
                mine ? 'bg-gold-300 text-ink-inverse rounded-2xl rounded-br-md' : 'bg-surface-high text-ink-primary rounded-2xl rounded-bl-md'].join(' ')}>
                {m.content}
                <span className={['ml-2 align-bottom text-[9px] tabular-nums', mine ? 'text-ink-inverse/60' : 'text-ink-muted'].join(' ')}>{relativeTime(m.createdAt)}</span>
              </div>
              {readByCo && <span className="text-[9px] text-gold-300/80 mt-0.5 mr-1">읽음</span>}
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex items-center gap-2 px-3 py-2.5 border-t border-border-subtle bg-surface-mid">
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지를 입력하세요" maxLength={1000} disabled={sending}
          className="input flex-1 text-sm rounded-full" />
        <button type="submit" disabled={!draft.trim() || sending}
          className="shrink-0 w-10 h-10 rounded-full bg-gold-300 text-ink-inverse flex items-center justify-center disabled:opacity-40 hover:bg-gold-200 transition-colors" aria-label="전송">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </form>
    </div>
  );
}
