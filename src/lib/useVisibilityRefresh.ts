// src/lib/useVisibilityRefresh.ts
// ─────────────────────────────────────────────────────────────────────────────
// 창/탭 복귀(visibilitychange → visible, window focus) 시 데이터를 다시 불러와
// 다른 기기·다른 사용자의 변경사항을 자동 동기화한다.
//  - 실시간 구독(Realtime)이 없는 화면도 "앱으로 돌아오면 최신화"되게 보장
//  - 디바운스로 과도한 재요청 방지
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

export function useVisibilityRefresh(refresh: () => void, deps: unknown[] = []): void {
  const ref = useRef(refresh);
  ref.current = refresh;
  useEffect(() => {
    let last = 0;
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < 1500) return; // 1.5s 디바운스(포커스/가시성 이벤트 중복 방지)
      last = now;
      ref.current();
    };
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
