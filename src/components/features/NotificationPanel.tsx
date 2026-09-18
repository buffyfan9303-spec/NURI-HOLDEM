import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
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
import LoadErrorCard from '../atoms/LoadErrorCard';
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
  /** 쿼리·해시형 링크('?s=' '?v=' '?tab=' '#tool=' …)를 **앱 안에서** 여는 App.openInternalLink.
   *  true 면 처리됐다 — 아래 전체 리로드(location.assign)로 떨어지지 않는다(2026-09-17 연결 감사 D). */
  onInternalLink?: (u: URL) => boolean;
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
  open, onClose, notifications, onMarkRead, onNavigate, onUnreadMessagesChange, onInternalLink,
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // [C] 닫는 모션 — Modal.tsx 의 render/closing + 지연 unmount 패턴(같은 문법, 새 문법을 만들지 않는다).
  //   예전엔 `if (!open) return null` 이라 열 때(fade-in + slide-up 0.32s)와 달리 닫을 때는 0 프레임이었다.
  //   패널은 시트가 아니라 뜨는 카드(popover)라 반대 방향 slide 대신 대칭인 fade-out(0.18s)을 쓴다.
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  // 🔴 2026-09-19 회귀 근본 원인(team-lead 실측 + 직접 재현·console 계측으로 확인) — Modal.tsx 의 패턴을
  //   `useEffect` 로 그대로 옮겼더니, 여는 방향에도 **원치 않는 한 틱 지연**이 생겼다: `useEffect` 는
  //   커밋 뒤 페인트가 지나간 다음에 돈다 — `open` 이 true 로 바뀐 첫 렌더는 아직 `render=false`(과거 값)
  //   라 패널이 안 그려진 채로 한 프레임 페인트되고, 그다음 렌더에서야 실제로 나타난다.
  //   재현: 벨 클릭 직후(중간에 콘텐츠를 기다리지 않고) 같은 자리를 즉시 다시 클릭하면, 그 클릭이
  //   아직 안 그려진 스크림/패널을 통과해 **뒤 화면(예: 헤더 계정 메뉴)에 그대로 꽂혔다**
  //   (account-isolation.spec.ts 의 '쪽지 패널' 케이스 — 응답을 hold 시켜 콘텐츠 대기가 없는 경로에서만 드러났다).
  //   `useLayoutEffect` 로 바꾸면 브라우저가 페인트하기 **전에** 동기적으로 `render` 를 맞춰 넣어
  //   그 한 프레임이 아예 생기지 않는다. 닫힘(지연 unmount)에는 이 문제가 없다 — 그쪽은 "그려진 채로
  //   너무 오래 남는" 문제라 위 scrim/panel 의 pointer-events 분기로 따로 막는다.
  useLayoutEffect(() => {
    if (open) { setRender(true); setClosing(false); return; }
    setClosing(true);
    const t = window.setTimeout(() => setRender(false), 180); // animate-fade-out 과 같은 길이(index.css)
    return () => window.clearTimeout(t);
  }, [open]);

  // ── 쪽지/알림 모드 — 헤더 아이콘이 메시지가 됐으므로 쪽지가 기본 ──
  const [mode, setMode] = useState<'messages' | 'notifs'>('messages');
  const [msgView, setMsgView] = useState<'list' | 'thread' | 'compose'>('list');
  const [threads, setThreads] = useState<MessageThread[]>([]);
  // 열자마자 "주고받은 쪽지가 없습니다"가 스치던 것 — 미로드를 로딩으로 시작해 가른다
  const [threadsLoading, setThreadsLoading] = useState(true);
  // 조회 실패 — 이 두 줄이 없던 동안 `.catch(() => {})` 가 실패를 삼켜, 서버가 거부하거나
  // 네트워크가 끊겨도 화면은 '주고받은 쪽지가 없습니다'였다. 장터 거래 문의가 오간 사용자는
  // 상대가 대화를 지운 줄 알고 다시 글을 쓰거나 거래를 접는다 — 실패는 실패로 말한다.
  const [threadsErr, setThreadsErr] = useState<unknown>(null);
  const [msgsErr, setMsgsErr] = useState<unknown>(null);
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

  // ── 계정 경계(2026-09-10) ──
  // 이 패널은 AppHeader 에 항상 마운트라 App 의 [user?.id] 리셋(알림 배열)이 여기 쪽지 state 에는 닿지 않았다.
  // A 가 패널을 열고 로그아웃 → 같은 탭에서 B 가 로그인해 열면 B 의 응답이 올 때까지 A 의 대화 상대·마지막 쪽지가
  // B 에게 보였고, B 의 조회가 실패하면 '보던 목록은 그대로 둔다' 정책이 A 의 목록을 영구히 남겼다(공용 PC 실제 동선).
  const { user } = useAuth();
  const uid = user?.id ?? null;
  // 스레드 조회 세대 — 가장 최근 호출만 화면에 닿는다. 계정이 바뀌면 세대를 올려 비행 중인 이전 계정 응답을 전부 버린다.
  const threadsSeq = useRef(0);
  // 지금 열려 있는 상대 — 늦은 스레드 응답·전송 결과가 다른 상대의 대화에 붙지 않게 응답 시점에 비교한다(ChatPane onReadRef 조리법).
  const activeOtherRef = useRef(activeOther);
  useEffect(() => { activeOtherRef.current = activeOther; });
  useEffect(() => {
    threadsSeq.current++;
    setThreads([]); setThreadsErr(null); setThreadsLoading(true);
    setMsgView('list'); setActiveOther(null); setMsgs([]); setMsgsErr(null); setDraft('');
  }, [uid]);

  const reloadThreads = useCallback(() => {
    const seq = ++threadsSeq.current;
    setThreadsLoading(true);
    listMyThreads()
      .then((ts) => { if (seq !== threadsSeq.current) return; setThreads(ts); setThreadsErr(null); reportUnread(ts); })
      .catch((e) => { if (seq === threadsSeq.current) setThreadsErr(e); })
      .finally(() => { if (seq === threadsSeq.current) setThreadsLoading(false); });
  }, [reportUnread]);

  // 패널 열릴 때(그리고 쪽지 모드로 전환할 때) 스레드 갱신 — 뱃지의 쪽지 몫도 이때 재계산.
  // uid 도 본다: 로그인 랜딩 위에서 로그인이 확정되는 경우처럼 열린 채 계정이 바뀌면 새 계정으로 다시 읽는다.
  useEffect(() => {
    if (open && mode === 'messages') reloadThreads();
  }, [open, mode, reloadThreads, uid]);

  // 패널이 닫히면 내부 화면을 목록으로 되돌린다(다음 열림이 항상 같은 곳에서 시작)
  useEffect(() => {
    if (!open) { setMsgView('list'); setActiveOther(null); setDraft(''); setQuery(''); setResults([]); }
  }, [open]);

  // 대화 본문 조회 정본 — 처음 열 때와 실패 카드의 '다시 시도'가 같은 함수를 쓴다(껍데기 버튼 방지).
  const loadThread = useCallback((otherId: string) => {
    setMsgsLoading(true);
    // 응답이 왔을 때 '지금도 이 상대인가' — A1(느림)을 열고 뒤로가기 → A2(빠름)를 연 뒤 A1 응답이 도착하면
    // 헤더는 A2 인데 본문이 A1 과의 대화로 덮였다. 재시도 버튼도 이 함수를 거치므로 함께 보호된다.
    const still = () => activeOtherRef.current?.id === otherId;
    listThread(otherId)
      .then((ms) => { if (still()) { setMsgs(ms); setMsgsErr(null); } })
      .catch((e) => { if (still()) setMsgsErr(e); })
      .finally(() => { if (still()) setMsgsLoading(false); });
  }, []);

  // ── 스레드 열기: 쪽지 로드 + 읽음 스탬프 + 로컬 미읽음 0 ──
  const openThread = useCallback((other: { id: string; name: string; color: string | null }) => {
    setActiveOther(other);
    setMsgView('thread');
    setMsgs([]);
    setMsgsErr(null);
    loadThread(other.id);
    markThreadRead(other.id).catch(() => {});
    setThreads((prev) => {
      const next = prev.map((t) => t.otherId === other.id ? { ...t, unread: 0 } : t);
      reportUnread(next);
      return next;
    });
  }, [reportUnread, loadThread]);

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
      // 보낸 본문이 아직 입력칸에 그대로면 비운다 — 전송 중 다른 상대에게 새로 쓴 글은 지우지 않는다.
      setDraft((d) => (d.trim() === body ? '' : d));
      // 전송 중 뒤로가기→다른 상대를 열었으면 결과를 그 화면에 붙이지 않는다(서버엔 정상 저장 — 그 상대를 다시 열면 보인다).
      // 예전엔 방금 보낸 쪽지가 엉뚱한 상대의 대화에 나타나 '잘못 보냈다'고 믿게 했다. recipientId 는 messages.ts 가 돌려준다.
      if (activeOtherRef.current?.id !== sent.recipientId) return;
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
  // ⚠ 스냅샷은 **알림 탭을 실제로 본 순간**에만 채운다(2026-09-07 감사).
  //   예전엔 `if (open)` 만 봐서, 이 패널의 기본 화면이 '쪽지'(:70 mode 초기값 'messages')인데도
  //   열자마자 안 읽은 알림 전부를 찍어 두고 닫을 때 서버에 read=true 로 커밋했다.
  //   → 배지를 보고 눌렀다가 쪽지만 보고 닫은 유저는 **알림 내용을 한 번도 못 본 채 배지만 잃는다.**
  //   닫는 경로가 바깥 클릭·dim·뒤로가기 전부 handleClose 하나로 모여 우회로도 없었다.
  //   이제 쪽지 탭만 보고 닫으면 ref 가 비어 아무것도 처리되지 않고, 알림 탭에 들어갔다 닫으면
  //   기존 '닫을 때 일괄 읽음' 계약이 그대로 유지된다.
  useEffect(() => {
    if (open && mode === 'notifs') {
      unreadOnOpenRef.current = notifications.filter((n) => !n.read).map((n) => n.id);
    }
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!render) return null;

  const visible = filter === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications;

  const inSubView = mode === 'messages' && msgView !== 'list';

  return (
    <>
      {/* 모바일에서만 배경 dim (탭하면 닫힘).
          🔴 2026-09-19 회귀(team-lead 실측, e2e/account-isolation.spec.ts) — 퇴장 애니를 넣으면서
          "시각적으로 사라지는 시점"과 "입력을 막는 시점"을 같이 묶어 버렸다. 그 결과 스크림이 화면
          전체(z-40 fixed inset-0)를 계속 가로채 뒤 화면(예: 헤더 계정 메뉴)이 안 눌리는 정지 상태가 됐다.
          닫기는 `open` prop 이 false 가 되는 즉시(지연 없이) 확정된 사실이다 — 애니메이션용 파생 상태
          (closing/render)에 기대지 않고 `open` 그 자체로 pointer-events 를 끈다. 시각적 퇴장(느림)과
          입력 차단 해제(즉시)는 다른 시점이어야 한다는 것이 이 부류의 핵심이다. */}
      <div
        className={['fixed inset-0 z-40 bg-black/30 sm:hidden', open ? 'pointer-events-auto' : 'pointer-events-none', closing ? 'animate-fade-out' : 'animate-fade-in'].join(' ')}
        onClick={handleClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="알림"
        className={[
          // 모바일: 화면 우측 1rem 안쪽으로 고정, 헤더 바로 아래(노치 safe-area만큼 헤더가 늘어나므로 포함)
          'fixed top-[calc(var(--header-now)+env(safe-area-inset-top)+0.5rem)] right-page-x',
          'left-page-x sm:left-auto',
          // 데스크톱: 우측에 380px 카드
          'sm:w-[380px] sm:right-page-x-md',
          // 공통 — 모바일은 폭이 거의 화면 전체(right/left-page-x)라 패널 자신도 닫히는 동안은
          // 뒤 화면을 가리지 않게 pointer-events 를 끈다(위 스크림과 같은 이유).
          'z-50 bg-surface-mid border border-border-default rounded-card shadow-dialog',
          open ? 'pointer-events-auto' : 'pointer-events-none',
          closing ? 'animate-fade-out' : 'animate-slide-up',
          // [high, 스윕 추가] 모바일 하단 탭바(플로팅 알약) 자리를 안 빼서 DM 서브뷰의 입력창·보내기 버튼이
          // 탭바에 가려지거나 탭이 가로채였다(장부 버튼과 같은 부류). --tabbar-safe 는 탭바 회피 단일 소스
          // (index.css) — 모바일만 뺀다. 탭바가 없는 sm 이상은 종전 값 그대로.
          'max-h-[calc(100vh-var(--header-now)-env(safe-area-inset-top)-var(--tabbar-safe))]',
          'sm:max-h-[calc(100vh-var(--header-now)-env(safe-area-inset-top)-1rem)]',
          'flex flex-col overflow-hidden',
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

          <div data-notif-actions="" className="flex shrink-0 items-center gap-2 text-2xs">
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
                  onChange={(v) => goSubTab('notif-filter', NOTIF_FILTER_ORDER, filter, v, () => setFilter(v))} />
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

        {/* ── 쪽지: 스레드 목록 ──
            min-h-[160px]: 빈 상태(py-12 안내문, 실측 159.5px)와 같은 높이로 바닥을 잡는다.
            쪽지 1~2건은 그 자체 높이(행 1개 63.75px)가 빈 상태보다 **작아서**, 실제로 대화가
            있는 사람이 오히려 빈 상태보다 작은 박스를 보는 역전이 있었다(design 실측 2026-09-14:
            빈 159.5 vs 2건 128.5). 그 역전만 없앤다 — 빈 상태 높이는 그대로라 첫 화면은 안 커진다.
            3건 이상(192px+)처럼 실제로 더 긴 목록은 이 바닥보다 커지는 것이 자연스러워 그대로 둔다. */}
        {mode === 'messages' && msgView === 'list' && (
          <ul data-notif-panel="" className="flex-1 min-h-[160px] overflow-y-auto">
            {threadsErr != null && threads.length === 0 ? (
              // 실패가 빈 상태보다 먼저다 — 목록이 이미 있으면(재조회 실패) 보던 목록은 그대로 둔다.
              <li className="p-3"><LoadErrorCard error={threadsErr} what="쪽지 목록" onRetry={reloadThreads} compact /></li>
            ) : threads.length === 0 ? (
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
              {msgsErr != null && msgs.length === 0 ? (
                // ⚠ 실패를 '첫 쪽지를 보내 보세요'로 보여주면 사용자가 이미 한 말을 처음부터 다시 쓴다.
                <LoadErrorCard error={msgsErr} what="대화 내용" onRetry={() => { if (activeOther) loadThread(activeOther.id); }} compact />
              ) : msgs.length === 0 ? (
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
                // [B] 34×34px 미달 — .hit 로 44px 확보(옆 textarea 와 gap-2=8.5px > 오버행 5px, 안전)
                className="hit flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-300 text-white transition-opacity disabled:opacity-40"
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

        {/* ── 알림 목록(기존 UI 전량 유지) ──
            min-h-[160px]: 위 쪽지 목록과 같은 바닥(빈 상태 159.5px) — 두 탭이 같은 최소 높이를
            쓰지 않으면 탭 전환마다 그 차이만큼 다시 튄다. 이유는 위 쪽지 목록 주석 참고. */}
        {mode === 'notifs' && (
        <ul data-notif-panel="" className="flex-1 min-h-[160px] overflow-y-auto">
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
                    // 앱 안에서 열 수 있으면 문서를 새로 받지 않는다 — location.assign 은 같은 오리진이어도
                    // 전체 리로드라 앱이 재부팅된다(HomeTab 배너 링크가 2026-09-15 에 같은 이유로 고쳐진 자리).
                    const u = (() => { try { return new URL(link, window.location.origin); } catch { return null; } })();
                    if (u && onInternalLink?.(u)) { handleClose(); return; }
                    openBootDeepLink(n, link); // 모르는 링크만 읽음 커밋 후 전체 재진입 — 패널 닫힘은 리로드가 대신한다
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
