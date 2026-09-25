// src/lib/posterReview.ts — 승인된 포스터가 '다시 심사' 로 가는 조건(20260925g N14)의 화면쪽 판정.
//
// 서버 트리거 prevent_self_approve_poster 는 관리자가 아닌 사람이 승인된 포스터의
//   title · buy_in · prize_pool · guaranteed · date · start_time
// 중 하나라도 바꾸면 approved=false 로 되돌린다. 업주가 모르고 저장하면 손님 화면에서 포스터가 내려가 놀란다.
// 그래서 폼이 저장 전에 **실제로 바뀌었을 때만** 안내한다. 비교 규칙은 App 이 patch 를 만드는 규칙과 같다
// (prizePool = GTD 이면 만원×10,000, ENTRY 이면 0 · guaranteed = prizeType === 'GTD').

export interface PosterCoreForm {
  title: string;
  buyIn: number;
  prizeType: 'GTD' | 'ENTRY';
  prizeAmount: number;   // 만원
  date: string;
  startTime: string;
}
export interface PosterCoreSaved {
  title: string;
  buyIn: { amount: number };
  guaranteed: boolean;
  prizePool?: number | null;
  date: string;
  startTime: string;
}

/** 여섯 칸 중 하나라도 폼 값이 저장본과 다른가. */
export function posterCoreChanged(form: PosterCoreForm, s: PosterCoreSaved): boolean {
  const gtd = form.prizeType === 'GTD';
  return form.title.trim() !== (s.title ?? '').trim()
    || form.buyIn !== s.buyIn.amount
    || gtd !== !!s.guaranteed
    || (gtd ? form.prizeAmount * 10_000 : 0) !== (s.prizePool ?? 0)
    || form.date !== s.date
    || form.startTime !== s.startTime;
}
