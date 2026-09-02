// snapshot.ts 단위 테스트 — 캐시는 '없어도 되는 층' 이라는 계약을 못 박는다.
// 깨진 JSON·만료·용량 초과·스토리지 차단, 어느 경우에도 앱 경로(스켈레톤)로
// 조용히 물러나야 한다. 캐시 계층이 던지는 예외는 그 자체로 결함이다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readSnap, writeSnap } from './snapshot';

function makeStorage(overrides: Partial<Storage> = {}) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null, length: 0,
    ...overrides,
  } as Storage;
}

beforeEach(() => { vi.stubGlobal('localStorage', makeStorage()); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('snapshot · 캐시 퍼스트 계약', () => {
  it('쓴 것을 그대로 돌려준다', () => {
    writeSnap('s', [{ id: 1, name: '대회' }]);
    expect(readSnap('s')).toEqual([{ id: 1, name: '대회' }]);
  });

  it('버전이 다르면 남의 것 · null (타입 변경 시 옛 스냅샷 자연 폐기)', () => {
    writeSnap('s', ['old'], 1);
    expect(readSnap('s', 2)).toBeNull();
  });

  it('24시간 지난 스냅샷은 없는 것으로 취급한다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T00:00:00Z'));
    writeSnap('s', ['fresh']);
    vi.setSystemTime(new Date('2026-08-17T00:00:01Z')); // 24h + 1s
    expect(readSnap('s'), '만료된 스냅샷이 살아 돌아왔다. 어제의 대회 목록이 오늘 첫 화면이 된다').toBeNull();
  });

  it('깨진 JSON 은 null. 예외를 앱으로 던지지 않는다', () => {
    localStorage.setItem('nuri:snap:s:v1', '{깨진');
    expect(() => readSnap('s')).not.toThrow();
    expect(readSnap('s')).toBeNull();
  });

  it('300KB 초과는 저장을 포기한다. dataURL 이미지가 localStorage 를 삼키지 않게', () => {
    writeSnap('big', 'x'.repeat(310 * 1024));
    expect(readSnap('big')).toBeNull();
  });

  it('스토리지가 차단된 환경(웹뷰·시크릿)에서도 던지지 않는다', () => {
    vi.stubGlobal('localStorage', makeStorage({
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    }));
    expect(() => writeSnap('s', [1])).not.toThrow();
    expect(readSnap('s')).toBeNull();
  });
});
