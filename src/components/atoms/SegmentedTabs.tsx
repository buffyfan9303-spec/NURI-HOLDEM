// src/components/atoms/SegmentedTabs.tsx
// 공용 세그먼트 토글 — 알약이 선택 칸으로 슬라이드(앱 전체 모션 언어 통일).
// framer-motion layoutId → 공용 FLIP(SlidingPill) 로 교체: 동작 동일, 의존성 0.
import { useRef } from 'react';
import SlidingPill from './SlidingPill';

export interface SegItem<T extends string> { key: T; label: string }

export default function SegmentedTabs<T extends string>({
  items, value, onChange, size = 'sm', className = '', grow = false, hitUp = false,
}: {
  items: SegItem<T>[];
  value: T;
  onChange: (v: T) => void;
  /** sm=장부·패널 내부 / md=섹션 상단 */
  size?: 'sm' | 'md';
  className?: string;
  /** true면 칸들이 컨테이너를 균등 분할 */
  grow?: boolean;
  /** 누름면을 **위로만** 넓혀 세로 44px(tap-44). 보이는 칸은 그대로다.
   *  기본 꺼짐 — 아래로 넓히면 scrollHeight 넘침(글자 잘림 게이트)이 생기고, 위로 넓히면 바로 위 이웃을 덮을 수 있다
   *  (푸시·폴드 차트에서 위 스택 버튼 면적을 17~20% 뺏었다, 2026-09-28 실측). 위 이웃과의 간격을 재고 켠다. */
  hitUp?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div role="tablist" ref={ref}
      className={['relative inline-flex items-center gap-0.5 rounded-input border border-border-subtle bg-surface-high/60 p-0.5', className].join(' ')}>
      <SlidingPill containerRef={ref} activeKey={value} className="rounded-[6px] pill-active" />
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key} type="button" role="tab" aria-selected={on}
            data-pill-active={on || undefined}
            onClick={() => onChange(it.key)}
            className={[
              hitUp ? 'tap-44' : 'relative',
              'shrink-0 rounded-[6px] leading-none transition-colors duration-(--dur-fast) focus:outline-hidden',
              grow ? 'flex-1' : '',
              // §T1 타이포 스케일: md=1단계 내비(t-nav) / sm=서브탭(t-tab). 굵기는 위 줄의 font-bold 가 이긴다.
              size === 'md' ? 'px-3 py-2 t-nav' : 'px-2.5 py-1.5 t-tab',
              // §T1 탭 굵기 규격: 비활성 600(t-* 기본) / 활성 700
              on ? 'font-bold text-white' : 'text-ink-secondary hover:text-ink-primary',
            ].join(' ')}
          >
            <span className="relative">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
