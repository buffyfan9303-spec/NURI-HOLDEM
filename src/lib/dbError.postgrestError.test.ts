// 독립 검증 C(2026-09-13) — dbError.ts 머리 주석이 사실과 달랐다: "PostgrestError 는 평범한 객체라 instanceof Error 가 false".
//   설치된 @supabase/postgrest-js 2.112.3 의 PostgrestError 는 `extends Error` 다(src/PostgrestError.ts:25).
//   그래서 `e instanceof Error ? e.message : '…'` 관용구(src/components 148+곳)는 **DB 원문**(permission denied for table …)을
//   그대로 화면에 낸다 — msgOf 를 써야 하는 이유가 "instanceof 가 false 라서" 가 아니라 "true 라서 원문이 새기 때문" 이다.
// 이 파일이 보는 것: ① 실제 설치본에서 instanceof Error 가 true ② 주석이 그 사실과 버전을 적고 있다 ③ msgOf 는 원문을 가린다.
// 음성 대조: dbError.ts 머리 주석의 `extends Error` 문장을 옛 문장으로 되돌리면 ② 가 실패한다.
// 실행: npx vitest run src/lib/dbError.postgrestError.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PostgrestError } from '@supabase/postgrest-js';
import { msgOf } from './dbError';

describe('PostgrestError 의 실체(설치본)', () => {
  it('🔴 instanceof Error 가 true 다 — 옛 주석의 전제가 거짓', () => {
    const e = new PostgrestError({ message: 'permission denied for table dealer_shifts', details: '', hint: '', code: '42501' });
    expect(e instanceof Error).toBe(true);
    expect(e.message).toBe('permission denied for table dealer_shifts');
  });
  it('🔴 dbError.ts 머리 주석이 실측(extends Error · 버전)을 적는다', () => {
    const head = readFileSync(join(__dirname, 'dbError.ts'), 'utf-8').slice(0, 1600);
    expect(head).toMatch(/extends Error/);
    expect(head).toMatch(/postgrest-js 2\.112\.3/);
    expect(head).not.toMatch(/\*\*평범한 객체\*\*라 instanceof Error 가 false/);
  });
  it('msgOf 는 42501 원문을 사용자 문장으로 바꾼다 — instanceof 관용구는 원문을 그대로 낸다', () => {
    const e = new PostgrestError({ message: 'permission denied for table dealer_shifts', details: '', hint: '', code: '42501' });
    expect(e instanceof Error ? e.message : 'x').toContain('permission denied');
    expect(msgOf(e, '추가 실패')).toBe('추가 실패 — 이 계정에는 권한이 없습니다');
  });
});
