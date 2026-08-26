// W4 PL1 — 포스터(Schedule) → 장부/클락 자동 상속 어댑터(순수 함수).
// §13-B: 상속 배관은 이미 절반 깔려 있었지만 폭이 3필드(title·buyIn·guaranteed)뿐이라
// 블라인드·스택·레지레벨·상금이 포스터에 있는데도 무시됐다. 이 모듈이 상속의 단일 소스.
// ⚠ 금액(원·PL1b)은 lib/units 정규형 경유 — 만원/원 혼동 오기록('1만 배' 사고)의 재발 차단.
import type { Schedule } from '../api/schedules';
import type { ClockConfig, ClockLevel, ClockPrizeRow } from '../api/clock';
import { rankingPrizeWon } from './units';

/** 포스터 structure.levels → 클락 levels (isBreak 플래그 → kind 판별) */
export function posterLevelsToClock(
  levels: NonNullable<NonNullable<Schedule['structure']>['levels']>,
): ClockLevel[] {
  return levels.map((l) => ({
    kind: l.isBreak ? 'break' as const : 'level' as const,
    minutes: l.minutes, sb: l.sb, bb: l.bb, ante: l.ante ?? 0,
  }));
}

/** PL1a 무금액 상속 — 클락 cfg 병합 패치. 소비처는 반드시 '진행 중 아님'을 확인할 것(비파괴 병합 가드). */
export function clockPatchFromSchedule(sc: Schedule): Partial<ClockConfig> {
  const p: Partial<ClockConfig> = {};
  if (sc.title) p.title = sc.title;
  const lv = sc.structure?.levels;
  if (lv && lv.length > 0) p.levels = posterLevelsToClock(lv);
  if (sc.structure?.lateRegLevels) p.regCloseLevel = sc.structure.lateRegLevels;
  const start = sc.buyIn?.startStack ?? sc.structure?.startingChips;
  if (start) p.startStack = start;
  const rebuy = sc.buyIn?.rebuyStack ?? sc.structure?.rebuyStack;
  if (rebuy) p.rebuyStack = rebuy;
  if (sc.buyIn?.addonStack) { p.addonStack = sc.buyIn.addonStack; p.isAddon = true; }
  return p;
}

/** PL1b 금액 상속 — 포스터 순위별 상금(만원 표기) → 클락 prizes(원).
 *  단위가 돈이 아닌 항목(%·pts·이용권 등)은 오환산 위험이라 제외한다. */
export function clockPrizesFromSchedule(sc: Schedule): ClockPrizeRow[] | null {
  const rows = (sc.rankingPrizes ?? [])
    .filter((r) => (r.amount ?? 0) > 0 && (r.unit == null || r.unit === '만원' || r.unit === '원'))
    .map((r) => ({ place: r.rank, amount: rankingPrizeWon(r) }));
  return rows.length > 0 ? rows : null;
}
