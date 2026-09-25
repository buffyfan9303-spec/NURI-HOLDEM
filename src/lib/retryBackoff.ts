// src/lib/retryBackoff.ts — 실패가 이어질 때 재시도 간격을 벌리는 작은 문지기.
// 클락 자동 전진(TournamentClock 워치독 · 장부 백업 전진자)은 1초 틱마다 같은 CAS 쓰기를 보낸다.
// 네트워크가 끊긴 채면 초당 1회 이상 PATCH 가 쌓였다(FULL-RECHECK-2/C #7, 끝난 클락 31회/10초).
// 실패 n번째 뒤엔 base·2^(n−1) 동안(최대 maxMs) 건너뛰고, 한 번 성공하면 즉시 원래 주기로 돌아온다.
export interface Backoff {
  /** 지금은 쉬는 중인가 — true 면 이번 틱을 건너뛴다. */
  blocked: (now?: number) => boolean;
  /** 실패 기록 — 다음 시도까지의 대기를 두 배로. */
  fail: (now?: number) => void;
  /** 성공 기록 — 대기를 없앤다. */
  ok: () => void;
}

export function createBackoff(baseMs = 1000, maxMs = 30_000): Backoff {
  let fails = 0;
  let until = 0;
  return {
    blocked: (now = Date.now()) => now < until,
    fail: (now = Date.now()) => { until = now + Math.min(maxMs, baseMs * 2 ** fails); fails += 1; },
    ok: () => { fails = 0; until = 0; },
  };
}
