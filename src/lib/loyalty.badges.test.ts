// 🔴 2026-09-21 — 배지 획득 임계 계약. 뮤테이션 검증에서 `loyalty.ts` 가 **0/6** 이었다(테스트가 없었다).
//
// 왜 중요한가: 배지 조건은 화면에 **숫자로 약속**돼 있다('매장 체크인 5회', '7일 연속 체크인').
//   `>=` 가 `>` 로 한 칸 밀리면 **정확히 그 숫자를 채운 사람이 못 받는다** — 손님 눈에는
//   '5번 갔는데 왜 안 주냐' 로 보이고, 화면 설명과 실제 동작이 어긋난다.
//   CLAUDE.md 가 경고하는 그 부류다: *'입력칸 잘림은 경계값이다'* — 경계에서만 드러난다.
//
// 여기서는 **표에 적힌 임계값 자체**를 고정한다. 임계를 바꾸려면 화면 문구도 같이 바꿔야 하므로
//   이 표가 빨개지는 것은 '문구와 동작이 갈라졌다' 는 신호다.
import { describe, it, expect } from 'vitest';
import { BADGES, type BadgeStats } from './loyalty';

/** 어떤 배지도 못 받는 바닥 상태 — 여기서 한 축만 올려서 잰다. */
const FLOOR: BadgeStats = { moneyin: 0, bestPosition: 9999, visits: 0, streak: 0, points: 0 };
const checkOf = (key: string) => {
  const b = BADGES.find((x) => x.key === key);
  if (!b) throw new Error(`배지 '${key}' 가 사라졌다 — 표와 코드가 갈라졌다`);
  return b.check;
};

// [배지 키, 올릴 축, 화면이 약속한 임계]
const THRESHOLDS: [string, keyof BadgeStats, number][] = [
  ['first_moneyin', 'moneyin', 1],
  ['moneyin5',      'moneyin', 5],
  ['moneyin20',     'moneyin', 20],
  ['visit5',        'visits',  5],
  ['visit20',       'visits',  20],
  ['visit50',       'visits',  50],
  ['streak7',       'streak',  7],
  ['streak30',      'streak',  30],
  ['pts1000',       'points',  1000],
  ['pts5000',       'points',  5000],
  ['pts14000',      'points',  14000],
];

describe('배지 임계 — 정확히 그 숫자에서 받는다(경계값)', () => {
  it.each(THRESHOLDS)('%s: %s 가 %i 이면 **받는다**', (key, field, need) => {
    const check = checkOf(key);
    expect(check({ ...FLOOR, [field]: need }),
      `'${key}' 는 ${field} ${need} 에서 받아야 한다 — 화면이 그 숫자를 약속한다`).toBe(true);
  });

  it.each(THRESHOLDS)('%s: %s 가 %i 보다 하나 적으면 **못 받는다**', (key, field, need) => {
    const check = checkOf(key);
    expect(check({ ...FLOOR, [field]: need - 1 }),
      `'${key}' 가 ${field} ${need - 1} 에서 나왔다 — 임계가 헐거워졌다`).toBe(false);
  });

  it.each(THRESHOLDS)('%s: 넉넉히 넘겨도 계속 받는다', (key, field, need) => {
    expect(checkOf(key)({ ...FLOOR, [field]: need * 2 + 1 })).toBe(true);
  });
});

describe('champion — 1위 경험만 인정한다(등수는 작을수록 좋다)', () => {
  it('bestPosition 1 이면 받는다', () => {
    expect(checkOf('champion')({ ...FLOOR, bestPosition: 1 })).toBe(true);
  });
  it.each([2, 3, 9999])('bestPosition %i 이면 못 받는다', (pos) => {
    expect(checkOf('champion')({ ...FLOOR, bestPosition: pos })).toBe(false);
  });
  it('0 이나 음수 같은 이상한 등수도 받지 않는다(=== 1 이라 느슨해지면 안 된다)', () => {
    expect(checkOf('champion')({ ...FLOOR, bestPosition: 0 })).toBe(false);
    expect(checkOf('champion')({ ...FLOOR, bestPosition: -1 })).toBe(false);
  });
});

describe('표 자체의 건강성', () => {
  it('전제: 배지가 실제로 있다 — 0개면 위 검사들이 공허해진다', () => {
    expect(BADGES.length, '배지 목록이 비었다').toBeGreaterThanOrEqual(12);
  });
  it('키가 중복되지 않는다(중복이면 find 가 엉뚱한 것을 집는다)', () => {
    const keys = BADGES.map((b) => b.key);
    expect(new Set(keys).size, `중복 키: ${keys.filter((k, i) => keys.indexOf(k) !== i).join(', ')}`)
      .toBe(keys.length);
  });
  it('바닥 상태에서는 어떤 배지도 안 나온다', () => {
    expect(BADGES.filter((b) => b.check(FLOOR)).map((b) => b.key)).toEqual([]);
  });
  it('이 표가 BADGES 를 전부 덮는다(champion 제외) — 새 배지가 생기면 여기서 빨개진다', () => {
    const covered = new Set([...THRESHOLDS.map(([k]) => k), 'champion']);
    const missing = BADGES.map((b) => b.key).filter((k) => !covered.has(k));
    expect(missing, `임계 표에 없는 배지: ${missing.join(', ')} — 추가하면 여기에도 한 줄 넣어라`)
      .toEqual([]);
  });
});
