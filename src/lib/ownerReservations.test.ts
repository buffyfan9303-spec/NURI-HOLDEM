// 게임관리(포스터) 예약 명단 — 방문 판정과 응답 순서 가드 단위 테스트.
// 버그 F03: '기기 로컬 오늘' 체크인 집합을 모든 날짜 포스터에 적용 + 계정 매칭 실패 시
//   display_name 문자열 OR 로 넓혀 동명이인을 '✓ 방문'으로 오판했다.
// 버그 F05: loadRes 에 응답 순서 가드가 없어 날짜 칩 A→B 연타 시 A 의 늦은 응답이 B 명단을 덮고,
//   그 인원 수가 되돌릴 수 없는 삭제 확인창의 '예약자 N명'이 됐다.
import { describe, it, expect } from 'vitest';
import { isVisited, createReqGuard } from './ownerReservations';

describe('isVisited · 방문 판정은 서버 근거(계정+매장+그 일정 날짜 KST)만', () => {
  // 서버 RPC(schedule_reservations_for_owner)가 내려주는 모양 그대로의 픽스처.
  // 같은 이름 '김철수' 두 명 중 한 명만 그 날짜에 체크인했다.
  const list = [
    { id: 'r1', displayName: '김철수', visited: true },   // 계정 일치 + 그 날짜 체크인
    { id: 'r2', displayName: '김철수', visited: false },  // 동명이인 — 체크인 없음
    { id: 'r3', displayName: '이영희', visited: false },  // 오늘 체크인했지만 이 일정은 다른 날짜
  ];

  it('계정+날짜가 맞는 예약만 방문으로 본다', () => {
    expect(list.map(isVisited)).toEqual([true, false, false]);
  });

  it('동명이인은 이름이 같아도 방문으로 번지지 않는다', () => {
    const sameName = list.filter((r) => r.displayName === '김철수');
    expect(sameName.filter(isVisited)).toHaveLength(1);
  });

  it('확인 불가(undefined·null)는 방문도 노쇼도 아니다 — 배지를 붙이지 않는다', () => {
    expect(isVisited({})).toBe(false);
    expect(isVisited({ visited: undefined })).toBe(false);
    expect(isVisited({ visited: null })).toBe(false);
  });
});

describe('createReqGuard · 늦게 온 옛 응답은 버린다', () => {
  it('A→B 연타에서 A 의 늦은 응답이 B 명단을 덮지 않는다', () => {
    const g = createReqGuard();
    const a = g.start(); // 9/5 명단 요청
    const b = g.start(); // 9/10 명단 요청(연타)
    // 9/10 이 먼저 도착 → 반영
    expect(g.accept(b)).toBe(true);
    // 9/5 가 뒤늦게 도착 → 폐기(삭제 확인창이 다른 날짜 인원 수를 쓰지 않게)
    expect(g.accept(a)).toBe(false);
  });

  it('A→B→A 로 같은 날짜를 다시 눌러도 마지막 요청만 통과한다', () => {
    const g = createReqGuard();
    const a1 = g.start();
    const b = g.start();
    const a2 = g.start();
    expect(g.accept(a1)).toBe(false);
    expect(g.accept(b)).toBe(false);
    expect(g.accept(a2)).toBe(true);
  });

  it('요청이 하나뿐이면 그대로 통과한다(정상 경로 회귀 방지)', () => {
    const g = createReqGuard();
    expect(g.accept(g.start())).toBe(true);
  });
});
