// src/components/atoms/UnderlineTabs.tsx
// 공용 밑줄형 탭 — 골드 밑줄이 선택 칸으로 스프링 슬라이드(모달·페이지 상단 탭의 모션 언어 통일).
// 알약형은 SegmentedTabs, 밑줄형은 이 컴포넌트를 쓴다. layoutId는 useId로 인스턴스별 자동 격리.
import { useId } from 'react';
import { motion } from 'framer-motion';
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
  const lid = useId();
  return (
    <div role="tablist" className={['flex border-b border-border-subtle', className].join(' ')}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key} type="button" role="tab" aria-selected={on}
            onClick={() => onChange(it.key)}
            className={[
              'relative flex-1 font-medium transition-colors focus:outline-none',
              size === 'md' ? 'py-3 text-sm' : 'py-2 text-xs',
              on ? 'text-gold-300' : 'text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            {it.label}
            {on && (
              <motion.span layoutId={lid} aria-hidden
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gold-300"
                transition={{ type: 'spring', stiffness: 700, damping: 42 }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
