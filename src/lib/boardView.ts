// 게시판 보기 모드(카드 feed / 한 줄 compact) 저장값 — 읽기·쓰기 한 벌.
//
// N08(2026-09-13): **미선택 기본은 compact(모아보기)** 다.
//   이력: 2026-08 에는 PostCard 를 아무도 못 봐서 기본을 카드(feed)로 뒤집었고(당시 CommunityTab 주석),
//   2026-09-13 최신 요구로 다시 모아보기가 기본이 됐다. 사용자가 명시적으로 저장한 feed 는 그대로 존중한다 —
//   기본값을 바꾸는 것이지 사용자 선택을 지우는 것이 아니다.
//   키 없음 · 알 수 없는 값 · 저장소 접근 예외(사생활 모드·차단에서는 `localStorage` 프로퍼티 접근 자체가 throw 한다 —
//   `typeof localStorage` 검사로는 못 막는다) → 전부 compact. 저장소 관용구는 lib/identityFlag.ts 와 같다.
export type BoardView = 'compact' | 'feed';
export const BOARD_VIEW_KEY = 'nuri:board-view';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStorage = (): StorageLike | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export function readBoardView(storage: StorageLike | null = defaultStorage()): BoardView {
  try {
    return storage?.getItem(BOARD_VIEW_KEY) === 'feed' ? 'feed' : 'compact';
  } catch {
    return 'compact';
  }
}

/** 사용자가 버튼으로 바꿀 때만 부른다 — 자동 저장 경로는 없다(있으면 명시적 선택을 덮어쓴다). */
export function writeBoardView(v: BoardView, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(BOARD_VIEW_KEY, v); } catch { /* 차단된 저장소 — 이번 세션 안에서만 유지된다 */ }
}
