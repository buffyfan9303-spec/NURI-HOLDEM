import type { Schedule } from '../api/schedules';
import { posterChipRules } from './gameInherit';

/** 일정 상세의 스타팅·리엔트리 표시 정본(KW-3, 2026-09-30).
 *
 *  · 칩 값은 포스터 폼이 `buy_in` 에, 옛 포스터·시드는 `structure` 에 저장한다(W-17) —
 *    장부 상속(lib/gameInherit)과 같은 순서로 buy_in 을 먼저 읽는다.
 *  · 오너 2026-09-30: "리엔트리는 리바인 금액이 아니야 리엔트리 스택이야" — '리엔트리' 칸 값은 **칩**이다.
 *    가격(buy_in.rebuy)은 참가비 칸으로 옮긴다(reentryPriceWon). 없애지 않는다.
 *  · 미입력을 단정하지 않는다(W-23): 한도가 없으면 '무제한'이라 쓰지 않고, 아무것도 없으면 '현장 안내'. */

type S = Pick<Schedule, 'buyIn' | 'structure'>;

export function startChips(s: S): number | undefined {
  return s.buyIn?.startStack ?? s.structure?.startingChips;
}

/** 리엔트리 스택(회차 순). 계단 배열(buy_in.rebuyStacks)은 비어 있지 않으면 단일값보다 우선 —
 *  읽기는 gameInherit.posterChipRules 정본. 같은 값이 이어지면 한 번만(70,000 → 70,000 → 80,000 = 70,000 → 80,000). */
export function reentryStacks(s: S): number[] {
  const steps = posterChipRules(s).rebuyStacks;
  if (steps?.length) return steps.filter((n, i) => n !== steps[i - 1]);
  const one = s.buyIn?.rebuyStack ?? s.structure?.rebuyStack;
  return one ? [one] : [];
}

export function reentryText(s: S): string {
  const stacks = reentryStacks(s);
  if (stacks.length === 0) {
    // 업주가 게임 종류에 직접 '프리즈아웃'이라 적었을 때만 그렇게 말한다.
    return s.buyIn?.rebuy === undefined && /프리즈아웃|freeze/i.test(s.buyIn?.gameType ?? '') ? '프리즈아웃' : '현장 안내';
  }
  const limit = s.buyIn?.rebuyLimit;
  return `${stacks.map((n) => n.toLocaleString()).join(' → ')}${limit ? ` · 최대 ${limit}회` : ''}`;
}

/** 리엔트리 가격 — 참가비와 **다를 때만** 값(같으면 참가비가 이미 말한다). */
export function reentryPriceWon(s: S): number | null {
  const r = s.buyIn?.rebuy;
  return r && r > 0 && r !== s.buyIn?.amount ? r : null;
}

/** 블라인드 표 브레이크 행 글자(W-15) — 업주 원문(칩 레이스·디너·레지마감)을 그대로 보이고,
 *  원문에 'N분'·'N MIN' 이 없을 때만 분을 붙인다. 원문이 없으면 종전 'BREAK · N분'. */
export function breakText(label: string | undefined, minutes: number): string {
  const t = label?.trim();
  if (!t) return `BREAK · ${minutes}분`;
  const said = [...t.matchAll(/(\d+)\s*(?:분|MIN)/gi)].some((m) => Number(m[1]) === minutes);
  return said ? t : `${t} · ${minutes}분`;
}
