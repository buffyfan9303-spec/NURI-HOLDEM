// N08(2026-09-13) — 게시판 보기 모드 저장값 읽기의 기본값 계약: **미선택은 모아보기(compact)**.
//
// 왜: 예전엔 "저장값이 compact 일 때만 compact, 나머지는 feed" 였다(2026-08 오너 지시 '카드가 기본'). 최신 요구(N08)로 뒤집는다 —
//   정상 저장값 feed 는 사용자의 명시적 선택이라 **절대 지우지 않고** 유지, compact 유지, 키 없음·알 수 없는 값·저장소 접근 예외는 compact.
//   `typeof localStorage` 검사만으로는 사생활 모드·차단 환경의 **접근 자체가 throw** 하는 경우를 못 막는다 — try/catch 가 기본값을 낸다.
// 못 보는 것: 버튼·aria·실제 렌더 정합은 e2e/board-view-toggle.spec.ts 가 본다.
// 음성 대조: boardView.ts 의 `=== 'feed' ? 'feed' : 'compact'` 를 `=== 'compact' ? 'compact' : 'feed'` 로 되돌리면 '키 없음'·'손상 값'·'throw' 세 케이스가 실패한다.
// 실행: npx vitest run src/lib/boardView.test.ts
import { describe, it, expect } from 'vitest';
import { readBoardView, writeBoardView, BOARD_VIEW_KEY } from './boardView';

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, dump: () => Object.fromEntries(m) };
};
const throwing = { getItem: () => { throw new DOMException('blocked', 'SecurityError'); }, setItem: () => { throw new DOMException('blocked', 'SecurityError'); } };

describe('readBoardView — 기본은 compact, 명시적 feed 만 feed', () => {
  it('🔴 키 없음 → compact', () => { expect(readBoardView(mem())).toBe('compact'); });
  it('정상 저장값 feed → feed (사용자 선택 유지)', () => { expect(readBoardView(mem({ [BOARD_VIEW_KEY]: 'feed' }))).toBe('feed'); });
  it('정상 저장값 compact → compact', () => { expect(readBoardView(mem({ [BOARD_VIEW_KEY]: 'compact' }))).toBe('compact'); });
  it('🔴 손상 값(알 수 없는 문자열·빈 문자열·공백) → compact', () => {
    for (const v of ['grid', 'FEED', '', ' feed', 'null', 'undefined']) expect(readBoardView(mem({ [BOARD_VIEW_KEY]: v })), JSON.stringify(v)).toBe('compact');
  });
  it('🔴 저장소 접근이 throw 해도(사생활 모드·차단) compact — 예외가 새지 않는다', () => {
    expect(readBoardView(throwing)).toBe('compact');
  });
  it('저장소가 없으면(SSR·테스트) compact', () => { expect(readBoardView(null)).toBe('compact'); });
});

describe('writeBoardView — 사용자의 선택만 저장하고, 실패는 삼킨다', () => {
  it('feed/compact 를 같은 키에 저장한다', () => {
    const s = mem();
    writeBoardView('feed', s); expect(s.dump()).toEqual({ [BOARD_VIEW_KEY]: 'feed' });
    writeBoardView('compact', s); expect(s.dump()).toEqual({ [BOARD_VIEW_KEY]: 'compact' });
  });
  it('저장소가 throw 해도 예외가 새지 않는다', () => { expect(() => writeBoardView('feed', throwing)).not.toThrow(); });
});
