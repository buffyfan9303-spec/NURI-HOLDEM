import { useId } from 'react';
import { motion } from 'framer-motion';

export type ViewMode = 'list' | 'grid' | 'table';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

// ── 아이콘 ───────────────────────────────────────────────────────────────────

function ListIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      className={className} aria-hidden
    >
      <line x1="3" y1="5"  x2="15" y2="5" />
      <line x1="3" y1="9"  x2="15" y2="9" />
      <line x1="3" y1="13" x2="15" y2="13" />
    </svg>
  );
}

function GridIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="1.6"
      className={className} aria-hidden
    >
      <rect x="2.5"  y="2.5"  width="5.5" height="5.5" rx="1" />
      <rect x="10"   y="2.5"  width="5.5" height="5.5" rx="1" />
      <rect x="2.5"  y="10"   width="5.5" height="5.5" rx="1" />
      <rect x="10"   y="10"   width="5.5" height="5.5" rx="1" />
    </svg>
  );
}

function TableIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="1.6"
      className={className} aria-hidden
    >
      <rect x="2.5" y="3" width="13" height="12" rx="1" />
      <line x1="2.5" y1="7" x2="15.5" y2="7" />
      <line x1="2.5" y1="11" x2="15.5" y2="11" />
      <line x1="7" y1="7" x2="7" y2="15" />
    </svg>
  );
}

/**
 * ViewModeToggle — segmented control
 *
 * 헤더의 다른 아이콘 버튼(36px)과 동일한 높이로 정렬.
 * 비활성: 투명 배경 / 활성: 골드 pill
 */
export default function ViewModeToggle({
  value, onChange, className = '',
}: ViewModeToggleProps) {
  const id = useId();

  const options: { mode: ViewMode; label: string; Icon: typeof ListIcon; desktopOnly?: boolean }[] = [
    { mode: 'list', label: '목록 보기', Icon: ListIcon },
    { mode: 'grid', label: '카드 보기', Icon: GridIcon },
    // 토너 로비식 고밀도 표 — 화면이 넓은 PC에서만 노출
    { mode: 'table', label: '표 보기', Icon: TableIcon, desktopOnly: true },
  ];

  return (
    <div
      role="group"
      aria-label="보기 방식 선택"
      className={[
        'inline-flex items-center h-9 p-0.5',
        'bg-surface-high/60 rounded-input border border-border-subtle',
        className,
      ].join(' ')}
    >
      {options.map(({ mode, label, Icon, desktopOnly }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            id={`${id}-${mode}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => onChange(mode)}
            className={[
              'relative w-8 h-full items-center justify-center rounded-[5px]',
              desktopOnly ? 'hidden md:flex' : 'flex',
              'transition-all duration-150',
              active ? 'text-ink-inverse' : 'text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            {active && (
              <motion.span layoutId="viewmode-pill" aria-hidden
                className="absolute inset-0 rounded-[5px] bg-accent-300 shadow-sm"
                transition={{ type: 'spring', stiffness: 700, damping: 42 }} />
            )}
            <span className="relative inline-flex"><Icon /></span>
          </button>
        );
      })}
    </div>
  );
}
