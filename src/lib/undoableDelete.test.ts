// 유예 삭제 큐 — '되돌리기'가 실제로 되돌리는지, 그리고 되돌릴 수 없는 순간을 정확히 아는지.
//
// 왜 이 방식이어야 했나: 포스터 삭제는 예약·문의를 FK CASCADE 로 물리 삭제하고,
// 예약 삭제는 RLS(sr_insert with check: user_id = auth.uid()) 때문에 업주·운영자가
// 손님 예약을 대신 INSERT 할 수 없다. 즉 요청이 서버로 나간 뒤엔 복구 경로가 0이라
// '지운 뒤 되살리기'가 성립하지 않는다 → '일정 시간 안 보내기'가 유일한 실행취소.
//
// 가장 위험한 실패는 '되돌렸다고 했는데 이미 나갔던' 경우다. cancel() 의 반환값이
// 그 판단의 유일한 근거이므로 경계를 테스트로 못 박는다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUndoQueue } from './undoableDelete';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('유예. 시간이 지나야 실제로 나간다', () => {
  it('예약 직후에는 아직 서버로 안 나간다', () => {
    const run = vi.fn();
    createUndoQueue(5000).schedule('a', run);
    vi.advanceTimersByTime(4999);
    expect(run).not.toHaveBeenCalled();
  });

  it('유예가 끝나면 정확히 한 번 실행된다', () => {
    const run = vi.fn();
    createUndoQueue(5000).schedule('a', run);
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(1); // 타이머가 되살아나지 않는다
  });
});

describe('되돌리기. 반환값이 곧 사용자에게 할 말이다', () => {
  it('🔴 유예 중 취소하면 서버로 아무것도 안 나간다', () => {
    const run = vi.fn();
    const q = createUndoQueue(5000);
    q.schedule('a', run);
    expect(q.cancel('a')).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('🔴 이미 나간 뒤의 취소는 false. 화면이 "되돌렸다"고 거짓말하면 안 된다', () => {
    const run = vi.fn();
    const q = createUndoQueue(5000);
    q.schedule('a', run);
    vi.advanceTimersByTime(5000);
    expect(q.cancel('a')).toBe(false);
    expect(run).toHaveBeenCalledTimes(1); // 취소 시도가 실행을 되돌리지도 않는다
  });

  it('없는 키의 취소는 false(빈 큐에서 터지지 않는다)', () => {
    expect(createUndoQueue(5000).cancel('없음')).toBe(false);
  });
});

describe('같은 대상을 다시 지우면 타이머가 겹치지 않는다', () => {
  it('재삭제 시 이전 예약은 버려지고 마지막 것만 한 번 실행된다', () => {
    const first = vi.fn(); const second = vi.fn();
    const q = createUndoQueue(5000);
    q.schedule('a', first);
    vi.advanceTimersByTime(3000);
    q.schedule('a', second); // 되돌린 뒤 다시 삭제한 상황
    vi.advanceTimersByTime(5000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(q.size).toBe(0);
  });

  it('서로 다른 대상은 독립적으로 대기한다', () => {
    const a = vi.fn(); const b = vi.fn();
    const q = createUndoQueue(5000);
    q.schedule('a', a); q.schedule('b', b);
    expect(q.size).toBe(2);
    q.cancel('a');
    vi.advanceTimersByTime(5000);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('flushAll. 화면을 벗어날 때 "지웠는데 안 지워짐"을 막는다', () => {
  it('대기 중인 것들을 즉시 전부 내보낸다', () => {
    const a = vi.fn(); const b = vi.fn();
    const q = createUndoQueue(5000);
    q.schedule('a', a); q.schedule('b', b);
    q.flushAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(q.size).toBe(0);
  });

  it('🔴 flush 후 타이머가 또 돌아 두 번 실행되지 않는다', () => {
    const run = vi.fn();
    const q = createUndoQueue(5000);
    q.schedule('a', run);
    q.flushAll();
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flush 뒤에는 되돌릴 수 없다', () => {
    const q = createUndoQueue(5000);
    q.schedule('a', vi.fn());
    q.flushAll();
    expect(q.cancel('a')).toBe(false);
  });
});
