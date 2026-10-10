// 이벤트 등수별 "매장 이용권 N개" 표시 (2026-10-10 오너: "이벤트 등수마다 매장이용권 몇개인지 명시").
// 렌더된 마크업(renderToStaticMarkup)에서 등수별 기대 문자열을 본다. 확률(%)·금액 표현이 없는 것도 같이 본다.
// 실행: npx vitest run src/components/features/eventVoucherCount1010.test.ts
// 한계: node 환경이라 실제 화면 배치·줄바꿈은 못 본다(그건 e2e/requests-1010.spec.ts 몫).
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventVoucherQty } from './EventPage';

const html = (v: unknown) => renderToStaticMarkup(createElement(EventVoucherQty, { voucherByTier: v as Record<string, number> }));
/** 등수 li 하나의 글자만 뽑는다(태그 제거). */
const row = (h: string, t: number) => {
  const m = h.match(new RegExp(`<li[^>]*data-testid="event-voucher-qty-${t}"[^>]*>([\\s\\S]*?)</li>`));
  expect(m, `${t}등 칸이 없다`).not.toBeNull();
  return m![1].replace(/<[^>]+>/g, '');
};

describe('EventVoucherQty · 등수별 매장 이용권 수량', () => {
  it('정상값 — 1~4등 각각 실제 저장된 개수를 그대로 보인다', () => {
    const h = html({ '1': 3, '2': 2, '3': 1, '4': 5, none: 0 });
    expect(row(h, 1)).toBe('1등매장 이용권 3개');
    expect(row(h, 2)).toBe('2등매장 이용권 2개');
    expect(row(h, 3)).toBe('3등매장 이용권 1개');
    expect(row(h, 4)).toBe('4등매장 이용권 5개');
  });

  it('명시적 0 은 0 개로 보인다(저장된 값이므로 허용)', () => {
    const h = html({ '1': 0, '2': 2, '3': 0, '4': 1 });
    expect(row(h, 1)).toBe('1등매장 이용권 0개');
    expect(row(h, 3)).toBe('3등매장 이용권 0개');
  });

  it('누락 — 키가 없거나 객체가 없으면 가짜 0 이 아니라 "수량 안내 미등록"', () => {
    const h = html({ '1': 3 });
    expect(row(h, 1)).toBe('1등매장 이용권 3개');
    for (const t of [2, 3, 4]) expect(row(h, t)).toBe(`${t}등수량 안내 미등록`);
    const none = html(undefined);
    const nul = html(null);
    for (const t of [1, 2, 3, 4]) {
      expect(row(none, t)).toBe(`${t}등수량 안내 미등록`);
      expect(row(nul, t)).toBe(`${t}등수량 안내 미등록`);
    }
    expect(none).not.toMatch(/이용권 0개/);
  });

  it('잘못된 값(음수·소수·NaN·Infinity·문자열·null·불리언·안전하지 않은 큰 수)은 "수량 안내 미등록"', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, '3', null, true, Number.MAX_SAFE_INTEGER + 2]) {
      const h = html({ '1': bad, '2': 2, '3': 2, '4': 2 });
      expect(row(h, 1), `값 ${String(bad)}`).toBe('1등수량 안내 미등록');
      expect(row(h, 2)).toBe('2등매장 이용권 2개');
    }
  });

  it('확률·금액·현금 표현이 렌더에 없다 — 개수만', () => {
    const h = html({ '1': 3, '2': 2, '3': 1, '4': 5, none: 40 });
    const text = h.replace(/<[^>]+>/g, '');
    expect(text).not.toMatch(/%|확률|당첨률|\d\s*원|₩|현금|환전|수익|양도|꽝/);
    // 'none'(꽝) 칸은 그리지 않는다
    expect(h).not.toMatch(/event-voucher-qty-none/);
    expect(h.match(/<li\b/g)).toHaveLength(4);
  });
});
