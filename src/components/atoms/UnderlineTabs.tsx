// src/components/atoms/UnderlineTabs.tsx
// 공용 밑줄형 탭 — 밑줄이 선택 칸으로 슬라이드. 알약형은 SegmentedTabs.
// framer-motion layoutId → 공용 FLIP(SlidingPill underline 모드) 로 교체.
import { useRef } from 'react';
import SlidingPill from './SlidingPill';
import type { SegItem } from './SegmentedTabs';

export default function UnderlineTabs<T extends string>({
  items, value, onChange, className = '', size = 'md',
}: {
  items: SegItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div role="tablist" ref={ref} className={['relative flex border-b border-border-subtle', className].join(' ')}>
      <SlidingPill containerRef={ref} activeKey={value} underline className="rounded-full bg-accent-300" />
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key} type="button" role="tab" aria-selected={on}
            data-pill-active={on || undefined}
            onClick={() => onChange(it.key)}
            className={[
              'relative flex-1 font-medium transition-colors focus:outline-none',
              size === 'md' ? 'py-3 text-sm' : 'py-2 text-xs',
              on ? 'text-accent-300' : 'text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
