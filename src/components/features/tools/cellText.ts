// 13×13 레인지 매트릭스 셀 글자색 — **칸 배경 명도**로 흰/검을 고른다(WCAG 상대 명도·대비율).
//
// 🔴 2026-09-25 전수 스윕(design-reviewer): 라이트 모드 혼합 빈도 칸(A4s·98s·44 등)의 흰 글자 대비가 1.0~1.98 이었다.
//   예전 규칙은 `total > 0.45 ? 흰 : ink-primary` — 채움 비율만 보고 지면(surface) 색을 안 봤다. 라이트 지면(#EEF2F8)은
//   흰 글자와 1.12:1 이라 반쯤 채운 칸의 윗부분이 통째로 안 보였다.
// 규칙: 글자는 셀 세로 30~70% 띠에 놓인다(TEXT_BAND). 그 띠에 실제로 걸치는 색 조각(아래→위 스택 채움 + 남은 지면)마다
//   흰·검 후보의 대비를 재고, **가장 낮은 대비가 더 높은 쪽**을 고른다. 셀마다 지면색은 테마 토큰(--surface-high)에서 읽는다.
// 2026-09-26: 채움색이 테마별(src/lib/rangeColors.ts)이 되어 다크는 전부 흰 글자 ≥4.5, 라이트는 전부 검은 글자 ≥4.5 다 —
//   9/25 에 남았던 다크 콜 2.54·4벳 4.23 은 채움색 교체로 사라졌다(cellText.test.ts 가 전 단계 채움에서 잠근다).
import { useEffect, useState } from 'react';
import { RANGE_FILL, type ActionTone, type RangeTheme } from '../../../lib/rangeColors';

/** 셀 세로 방향에서 글자가 실제로 차지하는 띠(0=바닥, 1=천장). 10px 글자가 26px 셀 가운데 → 대략 30~70%. */
export const TEXT_BAND: readonly [number, number] = [0.3, 0.7];
export const TEXT_LIGHT = '#FFFFFF';
export const TEXT_DARK = '#000000';

export type Rgb = readonly [number, number, number];
const lin = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]: Rgb): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const hexToRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

/** 셀 채움 조각 — from/to 는 0..1(아래→위). */
export interface CellSegment { color: string; from: number; to: number }

/** 글자 띠에 걸치는 조각들(남은 부분은 지면색)에 대해 흰·검 중 최악 대비가 높은 쪽을 고른다. */
export function pickCellText(segments: readonly CellSegment[], surface: Rgb): { color: string; worst: number } {
  const [b0, b1] = TEXT_BAND;
  const bands: Rgb[] = [];
  let top = 0;
  for (const s of segments) {
    if (s.to > b0 && s.from < b1) bands.push(hexToRgb(s.color));
    top = Math.max(top, s.to);
  }
  if (top < b1) bands.push(surface);
  const worstOf = (t: Rgb) => bands.reduce((m, c) => Math.min(m, contrastRatio(t, c)), Infinity);
  const w = worstOf(hexToRgb(TEXT_LIGHT)), k = worstOf(hexToRgb(TEXT_DARK));
  return w >= k ? { color: TEXT_LIGHT, worst: w } : { color: TEXT_DARK, worst: k };
}

/** `--surface-high` 토큰("r g b")을 읽는다. 테마는 html.light 클래스로 갈리므로 class 변화를 지켜본다. */
export function readSurfaceHigh(): Rgb {
  if (typeof document === 'undefined') return [27, 36, 60];
  const v = getComputedStyle(document.documentElement).getPropertyValue('--surface-high').trim().split(/[\s,]+/).map(Number);
  return v.length === 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : [27, 36, 60];
}
export function readTheme(): RangeTheme {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? 'light' : 'dark';
}
export interface RangeThemeState { theme: RangeTheme; surface: Rgb; fill: Record<ActionTone, string> }
const readRangeTheme = (): RangeThemeState => { const theme = readTheme(); return { theme, surface: readSurfaceHigh(), fill: RANGE_FILL[theme] }; };
/** 지면색 + 테마별 채움색(rangeColors.ts) 을 함께 읽는다 — 2026-09-26 채움색이 테마별이 되면서 지면만 보던 useSurfaceHigh 를 대체. */
export function useRangeTheme(): RangeThemeState {
  const [st, setSt] = useState<RangeThemeState>(readRangeTheme);
  useEffect(() => {
    const el = document.documentElement;
    const mo = new MutationObserver(() => setSt(readRangeTheme()));
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return st;
}
