// src/components/features/clock/ambience/clockTexture.ts — 배경 결(texture) 3종: B3 브러시드 메탈 · B4 라운지 조명 · B5 카드 무늬.
//
// 색 테마와 **독립**이다. 어떤 프리셋 bg 든 그 위에 결 레이어만 얹는다(withClockTexture).
//   · 결 레이어에는 색(color) 레이어가 없다 — background 단축 속성은 색을 마지막 레이어에만 허용하고,
//     clockTheme.ts 의 프리셋 bg 는 이미 '색은 마지막' 계약을 지킨다. 앞에 이미지 레이어를 더해도 그 계약이 유지된다.
//   · 정적 CSS 다(애니메이션 0). 모션 캔버스(ClockAmbience)와 함께 써도 서로 모른다.
//   · 틴트는 #RRGGBB 만 받는다. page_config 는 업주가 쓰는 자유 JSON 이라, 검증 없이 CSS 문자열에 넣으면
//     `url(` 탈출·임의 외부 URL 주입이 된다(clockTheme.isAllowedClockBgUrl 과 같은 이유). 틀리면 기본 틴트.
//   · B5 무늬는 글꼴 글리프(♠)가 아니라 SVG path 로 그린다 — TV 스틱에 해당 글꼴이 없으면 네모가 찍힌다.

export type ClockTextureId = 'brushed' | 'lounge' | 'suit';

export const CLOCK_TEXTURES: { id: ClockTextureId; label: string; ref: string }[] = [
  { id: 'brushed', label: '브러시드 메탈', ref: 'B3' },
  { id: 'lounge', label: '라운지 조명', ref: 'B4' },
  { id: 'suit', label: '카드 무늬', ref: 'B5' },
];

/** 시안(B4·B5)의 샴페인 골드. 틴트를 주지 않으면 이 색. */
export const CLOCK_TEXTURE_DEFAULT_TINT = '#E7C677';

const HEX = /^#[0-9a-fA-F]{6}$/;
export const safeTint = (v: unknown): string => (typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : CLOCK_TEXTURE_DEFAULT_TINT);

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

// 카드 네 무늬 — 24×24 상자 기준 path(직접 그린 도형, 외부 자산 아님).
const SPADE = 'M12 2C9 7 3 10 3 14.5 3 17.5 5.3 19.5 8 19.5c1.4 0 2.6-.5 3.3-1.4L10 22h4l-1.3-3.9c.7.9 1.9 1.4 3.3 1.4 2.7 0 5-2 5-5C21 10 15 7 12 2z';
const HEART = 'M12 21C6 16.5 2.5 13 2.5 8.8 2.5 5.9 4.7 3.5 7.6 3.5c1.9 0 3.5 1 4.4 2.6.9-1.6 2.5-2.6 4.4-2.6 2.9 0 5.1 2.4 5.1 5.3 0 4.2-3.5 7.7-9.5 12.2z';
const DIAMOND = 'M12 2l7.5 10L12 22 4.5 12z';
const CLUB = 'M12 2.5a4.3 4.3 0 00-4 5.9A4.3 4.3 0 1010.6 16L9.5 21.5h5L13.4 16a4.3 4.3 0 102.6-7.6 4.3 4.3 0 00-4-5.9z';

function suitSvg(tint: string): string {
  const g = (d: string, x: number, y: number) => `<path transform="translate(${x} ${y}) scale(1.6)" d="${d}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><g fill="${tint}" fill-opacity=".05">` +
    g(SPADE, 22, 22) + g(HEART, 132, 22) + g(DIAMOND, 77, 127) + g(CLUB, 187, 127) +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 결 레이어만(색 레이어 없음). 앞에 붙여 쓴다. */
export function clockTextureLayers(id: ClockTextureId, tint?: string): string {
  const t = safeTint(tint), rgb = rgbOf(t);
  switch (id) {
    // B3 — 세로 헤어라인(1px 밝음·1px 비움·1px 어둠) + 115° 금속 광택 두 줄기. 시안의 바탕 그라데이션은 색 테마 몫이라 뺐다.
    case 'brushed':
      return [
        'repeating-linear-gradient(90deg, rgba(255,255,255,.018) 0 1px, transparent 1px 2px, rgba(0,0,0,.05) 2px 3px)',
        'linear-gradient(115deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.035) 38%, rgba(255,255,255,0) 52%, rgba(255,255,255,.03) 70%, rgba(255,255,255,0) 100%)',
      ].join(', ');
    // B4 — 라운지 조명 세 웅덩이(좌상 · 우하 · 상단 우측). 시안 1920×1080 의 700×500 등을 % 로 옮겼다.
    case 'lounge':
      return [
        `radial-gradient(36% 46% at 18% 22%, rgba(${rgb},.16), transparent 70%)`,
        `radial-gradient(42% 56% at 85% 75%, rgba(${rgb},.12), transparent 70%)`,
        `radial-gradient(31% 39% at 70% 10%, rgba(${rgb},.10), transparent 70%)`,
      ].join(', ');
    // B5 — 카드 무늬 220px 타일(1080 기준) → vmin 으로 TV 해상도에 비례. 알파 .05.
    case 'suit':
      return `${suitSvg(t)} 0 0 / 20.4vmin 20.4vmin`;
  }
}

/** 프리셋 bg 앞에 결을 얹는다. id 가 없거나 모르면 bg 그대로. */
export function withClockTexture(bg: string, id: ClockTextureId | null | undefined, tint?: string): string {
  if (!id || !CLOCK_TEXTURES.some((x) => x.id === id)) return bg;
  return `${clockTextureLayers(id, tint)}, ${bg}`;
}
