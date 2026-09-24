// 이미지 없는 로고 자리 배경 — poster_color 가 null 이어도 배경이 살아 있고, 흰 이니셜(white/85)이 읽힌다(라이트 지면 포함).
// 2026-09-24 design-reviewer 실측: 라이트에서 이니셜 대비 1.00 — `${null}ee` 가 그라데이션을 무효로 만들어 배경이 사라졌다.
import { describe, it, expect } from 'vitest';
import { posterFallbackBg, POSTER_FALLBACK_COLOR } from '../../lib/posterFallbackBg';

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** 흰 글자 85% 를 배경 위에 합성한 색과 배경의 대비 */
const whiteText85On = (bg: number[]) => {
  const fg = bg.map((c) => Math.round(255 * 0.85 + c * 0.15));
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};
/** 그라데이션 첫 색 = 이니셜이 놓이는 왼쪽 위(가장 밝은 쪽 — 최악 대비). 'ee' 알파(0.933)를 라이트 지면(#F5F7FB) 위에 합성한다. */
const firstStopOnLight = (css: string) => {
  const m = css.match(/linear-gradient\(135deg, (#[0-9a-fA-F]{6})ee 0%/);
  if (!m) return null;
  const light = [245, 247, 251];
  return hex(m[1]).map((c, i) => Math.round(c * (0xee / 255) + light[i] * (1 - 0xee / 255)));
};

describe('posterFallbackBg — 이미지 없는 로고 자리', () => {
  for (const v of [null, undefined, '', '   ']) {
    it(`poster_color=${JSON.stringify(v)} 이면 기본색 그라데이션(무효 CSS 가 아니다)`, () => {
      const css = posterFallbackBg(v as string | null | undefined);
      expect(css).not.toMatch(/null|undefined/);
      expect(css).toContain(`${POSTER_FALLBACK_COLOR}ee`);
    });
  }
  it('라이트 지면에서도 흰 이니셜 대비 ≥ 3:1 (종전 1.00)', () => {
    const bg = firstStopOnLight(posterFallbackBg(null));
    expect(bg, '그라데이션 첫 색을 못 읽었다 — 배경이 무효다').not.toBeNull();
    expect(whiteText85On(bg!)).toBeGreaterThanOrEqual(3);
  });
  it('지정한 테마색은 그대로 쓴다', () => {
    expect(posterFallbackBg('#123456')).toContain('#123456ee');
  });
});
