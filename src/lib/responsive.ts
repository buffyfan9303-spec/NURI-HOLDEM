import { useEffect, useState } from 'react';

/**
 * 데스크탑(lg, min-width:1024px) 여부.
 * 2-pane 레이아웃(일정탐색·커뮤니티 등)에서 목록+상세 분할 렌더 판단에 사용.
 */
export function useIsDesktop(): boolean {
  return useMinWidth(1024);
}

/**
 * Tailwind `md`(min-width:768px) 이상 여부.
 *
 * 왜 별도로 두나: 표 모드는 `hidden md:block`(표)과 `md:hidden`(모바일 리스트) 두 벌로
 * 갈린다 — 경계가 **768px 이지 1024px 이 아니다**. 여기서 useIsDesktop(1024)을 쓰면
 * 768~1023px 구간에서 표도 리스트도 렌더되지 않아 목록이 통째로 사라진다.
 * CSS 브레이크포인트를 JS 로 흉내 낼 때는 **같은 숫자**를 써야 한다.
 */
export function useIsMdUp(): boolean {
  return useMinWidth(768);
}

/**
 * 공통 구현 — matchMedia 구독. px 는 Tailwind 브레이크포인트와 반드시 일치시킬 것.
 *
 * ⚠ 왜 resize 까지 함께 듣나(중복처럼 보이지만 아니다)
 *   이 값으로 **어느 쪽을 렌더할지** 를 가르는 화면이 있다(일정탐색 표 모드: md 이상 표 /
 *   md 미만 리스트). 값이 실제 폭보다 뒤처지면 CSS 가 감추는 쪽만 렌더돼 **목록이 통째로
 *   사라진다** — 성능 최적화 때문에 화면이 비는 건 어떤 경우에도 남는 장사가 아니다.
 *   그런데 일부 환경에서는 matchMedia 의 'change' 가 오지 않는다(뷰포트 에뮬레이션에서
 *   matches 값은 뒤집히는데 이벤트는 0건인 것을 2026-08-28 실측했다).
 *   그래서 신호를 둘로 둔다: change 가 오면 그것으로, 안 오면 resize 로 따라잡는다.
 *   비용은 `mq.matches` 불리언 재조회뿐이다(강제 레이아웃 없음) + 값이 같으면 setState 는
 *   리렌더를 만들지 않는다.
 */
function useMinWidth(px: number): boolean {
  const q = `(min-width: ${px}px)`;
  const [m, setM] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(q).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(q);
    const sync = () => setM(mq.matches);
    sync(); // 마운트와 구독 사이에 폭이 바뀌었을 수 있다
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync, { passive: true });
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, [q]);
  return m;
}
