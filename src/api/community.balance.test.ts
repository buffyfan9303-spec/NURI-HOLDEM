// 상점 구매 가능 판정 — '잔액 모름(null)' 은 잠금이다(2026-09-05 점검 #19).
// 누적 점수로 대신 열어 두면 서버 spend 가 '점수 부족'으로 거절한다 — 이 계약이 무너지면 여기서 잡힌다.
import { describe, it, expect } from 'vitest';
import { lacksPoints } from './community';

describe('lacksPoints — 상점 버튼 잠금 판정', () => {
  it('잔액 미도착·조회 실패(null)면 가격과 무관하게 잠근다', () => {
    expect(lacksPoints(null, 0)).toBe(true);
    expect(lacksPoints(null, 400)).toBe(true);
  });
  it('사용 가능 점수가 가격 미만이면 잠그고, 같거나 크면 연다', () => {
    const b = { total: 5000, spent: 4700, available: 300 };
    expect(lacksPoints(b, 400)).toBe(true);
    expect(lacksPoints(b, 300)).toBe(false);
    expect(lacksPoints(b, 250)).toBe(false);
  });
  it('누적(total)이 커도 잔액(available)만 본다', () => {
    expect(lacksPoints({ total: 20000, spent: 19900, available: 100 }, 250)).toBe(true);
  });
});
