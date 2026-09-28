// 실시간 한 줄 재조회 병합 계약 — 실행: npx vitest run src/lib/mergeLiveMessages.test.ts
import { describe, it, expect } from 'vitest';
import { mergeLiveMessages } from './mergeLiveMessages';

const m = (id: string, createdAt: string) => ({ id, createdAt });

describe('mergeLiveMessages', () => {
  it('응답이 권위다 — 응답에 없고 도착분도 아닌 줄(그 사이 삭제됨)은 사라진다', () => {
    expect(mergeLiveMessages([m('a', '2'), m('b', '1')], [m('a', '2')], new Set())).toEqual([m('a', '2')]);
  });
  it('조회 중 실시간으로 받은 줄은 응답에 아직 없어도 살려서 최신순 앞에 둔다', () => {
    const out = mergeLiveMessages([m('new', '3'), m('a', '1')], [m('a', '1')], new Set(['new']));
    expect(out.map((x) => x.id)).toEqual(['new', 'a']);
  });
  it('도착분이 응답에도 있으면 한 번만 나온다', () => {
    const out = mergeLiveMessages([m('x', '2')], [m('x', '2'), m('a', '1')], new Set(['x']));
    expect(out.map((x) => x.id)).toEqual(['x', 'a']);
  });
});
