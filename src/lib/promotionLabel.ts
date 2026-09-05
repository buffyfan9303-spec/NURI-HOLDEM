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
}

const MAN = 10_000;

/** 할인액(원) → 배지 문구. 할인이 아니면 null. */
export function discountLabel(won: number | undefined | null): string | null {
  if (typeof won !== 'number' || !Number.isFinite(won) || won <= 0) return null;
  // 만 단위는 '정확히' 떨어질 때만 (55,000 → 5.5만 / 10,500 은 만 단위 금지 — 반올림 오표기)
  if (won >= MAN && won % 1_000 === 0) return `${(won / MAN).toLocaleString('ko-KR')}만 할인`;
  return `${Math.round(won).toLocaleString('ko-KR')}원 할인`;
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
  const sub = [discount ? badge : null, levelLabel(p.level), p.detail?.trim() || null]
    .filter((s): s is string => !!s)
    .join(' · ');
  return { pill: discount ?? badge, isDiscount: discount !== null, sub };
}
