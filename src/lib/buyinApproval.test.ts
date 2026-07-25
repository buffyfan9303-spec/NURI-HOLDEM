// '전체 승인'이 손님이 고른 게임을 버리고 현재 보고 있는 게임에 전원 몰아넣던 사고를
// 규칙 수준에서 못 박는다.
//
// 가장 위험한 실패는 '조용히 다른 게임에 들어가는' 것이다. 운영자는 승인 1탭이지만
// 원복은 한 명씩 삭제 + 취소 비밀번호라 비대칭이므로, 배정 결정은 렌더가 아니라
// 이 함수 하나가 책임진다 — 여기서 경계를 고정한다.
import { describe, it, expect } from 'vitest';
import { planBuyinApprovals } from './buyinApproval';

const req = (id: string, requestedGameSeq: number | null) => ({ id, requestedGameSeq });

describe('요청 게임 우선', () => {
  it('각자 원한 게임으로 나뉜다 — 현재 게임에 몰아넣지 않는다', () => {
    const p = planBuyinApprovals([req('a', 1), req('b', 2), req('c', 1)], 2, [1, 2]);
    expect(p.groups).toEqual([
      { gameSeq: 1, items: [req('a', 1), req('c', 1)] },
      { gameSeq: 2, items: [req('b', 2)] },
    ]);
    expect(p.mixed).toBe(true);
    expect(p.skipped).toEqual([]);
  });

  it('미지정(null)만 현재 보고 있는 게임으로 간다', () => {
    const p = planBuyinApprovals([req('a', null)], 3, [1, 3]);
    expect(p.groups).toEqual([{ gameSeq: 3, items: [req('a', null)] }]);
    expect(p.mixed).toBe(false);
  });

  it('전원이 같은 게임이면 확인을 띄우지 않는다(mixed=false)', () => {
    const p = planBuyinApprovals([req('a', 1), req('b', null)], 1, [1]);
    expect(p.mixed).toBe(false);
    expect(p.groups).toHaveLength(1);
  });
});

describe('아직 열리지 않은 게임', () => {
  it('🔴 현재 게임으로 둔갑시키지 않고 대기로 남긴다', () => {
    const p = planBuyinApprovals([req('a', 3), req('b', 1)], 1, [1]);
    expect(p.skipped).toEqual([req('a', 3)]);
    expect(p.groups).toEqual([{ gameSeq: 1, items: [req('b', 1)] }]);
  });

  // ⚠ 이건 '프런트가 보내도 된다고 본다'는 뜻이지 '서버가 반드시 받는다'는 뜻이 아니다.
  //   장부 열기 전 선접수 동선을 접수대에서 막지 않으려는 판단이고, 최종 판정은 서버가 한다.
  it('보고 있는 게임은 세션 행이 없어도 프런트는 허용(최종 판정은 서버)', () => {
    const p = planBuyinApprovals([req('a', 2)], 2, []);
    expect(p.groups).toEqual([{ gameSeq: 2, items: [req('a', 2)] }]);
    expect(p.skipped).toEqual([]);
  });

  it('전부 미개설이면 승인 대상이 0이라 호출 자체가 없어야 한다', () => {
    const p = planBuyinApprovals([req('a', 4)], 1, [1]);
    expect(p.groups).toEqual([]);
    expect(p.skipped).toHaveLength(1);
  });

  it('빈 목록은 빈 계획', () => {
    const p = planBuyinApprovals([], 1, [1]);
    expect(p).toEqual({ groups: [], skipped: [], mixed: false });
  });
});
