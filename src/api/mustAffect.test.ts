// mustAffect — "쓰기가 실패했는데 화면이 '성공'이라고 말한다" 부류의 단일 통로(_mustAffect.ts) 동작 계약.
//
// PostgREST 는 RLS 가 막은 UPDATE/DELETE 를 오류가 아니라 **0행 200** 으로 돌려준다.
// 이 헬퍼는 ① 서버 오류를 그대로 던지고 ② 0행을 NoRowsAffectedError 로 던지며 ③ 1행 이상이면 조용히 끝난다.
// 음성 대조: `if (!data || data.length === 0) throw …` 한 줄을 지우면 '0행' 두 테스트가 실패한다.
// 실행: npx vitest run src/api/mustAffect.test.ts
import { describe, it, expect } from 'vitest';
import { mustAffect, idempotentOff, NoRowsAffectedError, NO_ROWS_MESSAGE } from './_mustAffect';
import { msgOf } from '../lib/dbError';

/** `.update(…).eq(…)` 빌더 흉내 — select() 가 받은 인자를 기록한다(컬럼 함정 감시용). */
function builder(res: { data: unknown[] | null; error: Error | null }) {
  const calls: unknown[][] = [];
  return { calls, q: { select: (...args: unknown[]) => { calls.push(args); return Promise.resolve(res); } } };
}

describe('mustAffect — 반영 행을 확인한다', () => {
  it('1행 이상이면 조용히 끝난다', async () => {
    const { q } = builder({ data: [{ id: 'a' }], error: null });
    await expect(mustAffect(q)).resolves.toBeUndefined();
  });

  it('서버 오류는 **그 객체 그대로** 던진다 — 호출부의 instanceof Error / msgOf 분기가 종전과 같다', async () => {
    const err = Object.assign(new Error('permission denied for table x'), { code: '42501' });
    const { q } = builder({ data: null, error: err });
    await expect(mustAffect(q)).rejects.toBe(err);
  });

  it('🔴 0행(error 없음)은 NoRowsAffectedError — RLS 거부·이미 지워짐을 성공으로 넘기지 않는다', async () => {
    const { q } = builder({ data: [], error: null });
    await expect(mustAffect(q)).rejects.toBeInstanceOf(NoRowsAffectedError);
  });

  it('🔴 data 가 null 이어도(구형 응답) 0행으로 본다', async () => {
    const { q } = builder({ data: null, error: null });
    await expect(mustAffect(q)).rejects.toBeInstanceOf(NoRowsAffectedError);
  });

  it('맥락 문장을 넘기면 그 문장으로, 아니면 기본 문장으로 던진다', async () => {
    await expect(mustAffect(builder({ data: [], error: null }).q)).rejects.toThrow(NO_ROWS_MESSAGE);
    await expect(mustAffect(builder({ data: [], error: null }).q, '마감할 장부를 찾지 못했습니다')).rejects.toThrow('마감할 장부를 찾지 못했습니다');
  });

  it('select() 를 **인자 없이** 부른다 — id 컬럼이 없는 복합키 테이블에서 RETURNING id 로 쓰기가 롤백되지 않게', async () => {
    const { q, calls } = builder({ data: [{}], error: null });
    await mustAffect(q);
    expect(calls).toEqual([[]]);
  });
});

// 2026-09-13 검증 FAIL ①: 멱등 토글의 끄는 쪽은 켜는 쪽(upsert / 23505 무시)과 **대칭**이어야 한다.
//   mustAffect 를 그대로 쓰면 다른 탭에서 먼저 해제한 찜을 다시 해제할 때 던지고, 호출부의 되돌림이 서버와
//   반대 방향(찜함)을 그린다. 그래서 "0행 = 이미 그 상태 = 성공, error = 그대로 던짐" 인 통로를 따로 둔다.
// 음성 대조: idempotentOff 안의 `return !!data && data.length > 0` 을 `throw new NoRowsAffectedError()` 로 바꾸면
//   '0행' 두 테스트가 실패하고, `if (error) throw error` 를 지우면 '서버 오류' 테스트가 실패한다.
describe('idempotentOff — 멱등 토글의 끄는 쪽: 0행은 "이미 그 상태" 라 성공, error 는 그대로', () => {
  it('1행 이상이면 true 로 끝난다(실제로 지웠다)', async () => {
    const { q } = builder({ data: [{ user_id: 'u1' }], error: null });
    await expect(idempotentOff(q)).resolves.toBe(true);
  });

  it('🔴 0행(error 없음)이면 **던지지 않고** false — 켜기(upsert / 23505 무시)와 대칭', async () => {
    const { q } = builder({ data: [], error: null });
    await expect(idempotentOff(q)).resolves.toBe(false);
  });

  it('data 가 null 이어도(구형 응답) 0행 = false 로 본다', async () => {
    const { q } = builder({ data: null, error: null });
    await expect(idempotentOff(q)).resolves.toBe(false);
  });

  it('🔴 서버 오류는 **그 객체 그대로** 던진다 — 권한 거부까지 삼키지 않는다(0행만 흡수한다)', async () => {
    const err = Object.assign(new Error('permission denied for table venue_follows'), { code: '42501' });
    const { q } = builder({ data: null, error: err });
    await expect(idempotentOff(q)).rejects.toBe(err);
  });

  it('select() 를 인자 없이 부른다 — 복합키 테이블(venue_follows·post_reactions)에 id 컬럼이 없어도 롤백되지 않게', async () => {
    const { q, calls } = builder({ data: [{}], error: null });
    await idempotentOff(q);
    expect(calls).toEqual([[]]);
  });
});

describe('NoRowsAffectedError — 화면 문구 계약', () => {
  it('Error 를 상속한다 — 호출부의 `e instanceof Error ? e.message : …` 가 문장을 본다', () => {
    const e = new NoRowsAffectedError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('NoRowsAffectedError');
    expect(e.message).toBe(NO_ROWS_MESSAGE);
  });

  it('msgOf 를 그대로 통과한다 — 우리가 쓴 한국어 문장이고 내부 식별자가 없다(보안표준 6)', () => {
    expect(msgOf(new NoRowsAffectedError())).toBe(NO_ROWS_MESSAGE);
    expect(NO_ROWS_MESSAGE).not.toMatch(/[a-z_]+\.[a-z_]+|permission denied|row-level/i);
  });
});
