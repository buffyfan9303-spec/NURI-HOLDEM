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

// ── 클락 END 순위 저장이 쓰는 헬퍼 (2026-09-11 점검) ─────────────────────────────
// 장부 자동완성 이름 '실명(닉네임)' 을 통째로 닉네임 칸에 넣던 것을 여기서 분리한다.
// 순위 화면(VenueManageTab)과 클락(TournamentClock)이 같은 함수를 쓰므로 한 곳만 고쳐지는 일이 다시 없다.
import { splitLedgerName, finishEntriesFromRows, countRankingsForGame, rankingSaveTarget } from './rankingGame';

describe('splitLedgerName — 장부 합성 표기 분리', () => {
  it("'실명(닉네임)' 은 닉네임·실명으로 갈린다", () => {
    expect(splitLedgerName('홍길동(길동)')).toEqual({ nickname: '길동', realName: '홍길동' });
  });
  it('괄호가 없으면 통째로 닉네임이다(비회원 자유 입력)', () => {
    expect(splitLedgerName('홍길동')).toEqual({ nickname: '홍길동', realName: '' });
  });
  it('앞뒤 공백을 걷는다', () => {
    expect(splitLedgerName('  홍길동 ( 길동 ) ')).toEqual({ nickname: '길동', realName: '홍길동' });
  });
  it('빈 문자열은 빈 닉네임이다', () => {
    expect(splitLedgerName('   ')).toEqual({ nickname: '', realName: '' });
  });
  it('중첩 괄호는 첫 여는 괄호에서 가른다 — 순위 화면(addFromLedger)의 기존 규칙과 동일(회귀 0)', () => {
    expect(splitLedgerName('김(철)수(nick)')).toEqual({ nickname: '철)수(nick', realName: '김' });
  });
  it("장부가 닉네임 없는 회원을 적는 '실명()' 은 닉네임을 비우고 실명만 채운다 — 실명을 닉네임 칸에 넣지 않는다", () => {
    expect(splitLedgerName('홍길동()')).toEqual({ nickname: '', realName: '홍길동' });
  });
});

describe('finishEntriesFromRows — 입상 순위 입력칸 → 저장 엔트리', () => {
  it('빈 줄은 버리고 이름은 분리한다', () => {
    expect(finishEntriesFromRows([{ name: '홍길동(길동)' }, { name: '  ' }, { name: '박민수' }]))
      .toEqual([{ nickname: '길동', realName: '홍길동' }, { nickname: '박민수', realName: '' }]);
  });
  it('실명은 절대 닉네임 칸으로 새지 않는다(공개 순위표 마스킹 우회 방지)', () => {
    for (const e of finishEntriesFromRows([{ name: '홍길동(길동)' }, { name: '이영희(영희)' }])) {
      expect(e.nickname).not.toContain('(');
      expect(e.nickname).not.toMatch(/홍길동|이영희/);
    }
  });
});

describe('countRankingsForGame — 교체 경고는 hasRankingForGame 과 같은 판정으로 센다', () => {
  it('메인은 빈 이름과 제목 둘 다 같은 게임으로 센다', () => {
    expect(countRankingsForGame(MAIN, ['', MAIN.title, MAIN.title, '다른 대회'])).toBe(3);
  });
  it('사이드는 제 제목만 센다', () => {
    expect(countRankingsForGame(SIDE, ['', SIDE.title, MAIN.title])).toBe(1);
  });
  it('41자 제목도 서버 정규화(40자)와 같은 기준으로 맞춘다 — 이름 비교를 따로 하면 경고가 죽는다', () => {
    const long = { gameSeq: 1, title: 'x'.repeat(41) };
    expect(countRankingsForGame(long, ['x'.repeat(40)])).toBe(1);
  });
  it('저장된 것이 없으면 0', () => {
    expect(countRankingsForGame(MAIN, [])).toBe(0);
  });
});

describe('finishEntriesFromRows — 닉네임이 빈 엔트리를 조용히 버리지 않는다', () => {
  it("'실명()' 줄은 남겨서 호출부가 등수를 짚어 거절할 수 있게 한다(버리면 뒤 등수가 당겨진다)", () => {
    expect(finishEntriesFromRows([{ name: '홍길동(길동)' }, { name: '이영희()' }, { name: '박민수' }]))
      .toEqual([{ nickname: '길동', realName: '홍길동' }, { nickname: '', realName: '이영희' }, { nickname: '박민수', realName: '' }]);
  });
});

// 서버 save_venue_rankings 는 (날짜, event_name) 한 이름만 지우고 넣는다 — 경고가 센 수와 서버가 지우는 수가 같아야 한다.
describe('rankingSaveTarget — 이미 행이 있는 이름으로 저장해 "교체됩니다" 를 사실로 만든다', () => {
  it('아무 행도 없으면 rankingEventOf 그대로, 교체 0·잔여 0', () => {
    expect(rankingSaveTarget(MAIN, [])).toEqual({ eventName: MAIN.title, replaces: 0, leftover: 0 });
    expect(rankingSaveTarget(SIDE, [])).toEqual({ eventName: SIDE.title, replaces: 0, leftover: 0 });
  });
  it("메인의 기존 행이 기본 칩('')에만 있으면 '' 로 저장해 실제로 교체한다", () => {
    expect(rankingSaveTarget(MAIN, ['', '', '다른 대회'])).toEqual({ eventName: '', replaces: 2, leftover: 0 });
  });
  it('메인의 기존 행이 제목에 있으면 제목으로 저장한다', () => {
    expect(rankingSaveTarget(MAIN, [MAIN.title, MAIN.title])).toEqual({ eventName: MAIN.title, replaces: 2, leftover: 0 });
  });
  it("''·제목 양쪽에 있으면 제목을 우선하고, '' 쪽 잔여를 정직하게 센다", () => {
    expect(rankingSaveTarget(MAIN, ['', MAIN.title, MAIN.title])).toEqual({ eventName: MAIN.title, replaces: 2, leftover: 1 });
  });
  it("사이드는 '' 를 후보로 보지 않는다 — '' 행이 있어도 잔여로 세지 않는다", () => {
    expect(rankingSaveTarget(SIDE, ['', SIDE.title])).toEqual({ eventName: SIDE.title, replaces: 1, leftover: 0 });
  });
  it('41자 제목은 서버 정규화(40자)와 같은 키로 맞춘다', () => {
    const long = { gameSeq: 1, title: 'x'.repeat(41) };
    expect(rankingSaveTarget(long, ['x'.repeat(40)])).toEqual({ eventName: 'x'.repeat(40), replaces: 1, leftover: 0 });
  });
  it('저장 이름은 언제나 hasRankingForGame 이 인정하는 후보 안에 있다', () => {
    for (const saved of [[], [''], [MAIN.title], ['', MAIN.title]]) {
      const { eventName } = rankingSaveTarget(MAIN, saved);
      expect(rankingEventCandidates(MAIN)).toContain(eventName);
    }
  });
});
