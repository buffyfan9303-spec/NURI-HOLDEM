// src/lib/useVisibilityRefresh.ts
// ─────────────────────────────────────────────────────────────────────────────
// 창/탭 복귀(visibilitychange → visible, window focus) 시 데이터를 다시 불러와
// 다른 기기·다른 사용자의 변경사항을 자동 동기화한다.
//  - 실시간 구독(Realtime)이 없는 화면도 "앱으로 돌아오면 최신화"되게 보장
//  - 디바운스로 과도한 재요청 방지
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

/**
 * @param minIntervalMs 같은 복귀로 여러 이벤트가 겹치는 것을 막고, '잠깐 다녀온' 복귀에서
 *   전량 재조회가 반복되지 않게 하는 최소 간격. 기본 20초.
 *
 *   ⚠ 예전 값은 1.5초였다. 잠금화면·카톡을 오갈 때마다 사실상 매번 재조회가 돌았고,
 *   그때마다 목록 객체가 통째로 새로 만들어져 memo 가 전부 무효화됐다(화면 전체 재렌더).
 *   실시간 구독이 이미 변경을 밀어주므로, 복귀 재조회는 '혹시 놓친 것'을 메우는 보조 수단이다.
 *   보조 수단이 주 수단보다 비싸면 안 된다.
 */
export function useVisibilityRefresh(refresh: () => void, deps: unknown[] = [], minIntervalMs = 20_000): void {
  const ref = useRef(refresh);
  ref.current = refresh;
  useEffect(() => {
    let last = 0;
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < minIntervalMs) return;
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
