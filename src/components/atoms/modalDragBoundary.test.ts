// Modal 시트 드래그 경계 = 그립 표시 경계(P3-2 · 2026-10-06). 그립(`sm:hidden`)이 사라지는 640 부터 드래그도 꺼야 한다.
// 종전: onSheetStart 가 1024 로 막아 640~1023 에서 그립은 없는데 헤더를 끌면 시트가 닫혔다.
// 음성 대조: dragBlockedAtWidth 의 sheet 값을 640 → 1024 로 되돌리면 (sheet,640)·(sheet,800) 줄이 실패한다.
//   onSheetStart 의 호출을 `window.innerWidth >= 1024` 로 되돌리면 마지막 소스 계약이 실패한다.
// 실행: npx vitest run src/components/atoms/modalDragBoundary.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dragBlockedAtWidth } from './Modal';

describe('dragBlockedAtWidth(variant, width)', () => {
  const T: [Parameters<typeof dragBlockedAtWidth>[0], number, boolean][] = [
    ['sheet', 390, false], ['sheet', 639, false], ['sheet', 640, true], ['sheet', 800, true], ['sheet', 1023, true], ['sheet', 1440, true],
    ['page', 390, false], ['page', 800, false], ['page', 1023, false], ['page', 1024, true],
  ];
  for (const [v, w, want] of T) {
    it(`🔴 (${v}, ${w}) = ${want}`, () => { expect(dragBlockedAtWidth(v, w)).toBe(want); });
  }
  it('onSheetStart 는 이 함수를 쓰고 1024 를 직접 쓰지 않는다 / 시트 그립은 sm:hidden', () => {
    const src = readFileSync(new URL('./Modal.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/if \(dragBlockedAtWidth\(variant, window\.innerWidth\)\) return;/);
    expect(src).not.toMatch(/window\.innerWidth >= 1024/);
    expect(src).toMatch(/pt-2 pb-1 sm:hidden touch-none/);
  });
});
