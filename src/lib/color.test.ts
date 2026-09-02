import { describe, it, expect } from 'vitest';
import { relativeLuminance, onColorInk, onColorInkClass } from './color';

/** WCAG 2.x 대비비 — 테스트가 스스로 계산해 구현과 대조한다(구현 재사용 금지) */
function ratio(hexA: string, hexB: string): number {
  const L = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const a = L(hexA), b = L(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const WHITE = '#FFFFFF';
/** index.css --ink-on-bright: 3 4 5 와 반드시 같아야 한다 */
const ON_BRIGHT = '#030405';

describe('relativeLuminance · 파싱', () => {
  it('#RRGGBB · #RGB · rgb() · rgba() 를 모두 읽는다', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#fd0')).toBeCloseTo(relativeLuminance('#ffdd00')!, 6);
    expect(relativeLuminance('rgb(255, 209, 0)')).toBeCloseTo(relativeLuminance('#FFD100')!, 6);
    expect(relativeLuminance('rgba(255, 209, 0, 0.5)')).toBeCloseTo(relativeLuminance('#FFD100')!, 6);
  });

  it('파싱 못 하는 값은 null 을 주고, 잉크는 흰색으로 폴백한다(예외 금지)', () => {
    for (const bad of [undefined, null, '', '  ', 'linear-gradient(90deg, #fff, #000)', 'hsl(40 100% 50%)', 'rebeccapurple', '#12', '#zzzzzz']) {
      expect(relativeLuminance(bad)).toBeNull();
      expect(onColorInk(bad)).toBe('light');
      expect(onColorInkClass(bad)).toBe('text-white');
    }
  });
});

describe('onColorInk · 전 색역 WCAG AA(4.5:1) 보장', () => {
  // ProfileModal COLOR_PALETTE 10색 + 라이브 profiles.avatar_color 실측값 + Avatar 기본값
  const USED = ['#FFD100', '#22C55E', '#E879F9', '#14B8A6', '#0EA5E9', '#F97316',
    '#EC4899', '#EF4444', '#A855F7', '#64748B', '#6B7280', '#5A6175'];

  it('실제로 쓰이는 색 전부가 4.5:1 이상이다', () => {
    for (const bg of USED) {
      const ink = onColorInk(bg) === 'dark' ? ON_BRIGHT : WHITE;
      expect(ratio(bg, ink), `${bg} 대비 미달`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('하드코딩 흰색이었다면 12색 중 9색이 미달이었다(회귀 대조군)', () => {
    const failed = USED.filter((bg) => ratio(bg, WHITE) < 4.5);
    expect(failed).toHaveLength(9);
    expect(ratio('#FFD100', WHITE)).toBeLessThan(1.5); // 등급 골드 = 1.46:1
  });

  it('회색조 전 구간(0~255)에서 사각지대가 없다. 임계값이 두 안전구간의 교집합 안에 있다', () => {
    for (let v = 0; v <= 255; v++) {
      const bg = '#' + v.toString(16).padStart(2, '0').repeat(3).toUpperCase();
      const ink = onColorInk(bg) === 'dark' ? ON_BRIGHT : WHITE;
      expect(ratio(bg, ink), `${bg} 사각지대`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('임의 색 무작위 표본에서도 미달이 없다(교차점 최악 4.53:1)', () => {
    let worst = Infinity;
    for (let i = 0; i < 20000; i++) {
      const bg = '#' + [0, 1, 2].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('').toUpperCase();
      const ink = onColorInk(bg) === 'dark' ? ON_BRIGHT : WHITE;
      worst = Math.min(worst, ratio(bg, ink));
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it('--ink-on-bright 를 밝히면 사각지대가 생긴다. 토큰을 못 밝히는 이유의 고정', () => {
    // 조사 단계에서 제안됐던 #0A0B0D 는 L 0.1833~0.190 구간에서 어느 쪽으로도 4.5 를 못 넘는다
    const gap = '#777777'; // L=0.1845 — 정확히 그 사각지대(흰색 4.478 · #0A0B0D 4.397 둘 다 미달)
    expect(ratio(gap, WHITE)).toBeLessThan(4.5);
    expect(ratio(gap, '#0A0B0D')).toBeLessThan(4.5);
    // 현재 토큰(#030405)은 이 색을 통과시킨다
    expect(ratio(gap, ON_BRIGHT)).toBeGreaterThanOrEqual(4.5);
    expect(onColorInk(gap)).toBe('dark');
  });
});
