// src/lib/useServerTimeReady.ts — 첫 서버 시각 측정이 끝났는가(K8, 2026-09-29 실측).
// TV 는 첫 1,002ms 동안 기기 시계(+5분)로 'LEVEL 2 17:59' 를 그렸다가 'LEVEL 1 02:58' 로 바뀌었다 — 측정 전 첫 프레임을 보류한다.
// 측정이 실패해도 풀린다(기기 시계로 표시하며 15초마다 다시 잰다) — 화면이 영영 비지 않는다.
import { useEffect, useState } from 'react';
import { serverTimeSettled, whenServerTimeSettled } from './serverTime';

export function useServerTimeReady(): boolean {
  const [ready, setReady] = useState(serverTimeSettled);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void whenServerTimeSettled().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [ready]);
  return ready;
}
