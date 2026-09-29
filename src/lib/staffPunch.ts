// src/lib/staffPunch.ts — 직원 출근·퇴근 버튼의 상태 판정(순수 함수).
//
// 서버 punch_my_shift(20260930b)와 **같은 규칙**이다 — 화면이 누를 수 있다고 한 버튼은 서버도 받는다.
//   출근: 오늘(KST) 내 근무가 있고 출근이 비어 있을 때.
//   퇴근: 출근이 찍혀 있고 퇴근이 빈 내 근무 — 오늘 것 먼저, 없으면 어제(자정을 넘긴 야간 근무).
// 서버가 최종 판정을 한다(연타·동시 요청은 서버가 첫 기록만 남긴다). 여기서는 잘못 누를 버튼을 미리 막을 뿐이다.

/** 출퇴근 기록이 바뀌었다는 창 이벤트(detail.venueId) — 맨 위 버튼 줄과 '출근 관리' 목록이 서로 바로 다시 읽는다. */
export const PUNCH_EVENT = 'nuri:staff-punch';

export interface PunchRow { date: string; checkIn: string | null; checkOut: string | null }

export type PunchPhase =
  | 'none'    // 오늘 배정 없음(열린 어제 근무도 없음)
  | 'before'  // 오늘 배정 있음, 아직 출근 전
  | 'on'      // 근무 중(출근 O, 퇴근 X)
  | 'done';   // 오늘 근무 끝(출근·퇴근 모두 찍힘)

export interface PunchView {
  phase: PunchPhase;
  canIn: boolean;
  canOut: boolean;
  /** 오늘 근무 행(없으면 null) */
  today: PunchRow | null;
  /** 퇴근 버튼이 닫을 근무(오늘 또는 어제) */
  outTarget: PunchRow | null;
}

export function punchView(rows: PunchRow[], today: string, yesterday: string): PunchView {
  const t = rows.find((r) => r.date === today) ?? null;
  const y = rows.find((r) => r.date === yesterday) ?? null;
  const open = (r: PunchRow | null) => !!r && !!r.checkIn && !r.checkOut;
  const outTarget = open(t) ? t : open(y) ? y : null;
  const canIn = !!t && !t.checkIn;
  const canOut = outTarget != null;
  const phase: PunchPhase = outTarget ? 'on'
    : t?.checkIn && t.checkOut ? 'done'
      : t ? 'before' : 'none';
  return { phase, canIn, canOut, today: t, outTarget };
}
