import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backstack';
import { markAllNotificationsRead, markNotificationsRead } from '../../api/notifications';
import type { AppNotification, NotificationType } from '../../api/notifications';
import {
  listMyThreads, listThread, sendMessage, markThreadRead,
  type DirectMessage, type MessageThread,
} from '../../api/messages';
import { findUserForTransfer, type TransferTarget } from '../../api/vouchers';
import { blockUser } from '../../api/blocks';
import { useToast } from '../atoms/Toast';
import SegmentedTabs from '../atoms/SegmentedTabs';
import Icon, { type IconName } from '../atoms/Icon';
import { onColorInkClass } from '../../lib/color';
import { goSubTab } from '../../lib/subTabTransition';
import { relativeTime } from '../../lib/relativeTime';

/** 쪽지 → 알림 진열 순서 — 하위 탭 전환 방향(forward/back) 기준. */
const NOTIF_MODE_ORDER = ['messages', 'notifs'] as const;
/** 알림 필터(전체·안읽음) — 같은 목록이 갈리는 같은 전환이라 스코프를 공유한다. */
const NOTIF_FILTER_ORDER = ['all', 'unread'] as const;

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  /** 1초 후 자동 읽음 처리 */
  onMarkRead: (ids: string[]) => void;
  /** 알림 클릭 시 해당 페이지로 이동 */
  onNavigate?: (notification: AppNotification) => void;
  /** 쪽지 미읽음 수 변동(스레드 로드·읽음 처리) → 헤더 뱃지 합산 갱신 */
  onUnreadMessagesChange?: (n: number) => void;
}

// ── 타입 → Icon 레지스트리 글리프 매핑 (커스텀 인라인 SVG 제거, PATHS 단일 소스) ──
// qna·comment 는 둘 다 대화성 알림이라 가장 가까운 글리프가 동일하다(제목 텍스트로 구분).
const TYPE_GLYPH: Record<NotificationType, IconName> = {
  qna: 'comment',
  comment: 'comment',
  mention: 'user',
  approval: 'check-circle',
  system: 'info',
  reminder: 'clock',
};


// 말풍선 옆 시각 — 당일이면 HH:MM, 그 외엔 M/D
function bubbleTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const AVATAR_FALLBACK = '#5A6175';

// ── 메인 ────────────────────────────────────────────────────────────────────

export default function NotificationPanel({
  open, onClose, notifications, onMarkRead, onNavigate, onUnreadMessagesChange,
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // ── 쪽지/알림 모드 — 헤더 아이콘이 메시지가 됐으므로 쪽지가 기본 ──
  const [mode, setMode] = useState<'messages' | 'notifs'>('messages');
  const [msgView, setMsgView] = useState<'list' | 'thread' | 'compose'>('list');
  const [threads, setThreads] = useState<MessageThread[]>([]);
  // 열자마자 "주고받은 쪽지가 없습니다"가 스치던 것 — 미로드를 로딩으로 시작해 가른다
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeOther, setActiveOther] = useState<{ id: string; name: string; color: string | null } | null>(null);
  const [msgs, setMsgs] = useState<DirectMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // 새 쪽지 — 닉네임 검색
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TransferTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reportUnread = useCallback((ts: MessageThread[]) => {
    onUnreadMessagesChange?.(ts.reduce((s, t) => s + t.unread, 0));
  }, [onUnreadMessagesChange]);

  const reloadThreads = useCallback(() => {
    setThreadsLoading(true);
    listMyThreads()
      .then((ts) => { setThreads(ts); reportUnread(ts); })
      .catch(() => {})
      .finally(() => setThreadsLoading(false));
  }, [reportUnread]);

  // 패널 열릴 때(그리고 쪽지 모드로 전환할 때) 스레드 갱신 — 뱃지의 쪽지 몫도 이때 재계산
  useEffect(() => {
    if (open && mode === 'messages') reloadThreads();
  }, [open, mode, reloadThreads]);

  // 패널이 닫히면 내부 화면을 목록으로 되돌린다(다음 열림이 항상 같은 곳에서 시작)
  useEffect(() => {
    if (!open) { setMsgView('list'); setActiveOther(null); setDraft(''); setQuery(''); setResults([]); }
  }, [open]);

  // ── 스레드 열기: 쪽지 로드 + 읽음 스탬프 + 로컬 미읽음 0 ──
  const openThread = useCallback((other: { id: string; name: string; color: string | null }) => {
    setActiveOther(other);
    setMsgView('thread');
    setMsgs([]);
    setMsgsLoading(true);
    listThread(other.id)
      .then(setMsgs)
      .catch(() => {})
      .finally(() => setMsgsLoading(false));
    markThreadRead(other.id).catch(() => {});
    setThreads((prev) => {
      const next = prev.map((t) => t.otherId === other.id ? { ...t, unread: 0 } : t);
      reportUnread(next);
      return next;
    });
  }, [reportUnread]);

  // 스레드 화면: 새 쪽지가 붙을 때마다 맨 아래로
  useEffect(() => {
    if (msgView === 'thread' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgView, msgs]);

  // ── 보내기 — 미인증/차단 거부는 서버 메시지를 그대로 토스트 ──
  const handleSend = useCallback(async () => {
    if (!activeOther || sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const sent = await sendMessage(activeOther.id, body);
      setDraft('');
      setMsgs((prev) => [...prev, sent]);
      setThreads((prev) => {
        const rest = prev.filter((t) => t.otherId !== activeOther.id);
        const cur = prev.find((t) => t.otherId === activeOther.id);
        return [{
          otherId: activeOther.id, otherName: activeOther.name, otherColor: activeOther.color,
          lastBody: sent.body, lastAt: sent.createdAt, lastMine: true, unread: cur?.unread ?? 0,
        }, ...rest];
      });
    } catch (e) {
      // RLS 거부(미인증 발신·차단 관계)는 raw Postgres 문구("new row violates row-level security…")로
      // 내려온다 — 영어 DB 내부 문구를 그대로 토스트하면 유저는 원인을 알 수 없다(2026-08-28 스윕).
      // api(messages.ts)는 소유 밖이라 표시 계층에서 번역한다. 그 외 서버 메시지는 그대로 노출.
      const raw = e instanceof Error ? e.message : '';
      toast.show(
        /row-level security/i.test(raw)
          ? '쪽지를 보낼 수 없어요. 본인인증을 완료했는지, 차단 관계가 아닌지 확인해 주세요'
          : raw || '쪽지를 보내지 못했어요',
        'error',
      );
    } finally {
      setSending(false);
    }
  }, [activeOther, draft, sending, toast]);

  // ── 새 쪽지 — 닉네임 검색(기존 RPC find_user_for_transfer, 300ms 디바운스) ──
  useEffect(() => {
    if (msgView !== 'compose') return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      findUserForTransfer(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [msgView, query]);

  // ── 차단 — 기존 user_blocks 재사용(피드·검색과 동일 동선) ──
  const handleBlock = useCallback(async () => {
    if (!activeOther) return;
    try {
      await blockUser(activeOther.id, activeOther.name);
      toast.show(`${activeOther.name}님을 차단했습니다. 이후 쪽지가 오지 않아요`, 'success');
      setMsgView('list');
      setActiveOther(null);
      reloadThreads();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '차단하지 못했어요', 'error');
    }
  }, [activeOther, toast, reloadThreads]);

  // ── 알림(기존 계약 그대로) ─────────────────────────────────────────────────
  // 패널이 열릴 때 unread ID를 스냅샷으로 보존 (닫을 때 읽음 처리용)
  const unreadOnOpenRef = useRef<string[]>([]);
  useEffect(() => {
    if (open) {
      unreadOnOpenRef.current = notifications.filter((n) => !n.read).map((n) => n.id);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 패널 닫힐 때 읽음 일괄 처리 (열려 있을 때는 읽음 상태 유지 → "안읽음" 탭 정상 동작)
  const handleClose = useCallback(() => {
    if (unreadOnOpenRef.current.length > 0) {
      onMarkRead(unreadOnOpenRef.current);
      unreadOnOpenRef.current = [];
    }
    onClose();
  }, [onMarkRead, onClose]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onClick); };
  }, [open, handleClose]);

  // 뒤로가기 → 패널 닫기(읽음 처리 포함)
  useBackClose(open, handleClose);

  // ── 부팅 딥링크형 링크('?v=' '?s=' '?tab=' '#tool=' '#gto=' …) 직접 처리 ──
  // 왜: App 의 SPA 핸들러(onNavigate)는 '/경로' 형태만 안다 — 쿼리·해시형을 넘기면
  // '제목 토스트' 막다른 길이 된다. 이런 링크는 앱 부팅 시에만 소비되므로(App.tsx 의
  // deepLinked ref 1회 게이트) 전체 재진입 내비게이션으로 확실히 연다.
  const openBootDeepLink = useCallback((n: AppNotification, link: string) => {
    // #tool= 은 도구 탭(ToolsPanel)이 마운트돼 있어야 hashchange 를 듣는다 → ?tab=tools 로 재진입
    const target = link.startsWith('#tool=') ? `/?tab=tools${link}` : link;
    // 전체 리로드가 진행 중인 읽음 fetch 를 끊으므로, 서버 커밋을 마친 뒤 이동한다.
    // (기존 '닫을 때 일괄 읽음' 계약 유지 — 스냅샷의 미읽음 전부 + 클릭한 행)
    const ids = Array.from(new Set([n.id, ...unreadOnOpenRef.current]));
    unreadOnOpenRef.current = [];
    markNotificationsRead(ids).catch(() => {}).finally(() => { window.location.assign(target); });
  }, []);

  // 모두 읽음 — 로컬 상태(onMarkRead: 뱃지 즉시 감소) + 서버는 조건 update 로 50건 밖까지
  const handleMarkAll = useCallback(() => {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    if (ids.length) { onMarkRead(ids); unreadOnOpenRef.current = []; }
    markAllNotificationsRead().catch(() => {}); // 실패해도 onMarkRead 경로가 보이는 50건은 커밋
  }, [notifications, onMarkRead]);

  if (!open) return null;

  const visible = filter === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications;

  const inSubView = mode === 'messages' && msgView !== 'list';

  return (
    <>
      {/* 모바일에서만 배경 dim (탭하면 닫힘) */}
      <div
        className="fixed inset-0 z-40 bg-black/30 sm:hidden animate-fade-in"
        onClick={handleClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="알림"
        className={[
          // 모바일: 화면 우측 1rem 안쪽으로 고정, 헤더 바로 아래(노치 safe-area만큼 헤더가 늘어나므로 포함)
          'fixed top-[calc(theme(spacing.header-h)+env(safe-area-inset-top)+0.5rem)] right-page-x',
          'left-page-x sm:left-auto',
          // 데스크톱: 우측에 380px 카드
          'sm:w-[380px] sm:right-page-x-md',
          // 공통
          'z-50 bg-surface-mid border border-border-default rounded-card shadow-dialog',
          'animate-slide-up',
          'max-h-[calc(100vh-theme(spacing.header-h)-env(safe-area-inset-top)-1rem)] flex flex-col overflow-hidden',
        ].join(' ')}
      >
        {/* 헤더 — 좌: [쪽지|알림] 세그먼트(서브 화면에선 뒤로+제목) / 우: 모드별 액션 */}
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle">
          {inSubView ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setMsgView('list'); setActiveOther(null); reloadThreads(); }}
                aria-label="뒤로"
                className="hit relative -ml-1 flex h-7 w-7 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors"
              >
                <Icon name="chevron-left" size={16} />
              </button>
              <h2 className="min-w-0 truncate text-sm font-semibold text-ink-primary">
                {msgView === 'compose' ? '새 쪽지' : activeOther?.name ?? '쪽지'}
              </h2>
            </div>
          ) : (
            <div data-notif-tabbar="">
              <SegmentedTabs
                items={[{ key: 'messages', label: '쪽지' }, { key: 'notifs', label: '알림' }]}
                value={mode}
                onChange={(v) => goSubTab('notif-tab', NOTIF_MODE_ORDER, mode, v, () => setMode(v))}
              />
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2 text-2xs">
            {mode === 'notifs' && (
              <>
                {notifications.some((n) => !n.read) && (
                  <button
                    type="button"
                    onClick={handleMarkAll}
                    className="text-2xs font-semibold text-accent-300 hover:text-accent-200 transition-colors focus:outline-none"
                  >
                    모두 읽음
                  </button>
                )}
                <SegmentedTabs items={[{ key: 'all', label: '전체' }, { key: 'unread', label: '안읽음' }]} value={filter}
                  onChange={(v) => goSubTab('notif-tab', NOTIF_FILTER_ORDER, filter, v, () => setFilter(v))} />
              </>
            )}
            {mode === 'messages' && msgView === 'list' && (
              <button
                type="button"
                onClick={() => { setQuery(''); setResults([]); setMsgView('compose'); }}
                className="flex items-center gap-1 rounded-input border border-border-subtle px-2 py-1.5 text-2xs font-semibold text-ink-secondary hover:bg-surface-high hover:text-ink-primary transition-colors"
              >
                <Icon name="edit" size={12} />
                새 쪽지
              </button>
            )}
            {mode === 'messages' && msgView === 'thread' && activeOther && (
              <button
                type="button"
                onClick={handleBlock}
                className="text-2xs font-semibold text-ink-muted hover:text-danger-light transition-colors focus:outline-none"
              >
                차단
              </button>
            )}
          </div>
        </header>

        {/* ── 쪽지: 스레드 목록 ── */}
        {mode === 'messages' && msgView === 'list' && (
          <ul data-notif-panel="" className="flex-1 overflow-y-auto">
            {threads.length === 0 ? (
              <li className="flex flex-col items-center justify-center py-12 gap-2 text-ink-muted">
                <Icon name="comment" size={32} strokeWidth={1.5} />
                <p className="text-xs">{threadsLoading ? '쪽지를 불러오는 중…' : '주고받은 쪽지가 없습니다'}</p>
              </li>
            ) : (
              threads.map((t) => (
                <li
                  key={t.otherId}
                  onClick={() => openThread({ id: t.otherId, name: t.otherName, color: t.otherColor })}
                  className={[
                    'relative flex items-center gap-3 px-4 py-3',
                    'border-b border-border-subtle last:border-b-0',
                    'hover:bg-surface-high active:bg-surface-high cursor-pointer transition-colors',
                  ].join(' ')}
                >
                  {/* 미읽음: 알림 행과 동일 문법 — 좌측 2px 액센트 바 */}
                  {t.unread > 0 && (
                    <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-accent-300" aria-label="안읽음" />
                  )}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${onColorInkClass(t.otherColor || AVATAR_FALLBACK)}`}
                    style={{ background: t.otherColor || AVATAR_FALLBACK }}
                  >
                    <span className="text-sm font-bold leading-none">{t.otherName.slice(0, 1)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={[
                        'text-xs leading-tight truncate min-w-0',
                        t.unread > 0 ? 'font-semibold text-ink-primary' : 'font-medium text-ink-secondary',
                      ].join(' ')}>
                        {t.otherName}
                      </p>
                      <span className="text-2xs text-ink-muted shrink-0 tabular-nums">{relativeTime(t.lastAt)}</span>
                    </div>
                    {/* 프라이버시: 본문 미리보기는 1줄 truncate 만 */}
                    <p className="mt-0.5 truncate text-xs leading-snug text-ink-muted">
                      {t.lastMine ? `나: ${t.lastBody}` : t.lastBody}
                    </p>
                  </div>
                  <span className="w-4 shrink-0 flex items-center justify-center" aria-hidden>
                    {t.unread > 0
                      ? <span className="h-2 w-2 rounded-full bg-accent-300" />
                      : <Icon name="chevron-right" size={14} className="text-ink-muted" />}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}

        {/* ── 쪽지: 스레드 뷰(말풍선 + 입력) ── */}
        {mode === 'messages' && msgView === 'thread' && (
          <>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {msgs.length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-muted">
                  {msgsLoading ? '쪽지를 불러오는 중…' : '첫 쪽지를 보내 보세요'}
                </p>
              ) : (
                msgs.map((m) => (
                  <div key={m.id} className={['flex items-end gap-1.5', m.mine ? 'justify-end' : 'justify-start'].join(' ')}>
                    {m.mine && (
                      <span className="shrink-0 text-2xs text-ink-muted tabular-nums">{bubbleTime(m.createdAt)}</span>
                    )}
                    <p className={[
                      'max-w-[75%] whitespace-pre-wrap break-words rounded-card px-3 py-2 text-xs leading-snug',
                      m.mine
                        ? 'rounded-br-sm bg-accent-300 text-white'
                        : 'rounded-bl-sm bg-surface-high text-ink-primary',
                    ].join(' ')}>
                      {m.body}
                    </p>
                    {!m.mine && (
                      <span className="shrink-0 text-2xs text-ink-muted tabular-nums">{bubbleTime(m.createdAt)}</span>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-end gap-2 border-t border-border-subtle px-3 py-2.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="쪽지 입력…"
                aria-label="쪽지 입력"
                className="min-w-0 flex-1 resize-none rounded-input border border-border-subtle bg-surface-high/60 px-3 py-2 text-xs text-ink-primary placeholder:text-ink-muted focus:border-accent-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                aria-label="보내기"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-300 text-white transition-opacity disabled:opacity-40"
              >
                <Icon name="send" size={14} />
              </button>
            </div>
          </>
        )}

        {/* ── 쪽지: 새 쪽지(닉네임 검색 → 수신자 선택) ── */}
        {mode === 'messages' && msgView === 'compose' && (
          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-border-subtle px-4 py-3">
              <div className="relative">
                <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="받는 사람 닉네임 검색"
                  aria-label="받는 사람 닉네임 검색"
                  className="w-full rounded-input border border-border-subtle bg-surface-high/60 py-2 pl-8 pr-3 text-xs text-ink-primary placeholder:text-ink-muted focus:border-accent-300 focus:outline-none"
                />
              </div>
            </div>
            <ul>
              {query.trim().length < 2 ? (
                <li className="px-4 py-8 text-center text-xs text-ink-muted">닉네임을 2자 이상 입력해 주세요</li>
              ) : searching ? (
                <li className="px-4 py-8 text-center text-xs text-ink-muted">검색 중…</li>
              ) : results.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs text-ink-muted">일치하는 회원이 없습니다</li>
              ) : (
                results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => openThread({ id: r.id, name: r.display, color: null })}
                      className="flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left hover:bg-surface-high transition-colors"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: AVATAR_FALLBACK }}>
                        <span className="text-xs font-bold leading-none">{r.display.slice(0, 1)}</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{r.display}</span>
                      {r.verified && (
                        <span className="shrink-0 rounded-badge bg-emerald-500/15 px-1.5 py-0.5 text-2xs font-bold text-emerald-400">인증</span>
                      )}
                      <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {/* ── 알림 목록(기존 UI 전량 유지) ── */}
        {mode === 'notifs' && (
        <ul data-notif-panel="" className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <li className="flex flex-col items-center justify-center py-12 gap-2 text-ink-muted">
              <Icon name="bell" size={32} strokeWidth={1.5} />
              <p className="text-xs">새 알림이 없습니다</p>
            </li>
          ) : (
            visible.map((n) => (
              <li
                key={n.id}
                onClick={() => {
                  // 클릭한 그 알림은 즉시 읽음 — 뱃지가 이동 전에 바로 준다(닫힘 일괄 처리만 기다리지 않게)
                  if (!n.read) onMarkRead([n.id]);
                  const link = n.link ?? '';
                  if (/^https?:\/\//.test(link)) {
                    // 정규화(api normalizeLink) 후에도 절대 URL = 외부 도메인 — 앱을 떠나지 않고 새 탭
                    window.open(link, '_blank', 'noopener');
                  } else if (link.startsWith('?') || link.startsWith('#')) {
                    openBootDeepLink(n, link); // 읽음 커밋 후 전체 재진입 — 패널 닫힘은 리로드가 대신한다
                    return;
                  } else if (onNavigate) {
                    onNavigate(n); // '/경로' 형태 전부 — App 핸들러(미지 경로는 토스트 폴백 내장)
                  }
                  handleClose();
                }}
                className={[
                  // 행 문법 고정: 아바타 + 텍스트(제목 1줄 + 본문 2줄 예약) + 우측 고정폭 자리
                  // → 텍스트 길이와 무관하게 모든 행 높이 동일
                  'relative flex items-center gap-3 px-4 py-3',
                  'border-b border-border-subtle last:border-b-0',
                  'hover:bg-surface-high active:bg-surface-high cursor-pointer transition-colors',
                ].join(' ')}
              >
                {/* 안읽음: 배경 틴트 대신 좌측 2px 액센트 바 하나 */}
                {!n.read && (
                  <span
                    className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-accent-300"
                    aria-label="안읽음"
                  />
                )}

                {/* 좌측: 발신자 아바타 (텍스트가 있으면 텍스트, 없으면 타입 글리프) */}
                <div className="relative shrink-0">
                  <div
                    className={[
                      'w-9 h-9 rounded-full flex items-center justify-center',
                      // 발신자 아바타 배경은 유저 데이터(avatarColor)라 흰 글씨를 고정할 수 없다 — 휘도로 잉크 전환.
                      n.avatarColor ? onColorInkClass(n.avatarColor) : 'bg-surface-high text-ink-secondary',
                    ].join(' ')}
                    style={n.avatarColor ? { background: n.avatarColor } : undefined}
                  >
                    {n.avatarText
                      ? <span className="text-sm font-bold leading-none">{n.avatarText}</span>
                      : <Icon name={TYPE_GLYPH[n.type]} size={16} />}
                  </div>
                  {/* 우하단 겹침 타입 글리프 배지 (텍스트 아바타일 때) */}
                  {n.avatarText && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface-mid border border-border-default flex items-center justify-center text-ink-secondary">
                      <Icon name={TYPE_GLYPH[n.type]} size={10} strokeWidth={2.5} />
                    </span>
                  )}
                </div>

                {/* 내용: 제목 1줄 truncate + 본문 2줄 클램프(min-h로 2줄 공간 예약) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={[
                      'text-xs leading-tight truncate min-w-0',
                      n.read ? 'font-medium text-ink-secondary' : 'font-semibold text-ink-primary',
                    ].join(' ')}>
                      {n.title}
                    </p>
                    <span className="text-2xs text-ink-muted shrink-0 tabular-nums">
                      {relativeTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted leading-snug line-clamp-2 min-h-[2lh]">
                    {n.message}
                  </p>
                </div>

                {/* 우측 고정폭 자리 — 썸네일 필드가 생기면 이 슬롯을 채운다. 지금은 딥링크 affordance */}
                <span className="w-4 shrink-0 flex items-center justify-center text-ink-muted" aria-hidden>
                  {onNavigate && <Icon name="chevron-right" size={14} />}
                </span>
              </li>
            ))
          )}
        </ul>
        )}

        {/* (푸터 '모두 읽음으로 표시'는 헤더 '모두 읽음'으로 이관 — 같은 기능 2곳 중복 방지) */}
      </div>
    </>
  );
}
