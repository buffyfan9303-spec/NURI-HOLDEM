// src/lib/stackZone.ts — 내 스택(bb)·M 으로 '지금 볼 차트' 를 고른다(라이브 탭 내 토너 카드 → 도구 딥링크).
// 경계는 nash.data(NASH_STACKS ≤20bb 푸시/폴드)·preflop.ts STACKS(20/40 숏·미들, 100 딥)와 같은 구간을 쓴다.
// 카피는 '구간·레인지·차트' 명사형만(§28 — 명령형·핸드별 추천은 넣지 않는다).

// nash.data 를 import 하지 않는다 — 97KB 데이터 청크가 라이브 탭에 딸려 온다(실측: 청크 분리돼 LiveGamesTab 이 끌어감).
// 눈금만 복사하고 stackZone.test 가 NASH_STACKS 와 동일한지 잰다(어긋나면 테스트가 잡는다).
export const PUSH_STACKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20] as const;

export type StackZone =
  | { tool: 'pushfold'; stack: number; label: string }
  | { tool: 'range' | 'postflop'; label: string };

/** 가장 가까운 Nash 차트 스택(2~20bb) — 20bb 초과는 호출 전에 걸러진다 */
export function nearestNashStack(bb: number): number {
  return (PUSH_STACKS as readonly number[]).reduce((a, b) => (Math.abs(b - bb) < Math.abs(a - bb) ? b : a));
}

export function stackZone(myBB: number, m: number): StackZone {
  if (myBB <= 20) {
    const stack = nearestNashStack(myBB);
    return { tool: 'pushfold', stack, label: `올인/폴드 구간 · ${stack}bb 레인지` };
  }
  if (myBB <= 40) return { tool: 'range', label: `M ${Math.round(m)} · 스틸 구간 · 오픈 차트` };
  return { tool: 'postflop', label: '딥스택 · 포스트플랍 트레이너' };
}
