import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backstack';
import { markAllNotificationsRead, markNotificationsRead } from '../../api/notifications';
import type { AppNotification, NotificationType } from '../../api/notifications';
import SegmentedTabs from '../atoms/SegmentedTabs';
import Icon, { type IconName } from '../atoms/Icon';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  /** 1초 후 자동 읽음 처리 */
  onMarkRead: (ids: string[]) => void;
  /** 알림 클릭 시 해당 페이지로 이동 */
  onNavigate?: (notification: AppNotification) => void;
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

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

// ── 메인 ────────────────────────────────────────────────────────────────────

export default function NotificationPanel({
  open, onClose, notifications, onMarkRead, onNavigate,
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

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

  // 뒤로가기 → 알림 패널 닫기(읽음 처리 포함)
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
        {/* 헤더 — 우측: 모두 읽음(미읽음 있을 때만) + 전체/안읽음 필터 */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-ink-primary">알림</h2>
          <div className="flex items-center gap-2 text-2xs">
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-2xs font-semibold text-accent-300 hover:text-accent-200 transition-colors focus:outline-none"
              >
                모두 읽음
              </button>
            )}
            <SegmentedTabs items={[{ key: 'all', label: '전체' }, { key: 'unread', label: '안읽음' }]} value={filter} onChange={setFilter} />
          </div>
        </header>

        {/* 목록 */}
        <ul className="flex-1 overflow-y-auto">
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
                      n.avatarColor ? 'text-white' : 'bg-surface-high text-ink-secondary',
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

        {/* (푸터 '모두 읽음으로 표시'는 헤더 '모두 읽음'으로 이관 — 같은 기능 2곳 중복 방지) */}
      </div>
    </>
  );
}
