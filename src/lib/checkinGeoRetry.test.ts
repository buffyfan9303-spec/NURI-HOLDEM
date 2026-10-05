// CHECKIN-GEO 재시도 시트 — 위치를 못 얻은 출석만 시트로, 서버 거부는 종전 토스트로.
// 음성 대조(2026-09-24 확인): checkinFailureAction 의 `instanceof CheckinGeoError` 분기를 지우면 ①이,
//   App.tsx runCheckin 의 catch 를 옛 한 줄(`toast.show(e instanceof Error ? …)`)로 되돌리면 ③이 빨개진다.
// 실행: npx vitest run src/lib/checkinGeoRetry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../api/settings', () => ({ getAppSetting: async () => null }));

import { CheckinGeoError, CheckinGeoRequiredError, CHECKIN_GEO_MESSAGE, type CheckinGeoErrorCode } from './checkinGeo';
import { CHECKIN_ALT_PATH } from './locationTerms';
import { checkinFailureAction, checkinGeoRetryCopy, isKakaoInApp, requestCheckinRetrySheet, CHECKIN_RETRY_EVENT } from './checkinGeoRetry';

const CODES: CheckinGeoErrorCode[] = ['denied', 'unavailable', 'timeout', 'unsupported'];
const CHROME = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36';
const KAKAO = CHROME + ' KAKAOTALK 10.8.0';

describe('① 분기 — 위치 실패는 시트, 나머지는 토스트', () => {
  it.each(CODES)('CheckinGeoError(%s) → sheet', (code) => {
    expect(checkinFailureAction(new CheckinGeoError(code))).toEqual({ kind: 'sheet', code });
  });
  it('서버 거부(평범한 Error) → 원문 토스트(종전 그대로)', () => {
    expect(checkinFailureAction(new Error('매장에서 300m 밖이에요'))).toEqual({ kind: 'toast', message: '매장에서 300m 밖이에요' });
  });
  it('20261004d 서버 거부: 동의 없음 → consent 시트 · 좌표 없음 → 위치 시트(재시도 버튼이 다시 묻고 위치를 받는다)', () => {
    expect(checkinFailureAction(new CheckinGeoRequiredError('consent', 'x'))).toEqual({ kind: 'sheet', code: 'consent' });
    expect(checkinFailureAction(new CheckinGeoRequiredError('position', 'x'))).toEqual({ kind: 'sheet', code: 'unavailable' });
  });
  it('20261005a(critical P2) — 반경 밖·정확도 낮음 거부도 시트(출석 요청 버튼이 보인다) · 사유 문구 · 대체 경로', () => {
    expect(checkinFailureAction(new CheckinGeoRequiredError('out_of_range', 'x'))).toEqual({ kind: 'sheet', code: 'out_of_range' });
    expect(checkinFailureAction(new CheckinGeoRequiredError('low_accuracy', 'x'))).toEqual({ kind: 'sheet', code: 'low_accuracy' });
    const a = checkinGeoRetryCopy('out_of_range', CHROME);
    expect(a.reason).toMatch(/^매장 근처에서만 출석할 수 있습니다/);
    expect(a.action).toBe('위치 확인 후 출석');
    expect(a.alt).toBe(`동의하기 어렵거나 위치를 켤 수 없어도 ${CHECKIN_ALT_PATH}`);
    expect(checkinGeoRetryCopy('low_accuracy', CHROME).reason).toMatch(/^위치 정확도가 낮아/);
  });
  it('critical L3 — requestCheckinRetrySheet: 시트 대상이면 App 이벤트를 쏘고 true, 아니면 false(호출부 토스트)', () => {
    const w = new EventTarget();
    vi.stubGlobal('window', w);
    const got: unknown[] = [];
    w.addEventListener(CHECKIN_RETRY_EVENT, (ev) => got.push((ev as CustomEvent).detail));
    expect(requestCheckinRetrySheet('v-1', new CheckinGeoRequiredError('consent', 'x'))).toBe(true);
    expect(requestCheckinRetrySheet('v-2', new CheckinGeoError('denied'))).toBe(true);
    expect(requestCheckinRetrySheet('v-3', new Error('매장 근처에서만 출석할 수 있어요'))).toBe(false);
    expect(got).toEqual([{ venueId: 'v-1', code: 'consent' }, { venueId: 'v-2', code: 'denied' }]);
    vi.unstubAllGlobals();
  });
  it('Error 가 아닌 값 → 기본 문구 토스트', () => {
    expect(checkinFailureAction('x')).toEqual({ kind: 'toast', message: '출석 실패' });
    expect(checkinFailureAction(undefined)).toEqual({ kind: 'toast', message: '출석 실패' });
  });
});

describe('② 시트 문구', () => {
  it.each(CODES)('사유는 store-team 문구 그대로(%s)', (code) => {
    expect(checkinGeoRetryCopy(code, CHROME).reason).toBe(CHECKIN_GEO_MESSAGE[code]);
  });
  it('denied → 브라우저 권한 안내, 그 외(일반 브라우저) → 추가 안내 없음', () => {
    expect(checkinGeoRetryCopy('denied', CHROME).hint).toMatch(/권한 → 위치/);
    expect(checkinGeoRetryCopy('timeout', CHROME).hint).toBeNull();
  });
  it('모든 사유에 대체 경로(출석 요청 → 업주 승인)를 붙인다 — 이 시트는 위치 확인 출석 매장에서만 뜬다(오너 결정 (다)-(a) · critical L1)', () => {
    for (const c of [...CODES, 'consent' as const]) {
      const copy = checkinGeoRetryCopy(c, CHROME);
      expect(copy.alt).toBe(`동의하기 어렵거나 위치를 켤 수 없어도 ${CHECKIN_ALT_PATH}`);
      expect(copy.alt).toMatch(/매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다$/);
    }
    expect(checkinGeoRetryCopy('consent', CHROME)).toMatchObject({ reason: expect.stringMatching(/위치정보 이용에 동의해야 이 매장에서 출석할 수 있습니다/), action: '동의하고 출석' });
    expect(checkinGeoRetryCopy('denied', CHROME).action).toBe('위치 확인 후 출석');
  });
  it('카카오 인앱 → 코드와 무관하게 외부 브라우저 안내', () => {
    expect(isKakaoInApp(KAKAO)).toBe(true);
    expect(isKakaoInApp(CHROME)).toBe(false);
    for (const c of CODES) expect(checkinGeoRetryCopy(c, KAKAO).hint).toMatch(/다른 브라우저로 열기/);
  });
});

describe('③ App.tsx 배선 — runCheckin 이 이 분기를 쓰고, 시트는 요청 시점 계정에만 그린다', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  const start = app.indexOf('const runCheckin = useCallback(');
  const body = app.slice(start, app.indexOf('}, [toast, refreshProfile]);', start));
  it('runCheckin 을 찾았다(공허한 통과 방지)', () => {
    expect(start).toBeGreaterThan(0);
    expect(body).toContain('checkIn(venueId, opts)');
  });
  it('catch 가 checkinFailureAction 으로 갈라 CheckinGeoError 는 시트 상태로 보낸다', () => {
    // 렌더 시점 계정 — uidRef 는 QR effect 보다 늦게 선언된 effect 가 채워 첫 호출에서 null 이었다(e2e G1 실측).
    //   R3-01(2026-10-04): uidRef 를 렌더 본문 동기 갱신으로 옮겨 checkinUidRef 와 하나로 합쳤다 — 그 동기 갱신까지 잠근다.
    expect(body).toMatch(/const forUid = uidRef\.current;/);
    expect(app).toMatch(/\n\s*uidRef\.current = user\?\.id \?\? null;/);
    expect(app.match(/uidRef\.current =[^=]/g)?.length, 'uidRef 를 이펙트 안에서 다시 채우면 첫 runCheckin 에서 null 이 돌아온다').toBe(1);
    expect(body).toMatch(/checkinFailureAction\(e\)/);
    expect(body).toMatch(/setGeoRetry\(\{ venueId, code: act\.code, uid: forUid, open: true \}\)/);
    expect(body).toMatch(/else toast\.show\(act\.message, 'error'\)/);
    // 옛 한 줄 토스트가 남아 있으면 시트가 영영 안 뜬다
    expect(body).not.toMatch(/\.catch\(\(e\) => toast\.show\(e instanceof Error/);
  });
  it('시트는 요청 시점 uid 와 지금 계정이 같을 때만 그리고, 재시도 버튼이 runCheckin 을 다시 부른다', () => {
    expect(app).toMatch(/geoRetry && geoRetry\.uid === \(user\?\.id \?\? null\) &&/);
    const sheet = app.slice(app.indexOf('data-testid="checkin-geo-retry"'), app.indexOf('data-testid="checkin-geo-retry"') + 1400);
    // 재시도는 '켠 매장'으로 보고 다시 묻는다(스위치·매장 조회 실패가 반복돼도 시트에서 빠져나갈 길이 있다)
    expect(sheet).toMatch(/runCheckin\(v, \{ geoRequired: true \}\)/);
    expect(sheet).toContain('{copy.action}');
    expect(sheet).toMatch(/data-testid="checkin-geo-retry-alt"[^>]*>\{copy\.alt\}/);
  });
  it('늦은 응답을 setter 에 직접 물리지 않는다(`.then(set…` 0건 — 이번 배선 구간)', () => {
    expect(body).not.toMatch(/\.then\(set[A-Z]/);
  });
});
