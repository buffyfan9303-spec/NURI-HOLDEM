// src/lib/promotionLabel.ts
// 포스터 상세 '프로모션 / 얼리칩' 한 줄을 화면 요소로 푸는 단 하나의 규칙(오너 지시 2026-09-06).
//
// 왜 순수 함수인가: 손님이 이 목록에서 제일 알고 싶은 것은 "얼마 싸지는가" 하나다.
//   그런데 배지는 전부 같은 색·같은 크기라 '50% 할인'과 'NEW'가 같은 무게로 읽혔다.
//   금액을 뽑아내는 규칙이 JSX 안에 흩어지면 '5만'과 '50,000원'이 화면마다 갈린다 —
//   그래서 문구 생성만 여기로 내리고 화면은 결과만 그린다.
//
// ⚠ 금액은 §28 상 표시 대상이다(참가비 할인 = 상품 가격 정보). 지우지 않는다.
//   대신 '환전·현금·수익' 계열 단어는 쓰지 않는다 — '할인' 한 단어로만 말한다.
//
// ⚠ 반올림으로 가격을 틀리게 말하지 않는다. 만 단위 표기는 **정확히 떨어질 때만** 쓴다
//   (10,500원을 '1.1만 할인'으로 부르면 그건 오표기다). 나머지는 원 단위 그대로 적는다.

/** 한 줄 프로모션의 최소 형태. api/schedules 의 Promotion 과 구조가 같다(lib→api 역방향 import 회피). */
export interface PromotionLike {
  badge?: string;
  title: string;
  detail?: string;
  /** 할인액(원). 0·미지정 = 그냥 안내 문구 */
  discountWon?: number;
  /** 자동 적용 기준 레벨(N레벨까지). 0·미지정 = 조건 없음 */
  level?: number;
  /** 할인유형. 미지정 = 유형 개념이 없던 기존 데이터('직접 입력'과 같게 다룬다) */
  discountType?: DiscountType;
}

const MAN = 10_000;

/** 할인액(원) → 금액 문구('5만' · '10,500원'). 할인이 아니면 null.
 *  태그·내용·배지가 **같은 금액 표기**를 쓰게 하는 단 하나의 규칙(화면마다 '5만'/'50,000원'이 갈리던 원인). */
export function discountAmountText(won: number | undefined | null): string | null {
  if (typeof won !== 'number' || !Number.isFinite(won) || won <= 0) return null;
  // 만 단위는 '정확히' 떨어질 때만 (55,000 → 5.5만 / 10,500 은 만 단위 금지 — 반올림 오표기)
  if (won >= MAN && won % 1_000 === 0) return `${(won / MAN).toLocaleString('ko-KR')}만`;
  return `${Math.round(won).toLocaleString('ko-KR')}원`;
}

/** 할인액(원) → 배지 문구. 할인이 아니면 null. */
export function discountLabel(won: number | undefined | null): string | null {
  const amount = discountAmountText(won);
  return amount === null ? null : `${amount} 할인`;
}

/** 적용 레벨 → '3레벨까지'. 없으면 null. */
export function levelLabel(level: number | undefined | null): string | null {
  if (typeof level !== 'number' || !Number.isFinite(level) || level <= 0) return null;
  return `${Math.round(level)}레벨까지`;
}

export interface PromotionView {
  /** 왼쪽 배지 열 문구 — 할인이면 금액, 아니면 기존 배지. null = 배지 없음 */
  pill: string | null;
  /** 할인 배지인가 — 강조 톤을 결정한다 */
  isDiscount: boolean;
  /** 제목 아래 보조 줄(배지·적용 레벨·설명). 빈 문자열이면 줄을 그리지 않는다 */
  sub: string;
}

/**
 * 프로모션 한 줄 → 화면 요소.
 * 할인액이 있으면 금액이 배지 자리를 가져가고, 원래 배지는 보조 줄로 내려간다(정보를 버리지 않는다).
 * 할인액이 없는 기존 데이터는 배지·제목·설명이 종전 그대로 살아 있다.
 */
export function promotionView(p: PromotionLike): PromotionView {
  const discount = discountLabel(p.discountWon);
  const badge = p.badge?.trim() || null;
  // 할인유형이 채운 태그는 대개 금액 그대로('5만')다. 알약이 이미 '5만 할인'이라고 말했으므로
  // 보조 줄에서 같은 말을 두 번 하지 않는다 — 남는 정보('얼리칩' 같은 손글씨 태그)만 내려보낸다.
  const carried = discount && badge !== discountAmountText(p.discountWon) ? badge : null;
  const sub = [carried, levelLabel(p.level), p.detail?.trim() || null]
    .filter((s): s is string => !!s)
    .join(' · ');
  return { pill: discount ?? badge, isDiscount: discount !== null, sub };
}

// ── 할인유형 ──────────────────────────────────────────────────────────────────
// 오너 지시(2026-09-06): "할인 이벤트 등록할 때에 할인유형과 태그를 스스로 입력하게".
// 유형 하나를 고르면 **태그(배지) · 내용(포스터 한 줄) · 장부 라벨** 세 문구가 한 규칙에서 나온다.
//
// 왜 문구가 셋이나 되나: 같은 할인이 자리마다 다른 폭을 갖기 때문이다.
//   태그는 6자(입력칸 maxLength) · 내용은 40자 · 장부 칩 라벨은 20자(placeholder 가 '예) 1레벨').
//   어제까지는 내용 40자가 그대로 장부 칩에 실려 표를 밀어냈다. 자리마다 문구가 달라야 하고,
//   그 대응이 한 곳에 있어야 '5만'과 '50,000원'처럼 화면마다 갈리지 않는다.
//
// ⚠ 유형은 **선택**이다. 미지정(= 지금까지 저장된 프로모션 전부)은 'custom' 과 같게 다뤄
//   태그·내용·장부 라벨 무엇도 만들지 않는다 — 어제까지의 동작 그대로 열리고 저장된다.

/** 매장이 실제로 거는 참가비 할인의 종류. 'custom' = 유형 없이 손으로 쓰는 줄. */
export type DiscountType = 'level' | 'firstBuyin' | 'firstVisit' | 'rebuy' | 'advance' | 'custom';

/** 선택 목록 — 배열 순서가 곧 화면 순서. '직접 입력'은 맨 끝(도피처지 기본값이 아니다). */
export const DISCOUNT_TYPES: readonly { value: DiscountType; name: string }[] = [
  { value: 'level',      name: '레벨 할인' },
  { value: 'firstBuyin', name: '첫 바인 할인' },
  { value: 'firstVisit', name: '첫 방문 할인' },
  { value: 'rebuy',      name: '리바인 할인' },
  { value: 'advance',    name: '사전예약 할인' },
  { value: 'custom',     name: '직접 입력' },
];

/** 태그 입력칸(maxLength=6)과 같은 상한 — 넘치면 포스터 배지 열이 두 줄로 터진다. */
const BADGE_MAX = 6;
/** 내용 입력칸(maxLength=40)과 같은 상한. */
const TITLE_MAX = 40;

/** 금액이 태그에 못 들어갈 때 쓰는 유형 약칭(6자 이내). null = 자동으로 채우지 않는다. */
const TYPE_BADGE: Record<DiscountType, string | null> = {
  level: '레벨', firstBuyin: '첫바인', firstVisit: '첫방문', rebuy: '리바인', advance: '사전예약', custom: null,
};

/** 장부 할인 라벨(칩에 그대로 실리므로 짧게). 레벨 할인만 레벨 번호로 갈린다. */
const TYPE_LEDGER: Record<DiscountType, string | null> = {
  level: '레벨 할인', firstBuyin: '첫 바인', firstVisit: '첫 방문', rebuy: '리바인', advance: '사전예약', custom: null,
};

/** 포스터 상세에 보이는 한 줄. 금액이 있으면 문구에 넣는다(§28 — 참가비 할인액은 상품 가격 정보라 표시 대상). */
function titleOf(type: DiscountType, amount: string | null, level: number): string | null {
  switch (type) {
    // ⚠ 금액이 있어도 '할인'을 빼지 않는다. '첫 바인 5만'은 참가비 8만 대회에서
    //   '첫 바인은 5만'(실제로는 5만을 깎아 3만)으로 읽힌다 — 제목 줄만 공유되면 가격 오표기다.
    case 'level':      return level > 0 ? `${level}LV 바인 ${amount ? `${amount} ` : ''}할인` : `레벨 ${amount ? `${amount} ` : ''}할인`;
    case 'firstBuyin': return `첫 바인 ${amount ? `${amount} ` : ''}할인`;
    case 'firstVisit': return `첫 방문 ${amount ? `${amount} ` : ''}할인`;
    case 'rebuy':      return `리바인 ${amount ? `${amount} ` : ''}할인`;
    case 'advance':    return `사전예약 ${amount ? `${amount} ` : ''}할인`;
    default:           return null; // custom — 사람이 쓴 것을 건드리지 않는다
  }
}

export interface DiscountTexts {
  /** 태그(배지) — 6자 이내. null = 자동으로 채우지 않는다 */
  badge: string | null;
  /** 내용(포스터 상세 한 줄) — 40자 이내. null = 자동으로 채우지 않는다 */
  title: string | null;
  /** 장부 할인 라벨 — 20자 이내. null = 종전 폴백(내용 → 태그 → '할인') */
  ledger: string | null;
}

/**
 * 할인유형 + 할인액 + 적용 레벨 → 태그 · 내용 · 장부 라벨.
 * 유형이 없거나 '직접 입력'이면 셋 다 null 이다(하위호환).
 */
export function discountTexts(p: PromotionLike): DiscountTexts {
  const type = p.discountType ?? 'custom';
  const amount = discountAmountText(p.discountWon);
  const level = typeof p.level === 'number' && Number.isFinite(p.level) ? Math.max(0, Math.round(p.level)) : 0;
  // 금액이 태그 폭을 넘으면(예: '10,500원' 8자) 유형 약칭으로 내린다 — 잘린 태그보다 낫다.
  const badge = amount !== null && amount.length <= BADGE_MAX ? amount : TYPE_BADGE[type];
  const title = titleOf(type, amount, level);
  const ledger = type === 'level' && level > 0 ? `${level}레벨` : TYPE_LEDGER[type];
  return { badge, title: title === null ? null : title.slice(0, TITLE_MAX), ledger };
}

/**
 * 프로모션 한 줄에 변경(유형·할인액·레벨)을 적용하면서 태그·내용을 다시 만든다.
 *
 * ⚠ **사람이 손으로 고친 값은 덮지 않는다.** 판정 기준은 '지금 값이 비어 있거나,
 *   바뀌기 직전 상태가 만들었을 자동값과 똑같은가'. 한 번이라도 직접 고치면
 *   그 값은 그 뒤로 자동 갱신 대상에서 빠진다 — 업주가 공들여 쓴 문구를 유형 하나 바꿨다고
 *   지워버리면 그게 곧 데이터 유실이다(어제까지 배지에만 있던 규칙을 내용에도 그대로 적용).
 */
export function retypePromotion(cur: PromotionLike, patch: Partial<PromotionLike>): PromotionLike {
  const before = discountTexts(cur);                 // 바뀌기 직전 상태가 만들었을 문구
  const next = { ...cur, ...patch };
  const auto = discountTexts(next);                  // 바뀐 뒤 만들어야 할 문구
  const keepBadge = !!cur.badge?.trim() && cur.badge !== before.badge;
  const keepTitle = !!cur.title?.trim() && cur.title !== before.title;
  // ⚠ 자동 태그는 '갱신'뿐 아니라 '비우기'까지 해야 한다. 금액을 10,500원처럼 태그 폭을 넘는 값으로
  //   바꾸면 auto.badge 가 유형 약칭으로 내려가는데, 그때 옛 금액 태그('5만')를 그대로 두면
  //   손님 화면의 할인 표기가 실제 금액과 어긋난다(§28 가격 고지). 손으로 고친 태그는 그대로 둔다.
  const amountChanged = patch.discountWon !== undefined && patch.discountWon !== cur.discountWon;
  return {
    ...next,
    ...(!keepBadge && (auto.badge !== null || amountChanged) ? { badge: auto.badge ?? '' } : {}),
    ...(auto.title !== null && !keepTitle ? { title: auto.title } : {}),
  };
}
