// 홈 배너(PosterCarousel) 자동 넘김의 순수 부분 — 컴포넌트 파일이 함수를 내보내면 fast-refresh 규칙(react-refresh)에 걸려 분리했다.

/** 자동 넘김 간격(오너 2026-10-10: 5000ms). */
export const AUTO_ADVANCE_MS = 5000;

/**
 * 자동 넘김이 돌아도 되는 때 — 2장 이상, 탭이 보이고, 배너가 화면 안이고, 사용자가 읽고·만지고 있지 않고(held), 일시정지를 누르지 않았을 때만.
 * held 는 잠깐(올림·포커스·터치), paused 는 사용자가 다시 누를 때까지 **계속**(WCAG 2.2.2 — 5초 넘게 자동으로 바뀌는 내용은 멈춤 수단이 있어야 한다).
 */
export function autoAdvanceActive(s: { count: number; docHidden: boolean; inView: boolean; held: boolean; paused?: boolean }): boolean {
  return s.count > 1 && !s.docHidden && s.inView && !s.held && !s.paused;
}

/** setInterval 한 개를 감싼 타이머 — start() 는 항상 5초를 처음부터 센다(재시작), stop() 은 정리. */
export function createAutoAdvance(step: () => void, ms: number = AUTO_ADVANCE_MS) {
  let id: ReturnType<typeof setInterval> | undefined;
  const stop = () => { if (id !== undefined) { clearInterval(id); id = undefined; } };
  return { start() { stop(); id = setInterval(step, ms); }, stop, running: () => id !== undefined };
}

/**
 * 읽는 중 표식들(마우스 올림 · 키보드 포커스 · 터치) — 여러 개가 동시에 설 수 있고, **전부 내려야** 풀린다.
 * · 터치는 '손가락 수'로 센다: 두 손가락 중 하나만 떼도 아직 만지는 중이다(이전엔 touchend 한 번에 풀려 만지는 동안 넘어갔다).
 * · clear() 는 타이머 정리(탭 숨김·장 수 변화로 리스너가 걷힐 때)에서 부른다 — 포커스 버튼이 DOM 에서 사라지면 focusout 이 안 와서
 *   표식이 영영 서 있었다(그 뒤 마우스가 안 들어오면 자동 넘김이 다시는 안 돌았다).
 */
export function createHolds(onChange: (held: boolean) => void) {
  const on = { hover: false, focus: false };
  let touches = 0;
  let last = false;
  const emit = () => { const h = on.hover || on.focus || touches > 0; if (h !== last) { last = h; onChange(h); } };
  return {
    set(k: 'hover' | 'focus', v: boolean) { on[k] = v; emit(); },
    /** 지금 닿아 있는 손가락 수(TouchEvent.touches.length). */
    touches(n: number) { touches = Math.max(0, n); emit(); },
    clear() { on.hover = false; on.focus = false; touches = 0; emit(); },
    held: () => last,
  };
}
