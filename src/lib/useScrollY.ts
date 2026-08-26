// [DS] MO-9A — 스크롤 리스너 단일화.
// window scroll 을 rAF 로 프레임당 1회만 읽고 구독자 전원에게 브로드캐스트한다.
// 컴포넌트가 각자 리스너를 달면 이벤트당 scrollY 강제 읽기·핸들러 호출이 구독자 수만큼
// 반복된다(헤더 축소의 rAF 가드 패턴을 전역 하나로 일반화). 구독 시 현재 값으로 1회 동기화.
import { useEffect } from 'react';

type Sub = (y: number) => void;
const subs = new Set<Sub>();
let raf = 0;
let attached = false;

const flush = () => {
  raf = 0;
  const y = window.scrollY;
  subs.forEach((f) => f(y));
};
const onScroll = () => { if (!raf) raf = requestAnimationFrame(flush); };

/** cb 는 프레임당 최대 1회, 최신 scrollY 로 호출된다. 불안정 참조면 재구독만 될 뿐 안전. */
export function useScrollY(cb: Sub) {
  useEffect(() => {
    subs.add(cb);
    if (!attached) {
      attached = true;
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    cb(window.scrollY); // 마운트 직후 1회 동기화(리스너들이 각자 하던 초기 호출을 대체)
    return () => {
      subs.delete(cb);
      if (subs.size === 0 && attached) {
        attached = false;
        window.removeEventListener('scroll', onScroll);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      }
    };
  }, [cb]);
}
