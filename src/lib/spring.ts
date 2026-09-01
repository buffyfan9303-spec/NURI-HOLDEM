// src/lib/spring.ts — 라이브러리 없는 Apple 스프링 (모션 헌법 v2 §3).
//
// 왜 직접 쓰나: JS 예산 여유가 2% 라 `motion`(≈18KB gz) 을 넣을 자리가 없다. 그런데 Apple 모션의 본질은
// 라이브러리가 아니라 세 가지다 — ① 손을 뗀 속도를 이어받는다 ② 운동량을 투영해 착지점을 정한다
// ③ 언제든 잡아 되돌릴 수 있다. 감쇠 스프링의 폐형식 해를 60점 샘플해 CSS `linear()` 이징으로 넘기면
// WAAPI 가 컴포지터에서 돌린다(메인 스레드가 바빠도 프레임이 안 떨어진다).
//
// Apple 이 쓰는 두 파라미터(WWDC 2018 'Designing Fluid Interfaces'):
//   damping(감쇠비)  1.0 = 오버슈트 없음(기본)  ·  0.8 = 살짝 바운스(손짓에 운동량이 실렸을 때만)
//   response(응답)   목표까지 대략 도달하는 시간(초). 0.3~0.4 가 UI 표준. duration 이 아니다.

export interface SpringOpts {
  /** 감쇠비 — 1.0 임계감쇠(기본) · <1 오버슈트 */
  damping?: number;
  /** 응답 시간(초) — Apple 'response'. 낮을수록 빠릿 */
  response?: number;
  /** 초기 속도 — 이동 거리(px) 기준의 px/s. 손을 뗀 순간의 속도를 그대로 넘긴다 */
  velocity?: number;
}

/** 폐형식 감쇠 스프링 — x(t) 는 0→1 정규화 진행값. 반환은 CSS linear() 문자열 + 정착 시간(ms). */
export function springEasing(distancePx: number, { damping = 1, response = 0.35, velocity = 0 }: SpringOpts = {}): { easing: string; duration: number } {
  // 정규화: 진행 1 = distance. 속도도 거리 기준으로 정규화(distance 가 0 이면 속도 의미 없음).
  const d = Math.abs(distancePx) || 1;
  const v0 = -(velocity / d);            // 진행 좌표계에서의 초기 속도(부호: 목표 반대 방향이 음)
  const w0 = (2 * Math.PI) / response;   // 고유 각진동수 — response 로부터
  const zeta = Math.min(1, Math.max(0.05, damping));
  // 정착 시간: 진폭이 0.1% 아래로 — ln(1000)/(zeta·w0). 상한 1.2s(UI 는 그 이상 기다리지 않는다)
  const settle = Math.min(1.2, Math.max(0.12, Math.log(1000) / (zeta * w0)));
  const N = 60;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * settle;
    // 변위 y(t) = 1 - x(t), 초기 y(0)=1, y'(0)=v0·(-1)… 부호 정리: y 는 '남은 거리'
    let y: number;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const A = 1;
      const B = (zeta * w0 * A + v0) / wd;
      y = Math.exp(-zeta * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
    } else {
      // 임계감쇠: y = (A + B t) e^{-w0 t}
      const A = 1;
      const B = v0 + w0 * A;
      y = (A + B * t) * Math.exp(-w0 * t);
    }
    const x = 1 - y;
    pts.push(`${x.toFixed(4)} ${((i / N) * 100).toFixed(1)}%`);
  }
  return { easing: `linear(${pts.join(', ')})`, duration: Math.round(settle * 1000) };
}

/** Apple 의 운동량 투영 — 이 속도로 놓으면 어디까지 미끄러지는가(px). decelerationRate 0.998 = 일반 스크롤 감각 */
export function project(velocityPxPerSec: number, decelerationRate = 0.998): number {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** 고무줄 — 경계 너머로 끌수록 덜 따라온다(Apple §9). dimension = 그 축의 요소 크기 */
export function rubberband(overshootPx: number, dimension: number, constant = 0.55): number {
  return (overshootPx * dimension * constant) / (dimension + constant * Math.abs(overshootPx));
}

/** 지금 화면에 그려진 translateY(px) — 중단 가능성의 핵심: 목표값이 아니라 **보이는 값**에서 다시 시작한다 */
export function presentationY(el: HTMLElement): number {
  const m = getComputedStyle(el).transform;
  if (!m || m === 'none') return 0;
  const parts = m.match(/matrix\(([^)]+)\)/)?.[1]?.split(',').map(Number);
  if (parts && parts.length === 6) return parts[5];
  const p3 = m.match(/matrix3d\(([^)]+)\)/)?.[1]?.split(',').map(Number);
  return p3 && p3.length === 16 ? p3[13] : 0;
}

/** 손 뗀 속도(px/s) — 최근 ~100ms 창의 샘플로 구한다. 마지막 두 점만 쓰면 떨린다 */
export interface VelSample { t: number; y: number }
export function releaseVelocity(samples: VelSample[], windowMs = 100): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let i = samples.length - 2;
  while (i > 0 && last.t - samples[i].t < windowMs) i--;
  const first = samples[i];
  const dt = last.t - first.t;
  return dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0;
}

/**
 * 요소를 translateY(from) → translateY(to) 로 스프링 이동. 진행 중인 WAAPI 애니는 취소하고
 * **현재 보이는 값**에서 시작한다(중단 가능). reduced-motion 이면 즉시 도착.
 * 반환 Promise 는 정착(finish) 시 resolve — 취소되면 resolve 하지 않는다(다음 제스처가 이어받는다).
 */
export function springTo(el: HTMLElement, toPx: number, opts: SpringOpts = {}): Promise<void> {
  for (const a of el.getAnimations()) a.cancel();
  const from = presentationY(el);
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || Math.abs(toPx - from) < 0.5) {
    el.style.transform = toPx === 0 ? '' : `translateY(${toPx}px)`;
    return Promise.resolve();
  }
  const { easing, duration } = springEasing(toPx - from, opts);
  const anim = el.animate(
    [{ transform: `translateY(${from}px)` }, { transform: `translateY(${toPx}px)` }],
    { duration, easing, fill: 'forwards' },
  );
  return new Promise<void>((resolve) => {
    anim.addEventListener('finish', () => {
      // fill:forwards 를 유지하면 이후 인라인 transform 변경이 먹지 않는다 — 스타일로 확정하고 애니는 지운다.
      el.style.transform = toPx === 0 ? '' : `translateY(${toPx}px)`;
      anim.cancel();
      resolve();
    }, { once: true });
  });
}
