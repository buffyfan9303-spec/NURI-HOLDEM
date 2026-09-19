/**
 * ♥ 즐겨찾기(매장 팔로우) — **목록 카드용 공유 훅**.
 *
 * 왜 훅으로 묶나 (2026-09-20)
 *   `ScheduleCard` 는 `onToggleFavorite`/`favorited` prop 을 2026-08-28(커밋 8d42ef4)에 만들어 두고
 *   **한 번도 배선되지 않았다** — 호출부 4곳(App.tsx×2 · HomeTab.tsx · LiveGamesTab.tsx) 전부 0건 전달이라
 *   하트가 어느 화면에도 안 떴다. 회귀가 아니라 **미완성**이었다(git log -S 로 확인).
 *   오너 지시(2026-09-20)로 살리면서, 탭마다 따로 배선하지 않고 여기 하나로 묶는다.
 *
 * 🔴 따로 배선하면 나는 버그 — 이미 한 번 겪었다.
 *   `LiveGamesTab.tsx` 주석(연결 감사 E, 2026-09-17)에 기록돼 있다:
 *   "'1회 조회' 였다 — 이 탭은 keep-alive 라 마운트가 한 번뿐이고, 매장 페이지에서 팔로우하고
 *    돌아와도 하트가 **영원히** 안 붙었다."
 *   탭이 **보이게 될 때마다** 다시 읽는 것이 이 저장소의 조리법이다(CalendarPanel ②와 같다).
 *   세 탭이 각자 구현하면 그중 하나는 반드시 이걸 빠뜨린다.
 *
 * ⚠ `VenuePage` 의 `useVenueFollow` 를 재사용하지 **않는다**. 그쪽은 매장 **한 곳**의
 *   `{following, count}` 를 다루고 팔로워 수까지 낙관 갱신한다(`lib/venueFollow.ts`).
 *   여기는 **여러 매장의 id 집합**만 다루고 팔로워 수는 안 건드린다 — 목록 카드에 수가 없기 때문이다.
 *   같은 테이블을 쓰지만 보는 것이 다르므로 둘은 별개다(정본은 서버 `venue_follows`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyFollowedVenueIds, followVenue, unfollowVenue } from '../api/community';

export interface FavoriteVenues {
  /** 지금 팔로우 중인 매장 id 집합. 비로그인은 빈 집합(하트가 아무 카드에도 안 붙는다). */
  ids: ReadonlySet<string>;
  /** 카드의 `onToggleFavorite` 에 그대로 넘긴다. */
  toggle: (venueId: string) => void;
}

/**
 * @param active 이 목록이 **화면에 보이는가**. keep-alive 탭이라 마운트만으로는 부족하다 —
 *   보이게 될 때마다 서버 목록을 다시 읽어 다른 화면(매장 페이지)에서 바뀐 것을 따라잡는다.
 * @param onNeedLogin 비로그인 상태에서 눌렀을 때. 안 주면 조용히 무시한다.
 */
export function useFavoriteVenues(active: boolean, onNeedLogin?: () => void): FavoriteVenues {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  // 🔴 늦게 도착한 GET 이 방금 누른 결과를 덮어쓰는 것을 막는다.
  //   `lib/venueFollow.ts` 의 `followMergeFetch` 와 같은 생각인데, 거기는 매장 한 곳의 boolean 이고
  //   여기는 집합이라 병합 규칙이 다르다 — **토글이 한 번이라도 있었으면 그 GET 은 통째로 버린다.**
  //   (부분 병합을 하면 "방금 끈 매장이 서버 응답 때문에 다시 켜지는" 반쪽 상태가 나온다.)
  const seq = useRef(0);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const issued = seq.current;
    getMyFollowedVenueIds()
      .then((list) => { if (alive && issued === seq.current) setIds(new Set(list)); })
      .catch(() => { /* 표시 보조다 — 실패해도 화면을 막지 않는다(하트만 안 붙는다) */ });
    return () => { alive = false; };
  }, [active]);

  const toggle = useCallback((venueId: string) => {
    if (!venueId) return;
    seq.current += 1;
    // 낙관 갱신 — 서버 왕복을 기다리면 하트가 한 박자 늦게 켜져 "안 눌렸나?" 로 읽힌다.
    let next = false;
    setIds((prev) => {
      next = !prev.has(venueId);
      const s = new Set(prev);
      if (next) s.add(venueId); else s.delete(venueId);
      return s;
    });
    (next ? followVenue(venueId) : unfollowVenue(venueId)).catch((e: unknown) => {
      // 🔴 실패하면 **되돌린다.** 안 되돌리면 화면은 켜져 있는데 서버엔 없는 상태로 굳는다.
      //   비로그인은 api 가 '로그인이 필요합니다' 를 던진다 — 그때만 로그인 유도를 부른다.
      setIds((prev) => {
        const s = new Set(prev);
        if (next) s.delete(venueId); else s.add(venueId);
        return s;
      });
      if (e instanceof Error && e.message.includes('로그인')) onNeedLogin?.();
    });
  }, [onNeedLogin]);

  return { ids, toggle };
}
