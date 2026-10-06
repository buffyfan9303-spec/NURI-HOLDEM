// src/components/atoms/SegmentedTabs.tsx
// 공용 세그먼트 토글 — 알약이 선택 칸으로 슬라이드(앱 전체 모션 언어 통일).
// framer-motion layoutId → 공용 FLIP(SlidingPill) 로 교체: 동작 동일, 의존성 0.
import { useRef } from 'react';
import SlidingPill from './SlidingPill';

export interface SegItem<T extends string> { key: T; label: string }

export default function SegmentedTabs<T extends string>({
  items, value, onChange, size = 'sm', className = '', grow = false, hitUp = false, quiet = false,
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
  /** 하위 필터용 옅은 알약(액센트 틴트 + 액센트 글자). 기본 꺼짐 = 채운 알약(pill-active).
   *  같은 줄에 상위 탭(채움)과 하위 필터가 나란하면 채움이 2곳이 되어 현재 모드가 흐려진다(M-06, 2026-10-01). */
  quiet?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div role="tablist" ref={ref}
      className={['relative inline-flex items-center gap-0.5 rounded-input border border-border-subtle bg-surface-high/60 p-0.5', className].join(' ')}>
      <SlidingPill containerRef={ref} activeKey={value} className={quiet ? 'rounded-[6px] bg-accent-300/16' : 'rounded-[6px] pill-active'} />
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key} type="button" role="tab" aria-selected={on}
            data-pill-active={on || undefined}
            onClick={() => onChange(it.key)}
            className={[
              hitUp ? 'tap-44' : 'relative',
              // min-w-[44px]: 두 글자 라벨(쪽지·알림·전체)은 루트 16px 에서 폭 40.75px 라 가로 누름면이 44 아래였다(2026-10-04).
              'shrink-0 min-w-[44px] rounded-[6px] transition-colors duration-(--dur-fast) focus:outline-hidden',
              grow ? 'flex-1' : '',
              // §T1 타이포 스케일: md=1단계 내비(t-nav) / sm=서브탭(t-tab). 굵기는 위 줄의 font-bold 가 이긴다.
              // sm 은 보이는 높이 28 — G9 '작은 토글 28'(명세 §1-2). 종전 py-1.5 는 25px 였다.
              // 2026-10-06(store-p3-1006, 리드 승인) — 행간은 t-tab/t-nav 정본(18 · 22)을 그대로 쓴다. 종전엔 leading-none 이
              //   그걸 이겨 같은 13px 탭 글자가 여기만 13, 다른 탭은 18 이었다(e2e/store-rhythm). 상자 높이는 패딩으로 맞춰 그대로다:
              //   sm 13+7.5×2 = 18+5.5+4.5 = 28 · md 15+8×2 = 22+4+5 = 31. 위·아래를 0.5px 비대칭으로 둔 것은 글자 기준선을 종전과
              //   **같은 픽셀**(sm 18.5 · md 20)에 두려고다 — 대칭(5/5·4.5/4.5)이면 반 픽셀 반올림으로 기준선이 ∓0.5 움직였다(실측).
              size === 'md' ? 'px-3 pt-[4px] pb-[5px] t-nav' : 'px-2.5 pt-[5.5px] pb-[4.5px] t-tab',
              // §T1 탭 굵기 규격: 비활성 600(t-* 기본) / 활성 700
              on ? (quiet ? 'font-bold text-accent-200' : 'font-bold text-white') : 'text-ink-secondary hover:text-ink-primary',
            ].join(' ')}
          >
            <span className="relative">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
