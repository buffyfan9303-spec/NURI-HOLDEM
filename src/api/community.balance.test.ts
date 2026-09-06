// 상점 구매 가능 판정 — '잔액 모름(null)' 은 잠금이다(2026-09-05 점검 #19).
// 누적 점수로 대신 열어 두면 서버 spend 가 '점수 부족'으로 거절한다 — 이 계약이 무너지면 여기서 잡힌다.
import { describe, it, expect } from 'vitest';
import { lacksPoints, buyLabel } from './community';

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

describe('buyLabel — 비활성 이유를 라벨이 말한다', () => {
  it('잔액을 아직 모르면(미도착·조회 실패) 가격 대신 확인 중이라고 적는다', () => {
    expect(buyLabel(null, 300, '소장')).toBe('잔액 확인 중');
  });
  it('모자라면 부족이라고 적는다', () => {
    expect(buyLabel({ total: 500, spent: 400, available: 100 }, 300, '소장')).toBe('300점 부족');
  });
  it('살 수 있으면 가격과 동사를 적는다', () => {
    expect(buyLabel({ total: 900, spent: 100, available: 800 }, 300, '소장')).toBe('300점 소장');
    expect(buyLabel({ total: 900, spent: 100, available: 800 }, 300, '받기')).toBe('300점 받기');
  });
  it('동사가 없으면 가격만 적는다(닉네임 변경권)', () => {
    expect(buyLabel({ total: 900, spent: 100, available: 800 }, 300, '')).toBe('300점');
  });
});
