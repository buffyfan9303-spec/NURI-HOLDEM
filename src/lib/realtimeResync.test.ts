// 실시간 재연결 공용 장치 계약. 음성 대조: 첫 SUBSCRIBED 도 부르거나, 재진입을 무시하면 빨개진다.
import { describe, expect, it, vi } from 'vitest';
import { resubscribeStatus } from './realtimeResync';

describe('resubscribeStatus', () => {
  it('첫 join 은 무시하고, 끊겼다 다시 join 할 때마다 재조회한다', () => {
    const on = vi.fn();
    const cb = resubscribeStatus(on);
    cb('SUBSCRIBED');
    expect(on).toHaveBeenCalledTimes(0);
    cb('CHANNEL_ERROR'); cb('TIMED_OUT'); cb('CLOSED');
    expect(on).toHaveBeenCalledTimes(0);
    cb('SUBSCRIBED');
    expect(on).toHaveBeenCalledTimes(1);
    cb('SUBSCRIBED');
    expect(on).toHaveBeenCalledTimes(2);
  });

  it('처음부터 못 붙었다가(오류 뒤) 첫 SUBSCRIBED 가 오면 재조회한다 — 실시간 청크 실패 후 복구(PR #206 P3-1)', () => {
    for (const err of ['CHANNEL_ERROR', 'TIMED_OUT']) {
      const on = vi.fn();
      const cb = resubscribeStatus(on);
      cb(err);
      cb('SUBSCRIBED');
      expect(on, err).toHaveBeenCalledTimes(1);
      cb('SUBSCRIBED');
      expect(on, err).toHaveBeenCalledTimes(2);
    }
    const on = vi.fn();
    const cb = resubscribeStatus(on);
    cb('CLOSED'); cb('SUBSCRIBED');   // CLOSED 는 끊김 표시가 아니다(제거·닫기)
    expect(on).toHaveBeenCalledTimes(0);
  });
});
