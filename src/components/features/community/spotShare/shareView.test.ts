import { describe, it, expect } from 'vitest';
import { fromJSON } from '../../../../lib/spot';
import { handClass, shareView, matchupLine, decisionLine, voteChoices, fitPollOptions } from './shareView';
import { spotFromEmbed } from './embeddedSpot';

const MW_RAW = {
  v: 3, format: 'cash', tableSize: 6, sbBb: 0.5, anteBb: 0, effectiveBb: 80,
  heroPos: 'CO', villainPos: 'BTN', extraPos: ['SB'], hero: ['Ah', 'Jh'],
  villain: [['Ks', 'Kc'], []], board: ['Jc', '8h', '2d'], street: 'flop',
  actions: [
    { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
    { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 2.5 },
    { street: 'flop', actor: 'villain', pos: 'SB', type: 'check' },
  ],
  heroAction: 'bet', heroActionSizeBb: 4, result: { won: false, deltaBb: -24 },
};
const mw = fromJSON(MW_RAW)!;

describe('shareView', () => {
  it('핸드 표기', () => {
    expect(handClass(['As', 'Ks'])).toBe('AKs');
    expect(handClass(['Jd', 'Ah'])).toBe('AJo');
    expect(handClass(['Qh', 'Qd'])).toBe('QQ');
    expect(handClass(['As'])).toBeNull();
  });
  it('가림이면 상대 카드·선택·결과가 없다', () => {
    const v = shareView(mw, false);
    expect(v.villains.every((x) => x.cards.length === 0)).toBe(true);
    expect(v.heroAction).toBeNull();
    expect(v.result).toBeNull();
  });
  it('공개면 Villain A 카드와 결과(이김/짐만 — §28 손익 BB 없음)', () => {
    const v = shareView(mw, true);
    expect(v.villains.map((x) => x.label)).toEqual(['Villain A', 'Villain B']);
    expect(v.villains[0].cards).toEqual(['Ks', 'Kc']);
    expect(v.result).toEqual({ won: false });
    expect(JSON.stringify(v)).not.toContain('-24');
    expect(matchupLine(v)).toBe('CO AJs vs BTN·SB');
    expect(decisionLine(v)).toBe('플랍 · Villain B 체크 뒤');
    expect(v.streets.map((s) => [s.street, s.board.join('')])).toEqual([['preflop', ''], ['flop', 'Jc8h2d']]);
  });
});

describe('투표 보기 — 상황에 맞춘다 (README P9)', () => {
  const at = (over: Partial<typeof MW_RAW>) => fromJSON({ ...MW_RAW, ...over })!;
  it('상대가 체크한 뒤 내 차례면 체크·벳', () => {
    expect(voteChoices(mw)).toEqual(['체크', '벳']);
  });
  it('벳을 마주했으면 폴드·콜·레이즈', () => {
    expect(voteChoices(at({ actions: [...MW_RAW.actions, { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 3 }] }))).toEqual(['폴드', '콜', '레이즈']);
  });
  it('프리플랍 첫 액션은 블라인드를 마주한 것 — 폴드·콜·레이즈, BB 가 림프만 받으면 체크·레이즈', () => {
    expect(voteChoices(at({ street: 'preflop', board: [], actions: [] }))).toEqual(['폴드', '콜', '레이즈']);
    expect(voteChoices(at({ street: 'preflop', board: [], heroPos: 'BB', villainPos: 'BTN', extraPos: [], villain: [[]],
      actions: [{ street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1 }] }))).toEqual(['체크', '레이즈']);
  });
  const legacy = [
    { id: 'f', idx: 0, label: '폴드', votes: 0 },
    { id: 'c', idx: 1, label: '콜', votes: 3 },
    { id: 'r', idx: 2, label: '레이즈', votes: 1 },
  ];
  it('서버 고정 보기(옛 글)는 뜻이 같은 쪽으로 이름만 바꾸고 표·id 는 그대로', () => {
    const out = fitPollOptions(legacy, ['체크', '벳']);
    expect(out.map((o) => [o.id, o.label, o.votes])).toEqual([['c', '체크', 3], ['r', '벳', 1]]);
  });
  it('폴드에 이미 표가 있으면 지우지 않는다', () => {
    const out = fitPollOptions([{ ...legacy[0], votes: 2 }, legacy[1], legacy[2]], ['체크', '벳']);
    expect(out.map((o) => o.label)).toEqual(['폴드', '체크', '벳']);
  });
  it('보기가 이미 상황에 맞거나(서버 적용 뒤) 고정값이 아니면 손대지 않는다', () => {
    expect(fitPollOptions(legacy, ['폴드', '콜', '레이즈'])).toBe(legacy);
    const fresh = [{ id: 'k', idx: 0, label: '체크', votes: 0 }, { id: 'b', idx: 1, label: '벳', votes: 0 }];
    expect(fitPollOptions(fresh, ['체크', '벳'])).toBe(fresh);
  });
});

describe('목록에 끼워 받은 스팟 — 이중 방어', () => {
  it('가림 글에 서버가 실수로 답을 실어 보내도 화면 값에서는 지운다', () => {
    const e = spotFromEmbed({ spot: MW_RAW, reveal_villain: false, reveal_result: false })!;
    expect(e.spot.villain).toEqual([]);
    expect(e.spot.extra.every((x) => x.cards.length === 0)).toBe(true);
    expect(e.spot.heroAction).toBeNull();
    expect(e.spot.result).toBeUndefined();
    expect(e.spot.heroActionSizeBb).toBeUndefined();
  });
  it('스팟이 없거나 깨졌으면 null', () => {
    expect(spotFromEmbed(null)).toBeNull();
    expect(spotFromEmbed(undefined)).toBeNull();
    expect(spotFromEmbed({ spot: null, reveal_villain: true })).toBeNull();
  });
});
