// src/components/atoms/CountUp.tsx — 숫자가 차오르는 연출(바이낸스/토스 문법).
// 마운트·값 변경 시 0.6s ease-out으로 카운트업. tabular-nums는 부모에서.
import { useEffect, useRef, useState } from 'react';

export default function CountUp({ value, duration = 600 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const diff = value - from;
    if (diff === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setShown(Math.round(from + diff * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toLocaleString()}</>;
}
