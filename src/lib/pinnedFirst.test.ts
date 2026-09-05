import { describe, expect, it } from 'vitest';
import { hotFirst, pinnedFirst } from './pinnedFirst';

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
