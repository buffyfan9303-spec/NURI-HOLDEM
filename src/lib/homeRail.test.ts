// 홈 추천 레일 — 순서·근거 한 줄. 실행: npx vitest run src/lib/homeRail.test.ts
import { describe, it, expect } from 'vitest';
import { buildLiveFactMap, rankRail, railFact, railScore, todayLine, type RailContext } from './homeRail';
import type { Schedule } from '../api/schedules';
import type { ClockState } from '../api/clock';

const sch = (id: string, o: Partial<Schedule> = {}): Schedule => ({
  id, title: id, venueId: `v-${id}`, pubName: `펍-${id}`, region: '서울', date: '2026-09-18', startTime: '19:00',
  duration: '', format: 'freezeout' as Schedule['format'], guaranteed: false, buyIn: { amount: 50000 } as Schedule['buyIn'],
  displayOrder: 0, isPremium: false, ownerId: 'o', unreadQnaCount: 0, approved: true, ...o,
});
const clock = (o: Partial<ClockState>): ClockState => ({
  venueId: 'v', gameSeq: 1, sessionDate: '2026-09-18', title: '', config: { levels: [] } as unknown as ClockState['config'],
  currentIndex: 0, running: true, endsAt: null, remainingMs: 0, adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0, ...o,
});
const ctx = (o: Partial<RailContext> = {}): RailContext => ({
  today: '2026-09-17', visitsByVenue: new Map(), reservedIds: new Set(), live: new Map(), isEnded: () => false, ...o,
});

describe('rankRail — 추천 근거 순서', () => {
  const a = sch('a', { startTime: '18:00' }); // 가장 이른 시작
  const b = sch('b', { startTime: '20:00' });
  const c = sch('c', { startTime: '21:00' });
  const d = sch('d', { startTime: '22:00', isPremium: true });

  it('근거가 없으면 종전 규칙(시작 순)이다 — 회귀 없음', () => {
    expect(rankRail([c, b, a], ctx(), 8).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
  it('🔴 내 예약이 시작 순을 이긴다 — 되돌리면 c 가 맨 뒤로 간다', () => {
    expect(rankRail([a, b, c], ctx({ reservedIds: new Set(['c']) }), 8).map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });
  it('가 본 매장 > 지금 뛰는 판 > 시작 순', () => {
    const r = rankRail([a, b, c], ctx({
      visitsByVenue: new Map([['v-c', 3]]), live: new Map([['b', { alive: 5, levelNo: 2 }]]),
    }), 8).map((s) => s.id);
    expect(r).toEqual(['c', 'b', 'a']);
  });
  it('부스트(업주가 산 노출)는 여전히 맨 앞이다', () => {
    expect(rankRail([a, d], ctx({ reservedIds: new Set(['a']) }), 8).map((s) => s.id)).toEqual(['d', 'a']);
    expect(railScore(d, ctx())).toBeGreaterThan(railScore(a, ctx({ reservedIds: new Set(['a']), visitsByVenue: new Map([['v-a', 9]]), live: new Map([['a', { alive: 1, levelNo: 1 }]]) })));
  });
  it('오늘 이전·미승인·끝난 대회는 근거가 있어도 빠진다', () => {
    const past = sch('p', { date: '2026-09-16' });
    const un = sch('u', { approved: false });
    const r = rankRail([past, un, a], ctx({ reservedIds: new Set(['p', 'u']), isEnded: (s) => s.id === 'a' }), 8);
    expect(r).toEqual([]);
  });
  it('같은 포스터 연속 회차는 첫 장만', () => {
    const r = rankRail([sch('x', { posterUrl: 'p' }), sch('y', { posterUrl: 'p', startTime: '23:00' })], ctx(), 8);
    expect(r.map((s) => s.id)).toEqual(['x']);
  });
});

describe('buildLiveFactMap — 클락 → 생존·레벨', () => {
  const s = sch('s', { venueId: 'v', date: '2026-09-18', title: '메인' });
  it('liveStats 가 있으면 alive, 없으면 adjEntries − eliminations(0 하한)', () => {
    const lv = [{ kind: 'level', minutes: 20 }, { kind: 'level', minutes: 20 }, { kind: 'break', minutes: 10 }, { kind: 'level', minutes: 20 }];
    const g = clock({ title: '메인', config: { levels: lv } as unknown as ClockState['config'], currentIndex: 3, running: false, remainingMs: 60_000,
      liveStats: { alive: 12, entries: 40 } as ClockState['liveStats'] });
    expect(buildLiveFactMap([g], [s]).get('s')).toEqual({ alive: 12, levelNo: 3 }); // 브레이크는 번호에서 빠진다
    const h = clock({ title: '메인', adjEntries: 3, eliminations: 5, running: false });
    expect(buildLiveFactMap([h], [s]).get('s')).toEqual({ alive: 0, levelNo: 0 });
  });
  it('🔴 메인·사이드가 같은 포스터에 붙으면 메인(gameSeq 1)이 이긴다 — 응답 순서와 무관', () => {
    const side = clock({ title: '메인', gameSeq: 2, liveStats: { alive: 99 } as ClockState['liveStats'], running: false });
    const main = clock({ title: '메인', gameSeq: 1, liveStats: { alive: 7 } as ClockState['liveStats'], running: false });
    expect(buildLiveFactMap([side, main], [s]).get('s')?.alive).toBe(7);
    expect(buildLiveFactMap([main, side], [s]).get('s')?.alive).toBe(7);
  });
  it('연결 안 된 클락은 맵에 없다', () => {
    expect(buildLiveFactMap([clock({ venueId: 'other' })], [s]).size).toBe(0);
  });
});

describe('railFact — 근거 한 줄', () => {
  const s = sch('s');
  it('근거 없음 = 빈 문자열(줄은 남고 글자만 없다)', () => { expect(railFact(s, ctx())).toBe(''); });
  it('지금 뛰는 판 → 내 예약 → 가 본 매장, 최대 두 조각', () => {
    const c = ctx({ live: new Map([['s', { alive: 12, levelNo: 8 }]]), reservedIds: new Set(['s']), visitsByVenue: new Map([['v-s', 3]]) });
    expect(railFact(s, c)).toBe('지금 12명 · Lv 8 · 내 예약');
    expect(railFact(s, ctx({ visitsByVenue: new Map([['v-s', 3]]) }))).toBe('3번 가 본 매장');
    expect(railFact(s, ctx({ live: new Map([['s', { alive: 4, levelNo: 0 }]]) }))).toBe('지금 4명');
  });
  it('방문 0회는 근거가 아니다', () => {
    expect(railFact(s, ctx({ visitsByVenue: new Map([['v-s', 0]]) }))).toBe('');
  });
});

describe('todayLine — 오늘 안내는 그 사람을 말한다', () => {
  const base = { visitedCount: 0, todayAtVisited: 0, reservedToday: 0, openNow: null as number | null };
  it('비로그인·이력 없음 = 빈 문자열 → 호출부가 종전 문구(오늘 대회 N개)로 떨어진다', () => {
    expect(todayLine(base)).toBe('');
    expect(todayLine({ ...base, openNow: 5 }), '이력이 없으면 등록 가능만으로 문장을 만들지 않는다').toBe('');
  });
  it('🔴 이력 있음 — 가 본 매장 → 오늘 게임 → 내 예약 순, 0 갈래는 빠진다', () => {
    expect(todayLine({ ...base, visitedCount: 2, todayAtVisited: 3, reservedToday: 1 })).toBe('가 본 매장 2곳 · 오늘 3게임 · 내 예약 1건');
    expect(todayLine({ ...base, visitedCount: 2 })).toBe('가 본 매장 2곳');
    expect(todayLine({ ...base, reservedToday: 1 })).toBe('내 예약 1건');
    expect(todayLine({ ...base, visitedCount: 2, reservedToday: 0 })).not.toContain('예약');
  });
  it('등록 가능은 자리가 남을 때만(최대 3조각 — 375px 한 줄), 클락 전(null)·0 이면 안 적는다', () => {
    expect(todayLine({ ...base, visitedCount: 2, openNow: 4 })).toBe('가 본 매장 2곳 · 등록 가능 4개');
    expect(todayLine({ ...base, visitedCount: 2, todayAtVisited: 3, reservedToday: 1, openNow: 4 })).toBe('가 본 매장 2곳 · 오늘 3게임 · 내 예약 1건');
    expect(todayLine({ ...base, visitedCount: 2, openNow: 0 })).toBe('가 본 매장 2곳');
    expect(todayLine({ ...base, visitedCount: 2, openNow: null })).toBe('가 본 매장 2곳');
  });
});
