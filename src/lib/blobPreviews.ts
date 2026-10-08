import { useEffect, useRef } from 'react';

/**
 * UP-02(2026-10-08) — 사진 미리보기 blob URL 은 **목록에서 빠진 것만** 해제한다.
 *
 * 재현한 버그: `useEffect(() => () => previews.forEach(revoke), [previews])` 는 배열이 바뀔 때마다
 * **이전 배열 전체**를 revoke 했다. 사진을 한 장 더 고르면 새 배열에 그대로 남아 있는 앞 사진들의 URL 까지
 * 해제돼, 그 `<img>` 가 다시 마운트되면(정렬·리렌더) 깨진 이미지가 됐다.
 */
export function revokeDropped(prev: readonly string[], next: readonly string[]): void {
  if (prev.length === 0) return;
  const keep = new Set(next);
  for (const u of prev) if (!keep.has(u)) URL.revokeObjectURL(u);
}

/** previews 가 바뀌면 빠진 URL 만, 언마운트 때는 남은 URL 전부를 해제한다. */
export function useRevokeDroppedPreviews(previews: readonly string[]): void {
  const shownRef = useRef<readonly string[]>([]);
  useEffect(() => {
    revokeDropped(shownRef.current, previews);
    shownRef.current = previews;
  }, [previews]);
  useEffect(() => () => { revokeDropped(shownRef.current, []); shownRef.current = []; }, []);
}
