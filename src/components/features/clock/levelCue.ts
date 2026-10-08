// src/components/features/clock/levelCue.ts
// M07 — 클락 레벨이 바뀌는 순간 한 번만 "LEVEL n"·CURRENT 블라인드 뒤에 빛이 번졌다 사라진다.
//
// 왜 이렇게 만들었나
//   · TV 는 먼 거리에서 본다. 레벨이 넘어간 걸 놓치면 다음 블라인드를 모른 채 한 판을 더 친다 — 경계에서 **한 번** 시선을 끈다.
//   · 숫자 자체는 건드리지 않는다(굴림·확대 금지). 글자 뒤 작은 빛 판(absolute, 레이아웃 0)의 **opacity 만** WAAPI 로 움직인다 —
//     합성 단계만 일하고, 끝나면 애니메이션 객체가 사라져 상시 루프·RAF 가 남지 않는다.
//   · 같은 1초 틱(lib/clockTick)으로 LevelLine·BlindsRow 가 같은 실효 레벨을 읽으므로 두 빛은 같은 틱에 켜진다(같은 기준 시각).
//   · 첫 마운트·게임 전환·부팅 직후 첫 상태 수신은 '레벨이 넘어간 것'이 아니다 → 재생하지 않는다.
//   · prefers-reduced-motion 이면 0. 빠르게 두 번 넘기면(리모컨 연타) 현재 밝기에서 이어 받아 튀지 않는다.
import { useEffect, useRef } from 'react';

/** 마운트 직후 이 시간 안의 변화는 부팅 수신(빈 상태 → 실제 상태)로 본다. */
export const LEVEL_CUE_BOOT_MS = 1200;
/** 빛 한 번의 길이 — 오르막 짧게(22%), 내리막 길게. 출발이 빠르고 끝이 부드럽다. */
export const LEVEL_CUE_MS = 640;

/** 레벨 신호 키 — 게임 단위(venue:game) + 실효 레벨 인덱스. */
export function levelCueKey(venueId: string, gameSeq: number, index: number): string {
  return `${venueId}:${gameSeq}|${index}`;
}

/** 빛을 켤지 순수 판정 — 같은 게임에서 레벨 인덱스만 바뀌었고, 부팅 직후가 아니고, 감속 모션 설정이 아닐 때만. */
export function shouldPlayLevelCue(prevKey: string, nextKey: string, sinceMountMs: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  if (prevKey === nextKey) return false;
  if (sinceMountMs < LEVEL_CUE_BOOT_MS) return false;
  const game = (k: string) => k.slice(0, k.lastIndexOf('|'));
  return game(prevKey) === game(nextKey);
}

function prefersReduced(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 빛 판(span)에 붙일 ref 를 돌려준다. 키가 바뀔 때만 opacity 0→1→0 을 한 번 재생한다. */
export function useLevelCue<T extends HTMLElement>(cueKey: string) {
  const ref = useRef<T>(null);
  const prevKey = useRef(cueKey);
  const mountedAt = useRef(0);
  const anim = useRef<Animation | null>(null);

  useEffect(() => {
    mountedAt.current = performance.now();
    return () => { anim.current?.cancel(); anim.current = null; };
  }, []);

  useEffect(() => {
    const prev = prevKey.current;
    prevKey.current = cueKey;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (!shouldPlayLevelCue(prev, cueKey, performance.now() - mountedAt.current, prefersReduced())) return;
    // 연타 — 진행 중인 빛의 현재 밝기에서 이어 받는다(0 으로 꺼졌다 다시 켜지는 튐 없음).
    const from = anim.current ? Number(getComputedStyle(el).opacity) || 0 : 0;
    anim.current?.cancel();
    // 구간별 곡선 — 오르막(≈140ms)은 빠른 감속, 내리막(≈500ms)은 부드러운 감속. 전체 easing 은 linear 로 둬 offset 이 시간 그대로다.
    const a = el.animate(
      [
        { opacity: from, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        { opacity: 1, offset: 0.22, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' },
        { opacity: 0 },
      ],
      { duration: LEVEL_CUE_MS },
    );
    anim.current = a;
    a.onfinish = () => { if (anim.current === a) anim.current = null; };
  }, [cueKey]);

  return ref;
}

/** 빛 판 스타일 — 글자색(currentColor)을 그대로 번지게 한다(브레이크=하늘, 레벨=accent). 평소 opacity 0.
 *  빛 판은 글자 상자(inset-0) 안에 있고 밖으로 번지는 부분은 box-shadow(잉크 넘침)라 scrollWidth·레이아웃에 잡히지 않는다. */
export const LEVEL_CUE_GLOW = {
  background: 'radial-gradient(closest-side, color-mix(in srgb, currentColor 30%, transparent), transparent)',
  boxShadow: '0 0 0.7em 0.2em color-mix(in srgb, currentColor 22%, transparent)',
} as const;
