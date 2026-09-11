import { describe, expect, it } from 'vitest';
import { hotFirst, pinnedFirst, usableAdCount } from './pinnedFirst';

describe('pinnedFirst', () => {
  it('고정 글은 pinned_at 최신순으로 맨 위, 나머지는 원래 순서', () => {
    const list = [
      { id: 'a' }, { id: 'b', pinnedAt: '2026-09-01T00:00:00Z' }, { id: 'c', pinnedAt: null },
      { id: 'd', pinnedAt: '2026-09-02T00:00:00Z' }, { id: 'e' },
    ];
    expect(pinnedFirst(list).map((p) => p.id)).toEqual(['d', 'b', 'a', 'c', 'e']);
    expect(list.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']); // 입력 불변
  });
  it('고정이 없으면 그대로', () => {
    const list: { id: number; pinnedAt?: string | null }[] = [{ id: 1 }, { id: 2 }];
    expect(pinnedFirst(list).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe('hotFirst — 게시판 기본 화면 순서(#10, 오너 결정 2026-09-05)', () => {
  it('고정 → HOT → 끌올 → 최신. HOT 이 고정 글이면 고정 자리에 남고, 끌올 글이면 HOT 자리로 올라온다', () => {
    // 입력 = 기존 파이프라인 결과(pinnedFirst([끌올…, 최신…])): 고정 P, 끌올 B1·B2, 최신 N1·N2·N3
    type Row = { id: string; pinnedAt?: string | null };
    const P: Row = { id: 'P', pinnedAt: '2026-09-05T00:00:00Z' };
    const B1: Row = { id: 'B1' }, B2: Row = { id: 'B2' }, N1: Row = { id: 'N1' }, N2: Row = { id: 'N2' }, N3: Row = { id: 'N3' };
    const list = pinnedFirst<Row>([B1, B2, N1, N2, N3, P]);
    expect(list.map((p) => p.id)).toEqual(['P', 'B1', 'B2', 'N1', 'N2', 'N3']);
    // HOT = 최신 글 N2 + 끌올 글 B2 → 고정 다음, 나머지 끌올보다 위. 중복 없음.
    expect(hotFirst(list, [N2, B2]).map((p) => p.id)).toEqual(['P', 'N2', 'B2', 'B1', 'N1', 'N3']);
    // HOT 이 고정 글이면 고정 블록에만 한 번 — HOT 자리로 내려오지 않는다
    expect(hotFirst(list, [P, N3]).map((p) => p.id)).toEqual(['P', 'N3', 'B1', 'B2', 'N1', 'N2']);
    // HOT 없음 = 입력 그대로, 입력 불변
    expect(hotFirst(list, []).map((p) => p.id)).toEqual(['P', 'B1', 'B2', 'N1', 'N2', 'N3']);
    expect(list.map((p) => p.id)).toEqual(['P', 'B1', 'B2', 'N1', 'N2', 'N3']);
  });
});

describe('usableAdCount — 자리 없는 광고는 승격하지 않는다', () => {
  // 실제 배치를 그대로 흉내 낸다: ads[0] 은 맨 위, ads[k] 는 비광고 목록의 인덱스 adsEvery*k-1.
  // k 개를 승격하면 비광고 글은 total-k 개다.
  const placed = (k: number, total: number, every: number) => {
    const rest = total - k;                       // 목록에 남는 비광고 글 수
    let n = Math.min(k, 1);                       // ads[0] 은 목록이 비어도 선다
    for (let j = 1; j < k; j++) if (rest >= every * j) n++;
    return n;
  };

  it('고른 개수는 전부 실제로 그려진다 — 소실이 0이다', () => {
    for (let total = 0; total <= 40; total++) {
      for (let every = 2; every <= 10; every++) {
        for (let adCount = 0; adCount <= 5; adCount++) {
          const k = usableAdCount(adCount, total, every);
          expect(k, `total=${total} every=${every} ads=${adCount}`).toBeLessThanOrEqual(adCount);
          // 고른 k 개가 한 칸도 빠짐없이 그려져야 한다. 안 그러면 그 글이 화면에서 사라진다.
          expect(placed(k, total, every), `total=${total} every=${every} ads=${adCount} k=${k}`).toBe(k);
        }
      }
    }
  });

  it('한 칸 더 쓰면 반드시 소실이 생긴다 — 덜 고르지 않았다', () => {
    for (let total = 0; total <= 40; total++) {
      for (let every = 2; every <= 10; every++) {
        for (let adCount = 0; adCount <= 5; adCount++) {
          const k = usableAdCount(adCount, total, every);
          if (k >= adCount) continue;             // 전부 썼으면 더 볼 것이 없다
          expect(placed(k + 1, total, every), `total=${total} every=${every} k+1=${k + 1}`).toBeLessThan(k + 1);
        }
      }
    }
  });

  it('발견 당시의 실제 사례 — 글 17개 · 슬롯 5칸 · 4개마다', () => {
    // 종전 구현은 5개를 전부 목록에서 빼고 4개만 그려 1건이 사라졌다.
    expect(usableAdCount(5, 17, 4)).toBe(4);
    // 글이 적으면 첫 칸만 — 나머지는 일반 글로 남는다.
    expect(usableAdCount(2, 3, 4)).toBe(1);
    // 목록이 비어도 첫 광고는 선다(오너 2026-09-05).
    expect(usableAdCount(3, 0, 4)).toBe(1);
    // 광고가 없으면 0.
    expect(usableAdCount(0, 20, 4)).toBe(0);
  });
});
