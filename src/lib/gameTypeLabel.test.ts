import { describe, it, expect } from 'vitest';
import { gameTypeLabel } from './gameTypeLabel';

describe('gameTypeLabel — 장부 코드값만 사람 말로, 자유 입력은 그대로', () => {
  it.each([
    ['gtd', 'GTD (보장)'], ['GTD', 'GTD (보장)'], [' entry ', '엔트리 게임'],
    ['프리즈아웃', '프리즈아웃'], ['바운티', '바운티'], ['', ''], [undefined, ''], [null, ''],
  ])('%s → %s', (raw, out) => { expect(gameTypeLabel(raw)).toBe(out); });
});
