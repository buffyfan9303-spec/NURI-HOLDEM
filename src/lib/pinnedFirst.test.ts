import { describe, expect, it } from 'vitest';
import { pinnedFirst } from './pinnedFirst';

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
