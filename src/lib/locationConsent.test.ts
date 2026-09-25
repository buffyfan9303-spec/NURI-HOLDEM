// LOCATION-READY(2026-09-26) — 출석 위치 확인의 동의 분기. 좌표를 보낼지(true) 말지(false)만 잠근다.
// 실행: npx vitest run src/lib/locationConsent.test.ts
// 음성 대조: ensureLocationConsent 의 `if (s.state === 'denied') return false;` 를 지우면 ②가, isConsentCurrent 의 버전 비교를 지우면 ④가 실패한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const srv = { state: { state: 'unset', termsVersion: null, grantedAt: null, revokedAt: null } as Record<string, unknown>, fail: false, saved: [] as [boolean, number][] };
vi.mock('../api/locationPrivacy', () => ({
  getMyLocationConsent: async () => { if (srv.fail) throw new Error('network'); return srv.state; },
  setMyLocationConsent: async (g: boolean, v: number) => { srv.saved.push([g, v]); return { state: g ? 'granted' : 'denied', termsVersion: v, grantedAt: null, revokedAt: null }; },
}));

import { ensureLocationConsent, isConsentCurrent, consentSummary, LOCATION_TERMS_VERSION } from './locationConsent';

const st = (state: string, termsVersion: number | null = LOCATION_TERMS_VERSION) => ({ state, termsVersion, grantedAt: null, revokedAt: null });

beforeEach(() => { srv.state = st('unset', null); srv.fail = false; srv.saved = []; });

describe('ensureLocationConsent', () => {
  it('① 현재 판 동의 → 묻지 않고 true', async () => {
    srv.state = st('granted');
    const ask = vi.fn();
    expect(await ensureLocationConsent(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
  it('② 동의 안 함 기록 → 묻지 않고 false(출석은 좌표 없이)', async () => {
    srv.state = st('denied');
    const ask = vi.fn();
    expect(await ensureLocationConsent(ask)).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
  it('③ 기록 없음 → 묻는다: 동의=저장 후 true · 거절=저장 후 false · 닫음=저장 없이 false', async () => {
    expect(await ensureLocationConsent(async () => true)).toBe(true);
    expect(await ensureLocationConsent(async () => false)).toBe(false);
    expect(await ensureLocationConsent(async () => null)).toBe(false);
    expect(srv.saved).toEqual([[true, LOCATION_TERMS_VERSION], [false, LOCATION_TERMS_VERSION]]);
  });
  it('④ 옛 약관 판 동의 → 다시 묻는다', async () => {
    srv.state = st('granted', LOCATION_TERMS_VERSION - 1);
    const ask = vi.fn(async () => true);
    expect(await ensureLocationConsent(ask)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it('⑤ 조회 실패 → false(좌표를 보내지 않는다 — 동의로 오인 금지)', async () => {
    srv.fail = true;
    const ask = vi.fn(async () => true);
    expect(await ensureLocationConsent(ask)).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('isConsentCurrent · consentSummary', () => {
  it('granted + 현재 판만 유효', () => {
    expect([st('granted'), st('granted', 1), st('denied'), st('unset', null)].map((s) => isConsentCurrent(s as never))).toEqual([true, false, false, false]);
  });
  it('상태 한 줄', () => {
    expect(consentSummary(st('granted') as never)).toMatch(/^동의함 · 제2판/);
    expect(consentSummary(st('denied') as never)).toBe('동의하지 않음');
    expect(consentSummary(st('unset', null) as never)).toMatch(/아직 선택하지 않음/);
  });
});
