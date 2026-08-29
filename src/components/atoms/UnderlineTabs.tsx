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
              'relative flex-1 transition-colors focus:outline-none',
              // §T1 타이포 스케일: md=1단계 내비(t-nav) / sm=서브탭(t-tab)
              size === 'md' ? 'py-3 t-nav' : 'py-2 t-tab',
              // §T1 탭 굵기 규격: 비활성 600(t-* 기본) / 활성 700
              on ? 'font-bold text-accent-300' : 'text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
