// src/components/features/gto/chip.ts — GTO·SPOT 칩(알약) 한 벌 기준. 2026-09-24 오너 G3 "비슷한 알약 전부 같은 기준".
//
// 기준: **보이는 높이 32px · 누르는 높이 44px.** 칩 쪽에는 `h-[32px]`(글자가 접힐 수 있으면 `min-h-[32px]`)과 이 클래스만 붙인다.
//
// 왜 공용 `.tap-y-44`(index.css, ±6px)가 아닌가 — 실측(2026-09-24, elementFromPoint 0.25px 스캔):
//   ::before 의 절대배치 기준은 **padding box** 라 테두리(1px) 있는 칩에서는 위아래 확장이 실효 5px 로 준다.
//   36px 칩이 아래로 4.x px 까지만 잡혔고, 34px(h-8) 칩은 44.75, 32px 칩이면 42 로 44 계약 미달이다.
//   여기서는 8px 을 넓혀 테두리가 있어도 실효 7px(32+14=46), 없으면 8px(48) 이다.
//   7px(딱 44)로 두었더니 e2e/gto-tab-verify 의 정수 픽셀 스캔(1px 단위·반올림)이 소수 좌표에서 43 으로 재 빨개졌다 — 여유 2px.
// 쓰는 쪽 규칙:
//   · 두 줄로 접히는 칩 묶음은 줄 간격 `gap-y-3.5`(14.875px) 이상 — 위아래 확장(실효 7+7)이 겹치면 아랫줄이 윗줄 칩의 히트를 가로챈다.
//   · 가로 스크롤(overflow-x-auto) 레일은 위아래도 자른다 — 레일에 `py-1.5 -my-1.5`(6.375px) 로 확장이 들어갈 자리를 준다(잘려도 32+6.375×2 = 44.75px).
// 이 문자열은 Tailwind content 스캔(.ts 포함)에 그대로 잡힌다 — 조립하지 말고 이 한 줄을 그대로 쓴다.
export const CHIP_HIT = "relative before:absolute before:inset-x-0 before:-inset-y-[8px] before:content-['']";
