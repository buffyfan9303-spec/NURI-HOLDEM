// 2026-10-01 보안 표준 6 — PostgREST·Supabase 시스템 원문이 화면으로 새지 않는다.
//   증거: store-tabjump-b/raw-error-exposure-mystore.md — 내 매장 오류 카드 19곳(LoadErrorCard → msgOf)이
//   'JSON object requested, multiple (or no) rows returned'(PGRST116)·'Invalid API key' 를 그대로 그렸다.
//   근본 원인: msgOf 가 5글자 SQLSTATE 만 내부 오류로 걸러 PGRST*·코드 없는 원문은 통과시켰다.
//   규칙: 한글 문장(우리가 쓴 것)만 통과 — dbError.ts isUserSentence.
//   음성 대조: dbError.ts 의 `&& isUserSentence(raw)`·`!isUserSentence(detail)`·P0001 분기를 되돌리면 ① 가 빨개진다.
//   양성 대조: ② 는 서버 한국어 문장이 일반 문구로 덮이지 않는지 잠근다(둘 다 있어야 한다 — 아무것도 안 보이는 고장은 음성만으론 안 잡힌다).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { msgOf } from './dbError';

afterEach(() => { vi.restoreAllMocks(); });

const FB = '장부를 불러오지 못했습니다';

describe('① 🔴 시스템 원문 — 화면에 안 나간다(fallback 으로 대체, 원문은 콘솔로)', () => {
  const RAW: [string, { code?: string; message: string; details?: string; hint?: string; status?: number }][] = [
    ['PGRST116 (카드 19곳의 원인)', { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' }],
    ['PGRST116 — code 가 버려진 감싼 Error', { message: 'JSON object requested, multiple (or no) rows returned' }],
    ['Invalid API key', { message: 'Invalid API key', status: 401 }],
    ['PGRST204 — 스키마 캐시(컬럼·테이블 이름 노출)', { code: 'PGRST204', message: "Could not find the 'ci_hash' column of 'profiles' in the schema cache" }],
    ['PGRST200 — 관계 이름 노출', { code: 'PGRST200', message: "Could not find a relationship between 'ledger_entries' and 'venues' in the schema cache", hint: "Perhaps you meant 'venue_staff'" }],
    ['PGRST100 — 필터 파싱', { code: 'PGRST100', message: '"failed to parse filter (eq.)" (line 1, column 4)' }],
    ['코드 없는 제약 위반 원문', { message: 'duplicate key value violates unique constraint "ledger_entries_pkey"' }],
    ['코드 없는 JWT 원문', { message: 'JWT expired' }],
    ['영문 토큰(P0001 raise exception \'AUTH_REQUIRED\')', { code: 'P0001', message: 'AUTH_REQUIRED' }],
    ['한글 접두 + 시스템 원문을 붙여 감싼 Error', { message: '저장 실패: duplicate key value violates unique constraint "venues_slug_key"' }],
  ];

  for (const [name, err] of RAW) {
    it(name, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const out = msgOf(err, FB);
      expect(out).toBe(FB);                                       // 일반 문구만
      expect(out).not.toMatch(/JSON|API key|schema cache|relationship|constraint|JWT|AUTH_REQUIRED|rows|PGRST|ci_hash|profiles|ledger_entries/);
      expect(warn).toHaveBeenCalled();                            // 원문은 버리지 않는다 — 콘솔에 남는다
    });
  }

  it('LoadErrorCard 경로(fallback 빈 문자열) — 이유 줄 자체가 비어 아무 원문도 안 그려진다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(msgOf({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, '')).toBe('');
    expect(msgOf({ message: 'Invalid API key', status: 401 }, '')).toBe('');
  });

  it('details/hint 꼬리로도 새지 않는다 — PGRST116 의 details("The result contains 0 rows")', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(msgOf({ code: 'PGRST116', details: 'The result contains 0 rows', hint: null }, '등록 실패')).toBe('등록 실패');
    expect(msgOf({ details: 'column x does not exist' }, '등록 실패')).toBe('등록 실패');
  });
});

describe('② 🔴 양성 대조 — 서버가 사용자를 향해 쓴 한국어 문장은 그대로 나온다', () => {
  const SERVER_SENTENCES: [string, { code?: string; message: string }][] = [
    ['마감된 장부(P0001)', { code: 'P0001', message: '마감된 장부입니다. 마감을 해제한 뒤 수정해 주세요' }],
    ['이용권 바인(P0001)', { code: 'P0001', message: '이용권으로 승인한 바인은 삭제할 수 없습니다. 이용권 내역에서 먼저 취소해 주세요' }],
    ['종료된 대회(P0001)', { code: 'P0001', message: '이미 종료된 대회입니다. 예약할 수 없습니다' }],
    ['쿨다운(P0001)', { code: 'P0001', message: '12초 뒤에 다시 올릴 수 있습니다' }],
    ['PGRST 계층에 실린 한글 문장', { code: 'PGRST116', message: '해당 매장을 찾을 수 없습니다' }],
    ['코드 없는 우리 throw new Error(한글)', { message: '이미 사용된 이용권입니다' }],
    ['영문이 섞인 한글 문장(NURI·QR 같은 고유어)', { code: 'P0001', message: 'QR 출석은 매장 안에서만 할 수 있습니다' }],
  ];

  for (const [name, err] of SERVER_SENTENCES) {
    it(name, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(msgOf(err, FB)).toBe(err.message);
      expect(warn).not.toHaveBeenCalled();                        // 정상 문장은 오류 로그도 만들지 않는다
    });
  }

  it('한글 details 꼬리는 유지', () => {
    expect(msgOf({ details: '이미 마감된 날짜입니다' }, '등록 실패')).toBe('등록 실패 (이미 마감된 날짜입니다)');
  });

  it('Error 인스턴스(PostgrestError 도 extends Error)도 같은 규칙', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(msgOf(new Error('클락 저장 실패'), FB)).toBe('클락 저장 실패');
    expect(msgOf(new Error('JSON object requested, multiple (or no) rows returned'), FB)).toBe(FB);
  });
});
