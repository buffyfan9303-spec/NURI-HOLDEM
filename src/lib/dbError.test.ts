// 오류 메시지 변환 — '저장 실패' 한 문장으로 뭉개지던 것을 되살리는 계약.
//
// 이 함수가 틀리면 현장에서 사장님이 '다시 누르면 되는 상황'인지 '눌러도 소용없는 상황'인지
// 구분하지 못한다. 특히 서버가 사용자를 향해 직접 쓴 문장(raise exception)을 번역해버리면
// 정보가 오히려 줄어드므로, 그 경계를 여기서 못 박는다.
import { describe, it, expect } from 'vitest';
import { msgOf, isOffline } from './dbError';

describe('msgOf — 서버가 준 이유를 살린다', () => {
  it('🔴 Supabase 오류는 평범한 객체다 — instanceof Error 로는 못 읽는다', () => {
    // 이게 이 함수가 존재하는 이유. 앱 148곳이 `e instanceof Error ? e.message : 'X'` 였다.
    const pgErr = { message: '이미 등록된 닉네임입니다', code: 'P0001', details: null, hint: null };
    expect(pgErr instanceof Error).toBe(false);          // 기존 코드가 놓치던 지점
    expect(msgOf(pgErr, '저장 실패')).toBe('이미 등록된 닉네임입니다');
  });

  it('서버가 사용자를 향해 쓴 문장(P0001)은 그대로 보여준다', () => {
    expect(msgOf({ code: 'P0001', message: '이미 종료된 대회입니다 — 예약할 수 없습니다' }))
      .toBe('이미 종료된 대회입니다 — 예약할 수 없습니다');
  });

  it('사용자가 못 읽는 기술 코드는 행동 가능한 문장으로 옮긴다', () => {
    expect(msgOf({ code: '42501', message: 'new row violates row-level security policy' }))
      .toContain('권한이 없습니다');
    expect(msgOf({ code: '23505', message: 'duplicate key value violates unique constraint' }))
      .toContain('이미 등록된');
    expect(msgOf({ code: 'PGRST202', message: 'Could not find the function' }))
      .toContain('새로고침');
  });

  it('네트워크 끊김은 따로 구분한다 — 유일하게 "다시 시도하면 되는" 부류다', () => {
    expect(msgOf(new TypeError('Failed to fetch'))).toContain('네트워크');
    expect(isOffline(new TypeError('Failed to fetch'))).toBe(true);
    expect(isOffline({ code: '42501', message: 'denied' })).toBe(false);
  });

  it('평범한 Error 도 메시지를 살린다', () => {
    expect(msgOf(new Error('클락 저장 실패'), '기본값')).toBe('클락 저장 실패');
  });

  it('🔴 단서가 전혀 없을 때만 fallback — 있으면 절대 뭉개지 않는다', () => {
    expect(msgOf(null, '장부 저장 실패')).toBe('장부 저장 실패');
    expect(msgOf({}, '장부 저장 실패')).toBe('장부 저장 실패');
    // details/hint 라도 있으면 원인 추적 단서로 남긴다
    expect(msgOf({ details: 'column x does not exist' }, '등록 실패'))
      .toBe('등록 실패 (column x does not exist)');
  });

  it('빈 fallback 을 주면 빈 문자열 — 카드에서 "이유 줄"을 숨기는 용도', () => {
    expect(msgOf({}, '')).toBe('');
  });
});
