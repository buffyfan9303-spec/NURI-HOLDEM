// 오류 메시지 변환 — '저장 실패' 한 문장으로 뭉개지던 것을 되살리는 계약.
//
// 이 함수가 틀리면 현장에서 사장님이 '다시 누르면 되는 상황'인지 '눌러도 소용없는 상황'인지
// 구분하지 못한다. 특히 서버가 사용자를 향해 직접 쓴 문장(raise exception)을 번역해버리면
// 정보가 오히려 줄어드므로, 그 경계를 여기서 못 박는다.
import { describe, it, expect } from 'vitest';
import { msgOf, isOffline, isDenied } from './dbError';

describe('msgOf. 서버가 준 이유를 살린다', () => {
  it('🔴 Supabase 오류는 평범한 객체다. instanceof Error 로는 못 읽는다', () => {
    // 이게 이 함수가 존재하는 이유. 앱 148곳이 `e instanceof Error ? e.message : 'X'` 였다.
    const pgErr = { message: '이미 등록된 닉네임입니다', code: 'P0001', details: null, hint: null };
    expect(pgErr instanceof Error).toBe(false);          // 기존 코드가 놓치던 지점
    expect(msgOf(pgErr, '저장 실패')).toBe('이미 등록된 닉네임입니다');
  });

  it('서버가 사용자를 향해 쓴 문장(P0001)은 그대로 보여준다', () => {
    expect(msgOf({ code: 'P0001', message: '이미 종료된 대회입니다. 예약할 수 없습니다' }))
      .toBe('이미 종료된 대회입니다. 예약할 수 없습니다');
  });

  it('사용자가 못 읽는 기술 코드는 행동 가능한 문장으로 옮긴다', () => {
    expect(msgOf({ code: '42501', message: 'new row violates row-level security policy' }))
      .toContain('권한이 없습니다');
    expect(msgOf({ code: '23505', message: 'duplicate key value violates unique constraint' }))
      .toContain('이미 등록된');
    expect(msgOf({ code: 'PGRST202', message: 'Could not find the function' }))
      .toContain('새로고침');
  });

  it('네트워크 끊김은 따로 구분한다. 유일하게 "다시 시도하면 되는" 부류다', () => {
    expect(msgOf(new TypeError('Failed to fetch'))).toContain('네트워크');
    expect(isOffline(new TypeError('Failed to fetch'))).toBe(true);
    expect(isOffline({ code: '42501', message: 'denied' })).toBe(false);
  });

  it('🔴 권한 거부는 조회 실패와 다른 상태다. 카드 문구가 갈라져야 한다', () => {
    expect(isDenied({ code: '42501', message: 'permission denied for table ledger' })).toBe(true);
    expect(isDenied({ status: 403 })).toBe(true);
    // 네트워크·서버 오류는 '권한 없음'이 아니다 — 재시도로 풀리는 부류라 뭉치면 안 된다
    expect(isDenied(new TypeError('Failed to fetch'))).toBe(false);
    expect(isDenied({ code: 'PGRST202' })).toBe(false);
    expect(isDenied(null)).toBe(false);
  });

  it('평범한 Error 도 메시지를 살린다', () => {
    expect(msgOf(new Error('클락 저장 실패'), '기본값')).toBe('클락 저장 실패');
  });

  it('🔴 단서가 전혀 없을 때만 fallback. 있으면 절대 뭉개지 않는다', () => {
    expect(msgOf(null, '장부 저장 실패')).toBe('장부 저장 실패');
    expect(msgOf({}, '장부 저장 실패')).toBe('장부 저장 실패');
    // details/hint 라도 있으면 원인 추적 단서로 남긴다
    expect(msgOf({ details: 'column x does not exist' }, '등록 실패'))
      .toBe('등록 실패 (column x does not exist)');
  });

  it('빈 fallback 을 주면 빈 문자열 · 카드에서 "이유 줄"을 숨기는 용도', () => {
    expect(msgOf({}, '')).toBe('');
  });
});

// 보안 표준 6번 — **에러 메시지에 내부 식별자·SQL 을 노출하지 않는다.**
//
// `LoadErrorCard` 는 `msgOf(error, '')` 를 그대로 DOM 에 그린다(48곳+ 에서 쓰인다).
// 그중에는 **비로그인도 닿는 화면**이 있다(이벤트 판). 공개 저장소 구조 위에서
// Postgres 원문을 그리면 테이블·컬럼·제약 이름을 그대로 알려 주는 꼴이다.
//
// 동시에 이 파일이 원래 막으려던 것 — '전부 저장 실패로 뭉개짐' — 이 되돌아오면 안 된다.
// 그래서 아래 두 절이 **양쪽**을 잠근다.
describe('🔴 Postgres 내부 오류 원문이 화면으로 새지 않는다', () => {
  const LEAKS: [string, string][] = [
    ['42P01', 'relation "secret_settings" does not exist'],
    ['42703', 'column profiles.ci_hash does not exist'],
    ['42883', 'function admin_withdraw_user(uuid) does not exist'],
    ['XX000', 'internal error: cache lookup failed for type 16385'],
    ['53300', 'too many connections for role "authenticated"'],
    ['40001', 'could not serialize access due to concurrent update'],
  ];

  for (const [code, message] of LEAKS) {
    it(`${code} — 원문 대신 준비된 문구를 보여준다`, () => {
      const out = msgOf({ code, message }, '불러오지 못했습니다');
      expect(out, `원문이 그대로 화면에 나간다: ${out}`).toBe('불러오지 못했습니다');
      expect(out).not.toContain('does not exist');
    });
  }

  it('details 는 원문보다 더 노골적이다 — 같은 기준으로 막는다', () => {
    const out = msgOf(
      { code: '23503', details: 'Key (venue_id)=(9f2c…) is not present in table "venues"' },
      '등록 실패',
    );
    // 23503 은 위 switch 가 이미 사람 문장으로 바꾼다 — details 가 덧붙지 않는지 확인한다.
    expect(out).not.toMatch(/venues|venue_id/);
  });

  it('코드가 없는 details 는 그대로 둔다 — 우리 코드가 쓴 문장이라 식별자가 아니다', () => {
    expect(msgOf({ details: 'column x does not exist' }, '등록 실패'))
      .toBe('등록 실패 (column x does not exist)');
  });
});

describe('🔴 그렇다고 전부 뭉개지 않는다 (이 파일이 원래 막으려던 것)', () => {
  it('P0001 — 서버가 사용자를 향해 쓴 문장은 그대로 보여준다', () => {
    expect(msgOf({ code: 'P0001', message: '이미 종료된 대회입니다' }, '기본값'))
      .toBe('이미 종료된 대회입니다');
  });

  it('코드 없는 오류(네트워크·SDK·우리 throw)는 원문을 살린다', () => {
    expect(msgOf({ message: '이미 사용된 이용권입니다' }, '기본값')).toBe('이미 사용된 이용권입니다');
    expect(msgOf(new Error('클락 저장 실패'), '기본값')).toBe('클락 저장 실패');
  });

  it('행동 가능한 코드는 여전히 행동 가능한 문장이다', () => {
    expect(msgOf({ code: '42501', message: 'permission denied for table ledger' }, 'x'))
      .toMatch(/권한이 없습니다/);
    expect(msgOf({ code: 'PGRST202', message: 'Could not find the function' }, 'x'))
      .toMatch(/새로고침/);
  });

  it('PGRST 계층 코드는 5글자가 아니라 내부 분류에 걸리지 않는다', () => {
    expect(msgOf({ code: 'PGRST116', message: '결과가 없습니다' }, '기본값')).toBe('결과가 없습니다');
  });
});
