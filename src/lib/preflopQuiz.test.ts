// preflopQuiz — 오답 노트가 기대는 두 계약: ① 키로 문제가 그대로 복원된다 ② 저장돼 있지 않은 '내 답'은 권장의 반대로 파생된다.
// 모드 확장(2026-09-03): 6모드 문제 생성 · 채점 경계(0.25) · 키 왕복.
import { describe, it, expect } from 'vitest';
import { FOLD, MODES, gradePreflop, gradeDetail, makeQuiz, modeOfKey, verdictOf, wrongPickOf, type Quiz, type QuizAct } from './preflopQuiz';
import { RANGE_SCENARIOS } from './ranges.data';

// ── 콜 문제는 **격리**를 본다 (2026-09-19 재산출: 빅앤티 k≥2 는 2~10bb 전부 격리, 12bb+ 만 게시) ──
// 저장된 오답 키로 복원할 때 격리된 표의 문제가 되살아나면 "콜 0% = 폴드가 정답" 이라는 거짓 채점이 된다.
describe('call 모드 — 격리된 빅앤티 k≥2 표는 문제로 내지 않는다', () => {
  it('BTN(k=2) 올인에 BB 콜 · 7bb 키는 복원되지 않고 새 문제로 대체된다', () => {
    const key = 'call|bb-2-7|AA';
    expect(makeQuiz('call', key).key).not.toBe(key);
  });
  it('SB(k=1) 올인에 BB 콜 · 7bb 는 살아 있는 표라 그대로 복원된다(양성 대조)', () => {
    const key = 'call|bb-1-7|AA';
    expect(makeQuiz('call', key).key).toBe(key);
  });
  it('같은 자리(k=2)라도 12bb 는 게시 구간이라 복원된다(경계 대조: 10bb 는 막히고 12bb 는 열린다)', () => {
    expect(makeQuiz('call', 'call|sb-2-10|AA').key, '10bb k≥2 가 복원됐다 — 격리 하한이 밀렸다').not.toBe('call|sb-2-10|AA');
    expect(makeQuiz('call', 'call|sb-2-12|AA').key, '12bb k≥2 가 막혔다 — 격리 상한이 밀렸다').toBe('call|sb-2-12|AA');
  });
  it('새로 뽑는 콜 문제 100건 중 격리된 (k≥2 · 2~10bb) 조합이 없다', () => {
    for (let i = 0; i < 100; i += 1) {
      const k = makeQuiz('call').key;                       // call|<seat>-<k>-<stack>|<hand>
      const [, situ] = k.split('|');
      const [, kk, stack] = situ.split('-');
      if (Number(kk) >= 2) expect(Number(stack), k).toBeGreaterThanOrEqual(12);
    }
  });
});

const q = (acts: QuizAct[] | number, actionLabel = '오픈'): Quiz => ({
  mode: 'rfi', key: 'rfi|x|AKs', posLabel: 'CO', situ: '', hand: 'AKs', cards: [] as unknown as Quiz['cards'], stackBb: 100,
  acts: typeof acts === 'number' ? [{ label: actionLabel, freq: acts }] : acts,
});

// ⚠ 2026-09-12 계약 변경: 채점이 '혼합에 들어 있으면 정답' 으로 바뀌면서
//   '틀릴 수 있는 선택지' 의 정의도 **빈도 25% 미만 → 빈도 0** 으로 함께 옮겼다.
//   둘이 어긋나면 **정답으로 센 선택이 오답노트에 '내 답' 으로 찍힌다.**
//   아래 기대값 중 일부(0.8 · 0.2 같은 합성 빈도)는 그래서 바뀌었다 —
//   실제 차트 빈도는 1 · 0.75 · 0.5 · 0.25 뿐이라 **화면 동작은 달라지지 않는다.**
describe('wrongPickOf · 파생 내 답', () => {
  it('권장이 액션 100% 면 폴드 빈도가 0 이라 내 답은 폴드', () => {
    expect(wrongPickOf(q(1))).toBe('폴드');
  });
  it('액션 빈도가 0 이면 그 액션이 내 답', () => {
    expect(wrongPickOf(q(0, '올인'))).toBe('올인');
  });
  it('🔴 양쪽 다 혼합에 들어 있으면 오답이 날 수 없다 — null', () => {
    // 오픈 20% / 폴드 80% — 예전엔 오픈이 '25% 미만' 이라 내 답으로 찍혔다.
    // 이제 20% 는 정답이므로 틀릴 수 있는 선택지가 없다.
    expect(wrongPickOf(q(0.2))).toBeNull();
    expect(wrongPickOf(q(0.8))).toBeNull();
  });
  it('혼합 구간은 오답이 날 수 없으므로 null — 25%·75% 경계도 같다', () => {
    expect(wrongPickOf(q(0.5))).toBeNull(); expect(wrongPickOf(q(0.25))).toBeNull(); expect(wrongPickOf(q(0.75))).toBeNull();
  });
  it('3택 — 틀릴 수 있는 선택지가 하나(폴드)면 그것, 둘이면 특정 불가 null', () => {
    // 3벳 50 · 콜 50 → 폴드 0 하나만 오답 후보
    expect(wrongPickOf(q([{ label: '3벳', freq: 0.5 }, { label: '콜', freq: 0.5 }]))).toBe('폴드');
    // 3벳 0 · 콜 100 → 3벳과 폴드(0) 둘 다 오답 후보라 특정 불가
    expect(wrongPickOf(q([{ label: '3벳', freq: 0 }, { label: '콜', freq: 1 }]))).toBeNull();
  });
});

describe('gradePreflop · 혼합에 들어 있으면 오답이 아니다', () => {
  it('주된 선택(≥25%)은 정답이다 — 액션도 폴드도', () => {
    expect(gradePreflop(q(0.25), '오픈')).toBe(true);
    expect(gradePreflop(q(0.75), FOLD)).toBe(true);
  });

  // §3.4: "12.5% 혼합 액션은 빈도가 낮다는 이유만으로 오답이 아니다."
  // 예전 규칙(`freq >= 0.25`)은 12.5% 로 섞는 **올바른 선택**을 오답으로 셌다.
  // 그러면 트레이너가 혼합 전략을 잘못 가르치고 오답노트에도 엉뚱한 항목이 쌓인다.
  it('🔴 12.5% 로 섞는 액션은 오답이 아니다 — 드물 뿐 틀린 게 아니다', () => {
    expect(gradePreflop(q(0.125), '오픈'), '혼합에 든 선택을 오답으로 셌다').toBe(true);
    expect(gradeDetail(q(0.125), '오픈')).toBe('mix');
  });

  it('🔴 빈도 0 만 오답이다', () => {
    expect(gradePreflop(q(0), '오픈')).toBe(false);
    expect(gradeDetail(q(0), '오픈')).toBe('wrong');
  });

  it('등급은 셋으로 갈린다 — 주된 선택 / 드문 혼합 / 오답', () => {
    expect(gradeDetail(q(0.5), '오픈')).toBe('best');
    expect(gradeDetail(q(0.2), '오픈')).toBe('mix');
    expect(gradeDetail(q(1), FOLD)).toBe('wrong');   // 액션이 100% 면 폴드 빈도 0
  });

  it('3택 — 3벳 0.5 · 콜 0.5 면 폴드만 오답, 없는 라벨은 오답', () => {
    const m = q([{ label: '3벳', freq: 0.5 }, { label: '콜', freq: 0.5 }]);
    expect(gradePreflop(m, '3벳')).toBe(true);
    expect(gradePreflop(m, '콜')).toBe(true);
    expect(gradePreflop(m, FOLD)).toBe(false);       // 1 − 1.0 = 0
    expect(gradePreflop(m, '4벳')).toBe(false);      // 없는 라벨 = 빈도 0
    expect(verdictOf(m)).toBe('혼합 (3벳 50% · 콜 50%)');
    expect(verdictOf(q(0.25, '콜'))).toBe('혼합 (콜 25%)');
    expect(verdictOf(q(0.2, '콜'))).toBe(FOLD);
    expect(verdictOf(q(0.75))).toBe('오픈');
  });

  it('현재 차트 데이터(1 · 0.75 · 0.5 · 0.25)에서는 동작이 달라지지 않는다', () => {
    // 이 규칙 변경은 **앞으로 솔버 데이터가 들어올 때**를 위한 것이다.
    // 지금 쓰는 빈도에는 0 초과 0.25 미만이 없으므로 기존 판정과 같아야 한다.
    for (const f of [1, 0.75, 0.5, 0.25]) {
      expect(gradePreflop(q(f), '오픈')).toBe(f >= 0.25);
      expect(gradePreflop(q(f), FOLD)).toBe(1 - f >= 0.25);
    }
  });
});

describe('wrongPickOf · 채점과 같은 기준을 쓴다', () => {
  it('🔴 정답으로 센 혼합 선택이 오답노트의 "내 답" 으로 찍히지 않는다', () => {
    // 오픈 12.5% / 폴드 87.5% — 오픈은 `mix`(정답)이므로 '내 답' 후보가 아니다.
    expect(wrongPickOf(q(0.125))).toBeNull();
  });

  it('빈도 0 인 선택지가 하나뿐이면 그것이 내 답이다', () => {
    // 3벳 0 · 콜 60 → 폴드 40% 는 혼합이라 정답, 남은 오답 후보는 3벳 하나뿐.
    expect(wrongPickOf(q([{ label: '3벳', freq: 0 }, { label: '콜', freq: 0.6 }]))).toBe('3벳');
  });
});

describe('makeQuiz(mode) · 6모드 문제 생성', () => {
  it.each(MODES.map((m) => m.id))('%s — 키 접두가 모드로 되돌아오고 액션·핸드가 채워진다', (mode) => {
    const fresh = makeQuiz(mode);
    expect(fresh.mode).toBe(mode);
    expect(modeOfKey(fresh.key)).toBe(mode);
    expect(fresh.hand).toMatch(/^[2-9TJQKA]{2}[so]?$/);
    // 차트 모드는 뽑힌 스팟의 actions 수와 같다(수비는 SB vs 얼리 스팟만 3벳 단독) · Nash 모드는 1
    expect(fresh.acts.length).toBe(RANGE_SCENARIOS.find((s) => s.id === fresh.key.split('|')[1])?.actions.length ?? 1);
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
    const back = makeQuiz('push', 'push|2-12|A5s');
    expect(back).toMatchObject({ mode: 'push', key: 'push|2-12|A5s', posLabel: 'BTN', situ: '12bb · 첫 진입 · 빅 앤티', hand: 'A5s', stackBb: 12, acts: [{ label: '올인', freq: expect.any(Number) }] });
  });
  it('올인 콜 키 — SB 콜은 셔버가 SB(k=1)면 데이터가 없어 복원 대신 새 문제', () => {
    expect(makeQuiz('call', 'call|sb-2-12|A5s')).toMatchObject({ key: 'call|sb-2-12|A5s', posLabel: 'SB', situ: '12bb · BTN 올인 · 빅 앤티', vs: { label: 'BTN', bb: 12 } });
    expect(makeQuiz('call', 'call|sb-1-12|A5s').key).not.toBe('call|sb-1-12|A5s');
  });
  it('사라진 스팟 키·다른 모드 접두는 조용히 새 문제를 뽑는다(키가 달라진다)', () => {
    expect(makeQuiz('rfi', 'rfi|no_such_spot|AKs').key).not.toBe('rfi|no_such_spot|AKs');
    expect(makeQuiz('defend', 'def|rfi_co|AKs').key).not.toBe('def|rfi_co|AKs'); // rfi 스팟을 def 접두로 — 그룹이 달라 복원 거부
    expect(modeOfKey('xyz|a|b')).toBeNull();
  });
});
