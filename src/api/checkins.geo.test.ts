// CHECKIN-GEO — 손님 출석이 폰 위치를 서버에 싣고 가는지, 언제 묻고 언제 묻지 않는지, 서버 거부를 어떻게 바꾸는지.
// 거리·시행일 판정은 서버(check_in — 20260923b·20261004d)가 한다 — 여기서는 '보낸다/안 보낸다/이유' 계약만 잠근다.
// 20261004d(오너 결정 (다)): 위치는 운영 스위치 + **매장이 켠 '위치 확인 출석'** 일 때만 묻는다. 켠 매장의 시행일 뒤 거부는 서버 code 로 온다.
// 실행: npx vitest run src/api/checkins.geo.test.ts
// 음성 대조(2026-10-04): checkIn 의 `await getVenueCheckinGeoRequired(venueId)` 조건을 빼면 '매장 꺼짐' 두 건이,
//   `if (reason === 'position' && geoErr) throw geoErr;` 를 빼면 '위치 실패 + 서버 position 거부' 가 빨개진다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const rpcReply: { data: unknown } = { data: null };
// 매장의 '위치 확인 출석'(venues.checkin_geo_required) — true | false | 'fail'(조회 실패)
const venueFlag = { value: true as boolean | 'fail', reads: 0 };
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: rpcReply.data, error: null });
    },
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table !== 'venues' || cols !== 'checkin_geo_required') throw new Error(`unexpected ${table}.${cols}`);
            venueFlag.reads++;
            if (venueFlag.value === 'fail') return { data: null, error: { message: 'column does not exist' } };
            return { data: { checkin_geo_required: venueFlag.value }, error: null };
          },
        }),
      }),
    }),
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

// LOCATION-READY: 위치정보 이용 동의 — 'yes' 면 좌표 전송, 'no' 면 매장 id 만. 받은 opts(required 힌트)도 기록한다.
const consent = { value: 'yes' as 'yes' | 'no', asks: 0, opts: [] as unknown[] };
vi.mock('../lib/locationConsent', () => ({
  ensureLocationConsent: async (_ask: unknown, opts: unknown) => { consent.asks++; consent.opts.push(opts); return consent.value === 'yes'; },
}));

import { checkIn } from './checkins';
import {
  CheckinGeoError, CheckinGeoRequiredError, getCheckinPosition, geoErrorCodeOf, isLowAccuracy, resetCheckinGeoFlagCache, parseCheckinGeoEnabled,
} from '../lib/checkinGeo';

type Opts = PositionOptions | undefined;
function stubGeo(impl: (ok: PositionCallback, bad: PositionErrorCallback, o: Opts) => void) {
  const seen: { opts: Opts } = { opts: undefined };
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: PositionCallback, bad: PositionErrorCallback, o: Opts) => { seen.opts = o; impl(ok, bad, o); } } });
  return seen;
}
const pos = (lat: number, lng: number, accuracy: number) => ({ coords: { latitude: lat, longitude: lng, accuracy } }) as GeolocationPosition;
const noGeo = () => stubGeo(() => { throw new Error('위치를 물으면 안 된다'); });

beforeEach(() => {
  rpcCalls.length = 0; flag.value = 'on'; flag.reads = 0; venueFlag.value = true; venueFlag.reads = 0;
  consent.value = 'yes'; consent.asks = 0; consent.opts = [];
  rpcReply.data = { name: '누리 홀덤', points: 3, streak: 1 }; resetCheckinGeoFlagCache();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('checkIn — 위치를 싣고 간다(위치 확인 출석 매장)', () => {
  it('좌표·오차를 check_in 에 그대로 보낸다', async () => {
    stubGeo((ok) => ok(pos(37.5, 127.01, 35)));
    const r = await checkIn('v-1');
    expect(r.name).toBe('누리 홀덤');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1', p_lat: 37.5, p_lng: 127.01, p_accuracy: 35 } }]);
  });

  // 시행일 전(또는 서버가 받아 주는 경우): 위치를 못 얻어도 막지 않고 좌표 없이 보낸다 — 받을지는 서버가 정한다.
  it.each([
    ['권한 차단(1)', 1], ['측위 실패(2)', 2], ['시간 초과(3)', 3],
  ])('%s → 던지지 않고 매장 id 만으로 check_in 1회(서버가 받으면 출석)', async (_label, code) => {
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
  it('꺼짐(행 없음) → 위치·매장 설정을 묻지 않고 매장 id 만(이 번들 이전 운영과 동일)', async () => {
    flag.value = null; noGeo();
    await checkIn('v-1');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
    expect(venueFlag.reads).toBe(0);
    expect(consent.asks).toBe(0);
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

describe('checkIn — 매장의 위치 확인 출석(20261004d · 오너 결정 (다)-(g))', () => {
  it('매장이 안 켰으면 스위치가 켜져도 동의를 묻지 않고 위치도 받지 않는다(지금과 같은 출석)', async () => {
    venueFlag.value = false; noGeo();
    const r = await checkIn('v-1');
    expect(r.name).toBe('누리 홀덤');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
    expect(consent.asks).toBe(0);
  });
  it('매장 설정 조회 실패(마이그레이션 전 등) → 꺼짐으로 보고 매장 id 만 — 켠 매장이면 서버가 code 로 알려 준다', async () => {
    venueFlag.value = 'fail'; noGeo();
    await checkIn('v-1');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
    expect(consent.asks).toBe(0);
  });
  it('geoRequired(재시도 시트) → 스위치·매장 조회 없이 동의를 required 로 묻고 좌표를 싣는다', async () => {
    flag.value = null; venueFlag.value = false;
    stubGeo((ok) => ok(pos(37.5, 127, 10)));
    await checkIn('v-1', { geoRequired: true });
    expect(flag.reads).toBe(0);
    expect(venueFlag.reads).toBe(0);
    expect(consent.opts).toEqual([{ required: true }]);
    expect(rpcCalls[0].args).toMatchObject({ p_venue_id: 'v-1', p_lat: 37.5 });
  });
});

describe('checkIn — 위치정보 이용 동의(LOCATION-READY)', () => {
  it('동의하지 않음 → 위치를 묻지 않고 매장 id 만(시행일 전에는 서버가 받아 출석된다)', async () => {
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
    const e = await checkIn('v-1').catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(CheckinGeoRequiredError); // 반경 밖은 종전 토스트
    expect(e.message).toBe('매장 근처에서만 출석할 수 있어요');
  });
});

describe('checkIn — 시행일 뒤 서버 거부(geo_consent_required · geo_position_required)', () => {
  const MSG = '위치 확인 출석 매장이라 위치정보 이용에 동의해야 이 매장에서 출석할 수 있습니다. 동의하지 않아도 매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다';
  it('동의 없음 → CheckinGeoRequiredError(consent) · 서버 문구 그대로', async () => {
    consent.value = 'no'; noGeo();
    rpcReply.data = { code: 'geo_consent_required', error: MSG };
    const e = await checkIn('v-1').catch((x) => x);
    expect(e).toBeInstanceOf(CheckinGeoRequiredError);
    expect(e.reason).toBe('consent');
    expect(e.message).toBe(MSG);
  });
  it('위치 실패 + 서버 position 거부 → 원래의 CheckinGeoError(사유 그대로 — 재시도 시트가 권한 안내를 한다)', async () => {
    stubGeo((_ok, bad) => bad({ code: 1, message: 'x' } as GeolocationPositionError));
    rpcReply.data = { code: 'geo_position_required', error: '위치 확인 출석 매장이라 현재 위치를 확인해야 QR 출석이 됩니다' };
    const e = await checkIn('v-1').catch((x) => x);
    expect(e).toBeInstanceOf(CheckinGeoError);
    expect(e.code).toBe('denied');
    expect(rpcCalls).toEqual([{ name: 'check_in', args: { p_venue_id: 'v-1' } }]);
  });
  it('위치를 시도하지 않았는데 position 거부(매장 설정 못 읽음 등) → CheckinGeoRequiredError(position)', async () => {
    venueFlag.value = 'fail'; noGeo();
    rpcReply.data = { code: 'geo_position_required', error: '위치를 확인해야 QR 출석이 됩니다' };
    const e = await checkIn('v-1').catch((x) => x);
    expect(e).toBeInstanceOf(CheckinGeoRequiredError);
    expect(e.reason).toBe('position');
  });
  it('모르는 code 는 평범한 Error(시트로 오인하지 않는다)', async () => {
    noGeo(); consent.value = 'no';
    rpcReply.data = { code: 'something_else', error: '알 수 없는 거부' };
    const e = await checkIn('v-1').catch((x) => x);
    expect(e).not.toBeInstanceOf(CheckinGeoRequiredError);
    expect(e.message).toBe('알 수 없는 거부');
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
