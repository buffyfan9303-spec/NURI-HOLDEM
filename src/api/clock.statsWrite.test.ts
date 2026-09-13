// 클락 통계 writer 는 제어 필드를 절대 못 건드린다 — C01 재현/고정 (2026-09-12).
//
// 재현: TournamentClock 의 통계 재계산 effect 는 setTimeout(400ms) 로 마지막 렌더의 `state` 클로저를
//   캡처하는데 deps 가 derivedKey 뿐이라, 그 400ms 사이 사람이 STOP 을 눌러도 타이머가 취소되지 않는다.
//   전 행을 saveClockState(upsert)로 쓰면, 늦게 도착한(하지만 먼저 예약된) 통계 write 가 낡은
//   running:true 로 방금 쓴 정지를 덮을 수 있었다.
//
// 고침: 통계는 saveClockLiveStats로만 쓴다 — 이 함수는 `live_stats` 컬럼 하나만 UPDATE 하므로
//   두 writer가 어떤 순서로 도착해도 running·currentIndex·endsAt·eliminations 를 덮어쓸 수 없다.
//   (saveClockState 전 행 upsert로 되돌리면 아래 테스트가 실패한다 — 음성 대조.)
// 실행: npx vitest run src/api/clock.statsWrite.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Payload = Record<string, unknown>;
const updates: Payload[] = [];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: () => {
      const q = {
        update: (payload: Payload) => { updates.push(payload); return q; },
        eq: () => q,
        // update(...).eq(...).eq(...) 체인 끝에서 await 되므로 thenable 이어야 한다
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
      return q;
    },
  },
}));

const { saveClockLiveStats } = await import('./clock');

beforeEach(() => { updates.length = 0; });

describe('saveClockLiveStats · 통계 전용 부분 업데이트(C01)', () => {
  const CONTROL_FIELDS = ['running', 'current_index', 'ends_at', 'eliminations', 'remaining_ms', 'config', 'title'];

  it('live_stats·updated_at 외에는 아무 컬럼도 보내지 않는다', async () => {
    await saveClockLiveStats('v1', 1, { entries: 10, rebuys: 2, earlies: 3, addons: 0, alive: 8, eliminations: 2, totalStack: 800000, avgStack: 100000 });
    expect(updates).toHaveLength(1);
    const keys = Object.keys(updates[0]).sort();
    expect(keys).toEqual(['live_stats', 'updated_at']);
  });

  it('제어 필드는 이 writer의 페이로드에 원리적으로 등장할 수 없다(경합 자체가 성립하지 않는다)', async () => {
    await saveClockLiveStats('v1', 1, null);
    for (const f of CONTROL_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(updates[0], f), `${f} 가 통계 write 에 들어있다 — 경합 표면이 되살아났다`).toBe(false);
    }
  });

  it('두 writer가 역순으로 도착해도(통계가 나중에 도착) 통계 write 는 정지 상태를 되돌릴 수 없다', async () => {
    // STOP(제어 write)이 먼저 도착했다고 가정 — 이 테스트는 saveClockLiveStats 만 검증하므로
    // '나중에 도착한 통계 write'를 흉내낸다. 이 write 의 페이로드에 running 키가 없다는 것 자체가
    // "덮어쓸 수 없다"의 증거다(있다면 낡은 값으로 덮어썼을 것).
    await saveClockLiveStats('v1', 1, { entries: 5, rebuys: 0, earlies: 0, addons: 0, alive: 5, eliminations: 0, totalStack: 0, avgStack: 0 });
    expect(updates[0]).not.toHaveProperty('running');
  });
});
