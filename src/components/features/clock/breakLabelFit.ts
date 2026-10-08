// 클락 TV CURRENT 칸의 브레이크 라벨 — 칸 폭에 맞춘 글자 크기(**순수 계산**, DOM 을 재지 않는다 · prizeFit.ts 와 같은 이유).
//
// 왜(2026-10-09 로티 3차 검수 P1): 라벨이 `whitespace-nowrap` + 6.4cqmin 고정이라 포스터 원문
//   'BREAK TIME 8 MINS / 1,000칩 레이스' 가 1920×1080 CURRENT 칸(내용 폭 450px)에서 1144px 로 그려져
//   NEXT 블라인드를 덮었다. 가장 짧은 'BREAK TIME 8 MINS'(642px)도 넘쳤다. 1280×720·세로 1080×1920 도 같다.
//
// 규칙(ClockStage BlindsRow): 칸 높이는 종전 한 줄 높이 H = clamp(24px, 6.4cqmin, 108px) 그대로 고정한다(다른 칸 위치 불변).
//   ① 한 줄에 들어가면 min(H, 칸 폭 ÷ em) 으로 한 줄.
//   ② 그 크기가 H/2.2 보다 작아지면 H/2.2 로 멈추고 **두 줄**(줄 높이 1.1 × 2줄 = H — 칸 높이 그대로).
//   ③ 두 줄로도 넘치면 말줄임(…).
//   하한 H/2.2 ≈ 2.9cqmin(1920×1080 31px · 1280×720 21px · 4K 는 H 가 108px 상한이라 49px) — 같은 보드에서 테이블 거리에서
//   읽히라고 둔 ANTE 숫자(3.4cqmin)·우측 지표 숫자(3.6cqmin) 바로 아래 층이고, 머리줄 대회명(2.6cqmin)보다 크다.
//   이보다 작게 줄여 글자를 다 싣는 것보다 먼 자리에서 읽히는 쪽을 택했다(그 너머는 말줄임).
//   줄 높이를 1 이 아니라 1.1 로 둔 이유: 1 이면 말줄임 때 셋째 줄 머리가 둘째 줄 아래로 비치고 내림 글자(p·g)가 잘렸다(실측 캡처).
//
// em 계수: 실제 보드 라벨과 같은 computed font(800 · tabular-nums)로 1920×1080 에서 글자별로 쟀다.
//   Pretendard 와 폰트 차단(폴백) 두 경우 중 **큰 값**을 써서 보수적으로 잡는다 — 추정이 실제보다 작으면
//   한 줄 크기로 두 줄이 되어 칸 높이를 넘기 때문이다(그때도 말줄임·칸 높이 고정이 마지막 가드다).
//   실측 예(on/off): 'BREAK TIME 8 MINS' 9.56/9.86em · 'BREAK TIME 8 MINS / 1,000칩 레이스' 17.02/17.93em.

const NARROW = new Set([...`Iijl.,:;!|'`]);
const SLIM = new Set([...'frt()/-"']);
const WIDE = new Set([...'MWmw&']);

/** 라벨 한 줄의 폭(em) 추정 — 실측보다 크거나 같게. */
export function breakLabelEm(text: string): number {
  let em = 0;
  for (const c of text) {
    if (c === ' ') em += 0.35;
    else if (c > '~') em += 1;              // 한글·기타 비ASCII(폴백 실측 1.0em)
    else if (WIDE.has(c)) em += 1.03;
    else if (NARROW.has(c)) em += 0.33;
    else if (SLIM.has(c)) em += 0.45;
    else if (c >= '0' && c <= '9') em += 0.67;
    else if (c >= 'a' && c <= 'z') em += 0.63;
    else em += 0.72;                        // 대문자·나머지 기호
  }
  return Math.max(1, em);
}

/** 라벨 칸 높이 = 종전 한 줄 글자 크기(leading-none). 두 줄일 때 글자는 이것 ÷ 2.2(줄 높이 1.1 × 2). */
export const BREAK_LABEL_H = 'clamp(24px, 6.4cqmin, 108px)';
const BREAK_LABEL_FLOOR = `calc(${BREAK_LABEL_H} / 2.2)`;

/** CURRENT 칸 내용 폭(= --clk-half − 좌우 패딩 2×2cqmin)에 맞춘 글자 크기. */
export function breakLabelFontSize(text: string): string {
  const fit = `calc((var(--clk-half, 50cqw) - 4cqmin) / ${breakLabelEm(text).toFixed(3)})`;
  return `max(${BREAK_LABEL_FLOOR}, min(${BREAK_LABEL_H}, ${fit}))`;
}
