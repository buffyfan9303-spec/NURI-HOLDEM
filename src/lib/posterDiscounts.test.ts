import { describe, expect, it } from 'vitest';
import { discountsFromPromotions, MAX_LEDGER_DISCOUNTS } from './posterDiscounts';
import type { Promotion } from '../api/schedules';

const p = (over: Partial<Promotion> = {}): Promotion => ({ title: '할인 이벤트', ...over });

describe('discountsFromPromotions', () => {
  it('빈 목록·undefined 는 기존 할인을 그대로 돌려준다', () => {
    const cur = [{ label: '1레벨', amount: 50_000, level: 1 }];
    expect(discountsFromPromotions(undefined, cur)).toEqual({ discounts: cur, added: 0, skipped: 0, duplicates: 0 });
    expect(discountsFromPromotions([], cur).discounts).toEqual(cur);
  });

  it('discountWon 이 없거나 0 인 프로모션은 제외한다(그냥 안내 문구)', () => {
    const r = discountsFromPromotions([p({ title: '얼리칩 증정' }), p({ title: '무료', discountWon: 0 })]);
    expect(r).toEqual({ discounts: [], added: 0, skipped: 0, duplicates: 0 });
  });

  it('title → badge → 할인 순으로 라벨을 폴백하고 level 0/미지정은 0 으로 정규화한다', () => {
    const r = discountsFromPromotions([
      p({ badge: '5만', title: '1LV 바인 5만', discountWon: 50_000, level: 1 }),
      p({ badge: '3만', title: '  ', discountWon: 30_000 }),
      p({ badge: '', title: '', discountWon: 20_000, level: 0 }),
    ]);
    expect(r.discounts).toEqual([
      { label: '1LV 바인 5만', amount: 50_000, level: 1 },
      { label: '3만',          amount: 30_000, level: 0 },
      { label: '할인',         amount: 20_000, level: 0 },
    ]);
    expect(r.added).toBe(3);
  });

  it('⚠ 업주가 직접 쓴 짧은 내용은 유형 라벨보다 우선한다 — 같은 유형의 서로 다른 할인이 사라지면 안 된다', () => {
    const r = discountsFromPromotions([
      p({ discountType: 'firstVisit', title: '여성 첫 방문 5만 할인', discountWon: 50_000 }),
      p({ discountType: 'firstVisit', title: '남성 첫 방문 5만 할인', discountWon: 50_000 }),
    ]);
    // 둘 다 '첫 방문'으로 뭉치면 라벨+금액 중복 판정에 걸려 두 번째가 조용히 사라진다
    expect(r.discounts.map((d) => d.label)).toEqual(['여성 첫 방문 5만 할인', '남성 첫 방문 5만 할인']);
    expect(r.added).toBe(2);
    expect(r.duplicates).toBe(0);
  });

  it('⚠ 라벨·금액이 같아도 자동 적용 레벨이 다르면 장부에서 다르게 동작한다 — 중복이 아니다', () => {
    const r = discountsFromPromotions([
      p({ discountType: 'firstBuyin', title: '첫 바인 5만 할인', discountWon: 50_000 }),
      p({ discountType: 'firstBuyin', title: '첫 바인 5만 할인', discountWon: 50_000, level: 3 }),
    ]);
    expect(r.discounts).toEqual([
      { label: '첫 바인', amount: 50_000, level: 0 },
      { label: '첫 바인', amount: 50_000, level: 3 },
    ]);
    expect(r.added).toBe(2);
  });

  it('내용이 라벨 상한(20자)을 넘으면 유형 라벨로 내린다', () => {
    const r = discountsFromPromotions([
      p({ discountType: 'level', title: '1LV 바인 5만 할인 · 오픈채팅 사전예약자 한정', discountWon: 50_000, level: 1 }),
    ]);
    expect(r.discounts[0].label).toBe('1레벨');
  });

  it('5칸 상한을 넘기지 않고, 남은 것은 skipped 로 알린다', () => {
    const many = Array.from({ length: 7 }, (_, i) => p({ title: `할인${i}`, discountWon: (i + 1) * 10_000 }));
    const r = discountsFromPromotions(many, [{ label: '기존', amount: 10_000, level: 0 }]);
    expect(r.discounts).toHaveLength(MAX_LEDGER_DISCOUNTS);
    expect(r.added).toBe(4);
    expect(r.skipped).toBe(3);
  });

  it('기존 칸을 덮지 않고 뒤에 덧붙인다 — 지난 바인이 자리번호로 참조하기 때문', () => {
    const cur = [{ label: '1레벨', amount: 50_000, level: 1 }, { label: '', amount: 0, level: 0 }];
    const r = discountsFromPromotions([p({ title: '2레벨', discountWon: 30_000, level: 2 })], cur);
    expect(r.discounts).toEqual([...cur, { label: '2레벨', amount: 30_000, level: 2 }]);
  });

  it('자동 생성 문구는 유형의 짧은 라벨로 바뀐다 — 긴 내용이 장부 칩에 실려 표를 밀지 않게', () => {
    const r = discountsFromPromotions([
      // 자동 생성값과 같은 내용 → 유형 라벨로 짧게
      p({ discountType: 'level', badge: '5만', title: '1LV 바인 5만 할인', discountWon: 50_000, level: 1 }),
      p({ discountType: 'firstBuyin', title: '첫 바인 7만 할인', discountWon: 70_000 }),
      p({ discountType: 'firstVisit', title: '첫 방문 5만 할인', discountWon: 50_000 }),
      p({ discountType: 'rebuy', title: '리바인 3만 할인', discountWon: 30_000 }),
      p({ discountType: 'advance', title: '사전예약 2만 할인', discountWon: 20_000 }),
    ]);
    expect(r.discounts.map((d) => d.label)).toEqual(['1레벨', '첫 바인', '첫 방문', '리바인', '사전예약']);
    expect(r.added).toBe(5);
  });

  it("'직접 입력' 유형은 라벨을 만들지 않아 종전 폴백(내용 → 배지)을 그대로 탄다", () => {
    const r = discountsFromPromotions([
      p({ discountType: 'custom', badge: '할인', title: '할인 이벤트', discountWon: 50_000 }),
      p({ discountType: 'custom', badge: 'NEW', title: '', discountWon: 30_000 }),
    ]);
    expect(r.discounts.map((d) => d.label)).toEqual(['할인 이벤트', 'NEW']);
  });

  it('같은 라벨·금액은 중복으로 건너뛴다(두 번 눌러도 안 늘어난다)', () => {
    const promos = [p({ title: '1레벨', discountWon: 50_000, level: 1 })];
    const once = discountsFromPromotions(promos, []);
    const twice = discountsFromPromotions(promos, once.discounts);
    expect(twice.discounts).toEqual(once.discounts);
    expect(twice).toMatchObject({ added: 0, duplicates: 1 });
  });
});
