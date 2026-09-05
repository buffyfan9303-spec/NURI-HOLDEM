import { describe, it, expect } from 'vitest';
import {
  DISCOUNT_TYPES, discountLabel, discountTexts, levelLabel, promotionView, retypePromotion,
} from './promotionLabel';

describe('discountLabel', () => {
  it('만 단위로 정확히 떨어지면 만 표기', () => {
    expect(discountLabel(50_000)).toBe('5만 할인');
    expect(discountLabel(10_000)).toBe('1만 할인');
    expect(discountLabel(1_000_000)).toBe('100만 할인');
  });
  it('천 단위까지 떨어지면 소수 1자리 만 표기(정확한 값)', () => {
    expect(discountLabel(55_000)).toBe('5.5만 할인');
    expect(discountLabel(11_000)).toBe('1.1만 할인');
  });
  it('만 단위로 안 떨어지면 원 단위 그대로 — 반올림으로 가격을 틀리게 말하지 않는다', () => {
    expect(discountLabel(10_500)).toBe('10,500원 할인');
    expect(discountLabel(12_345)).toBe('12,345원 할인');
  });
  it('1만원 미만은 원 단위(0.7만 같은 표기를 만들지 않는다)', () => {
    expect(discountLabel(7_000)).toBe('7,000원 할인');
    expect(discountLabel(500)).toBe('500원 할인');
  });
  it('0·미지정·음수·비정상 값은 할인이 아니다(기존 데이터 대부분이 여기)', () => {
    expect(discountLabel(0)).toBeNull();
    expect(discountLabel(undefined)).toBeNull();
    expect(discountLabel(null)).toBeNull();
    expect(discountLabel(-50_000)).toBeNull();
    expect(discountLabel(Number.NaN)).toBeNull();
    expect(discountLabel(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('levelLabel', () => {
  it('1-based 레벨을 조건 문구로', () => {
    expect(levelLabel(1)).toBe('1레벨까지');
    expect(levelLabel(12)).toBe('12레벨까지');
  });
  it('0·미지정은 조건 없음(수기 선택 전용)', () => {
    expect(levelLabel(0)).toBeNull();
    expect(levelLabel(undefined)).toBeNull();
    expect(levelLabel(-1)).toBeNull();
    expect(levelLabel(Number.NaN)).toBeNull();
  });
});

describe('promotionView', () => {
  it('할인액이 있으면 금액이 배지 자리를 갖고 원래 배지는 보조 줄로 — 정보를 버리지 않는다', () => {
    expect(promotionView({
      badge: '얼리칩', title: '5만 할인', detail: '1LV 바인 (오픈 17:00 이전 예약자)',
      discountWon: 50_000, level: 1,
    })).toEqual({
      pill: '5만 할인',
      isDiscount: true,
      sub: '얼리칩 · 1레벨까지 · 1LV 바인 (오픈 17:00 이전 예약자)',
    });
  });
  it('할인액이 없는 기존 데이터는 배지·설명이 종전 그대로(하위호환)', () => {
    expect(promotionView({ badge: '첫방문', title: '50% 할인', detail: '언제든 적용 가능' }))
      .toEqual({ pill: '첫방문', isDiscount: false, sub: '언제든 적용 가능' });
  });
  it('배지도 설명도 없으면 배지 열·보조 줄 없이 제목만', () => {
    expect(promotionView({ title: '웰컴 드링크' })).toEqual({ pill: null, isDiscount: false, sub: '' });
  });
  it('공백뿐인 배지·설명은 없는 것으로 본다(빈 알약·빈 줄 금지)', () => {
    expect(promotionView({ badge: '   ', title: '이벤트', detail: '  ' }))
      .toEqual({ pill: null, isDiscount: false, sub: '' });
  });
  it('할인액만 있고 배지가 없으면 보조 줄은 레벨·설명만', () => {
    expect(promotionView({ title: '사전예약 할인', discountWon: 30_000, level: 2 }))
      .toEqual({ pill: '3만 할인', isDiscount: true, sub: '2레벨까지' });
  });
  it('배지가 금액 그대로면(할인유형이 채운 태그) 보조 줄에서 같은 말을 반복하지 않는다', () => {
    expect(promotionView({ badge: '5만', title: '1LV 바인 5만', discountWon: 50_000, level: 1 }))
      .toEqual({ pill: '5만 할인', isDiscount: true, sub: '1레벨까지' });
  });
  it('할인액이 0이면 배지가 그대로 배지 자리를 지킨다', () => {
    expect(promotionView({ badge: 'NEW', title: '신규 이벤트', discountWon: 0 }))
      .toEqual({ pill: 'NEW', isDiscount: false, sub: '' });
  });
});

describe('discountTexts — 할인유형이 만드는 태그·내용·장부 라벨', () => {
  it('레벨 할인은 레벨 번호가 세 문구를 모두 가른다(level 을 쓰는 유일한 유형)', () => {
    expect(discountTexts({ title: '', discountType: 'level', discountWon: 50_000, level: 1 }))
      .toEqual({ badge: '5만', title: '1LV 바인 5만', ledger: '1레벨' });
    expect(discountTexts({ title: '', discountType: 'level', level: 3 }))
      .toEqual({ badge: '레벨', title: '3LV 바인 할인', ledger: '3레벨' });
    expect(discountTexts({ title: '', discountType: 'level' }))
      .toEqual({ badge: '레벨', title: '레벨 할인', ledger: '레벨 할인' });
  });

  it('금액이 있으면 태그는 금액 · 내용에도 금액이 들어간다(§28 — 참가비 할인액은 표시 대상)', () => {
    expect(discountTexts({ title: '', discountType: 'firstBuyin', discountWon: 50_000 }))
      .toEqual({ badge: '5만', title: '첫 바인 5만', ledger: '첫 바인' });
    expect(discountTexts({ title: '', discountType: 'firstVisit', discountWon: 50_000 }))
      .toEqual({ badge: '5만', title: '첫 방문 5만 할인', ledger: '첫 방문' });
    expect(discountTexts({ title: '', discountType: 'rebuy', discountWon: 30_000 }))
      .toEqual({ badge: '3만', title: '리바인 3만 할인', ledger: '리바인' });
    expect(discountTexts({ title: '', discountType: 'advance', discountWon: 20_000 }))
      .toEqual({ badge: '2만', title: '사전예약 2만 할인', ledger: '사전예약' });
  });

  it('금액이 없으면 태그는 유형 약칭 · 내용은 금액 없는 문구', () => {
    expect(discountTexts({ title: '', discountType: 'firstBuyin' }))
      .toEqual({ badge: '첫바인', title: '첫 바인 할인', ledger: '첫 바인' });
    expect(discountTexts({ title: '', discountType: 'advance' }))
      .toEqual({ badge: '사전예약', title: '사전예약 할인', ledger: '사전예약' });
  });

  it('태그 6자를 넘길 금액은 유형 약칭으로 내린다 — 잘린 태그를 만들지 않는다', () => {
    // '10,500원'(8자)은 태그칸(maxLength=6)을 넘는다. 내용에는 정확한 금액이 그대로 남는다.
    expect(discountTexts({ title: '', discountType: 'firstVisit', discountWon: 10_500 }))
      .toEqual({ badge: '첫방문', title: '첫 방문 10,500원 할인', ledger: '첫 방문' });
  });

  it("'직접 입력'·유형 없음은 아무 문구도 만들지 않는다(기존 프로모션 하위호환)", () => {
    expect(discountTexts({ title: '신규 이벤트', badge: 'NEW' }))
      .toEqual({ badge: null, title: null, ledger: null });
    expect(discountTexts({ title: '할인 이벤트', discountType: 'custom', discountWon: 50_000 }))
      .toEqual({ badge: '5만', title: null, ledger: null }); // 배지 자동 채움만 어제 그대로 유지
  });

  it('선택 목록의 모든 유형이 태그 6자·내용 40자·장부 라벨 20자 안에 든다', () => {
    for (const t of DISCOUNT_TYPES) {
      for (const won of [0, 50_000, 12_345, 100_000_000]) {
        const x = discountTexts({ title: '', discountType: t.value, discountWon: won, level: 12 });
        expect(x.badge?.length ?? 0).toBeLessThanOrEqual(6);
        expect(x.title?.length ?? 0).toBeLessThanOrEqual(40);
        expect(x.ledger?.length ?? 0).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe('retypePromotion — 자동 채움은 하되 사람이 고친 값은 덮지 않는다', () => {
  it('빈 줄에 유형을 고르면 태그·내용이 채워진다', () => {
    expect(retypePromotion({ badge: '', title: '' }, { discountType: 'firstVisit' }))
      .toEqual({ badge: '첫방문', title: '첫 방문 할인', discountType: 'firstVisit' });
  });

  it('직전 자동값 그대로였던 태그·내용은 새 값으로 갱신된다', () => {
    const cur = { badge: '첫방문', title: '첫 방문 할인', discountType: 'firstVisit' as const };
    expect(retypePromotion(cur, { discountWon: 50_000 }))
      .toEqual({ badge: '5만', title: '첫 방문 5만 할인', discountType: 'firstVisit', discountWon: 50_000 });
  });

  it('⚠ 사람이 고친 내용은 유형·금액을 바꿔도 살아남는다(핵심 분기)', () => {
    const cur = { badge: '5만', title: '첫 방문 특별 할인', discountType: 'firstVisit' as const, discountWon: 50_000 };
    const next = retypePromotion(cur, { discountWon: 70_000 });
    expect(next.title).toBe('첫 방문 특별 할인'); // 손으로 쓴 문구 — 유지
    expect(next.badge).toBe('7만');               // 자동값이던 태그 — 갱신
  });

  it('⚠ 사람이 고친 태그도 살아남는다 — 프리셋 50%(비율 할인)가 금액 태그로 덮이지 않는다', () => {
    const preset = { badge: '50%', title: '첫 방문 50% 할인', discountType: 'firstVisit' as const };
    const next = retypePromotion(preset, { discountWon: 50_000 });
    expect(next).toEqual({ ...preset, discountWon: 50_000 }); // 태그·내용 둘 다 그대로
  });

  it('레벨을 바꾸면 자동 문구가 레벨을 따라간다', () => {
    const cur = { badge: '5만', title: '1LV 바인 5만', discountType: 'level' as const, discountWon: 50_000, level: 1 };
    expect(retypePromotion(cur, { level: 3 }).title).toBe('3LV 바인 5만');
  });

  it("'직접 입력'으로 바꿔도 이미 보이던 태그·내용을 지우지 않는다", () => {
    const cur = { badge: '첫방문', title: '첫 방문 할인', discountType: 'firstVisit' as const };
    expect(retypePromotion(cur, { discountType: 'custom' }))
      .toEqual({ badge: '첫방문', title: '첫 방문 할인', discountType: 'custom' });
  });

  it('유형 없는 기존 줄에 금액만 적으면 어제처럼 배지만 채워진다(내용은 손대지 않는다)', () => {
    expect(retypePromotion({ badge: '', title: '' }, { discountWon: 50_000 }))
      .toEqual({ badge: '5만', title: '', discountWon: 50_000 });
  });
});
