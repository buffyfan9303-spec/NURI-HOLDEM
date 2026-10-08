// M06(2026-10-08) — 카드 슬롯 '내려앉기' 연출의 회귀 계약.
//   지키는 것: ① 손으로 고른 순간에만 재생(복원·재계산·폴링·빼기로 당겨진 카드는 재생 금지)
//             ② prefers-reduced-motion 이면 0  ③ transform·opacity 만(레이아웃 불변)  ④ 손가락 반응을 늦추지 않는 길이
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEAL_FRESH_MS, DEAL_KEYFRAMES, DEAL_TIMING, dealPlays } from './HandBoardPicker';

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
