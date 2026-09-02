// preflopQuiz — 오답 노트가 기대는 두 계약: ① 키로 문제가 그대로 복원된다 ② 저장돼 있지 않은 '내 답'은 권장의 반대로 파생된다.
// 모드 확장(2026-09-03): 6모드 문제 생성 · 채점 경계(0.25) · 키 왕복.
import { describe, it, expect } from 'vitest';
import { FOLD, MODES, gradePreflop, makeQuiz, modeOfKey, verdictOf, wrongPickOf, type Quiz, type QuizAct } from './preflopQuiz';

const q = (acts: QuizAct[] | number, actionLabel = '오픈'): Quiz => ({
  mode: 'rfi', key: 'rfi|x|AKs', posLabel: 'CO', situ: '', hand: 'AKs', cards: [] as unknown as Quiz['cards'], stackBb: 100,
  acts: typeof acts === 'number' ? [{ label: actionLabel, freq: acts }] : acts,
});

describe('wrongPickOf · 파생 내 답', () => {
  it('권장이 액션(>75%)이면 내 답은 폴드', () => { expect(wrongPickOf(q(1))).toBe('폴드'); expect(wrongPickOf(q(0.8))).toBe('폴드'); });
  it('권장이 폴드(<25%)면 내 답은 그 액션 라벨', () => { expect(wrongPickOf(q(0, '올인'))).toBe('올인'); expect(wrongPickOf(q(0.2))).toBe('오픈'); });
  it('혼합 구간은 오답이 날 수 없으므로 null — 경계 25%·75% 는 채점(빈도 ≥0.25 정답)과 같은 쪽', () => {
    expect(wrongPickOf(q(0.5))).toBeNull(); expect(wrongPickOf(q(0.25))).toBeNull(); expect(wrongPickOf(q(0.75))).toBeNull();
  });
  it('3택 — 틀릴 수 있는 선택지가 하나(폴드)면 그것, 둘(3벳·폴드)이면 특정 불가 null', () => {
    expect(wrongPickOf(q([{ label: '3벳', freq: 0.5 }, { label: '콜', freq: 0.5 }]))).toBe('폴드');
    expect(wrongPickOf(q([{ label: '3벳', freq: 0 }, { label: '콜', freq: 1 }]))).toBeNull();
  });
});

describe('gradePreflop · 빈도 25% 경계', () => {
  it('액션 빈도 ≥0.25 면 액션 정답, 폴드 빈도(1−Σ) ≥0.25 면 폴드 정답', () => {
    expect(gradePreflop(q(0.25), '오픈')).toBe(true);
    expect(gradePreflop(q(0.24), '오픈')).toBe(false);
    expect(gradePreflop(q(0.75), FOLD)).toBe(true);
    expect(gradePreflop(q(0.76), FOLD)).toBe(false);
  });
  it('3택 — 3벳 0.5 · 콜 0.5 면 폴드만 오답, 없는 라벨은 오답', () => {
    const m = q([{ label: '3벳', freq: 0.5 }, { label: '콜', freq: 0.5 }]);
    expect(gradePreflop(m, '3벳')).toBe(true);
    expect(gradePreflop(m, '콜')).toBe(true);
    expect(gradePreflop(m, FOLD)).toBe(false);
    expect(gradePreflop(m, '4벳')).toBe(false);
    expect(verdictOf(m)).toBe('혼합 (3벳 50% · 콜 50%)');
    expect(verdictOf(q(0.25, '콜'))).toBe('혼합 (콜 25%)');
    expect(verdictOf(q(0.2, '콜'))).toBe(FOLD);
    expect(verdictOf(q(0.75))).toBe('오픈');
  });
});

describe('makeQuiz(mode) · 6모드 문제 생성', () => {
  it.each(MODES.map((m) => m.id))('%s — 키 접두가 모드로 되돌아오고 액션·핸드가 채워진다', (mode) => {
    const fresh = makeQuiz(mode);
    expect(fresh.mode).toBe(mode);
    expect(modeOfKey(fresh.key)).toBe(mode);
    expect(fresh.hand).toMatch(/^[2-9TJQKA]{2}[so]?$/);
    expect(fresh.acts.length).toBe(mode === 'defend' || mode === 'vs3bet' ? 2 : 1);
    for (const a of fresh.acts) { expect(a.freq).toBeGreaterThanOrEqual(0); expect(a.freq).toBeLessThanOrEqual(1); }
    expect(fresh.acts.reduce((s, a) => s + a.freq, 0)).toBeLessThanOrEqual(1.0001);
  });
  it('수비·3벳·vs 3벳·올인 콜은 상대가 있고(AI 해설이 첫 진입으로 오해하지 않게), 오픈·푸시폴드는 없다', () => {
    for (const m of ['defend', 'threebet', 'vs3bet', 'call'] as const) expect(makeQuiz(m).vs).toBeDefined();
    for (const m of ['rfi', 'push'] as const) expect(makeQuiz(m).vs).toBeUndefined();
  });
});

describe('makeQuiz(mode, key) · 오답 키 복원', () => {
  it.each(MODES.map((m) => m.id))('%s 키는 같은 키·핸드·상황·빈도로 복원된다', (mode) => {
    const strip = ({ cards, ...rest }: Quiz) => ({ ...rest, ranks: cards.map((c) => c.rank) }); // 수트만 무작위 — 랭크·나머지는 전부 같아야 한다
    const fresh = makeQuiz(mode);
    expect(strip(makeQuiz(mode, fresh.key))).toEqual(strip(fresh));
  });
  it('push 키도 포지션·스택·핸드가 그대로 돌아온다', () => {
    const back = makeQuiz('push', 'push|2-10|A5s');
    expect(back).toMatchObject({ mode: 'push', key: 'push|2-10|A5s', posLabel: 'BTN', situ: '10bb · 첫 진입', hand: 'A5s', stackBb: 10, acts: [{ label: '올인', freq: expect.any(Number) }] });
  });
  it('올인 콜 키 — SB 콜은 셔버가 SB(k=1)면 데이터가 없어 복원 대신 새 문제', () => {
    expect(makeQuiz('call', 'call|sb-2-10|A5s')).toMatchObject({ key: 'call|sb-2-10|A5s', posLabel: 'SB', situ: '10bb · BTN 올인', vs: { label: 'BTN', bb: 10 } });
    expect(makeQuiz('call', 'call|sb-1-10|A5s').key).not.toBe('call|sb-1-10|A5s');
  });
  it('사라진 스팟 키·다른 모드 접두는 조용히 새 문제를 뽑는다(키가 달라진다)', () => {
    expect(makeQuiz('rfi', 'rfi|no_such_spot|AKs').key).not.toBe('rfi|no_such_spot|AKs');
    expect(makeQuiz('defend', 'def|rfi_co|AKs').key).not.toBe('def|rfi_co|AKs'); // rfi 스팟을 def 접두로 — 그룹이 달라 복원 거부
    expect(modeOfKey('xyz|a|b')).toBeNull();
  });
});
