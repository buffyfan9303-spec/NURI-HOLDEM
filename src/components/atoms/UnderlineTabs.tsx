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
              // sm: 34 → **46.75px 실제 상자**(py-2 → py-3.5, 2026-09-28). 위는 시트 머리가 덮어 확장이 안 잡히고(39.75),
              //   아래로 넓힌 확장부는 scrollHeight 넘침(글자 잘림 게이트)을 만들고, 밑줄(SlidingPill)은 버튼 상자 아래끝에 붙어
              //   상자를 음수 여백으로 키우면 밑줄이 떠 버린다 — 그래서 탭 줄 자체를 md 와 같은 높이로 키웠다(글자는 t-tab 그대로).
              size === 'md' ? 'py-3 t-nav' : 'py-3.5 t-tab',
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
