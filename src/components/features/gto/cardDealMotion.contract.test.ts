// M06(2026-10-08) — 카드 슬롯 '내려앉기' 연출의 회귀 계약.
//   지키는 것: ① 손으로 고른 순간에만 재생(복원·재계산·폴링·빼기로 당겨진 카드는 재생 금지)
//             ② prefers-reduced-motion 이면 0  ③ transform·opacity 만(레이아웃 불변)  ④ 손가락 반응을 늦추지 않는 길이
//
// 2026-10-08 보강(독립 검증 지적): 순수 함수만 보면 effect 배선을 되돌려도 초록이었다.
//   → React 훅을 모킹하고 컴포넌트를 **손으로 렌더**해 실제 effect 를 돌린다(환경이 node 라 DOM 이 없다).
//     onPick → 다시 그리기 → 슬롯별 effect → el.animate 호출 수·대상·취소까지 본다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from './gto.types';
import type { UseHandBoard } from './useHandBoard';

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  si: 0,
  el: null as unknown,
  effects: [] as (() => void | (() => void))[],
}));
vi.mock('react', async (orig) => {
  const R = await orig<typeof import('react')>();
  const useState = (init: unknown) => {
    const i = h.si++;
    if (!(i in h.states)) h.states[i] = init;
    return [h.states[i], (v: unknown) => { h.states[i] = v; }];
  };
  const useRef = () => ({ current: h.el });
  const useEffect = (fn: () => void | (() => void)) => { h.effects.push(fn); };
  const over = { useState, useRef, useEffect } as unknown as Partial<typeof R>;
  return { ...R, ...over, default: { ...R, ...over } };
});

const { default: HandBoardPicker, DEAL_FRESH_MS, DEAL_KEYFRAMES, DEAL_TIMING, dealPlays } = await import('./HandBoardPicker');

const SRC = readFileSync(resolve(__dirname, 'HandBoardPicker.tsx'), 'utf8');

describe('카드 슬롯 내려앉기(M06)', () => {
  it('방금 고른 카드만 재생한다 — 기록 없음·오래된 기록(빼기로 당겨진 카드)·움직임 줄이기는 0', () => {
    expect(dealPlays({ at: 1000 }, 1004, false)).toBe(true);
    expect(dealPlays(null, 1004, false)).toBe(false);                          // 복원·재계산: 기록 자체가 없다
    expect(dealPlays({ at: 1000 }, 1000 + DEAL_FRESH_MS + 1, false)).toBe(false); // 나중에 다른 슬롯으로 당겨짐
    expect(dealPlays({ at: 1000 }, 1004, true)).toBe(false);                   // prefers-reduced-motion
  });

  it('기록은 그리드 onPick 에서만 쓴다 — 저장 복원(hb.load)·효과(useEffect)에서 setDealt 를 부르지 않는다', () => {
    const calls = SRC.match(/setDealt\(/g) ?? [];
    expect(calls.length, 'setDealt 호출이 pick 밖에 생겼다').toBe(1);
    expect(SRC).toMatch(/const pick = \(c: Card\) => \{ setDealt\(\{ id: cardId\(c\), at: performance\.now\(\) \}\); hb\.place\(c\); \};/);
    expect(SRC).toContain('onPick={pick}');
  });

  it('transform·opacity 만 움직이고 끝나면 남기지 않는다(fill 없음) · 180ms 안팎', () => {
    const props = new Set(DEAL_KEYFRAMES.flatMap((k) => Object.keys(k)));
    expect([...props].sort()).toEqual(['opacity', 'transform']);
    expect(DEAL_KEYFRAMES[DEAL_KEYFRAMES.length - 1]).toEqual({ transform: 'none', opacity: 1 });
    expect(DEAL_TIMING.fill ?? 'none').toBe('none');
    expect(Number(DEAL_TIMING.duration)).toBeGreaterThanOrEqual(120);
    expect(Number(DEAL_TIMING.duration)).toBeLessThanOrEqual(220);
  });

  it('언마운트·카드 제거 때 진행 중인 애니를 취소한다', () => {
    expect(SRC).toMatch(/return \(\) => anim\.cancel\(\);/);
  });
});

// ── 배선: 실제 컴포넌트를 손으로 렌더해 effect 를 돌린다 ────────────────────────────
const C = (id: string): Card => ({ rank: id[0], suit: id[1] } as Card);

function fakeHb(hero: (Card | null)[]): UseHandBoard {
  const hb = {
    hero, villain: [null, null], board: [null, null, null, null, null], extra: [],
    target: 'hero', usedIds: new Set<string>(),
    place: (c: Card) => { const j = hb.hero.indexOf(null); if (j >= 0) hb.hero[j] = c; },
    removeAt: () => {}, setTarget: () => {}, clear: () => {},
  };
  return hb as unknown as UseHandBoard;
}

function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach((n) => elements(n, out)); return out; }
  if (!isValidElement(node)) return out;
  out.push(node);
  elements((node.props as { children?: ReactNode }).children, out);
  return out;
}
const fnEls = (node: ReactNode, key: string) =>
  elements(node).filter((e) => typeof e.type === 'function' && key in (e.props as object)) as ReactElement<Record<string, unknown>>[];

type Slot = { card: Card | null; animate: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; cleanups: (() => void)[] };

/** HandBoardPicker → Slots → CardSlot 를 그리고 슬롯마다 effect 를 돌린다. */
function render(hb: UseHandBoard): { slots: Slot[]; onPick: (c: Card) => void } {
  h.si = 0;
  const top = (HandBoardPicker as (p: object) => ReactNode)({ hb });
  const onPick = fnEls(top, 'onPick')[0].props.onPick as (c: Card) => void;
  const slots: Slot[] = [];
  for (const s of fnEls(top, 'target')) {
    const inner = (s.type as (p: object) => ReactNode)(s.props);
    for (const cs of fnEls(inner, 'card')) {
      const cancel = vi.fn();
      const animate = vi.fn(() => ({ cancel }));
      h.el = { animate };
      h.effects = [];
      (cs.type as (p: object) => ReactNode)(cs.props);
      const cleanups = h.effects.map((f) => f()).filter((c): c is () => void => typeof c === 'function');
      slots.push({ card: cs.props.card as Card | null, animate, cancel, cleanups });
    }
  }
  return { slots, onPick };
}
const played = (slots: Slot[]) => slots.filter((s) => s.animate.mock.calls.length > 0);

describe('카드 슬롯 내려앉기(M06) — 렌더 배선', () => {
  let now = 1000;
  beforeEach(() => {
    h.states = []; h.si = 0; h.el = null; h.effects = [];
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('복원(카드가 이미 있음)만으로는 재생하지 않는다', () => {
    const { slots } = render(fakeHb([C('As'), null]));
    expect(slots.length).toBeGreaterThan(5);
    expect(played(slots)).toEqual([]);
  });

  it('고른 카드가 놓인 슬롯 **한 칸만** 재생하고, 정리 함수가 애니를 취소한다', () => {
    const hb = fakeHb([C('As'), null]);
    render(hb).onPick(C('Kh'));
    now += 4;
    const { slots } = render(hb);
    const p = played(slots);
    expect(p.length, '이미 놓여 있던 As 슬롯까지 재생됐다(카드 id 일치 조건 빠짐)').toBe(1);
    expect(p[0].card).toEqual(C('Kh'));
    expect(p[0].animate).toHaveBeenCalledWith(DEAL_KEYFRAMES, DEAL_TIMING);
    p[0].cleanups.forEach((c) => c());
    expect(p[0].cancel).toHaveBeenCalledTimes(1);
  });

  it('고른 지 오래된 기록(빼기로 당겨짐·재방문)은 재생하지 않는다', () => {
    const hb = fakeHb([null, null]);
    render(hb).onPick(C('Kh'));
    now += DEAL_FRESH_MS + 50;
    expect(played(render(hb).slots)).toEqual([]);
  });

  it('prefers-reduced-motion 이면 고른 순간에도 0', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    const hb = fakeHb([null, null]);
    render(hb).onPick(C('Kh'));
    now += 4;
    expect(played(render(hb).slots)).toEqual([]);
  });
});
