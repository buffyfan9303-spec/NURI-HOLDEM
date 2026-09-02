// srs — 라이트너 박스 전이·due 계산 계약. 오답은 box 0·내일, 정답은 한 칸 위·[1,3,7,14,30] 간격, box 4 정답은 졸업(삭제).
import { describe, it, expect } from 'vitest';
import { addDays, applySrs, daysSinceAnswered, diffDays, dueKeys, type SrsMap } from './srs';

const T = '2026-09-03';

describe('addDays · diffDays', () => {
  it('월·연 경계를 로컬 달력으로 넘는다', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-08-30', T)).toBe(4);
    expect(diffDays('깨짐', T)).toBe(0);
  });
});

describe('applySrs · 박스 전이', () => {
  it('처음 틀리면 box 0 · 내일. 맞힐수록 3→7→14→30일, box 4 정답은 졸업', () => {
    let m: SrsMap = applySrs({}, 'k', false, T);
    expect(m.k).toEqual({ box: 0, due: '2026-09-04' });
    m = applySrs(m, 'k', true, T); expect(m.k).toEqual({ box: 1, due: '2026-09-06' });
    m = applySrs(m, 'k', true, T); expect(m.k).toEqual({ box: 2, due: '2026-09-10' });
    m = applySrs(m, 'k', true, T); expect(m.k).toEqual({ box: 3, due: '2026-09-17' });
    m = applySrs(m, 'k', true, T); expect(m.k).toEqual({ box: 4, due: '2026-10-03' });
    m = applySrs(m, 'k', true, T); expect(m).toEqual({});
  });
  it('높은 박스에서 틀리면 box 0 으로 떨어진다', () => {
    expect(applySrs({ k: { box: 3, due: '2026-09-17' } }, 'k', false, T).k).toEqual({ box: 0, due: '2026-09-04' });
  });
  it('처음 보는 문제를 맞힌 건 기록하지 않는다 · 입력을 변형하지 않는다', () => {
    const m: SrsMap = { a: { box: 0, due: T } };
    expect(applySrs(m, 'new', true, T)).toBe(m);
    applySrs(m, 'a', true, T);
    expect(m.a).toEqual({ box: 0, due: T });
  });
});

describe('dueKeys · daysSinceAnswered', () => {
  it('due 가 오늘 이하인 키만, 오래된 순', () => {
    const m: SrsMap = { c: { box: 0, due: '2026-09-04' }, a: { box: 0, due: T }, b: { box: 1, due: '2026-09-01' } };
    expect(dueKeys(m, T)).toEqual(['b', 'a']);
  });
  it('마지막으로 푼 지 며칠 = 밀린 날 + 그 박스 간격', () => {
    expect(daysSinceAnswered({ box: 1, due: '2026-09-01' }, T)).toBe(5); // 3일 간격 + 2일 밀림
    expect(daysSinceAnswered({ box: 0, due: T }, T)).toBe(1);
  });
});
