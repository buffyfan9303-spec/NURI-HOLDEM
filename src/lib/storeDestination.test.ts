// 목적지 매핑 게이트 — "화면은 바뀌는데 대상이 사라지는" 회귀를 막는다.
//
// 이 테스트가 지키는 실제 증상(2026-09-07 추적):
//   · '지난 장부 N건 미마감' → 지난 날짜가 아니라 오늘 장부가 열림
//   · '순위 미입력 대회 N개' → 사이드 게임인데 메인 칩에 착지
// 둘 다 문맥이 대시보드에 **있는데** 전달 통로가 없어서 났다. 통로가 다시 막히면 여기서 깨진다.
import { describe, it, expect } from 'vitest';
import { resolveDest, toDest } from './storeDestination';
import { MAIN_GAME_SEQ } from '../api/ledger';

describe('storeDestination — 문맥을 잃지 않는 이동', () => {
  it('문자열 이동은 시드를 만들지 않는다 — 기존 "오늘 + 현재 게임" 동작 보존', () => {
    for (const s of ['ledger', 'clock', 'ranking', 'stats', 'staff', 'posters']) {
      const { section, seeds } = resolveDest(s);
      expect(section).toBe(s);
      expect(seeds).toEqual({});
    }
  });

  it('🔴 지난 미마감 장부는 그 날짜·그 게임으로 연다', () => {
    const { section, seeds } = resolveDest({ section: 'ledger', date: '2026-09-01', gameSeq: 2 });
    expect(section).toBe('ledger');
    expect(seeds.ledgerSeed).toEqual({ date: '2026-09-01', gameSeq: 2, scheduleId: '', isNew: false });
  });

  it('장부 이동에 게임이 없으면 메인', () => {
    expect(resolveDest({ section: 'ledger', date: '2026-09-01' }).seeds.ledgerSeed?.gameSeq).toBe(MAIN_GAME_SEQ);
  });

  it('🔴 사이드 게임의 순위는 사이드 event 로 착지한다 — 메인 칩으로 뭉치면 안 된다', () => {
    const { seeds } = resolveDest({ section: 'ranking', date: '2026-09-01', gameSeq: 3, title: '  나이트 사이드  ' });
    expect(seeds.rankingDraft).toEqual({ date: '2026-09-01', names: [], event: '나이트 사이드' });
  });

  it('제목 없는 사이드는 사이드N 라벨로 — 빈 문자열이면 메인 칩에 착지한다', () => {
    expect(resolveDest({ section: 'ranking', date: '2026-09-01', gameSeq: 2 }).seeds.rankingDraft?.event).toBe('사이드1');
  });

  it('메인 순위는 제목 그대로(없으면 빈 문자열) — 장부 마감→순위 초안 경로와 같은 값', () => {
    expect(resolveDest({ section: 'ranking', date: '2026-09-01', gameSeq: 1, title: '금요 메인' }).seeds.rankingDraft?.event).toBe('금요 메인');
    expect(resolveDest({ section: 'ranking', date: '2026-09-01', gameSeq: 1 }).seeds.rankingDraft?.event).toBe('');
  });

  it('클락은 날짜와 게임을 함께 — 날짜가 없으면 게임만 바꾼다(칩 픽과 같은 의미)', () => {
    expect(resolveDest({ section: 'clock', date: '2026-09-01', gameSeq: 2 }).seeds)
      .toEqual({ clockSeed: '2026-09-01', clockSeedGame: 2 });
    expect(resolveDest({ section: 'clock', gameSeq: 3 }).seeds).toEqual({ clockSeedGame: 3 });
  });

  it('포스터에서 온 장부 이동은 scheduleId 를 실어 나른다', () => {
    expect(resolveDest({ section: 'ledger', date: '2026-09-01', scheduleId: 'sch-1' }).seeds.ledgerSeed?.scheduleId).toBe('sch-1');
  });

  it('정산 이동은 settle 만 세운다 — 장부 날짜를 임의로 오늘로 덮지 않는다', () => {
    expect(resolveDest({ section: 'ledger', settle: true }).seeds).toEqual({ settle: true });
  });

  it('다른 섹션은 날짜를 줘도 시드를 만들지 않는다 — 시드는 장부·클락·순위 셋의 것이다', () => {
    expect(resolveDest({ section: 'stats', date: '2026-09-01', gameSeq: 2 }).seeds).toEqual({});
  });

  it('toDest — 문자열과 객체를 같은 모양으로 만든다', () => {
    expect(toDest('ledger')).toEqual({ section: 'ledger' });
    expect(toDest({ section: 'ledger', date: '2026-09-01' })).toEqual({ section: 'ledger', date: '2026-09-01' });
  });
});
