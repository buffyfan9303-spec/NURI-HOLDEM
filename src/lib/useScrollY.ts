// [DS] MO-9A — 스크롤 리스너 단일화.
// window scroll 을 rAF 로 프레임당 1회만 읽고 구독자 전원에게 브로드캐스트한다.
// 컴포넌트가 각자 리스너를 달면 이벤트당 scrollY 강제 읽기·핸들러 호출이 구독자 수만큼
// 반복된다(헤더 축소의 rAF 가드 패턴을 전역 하나로 일반화). 구독 시 현재 값으로 1회 동기화.
import { useEffect } from 'react';

/** 🔴 2026-09-20 — 두 번째 인자는 **이 값을 앱이 직접 보냈는가**(`notifyScrollNow`)이다.
 *
 *  왜 필요한가: 구독자가 "브라우저가 만든 스크롤"과 "앱이 옮긴 스크롤"을 구별할 방법이 없었다.
 *  실기기(주소창 개폐)에서는 앱이 `scrollTo(0)` 한 **직후에도** 브라우저가 툴바를 여닫으며 진짜
 *  scroll 이벤트를 만든다. 헤더가 그것을 사용자의 스크롤로 읽어 한 프레임 접혔다 폈다(오너 제보).
 *  `isProgrammaticScroll()` 만으로는 못 가른다 — 그 창 안에는 두 종류가 **섞여서** 들어온다. */
type Sub = (y: number, fromApp: boolean) => void;
const subs = new Set<Sub>();
let raf = 0;
let attached = false;

// ── 강제 동기 레이아웃 제거(2026-08-29 실측) ────────────────────────────────
// rAF 콜백은 브라우저의 '스타일·레이아웃 갱신 **직전**' 단계다. 그 시점에 window.scrollY 를
// 읽으면 직전 프레임의 DOM 변경이 남아 있는 한 문서 전체 레이아웃이 그 자리에서 강제된다.
// 계측(프로덕션 빌드 · 모바일 375 CPU 4x · 일정탐색 250건 스크롤 24프레임):
//   스크롤 구간 강제 레이아웃 43.6ms 중 **41.5ms(95%)가 이 한 줄**이었다(PC 1440 은 0.4ms).
// 대신 scroll 이벤트가 도착하는 순간 — 브라우저가 스크롤 오프셋을 막 확정한 직후, 즉
// 레이아웃이 이미 유효한 시점 — 에 값을 담아 둔다. 같은 프레임의 마지막 scroll 이벤트 값은
// rAF 에서 읽었을 값과 같으므로 **구독자가 받는 수치는 이전과 동일**하다(요청·연출 불변).
let lastY = 0;
let haveLastY = false;

const flush = () => {
  raf = 0;
  const y = haveLastY ? lastY : window.scrollY;
  subs.forEach((f) => f(y, false));
};
const onScroll = () => {
  lastY = window.scrollY;
  haveLastY = true;
  if (!raf) raf = requestAnimationFrame(flush);
};

// 구독 직후 1회 동기화도 구독자 수만큼 window.scrollY 를 읽어 강제 레이아웃을 반복했다
// (실측: 콜드 마운트 모바일 11.8ms / PC 6.0ms — 구독자 2명 × 1회). 값은 어차피 같은 순간의
// 같은 수치이므로 **같은 태스크 안에서는 한 번만** 읽고 공유한다(마이크로태스크로 무효화 —
// 태스크가 끝나면 캐시는 사라지므로 다음 구독은 항상 실시간 값을 읽는다).
let syncY = 0;
let syncFresh = false;
function readScrollYOncePerTask(): number {
  if (syncFresh) return syncY;
  syncY = window.scrollY;
  syncFresh = true;
  queueMicrotask(() => { syncFresh = false; });
  return syncY;
}

/** cb 는 프레임당 최대 1회, 최신 scrollY 로 호출된다. 불안정 참조면 재구독만 될 뿐 안전. */
export function useScrollY(cb: Sub) {
  useEffect(() => {
    subs.add(cb);
    if (!attached) {
      attached = true;
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    cb(readScrollYOncePerTask(), false); // 마운트 직후 1회 동기화(리스너들이 각자 하던 초기 호출을 대체)
    return () => {
      subs.delete(cb);
      if (subs.size === 0 && attached) {
        attached = false;
        window.removeEventListener('scroll', onScroll);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        haveLastY = false; // 리스너가 없는 동안의 스크롤은 못 봤으므로 캐시를 버린다
      }
    };
  }, [cb]);
}

/** 프로그램이 옮긴 스크롤 창 — 탭·섹션 복원처럼 **손짓이 아닌** 스크롤을 구독자에게 알린다.
 *
 *  왜 필요한가: window.scrollTo 는 구독자에게 |dy| 수백 px 짜리 스크롤 이벤트 한 발로 도착한다.
 *  하단 탭바 자동숨김은 그것을 '사용자가 확 긁었다'로 읽어 즉시 숨기거나 띄운다 — 커뮤니티 하위탭을
 *  옮길 때마다 탭바가 깜빡인 원인이 정확히 이것이었다(2026-09-05 실측).
 *  이동량 크기로 추정하지 않고 **옮긴 쪽이 직접 알린다** — 크기 추정은 빠른 플링을 함께 삼킨다.
 */
let progUntil = 0;
export function markProgrammaticScroll(ms = 300) { progUntil = performance.now() + ms; }
export function isProgrammaticScroll() { return performance.now() < progUntil; }

/** 🔴 H1(2026-09-20) — 프로그램 스크롤 **직후 현재 Y 를 구독자 전원에게 즉시** 알린다.
 *
 *  무엇이 문제였나(390×844 실측): 스크롤된 대메뉴에서 다른 대메뉴로 가면 헤더가 한 프레임
 *  **눌렸다 펴졌다**. `App.tsx` 의 탭 커밋 `useLayoutEffect` 가 `scrollTo(0)` 을 즉시 부르는데,
 *  헤더의 `shrunk` 는 이 파일의 **다음 rAF 방송**을 기다린다. 전환 직전 `scrollY≈387`·헤더 47.75px
 *  였다가, 첫 새 화면 rAF 에서도 `scrollY=0` 인데 높이가 **47.75px 로 남고** 다음 rAF 에 60.5px 가 됐다.
 *
 *  왜 여기인가: 헤더 쪽에서 `setShrunk(false)` 만 부르면 **이미 예약된 옛 rAF** 가 뒤따라 도착해
 *  다시 접을 수 있다. 그 예약을 취소할 수 있는 곳은 이 공용 경계 하나뿐이다.
 *  같은 값을 하단 탭바·ScrollTop·검색 바 구독자도 함께 보게 되는 것도 이 자리라서 가능하다.
 *
 *  ⚠ 새 리스너·타이머·별도 상태를 만들지 않는다 — 기존 `subs`/`raf`/`lastY`/`haveLastY` 를 그대로 쓴다.
 */
export function notifyScrollNow(y: number = window.scrollY) {
  lastY = y;
  haveLastY = true;
  // 예약된 옛 rAF 가 **옛 Y** 로 뒤늦게 방송하는 것을 막는다(이게 재발의 통로였다).
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  subs.forEach((f) => f(y, true));
}
