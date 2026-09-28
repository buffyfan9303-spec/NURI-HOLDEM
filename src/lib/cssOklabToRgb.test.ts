// 실행: npx vitest run src/lib/cssOklabToRgb.test.ts
// 빌드 후처리(vite.config.ts oklabToRgbPlugin)가 oklab 리터럴을 rgb() 로 바꿀 때 **색이 한 치도 안 바뀌는지**(오차 0).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssOklabToRgb, oklabLiteralToRgb } from './cssOklabToRgb';

// 검증용 정방향 변환(sRGB 8비트 → oklab) — 모듈의 역변환과 독립으로 적었다(Björn Ottosson 행렬).
function srgbToOklab([r, g, b]: number[]): [number, number, number] {
  const lin = [r, g, b].map((c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// lightningcss 가 찍는 모양(유효숫자 6자리, 앞 0 생략) 그대로
const fmt = (n: number) => String(Number(n.toPrecision(6))).replace(/^(-?)0\./, '$1.');

const hexes = [...readFileSync(join(__dirname, '..', 'index.css'), 'utf8').matchAll(/--color-[\w-]+:\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3});/g)]
  .map((m) => (m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]).toLowerCase());

describe('oklab → rgb 빌드 후처리', () => {
  it('@theme 의 모든 hex 색 × 투명도: 빌드가 찍는 oklab 리터럴을 되돌리면 원래 8비트 값과 오차 0', () => {
    expect(hexes.length, '@theme 에서 hex 색을 못 읽었다').toBeGreaterThan(200);
    for (const hex of hexes) {
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const [L, a, b] = srgbToOklab(rgb);
      for (const alpha of ['.05', '.5', '.95']) {
        const lit = `oklab(${fmt(L * 100)}% ${fmt(a)} ${fmt(b)}/${alpha})`;
        expect(oklabLiteralToRgb(lit), `#${hex} ${lit}`).toBe(`rgb(${rgb.join(' ')}/${alpha})`);
      }
    }
  });

  it('실제 v4 빌드가 찍은 리터럴(흰·검정·danger)도 정확히 되돌리고, 동적 식·어중간한 값은 그대로 둔다', () => {
    expect(oklabLiteralToRgb('oklab(100% 0 5.96046e-8/.7)')).toBe('rgb(255 255 255/.7)');
    expect(oklabLiteralToRgb('oklab(0% none none/.15)')).toBe('rgb(0 0 0/.15)');
    expect(oklabLiteralToRgb('oklab(65.426% .200487 .0658023/.2)')).toBe('rgb(246 70 93/.2)'); // danger #F6465D
    expect(oklabLiteralToRgb('oklab(50% .01 .01)')).toBeNull();               // 8비트로 안 떨어진다 → 안 바꾼다
    const css = '.a{color:oklab(100% 0 5.96046e-8/.7)}.b{background-color:color-mix(in oklab, rgb(var(--surface-base)) 95%, transparent)}.c{color:oklab(50% .01 .01)}';
    const r = cssOklabToRgb(css);
    expect(r.css).toBe('.a{color:rgb(255 255 255/.7)}.b{background-color:color-mix(in oklab, rgb(var(--surface-base)) 95%, transparent)}.c{color:oklab(50% .01 .01)}');
    expect([r.replaced, r.kept]).toEqual([1, 1]);
  });
});
