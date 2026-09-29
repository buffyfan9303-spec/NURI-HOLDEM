// 계산기 입력 경계 — 2026-09-29 최종 점검 D1·D2·D3.
// NumIn 은 렌더 없이 함수로 불러 input 의 onChange 에 문자열을 넣는다(useState 모킹).
import { describe, it, expect, vi } from 'vitest';
import { type ReactElement } from 'react';

const q = vi.hoisted(() => ({ queue: [] as unknown[] }));
vi.mock('react', async (orig) => {
  const R = await orig<typeof import('react')>();
  const useState = ((init: unknown) => (q.queue.length ? [q.queue.shift(), () => {}] : R.useState(init as never))) as typeof R.useState;
  return { ...R, default: { ...R, useState }, useState };
});

const { NumIn } = await import('./calcUi');

/** NumIn 을 렌더 없이 불러 input 의 onChange 에 문자열을 넣고, 부모로 나간 값을 모은다. */
function typeInto(raw: string, decimal = false): number[] {
  const sent: number[] = [];
  q.queue = [null]; // NumIn 의 draft 상태
  const el = NumIn({ value: 5, onChange: (n) => sent.push(n), decimal }) as ReactElement<{ children: ReactElement<{ onChange: (e: unknown) => void }>[] }>;
  q.queue = [];
  el.props.children[0].props.onChange({ target: { value: raw } });
  return sent;
}

const HUGE = '9'.repeat(400); // parseInt/parseFloat → Infinity

describe('D1 — NumIn 은 유한하지 않은 값을 부모로 내보내지 않는다(이 입력을 쓰는 모든 도구의 경계)', () => {
  it('정수 모드: 400자리 → 내보내지 않음 · 보통 값은 그대로', () => {
    expect(typeInto(HUGE).every(Number.isFinite)).toBe(true);
    expect(typeInto('123')).toEqual([123]);
    expect(typeInto('')).toEqual([0]);
  });
  it('소수 모드: 400자리 → 내보내지 않음 · 보통 값은 그대로', () => {
    expect(typeInto(HUGE, true).every(Number.isFinite)).toBe(true);
    expect(typeInto('2.5', true)).toEqual([2.5]);
  });
});
