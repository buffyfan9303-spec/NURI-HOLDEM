// src/components/features/chat/ChatPane.tsx
// 1:1 대화 패널(메시지 목록 + 입력) — 중고장터 채팅/메시지함 공용.
// Dverse 문법: 인라인 타임스탬프(버블 안, 그룹 마지막만) + 데이 디바이더 + check-double 읽음 글리프.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../atoms/Icon';
import { useToast } from '../../atoms/Toast';
import type { ChatMessage } from '../../../api/chat';
import { getThreadMessages, sendChatMessage, subscribeThread, markThreadRead, getThreadReads } from '../../../api/chat';

const NEAR_BOTTOM_PX = 80;       // 이 안쪽이면 '하단 근처' — 새 메시지에 자동 추종
const COMPOSER_MAX_PX = 118;     // textarea 최대 높이 ≈ 5줄(줄 20px × 5 + 패딩/보더)
const GROUP_WINDOW_MS = 60_000;  // 같은 사람 연속 메시지 그룹 판정 간격

const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function ChatPane({ listingId, buyerId, meId, emptyHint, onRead }: {
  listingId: string; buyerId: string; meId: string; emptyHint?: string; onRead?: () => void;
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [coReadAt, setCoReadAt] = useState(0); // 상대가 마지막으로 읽은 시각(ms)
  const [newCount, setNewCount] = useState(0); // 위로 스크롤해 읽는 동안 도착한 새 메시지 수
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);          // 사용자가 하단 근처에 있는지(스크롤마다 갱신)
  const stickToBottomRef = useRef(false);      // 내 전송 직후 = 무조건 하단
  const didInitialScrollRef = useRef(false);   // 첫 로드는 애니메이션 없이 즉시 하단
  const prevLenRef = useRef(0);

  // 상대 '읽음' 시각 새로고침
  const refreshReads = useCallback(() => {
    if (!buyerId) return;
    getThreadReads(listingId, buyerId).then((rs) => {
      const co = rs.find((r) => r.readerId !== meId);
      setCoReadAt(co ? new Date(co.lastReadAt).getTime() : 0);
    }).catch(() => {});
  }, [listingId, buyerId, meId]);

  // ⚠ onRead 는 부모가 인라인 화살표로 넘겨 매 렌더마다 신원이 바뀐다. 의존성에 두면
  //   [읽음처리 → onRead → 부모 setState → 리렌더 → 이펙트 재실행] 이 끝없이 돌아
  //   읽음 upsert(쓰기)와 스레드 조회가 네트워크 왕복 속도로 폭주했다(5초 폴링도 매번 취소돼 안 돎).
  //   최신 콜백은 ref 로 들고, 이펙트는 스레드가 바뀔 때만 돌게 한다.
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; });

  // 이 스레드를 내가 읽음 처리(열람 시 + 새 메시지 도착 시) + 상대 읽음 폴링(5초 — Realtime 전환은 오너 게이트)
  useEffect(() => {
    if (!buyerId) return;
    markThreadRead(listingId, buyerId).then(() => onReadRef.current?.()).catch(() => {});
    refreshReads();
    const id = setInterval(refreshReads, 5000);
    return () => clearInterval(id);
  }, [listingId, buyerId, refreshReads]);

  // 스레드 전환 시 스크롤 상태 초기화
  useEffect(() => {
    didInitialScrollRef.current = false;
    prevLenRef.current = 0;
    nearBottomRef.current = true;
    stickToBottomRef.current = false;
    setNewCount(0);
  }, [listingId, buyerId]);

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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // near-bottom 스크롤 규칙:
  //  · 첫 로드 = 즉시 하단(애니메이션 없음)  · 내 전송 직후 = 항상 하단
  //  · 하단 근처(≤80px)면 부드럽게 추종  · 위에서 읽는 중이면 강제 스크롤 금지 + '새 메시지 N' 핀
  useEffect(() => {
    const prevLen = prevLenRef.current;
    prevLenRef.current = messages.length;
    if (messages.length === 0) { setNewCount(0); return; }
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scrollToBottom('auto');
      return;
    }
    const appended = messages.length - prevLen;
    if (appended <= 0) return;
    if (stickToBottomRef.current || nearBottomRef.current) {
      stickToBottomRef.current = false;
      scrollToBottom('smooth');
    } else {
      setNewCount((c) => c + appended);
    }
  }, [messages, scrollToBottom]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    if (near) setNewCount(0);
  };

  // 컴포저 auto-grow(1→5줄) — 애니메이션 아님: 입력 즉시 높이 재계산만 한다
  useEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [draft]);

  const doSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true); setDraft('');
    stickToBottomRef.current = true; // 내 전송 직후는 항상 하단(구독 경로로 먼저 도착해도 동일)
    try {
      const m = await sendChatMessage(listingId, buyerId, text);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      refreshReads();
    } catch (err) {
      stickToBottomRef.current = false;
      setDraft(text);
      toast.show(err instanceof Error ? err.message : '전송에 실패했습니다', 'error');
    } finally { setSending(false); }
  };

  const send = (e: React.FormEvent) => { e.preventDefault(); void doSend(); };

  const lastMineIdx = messages.reduce((acc, m, i) => (m.senderId === meId ? i : acc), -1);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 사기 방지 고정 안내 — 대화가 시작되는 바로 그 지점에 상시 노출(장터 신뢰 장치) */}
      <p className="shrink-0 flex items-center gap-1.5 border-b border-border-subtle bg-amber-500/[0.07] px-4 py-1.5 text-2xs leading-snug text-amber-300">
        <Icon name="alert" size={12} className="shrink-0" />
        <span>선입금 요구는 거절하세요 — 직거래·대면 확인 권장, 의심 시 매물 화면에서 신고</span>
      </p>
      <div className="relative flex-1 min-h-[200px] flex flex-col">
        <div ref={scrollRef} onScroll={handleScroll} role="log" aria-live="polite"
          className="flex flex-col gap-1.5 px-4 py-4 flex-1 min-h-0 overflow-y-auto bg-surface-base/40">
          {loading ? (
            <p className="m-auto text-2xs text-ink-muted">불러오는 중…</p>
          ) : messages.length === 0 ? (
            <p className="m-auto text-center text-xs text-ink-muted leading-relaxed">{emptyHint ?? '첫 메시지를 보내보세요'}</p>
          ) : messages.map((m, i) => {
            const mine = m.senderId === meId;
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const showDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            const grouped = !showDay && !!prev && prev.senderId === m.senderId
              && (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS);
            const nextGrouped = !!next && next.senderId === m.senderId
              && dayKey(next.createdAt) === dayKey(m.createdAt)
              && (new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() < GROUP_WINDOW_MS);
            const showMeta = !nextGrouped; // 연속 그룹의 마지막에만 시각 메타
            const readByCo = mine && i === lastMineIdx && coReadAt >= new Date(m.createdAt).getTime();
            return (
              <Fragment key={m.id}>
                {showDay && (
                  <div className="my-2 text-center text-2xs text-ink-muted">
                    {dayLabel(m.createdAt)}
                  </div>
                )}
                <div className={['flex flex-col', mine ? 'items-end' : 'items-start', grouped ? 'mt-0' : 'mt-1.5'].join(' ')}>
                  <div className={['group max-w-[78%] px-3 py-2 text-sm leading-snug whitespace-pre-wrap break-words shadow-sm',
                    mine ? 'bg-accent-300 text-white rounded-2xl rounded-br-md' : 'bg-surface-high text-ink-primary rounded-2xl rounded-bl-md'].join(' ')}>
                    {m.content}
                    {showMeta && (
                      <span className={['ml-2 align-bottom text-2xs tabular-nums', mine ? 'text-ink-inverse/60' : 'text-ink-muted'].join(' ')}>
                        {timeLabel(m.createdAt)}
                      </span>
                    )}
                  </div>
                  {mine && i === lastMineIdx && (
                    <span className="mt-0.5 mr-1 inline-flex items-center">
                      <Icon name="check-double" size={12} className={readByCo ? 'text-accent-300' : 'text-ink-muted'} />
                      <span className="sr-only">{readByCo ? '읽음' : '전송됨'}</span>
                    </span>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
        {/* 위에서 읽는 중 도착한 새 메시지 — 강제 스크롤 대신 핀 버튼으로 알림 */}
        {newCount > 0 && (
          <button type="button" onClick={() => { setNewCount(0); scrollToBottom('smooth'); }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-accent-300 text-white pl-2.5 pr-3 py-1.5 text-2xs font-medium shadow-md hover:bg-accent-200 transition-colors">
            <Icon name="chevron-down" size={12} />
            새 메시지 {newCount}
          </button>
        )}
      </div>
      <form onSubmit={send} className="flex items-end gap-2 px-3 py-2.5 border-t border-border-subtle bg-surface-mid">
        <textarea ref={draftRef} rows={1} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter 전송 / Shift+Enter 줄바꿈 — 한글 IME 조합 중(isComposing) Enter 는 무시
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void doSend(); }
          }}
          placeholder="메시지를 입력하세요" maxLength={1000} disabled={sending}
          className="input flex-1 text-sm rounded-2xl resize-none overflow-y-auto"
          style={{ minHeight: '2.4rem', maxHeight: `${COMPOSER_MAX_PX}px` }} />
        <button type="submit" disabled={!draft.trim() || sending}
          className="shrink-0 w-10 h-10 rounded-full bg-accent-300 text-white flex items-center justify-center disabled:opacity-40 hover:bg-accent-200 transition-colors" aria-label="전송">
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
}
