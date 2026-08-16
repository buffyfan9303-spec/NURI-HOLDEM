// SlidingPill — framer-motion layoutId 를 대체하는 공용 FLIP 인디케이터.
//
// ── 왜 만들었나 ─────────────────────────────────────────────────────────────
// 앱의 '미끄러지는 알약/밑줄'(세그먼트·탭·필터 칩) 13곳이 전부 framer-motion 의
// layoutId 공유 레이아웃 애니메이션이었다 — 이 13곳 때문에 vendor-motion 청크
// 130KB 가 부팅마다 내려왔다. 미끄러짐의 본질은 FLIP(위치 측정 → transform 전환)
// 하나뿐이므로, 그 한 가지를 직접 구현해 의존성을 끊는다.
//
// ── 동작 ────────────────────────────────────────────────────────────────────
// 버튼들의 공통 부모(relative)에 이 컴포넌트를 한 번 두고, 활성 버튼에
// `data-pill-active` 를 표시한다. activeKey 가 바뀌면 활성 버튼을 측정해
// left/top/width/height 를 잡고 transform 이 아닌 레이아웃 속성 대신
// **translate+width 전환**으로 미끄러진다(전환은 --ease 단일 곡선).
//
//  <div ref={ref} className="relative ...">
//    <SlidingPill containerRef={ref} activeKey={value} className="bg-accent-300/15 rounded-full" />
//    {items.map(v => <button data-pill-active={v === value || undefined} ...>)}
//  </div>
//
// ── 원칙 ────────────────────────────────────────────────────────────────────
// · 첫 배치는 전환 없이 즉시(마운트 순간 미끄러져 들어오는 유령 모션 방지)
// · 리사이즈·폰트 로드로 배치가 변하면 재측정(ResizeObserver)
// · 대상이 없으면(활성 없음) 조용히 숨김 — 렌더 트리를 어지럽히지 않는다
import { useLayoutEffect, useRef, useState } from 'react';

interface Props {
  /** 버튼들의 공통 부모(position:relative 필수). 생략하면 이 스팬의 부모를 자동 사용 —
      기존 마크업의 컨테이너에 ref 를 꽂기 어려운 인라인 사이트용. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** 활성 항목 식별자 — 바뀔 때마다 재측정·이동 */
  activeKey: string | number | null;
  /** 알약의 시각 스타일(배경·라운드·그림자 등) */
  className?: string;
  /** underline 모드: 버튼 하단에 붙는 밑줄(높이 고정) */
  underline?: boolean;
}

export default function SlidingPill({ containerRef, activeKey, className = '', underline = false }: Props) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const firstRef = useRef(true);
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const container = containerRef?.current ?? (pill?.parentElement as HTMLElement | null);
    if (!container || !pill) return;

    const measure = () => {
      const target = container.querySelector<HTMLElement>('[data-pill-active]');
      if (!target) { pill.style.opacity = '0'; return; }
      const first = firstRef.current;
      firstRef.current = false;
      // 첫 배치는 전환 없이 — 어디선가 미끄러져 들어오는 유령 모션 방지
      pill.style.transition = first ? 'none' : 'transform var(--dur-base) var(--ease), width var(--dur-base) var(--ease), height var(--dur-base) var(--ease), opacity var(--dur-fast) var(--ease)';
      pill.style.opacity = '1';
      if (underline) {
        pill.style.width = `${Math.max(0, target.offsetWidth - 16)}px`;
        pill.style.height = '2px';
        pill.style.transform = `translate(${target.offsetLeft + 8}px, ${target.offsetTop + target.offsetHeight - 2}px)`;
      } else {
        pill.style.width = `${target.offsetWidth}px`;
        pill.style.height = `${target.offsetHeight}px`;
        pill.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
      }
    };
    measure();

    // 컨테이너 크기 변화(회전·리사이즈·폰트 로드) → 재측정. 전환 없이 자리만 맞춘다.
    const ro = new ResizeObserver(() => {
      firstRef.current = true; // 리사이즈 보정은 미끄러질 필요가 없다
      measure();
    });
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, underline]);

  // strict 재측정 트리거(폰트 늦은 로드 등 드문 케이스) — 필요 시 호출부가 key 로 강제
  void force;

  return (
    <span
      ref={pillRef}
      aria-hidden
      className={['pointer-events-none absolute left-0 top-0 z-0 opacity-0 will-change-transform', className].join(' ')}
    />
  );
}
