// F-1(store-link-1002) — 늦게 온 직전 게임 설정은 빈 칸만 채운다. 실행: npx vitest run src/lib/ledgerPrefill.test.ts
import { describe, it, expect } from 'vitest';
import { fillEmptyFromPrefill, type PrefillFields } from './ledgerPrefill';

const EMPTY: PrefillFields = { title: '', cash: 0, card: 0, target: 0, dealers: '', event: '', discs: [] };
const PREV = { title: '데일리 딥스택', buyinAmount: 77000, cardAmount: 80000, targetEntries: 30, dealers: '김딜러', eventMemo: '얼리 보너스', discounts: [{ label: '조기', amount: 10000 }] };

describe('fillEmptyFromPrefill', () => {
  it('🔴 빈 폼이면 직전 설정 전부를 채운다(문구만 뜨고 칸이 비던 결함)', () => {
    expect(fillEmptyFromPrefill(EMPTY, PREV)).toEqual({
      title: '데일리 딥스택', cash: 77000, card: 80000, target: 30, dealers: '김딜러', event: '얼리 보너스', discs: PREV.discounts,
    });
  });
  it('업주가 이미 친 칸은 덮지 않는다', () => {
    const typed = { ...EMPTY, title: '내가 친 이름', cash: 50000, dealers: '박딜러' };
    expect(fillEmptyFromPrefill(typed, PREV)).toEqual({ card: 80000, target: 30, event: '얼리 보너스', discs: PREV.discounts });
  });
  it('직전 설정이 비어 있는 칸은 건드리지 않는다', () => {
    expect(fillEmptyFromPrefill(EMPTY, { title: '  ', buyinAmount: 0, discounts: [] })).toEqual({});
  });
});
