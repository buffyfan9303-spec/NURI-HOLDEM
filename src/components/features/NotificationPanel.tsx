import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backstack';
import type { AppNotification, NotificationType } from '../../api/notifications';
import SegmentedTabs from '../atoms/SegmentedTabs';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  /** 1초 후 자동 읽음 처리 */
  onMarkRead: (ids: string[]) => void;
  /** 알림 클릭 시 해당 페이지로 이동 */
  onNavigate?: (notification: AppNotification) => void;
}

// ── 타입별 SVG 아이콘 ────────────────────────────────────────────────────────

function TypeIcon({ type, className = '' }: { type: NotificationType; className?: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'qna':
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M14.5 11A2 2 0 0 1 12.5 13H6L3 16V5A2 2 0 0 1 5 3H12.5A2 2 0 0 1 14.5 5V11Z" />
        </svg>
      );
    case 'comment':
      return (
        <svg {...common} className={className} aria-hidden>
          <polyline points="4,8 4,11 1,11" />
          <path d="M16,14A6,6 0 0 0 4,11" />
          <polyline points="14,10 14,7 17,7" />
          <path d="M2,4A6,6 0 0 0 14,7" />
        </svg>
      );
    case 'mention':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="9" cy="9" r="3" />
          <path d="M12 9V10.5A2.5 2.5 0 0 0 16 8.5C16 4.5 13 2 9 2C5 2 2 5 2 9C2 13 5 16 9 16H12" />
        </svg>
      );
    case 'approval':
      return (
        <svg {...common} className={className} aria-hidden>
          <circle cx="9" cy="9" r="7" />
          <polyline points="6,9 8,11 12,7" />
        </svg>
      );
    case 'system':
      return (
        <svg {...common} className={className} aria-hidden>
          <path d="M9 1L11 5L15 5.5L12 8.5L13 13L9 11L5 13L6 8.5L3 5.5L7 5Z" />
        </svg>
      );
  }
}

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
        {/* 헤더 */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-ink-primary">알림</h2>
          <div className="flex items-center gap-1 text-2xs">
            <SegmentedTabs items={[{ key: 'all', label: '전체' }, { key: 'unread', label: '안읽음' }]} value={filter} onChange={setFilter} />
          </div>
        </header>

        {/* 목록 */}
        <ul className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <li className="flex flex-col items-center justify-center py-12 gap-2 text-ink-muted">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6.29-4.71L18 17V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v6l-.29.29A1 1 0 0 0 6.41 19h11.18a1 1 0 0 0 .7-1.71z" />
              </svg>
              <p className="text-xs">새 알림이 없습니다</p>
            </li>
          ) : (
            visible.map((n) => (
              <li
                key={n.id}
                onClick={() => {
                  if (onNavigate) {
                    onNavigate(n);
                    handleClose();
                  }
                }}
                className={[
                  'flex items-start gap-3 px-4 py-3',
                  'border-b border-border-subtle last:border-b-0',
                  'hover:bg-surface-high active:bg-surface-high cursor-pointer transition-colors',
                  !n.read && 'bg-accent-300/[0.04]',
                ].filter(Boolean).join(' ')}
              >
                {/* 좌측: 발신자 아바타 (텍스트가 있으면 텍스트, 없으면 타입 아이콘) */}
                <div className="relative shrink-0">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                    style={{ background: n.avatarColor ?? '#5A6175' }}
                  >
                    {n.avatarText
                      ? <span className="text-sm font-bold leading-none">{n.avatarText}</span>
                      : <TypeIcon type={n.type} className="text-white" />}
                  </div>
                  {/* 좌하단 타입 아이콘 (텍스트 아바타가 있을 때) */}
                  {n.avatarText && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface-mid border border-border-default flex items-center justify-center text-ink-secondary">
                      <TypeIcon type={n.type} className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {!n.read && (
                    <span
                      className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-danger border-2 border-surface-mid"
                      aria-label="안읽음"
                    />
                  )}
                </div>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={[
                      'text-xs font-semibold leading-tight',
                      n.read ? 'text-ink-secondary' : 'text-ink-primary',
                    ].join(' ')}>
                      {n.title}
                    </p>
                    <span className="text-2xs text-ink-muted shrink-0 tabular-nums">
                      {relativeTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted leading-snug line-clamp-2">
                    {n.message}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>

        {/* 푸터 — 모두 읽음 */}
        {notifications.some((n) => !n.read) && (
          <footer className="px-4 py-2.5 border-t border-border-subtle text-center">
            <button
              type="button"
              onClick={() => {
                const ids = notifications.filter((n) => !n.read).map((n) => n.id);
                if (ids.length) { onMarkRead(ids); unreadOnOpenRef.current = []; }
              }}
              className="text-xs font-semibold text-accent-300 hover:text-accent-200 transition-colors focus:outline-none"
            >
              모두 읽음으로 표시
            </button>
          </footer>
        )}
      </div>
    </>
  );
}
