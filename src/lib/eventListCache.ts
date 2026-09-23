// src/lib/eventListCache.ts — 이벤트 목록(EventListPage) 캐시 · stale-while-revalidate.
//
// EVT-OPEN-STUTTER(오너 2026-09-23, 삼성 실기기): "아래에서 드르륵 끊기면서 올라간다".
// 목록을 열 때마다 빈 헤더 → 스켈레톤 → 카드의 3단계를 거쳤다. 지난 목록을 들고 있다가
// 다시 열 때 **즉시** 그리고(EventListPage 가 peek), 뒤에서 새로 받아 덮는다(fetch).
// 첫 열기는 App 의 idle 예열(prefetchEventList)이 미리 채운다.
// 컴포넌트 파일 밖에 두는 이유: 컴포넌트 파일이 함수를 export 하면 Vite Fast Refresh 가 깨진다
// (eslint react-refresh/only-export-components).
import { listEvents, type EventListItem } from '../api/events';

let cached: EventListItem[] | null = null;
let inflight: Promise<EventListItem[]> | null = null;

/** 마지막으로 받은 목록(없으면 null). 상태 배지는 받은 시점 판정이라 낡을 수 있다 — 반드시 fetch 로 덮는다. */
export function peekEventList(): EventListItem[] | null { return cached; }

/** 새로 받는다. 예열과 실제 열기가 겹치면 같은 요청 하나를 나눠 쓴다(중복 요청 0). 실패는 던진다. */
export function fetchEventList(): Promise<EventListItem[]> {
  inflight ??= listEvents()
    .then((r) => { cached = r; return r; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** 홈 idle 예열용(App.tsx warm 목록). 여기서의 실패는 알릴 화면이 없다 — 캐시가 비어 있으니
 *  사용자가 목록을 열 때 다시 받고, 그때의 실패는 EventListPage 가 LoadErrorCard 로 그린다(K-03). */
export function prefetchEventList(): void { fetchEventList().catch(() => {}); }
