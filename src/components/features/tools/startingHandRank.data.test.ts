// 스타팅 핸드 순위 데이터 검산(2026-09-23 RULES-STARTING-HAND-RANK).
// 값은 생성기(scripts/gen-starting-hand-rank.mjs)가 앱 에퀴티 엔진으로 만든 몬테카를로(핸드당 100만 회, 표준오차 ≈0.05%p)다.
// 여기서는 **엔진과 독립인 기준**과 대조한다: 무작위 한 손 상대 프리플랍 승률의 공표 정확값(PokerStove 등 전수 계산,
// 무승부 1/2). 허용 오차 ±0.30%p = 표준오차의 약 6배 + 표시 반올림(0.005). 이보다 벗어나면 엔진·생성기·데이터 중 하나가 틀렸다.
import { describe, expect, it } from 'vitest';
import { gridName } from '../../../lib/ranges';
import { STARTING_HAND_EQUITY } from './startingHandRank.data';

const TOL = 0.3;
const eq = new Map(STARTING_HAND_EQUITY.map(([h, e]) => [h, e]));
const rank = new Map(STARTING_HAND_EQUITY.map(([h], i) => [h, i + 1]));

// 공표 기준값(%, 무작위 한 손 상대 · 무승부 절반)
const REFERENCE: [string, number][] = [
  ['AA', 85.2], ['KK', 82.4], ['QQ', 79.9], ['JJ', 77.5], ['TT', 75.0],
  ['AKs', 67.0], ['AKo', 65.4], ['22', 50.3], ['72o', 34.6], ['32o', 32.3],
];

describe('스타팅 핸드 순위 데이터', () => {
  it('13×13 격자의 169개 이름을 정확히 한 번씩 갖는다', () => {
    const grid = new Set(Array.from({ length: 169 }, (_, k) => gridName(Math.floor(k / 13), k % 13)));
    expect(STARTING_HAND_EQUITY).toHaveLength(169);
    expect(new Set(STARTING_HAND_EQUITY.map(([h]) => h))).toEqual(grid);
  });

  it('강한 순서(승률 내림차순)로 정렬돼 있고 값이 확률 범위 안이다', () => {
    for (let i = 1; i < STARTING_HAND_EQUITY.length; i++) {
      expect(STARTING_HAND_EQUITY[i][1], `${i + 1}위 ${STARTING_HAND_EQUITY[i][0]}`).toBeLessThanOrEqual(STARTING_HAND_EQUITY[i - 1][1]);
    }
    for (const [h, e] of STARTING_HAND_EQUITY) expect(e > 25 && e < 90, `${h} ${e}`).toBe(true);
  });

  it.each(REFERENCE)('%s 는 공표 기준값 %s 와 0.30퍼센트포인트 안이다', (h, ref) => {
    expect(eq.get(h), `${h} 가 없다`).toBeDefined();
    expect(Math.abs(eq.get(h)! - ref), `${h}: 데이터 ${eq.get(h)} vs 기준 ${ref}`).toBeLessThanOrEqual(TOL);
  });

  it('순위의 양 끝과 잘 알려진 자리 — AA 1위 · KK 2위 · QQ 3위 · 32o 169위 · AKs 는 88·77 사이(8위)', () => {
    expect(rank.get('AA')).toBe(1);
    expect(rank.get('KK')).toBe(2);
    expect(rank.get('QQ')).toBe(3);
    expect(rank.get('32o')).toBe(169);
    expect(rank.get('AKs')).toBe(8);
    expect(rank.get('88')!).toBeLessThan(rank.get('AKs')!);
    expect(rank.get('AKs')!).toBeLessThan(rank.get('77')!);
  });

  it('같은 두 랭크면 수딧이 오프수트보다 강하다(78쌍 전부)', () => {
    const R = 'AKQJT98765432';
    for (let i = 0; i < 13; i++) for (let j = i + 1; j < 13; j++) {
      const s = `${R[i]}${R[j]}s`; const o = `${R[i]}${R[j]}o`;
      expect(eq.get(s)!, `${s} vs ${o}`).toBeGreaterThan(eq.get(o)!);
    }
  });
});
