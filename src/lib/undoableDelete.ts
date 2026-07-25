// 유예 삭제 큐 — '지운 뒤 되살리기'가 불가능한 조작의 실행취소 수단.
// 왜 이 방식인가: 포스터 삭제는 예약·문의를 CASCADE로 물리 삭제하고,
// 예약 삭제는 RLS(sr_insert with check: user_id = auth.uid()) 때문에
// 업주·운영자가 손님 예약을 대신 INSERT 할 방법이 아예 없다.
// 즉 서버에 요청이 나간 순간 복구 경로가 0이므로, 되살리는 대신
// '일정 시간 동안 서버로 보내지 않는다'로 실행취소를 만든다.
export interface UndoQueue {
  /** key 로 예약. 같은 key 를 다시 넣으면 이전 예약은 취소되고 새 것만 남는다. */
  schedule(key: string, run: () => void): void;
  /** 아직 안 나갔으면 취소하고 true / 이미 나갔으면 false(=되돌릴 수 없음) */
  cancel(key: string): boolean;
  /** 대기 중인 삭제를 즉시 실행 — 화면 이탈 시 '지웠는데 안 지워짐'을 막는다 */
  flushAll(): void;
  readonly size: number;
}

export function createUndoQueue(delayMs = 5000): UndoQueue {
  const q = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>();
  return {
    schedule(key, run) {
      const prev = q.get(key);
      if (prev) clearTimeout(prev.timer); // 같은 대상 재삭제 — 타이머 중복 방지
      const timer = setTimeout(() => { q.delete(key); run(); }, delayMs);
      q.set(key, { timer, run });
    },
    cancel(key) {
      const e = q.get(key);
      if (!e) return false;
      clearTimeout(e.timer); q.delete(key);
      return true;
    },
    flushAll() {
      for (const [k, e] of [...q]) { clearTimeout(e.timer); q.delete(k); e.run(); }
    },
    get size() { return q.size; },
  };
}
