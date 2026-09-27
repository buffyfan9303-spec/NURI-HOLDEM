// 가입 때 받은 위치 동의(선택)를 **그 계정의 세션이 생긴 뒤에만** 서버에 적는다(2026-09-27 오너 요청 4).
// 실행: npx vitest run src/lib/signupLocationConsent.test.ts
// 음성 대조: flushSignupLocationConsent 의 세션 이메일 비교 줄을 지우면 ②·③ 이 실패한다(세션 없이·남의 세션으로 적는다).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const srv = { saved: [] as [boolean, number][], session: null as null | { user: { email: string } } };
vi.mock('../api/locationPrivacy', () => ({
  getMyLocationConsent: async () => ({ state: 'unset', termsVersion: null, grantedAt: null, revokedAt: null }),
  setMyLocationConsent: async (g: boolean, v: number) => { srv.saved.push([g, v]); return { state: g ? 'granted' : 'denied', termsVersion: v, grantedAt: null, revokedAt: null }; },
}));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: srv.session } }) } } }));

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });

import { rememberSignupLocationConsent, flushSignupLocationConsent, LOCATION_TERMS_VERSION } from './locationConsent';

beforeEach(() => { srv.saved = []; srv.session = null; mem.clear(); });

describe('가입 위치 동의 — 세션이 생긴 뒤 그 계정에만 적는다', () => {
  it('① 가입이 세션을 만들었으면 바로 제2판 동의로 적고 남긴 것을 지운다', async () => {
    srv.session = { user: { email: 'new@example.com' } };
    rememberSignupLocationConsent('New@Example.com ');
    expect(await flushSignupLocationConsent('new@example.com')).toBe(true);
    expect(srv.saved).toEqual([[true, LOCATION_TERMS_VERSION]]);
    expect(await flushSignupLocationConsent('new@example.com')).toBe(false); // 두 번 적지 않는다
    expect(srv.saved.length).toBe(1);
  });
  it('② 세션이 없으면(확인 메일 대기) 적지 않고 남겨 두었다가 로그인한 뒤 적는다', async () => {
    rememberSignupLocationConsent('wait@example.com');
    expect(await flushSignupLocationConsent('wait@example.com')).toBe(false);
    expect(srv.saved).toEqual([]);
    srv.session = { user: { email: 'wait@example.com' } };
    expect(await flushSignupLocationConsent('wait@example.com')).toBe(true);
    expect(srv.saved).toEqual([[true, LOCATION_TERMS_VERSION]]);
  });
  it('③ 다른 계정의 세션이면 남의 동의를 대신 적지 않는다', async () => {
    rememberSignupLocationConsent('a@example.com');
    srv.session = { user: { email: 'b@example.com' } };
    expect(await flushSignupLocationConsent('a@example.com')).toBe(false);
    expect(await flushSignupLocationConsent('b@example.com')).toBe(false);
    expect(srv.saved).toEqual([]);
  });
  it('④ 체크하지 않았으면(남긴 것 없음) 아무것도 적지 않는다 — 동의 안 함은 기록하지 않고 출석 때 묻는다', async () => {
    srv.session = { user: { email: 'no@example.com' } };
    expect(await flushSignupLocationConsent('no@example.com')).toBe(false);
    expect(srv.saved).toEqual([]);
  });
  it('⑤ 30일 지난 것은 버린다', async () => {
    mem.set('nuri:signup-location-consent', JSON.stringify({ email: 'old@example.com', v: LOCATION_TERMS_VERSION, at: Date.now() - 31 * 86400000 }));
    srv.session = { user: { email: 'old@example.com' } };
    expect(await flushSignupLocationConsent('old@example.com')).toBe(false);
    expect(srv.saved).toEqual([]);
    expect(mem.size).toBe(0);
  });
});
