// src/lib/useTitles.ts
// 칭호 표시 훅 — 여러 작성자(userId)의 활동점수를 한 번에 가져와 칭호용 점수맵 제공.
//   모듈 캐시로 컴포넌트 간 중복 fetch 방지. titleOf(userId) → 점수(없으면 undefined).
import { useEffect, useState } from 'react';
import { getActivityPointsMap } from '../api/community';

const cache = new Map<string, number>();

export function useTitlePoints(userIds: (string | undefined | null)[]): (id?: string | null) => number | undefined {
  const [, force] = useState(0);
  const key = userIds.filter(Boolean).join(',');
  useEffect(() => {
    const missing = [...new Set(userIds.filter((x): x is string => !!x && !cache.has(x)))];
    if (missing.length === 0) return;
    let alive = true;
    getActivityPointsMap(missing).then((m) => {
      if (!alive) return;
      let changed = false;
      for (const id of missing) { if (!cache.has(id)) { cache.set(id, m[id] ?? 0); changed = true; } } // 응답 없으면 0(중복 fetch 방지)
      if (changed) force((x) => x + 1);
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (id) => (id && cache.has(id) ? cache.get(id) : undefined);
}
