import { useEffect, useState } from 'react';

/**
 * 데스크탑(lg, min-width:1024px) 여부.
 * 2-pane 레이아웃(일정탐색·커뮤니티 등)에서 목록+상세 분할 렌더 판단에 사용.
 */
export function useIsDesktop(): boolean {
  const [d, setD] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setD(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return d;
}
