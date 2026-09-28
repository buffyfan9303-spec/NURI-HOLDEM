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
});
