import { describe, expect, it } from 'vitest';
import { matchClockSchedule, matchClockScheduleDetailed, msToRegClose, buildRegInfoMap } from './regStatus';
import type { ClockState } from '../api/clock';
import type { Schedule } from '../api/schedules';

// 일시정지 클락(running=false)은 effectiveLevel 이 remainingMs 를 그대로 쓰므로 결정적이다.
const L = (minutes: number) => ({ kind: 'level' as const, minutes, sb: 100, bb: 200, ante: 0 });
const B = (minutes: number) => ({ kind: 'break' as const, minutes, sb: 0, bb: 0, ante: 0 });

const clock = (over: Record<string, unknown> = {}): ClockState => ({
  venueId: 'v1', gameSeq: 1, sessionDate: '2026-08-26', title: '데일리 6만',
  config: { title: '데일리 6만', levels: [L(20), L(20), B(10), L(20), L(20)], regCloseLevel: 4 },
  currentIndex: 0, running: false, endsAt: null, remainingMs: 5 * 60_000,
  adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0,
  ...over,
} as unknown as ClockState);

const sched = (over: Record<string, unknown> = {}): Schedule => ({
  id: 's1', venueId: 'v1', date: '2026-08-26', title: '데일리 6만', startTime: '19:00',
  ...over,
} as unknown as Schedule);

describe('msToRegClose · 실효 index/remaining 기준 마감까지 남은 ms', () => {
  it('브레이크를 포함해 마감 레벨 시작까지 누적한다 (L1 잔여5분 + L2 20 + 브레이크 10 + L3 20 = 55분)', () => {
    expect(msToRegClose(clock(), 0, 5 * 60_000)).toBe(55 * 60_000);
  });

  it('마감 레벨에 이미 도달했으면 0 (마감됨)', () => {
    expect(msToRegClose(clock({ currentIndex: 4 }), 4, 10 * 60_000)).toBe(0);
  });

  it('마감 레벨이 구조 밖이면 null (판정 불가)', () => {
    const g = clock({ config: { levels: [L(20), L(20)], regCloseLevel: 10 } });
    expect(msToRegClose(g, 0, 60_000)).toBeNull();
  });
});

describe('matchClockSchedule · 같은 매장·같은 날짜, 여럿이면 제목 일치 우선', () => {
  it('단일 매칭', () => {
    expect(matchClockSchedule(clock(), [sched()])?.id).toBe('s1');
  });

  it('같은 날 2개면 제목이 일치하는 쪽', () => {
    const list = [sched({ id: 'a', title: '사이드 3만' }), sched({ id: 'b', title: '데일리 6만' })];
    expect(matchClockSchedule(clock(), list)?.id).toBe('b');
  });

  it('sessionDate 없는 standalone 클락은 null', () => {
    expect(matchClockSchedule(clock({ sessionDate: null }), [sched()])).toBeNull();
  });
});

describe('buildRegInfoMap · scheduleId → 레지 실측 상태', () => {
  it('일시정지 클락에서 msLeft·running 이 결정적으로 매핑된다', () => {
    const map = buildRegInfoMap([clock()], [sched()], 0);
    // 🔴 2026-09-22 — RegInfo 에 필드 현황이 더해졌다. 이 픽스처 클락은 엔트리 0 이라 `hasField: false` 다
    //   (시작 전 `0 / 0` 을 카드에 그리지 않는다는 계약이 여기서도 확인된다).
    // 🔴 2026-09-24 — 현재 레벨(levelNo·onBreak)이 더해졌다. index 0 = L1, 브레이크 아님.
    expect(map.get('s1')).toEqual({ msLeft: 55 * 60_000, running: false, gameSeq: 1, alive: 0, entries: 0, hasField: false, levelNo: 1, onBreak: false });
  });

  it('현재 레벨 — 브레이크는 세지 않고, 브레이크 칸에서는 직전 레벨 번호 + onBreak', () => {
    const at = (i: number) => buildRegInfoMap([clock({ currentIndex: i })], [sched()], 0).get('s1');
    expect(at(1)).toMatchObject({ levelNo: 2, onBreak: false });
    expect(at(2)).toMatchObject({ levelNo: 2, onBreak: true });
    expect(at(3)).toMatchObject({ levelNo: 3, onBreak: false });
    expect(buildRegInfoMap([clock({ config: { title: '데일리 6만', levels: [], regCloseLevel: 0 } })], [sched()], 0).get('s1'))
      .toMatchObject({ levelNo: 0, onBreak: false });
  });

  it('클락과 매칭되지 않는 대회는 맵에 없다 (소비처가 추정으로 폴백)', () => {
    const map = buildRegInfoMap([clock()], [sched({ id: 's2', date: '2026-08-27' })], 0);
    expect(map.has('s2')).toBe(false);
  });
});

// ── F1 · F2 (2026-09-12 연결 감사) ───────────────────────────────────────────
// 감사가 두 렌즈 적대적 반증을 통과시킨 확정 결함 둘을 잠근다.
//  F1 같은 매장·같은 날짜에 메인+사이드 클락이 동시에 running 이면(앱이 만드는 정상 형태다)
//     `map.set` 이 조용히 덮어 **어느 쪽이 이기는지가 서버 정렬 순서에 달려 있었다**.
//  F2 등록 마감 레벨을 비워 둔 대회를 '이미 마감' 이라고 단언했다 — **없는 규칙은 마감이 아니라 판정 불가다.**
describe('🔴 F2 — 마감 레벨 미설정은 "마감" 이 아니라 "판정 불가" 다', () => {
  it('regCloseLevel 이 0이면 null — 0(마감)이 아니다', () => {
    const g = clock({ config: { levels: [L(20), L(20)], regCloseLevel: 0 } });
    expect(msToRegClose(g, 0, 60_000), '마감 규칙이 없는 대회를 마감이라고 단언했다').toBeNull();
  });

  it('config 자체가 비어도 null', () => {
    const g = clock({ config: {} });
    expect(msToRegClose(g, 0, 60_000)).toBeNull();
  });

  it('정상적으로 설정된 대회는 종전 그대로 동작한다(과잉 차단이 아니다)', () => {
    expect(msToRegClose(clock(), 0, 5 * 60_000)).toBe(55 * 60_000);
    expect(msToRegClose(clock({ currentIndex: 4 }), 4, 10 * 60_000)).toBe(0);
  });
});

describe('🔴 F1 — 한 포스터에 클락 둘이 붙어도 결정적으로 고른다', () => {
  const main = clock({ gameSeq: 1, title: '데일리 6만', remainingMs: 5 * 60_000 });
  const side = clock({ gameSeq: 2, title: '데일리 6만 사이드1', currentIndex: 4, remainingMs: 10 * 60_000 });

  it('포스터가 둘이면 각자 자기 클락을 받는다', () => {
    const schedules = [sched({ id: 'main', title: '데일리 6만' }), sched({ id: 'side', title: '데일리 6만 사이드1' })];
    const map = buildRegInfoMap([main, side], schedules);
    expect(map.size).toBe(2);
    expect(map.get('main')!.msLeft, '메인 포스터가 사이드 클락 값을 받았다').toBe(55 * 60_000);
    expect(map.get('side')!.msLeft).toBe(0);
  });

  // 가장 흔한 붕괴 형태: 포스터 1장인데 메인·사이드 클락이 둘 다 돈다.
  it('🔴 포스터 1장 + 클락 2개 — 메인(gameSeq 낮은 쪽)이 이긴다', () => {
    const map = buildRegInfoMap([main, side], [sched({ id: 'only', title: '데일리 6만' })]);
    expect(map.size, '포스터가 맵에서 통째로 빠졌다 — 라이브 표시가 사라진다').toBe(1);
    expect(map.get('only')!.msLeft, '사이드 클락이 메인 포스터를 덮었다').toBe(55 * 60_000);
  });

  it('🔴 입력 배열 순서를 뒤집어도 결과가 같다 — 서버 정렬에 결과가 달라지면 안 된다', () => {
    const schedules = [sched({ id: 'only', title: '데일리 6만' })];
    const a = buildRegInfoMap([main, side], schedules).get('only');
    const b = buildRegInfoMap([side, main], schedules).get('only');
    expect(b).toEqual(a);
  });

  it('제목이 정확히 맞으면 gameSeq 가 커도 이긴다', () => {
    const schedules = [sched({ id: 'only', title: '데일리 6만 사이드1' })];
    const map = buildRegInfoMap([main, side], schedules);
    expect(map.get('only')!.msLeft, '제목 정확 일치가 gameSeq 에 졌다').toBe(0);
  });

  it('제목 검사가 개수보다 먼저다 — 1건짜리 목록에도 제목이 맞으면 title 로 잡힌다', () => {
    const { quality } = matchClockScheduleDetailed(main, [sched({ id: 'only', title: '데일리 6만' })])!;
    expect(quality).toBe('title');
  });

  it('클락이 없는 대회는 맵에 없다(추정 폴백은 소비처 책임 — 종전 계약)', () => {
    const map = buildRegInfoMap([], [sched()]);
    expect(map.size).toBe(0);
  });
});

// ── ⑤ F3 (2026-09-13 연결 감사) ──────────────────────────────────────────────
// 홈의 '마감까지 N분' 이 memo 평가 시점에 얼어붙던 것을 **신선한 now 를 주입해서** 고쳤다(App.tsx 의 regNow 틱).
//
// 이 describe 가 잠그는 것은 **고치지 않은 쪽**이다: 대안으로 검토됐던 '스케줄에 절대 마감시각(ISO)을 박고
// 벽시계로 뺀다' 를 나중에 누가 다시 들고 오면, **일시정지 클락에는 절대 마감시각이라는 것이 없어서**
// 정지된 대회를 벽시계로 깎아 '마감' 이라고 거짓말하게 된다. running=false 는 nowMs 와 무관해야 한다.
describe('🔴 F3 — 일시정지 클락의 msLeft 는 벽시계로 깎이지 않는다', () => {
  const paused = clock({ running: false, currentIndex: 0, remainingMs: 5 * 60_000, endsAt: null });

  it('now 가 3시간 흘러도 같은 값이다(정지 중에는 시간이 흐르지 않는다)', () => {
    const t0 = Date.UTC(2026, 7, 26, 10, 0, 0);
    const a = buildRegInfoMap([paused], [sched()], t0).get('s1');
    const b = buildRegInfoMap([paused], [sched()], t0 + 3 * 3600_000).get('s1');
    expect(a, '일시정지 클락이 맵에서 빠졌다').toEqual({ msLeft: 55 * 60_000, running: false, gameSeq: 1, alive: 0, entries: 0, hasField: false, levelNo: 1, onBreak: false });
    expect(b, '정지된 대회를 벽시계로 깎았다 — 절대 마감시각 방식으로 되돌아갔다는 뜻이다').toEqual(a);
  });

  it('endsAt 이 과거여도 running=false 면 무시된다 — 낡은 행이 "마감"으로 둔갑하지 않는다', () => {
    const stale = clock({ running: false, endsAt: new Date(Date.UTC(2026, 7, 26, 9, 0, 0)).toISOString(), remainingMs: 5 * 60_000 });
    const m = buildRegInfoMap([stale], [sched()], Date.UTC(2026, 7, 26, 23, 0, 0)).get('s1');
    expect(m!.msLeft).toBe(55 * 60_000);
  });

  // 음성 대조의 짝 — running 클락은 **반드시** now 를 따라 줄어야 한다.
  // 이게 없으면 위 두 건은 'nowMs 를 통째로 무시한다' 는 잘못된 구현으로도 통과한다.
  it('🔴 running 클락은 신선한 now 만으로 저절로 줄어든다(F3 수정이 성립하는 근거)', () => {
    const t0 = Date.UTC(2026, 7, 26, 10, 0, 0);
    const live = clock({ running: true, currentIndex: 0, endsAt: new Date(t0 + 5 * 60_000).toISOString(), remainingMs: 5 * 60_000 });
    const a = buildRegInfoMap([live], [sched()], t0).get('s1')!;
    const b = buildRegInfoMap([live], [sched()], t0 + 60_000).get('s1')!;
    expect(a.msLeft).toBe(55 * 60_000);
    expect(b.msLeft, 'now 를 갈아 끼워도 값이 그대로다 — 홈의 카운트다운이 얼어붙는다(F3 재발)').toBe(54 * 60_000);
  });
});
