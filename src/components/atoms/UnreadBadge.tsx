import { useEffect, useRef } from 'react';

interface UnreadBadgeProps {
  count: number;
  /** 숫자 표시 상한 — 초과 시 "99+" 형태로 표현 */
  max?: number;
  /** dot 모드: 숫자 없이 작은 원만 표시 (알림 벨 전용) */
  dot?: boolean;
  /** 0이어도 강제로 표시 */
  showZero?: boolean;
  className?: string;
}

/**
 * Unread Red Badge
 *
 * count가 0→양수로 바뀔 때 pulse 애니메이션을 1회 실행.
 * 헤더 알림 벨, 채팅 아이콘, DM 아이콘에 overlay 방식으로 사용.
 *
 * 사용 예:
 *   <div className="relative inline-flex">
 *     <BellIcon />
 *     <UnreadBadge count={unreadCount} dot className="absolute -top-1 -right-1" />
 *   </div>
 */
export default function UnreadBadge({
  count,
  max = 99,
  dot = false,
  showZero = false,
  className = '',
}: UnreadBadgeProps) {
  const prevCount = useRef(0);
  const badgeRef  = useRef<HTMLSpanElement>(null);

  // count가 0 → 양수로 전환될 때 bounce 애니메이션 트리거
  useEffect(() => {
    if (prevCount.current === 0 && count > 0 && badgeRef.current) {
      const el = badgeRef.current;
      el.classList.remove('animate-badge-pulse');
      // reflow 후 재추가해야 애니메이션 재실행됨
      void el.offsetWidth;
      el.classList.add('animate-badge-pulse');
    }
    prevCount.current = count;
  }, [count]);

  const visible = count > 0 || showZero;
  if (!visible) return null;

  const label = dot
    ? undefined
    : count > max
    ? `${max}+`
    : String(count);

  return (
    <span
      ref={badgeRef}
      role="status"
      aria-label={label ? `${label}개의 읽지 않은 알림` : '새 알림'}
      className={[
        // 기본 형태
        'inline-flex items-center justify-center',
        'bg-danger font-bold text-white leading-none select-none',
        'shadow-badge pointer-events-none',
        // dot vs 숫자 모드 크기 분기
        dot
          ? 'w-2 h-2 rounded-full'
          : count > 9
          ? 'min-w-[1.25rem] h-5 rounded-badge px-1 text-2xs'
          : 'w-5 h-5 rounded-full text-xs',
        className,
      ].join(' ')}
    >
      {!dot && label}
    </span>
  );
}
