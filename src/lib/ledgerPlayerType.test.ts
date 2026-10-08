// 실행: npx vitest run src/lib/ledgerPlayerType.test.ts
import { describe, it, expect } from 'vitest';
import { playerTypeMap, playerTypeKey } from './ledgerPlayerType';

describe('SP13 · 손님 유형은 (게임#이름) 별로 갈린다', () => {
  it('메인 staff 와 사이드 동명 regular 가 각자 유형을 갖고, 사이드 전용 손님도 유형이 있다', () => {
    const m = playerTypeMap([
      { gameSeq: 1, name: '김철수', visitorType: 'staff' },
      { gameSeq: 2, name: '김철수', visitorType: 'regular' },
      { gameSeq: 2, name: '박영희', visitorType: 'new' },
      { gameSeq: 1, name: '이몽룡', visitorType: '지인' },
      { gameSeq: 1, name: '성춘향', visitorType: null },
    ]);
    expect(m.get(playerTypeKey(1, '김철수'))).toBe('staff');
    expect(m.get(playerTypeKey(2, '김철수'))).toBe('regular');
    expect(m.get(playerTypeKey(2, '박영희'))).toBe('new');
    expect(m.get(playerTypeKey(1, '이몽룡'))).toBe('other');
    expect(m.get(playerTypeKey(1, '성춘향'))).toBe('none');
  });
});
