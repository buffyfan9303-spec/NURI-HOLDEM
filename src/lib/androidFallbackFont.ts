// src/lib/androidFallbackFont.ts — 'Pretendard FB Android'(Noto CJK 크기 맞춘 폴백)를 **그 글꼴이 있는 기기에서만** 등록한다.
//
// R-04(2026-10-01, store-fix-report §R-04/S-05): 이 face 는 원래 public/fonts/pretendard/…css 에
//   `src: local('Noto Sans CJK KR'), local('NotoSansCJKkr-Regular'), local('Noto Sans KR')` 로 있었다.
//   PC 에서 이 face 가 한글 첫 조판에 끼어 레이아웃이 652ms 늘었다(장부 첫 진입 CPU4 917~1034ms → 그 face 만 빼면 414~423ms —
//   store-team 실측). 원인은 아래 ⚠ 의 'Noto Sans KR' 이 Windows 11 에서 실제로 맞은 것이다(없는 이름 재조회가 아니라).
//   CSS 만으로는 'OS 가 안드로이드일 때만' 을 고를 수 없다 → 글꼴이 실제로 있는지 한 번 물어보고(FontFace.load) 있을 때만 붙인다.
//   ⚠ UA 로 고르지 않는다 — 안드로이드 UA 를 흉내 내는 PC(하네스·개발자 도구)와 Noto 가 없는 안드로이드에서도 정확해야 한다.
// 효과는 그대로다: 안드로이드에서 Pretendard woff2 가 오기 전·swap 뒤 글자 크기가 맞는다(한글 95.5% · 라틴 99.87% — 값은 옛 CSS 그대로).
// ⚠ 'Noto Sans KR' 는 뺐다(2026-10-01 실측) — 이 PC(Windows 11)에 NotoSansKR-VF.ttf 가 기본으로 있어 그 이름이 **맞았고**,
//   그래서 PC 에서도 이 폴백(큰 가변 CJK 글꼴)이 Pretendard 도착 전 한글 조판에 끼었다. 안드로이드 시스템 글꼴은
//   NotoSansCJK(.ttc)라 위 두 이름(가족·PostScript)으로 찾는다. probe 실측: 'Noto Sans CJK KR' false · 'NotoSansCJKkr-Regular' false ·
//   'Noto Sans KR' true(이 PC).
const SRC = "local('Noto Sans CJK KR'), local('NotoSansCJKkr-Regular')";
const COMMON = { display: 'swap', ascentOverride: '95%', descentOverride: '24%', lineGapOverride: '0%' } as const;
const FACES = [
  { unicodeRange: 'U+1100-11FF, U+3000-303F, U+3130-318F, U+A960-A97F, U+AC00-D7AF, U+FF00-FFEF', sizeAdjust: '95.5%' },
  { unicodeRange: 'U+0000-00FF, U+2000-206F, U+20A0-20CF', sizeAdjust: '99.87%' },
];
export const ANDROID_FALLBACK_FAMILY = 'Pretendard FB Android';

/** 있으면 등록하고 true. 없거나 FontFace API 가 없으면 아무것도 안 하고 false. 던지지 않는다. */
export async function registerAndroidFallbackFont(): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return false;
  try {
    // 한 번만 묻는다 — 없는 기기에서 이 한 번이 전부다(예전엔 글자마다).
    await new FontFace('__nuri_noto_probe', SRC).load();
  } catch {
    return false;
  }
  for (const f of FACES) {
    // sizeAdjust·*Override 는 FontFaceDescriptors 의 최신 항목이라 lib.dom 타입에 없을 수 있다.
    document.fonts.add(new FontFace(ANDROID_FALLBACK_FAMILY, SRC, { ...COMMON, ...f } as FontFaceDescriptors));
  }
  return true;
}
