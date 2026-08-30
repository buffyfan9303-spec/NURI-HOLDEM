// src/lib/emojiPolicy.ts — "UI 에 이모지를 들이지 않는다" 규약의 **코드포인트 정의**.
//
// 왜 소스 규약인가: 이모지는 폰트 리소스라 화면에서만 드러나는 문제(두부·OS 별로 다른 그림·
// 테마를 못 따라가는 색)가 기기마다 갈린다. '렌더해서 잡는' 방식은 잡히는 기기에서만 잡힌다.
// 반면 이모지가 **들어오는 순간**은 소스에 정확히 한 번 나타난다 — 거기서 막는 게 확정적이다.
// (실제 글리프가 깨지는지는 e2e/emoji-glyphs.spec.ts 가 렌더해서 따로 잰다. 둘은 짝이다.)
//
// 예외 2가지(Icon.tsx 머리말):
//   ① 카드 수트(♠♥♦♣ 및 흰 변형 ♤♧) — 이모지가 아니라 포커 도메인 기호다.
//   ② 랭킹 상점 마크 — 닉네임 앞에 **문자열로 결합**돼 유통되는 유저 보유 아이템이라
//      SVG 로 바꾸면 이미 산 사람의 아이템이 사라진다.
// 그 밖에는 Icon.tsx 의 아이콘을 쓴다(LUCIDE 맵에 한 줄, https://lucide.dev).
//
// ⚠ 이 파일은 앱 코드가 임포트하지 않는다(게이트 전용) — 번들에 들어가지 않는다.

/** 이모지·기호 코드포인트 구간(누락 없이). 순수 텍스트 기호는 ALLOWED_CP 로 뺀다. */
const RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1f000, 0x1faff], // 카드/마작/픽토그래프 전역(🂠 U+1F0A0 · 🪙 U+1FA99 포함)
  [0x2600, 0x27bf],   // 기타 기호 + 딩뱃(⚡ ⛔ ✨ ✎ …)
  [0x2b00, 0x2bff],   // 기타 기호·화살표 B(⭐ …)
  [0x2300, 0x23ff],   // 기타 기술 기호(⌘ ⏱ ⏰ ⏸ …)
  [0x2900, 0x297f],   // 보조 화살표 B(⤡ ⤢ — 클락 전체화면 토글이 여기에 있었다)
  [0x1f1e6, 0x1f1ff], // 지역 표시(국기)
  [0xfe0e, 0xfe0f],   // 변이 선택자(텍스트/이모지 표현)
  [0x20e3, 0x20e3],   // 키캡 결합
  [0x200d, 0x200d],   // ZWJ(가족·직업 이모지 시퀀스)
  [0x2049, 0x2049], [0x203c, 0x203c], [0x2139, 0x2139], [0x2122, 0x2122],
  [0x24c2, 0x24c2], [0x3030, 0x3030], [0x303d, 0x303d], [0x3297, 0x3299],
];

/**
 * 모양이 폰트마다 갈리지 않는 '텍스트 기호'는 규약 대상이 아니다.
 * 화살표·체크·엑스·별·기하도형은 어느 시스템 폰트에나 단색 글리프로 있고 currentColor 를 따른다
 * (실측: e2e 프로브에서 색수 1 = 단색, 두부 아님 — 그래서 테마도 정상적으로 따라간다).
 */
const ALLOWED_CP: ReadonlySet<number> = new Set([
  0x2190, 0x2191, 0x2192, 0x2193, 0x2194, 0x2195, 0x2196, 0x2197, 0x2198, 0x2199,
  0x21a9, 0x21aa, 0x21b3, 0x21ba, 0x21d2,
  0x2713, 0x2714, 0x2715, 0x2717, 0x2718, 0x271a,
  0x2605, 0x2606,
  0x25a0, 0x25b2, 0x25b6, 0x25be, 0x25bc, 0x25cb, 0x25cf,
]);

/** 예외 ① 카드 수트 — 포커 도메인 기호라 그대로 둔다(교체하면 오히려 나빠진다). */
export const SUIT_CP: ReadonlySet<number> = new Set([
  0x2660, 0x2661, 0x2662, 0x2663, 0x2664, 0x2665, 0x2666, 0x2667,
]);

/**
 * 예외 ② 랭킹 상점 마크(lib/shopMarks.ts · loyalty.ts SHOP_MARKS 의 emoji 필드).
 * ⚠ 여기 값을 마음대로 늘리지 마라 — 상점 마크를 늘리는 것은 서버 `public.shop_marks` 결정이고,
 *   이 목록은 그 사본을 '이미 유통 중인 보유 아이템'으로만 승인한다.
 */
export const SHOP_MARK_CP: ReadonlySet<number> = new Set([
  0x1f451, // 👑 크라운
  0x1fa99, // 🪙 첫 스택
  0x1f0cf, // 🃏 조커
  0x1f525, // 🔥 핫
  0x1f3af, // 🎯 타겟
  0x1f680, // 🚀 러시
  0x1f31f, // 🌟 스타 플레이어
  0x1f48e, // 💎 다이아 핸드
  0x26a1,  // ⚡ 터보
  0x1f988, // 🦈 샤크
  0x1f3c6, // 🏆 챔피언
  0x1f340, // 🍀 네잎클로버
  0x1f30a, // 🌊 웨이브
  0x1f409, // 🐉 드래곤
  0x1f319, // 🌙 초승달
  0x1f98b, // 🦋 나비
  0x1f3b5, // 🎵 리듬
]);

export function isPolicyEmoji(cp: number): boolean {
  if (ALLOWED_CP.has(cp)) return false;
  return RANGES.some(([a, b]) => cp >= a && cp <= b);
}

/** 문자열에서 규약 대상 코드포인트를 뽑는다(중복 포함 — 개수가 기준선의 단위다). */
export function findEmoji(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isPolicyEmoji(cp)) out.push(cp);
  }
  return out;
}

export const hex = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0');
