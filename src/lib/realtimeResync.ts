// src/lib/realtimeResync.ts — 실시간 재연결·화면 복귀 시 재조회 공용 장치(2026-09-28, 오너 추천 3번).
//
// 왜 필요한가: postgres_changes 는 **끊긴 동안의 변경을 다시 보내 주지 않는다.** 폰 화면이 꺼졌다 켜지거나
//   지하 매장에서 소켓이 끊겼다 이어지면(realtime-js 가 채널을 다시 join → 콜백에 'SUBSCRIBED' 가 다시 온다)
//   그 사이의 바인·클락 정지·요청 승인이 이 화면에 영영 안 온다. 예전엔 장부만 window 'online' 을 들었고,
//   소켓만 끊긴 경우(네트워크는 살아 있음)·화면 복귀는 아무도 메우지 않았다.
// 규칙: 채널을 만드는 곳은 `.subscribe(resubscribeStatus(onChange))` 로 구독하고,
//   화면은 `useResyncOnWake(reload, active)` 로 창 복귀·온라인 복귀(+선택 폴링) 때 다시 읽는다.
import { useEffect, useRef } from 'react';

/** 채널 상태 콜백 — 첫 'SUBSCRIBED' 는 무시하고(그 직후 화면이 이미 읽는다), **다시** 들어온 'SUBSCRIBED' 마다 onChange. */
export function resubscribeStatus(onChange: () => void): (status: string) => void {
  let joined = false;
  return (status: string) => {
    if (status !== 'SUBSCRIBED') return;
    if (joined) onChange();
    joined = true;
  };
}

/**
 * 창이 다시 보일 때·네트워크가 돌아올 때(그리고 pollMs 를 주면 보이는 동안 주기적으로) fn 을 부른다.
 * active=false(keep-alive 로 숨은 판)면 아무것도 걸지 않는다. fn 의 identity 가 바뀌어도 리스너를 다시 걸지 않는다.
 */
export function useResyncOnWake(fn: () => void, active = true, pollMs = 0): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const run = () => ref.current();
    const onVis = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', run);
    const t = pollMs > 0 ? window.setInterval(() => { if (document.visibilityState === 'visible') run(); }, pollMs) : 0;
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', run);
      if (t) window.clearInterval(t);
    };
  }, [active, pollMs]);
}
