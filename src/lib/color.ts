// src/lib/color.ts
/**
 * 배경색 위에 올릴 글자색(잉크)을 대비로 고르는 순수 함수 모음.
 *
 * 왜 필요한가: 아바타 이니셜 배경은 **유저 데이터**(profiles.avatar_color · 팔레트 선택 ·
 * 역할 표식 골드)라 토큰화할 수 없다. 그런데 글자색이 `text-white` 로 하드코딩돼 있어
 * ProfileModal 팔레트 10색 중 9색이 WCAG AA(4.5:1) 미달이었다(#FFD100 은 1.46:1).
 * 배경 상대휘도로 흰색/어두운 잉크를 자동 전환해 전 색역에서 AA 를 보장한다.
 */

/** WCAG 2.x 상대휘도. 입력은 0~255 sRGB. */
function luminanceFromRgb(r: number, g: number, b: number): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * CSS 색 문자열 → 상대휘도. 파싱 실패 시 null.
 * 지원: `#RGB` · `#RRGGBB` · `#RRGGBBAA`(알파 무시) · `rgb()/rgba()`.
 * 그라데이션·hsl·색이름은 파싱하지 않는다(호출부가 폴백을 쓴다).
 */
export function relativeLuminance(color: string | null | undefined): number | null {
  if (!color) return null;
  const s = color.trim();

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b] = [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16));
      if ([r, g, b].some(Number.isNaN)) return null;
      return luminanceFromRgb(r, g, b);
    }
    if (hex.length === 6 || hex.length === 8) {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      if ([r, g, b].some(Number.isNaN)) return null;
      return luminanceFromRgb(r, g, b);
    }
    return null;
  }

  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) {
    const [r, g, b] = [1, 2, 3].map((i) => Number(m[i]));
    if ([r, g, b].some((v) => !Number.isFinite(v))) return null;
    return luminanceFromRgb(r, g, b);
  }
  return null;
}

/**
 * 흰색 ↔ `--ink-on-bright`(#030405) 전환 임계 상대휘도.
 *
 * 근거(계산 실측 · scripts 없이 재현 가능):
 * · 흰색(L=1)이 4.5:1 을 지키는 배경 휘도 **상한**은 L ≤ 0.1833
 * · #030405(L=0.00117)가 4.5:1 을 지키는 배경 휘도 **하한**은 L ≥ 0.1803
 * → 두 구간이 [0.1803, 0.1833] 에서 겹치므로 그 사이 임계값 하나로 **전 색역 AA 가 보장**된다.
 *   교차점 L=0.1818 에서의 최악 대비가 4.53:1 (아바타 이니셜은 9~17px 이라 large-text 예외 없음 → 4.5 기준).
 *
 * ⚠ 더 밝은 잉크(#0A0B0D=4.44 · --ink-inverse #181A20=4.17)로는 겹침이 사라져
 *   L 0.1833~0.19 구간에 **어느 쪽으로도 AA 를 못 넘는 사각지대**가 생긴다.
 *   `--ink-on-bright` 를 밝히려면 이 수를 다시 계산할 것.
 */
const INK_SWITCH_LUMINANCE = 0.1818;

/**
 * 배경색 위에 쓸 잉크 종류.
 * - `'light'` → 흰 글자(`text-white`)
 * - `'dark'`  → `text-ink-onBright`(= `--ink-on-bright`)
 *
 * 파싱 실패 시 `'light'` 로 폴백해 기존 동작(흰 글자)을 유지한다 — 예외를 던지지 않는다.
 */
export function onColorInk(background: string | null | undefined): 'light' | 'dark' {
  const l = relativeLuminance(background);
  if (l === null) return 'light';
  return l <= INK_SWITCH_LUMINANCE ? 'light' : 'dark';
}

/** 배경색 위 글자색 tailwind 유틸 클래스. 마크업에 hex 를 남기지 않기 위한 얇은 래퍼. */
export function onColorInkClass(background: string | null | undefined): string {
  return onColorInk(background) === 'dark' ? 'text-ink-onBright' : 'text-white';
}
