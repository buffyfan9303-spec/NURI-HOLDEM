// src/lib/posterDiscounts.ts — 포스터 할인 이벤트 → 장부 할인 프리셋(오너 지시 2026-09-06)
import type { DiscountPreset } from '../api/ledger';
import type { Promotion } from '../api/schedules';
import { discountTexts } from './promotionLabel';

/** 장부 할인 칸 수 상한. 바인은 1-based 자리번호(discountIndex)로 할인을 참조하므로 배열을 재배열할 수 없다. */
export const MAX_LEDGER_DISCOUNTS = 5;
/** 장부 할인 라벨 입력칸(maxLength=20)과 같은 상한 — 가져온 라벨만 더 길면 칩이 표를 밀어낸다. */
const LABEL_MAX = 20;

export interface PosterDiscountImport {
  /** 병합 결과 — 기존 칸은 그대로 두고 뒤에 덧붙인다. */
  discounts: DiscountPreset[];
  /** 실제로 채운 칸 수 */
  added: number;
  /** 5칸 상한에 걸려 못 넣은 할인 수 */
  skipped: number;
  /** 같은 라벨·금액이 이미 있어 건너뛴 수(두 번 눌러도 중복되지 않게) */
  duplicates: number;
}

/**
 * 포스터 프로모션 중 **할인액이 있는 것**(discountWon > 0)만 장부 할인 프리셋으로 바꾼다.
 * 금액 없는 프로모션은 종전대로 그냥 안내 문구라 건너뛴다.
 *
 * ⚠ 기존 칸은 절대 덮어쓰지 않는다(덧붙이기만). 이미 기록된 바인이 자리번호로 그 칸의 금액을
 *   참조하므로, 칸의 내용이 바뀌면 지난 바인의 계산 금액이 조용히 달라진다.
 *   그래서 비워 둔 중간 칸도 재사용하지 않고 그대로 둔다.
 */
/** 한 프로모션이 장부 할인 칸에 실제로 넣을 라벨 — 미리보기와 삽입이 같은 말을 하게 하는 단일 출처.
 *  버튼이 '1LV 바인 5만 할인' 을 예고하고 실제로는 '1레벨' 이 들어가면, 업주는 가져오기가 이름을
 *  임의로 바꾼 것으로 읽고 '이미 있는 할인인지' 눈대조가 어긋난다(중복 판정도 라벨 기준이다). */
export function ledgerLabelOf(p: Promotion): string {
  const t = discountTexts(p);
  const own = p.title?.trim() || '';
  const handWritten = own && own !== t.title && own.length <= LABEL_MAX ? own : '';
  return (handWritten || t.ledger || own || p.badge?.trim() || '할인').slice(0, LABEL_MAX);
}

export function discountsFromPromotions(
  promotions: readonly Promotion[] | undefined,
  existing: readonly DiscountPreset[] = [],
): PosterDiscountImport {
  const discounts = existing.slice();
  let added = 0, skipped = 0, duplicates = 0;
  for (const p of promotions ?? []) {
    const amount = Math.round(p?.discountWon ?? 0);
    if (!(amount > 0)) continue;
    // 라벨 폴백: 유형 라벨 → 내용 → 배지 → '할인'. 장부 결제창 칩에 그대로 뜨는 글자다.
    // 유형 라벨을 앞에 두는 이유: 내용은 40자까지 허용이라('1LV 바인 5만 · 오픈 전 예약자') 칩이 표를 밀어낸다.
    // 유형이 없는 기존 데이터는 ledger 가 null 이라 종전 폴백(내용 → 배지 → '할인') 그대로다.
    // 라벨 우선순위: **업주가 직접 쓴 짧은 내용** → 유형 라벨 → 내용 → 배지 → '할인'.
    // ⚠ 유형 라벨을 무조건 앞세우면 '여성 첫 방문 5만'·'남성 첫 방문 5만' 이 둘 다 '첫 방문'이 되어
    //   아래 중복 판정(라벨+금액)에 걸려 **두 번째가 조용히 사라진다**(자동 적용 레벨까지 함께 유실).
    //   유형 라벨은 내용이 자동 생성값이거나 칩에 실리기엔 긴 경우에만 쓴다.
    const label = ledgerLabelOf(p);
    // 자동 적용 레벨이 다르면 장부에서 다르게 동작하는 프리셋이다 — 같은 라벨·금액이어도 중복이 아니다.
    const level = Math.max(0, Math.round(p.level ?? 0));
    if (discounts.some((d) => d.amount === amount && (d.label ?? '') === label && (d.level ?? 0) === level)) { duplicates++; continue; }
    if (discounts.length >= MAX_LEDGER_DISCOUNTS) { skipped++; continue; }
    discounts.push({ label, amount, level });
    added++;
  }
  return { discounts, added, skipped, duplicates };
}
