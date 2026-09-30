// 콜 압박 사다리 승률 자리수 = 필요 승률 자리수(소수 1자리). 2026-09-30 감사: 정수 반올림이면
// tight 레인지 AQo 49.5 가 '50' 으로 보여 필요 승률 49.8% 를 넘는 것처럼 읽히는데 폴드 색이었다.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ICMCalculator from './ICMCalculator';

describe('ICMCalculator 콜 압박 사다리', () => {
  it('핸드별 승률을 소수 1자리로 보인다(필요 승률과 같은 자리수)', () => {
    const html = renderToStaticMarkup(<ICMCalculator initialMode="pressure" />);
    const nums = [...html.matchAll(/<span class="ml-1 font-normal opacity-70">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(nums).toHaveLength(14);
    for (const n of nums) expect(n).toMatch(/^\d+\.\d$/);
    expect(nums).toContain('58.2'); // 기본 mid 레인지 AQo
  });
});
