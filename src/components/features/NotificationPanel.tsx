import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBackClose } from '../../lib/backstack';
import { markAllNotificationsRead, markNotificationsRead } from '../../api/notifications';
import type { AppNotification } from '../../api/notifications';
import {
  listMyThreads, listThread, sendMessage, markThreadRead,
  type DirectMessage, type MessageThread,
} from '../../api/messages';
import { findUserForTransfer, type TransferTarget } from '../../api/vouchers';
import { blockUser } from '../../api/blocks';
import { useToast } from '../atoms/Toast';
import SegmentedTabs from '../atoms/SegmentedTabs';
import LoadErrorCard from '../atoms/LoadErrorCard';
import Icon from '../atoms/Icon';
import { notifGlyph } from '../../lib/notifLink';
import { onColorInkClass } from '../../lib/color';
import { goSubTab } from '../../lib/subTabTransition';
import { relativeTime } from '../../lib/relativeTime';
import { msgOf } from '../../lib/dbError';

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

// ── 아이콘: link(결정 결과 알림의 종류) → type 순으로 읽는다 — 정본 src/lib/notifLink.ts(라우터와 같은 해석) ──


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
/** 목록 한 행 높이(rem, 루트 17px) — 행 문법이 고정이라 모든 행이 같다(실측 2026-10-02 390·1440: 쪽지 64.9px · 알림 80.8px).
 *  살짝 올려 잡는다 — 모자라면 다 들어가는 짧은 목록이 몇 px 스크롤된다. */
//  2026-10-05 글자 사다리 상향 뒤 재실측(390·1440): 쪽지 61.13px · 알림 79px(종전 75) → 알림 4.76 → 5rem(80px). 모자라면 짧은 목록이 몇 px 스크롤된다.
const NOTIF_ROW_REM = { thread: 3.86, notif: 5 } as const;
/** 본문 상한 — 약 10행(쪽지 12행 · 알림 9.2행). 화면이 낮으면 카드 max-h(가용 높이)가 먼저 자른다.
 *  2026-10-05: 알림 행이 79px 로 커져 44rem 이면 8행만 들어갔다 — 46rem(736px)으로 9행을 지킨다. */
const NOTIF_BODY_MAX = '46rem';

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

  // ── 쪽지/알림 모드 — 알림이 기본(오너 2026-09-24 H5: "열면 알림부터"). 닫으면 알림으로 되돌린다(아래 [open] 이펙트).
  //   패널을 쪽지로 바로 여는 경로는 없다(2026-09-24 grep: 여는 곳은 App.tsx 헤더 버튼·사용자 메뉴, 둘 다 setNotifOpen(true) 뿐).
  const [mode, setMode] = useState<'messages' | 'notifs'>('notifs');
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
  // 목록 스크롤 자리 — 탭(쪽지 · 알림 전체 · 알림 안 읽음)마다 기억해 돌아오면 그 자리(오너 2026-10-02 "스크롤해서 내려 보게").
  //   목록은 탭마다 다시 마운트되므로 자리를 여기 들고 있다가 커밋 직후(페인트 전) 되돌린다. 패널을 닫으면 비운다(다음 열림은 맨 위).
  const listRef = useRef<HTMLUListElement>(null);
  const listMem = useRef<Record<string, number>>({});

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
  // ⚠ 기본 탭이 알림이 된 뒤에도 **열 때 한 번은 쪽지를 읽는다**(H5) — 위 조건만 두면 알림 탭으로 열린 패널은
  //   쪽지 뱃지를 90s 폴링까지 재계산하지 않는다(종전 '열면 갱신' 계약 소실). 쪽지→알림 전환마다 다시 읽지는 않는다.
  useEffect(() => {
    if (open && mode === 'notifs') reloadThreads();
  }, [open, reloadThreads, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 패널이 닫히면 탭은 알림으로, 내부 화면은 목록으로 되돌린다(다음 열림이 항상 같은 곳에서 시작)
  useEffect(() => {
    if (!open) { setMode('notifs'); setMsgView('list'); setActiveOther(null); setDraft(''); setQuery(''); setResults([]); listMem.current = {}; }
  }, [open]);
  const listKey = mode === 'messages' ? 'messages' : `notifs:${filter}`;
  // 탭을 옮기면(쪽지 대화에서 목록으로 돌아올 때 포함) 그 탭의 기억한 자리로 — 페인트 전에 맞춰 맨 위가 한 프레임 비치지 않게.
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listMem.current[listKey] ?? 0;
  }, [listKey, msgView]);
  const rememberScroll = (e: UIEvent<HTMLUListElement>) => { listMem.current[listKey] = e.currentTarget.scrollTop; };

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
      // api(messages.ts)는 소유 밖이라 표시 계층에서 번역한다. 그 외는 msgOf 가 한국어 서버 문장만 통과시킨다.
      const raw = e instanceof Error ? e.message : '';
      toast.show(
        /row-level security/i.test(raw)
          // 서버 _can_message 는 본인인증을 보지 않는다(오너 2026-09-29 · 8241385d) — 실제 거절 사유만 말한다
          ? '쪽지를 보낼 수 없습니다. 상대가 탈퇴·정지 상태이거나 서로 차단한 관계일 수 있습니다'
          : msgOf(e, '쪽지를 보내지 못했습니다'),
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
      toast.show(`${activeOther.name}님을 차단했습니다. 이후 쪽지가 오지 않습니다`, 'success');
      setMsgView('list');
      setActiveOther(null);
      reloadThreads();
    } catch (e) {
      toast.show(msgOf(e, '차단하지 못했습니다'), 'error');
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

  // 뒤로가기·Escape → 패널 닫기(읽음 처리 포함). Escape 는 전역 backstack 이 최상단 한 겹만 닫는다(Modal 과 같은 규칙 — 개별 keydown 금지).
  //   예전엔 escape 등록이 없어 키보드로는 벨을 다시 눌러야만 닫혔다(review-motion-revisit-1002 '남은 것' 3).
  useBackClose(open, handleClose, { escape: true });

  // 쪽지 대화·새 쪽지(하위 화면) → 목록. 머리줄 [뒤로] 버튼과 같은 함수다.
  //   M4-03(audit4-motion-1004): 하위 화면이 뒤로가기 스택에 겹으로 없어서 대화에서 뒤로가기·Esc 한 번에 패널 전체가 닫혔다.
  //   패널 겹 위에 한 겹 더 올려 '대화 → 목록 → 패널 닫힘' 한 단계씩이 된다(글 상세 위 글쓰기와 같은 방식).
  //   [뒤로] 버튼·차단·패널 닫기로 목록이 되면 조건이 꺼져 이 겹의 칸도 정리된다(죽은 칸 없음 — backstack.ts).
  const backToList = useCallback(() => { setMsgView('list'); setActiveOther(null); reloadThreads(); }, [reloadThreads]);
  useBackClose(open && mode === 'messages' && msgView !== 'list', backToList, { escape: true });

  // 카드 머리줄(쪽지/알림 탭 줄)·패널 아래 어두운 막을 끌거나 휠을 굴리면 **뒤 화면**이 굴러갔다 — 둘 다 스크롤 상자가 아니라
  //   입력이 문서 스크롤로 넘어간다(실측 390: 머리줄 끌기 172px · 스크림 휠 +384px, B2 2026-10-02). 목록·대화는 자기 상자가
  //   overscroll-contain 으로 막는다. 끌기는 CSS(touch-none — 합성 스레드에서 끊겨 목록 스크롤에 지연이 없다), 휠은 CSS 로 못 막아
  //   이 두 요소에만 비수동 리스너를 단다(React onWheel 은 passive 라 preventDefault 가 안 먹는다). 탭 누름·클릭은 그대로다.
  const headerRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const els = [headerRef.current, scrimRef.current].filter((e): e is HTMLElement => !!e);
    const stop = (e: WheelEvent) => e.preventDefault();
    for (const el of els) el.addEventListener('wheel', stop, { passive: false });
    return () => { for (const el of els) el.removeEventListener('wheel', stop); };
  }, [open, render]); // render: 여는 첫 커밋은 render=false(아래 return null)라 ref 가 비어 있다 — 그려진 커밋에서 다시 단다

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
        ref={scrimRef}
        // 🔴 M3-07(2026-10-04) — 열 때 딤은 dim-in(0→1 · 0.32s 양끝 감속 곡선 = 패널 slide-up 과 같은 길이)이다. Modal 딤과 같은 조리법.
        //   예전 fade-in 은 키프레임이 불투명도 0.45 에서 시작해(판 깜빡임 방지용) 첫 프레임부터 딤이 반쯤 켜졌는데 패널은 투명 0 에서
        //   올라와, 라이트에서 화면이 ~72ms 회색으로 꺼졌다 밝아졌다(평균 휘도 −24). 닫힘은 패널과 같은 fade-out 그대로.
        className={['fixed inset-0 z-40 bg-black/30 sm:hidden', open ? 'pointer-events-auto' : 'pointer-events-none', closing ? 'animate-fade-out' : 'animate-dim-in', 'touch-none'].join(' ')}
        onClick={handleClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="알림"
        // 아래 top·max-h 가 var(--header-now) 를 쓴다 — 헤더 축소값은 이 표식이 있는 요소만 받는다(src/index.css M3-02).
        data-header-now=""
        // 글을 쓰던 칸에서 Esc 는 칸만 벗어난다(창을 닫으면 쓰던 쪽지·검색어가 같이 사라진다 — B2 후속 · 독립 검토 ① 관찰).
        //   preventDefault 를 보면 전역 backstack 의 Esc 가 이 겹을 닫지 않는다(backstack.ts handleEscape). 한 번 더 누르면 닫힌다.
        onKeyDown={(e) => {
          const t = e.target;
          if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
          if ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && t.value) { e.preventDefault(); t.blur(); }
        }}
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
        {/* pt-3.5 pb-2.5(합은 종전 py-3 과 같다, 2026-09-28): 세그먼트 탭의 위로만 넓힌 누름면(tap-44, 18.5px)이
            패널 overflow-hidden 에 2.6px 잘려 42px 였다 — 내용을 2px 내려 44px 가 패널 안에 들어오게 했다. */}
        <header ref={headerRef} className="flex touch-none items-center justify-between gap-2 px-4 pt-3.5 pb-2.5 border-b border-border-subtle">
          {inSubView ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={backToList}
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
                value={mode} hitUp
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
                    className="tap-44 py-2 -my-2 text-2xs font-semibold text-accent-300 hover:text-accent-200 transition-colors focus:outline-hidden"
                  >
                    모두 읽음
                  </button>
                )}
                {/* 하위 필터는 옅은 알약(quiet) — 상위 쪽지/알림 탭만 채운다(M-06: 헤더 채운 알약 2→1). */}
                <SegmentedTabs items={[{ key: 'all', label: '전체' }, { key: 'unread', label: '안 읽음' }]} value={filter} hitUp quiet
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
                className="text-2xs font-semibold text-ink-muted hover:text-danger-light transition-colors focus:outline-hidden"
              >
                차단
              </button>
            )}
          </div>
        </header>

        {/* ── 본문 그릇 — 쪽지·알림 두 탭(그리고 전체·안 읽음)이 **같은 높이**를 쓴다(오너 2026-10-02 "목록을 길게 남기지 말고
            줄여라. 스크롤해서 내려 보게 하고 한 번에 10개 정도"). 예전엔 탭마다 목록 길이만큼 카드가 커졌다 줄었다(390 실측 679↔254px).
            높이 = 두 목록 중 긴 쪽(쪽지 행 NOTIF_ROW_REM.thread · 알림 행 NOTIF_ROW_REM.notif — 행 문법이 고정이라 행 높이가 같다)이고,
            바닥 160px(빈 상태 안내문 실측 159.5 — 빈 화면은 종전보다 커지지 않는다) · 상한 NOTIF_BODY_MAX(약 10행) · 카드 max-h(화면 가용 높이)가
            차례로 자른다. 탭을 옮겨도 같은 식이라 높이가 바뀌지 않는다. 넘치는 목록은 이 안에서 스크롤 — overscroll-contain 으로 끝에서 뒤 화면이
            같이 굴러가지 않는다. 쪽지 대화·새 쪽지(하위 화면)는 탭이 아니라 화면 이동이라 상한 높이를 다 쓴다. */}
        <div data-notif-body="" className="flex min-h-0 flex-col" style={{ height: inSubView ? NOTIF_BODY_MAX : `max(160px, ${Math.max(threads.length * NOTIF_ROW_REM.thread, notifications.length * NOTIF_ROW_REM.notif)}rem)`, maxHeight: NOTIF_BODY_MAX }}>
        {/* ── 쪽지: 스레드 목록 ── */}
        {mode === 'messages' && msgView === 'list' && (
          <ul ref={listRef} onScroll={rememberScroll} data-notif-panel="" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
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
                    <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-accent-300" aria-label="안 읽음" />
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
            <div ref={scrollRef} className="flex-1 min-h-0 space-y-2 overflow-y-auto overscroll-contain px-4 py-3">
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
                      'max-w-[75%] whitespace-pre-wrap wrap-break-word rounded-card px-3 py-2 text-xs leading-snug',
                      m.mine
                        ? 'rounded-br-xs bg-accent-300 text-white'
                        : 'rounded-bl-xs bg-surface-high text-ink-primary',
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
                className="min-w-0 flex-1 resize-none rounded-input border border-border-strong bg-surface-field px-3 py-2 text-xs text-ink-primary placeholder:text-ink-muted focus:border-accent-300 focus:outline-hidden"
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
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="border-b border-border-subtle px-4 py-3">
              <div className="relative">
                <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="받는 사람 닉네임 검색"
                  aria-label="받는 사람 닉네임 검색"
                  className="w-full rounded-input border border-border-strong bg-surface-field py-2 pl-8 pr-3 text-xs text-ink-primary placeholder:text-ink-muted focus:border-accent-300 focus:outline-hidden"
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
                      {r.phoneMasked ? <span data-testid="cand-phone" className="shrink-0 text-2xs tabular-nums text-ink-muted">{r.phoneMasked}</span> : null}
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

        {/* ── 알림 목록(기존 UI 전량 유지) — 높이는 위 본문 그릇이 정한다 ── */}
        {mode === 'notifs' && (
        <ul ref={listRef} onScroll={rememberScroll} data-notif-panel="" className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
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
                    aria-label="안 읽음"
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
                      : <Icon name={notifGlyph(n)} size={16} />}
                  </div>
                  {/* 우하단 겹침 타입 글리프 배지 (텍스트 아바타일 때) */}
                  {n.avatarText && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface-mid border border-border-default flex items-center justify-center text-ink-secondary">
                      <Icon name={notifGlyph(n)} size={10} strokeWidth={2.5} />
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
        </div>

        {/* (푸터 '모두 읽음으로 표시'는 헤더 '모두 읽음'으로 이관 — 같은 기능 2곳 중복 방지) */}
      </div>
    </>
  );
}
