// src/components/atoms/SegmentedTabs.tsx
// 공용 세그먼트 토글 — 골드 알약이 선택 칸으로 스프링 슬라이드(앱 전체 모션 언어 통일).
// 기존 'bg-gold-300 토글' 패턴의 대체 표준. layoutId는 useId로 인스턴스별 자동 격리.
import { useId } from 'react';
import { motion } from 'framer-motion';

export interface SegItem<T extends string> { key: T; label: string }

export default function SegmentedTabs<T extends string>({
  items, value, onChange, size = 'sm', className = '', grow = false,
}: {
  items: SegItem<T>[];
  value: T;
  onChange: (v: T) => void;
  /** sm=장부·패널 내부 / md=섹션 상단 */
  size?: 'sm' | 'md';
  className?: string;
  /** true면 칸들이 컨테이너를 균등 분할 */
  grow?: boolean;
}) {
  const lid = useId();
  return (
    <div role="tablist"
      className={['inline-flex items-center gap-0.5 rounded-input border border-border-subtle bg-surface-high/60 p-0.5', className].join(' ')}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key} type="button" role="tab" aria-selected={on}
            onClick={() => onChange(it.key)}
            className={[
              'relative shrink-0 rounded-[6px] font-bold leading-none transition-colors duration-300 focus:outline-none',
              grow ? 'flex-1' : '',
              size === 'md' ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs',
              on ? 'text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary',
            ].join(' ')}
          >
            {on && (
              <motion.span layoutId={lid} aria-hidden
                className="absolute inset-0 rounded-[6px] bg-gold-300"
                transition={{ type: 'spring', stiffness: 700, damping: 42 }} />
            )}
            <span className="relative">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
