// src/lib/subTabTransition.ts — 하위(서브) 탭 전환의 단일 조리법.
//
// 오너 지시(2026-08-30): "하위탭들 이동시 기존에 정해놨던 부드러운 모션을 빠짐없이."
// 이미 완성형이 둘 있었다 — VenuePage.setTab(매장 서브탭) · TierLeaderboard.goBoard(랭킹 서브탭).
// 둘의 조리법은 글자 하나까지 같은데 화면마다 손으로 복사돼 있었고, 그래서 나머지 열 몇 화면에는
// 아예 빠져 있었다. **새 문법을 만들지 않고** 그 둘을 그대로 함수로 뽑는다.
//
// 조리법(왜 이 순서인지):
//   ① 진열 순서로 forward/back 을 정한다 — 밀리는 방향이 손가락이 고른 방향과 같아야 한다.
//   ② 전환 동안만 <html> 에 스코프 마커를 켠다. index.css 가 그 마커 아래에서만 탭바·본문에
//      스냅샷 이름을 주므로, 이름은 '전환이 도는 그 순간'에만 존재한다.
//      ⚠ 상시 name 을 주면 화면을 떠날 때 old-only 스냅샷이 전환 내내 얼어붙는 잔상이 된다
//        (커뮤니티 서브탭에서 실측된 함정 — VenuePage 주석 참조).
//   ③ 커밋은 flushSync — 스냅샷 뒤에서 동기적으로 끝나야 중간 상태가 화면에 새지 않는다.
//   ④ 마커 해제는 전환 duration(--dur-panel .26s)보다 넉넉히 뒤 — new 캡처가 끝난 다음이어야 한다.
import { flushSync } from 'react-dom';
import { withViewTransition } from './viewTransition';

/** 마커 해제 시점 — --dur-panel(.26s) + 캡처 여유. venue-tab·rank-tab 이 쓰던 값 그대로. */
const CLEAR_MS = 450;

/**
 * 하위 탭 하나를 방향성 푸시로 전환한다.
 *
 * @param scope index.css 의 `html[data-vt-scope='...']` 규칙 이름(화면마다 고유해야 한다 —
 *              두 화면이 동시에 DOM 에 있을 때 같은 view-transition-name 이 겹치면 전환이 통째로 실패한다)
 * @param order 탭의 진열 순서. 여기서 forward/back 을 뽑는다.
 * @param from  현재 탭
 * @param to    누른 탭
 * @param commit 상태 갱신(여러 개여도 된다 — 한 커밋으로 묶인다)
 */
export function goSubTab<T extends string>(
  scope: string,
  order: readonly T[],
  from: T,
  to: T,
  commit: () => void,
): void {
  if (from === to) return;                       // 같은 탭 재탭 — 무의미한 스냅샷 방지
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  document.documentElement.dataset.vtScope = scope;
  withViewTransition(
    () => { flushSync(commit); },
    commit,                                      // 미지원·모션축소 — 즉시 전환(기존 동작 그대로)
    b >= a ? 'forward' : 'back',
  );
  window.setTimeout(() => {
    if (document.documentElement.dataset.vtScope === scope) delete document.documentElement.dataset.vtScope;
  }, CLEAR_MS);
}
