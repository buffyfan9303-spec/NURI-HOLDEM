// 10인 기준 스타팅 핸드 순위 데이터 검산 — 2026-10-01.
// 순서는 오너가 사진으로 준 일반 순위표를 옮겨 적은 것이다 → 옮기다 틀리는 것(중복·누락·수티드/오프수트 뒤섞임)을 여기서 막는다.
//
// 온라인 대조(2026-10-01, GamblingNerd 169핸드 순위표 — Equilab 시뮬레이션 100만 판·10인): 169자리 중 147자리가 같다.
//   · 그 표의 사진 파일명 라벨이 11곳 잘못돼 있어(같은 핸드가 두 번·빠진 핸드 11개 — 예: AKs 가 4위와 9위) 그 자리들은 대조에서 뺐고,
//     빠진 11개(KJs·A8s·A3s·K8s·K7s·QTo·K5s·K4s·A9o·J5s·98o)가 정확히 그 빈 자리에 들어가는 것을 확인했다.
//   · 진짜 다른 자리: 22/33(51↔52), K2s/K3s(59↔60), K2o/96o(134↔135), Q2o/74o(145↔146), A5o·A7o(우리 101·102 / 그쪽 96·97), 62s(110 / 100).
//   바꾸지 않고 리드에게 보고했다. 독립 몬테카를로(10인 100만 판/핸드)와의 순위 상관도 0.998(최대 10자리 차).
import { describe, expect, it } from 'vitest';
import { gridName } from '../../../lib/ranges';
import { STARTING_HAND_EQUITY } from './startingHandRank.data';
import { STARTING_HAND_ORDER_10 } from './startingHandRank10.data';

const ORDER = STARTING_HAND_ORDER_10;
const rank = new Map(ORDER.map((h, i) => [h, i + 1]));

describe('10인 기준 순위 데이터', () => {
  it('169개가 서로 다르고 13×13 격자의 이름과 정확히 같은 집합이다', () => {
    const grid = new Set(Array.from({ length: 169 }, (_, k) => gridName(Math.floor(k / 13), k % 13)));
    expect(ORDER).toHaveLength(169);
    expect(new Set(ORDER).size).toBe(169);
    expect(new Set(ORDER)).toEqual(grid);
  });

  it('페어 13 · 수티드 78 · 오프수트 78', () => {
    expect(ORDER.filter((h) => h.length === 2)).toHaveLength(13);
    expect(ORDER.filter((h) => h.endsWith('s'))).toHaveLength(78);
    expect(ORDER.filter((h) => h.endsWith('o'))).toHaveLength(78);
  });

  it('헤즈업 데이터와 같은 169개 집합이다(기준만 다르다)', () => {
    expect(new Set(ORDER)).toEqual(new Set(STARTING_HAND_EQUITY.map(([h]) => h)));
  });

  it('잘 알려진 자리 — AA·KK·QQ·AKs·JJ 가 1~5위 · 72o 꼴찌 · 32o 159위', () => {
    expect(ORDER.slice(0, 5)).toEqual(['AA', 'KK', 'QQ', 'AKs', 'JJ']);
    expect(rank.get('72o')).toBe(169);
    expect(rank.get('32o')).toBe(159);
    expect(rank.get('77')).toBe(29);
    expect(rank.get('JTs')).toBe(16);
  });

  it('같은 두 랭크면 수딧이 오프수트보다 앞선다(78쌍 전부)', () => {
    const R = 'AKQJT98765432';
    for (let i = 0; i < 13; i++) for (let j = i + 1; j < 13; j++) {
      const s = `${R[i]}${R[j]}s`; const o = `${R[i]}${R[j]}o`;
      expect(rank.get(s)!, `${s} vs ${o}`).toBeLessThan(rank.get(o)!);
    }
  });

  it('같은 두 랭크 페어는 높은 쪽이 앞선다(AA > KK > … > 22)', () => {
    const R = 'AKQJT98765432';
    for (let i = 1; i < 13; i++) expect(rank.get(R[i - 1] + R[i - 1])!).toBeLessThan(rank.get(R[i] + R[i])!);
  });

  // 10인 순위는 헤즈업과 일부러 다르다 — 기본값이 헤즈업으로 새어 들어가면 여기서 갈린다.
  it('헤즈업 순위와 다르다 — 77 은 10인 29위 / 헤즈업 9위, JTs 는 10인 16위 / 헤즈업 45위', () => {
    const hu = new Map(STARTING_HAND_EQUITY.map(([h], i) => [h, i + 1]));
    expect(rank.get('77')).not.toBe(hu.get('77'));
    expect(hu.get('77')).toBe(9);
    expect(hu.get('JTs')).toBe(45);
    expect(rank.get('JTs')).toBe(16);
  });
});
