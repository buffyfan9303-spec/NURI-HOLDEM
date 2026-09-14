// 프라이즈 열 규격 고르기 — **순수 계산**. DOM 을 재지 않는다.
//
// 왜 필요한가(오너 지시 #13, 2026-09-15): "20줄까지는 한 화면". 그런데 1단 20줄은 세로 예산을
//   195px 넘겨서(1920×1080 실측) 글자를 17% 줄여야 했다. 그 열은 폭 401px 중 잉크가 150px 뿐이라
//   **가로가 놀고 있었다** — 2단 × 10줄로 바꾸면 세로가 풀리고, 이번엔 **가로가 제약**이 된다.
//   따라서 "들어가는 가장 큰 규격"을 고르는 문제가 된다.
//
// 왜 재지 않고 계산하나: TV 는 상시 송출이라 렌더 후 측정 → 재배치(레이아웃 흔들림)를 하면 안 되고,
//   장이 10장이면 보이지 않는 9장까지 재야 한다. 글자 폭은 `tabular-nums` 라 **문자 수에 선형**이고,
//   폰트·간격이 전부 cqmin 이라 **해상도와 무관하게 같은 답**이 나온다 — 그래서 계산이 정확하다.
//
// 계수는 1920×1080 에서 실측해 역산했다(Pretendard · tabular-nums · cqmin = 10.8px).
//   · "1등"  place 36.09px @ 2.2cqmin → (1×0.655 + 0.864) × 2.2 × 10.8 = 36.09  ✔
//   · "2등"  place 31.17px @ 1.9cqmin → (1×0.655 + 0.864) × 1.9 × 10.8 = 31.17  ✔
//   · "999등" place 58.05px @ 1.9cqmin → (3×0.655 + 0.864) × 1.9 × 10.8 = 58.05 ✔
//   · "1,000,000,000"(13자) amount 171.34px @ 2.1cqmin → 13 × 0.581 × 2.1 × 10.8 = 171.3 ✔
//
// ⚠ 최악 행은 **가장 긴 등수 × 가장 긴 금액**이다. 200등짜리 대회의 마지막 장은 등수가 3자리라
//   첫 장만 보고 정하면 마지막 장에서 잘린다(실제로 처음 잰 값이 그 구멍이었다).
// ⚠ 2026-09-15 기준 운영에는 실상금이 없다(schedules approved=0건 · clock_states 프라이즈 최댓값 400).
//   **오픈 후 실제 상금이 들어오면 이 판정이 처음으로 진짜 시험받는다.**

/** 한 장에 싣는 순위 수 — 오너 지시: "20줄까지는 한 화면에서 보여주되". */
export const PRIZES_PER_PAGE = 20;
/** 2단일 때 좌단이 맡는 줄 수(나머지는 우단). 읽는 순서는 위→아래, 좌→우. */
export const PRIZE_LEFT_ROWS = 10;
/** 이 줄 수 이하는 **종전 그대로 1단**으로 그린다.
 *  오늘 한 장에 들어가던 모든 대회가 여기 해당한다 — 2단으로 바꾸면 **글자는 같아도 배치가 변해**
 *  화면이 달라진다. 오너가 요구한 것은 '20줄을 한 화면에' 이지 짧은 표를 두 단으로 쪼개는 것이 아니다.
 *  1단은 폭을 열 전체(401px)로 쓰므로 10자리 금액도 안 넘친다(최악 253px — 실측). */
export const PRIZE_ONE_COL_MAX = 15;

/** 프라이즈 열의 가로 예산(cqmin). 1920×1080 실측 401.33px ÷ cqmin 10.8 = 37.16. */
export const PRIZE_COL_CQ = 37.16;
/** 2단 사이 여백(cqmin). */
export const PRIZE_GUTTER_CQ = 1.5;
/** 한 행 안 등수↔금액 최소 여백(cqmin) — li 의 gap-[1.2cqmin] 과 같은 값이어야 한다. */
export const PRIZE_ROW_GAP_CQ = 1.2;

/** 글리프 폭 ÷ font-size (위 실측에서 역산). */
const W_DIGIT = 0.655;  // 등수 숫자 한 자
const W_UNIT = 0.864;   // '등' — 숫자가 아닌 place 는 글자당 이 값으로 **보수적으로** 잡는다
const W_AMT = 0.581;    // 금액 문자(숫자·콤마 평균)

export interface PrizeSpec {
  /** 규격 이름 — 테스트·디버그용. */
  key: 'wide' | 'mid' | 'narrow' | 'compact';
  minH: number; gap: number;
  place: number; amount: number;
  leadPlace: number; leadAmount: number;
}

/** 큰 것부터. `wide` 는 **오늘 15줄 이하가 쓰던 그 규격 그대로**다 — 그래야 회귀가 0 이다. */
export const PRIZE_SPECS: readonly PrizeSpec[] = [
  { key: 'wide',    minH: 3.2,  gap: 0.45, place: 1.9,  amount: 2.1,  leadPlace: 2.2,  leadAmount: 2.5  },
  { key: 'mid',     minH: 3.05, gap: 0.42, place: 1.8,  amount: 2.0,  leadPlace: 2.1,  leadAmount: 2.38 },
  { key: 'narrow',  minH: 2.85, gap: 0.38, place: 1.67, amount: 1.85, leadPlace: 1.94, leadAmount: 2.2  },
  { key: 'compact', minH: 2.6,  gap: 0.3,  place: 1.6,  amount: 1.75, leadPlace: 1.85, leadAmount: 2.05 },
];

export type PrizeRow = { place: string; amount: number };

/** 화면에 실제로 그려지는 등수 문자열 — ClockStage 의 렌더와 **같은 규칙**이어야 한다. */
export function prizePlaceText(place: string): string {
  return /^\d+$/.test(place) ? `${place}등` : place;
}

/** 등수 문자열의 폭 계수(font-size 배수). 숫자는 W_DIGIT, '등' 과 그 밖의 글자는 W_UNIT. */
export function placeWidthFactor(text: string): number {
  let w = 0;
  for (const ch of text) w += /\d/.test(ch) ? W_DIGIT : W_UNIT;
  return w;
}

/** 한 행이 먹는 가로(cqmin) — 등수 + 금액 + 행 내부 최소 여백. */
export function prizeRowCq(s: PrizeSpec, placeFactor: number, amountChars: number, lead: boolean): number {
  return placeFactor * (lead ? s.leadPlace : s.place)
    + amountChars * W_AMT * (lead ? s.leadAmount : s.amount)
    + PRIZE_ROW_GAP_CQ;
}

/** 이 규격으로 2단이 들어가는가.
 *
 *  ⚠ 최악 행을 두 가지로 나눠 본다 — 섞으면 과잉 보수가 되어 글자가 괜히 작아진다.
 *    · **1등 줄**: 글자만 한 단계 크고 등수는 언제나 `prizes[0]`(보통 "1등") 이다.
 *      여기에 "200등" 자릿수를 씌우면 실제로 존재하지 않는 행을 기준으로 규격을 떨어뜨린다.
 *    · **그 밖의 모든 줄**: 보통 글자 + **가장 긴 등수**(마지막 장의 "200등" 이 여기 걸린다).
 *  한 장은 `좌단 = max(1등 줄, 보통 줄)` · `우단 = 보통 줄` 이므로 아래 합이 상한이다.
 */
export function fitsTwoColumns(s: PrizeSpec, w: PrizeWorst): boolean {
  const lead = prizeRowCq(s, w.leadPlaceFactor, w.amountChars, true);
  const normal = prizeRowCq(s, w.placeFactor, w.amountChars, false);
  return Math.max(lead, normal) + normal + PRIZE_GUTTER_CQ <= PRIZE_COL_CQ;
}

export interface PrizeWorst {
  /** 1등 줄의 등수 폭 계수(= `prizes[0]`). */
  leadPlaceFactor: number;
  /** 모든 줄 중 가장 긴 등수의 폭 계수. */
  placeFactor: number;
  /** 가장 긴 금액의 문자 수(`toLocaleString()` 기준 — 콤마 포함). */
  amountChars: number;
  /** 보고·테스트용 원문. */
  leadPlaceText: string; placeText: string;
}

/** 판정에 쓰는 최악 값만 뽑는다 — 이 함수가 곧 "무엇을 최악으로 보는가"의 정의다. */
export function prizeWorst(prizes: readonly PrizeRow[]): PrizeWorst {
  let placeFactor = 0, placeText = '', amountChars = 0;
  for (const p of prizes) {
    const t = prizePlaceText(p.place);
    const f = placeWidthFactor(t);
    if (f > placeFactor) { placeFactor = f; placeText = t; }
    const n = p.amount.toLocaleString().length;
    if (n > amountChars) amountChars = n;
  }
  const leadPlaceText = prizes.length ? prizePlaceText(prizes[0].place) : '';
  return { leadPlaceFactor: placeWidthFactor(leadPlaceText), placeFactor, amountChars, leadPlaceText, placeText };
}

export interface PrizeLayout {
  /** 고른 규격. */
  spec: PrizeSpec;
  /** true = 2단 × 10줄, false = 1단 × 20줄(폴백). */
  twoCol: boolean;
  /** 판정에 쓴 최악 값 — 보고·테스트용. */
  worst: PrizeWorst;
}

/**
 * 이 상금표에 맞는 배치를 고른다.
 *
 * 2단이 들어가는 **가장 큰 규격**을 쓰고, 어떤 규격으로도 안 들어가면 **1단 20줄로 떨어진다**
 * (= 이 변경 이전과 같은 화면). 그래서 잘림은 구조적으로 나오지 않는다.
 */
export function pickPrizeLayout(prizes: readonly PrizeRow[]): PrizeLayout {
  const worst = prizeWorst(prizes);
  // 종전과 픽셀까지 같아야 하는 구간 — 여기서 맨 먼저 빠져나간다.
  if (prizes.length <= PRIZE_ONE_COL_MAX) return { spec: PRIZE_SPECS[0], twoCol: false, worst };
  for (const spec of PRIZE_SPECS) {
    if (fitsTwoColumns(spec, worst)) return { spec, twoCol: true, worst };
  }
  // 1단 폴백 — 20줄을 세로로 쌓아야 하므로 규격은 가장 좁은 것으로 고정한다.
  return { spec: PRIZE_SPECS[PRIZE_SPECS.length - 1], twoCol: false, worst };
}
