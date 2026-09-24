/**
 * POST-DETAIL-TRIM(2026-09-24 오너 "메인과 댓글을 덮는 넓은 칸 뒤에 아우라 LED 글로우를 조금 더") —
 * 게시글 상세(PostDetailModal)와 장터 상세(ListingDetailModal)의 **큰 카드 뒤 LED** 한 벌.
 *
 * 새 그림자를 만들지 않는다: 기존 `[data-aura]` hero(index.css, outer box-shadow)를 그대로 켜고
 * 세기 변수만 한 단계 올린다 — 다크 34px/.19 → 40px/.22, 라이트 22px/.09 → 26px/.12.
 * (e2e/aura-led AURA-03 의 hero 상한 48px/.22 안이다.)
 * index.css 는 공용이라 건드리지 않는다: 유틸(utilities 레이어)이 base 의 `[data-aura-level='hero']` 값을 이기고,
 * 라이트는 `html.light [data-aura-level='hero']`(0,2,1)와 같은 특이도의 `[html.light_&]:` 로 뒤에서 덮는다.
 * 고대비·강제색·투명도 줄이기에서 꺼지는 것은 index.css 규칙이 그대로 맡는다.
 *
 * PC(lg+)에서는 끈다 — 게시글 카드가 lg 에서 `display:contents` 라 댓글 칸만 빛나는 짝짝이가 된다.
 * ⚠ 호스트에 다른 box-shadow(card-aura·shadow-*)가 있으면 서로 **교체**된다 — 그런 호스트에는 붙이지 마라.
 */
export const DETAIL_CARD_AURA = { 'data-aura': '', 'data-aura-level': 'hero' } as const;

export const DETAIL_CARD_AURA_CLASS =
  '[--aura-led-blur:40px] [--aura-led-a:0.22] [html.light_&]:[--aura-led-blur:26px] [html.light_&]:[--aura-led-a:0.12] lg:shadow-none';
