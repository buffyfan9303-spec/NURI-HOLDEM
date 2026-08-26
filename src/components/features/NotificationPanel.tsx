import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackClose } from '../../lib/backstack';
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
              <Icon name="bell" size={32} strokeWidth={1.5} />
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
