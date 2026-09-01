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
// width/height 는 즉시 최종값으로 박고, **transform(translate+scale) 전용 FLIP**으로
// 미끄러진다(전환은 --ease 단일 곡선) — 애니메이션 구간이 전부 컴포지터에서 돈다.
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
  const prevRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const container = containerRef?.current ?? (pill?.parentElement as HTMLElement | null);
    if (!container || !pill) return;

    const measure = () => {
      const target = container.querySelector<HTMLElement>('[data-pill-active]');
      if (!target) { pill.style.opacity = '0'; prevRect.current = null; return; }
      const first = firstRef.current;
      firstRef.current = false;
      const r = underline
        ? { x: target.offsetLeft + 8, y: target.offsetTop + target.offsetHeight - 2, w: Math.max(0, target.offsetWidth - 16), h: 2 }
        : { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight };
      const prev = prevRect.current;
      prevRect.current = r;
      pill.style.opacity = '1';
      // [DS] MO-4 진짜 FLIP: width/height 는 즉시 최종값(레이아웃 1회)으로 박고,
      // 미끄러짐은 transform(translate+scale) 만 — 애니메이션 구간 전체가 컴포지터에서 돈다.
      // (예전엔 width/height 가 트랜지션에 포함돼 매 프레임 레이아웃+페인트였다)
      pill.style.width = `${r.w}px`;
      pill.style.height = `${r.h}px`;
      if (first || !prev) {
        // 첫 배치·리사이즈 보정은 전환 없이 — 어디선가 미끄러져 들어오는 유령 모션 방지
        pill.style.transition = 'none';
        pill.style.transform = `translate(${r.x}px, ${r.y}px)`;
        return;
      }
      // Invert: 새 크기의 알약을 '이전 시각 박스'로 되돌려 놓고(transform-origin 0 0 전제)
      const sx = r.w > 0 ? prev.w / r.w : 1;
      const sy = r.h > 0 ? prev.h / r.h : 1;
      pill.style.transition = 'none';
      pill.style.transform = `translate(${prev.x}px, ${prev.y}px) scale(${sx}, ${sy})`;
      void pill.offsetWidth; // Invert 프레임 고정(의도적 강제 리플로우 1회) — 이후는 컴포지터
      // Play: transform 만 전환
      // v2: 화면 안에서 자리를 옮기는 것은 --ease-move(양끝 감속) — 출발이 급한 감속 곡선은 '튀어나가는' 느낌을 준다(헌법 §1)
      pill.style.transition = 'transform var(--dur-base) var(--ease-move), opacity var(--dur-fast) var(--ease)';
      pill.style.transform = `translate(${r.x}px, ${r.y}px)`;
    };
    measure();

    // 컨테이너 크기 변화(회전·리사이즈·폰트 로드) → 재측정. 전환 없이 자리만 맞춘다.
    const ro = new ResizeObserver(() => {
      firstRef.current = true; // 리사이즈 보정은 미끄러질 필요가 없다
      measure();
    });
    ro.observe(container);
    // ⚠ 크기만 보면 놓치는 게 있다 — full-width·justify-center 컨테이너(PC GNB)는 폰트 스왑으로
    //   '형제' 라벨 폭이 변하면 활성 타깃이 옆으로 밀리는데, 컨테이너도 타깃도 제 크기는 그대로라
    //   RO 가 침묵한다(실측: 밑줄이 활성 탭에서 61px 어긋난 채 고정). 그래서 형제 전부를 관찰한다 —
    //   누구 폭이 변하든 그게 곧 이 알약의 위치 변화이므로.
    for (const child of Array.from(container.children)) {
      if (child instanceof HTMLElement && child !== pill) ro.observe(child);
    }
    let alive = true;
    // ⚠ document.fonts.ready 로는 부족하다 — Pretendard 는 media="print"→onload 로 '비차단' 로드라
    //   ready 가 이미 resolve 된 뒤에 스왑이 일어난다(실측: measure 당시 365px → 스왑 후 301px,
    //   밑줄이 64px 어긋난 채 고정). RO 도 침묵한다: 폰트 스왑은 컨테이너·타깃의 '자기 크기'를
    //   안 바꾸고 형제 폭만 줄여 위치를 미는 경우가 있다.
    //   그래서 첫 배치 뒤 몇 지점에서 값이 달라졌는지 확인하고 달라졌을 때만 다시 놓는다.
    //   (전환 없는 재배치라 시각적 점프 없음 · 타이머 3개는 마운트당 1회로 끝난다)
    //   ⚠ 비교 기준은 '내가 계산해 둔 값(prevRect)'이 아니라 '화면에 실제로 그려진 위치'여야 한다.
    //     View Transition 캡처 중에 measure 가 돌면 그때의 레이아웃이 prevRect 에 그대로 저장돼,
    //     계산값끼리 비교하면 어긋난 채로 '제자리'라고 판정한다(실측: 탭 전환마다 밑줄이 한 박자
    //     뒤처져 최대 443px 어긋남). 그려진 rect 와 타깃 rect 를 직접 대조하면 그 착시가 없다.
    const verify = () => {
      if (!alive) return;
      const t = container.querySelector<HTMLElement>('[data-pill-active]');
      if (!t) return;
      const tr = t.getBoundingClientRect();
      const pr = pill.getBoundingClientRect();
      const wantX = underline ? tr.left + 8 : tr.left;
      const wantW = underline ? Math.max(0, tr.width - 16) : tr.width;
      if (Math.abs(pr.left - wantX) < 1 && Math.abs(pr.width - wantW) < 1) return; // 이미 제자리
      firstRef.current = true; // 보정은 미끄러질 필요가 없다
      measure();
    };
    const timers = [150, 600, 1500].map((ms) => window.setTimeout(verify, ms));
    document.fonts?.ready.then(() => requestAnimationFrame(verify));
    return () => { alive = false; ro.disconnect(); timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, underline]);

  // strict 재측정 트리거(폰트 늦은 로드 등 드문 케이스) — 필요 시 호출부가 key 로 강제
  void force;

  return (
    <span
      ref={pillRef}
      aria-hidden
      // origin-top-left: FLIP scale 보정의 수학이 좌상단 원점을 전제로 한다
      className={['pointer-events-none absolute left-0 top-0 z-0 origin-top-left opacity-0 will-change-transform', className].join(' ')}
    />
  );
}
