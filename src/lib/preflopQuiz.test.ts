// preflopQuiz — 오답 노트가 기대는 두 계약: ① 키로 문제가 그대로 복원된다 ② 저장돼 있지 않은 '내 답'은 권장의 반대로 파생된다.
import { describe, it, expect } from 'vitest';
import { makeQuiz, wrongPickOf, type Quiz } from './preflopQuiz';

const q = (freq: number, actionLabel = '오픈'): Quiz =>
  ({ mode: 'rfi', key: 'rfi|x|AKs', posLabel: 'CO', situ: '', hand: 'AKs', cards: [] as unknown as Quiz['cards'], freq, actionLabel });

describe('wrongPickOf · 파생 내 답', () => {
  it('권장이 액션(≥75%)이면 내 답은 폴드', () => { expect(wrongPickOf(q(1))).toBe('폴드'); expect(wrongPickOf(q(0.75))).toBe('폴드'); });
  it('권장이 폴드(≤25%)면 내 답은 그 액션 라벨', () => { expect(wrongPickOf(q(0, '올인'))).toBe('올인'); expect(wrongPickOf(q(0.25))).toBe('오픈'); });
  it('혼합 구간은 오답이 날 수 없으므로 null', () => { expect(wrongPickOf(q(0.5))).toBeNull(); });
});

describe('makeQuiz(mode, key) · 오답 키 복원', () => {
  it('rfi 키는 같은 키·핸드·시나리오로 복원된다', () => {
    const fresh = makeQuiz('rfi');
    const back = makeQuiz('rfi', fresh.key);
    expect(back.key).toBe(fresh.key);
    expect(back.hand).toBe(fresh.hand);
    expect(back.posLabel).toBe(fresh.posLabel);
    expect(back.freq).toBe(fresh.freq);
  });
  it('push 키도 포지션·스택·핸드가 그대로 돌아온다', () => {
    const back = makeQuiz('push', 'push|2-10|A5s');
    expect(back).toMatchObject({ mode: 'push', key: 'push|2-10|A5s', posLabel: 'BTN', situ: '10bb · 첫 진입', hand: 'A5s', actionLabel: '올인' });
  });
  it('사라진 스팟 키는 조용히 새 문제를 뽑는다(키가 달라진다)', () => {
    expect(makeQuiz('rfi', 'rfi|no_such_spot|AKs').key).not.toBe('rfi|no_such_spot|AKs');
  });
});
