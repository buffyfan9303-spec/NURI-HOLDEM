// [DS] MO-9A — 스크롤 리스너 단일화.
// window scroll 을 rAF 로 프레임당 1회만 읽고 구독자 전원에게 브로드캐스트한다.
// 컴포넌트가 각자 리스너를 달면 이벤트당 scrollY 강제 읽기·핸들러 호출이 구독자 수만큼
// 반복된다(헤더 축소의 rAF 가드 패턴을 전역 하나로 일반화). 구독 시 현재 값으로 1회 동기화.
import { useEffect } from 'react';

type Sub = (y: number) => void;
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
  subs.forEach((f) => f(y));
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
    cb(readScrollYOncePerTask()); // 마운트 직후 1회 동기화(리스너들이 각자 하던 초기 호출을 대체)
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
