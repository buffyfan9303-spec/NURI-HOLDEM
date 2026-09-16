// 푸시·폴드 차트 'BB 선택' 계약 — 데이터가 실제로 가진 깊이만 고르게 하고, 없는 조합은 정직하게 비운다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NASH_KS, NASH_STACKS, hasNashRange, nashRange, type NashKind } from './nash.data';

describe('nash.data — BB 깊이별 표 존재 계약', () => {
  it('shove·callBB 는 8자리 × 12깊이 × 앤티 온/오프 전부 표가 있고, 값이 전부 0 인 표는 없다', () => {
    for (const kind of ['shove', 'callBB'] as NashKind[]) for (const ante of [false, true]) for (const k of NASH_KS) for (const s of NASH_STACKS) {
      expect(hasNashRange(kind, k, s, ante), `${kind} ante=${ante} k=${k} ${s}bb`).toBe(true);
      expect(nashRange(kind, k, s, ante).some((v) => v > 0), `${kind} ante=${ante} k=${k} ${s}bb 가 전부 0`).toBe(true);
    }
  });

  it('callSB 는 k>=2 에만 있고 k=1(SB 가 셔버 본인)은 없다고 말한다 — 없는 표를 0 으로 꾸며 주지 않는다', () => {
    for (const ante of [false, true]) for (const s of NASH_STACKS) {
      expect(hasNashRange('callSB', 1, s, ante)).toBe(false);
      for (const k of NASH_KS) if (k >= 2) expect(hasNashRange('callSB', k, s, ante), `callSB k=${k} ${s}bb`).toBe(true);
    }
    // 데이터에 없는 깊이(11bb)는 어느 표에서도 '있다'고 하지 않는다 — UI 가 가까운 값으로 몰래 대체할 수 없게
    expect(hasNashRange('shove', 2, 11, false)).toBe(false);
  });

  it('차트 화면은 표가 없는 조합에서 행렬 대신 "데이터가 없습니다" 를 그리고, 스택 칩은 44px·공용 SlidingPill 이다', () => {
    const src = readFileSync(join(__dirname, '../components/features/tools/PushFoldChart.tsx'), 'utf-8');
    expect(src).toMatch(/const hasData = hasNashRange\(effView, k, stack, ante\)/);
    expect(src).toMatch(/\{hasData\s*\?\s*<RangeMatrix13/);
    expect(src).toContain('데이터가 없습니다');
    expect(src).toMatch(/data-testid="pushfold-stack-picker"[\s\S]*NASH_STACKS\.map[\s\S]*h-\[44px\]/);
    expect(src).toContain("<SlidingPill containerRef={stackRailRef} activeKey={stack}");
    // 정규식이 아니라 문자열로 — `||` 가 정규식 교대(alternation)가 되면 빈 대안이 무엇이든 통과시킨다.
    expect(src).toContain('role="radio" aria-checked={on} data-pill-active={on || undefined}'); // 이게 없으면 알약이 숨어(opacity 0) 선택이 안 보인다 — 2026-09-17 실측
  });
});
