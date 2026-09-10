// src/components/atoms/CountUp.tsx — 숫자가 차오르는 연출(바이낸스/토스 문법).
// 마운트·값 변경 시 0.6s ease-out으로 카운트업. tabular-nums는 부모에서.
/* eslint-disable react-refresh/only-export-components -- 보간 함수(countUpAt)+컴포넌트 동거: vitest 가 순수 로직만 집는다(TierBadge 와 같은 예외) */
import { useEffect, useRef, useState } from 'react';

/** 순수 보간 — 진행률 p(0~1) 시점의 표시값. ease-out cubic, 경계 밖 p 는 잘라낸다. */
export function countUpAt(from: number, to: number, p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return Math.round(from + (to - from) * (1 - Math.pow(1 - c, 3)));
}

export default function CountUp({ value, duration = 600 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  // 지금 화면에 찍힌 값. 애니메이션 도중 value 가 또 바뀌면(대시보드 실시간 집계·리더보드 갱신)
  // 여기서 이어 센다 — 예전엔 '직전 애니메이션의 시작값'(보통 0)에서 다시 출발해 150→0→220 으로 역주행했다.
  const shownRef = useRef(0);
  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const set = (n: number) => { shownRef.current = n; setShown(n); };
    // OS '동작 줄이기' — index.css 의 reduced-motion 블록은 CSS 애니메이션만 끄므로 JS 카운트업은 직접 본다.
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { set(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      set(countUpAt(from, value, p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toLocaleString()}</>;
}
