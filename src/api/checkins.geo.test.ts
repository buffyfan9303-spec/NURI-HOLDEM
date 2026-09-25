// CHECKIN-GEO 2단계 — 손님 출석이 폰 위치를 서버에 싣고 가는지, 위치를 못 얻으면 서버를 부르지 않고 이유를 던지는지.
// 거리 판정은 서버(20260923b)가 한다 — 여기서는 '보낸다/안 보낸다/이유' 계약만 잠근다.
// 실행: npx vitest run src/api/checkins.geo.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const rpcReply: { data: unknown } = { data: null };
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: rpcReply.data, error: null });
    },
  },
}));
vi.mock('./_session', () => ({ currentUser: async () => null }));
// 운영 스위치(app_settings.checkin_geo_enabled) — 'on' | null(행 없음) | 'fail'(조회 실패)
const flag = { value: 'on' as string | null, reads: 0 };
vi.mock('./settings', () => ({
  getAppSetting: async (key: string) => {
    flag.reads++;
    if (key !== 'checkin_geo_enabled') throw new Error(`unexpected key ${key}`);
    if (flag.value === 'fail') throw new Error('network');
    return flag.value;
  },
}));

// LOCATION-READY: 위치정보 이용 동의 — 'yes' 면 좌표 전송, 'no' 면 매장 id 만
const consent = { value: 'yes' as 'yes' | 'no', asks: 0 };
vi.mock('../lib/locationConsent', () => ({ ensureLocationConsent: async () => { consent.asks++; return consent.value === 'yes'; } }));

import { checkIn } from './checkins';
import { CheckinGeoError, getCheckinPosition, geoErrorCodeOf, isLowAccuracy, resetCheckinGeoFlagCache, parseCheckinGeoEnabled } from '../lib/checkinGeo';

type Opts = PositionOptions | undefined;
function stubGeo(impl: (ok: PositionCallback, bad: PositionErrorCallback, o: Opts) => void) {
  const seen: { opts: Opts } = { opts: undefined };
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: PositionCallback, bad: PositionErrorCallback, o: Opts) => { seen.opts = o; impl(ok, bad, o); } } });
  return seen;
}
const pos = (lat: number, lng: number, accuracy: number) => ({ coords: { latitude: lat, longitude: lng, accuracy } }) as GeolocationPosition;

beforeEach(() => { rpcCalls.length = 0; flag.value = 'on'; flag.reads = 0; consent.value = 'yes'; consent.asks = 0; rpcReply.data = { name: '누리 홀덤', points: 3, streak: 1 }; resetCheckinGeoFlagCache(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('checkIn — 위치를 싣고 간다', () => {
  it('좌표·오차를 check_in 에 그대로 보낸다', async () => {
    stubGeo((ok) => ok(pos(37.5, 127.01, 35)));
    const r = await checkIn('v-1');
    expect(r.name).toBe('누리 홀덤');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1', p_lat: 37.5, p_lng: 127.01, p_accuracy: 35 } }]);
  });

  // 오너 결정(2026-09-26): 동의했지만 위치를 못 얻으면 막지 않고 좌표 없이 출석한다(재시도 시트 없음).
  it.each([
    ['권한 차단(1)', 1], ['측위 실패(2)', 2], ['시간 초과(3)', 3],
  ])('%s → 던지지 않고 매장 id 만으로 check_in 1회', async (_label, code) => {
    stubGeo((_ok, bad) => bad({ code, message: 'x' } as GeolocationPositionError));
    const r = await checkIn('v-1');
    expect(r.name).toBe('누리 홀덤');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
  });

  it('위치 기능이 없는 브라우저(unsupported) → 좌표 없이 check_in 1회', async () => {
    vi.stubGlobal('navigator', {});
    await checkIn('v-1');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
  });

  it('위치와 무관한 오류는 삼키지 않는다(출석을 조용히 좌표 없이 바꾸지 않는다)', async () => {
    stubGeo(() => { throw new TypeError('boom'); });
    await expect(checkIn('v-1')).rejects.toThrow('boom');
    expect(rpcCalls).toHaveLength(0);
  });
});

describe('checkIn — 운영 스위치', () => {
  const noGeo = () => stubGeo(() => { throw new Error('위치를 물으면 안 된다'); });

  it('꺼짐(행 없음) → 위치를 묻지 않고 매장 id 만(이 번들 이전 운영과 동일)', async () => {
    flag.value = null; noGeo();
    await checkIn('v-1');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
  });
  it("'off'·오타도 꺼짐 — 'on' 만 켜짐", () => {
    expect(['on', 'off', 'ON', '', null, undefined].map(parseCheckinGeoEnabled)).toEqual([true, false, false, false, false, false]);
  });
  it('조회 실패 → 꺼짐(fail-open), 출석은 막지 않는다 · 실패는 캐시하지 않고 다음에 다시 묻는다', async () => {
    flag.value = 'fail'; noGeo();
    await checkIn('v-1');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
    await checkIn('v-1');
    expect(flag.reads).toBe(2);
  });
  it('켜짐 → 좌표 전송 · 성공한 조회는 세션 캐시(두 번째 출석에 재조회 없음)', async () => {
    stubGeo((ok) => ok(pos(37.5, 127, 10)));
    await checkIn('v-1'); await checkIn('v-2');
    expect(rpcCalls.map((c) => c.args.p_lat)).toEqual([37.5, 37.5]);
    expect(flag.reads).toBe(1);
  });
});

describe('checkIn — 위치정보 이용 동의(LOCATION-READY)', () => {
  it('동의하지 않음 → 위치를 묻지 않고 매장 id 만(출석은 된다)', async () => {
    consent.value = 'no';
    stubGeo(() => { throw new Error('동의 없이 위치를 물으면 안 된다'); });
    const r = await checkIn('v-1');
    expect(r.name).toBe('누리 홀덤');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
  });
  it('스위치 꺼짐이면 동의를 묻지도 않는다', async () => {
    flag.value = null; stubGeo(() => { throw new Error('x'); });
    await checkIn('v-1');
    expect(consent.asks).toBe(0);
  });
  it('서버가 {error} 로 거부하면 그 문구로 던진다(점수·이름으로 오인하지 않는다)', async () => {
    stubGeo((ok) => ok(pos(37.5, 127, 10)));
    rpcReply.data = { error: '매장 근처에서만 출석할 수 있어요' };
    await expect(checkIn('v-1')).rejects.toThrow('매장 근처에서만 출석할 수 있어요');
  });
});

describe('getCheckinPosition', () => {
  it('캐시 위치를 쓰지 않고 고정밀·10초 제한으로 묻는다', async () => {
    const seen = stubGeo((ok) => ok(pos(1, 2, 3)));
    await expect(getCheckinPosition()).resolves.toEqual({ lat: 1, lng: 2, accuracy: 3 });
    expect(seen.opts).toEqual({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  });
  it('시간 초과 → timeout · 메시지는 한국어 안내', async () => {
    stubGeo((_ok, bad) => bad({ code: 3 } as GeolocationPositionError));
    const e = (await getCheckinPosition().catch((x) => x)) as CheckinGeoError;
    expect(e.code).toBe('timeout');
    expect(e.message).toMatch(/매장 안에서 다시/);
  });
  it('오류 코드 매핑 · 오차 경고 기준', () => {
    expect([1, 2, 3, undefined, 9].map(geoErrorCodeOf)).toEqual(['denied', 'unavailable', 'timeout', 'unavailable', 'unavailable']);
    expect([isLowAccuracy(100), isLowAccuracy(101), isLowAccuracy(NaN)]).toEqual([false, true, true]);
  });
});
