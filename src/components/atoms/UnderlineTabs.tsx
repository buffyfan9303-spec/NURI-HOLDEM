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
              // sm(34px): 누름면을 아래로 13px 더해 47px(2026-09-28). 위는 시트 머리(제목줄)가 덮고 있어 위로 넓혀도 안 잡힌다
              //   (가운데 확장 실측 39.75). 아래는 제 패널의 여백(p-4)이라 남의 누름면을 뺏지 않는다. md(46.75)는 그대로.
              //   값은 이미 번들에 있는 조합(HandReplayer)을 재사용 — CSS 예산 여유가 0 이다.
              size === 'md' ? 'py-3 t-nav' : "py-2 t-tab before:absolute before:inset-x-0 before:-top-[12px] before:-bottom-[13px] before:content-['']",
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
