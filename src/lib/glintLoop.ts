/**
 * 장식 빛(헤더 로고 글린트 · NURI SPOT 카드 빛줄기)의 주기 반복 시계.
 *
 * 2026-10-09 오너: "모션그래픽 넣은 부분들 처음에 한번 나오고 안나와서 내가 인지를 못하는 것 같아 이거 계속 반복되게 해야될 것 같아".
 * → 첫 표시 한 번(세션당 1회)이던 빛을 `period` 마다 다시 지나가게 한다. 빛 자체는 SVG 그라디언트의 이동(로고 SMIL · 카드 rAF)이라
 *   레이아웃·transform·opacity 를 건드리지 않는다(합성층 승격/해제가 삼성에서 밝기 점프로 보인 기록 — 그래서 transform 을 쓰지 않는다).
 *
 * 언제 멈추나(멈춘 회차는 되살리지 않고, 풀리면 새 주기부터 — 반쯤 지난 빛을 이어 그리지 않는다):
 *   · 문서가 숨었을 때(visibilitychange) · 대상이 화면 밖이거나 display:none 일 때(IntersectionObserver — 숨은 탭 판·PC/모바일 중 숨은 헤더 인스턴스)
 *   · prefers-reduced-motion: reduce 일 때(도중에 켜져도 즉시)
 *   → 셋이 모두 풀리면 `first` 뒤에 다시 시작하고 그 뒤로 `period` 마다.
 *   · 사용자가 누르거나(pointerdown) 손가락으로 끌거나(touchmove) 휠·키를 쓸 때 — 지나가던 빛은 그 자리에서 거두고(입력 양보 — PR #239 press-align ①),
 *     마지막 입력 뒤 QUIET 안에 돌아온 주기는 건너뛴다(다음 주기에 다시).
 *
 * 빛을 '거둔다' = endElement(). 로고(SMIL)는 fill="remove" 라, 카드(rAF 재생기)는 직접 기본값(상자 밖 대기 위치)으로 돌려놓는다 — 노드를 지우지 않는다.
 */
export interface GlintLoopTiming {
  /** 시작(또는 멈춤이 풀린 뒤) 첫 회차까지(ms) */
  first: number;
  /** 회차 간격(ms) — 시작 시각 기준 */
  period: number;
  /** 한 회차 길이(ms) — 이 시간 동안 '지나가는 중' 으로 본다 */
  dur: number;
}

/** 마지막 입력 뒤 이만큼은 새 회차를 시작하지 않는다(ms). 손을 뗀 뒤 스크롤 관성 꼬리(≈1s)보다 조금 길게. */
export const GLINT_QUIET_MS = 1500;

// 사용자 입력만 센다. ⚠ 'scroll' 은 넣지 않는다 — 홈 첫 화면에서 가로 레일(DIV)이 스스로 scrollLeft 를 맞추며 로드 ≈1.1s 에
//   scroll 을 두 번 쏴서, 막 시작한 첫 회차를 74ms 만에 거두고 있었다(2026-10-09 e2e 실측). 손가락 스크롤은 pointerdown·touchmove 가,
//   손을 뗀 뒤 관성(≈1s)은 QUIET 가, PC 는 wheel·keydown(화살표·스페이스) 이 잡는다.
const INPUTS = ['pointerdown', 'touchmove', 'wheel', 'keydown'] as const;

/** 한 회차를 시작·거두는 것 — SMIL 요소(SVGAnimationElement) 그대로이거나, 같은 두 메서드를 가진 재생기(SpotHeroSheen 의 rAF 30fps). */
export type GlintPlayer = Pick<SVGAnimationElement, 'beginElement' | 'endElement'>;

/**
 * `host` 가 보이는 동안 `anim` 을 주기적으로 beginElement 한다. `prep` 은 매 회차 직전에 부른다(테마·폭이 바뀌었을 수 있다).
 * 반환값은 정리 함수(effect cleanup).
 */
export function startGlintLoop(host: Element, anim: GlintPlayer, t: GlintLoopTiming, prep?: () => void): () => void {
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let inView = false;
  let lastInput = -Infinity;
  let running = false;
  let tick: ReturnType<typeof setTimeout> | undefined;
  let done: ReturnType<typeof setTimeout> | undefined;

  const halt = () => {
    clearTimeout(done);
    if (!running) return;
    running = false;
    try { anim.endElement(); } catch { /* 이미 끝남 */ }
  };
  const fire = () => {
    tick = setTimeout(fire, t.period);
    if (performance.now() - lastInput < GLINT_QUIET_MS) return; // 입력 중 — 이번 회차는 건너뛴다
    try {
      prep?.();
      anim.beginElement();
    } catch { return; }
    running = true;
    done = setTimeout(() => { running = false; }, t.dur + 50);
  };
  const sync = () => {
    const live = inView && document.visibilityState === 'visible' && !mq?.matches;
    if (!live) {
      halt();
      clearTimeout(tick);
      tick = undefined;
    } else if (tick === undefined) {
      tick = setTimeout(fire, t.first);
    }
  };
  const onInput = () => { lastInput = performance.now(); halt(); };

  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; sync(); })
    : null;
  if (io) io.observe(host);
  else { inView = true; sync(); }
  document.addEventListener('visibilitychange', sync);
  mq?.addEventListener?.('change', sync);
  for (const type of INPUTS) window.addEventListener(type, onInput, { capture: true, passive: true });

  return () => {
    io?.disconnect();
    halt();
    clearTimeout(tick);
    document.removeEventListener('visibilitychange', sync);
    mq?.removeEventListener?.('change', sync);
    for (const type of INPUTS) window.removeEventListener(type, onInput, { capture: true });
  };
}
