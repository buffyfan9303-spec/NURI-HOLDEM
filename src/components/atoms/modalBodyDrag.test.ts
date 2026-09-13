// Modal 본문 드래그 닫기 3상태(UI-02 · 2026-09-13) — resolveBodyDrag 진리표가 곧 회귀 계약이다.
//   page: 기존 5소비처(ToolsPanel·GtoDeepModal·CalendarToolsPanel·StoreToolsPanel·ScheduleDetailModal)는 dragToClose 를 안 넘긴다
//         → undefined → true(동작 불변). 게시글 읽기 화면만 false 로 끈다(본문 선택·세로 읽기·댓글 편집 중 오닫힘 방지).
//   sheet: 명시 true 만 켜진다(글쓰기·신고·설정 폼 보호). center: 항상 false.
// ⚠ 함정: `dragToClose = false` 기본값만 지우고 bodyDrag 계산을 안 바꾸면 모든 sheet 가 조용히 통과한다(거짓 초록) — (page,false) 줄이 그걸 잡는다.
// 음성 대조: Modal.tsx 의 page 분기를 `return true` 로 되돌리면 (page,false) 가, sheet 분기를 `!!dragToClose` 대신 `dragToClose !== false` 로 바꾸면 (sheet,undefined) 가 실패한다.
// 실행: npx vitest run src/components/atoms/modalBodyDrag.test.ts
import { describe, it, expect } from 'vitest';
import { resolveBodyDrag } from './Modal';

describe('resolveBodyDrag(variant, dragToClose)', () => {
  const T: [Parameters<typeof resolveBodyDrag>[0], boolean | undefined, boolean][] = [
    ['page', undefined, true], ['page', false, false], ['page', true, true],
    ['sheet', undefined, false], ['sheet', true, true], ['sheet', false, false],
    ['center', undefined, false], ['center', true, false], ['center', false, false],
  ];
  for (const [v, d, want] of T) {
    it(`🔴 (${v}, ${String(d)}) = ${want}`, () => { expect(resolveBodyDrag(v, d)).toBe(want); });
  }
});
