// 늦게 도착한 응답 판정 — N01 의 계약.
//
// 실제로 났던 일: A 계정으로 나간 캘린더·알림 조회가 로그아웃→B 로그인 뒤에 도착해
// **B 의 화면에 A 의 예약·뱅크롤·알림이 그려질 수 있었다.**
// 여기서 잡지 못하면 화면마다 제각각인 가드가 생기고, 그중 하나는 반드시 빠진다.
import { describe, it, expect } from 'vitest';
import { isFreshResponse, isStaleResponse } from './staleResponse';

const stamp = <T>(seq: number, owner: T) => ({ seq, owner });

describe('isFreshResponse — seq 와 owner 가 둘 다 같아야 그린다', () => {
  it('같은 요청의 응답은 그린다', () => {
    expect(isFreshResponse(stamp(3, 'user-a'), stamp(3, 'user-a'))).toBe(true);
  });

  it('🔴 그 사이 계정이 바뀌었으면 버린다 — seq 가 같아도', () => {
    // 로그아웃은 **새 요청을 내지 않고** 대상만 없애는 경로다. seq 만 보면 이걸 놓친다.
    expect(isFreshResponse(stamp(3, 'user-a'), stamp(3, 'user-b'))).toBe(false);
  });

  it('🔴 로그아웃(대상이 null)이면 버린다', () => {
    expect(isFreshResponse(stamp(3, 'user-a'), stamp(3, null))).toBe(false);
  });

  it('🔴 그 사이 새 요청이 나갔으면 버린다 — 같은 사람이라도', () => {
    // 빠르게 두 번 새로고침하면 먼저 낸 응답이 나중에 도착할 수 있다(순서 역전).
    expect(isFreshResponse(stamp(3, 'user-a'), stamp(4, 'user-a'))).toBe(false);
  });

  it('둘 다 달라도 당연히 버린다', () => {
    expect(isFreshResponse(stamp(3, 'user-a'), stamp(4, 'user-b'))).toBe(false);
  });

  it('비로그인끼리(null → null)는 같은 대상으로 본다', () => {
    expect(isFreshResponse(stamp(1, null), stamp(1, null))).toBe(true);
  });

  it('owner 는 문자열이 아니어도 된다 — 게임 번호·글 id 같은 대상 키', () => {
    expect(isFreshResponse(stamp(7, 2), stamp(7, 2))).toBe(true);
    expect(isFreshResponse(stamp(7, 2), stamp(7, 1)), '다른 게임의 응답을 그렸다').toBe(false);
  });

  it('NaN owner 도 자기 자신과는 같다고 본다 — Object.is 로 비교한다', () => {
    // === 로 비교하면 NaN !== NaN 이라 정상 응답을 영원히 버린다.
    expect(isFreshResponse(stamp(1, NaN), stamp(1, NaN))).toBe(true);
  });

  it('isStaleResponse 는 정확히 반대다', () => {
    for (const [c, n] of [
      [stamp(1, 'a'), stamp(1, 'a')],
      [stamp(1, 'a'), stamp(2, 'a')],
      [stamp(1, 'a'), stamp(1, 'b')],
      [stamp(1, null), stamp(1, null)],
    ] as const) {
      expect(isStaleResponse(c, n)).toBe(!isFreshResponse(c, n));
    }
  });
});

describe('실제 사고 순서를 그대로 재현한다', () => {
  it('🔴 A 조회 시작 → 로그아웃 → B 로그인 → A 응답 도착 = 버린다', () => {
    // ① A 로그인 상태에서 조회를 낸다
    let cur = { seq: 1, owner: 'user-a' as string | null };
    const captured = { ...cur };

    // ② 로그아웃 — 새 요청은 없지만 세대를 올리고 대상을 지운다.
    //    이 시점에 도착해도 이미 버려야 한다(로그아웃 화면에 A 의 데이터가 뜨면 안 된다).
    cur = { seq: 2, owner: null };
    expect(isFreshResponse(captured, cur), '로그아웃 직후 도착한 A 응답이 살아남았다').toBe(false);

    // ③ B 로그인 — 다시 세대가 오른다
    cur = { seq: 3, owner: 'user-b' };

    // ④ 이제서야 A 의 응답이 도착한다
    expect(isFreshResponse(captured, cur), 'A 의 데이터가 B 화면에 그려졌다').toBe(false);
  });

  it('같은 사람이 계속 보고 있으면 정상적으로 그린다 — 과하게 막지 않는다', () => {
    const cur = { seq: 5, owner: 'user-a' as string | null };
    expect(isFreshResponse({ ...cur }, cur)).toBe(true);
  });
});
