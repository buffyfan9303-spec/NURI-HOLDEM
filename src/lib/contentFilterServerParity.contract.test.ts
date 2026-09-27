// 화면 금칙어(CASH_OUT_SOURCE)와 서버 contains_blocked_ugc(20260927d)가 글자 하나까지 같은지 잠근다.
// 한쪽만 바뀌면 화면은 통과시키고 서버가 거절하는 '이유 모를 실패'가 된다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CASH_OUT_SOURCE } from './content-filter';

describe('금칙어 화면·서버 동일성', () => {
  it('20260927d 의 contains_blocked_ugc 가 CASH_OUT_SOURCE 원문을 그대로 쓴다', () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 저장소 고정 경로
    const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20260927d_ugc_cashout_filter.sql'), 'utf8');
    expect(sql).toContain(`~* '${CASH_OUT_SOURCE}'`);
  });
});
