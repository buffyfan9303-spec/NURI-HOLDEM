// NURI SPOT 구조화 데이터 계약 — 검증 · canonical key · 직렬화 · 레거시 호환
//
// 잠그는 것
//  ① 중복 카드·보드 장수·음수/NaN·스택 초과 같은 **분석 불가 입력**을 blocker 로 잡는다
//  ② 팟 불일치는 blocker 가 아니라 warn 이다 — 사용자 입력을 조용히 덮어쓰지 않는다
//  ③ canonical key: 같은 스팟이면 같고, 의미가 다르면 다르다
//  ④ 직렬화 round trip 이 값을 잃지 않는다
//  ⑤ 레거시 [[REPLAY:]] · #gto= 가 계속 열린다 — 자유문자 액션을 구조로 **지어내지 않는다**
import { describe, it, expect } from 'vitest';
import {
  emptySpot, validateSpot, hasBlocker, canonicalSpotKey, heroComboId,
  toJSON, fromJSON, encodeSpotCode, decodeSpotCode, readSpotHash,
  spotFromReplay, spotFromCards, potBb, positionsFor, isCardCode,
  type SpotReview,
} from './spot';
import { parseAttachments, encodeReplay, type ReplayData } from './hand';

/** 6맥스 100bb BTN vs BB, 프리플랍 첫 진입 — 가장 흔한 학습 스팟 */
function base(over: Partial<SpotReview> = {}): SpotReview {
  return { ...emptySpot(), hero: ['As', 'Kh'], ...over };
}

describe('카드 표기', () => {
  it('52장만 카드로 인정한다', () => {
    expect(isCardCode('As')).toBe(true);
    expect(isCardCode('Th')).toBe(true);
    expect(isCardCode('2c')).toBe(true);
    for (const bad of ['as', 'AS', 'A', 'Axs', '1s', 'Ax', '', null, 10]) {
      expect(isCardCode(bad), `${String(bad)} 를 카드로 받았다`).toBe(false);
    }
  });

  it('히어로 2장 → 표준 콤보 id', () => {
    expect(heroComboId(['As', 'Ks'])).toBe('AKs');
    expect(heroComboId(['As', 'Kh'])).toBe('AKo');
    expect(heroComboId(['Ts', 'Th'])).toBe('TT');
    expect(heroComboId(['Ks', 'As'])).toBe('AKs');   // 순서가 달라도 같다
    expect(heroComboId(['As'])).toBeNull();
  });
});

describe('테이블 인원 → 포지션', () => {
  it('인원이 줄면 앞자리부터 빠지고 BTN·블라인드는 남는다', () => {
    expect(positionsFor(9)).toEqual(['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(positionsFor(6)).toEqual(['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(positionsFor(2)).toEqual(['SB', 'BB']);
  });
});

describe('검증 — 분석 불가 입력', () => {
  it('정상 입력에는 blocker 가 없다', () => {
    expect(hasBlocker(validateSpot(base()))).toBe(false);
  });

  it('같은 카드가 두 번 들어가면 막는다', () => {
    const issues = validateSpot(base({ hero: ['As', 'Kh'], board: ['As', '7d', '2c'], street: 'flop' }));
    expect(hasBlocker(issues)).toBe(true);
    expect(issues.some((i) => /같은 카드/.test(i.message))).toBe(true);
  });

  it('빌런 카드와 겹쳐도 막는다', () => {
    const issues = validateSpot(base({ villain: ['As', '2c'] }));
    expect(issues.some((i) => /같은 카드/.test(i.message))).toBe(true);
  });

  it('스트리트별 보드 장수가 맞아야 한다', () => {
    expect(hasBlocker(validateSpot(base({ street: 'flop', board: ['7d', '2c'] })))).toBe(true);
    expect(hasBlocker(validateSpot(base({ street: 'flop', board: ['7d', '2c', '9h'] })))).toBe(false);
    expect(hasBlocker(validateSpot(base({ street: 'turn', board: ['7d', '2c', '9h'] })))).toBe(true);
    expect(hasBlocker(validateSpot(base({ street: 'turn', board: ['7d', '2c', '9h', 'Jd'] })))).toBe(false);
    expect(hasBlocker(validateSpot(base({ street: 'preflop', board: ['7d', '2c', '9h'] })))).toBe(true);
  });

  it('음수·NaN·무한대 스택을 막는다', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(hasBlocker(validateSpot(base({ effectiveBb: bad }))), `${bad} 가 통과했다`).toBe(true);
    }
  });

  it('액션 금액이 유효 스택을 넘으면 막는다', () => {
    const s = base({ effectiveBb: 20, actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 25 }] });
    expect(hasBlocker(validateSpot(s))).toBe(true);
  });

  it('check·fold 에 금액이 붙으면 막는다', () => {
    const s = base({ actions: [{ street: 'preflop', actor: 'villain', type: 'fold', sizeBb: 2 }] });
    expect(hasBlocker(validateSpot(s))).toBe(true);
  });

  it('액션이 결정 지점보다 뒤 스트리트면 막는다', () => {
    const s = base({ street: 'preflop', actions: [{ street: 'flop', actor: 'hero', type: 'check' }] });
    expect(hasBlocker(validateSpot(s))).toBe(true);
  });

  it('같은 자리에 둘이 앉을 수 없다', () => {
    expect(hasBlocker(validateSpot(base({ heroPos: 'BTN', villainPos: 'BTN' })))).toBe(true);
  });

  it('테이블에 없는 자리를 막는다 — 6인에 UTG 는 없다', () => {
    expect(hasBlocker(validateSpot(base({ tableSize: 6, heroPos: 'UTG' })))).toBe(true);
    expect(hasBlocker(validateSpot(base({ tableSize: 9, heroPos: 'UTG' })))).toBe(false);
  });
});

describe('팟 — 사용자 입력을 덮어쓰지 않는다', () => {
  it('블라인드 + 앤티 + 액션을 더한다', () => {
    const s = base({ sbBb: 0.5, anteBb: 0, tableSize: 6, actions: [
      { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 },
    ] });
    expect(potBb(s)).toBe(4);            // 0.5 + 1 + 2.5
  });

  it('앤티는 인원수만큼 더한다', () => {
    expect(potBb(base({ anteBb: 0.125, tableSize: 8 }))).toBe(2.5);   // 0.5 + 1 + 1
  });

  it('입력 팟이 계산과 다르면 blocker 가 아니라 warn 이다', () => {
    const s = base({ potBbInput: 99 });
    const issues = validateSpot(s);
    expect(hasBlocker(issues)).toBe(false);
    const w = issues.find((i) => i.field === 'pot');
    expect(w?.level).toBe('warn');
    expect(w?.message).toMatch(/다릅니다/);
  });

  it('입력 팟이 계산과 같으면 아무 말도 하지 않는다', () => {
    expect(validateSpot(base({ potBbInput: 1.5 })).some((i) => i.field === 'pot')).toBe(false);
  });
});

describe('canonical key', () => {
  it('같은 스팟은 같은 key', () => {
    expect(canonicalSpotKey(base())).toBe(canonicalSpotKey(base()));
  });

  it('프리플랍은 무늬가 바뀌어도 같은 스팟이다 — AsKh 와 AdKc 는 둘 다 AKo', () => {
    expect(canonicalSpotKey(base({ hero: ['As', 'Kh'] })))
      .toBe(canonicalSpotKey(base({ hero: ['Ad', 'Kc'] })));
  });

  it('프리플랍에서 수딧과 오프수트는 다른 스팟이다', () => {
    expect(canonicalSpotKey(base({ hero: ['As', 'Ks'] })))
      .not.toBe(canonicalSpotKey(base({ hero: ['As', 'Kh'] })));
  });

  it('카드 입력 순서는 key 를 바꾸지 않는다', () => {
    const f = { street: 'flop' as const, board: ['7d', '2c', '9h'] };
    expect(canonicalSpotKey(base({ ...f, hero: ['As', 'Kh'] })))
      .toBe(canonicalSpotKey(base({ ...f, hero: ['Kh', 'As'] })));
  });

  it('플랍 3장은 순서가 없지만 턴·리버는 자리가 있다', () => {
    const a = base({ street: 'turn', board: ['7d', '2c', '9h', 'Jd'] });
    const b = base({ street: 'turn', board: ['9h', '7d', '2c', 'Jd'] });   // 플랍만 섞음
    expect(canonicalSpotKey(a)).toBe(canonicalSpotKey(b));
    const c = base({ street: 'turn', board: ['7d', '2c', 'Jd', '9h'] });   // 턴 카드가 다름
    expect(canonicalSpotKey(a)).not.toBe(canonicalSpotKey(c));
  });

  it('의미가 다르면 다른 key — 스택·포지션·스트리트·액션·내 선택', () => {
    const k = canonicalSpotKey(base());
    expect(canonicalSpotKey(base({ effectiveBb: 40 }))).not.toBe(k);
    expect(canonicalSpotKey(base({ heroPos: 'CO' }))).not.toBe(k);
    expect(canonicalSpotKey(base({ villainPos: 'SB' }))).not.toBe(k);
    expect(canonicalSpotKey(base({ tableSize: 9 }))).not.toBe(k);
    expect(canonicalSpotKey(base({ anteBb: 0.125 }))).not.toBe(k);
    expect(canonicalSpotKey(base({ heroAction: 'raise', heroActionSizeBb: 2.5 }))).not.toBe(k);
    expect(canonicalSpotKey(base({ actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }] }))).not.toBe(k);
  });

  it('메모·결과·팟 입력은 전략과 무관하므로 key 를 바꾸지 않는다', () => {
    const k = canonicalSpotKey(base());
    expect(canonicalSpotKey(base({ note: '아무 말' }))).toBe(k);
    expect(canonicalSpotKey(base({ result: { won: true, deltaBb: 30 } }))).toBe(k);
    expect(canonicalSpotKey(base({ potBbInput: 42 }))).toBe(k);
  });

  it('빌런 카드는 key 를 바꾸지 않는다 — 전략은 상대 패를 모르고 정한다', () => {
    expect(canonicalSpotKey(base({ villain: ['Qs', 'Qd'] }))).toBe(canonicalSpotKey(base()));
  });
});

describe('직렬화 round trip', () => {
  const full: SpotReview = base({
    format: 'cash', tableSize: 9, sbBb: 0.5, anteBb: 0.125, effectiveBb: 62.5,
    heroPos: 'CO', villainPos: 'BB',
    hero: ['As', 'Kh'], villain: ['Qs', 'Qd'], board: ['7d', '2c', '9h', 'Jd'],
    street: 'turn',
    actions: [
      { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
      { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1.5 },
      { street: 'flop', actor: 'villain', type: 'check' },
      { street: 'flop', actor: 'hero', type: 'bet', sizeBb: 3 },
      { street: 'flop', actor: 'villain', type: 'call', sizeBb: 3 },
      { street: 'turn', actor: 'villain', type: 'bet', sizeBb: 7 },
    ],
    heroAction: 'call', heroActionSizeBb: 7,
    potBbInput: 20, note: '턴에서 고민', result: { won: false, deltaBb: -18 },
  });

  it('toJSON → fromJSON 이 값을 잃지 않는다', () => {
    const back = fromJSON(toJSON(full));
    expect(back).toEqual(full);
  });

  it('URL 코드 round trip', () => {
    const back = decodeSpotCode(encodeSpotCode(full));
    expect(back).toEqual(full);
  });

  it('한글 메모도 URL 코드를 통과한다', () => {
    const s = base({ note: '턴에서 레이즈 맞고 고민했음 · 100만원' });
    expect(decodeSpotCode(encodeSpotCode(s))?.note).toBe(s.note);
  });

  it('#spot= 해시를 읽는다', () => {
    const code = encodeSpotCode(base());
    expect(readSpotHash(`#spot=${code}`)).toBe(code);
    expect(readSpotHash('#tool=gto')).toBeNull();
  });

  it('망가진 코드는 조용히 null — 화면을 깨뜨리지 않는다', () => {
    expect(decodeSpotCode('!!!not-base64!!!')).toBeNull();
    expect(decodeSpotCode('')).toBeNull();
  });

  it('모르는 필드는 버리고 빠진 필드는 기본값으로 채운다(구버전 내성)', () => {
    const s = fromJSON({ v: 1, hero: ['As', 'Kh'], unknownField: 1, actions: [{ bogus: true }] });
    expect(s).not.toBeNull();
    expect(s!.hero).toEqual(['As', 'Kh']);
    expect(s!.actions).toEqual([]);
    expect(s!.effectiveBb).toBe(100);
    expect(hasBlocker(validateSpot(s!))).toBe(false);
  });

  it('잘못된 카드는 저장값에서 걸러진다', () => {
    const s = fromJSON({ hero: ['As', 'zz', 'Kh'], board: ['9x'] });
    expect(s!.hero).toEqual(['As', 'Kh']);
    expect(s!.board).toEqual([]);
  });
});

describe('레거시 호환', () => {
  it('[[REPLAY:]] 마커는 그대로 읽힌다 (기존 게시물 보존)', () => {
    const r: ReplayData = {
      hero: ['As', 'Kh'], villain: [], board: ['7d', '2c', '9h'],
      pot: '12.5bb', actions: { pre: 'BTN 2.5bb 오픈, BB 콜', flop: 'BB 체크' },
    };
    const body = encodeReplay('본문입니다', r);
    const parsed = parseAttachments(body);
    expect(parsed.text).toBe('본문입니다');
    expect(parsed.replay?.hero).toEqual(['As', 'Kh']);
    expect(parsed.replay?.actions.pre).toBe('BTN 2.5bb 오픈, BB 콜');
  });

  it('레거시 리플레이 → 스팟: 카드·보드·스트리트는 살리고 **자유문자 액션은 구조로 지어내지 않는다**', () => {
    const r: ReplayData = {
      hero: ['As', 'Kh'], villain: ['Qs', 'Qd'], board: ['7d', '2c', '9h', 'Jd'],
      pot: '12.5bb', actions: { pre: 'BTN 2.5bb 오픈, BB 콜' },
    };
    const s = spotFromReplay(r);
    expect(s.hero).toEqual(['As', 'Kh']);
    expect(s.villain).toEqual(['Qs', 'Qd']);
    expect(s.board).toEqual(['7d', '2c', '9h', 'Jd']);
    expect(s.street).toBe('turn');
    // 핵심: 액션 배열은 비어 있어야 한다. 문자열을 파싱해 액션을 만들면 없는 근거를 만드는 것이다.
    expect(s.actions).toEqual([]);
    // 대신 원문은 사람이 읽도록 메모에 남는다
    expect(s.note).toContain('BTN 2.5bb 오픈, BB 콜');
    expect(s.note).toContain('12.5bb');
    expect(hasBlocker(validateSpot(s))).toBe(false);
  });

  it('레거시 #gto= 카드만 → 스팟: 보드 장수로 스트리트를 정한다', () => {
    expect(spotFromCards(['As', 'Kh'], [], []).street).toBe('preflop');
    expect(spotFromCards(['As', 'Kh'], [], ['7d', '2c', '9h']).street).toBe('flop');
    expect(spotFromCards(['As', 'Kh'], [], ['7d', '2c', '9h', 'Jd', '4s']).street).toBe('river');
  });

  it('레거시에서 온 스팟도 검증을 통과한다 — 열자마자 오류로 막히지 않는다', () => {
    const s = spotFromCards(['As', 'Kh'], ['Qs', 'Qd'], ['7d', '2c', '9h']);
    expect(hasBlocker(validateSpot(s))).toBe(false);
  });
});
