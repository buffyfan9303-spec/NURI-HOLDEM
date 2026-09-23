// CHECKIN-GEO 재시도 시트 — 위치를 못 얻은 출석만 시트로, 서버 거부는 종전 토스트로.
// 음성 대조(2026-09-24 확인): checkinFailureAction 의 `instanceof CheckinGeoError` 분기를 지우면 ①이,
//   App.tsx runCheckin 의 catch 를 옛 한 줄(`toast.show(e instanceof Error ? …)`)로 되돌리면 ③이 빨개진다.
// 실행: npx vitest run src/lib/checkinGeoRetry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../api/settings', () => ({ getAppSetting: async () => null }));

import { CheckinGeoError, CHECKIN_GEO_MESSAGE, type CheckinGeoErrorCode } from './checkinGeo';
import { checkinFailureAction, checkinGeoRetryCopy, isKakaoInApp } from './checkinGeoRetry';

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
    expect(body).toContain('checkIn(venueId)');
  });
  it('catch 가 checkinFailureAction 으로 갈라 CheckinGeoError 는 시트 상태로 보낸다', () => {
    // 렌더 시점 계정 — uidRef 는 QR effect 보다 늦게 선언된 effect 가 채워 첫 호출에서 null 이었다(e2e G1 실측)
    expect(body).toMatch(/const forUid = checkinUidRef\.current;/);
    expect(body).toMatch(/checkinFailureAction\(e\)/);
    expect(body).toMatch(/setGeoRetry\(\{ venueId, code: act\.code, uid: forUid, open: true \}\)/);
    expect(body).toMatch(/else toast\.show\(act\.message, 'error'\)/);
    // 옛 한 줄 토스트가 남아 있으면 시트가 영영 안 뜬다
    expect(body).not.toMatch(/\.catch\(\(e\) => toast\.show\(e instanceof Error/);
  });
  it('시트는 요청 시점 uid 와 지금 계정이 같을 때만 그리고, 재시도 버튼이 runCheckin 을 다시 부른다', () => {
    expect(app).toMatch(/geoRetry && geoRetry\.uid === \(user\?\.id \?\? null\) &&/);
    const sheet = app.slice(app.indexOf('data-testid="checkin-geo-retry"'), app.indexOf('data-testid="checkin-geo-retry"') + 900);
    expect(sheet).toMatch(/runCheckin\(v\)/);
    expect(sheet).toContain('위치 확인 후 출석');
  });
  it('늦은 응답을 setter 에 직접 물리지 않는다(`.then(set…` 0건 — 이번 배선 구간)', () => {
    expect(body).not.toMatch(/\.then\(set[A-Z]/);
  });
});
