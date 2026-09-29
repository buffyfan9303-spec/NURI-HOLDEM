// 계산기 입력 경계 — 2026-09-29 최종 점검 D1·D2·D3.
// NumIn 은 렌더 없이 함수로 불러 input 의 onChange 에 문자열을 넣는다(useState 모킹).
// 계산식이 컴포넌트 안에 인라인이라 순수 함수가 없다 → useState 를 모킹해 입력을 주입하고
// 실제 컴포넌트를 renderToStaticMarkup 으로 그려 화면 문자열을 읽는다(식을 테스트에 베끼지 않는다).
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type FC, type ReactElement } from 'react';

const q = vi.hoisted(() => ({ queue: [] as unknown[] }));
vi.mock('react', async (orig) => {
  const R = await orig<typeof import('react')>();
  const useState = ((init: unknown) => (q.queue.length ? [q.queue.shift(), () => {}] : R.useState(init as never))) as unknown as typeof R.useState;
  return { ...R, default: { ...R, useState }, useState };
});

const { NumIn } = await import('./calcUi');
const { MzoneCalc } = await import('./StackCalcs');
const { MdfCalc } = await import('./AdvancedCalcs');

function text(C: FC, states: unknown[]): string {
  q.queue = [...states];
  const html = renderToStaticMarkup(createElement(C));
  q.queue = [];
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

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

describe('D2 — MDF 는 1e400 에서 NaN% 를 내지 않는다', () => {
  it('1e400 / 50 → NaN·Infinity 없음, 보통 값 100/50 은 66.7% 유지', () => {
    const t = text(MdfCalc, ['1e400', '50']);
    expect(t).not.toMatch(/NaN|Infinity/);
    expect(text(MdfCalc, ['100', '50'])).toContain('66.7%');
  });
});

describe('D3 — M존은 계산 불가 입력에 존 판정을 붙이지 않는다', () => {
  it('(a) SB·BB·앤티 전부 0 → M 도 존도 \'-\' (데드 아님)', () => {
    const t = text(MzoneCalc, [30000, 0, 0, 0, 9]);
    expect(t).toMatch(/Effective M = - - /);
    expect(t).not.toContain('데드');
  });
  it('(b) 인원 0 → 1명으로 보지 않는다(레드 아님)', () => {
    const t = text(MzoneCalc, [10000, 100, 200, 25, 0]);
    expect(t).toMatch(/Effective M = - - /);
    expect(t).not.toContain('레드');
  });
  it('양성 대조: Harrington 예 10000·100/200·앤티25·9명(1인당 앤티) → 17.1 옐로', () => {
    const h = text(MzoneCalc, [10000, 100, 200, 25, 9, 'each']);
    expect(h).toContain('Effective M = 17.1'); expect(h).toContain('옐로');
  });
  it('(a2) 스택 0 → M 은 \'-\' 가 아니라 0.0 (존 \'데드\' 와 같은 값을 말한다)', () => {
    const s0 = text(MzoneCalc, [0, 100, 200, 25, 9]);
    expect(s0).toContain('Effective M = 0.0'); expect(s0).toContain('데드');
  });
});

// #14 (2026-09-29 오너): 국내는 대부분 BB 앤티 — BB 한 명이 1BB 를 한 번 낸다. 한 바퀴 = SB + BB + 앤티(1회).
// 손계산(식을 코드에서 베끼지 않는다): 스택 30000 = 15BB, 블라인드 1000/2000, 앤티 2000.
//   BB 앤티:  30000 / (1000+2000+2000)        = 6.0  → ×9/10 = 5.4(레드) · ×10/10 = 6.0(오렌지)
//   1인당:    30000 / (1000+2000+2000×9=21000) = 1.43 → ×9/10 = 1.3(레드)  ← 수정 전 기본 화면의 값
describe('#14 — M존 기본은 BB 앤티(한 바퀴에 앤티 1회), 1인당 앤티는 선택', () => {
  it('기본(방식 미지정) 15BB·9명 → raw M 6.0, Effective M 5.4 (1인당으로 곱한 1.3 이 아니다)', () => {
    const t = text(MzoneCalc, [30000, 1000, 2000, 2000, 9]);
    expect(t).toContain('Effective M = 5.4');
    expect(t).not.toContain('Effective M = 1.3');
  });
  it('기본 15BB·10명 → Effective M 6.0 = raw M (인원 보정 1) · 오렌지', () => {
    const t = text(MzoneCalc, [30000, 1000, 2000, 2000, 10]);
    expect(t).toContain('Effective M = 6.0'); expect(t).toContain('오렌지');
  });
  it('1인당 모드는 기존 값 유지: 15BB·9명 → 1.3 레드', () => {
    const t = text(MzoneCalc, [30000, 1000, 2000, 2000, 9, 'each']);
    expect(t).toContain('Effective M = 1.3'); expect(t).toContain('레드');
  });
  it('BB 앤티 모드에서도 경계 유지: 인원 0 → \'-\' · 비용 0 → \'-\'', () => {
    expect(text(MzoneCalc, [30000, 1000, 2000, 2000, 0, 'bb'])).toMatch(/Effective M = - - /);
    expect(text(MzoneCalc, [30000, 0, 0, 0, 9, 'bb'])).toMatch(/Effective M = - - /);
  });
  it('화면이 계산 방식을 말한다: 기본 라벨은 BB 앤티, 1인당 라벨은 1인당', () => {
    expect(text(MzoneCalc, [30000, 1000, 2000, 2000, 9])).toContain('앤티(BB 1회)');
    expect(text(MzoneCalc, [30000, 1000, 2000, 2000, 9, 'each'])).toContain('앤티(1인)');
  });
});
