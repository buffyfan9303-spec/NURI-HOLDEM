// Tailwind v4 빌드가 굳힌 oklab(...) 색 리터럴을 같은 sRGB 값의 rgb() 로 되돌린다(2026-09-28 v4 이관).
//
// 왜: v4 는 `text-white/70` 같은 투명도 수식어를 빌드 때 `oklab(100% 0 5.96046e-8/.7)` 로 계산해 박는다.
//   색 값은 v3 의 rgb(255 255 255 / .7) 과 같은데, 크롬이 **흰 oklab 글자를 rgba 와 다르게 안티에일리어싱**해
//   글자 가장자리가 최대 10/255 달라졌다(③ 재촬영 클락 미리보기 · scratchpad oklabtext.cjs 재현, color(srgb) 는 0).
//   그래서 sRGB 8비트로 **정확히** 떨어지는 리터럴만 rgb() 로 바꾼다 — 색은 한 치도 안 바뀌고 렌더 경로만 v3 와 같아진다.
// ⚠ 건드리지 않는 것: color-mix(…var(--x)…) 같은 동적 식(런타임에 풀린다) · 8비트로 안 떨어지는 값(정확하지 않으면 그대로 둔다).

/** 채널이 정수에서 이만큼 안에 있으면 그 정수(8비트 값)로 본다 — v4 의 float 잔차(5.96e-8 등)는 0.01 보다 훨씬 작다.
 *  한 단계(1/255)의 1/20 이라 다른 정수로 잘못 붙을 수 없다. */
const EPS = 0.05;

function oklabToSrgb255(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)) as [number, number, number];
}

const num = (s: string): number => (s === 'none' ? 0 : s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s));
const NUM = String.raw`(-?[\d.]+(?:e[-+]?\d+)?%?|none)`;
const OKLAB = new RegExp(String.raw`oklab\(\s*${NUM}\s+${NUM}\s+${NUM}\s*(?:\/\s*([\d.]+%?)\s*)?\)`, 'g');

/** 리터럴 하나 → rgb() 문자열. 8비트로 정확히 안 떨어지면 null(바꾸지 않는다). */
export function oklabLiteralToRgb(lit: string): string | null {
  OKLAB.lastIndex = 0;
  const m = OKLAB.exec(lit);
  if (!m || m[0] !== lit) return null;
  const ch = oklabToSrgb255(num(m[1]), num(m[2]), num(m[3]));
  const bytes = ch.map((c) => Math.round(c));
  if (ch.some((c, i) => Math.abs(c - bytes[i]) > EPS || bytes[i] < 0 || bytes[i] > 255)) return null;
  return m[4] === undefined ? `rgb(${bytes.join(' ')})` : `rgb(${bytes.join(' ')}/${m[4]})`;
}

/** CSS 문자열 안의 oklab(...) 리터럴 중 정확한 것만 바꾼다. color-mix(...) 안의 var() 식은 oklab( 로 시작하지 않아 안 걸린다. */
export function cssOklabToRgb(css: string): { css: string; replaced: number; kept: number } {
  let replaced = 0, kept = 0;
  const out = css.replace(OKLAB, (lit) => {
    const r = oklabLiteralToRgb(lit);
    if (r) { replaced++; return r; }
    kept++; return lit;
  });
  return { css: out, replaced, kept };
}
