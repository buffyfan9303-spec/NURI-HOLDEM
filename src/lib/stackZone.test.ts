import { describe, expect, it } from 'vitest';
import { NASH_STACKS } from './nash.data';
import { PUSH_STACKS, nearestNashStack, stackZone } from './stackZone';

describe('stackZone · 내 bb → 차트 구간', () => {
  it('눈금 사본은 nash.data 의 NASH_STACKS 와 같다(라이브 탭이 데이터 청크를 끌어오지 않기 위한 복사)', () => {
    expect([...PUSH_STACKS]).toEqual([...NASH_STACKS]);
  });
  it('≤20bb 는 푸시폴드 — 스택은 Nash 차트 눈금으로 반올림(13.4→12 · 1.5→2 클램프)', () => {
    expect(stackZone(13.4, 5)).toEqual({ tool: 'pushfold', stack: 12, label: '올인/폴드 구간 · 12bb 레인지' });
    expect(nearestNashStack(1.5)).toBe(2);
    expect(nearestNashStack(20)).toBe(20);
  });
  it('20~40bb 는 오픈 차트(M 표기) · 40bb 초과는 포스트플랍', () => {
    expect(stackZone(20.1, 8.6)).toMatchObject({ tool: 'range', label: 'M 9 · 스틸 구간 · 오픈 차트' });
    expect(stackZone(40, 12)).toMatchObject({ tool: 'range' });
    expect(stackZone(40.1, 12)).toMatchObject({ tool: 'postflop' });
  });
});
