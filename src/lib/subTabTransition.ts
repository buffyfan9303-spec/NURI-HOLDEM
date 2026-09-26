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
//   ④ 마커 해제는 **전환이 실제로 끝난 뒤(finished)** — withViewTransition 이 맡는다.
//      예전의 고정 450ms 타이머는 느린 기기에서 전환(캡처+커밋+.3s)보다 먼저 끝나 root 정지 규칙이
//      도중에 풀렸다 → 탭바 위쪽(헤더·내 등급)이 blur 로 밀렸다 돌아오는 증상(2026-09-05 CPU×8 실측).
// 되살릴 때 함께 푼다 ↓
// import { flushSync } from 'react-dom';
// import { withViewTransition } from './viewTransition';
//
// 🔵 2026-09-24 MOTION-UNIFY P1 — 본문 전환 연출은 VT 가 아니라 **메인 탭과 같은 덮개**(src/lib/tabCover.ts playSubTabCover)다.
//   오너: "하나를 부드럽게 바꾸면 나머지 모든 페이지에서도 동일하게." 25곳 호출부는 한 줄도 안 바뀐다 — 여기 한 줄이 전부 먹인다.
//   덮개는 판 위 지면색 한 장(opacity 1→0, 280ms, 판이 다 그려진 뒤)이라 위 1,300px 낙하(스냅샷 좌표계) 부류가 생기지 않는다.
//   판 윗변이 레일 밑으로 말려 올라가 있으면 덮개 아래에서 레일 바로 밑으로 맞춘다(스크롤 규칙, 커뮤니티 섹션 복원은 예외).
// 🔴 2026-09-26 PILL-FLASH — 그 덮개가 곧 '검정 판 → 콘텐츠' 깜빡임이었다(재방문에도 ~100ms 지면색 판, src/lib/tabCover.ts 5차).
//   덮개는 없앴고 P2 스크롤 규칙(alignSubTabPanel)만 남았다. 본문은 즉시 교체, 움직이는 것은 알약(SlidingPill)뿐 — 2026-09-18 결정으로 돌아간다.
// 🔵 2026-09-26 SUB-HANDOFF(오너 "메인 카테고리 이동 때의 부드러운 모션을 하위 탭에서도 동일한 모션으로") — 하위 탭도 **메인 탭과 같은 판 교체**
//   (src/lib/tabCover.ts 7차 절: 스왑 프레임 정적화 + 떠나는 판만 240ms 페이드 · 새 판 무효과 · 알약 FLIP 은 새 판 첫 프레임 뒤).
//   25곳 호출부는 한 줄도 안 바뀐다 — 아래 handOffSubPanel 한 줄이 전부 먹인다. 하위 탭 전환은 **이 함수로만** 한다(계약: transitionDevices).
import { alignSubTabPanel, handOffSubPanel } from './tabCover';

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
  /** 덮개가 덮을 판을 찾는 열쇠(src/lib/tabCover.ts SUB_PANEL). 두 화면이 동시에 DOM 에 있어도 누른 레일 옆 판을 고른다. */
  scope: string,
  _order: readonly T[],
  from: T,
  to: T,
  commit: () => void,
): void {
  if (from === to) return;                       // 같은 탭 재탭 — 무의미한 스냅샷 방지

  // 🔴 2026-09-18 — 하위 탭 본문에서 **View Transition 을 걷어냈다.** 본문은 즉시 교체하고,
  //   움직이는 것은 알약(SlidingPill 의 CSS FLIP)뿐이다.
  //
  //   왜: 오너가 같은 증상을 네 번 지적했다 — "화면 전체가 왔다 갔다", "알약이 위에서 요약 쪽으로
  //   뚝 떨어진다", "두드득 끊기는 것처럼 보인다", "책처럼 덮는다". 조각 패치를 네 번 했지만
  //   전부 증상만 덮었다. 원인은 **하나**였고 명세에 적혀 있다:
  //
  //     VT 스냅샷의 transform 은 **snapshot containing block(= 뷰포트) 원점 기준**이다.
  //     https://drafts.csswg.org/css-view-transitions-1/  §4.1·§7.3.1
  //     ("map element's border box from the snapshot containing block origin to its current visual position")
  //     열린 WG 이슈: https://github.com/w3c/csswg-drafts/issues/10197
  //
  //   하위 탭은 판마다 문서 높이가 크게 다르다(내 매장 3544px → 1023px). 짧은 판으로 가면
  //   브라우저가 scrollY 를 깎는데(클램프), 그 순간 old 스냅샷은 **옛 뷰포트 좌표**에 박혀 있어
  //   이름 붙은 요소가 그 차이만큼 날아간다.
  //   실측(PC 1280 · 매장 설정 스크롤 1500 → 게임 진행): scrollY 1500→23,
  //   알약 궤적 **(291, −1305) → (411, 172)** — 250ms 동안 1,300px 낙하. 3/3 재현.
  //
  //   왜 이 방법인가(바깥 조사·출처 확인):
  //     · Ant Design Tabs 의 기본값은 `{ inkBar: true, tabPane: false }` — **본문은 애니메이트하지 않는다**
  //       https://ant.design/components/tabs
  //     · Radix·MUI 탭도 인디케이터만 움직인다.
  //     · 이 저장소에도 이미 같은 방식이 5곳 있다(ViewModeToggle·LedgerStats·NuriPosLedger·GTO 3종) —
  //       그 화면들에는 이 증상 신고가 한 번도 없었다.
  //   기각한 대안: 캡처 전 scrollTo(낙하는 잡지만 페이지가 먼저 점프한다) · 스크롤 앵커링(판 교체에는
  //     앵커 자체가 사라진다) · min-height 예약(이 사례엔 2,477px 이 필요하다) ·
  //     React 19 ViewTransition·nested/scoped VT(같은 좌표계이거나 Chrome 전용).
  //
  //   실측 효과: 낙하 0 · 겹침 0 · 클릭 뒤 첫 프레임 정지 **PC 69~137 → 26~44ms**,
  //     모바일 111~144 → 63~94ms · 프레임 드랍 0.
  //   잃는 것: 하위 탭 본문의 ±18px 가로 푸시. 위 세 라이브러리가 기본으로 안 하는 연출이다.
  //
  //   ⚠ 되돌리려면 아래 `commit()` 을 지우고 그 밑 주석의 `withViewTransition(...)` 을 되살리면 된다.
  //     index.css 의 하위 탭 VT 규칙은 **지우지 않았다** — 마커가 안 켜지므로 잠자코 있을 뿐이다.
  //     되돌릴 필요가 없다고 정해지면 그때 규칙과 계약을 같이 정리한다(CSS 예산도 그만큼 는다).
  const target = (globalThis as { event?: Event }).event?.target ?? null;
  handOffSubPanel(scope, target); // 커밋 **전** — 떠나는 판을 이벤트 시점 자리 그대로 복제해 두고 스왑 정적화를 켠다(커밋 뒤 세운다)
  commit();
  // P2 스크롤 — 누른 요소(현재 이벤트의 target)로 레일과 판을 찾는다. 이벤트 밖에서 부르면 target 이 없어 판 스크롤 상자만 맞춘다.
  alignSubTabPanel(scope, target);
  // 되살리는 자리 ↓
  // const a = order.indexOf(from);
  // const b = order.indexOf(to);
  // withViewTransition(() => { flushSync(commit); }, commit, b >= a ? 'forward' : 'back', scope);
}
