import { describe, expect, it } from 'vitest';
import { discountsFromPromotions, linkedPosterDiscounts, MAX_LEDGER_DISCOUNTS } from './posterDiscounts';
import type { Promotion } from '../api/schedules';
import { autoDiscountIndex, discountAllowed, buyinFinance, nonSplitSnapshot, type LedgerBuyin } from '../api/ledger';

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
    // W-28(2026-09-30) — 유형 '첫 바인' 은 장부의 적용 조건(kind)으로도 실린다.
    expect(r.discounts).toEqual([
      { label: '첫 바인', amount: 50_000, level: 0, kind: 'firstBuyin' },
      { label: '첫 바인', amount: 50_000, level: 3, kind: 'firstBuyin' },
    ]);
    expect(r.added).toBe(2);
  });

  it('KW-1b — 유형 「첫 리바인」 도 장부 적용 조건(kind=firstRebuy)으로 실린다', () => {
    const r = discountsFromPromotions([p({ discountType: 'firstRebuy', title: '첫 리바인 5만 할인', discountWon: 50_000 })]);
    expect(r.discounts).toEqual([{ label: '첫 리바인', amount: 50_000, level: 0, kind: 'firstRebuy' }]);
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

// PIPE-F1/F2(audit-open-1009 · 오너 A-055 "이벤트·얼리·할인이 장부에 바로") — 포스터를 연결하면 할인 칸이 바로 그 포스터 것이 된다.
//   실행: npx vitest run src/lib/posterDiscounts.test.ts · 화면 배선(자동 연동·직전 게임 프리필 순서)은 e2e/ledger-poster-discount-1009.spec.ts.
// 운영 포스터 d4a68be7(로티 단독 깐부전 2026-10-09)의 promotions 그대로 — 할인액 있는 3개 + 안내 문구 6개.
const KKANBU_PROMOS: Promotion[] = [
  { badge: '5만', level: 1, title: '1LV 바인 5만 할인', detail: '전체이벤트 · 사전예약 · 0.5엔트리 적용', discountWon: 50_000, discountType: 'level' },
  { badge: '7만', level: 16, title: '첫 바인 3만 할인', detail: '첫바인은 무조건 7만으로 대동단결 · 0.7엔트리 적용', discountWon: 30_000, discountType: 'firstBuyin' },
  { badge: '팀', title: '팀 리바인 1회 5만', detail: '팀이벤트 · 1LV에 두 명 바인 완료 시 해당 팀 "리바인 1회" 5만', discountWon: 50_000, discountType: 'rebuy' },
  { badge: '팀', title: '9LV 이전 팀 결성', discountType: 'custom' },
  { badge: '핀볼', title: '17LV 이전 핀볼', discountType: 'custom' },
  { badge: '바인킹', title: '바인킹 이벤트 (팀·개인 모두 가능)', discountType: 'custom' },
  { badge: '얼리칩', title: '2LV 시작 전 참가 +10,000칩', discountType: 'advance' },
  { badge: '얼리칩', title: '5LV 시작 전 참가 +5,000칩', discountType: 'advance' },
  { badge: '개인', title: '개인출전 가능 · 충분히 1등 가능', discountType: 'custom' },
];
const KKANBU_LEDGER_DISCOUNTS = [
  { label: '1레벨', amount: 50_000, level: 1 },
  { label: '첫 바인', amount: 30_000, level: 16, kind: 'firstBuyin' },
  { label: '팀 리바인 1회 5만', amount: 50_000, level: 0, kind: 'rebuy' },
];

describe('linkedPosterDiscounts — 포스터 연결 시 할인 칸(포스터가 정본)', () => {
  it('빈 칸 → 포스터 할인 3개(할인액 없는 안내 문구 6개는 빠진다)', () => {
    expect(linkedPosterDiscounts(KKANBU_PROMOS, [], null)).toEqual(KKANBU_LEDGER_DISCOUNTS);
  });

  it('직전 게임·앞 포스터가 **자동으로** 채운 그대로면 이 포스터 것으로 바꾼다 — 할인 없는 포스터면 빈 칸', () => {
    const yesterday = [{ label: '2레벨', amount: 30_000, level: 2 }];   // 다른 포스터의 레벨 자동 할인
    expect(linkedPosterDiscounts(KKANBU_PROMOS, yesterday, yesterday)).toEqual(KKANBU_LEDGER_DISCOUNTS);
    expect(linkedPosterDiscounts([{ title: '얼리칩', discountType: 'advance' }], yesterday, yesterday)).toEqual([]);
  });

  it('업주가 고친 칸(자동 값과 다른 배열)은 두고 null — 다시 가져오기 버튼이 덧붙인다', () => {
    const auto = [{ label: '2레벨', amount: 30_000, level: 2 }];
    const edited = [{ label: '2레벨', amount: 20_000, level: 2 }];
    expect(linkedPosterDiscounts(KKANBU_PROMOS, edited, auto)).toBeNull();
    expect(linkedPosterDiscounts(KKANBU_PROMOS, edited, null)).toBeNull();
  });

  // 손계산(10만 게임 · 할인은 금액에서만 빼고 엔트리 = 받은 가치 ÷ 정가, 오너 규칙 2026-09-11):
  //   1LV 첫 바인 5만 할인 → 50,000 · 0.5 / 1LV 리바인 → 50,000 · 0.5(레벨 할인은 조건 없음)
  //   2~16LV 첫 바인 3만 할인 → 70,000 · 0.7 / 5LV 리엔트리 → 첫 바인 조건 불가 → 100,000 · 1
  //   팀 리바인(손 선택 3번, 2회차) → 50,000 · 0.5 / 17LV 첫 바인 → 자동 없음 → 100,000 · 1
  it('🔴 로티 깐부전 손계산 — 연결만 하면(가져오기 안 눌러도) 결제창 자동 할인·금액·엔트리가 포스터대로', () => {
    const discounts = linkedPosterDiscounts(KKANBU_PROMOS, [], null) ?? [];
    const session = { buyinAmount: 100_000, cardAmount: null, discounts };
    const bi: LedgerBuyin = {
      id: 'b', venueId: 'v1', sessionDate: '2026-10-09', gameSeq: 1, playerName: 'P', entryNo: 1, paymentMethod: 'cash', isUnpaid: false,
      buyinAt: '2026-10-09T08:00:00.000Z', isSplit: false, cashAmount: 0, cardAmount: 0, transferAmount: 0, ticketCount: 0, unpaidAmount: 0,
      discountLevel: 0, discountIndex: 0, earlyOverride: null,
    };
    const at = (idx: number, entryNo: number) => {
      const f = buyinFinance({ ...bi, entryNo, discountIndex: idx, cashAmount: nonSplitSnapshot('cash', idx, session).cash_amount }, session);
      return [f.value, f.entry];
    };
    const auto = (lv: number, entryNo: number) => at(autoDiscountIndex(discounts, lv, entryNo), entryNo);
    expect(auto(1, 1)).toEqual([50_000, 0.5]);
    expect(auto(1, 2)).toEqual([50_000, 0.5]);
    expect(auto(2, 1)).toEqual([70_000, 0.7]);
    expect(auto(16, 1)).toEqual([70_000, 0.7]);
    expect(auto(5, 2)).toEqual([100_000, 1]);
    expect(auto(17, 1)).toEqual([100_000, 1]);
    expect(discountAllowed(discounts[2], 2)).toBe(true);   // 팀 리바인은 리바인에만
    expect(at(3, 2)).toEqual([50_000, 0.5]);
  });
});
