import { describe, it, expect } from 'vitest';
import { discountLabel, levelLabel, promotionView } from './promotionLabel';

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
  it('할인액이 0이면 배지가 그대로 배지 자리를 지킨다', () => {
    expect(promotionView({ badge: 'NEW', title: '신규 이벤트', discountWon: 0 }))
      .toEqual({ pill: 'NEW', isDiscount: false, sub: '' });
  });
});
