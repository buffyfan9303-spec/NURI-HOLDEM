// 순위 완료 판정 = (날짜, 게임) — F02.
//
// 이 판정이 틀리면 두 방향의 사고가 난다:
//  · 거짓 '완료' → '순위 미입력' 버튼이 사라져 그 게임 성적이 영영 입력되지 않는다(랭킹·아카이브 누락).
//  · 거짓 '미입력' → 버튼이 남을 뿐 데이터는 안전하다.
// 그래서 애매하면 '완료'로 찍지 않는다. 아래 경계를 그 원칙대로 못 박는다.
import { describe, it, expect } from 'vitest';
import { hasRankingForGame, rankingEventOf, rankingEventCandidates, normalizeEventName } from './rankingGame';
import { gameKey, ledgerGameLabel } from './ledgerLink';

const MAIN = { gameSeq: 1, title: '수요일 딥스택' };
const SIDE = { gameSeq: 2, title: '나이트 사이드' };

describe('메인 게임 — 저장 경로가 두 갈래라 둘 다 인정한다', () => {
  it("게임 칩바로 저장한 ''", () => {
    expect(hasRankingForGame(MAIN, [''])).toBe(true);
  });
  it('장부 마감 초안으로 저장한 장부 title', () => {
    expect(hasRankingForGame(MAIN, ['수요일 딥스택'])).toBe(true);
  });
  it('같은 날 사이드만 저장돼 있으면 메인은 미입력', () => {
    expect(hasRankingForGame(MAIN, ['나이트 사이드'])).toBe(false);
  });
  it('제목 없는 메인은 빈 event 로만 인정', () => {
    expect(hasRankingForGame({ gameSeq: 1, title: null }, [''])).toBe(true);
    expect(hasRankingForGame({ gameSeq: 1, title: null }, ['아무거나'])).toBe(false);
  });
});

describe('사이드 게임 — 그 장부 title 과 정확히 일치할 때만 완료', () => {
  it('일치하면 완료', () => {
    expect(hasRankingForGame(SIDE, ['수요일 딥스택', '나이트 사이드'])).toBe(true);
  });
  it("메인이 '' 로 저장돼 있어도 사이드는 미입력 — 날짜 Set 이 뭉치던 자리", () => {
    expect(hasRankingForGame(SIDE, [''])).toBe(false);
  });
  it('제목이 다르면 미입력(추정으로 완료 처리하지 않는다)', () => {
    expect(hasRankingForGame(SIDE, ['나이트사이드'])).toBe(false); // 공백 하나 차이
  });
  it("제목 없는 사이드는 칩바·클락이 쓰는 '사이드N' 라벨로 판정", () => {
    expect(hasRankingForGame({ gameSeq: 3, title: '' }, ['사이드2'])).toBe(true);
    expect(hasRankingForGame({ gameSeq: 3, title: '' }, [''])).toBe(false);
  });
});

describe('빈 목록 · 정규화', () => {
  it('그 날 순위가 하나도 없으면 메인도 사이드도 미입력', () => {
    expect(hasRankingForGame(MAIN, [])).toBe(false);
    expect(hasRankingForGame(SIDE, [])).toBe(false);
  });
  it('저장 시점과 같은 규칙(trim → 40자)으로 맞춘다', () => {
    expect(normalizeEventName('  스페셜  ')).toBe('스페셜');
    expect(normalizeEventName(null)).toBe('');
    const long = '가'.repeat(50);
    expect(normalizeEventName(long)).toHaveLength(40);
    // 서버가 40자로 자른 값과 장부 title(50자)이 만나도 같은 게임으로 인정돼야 한다
    expect(hasRankingForGame({ gameSeq: 2, title: long }, ['가'.repeat(40)])).toBe(true);
  });
  it('null event_name 은 빈 문자열(=메인)로 읽는다', () => {
    expect(hasRankingForGame(MAIN, [null, undefined])).toBe(true);
    expect(hasRankingForGame(SIDE, [null])).toBe(false);
  });
});

describe('이동 대상 event — 버튼이 그 게임 입력 화면으로 간다', () => {
  it('메인은 장부 title(없으면 기본 칩)', () => {
    expect(rankingEventOf(MAIN)).toBe('수요일 딥스택');
    expect(rankingEventOf({ gameSeq: 1, title: null })).toBe('');
  });
  it("사이드는 title, 없으면 '사이드N' — '' 로 넘기면 메인 칩에 착지했다", () => {
    expect(rankingEventOf(SIDE)).toBe('나이트 사이드');
    expect(rankingEventOf({ gameSeq: 2, title: '  ' })).toBe('사이드1');
  });
  it('이동 대상은 항상 인정 후보 안에 있다(버튼 → 저장 → 완료가 한 바퀴 돈다)', () => {
    for (const g of [MAIN, SIDE, { gameSeq: 1, title: null }, { gameSeq: 4, title: '' }]) {
      expect(rankingEventCandidates(g)).toContain(rankingEventOf(g));
      expect(hasRankingForGame(g, [rankingEventOf(g)])).toBe(true);
    }
  });
});

describe('(날짜, 게임) 키 조립 — 장부 정본 키와 같은 표기', () => {
  it('같은 날 메인·사이드가 서로 다른 키를 갖는다', () => {
    expect(gameKey('2026-09-05', 1)).toBe('2026-09-05#1');
    expect(gameKey('2026-09-05', 2)).not.toBe(gameKey('2026-09-05', 1));
  });
  it('라벨은 장부·클락과 같은 어휘', () => {
    expect(ledgerGameLabel(1)).toBe('메인');
    expect(ledgerGameLabel(3)).toBe('사이드2');
  });
});
