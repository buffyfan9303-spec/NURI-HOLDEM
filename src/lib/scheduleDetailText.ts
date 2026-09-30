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

/** 칩 축약 — 값이 바뀌지 않을 때만 K/M(70,000→70K · 1,500,000→1.5M · 72,555→72,555).
 *  라이브 탭 blindShort 와 같은 규칙(소수 2자리로 되돌려 원값과 같을 때만). 칩 수라 금액이 아니다(§28 무관). */
export function chipShort(n: number): string {
  for (const [div, u] of [[1_000_000, 'M'], [1_000, 'K']] as const) {
    if (n < div) continue;
    const r = Math.round((n / div) * 100) / 100;
    if (Math.abs(r * div - n) < 0.5) return `${r}${u}`;
  }
  return n.toLocaleString();
}

/** 상세 요약 칸(390·360·320 에서 **한 줄**)용 — 값은 한 줄에 들어가는 길이만, 나머지는 보조 줄.
 *  · 단계 2개 이하: `70K → 80K` · 3개 이상: `70K → 100K`(첫 값 → 마지막 값) + 보조 줄에 `4단계`.
 *  · 화살표 값은 chipShort 로 축약한다. 2026-09-30 실측(Pretendard, 요약 칸 글자 공간 117.6px@320):
 *    `70,000 → 100,000` 은 윈도우 여유 0.95px·CI 리눅스 −5px(넘침), `1,000,000 → 1,500,000` 은 390 에서도 −21px.
 *  · 단일 값은 전체 숫자(`1,000,000` 도 76.6px 로 들어간다).
 *  · 한도(`최대 N회`)는 값이 아니라 항상 보조 줄로 — 폭이 좁아지는 320 에서도 값이 접히지 않게.
 *  · 전체 계단은 reentryText(게임 정보 행 — 여러 줄 허용)가 전체 숫자로 그대로 보인다. */
export function reentrySummary(s: S): { value: string; sub?: string } {
  const stacks = reentryStacks(s);
  if (stacks.length === 0) return { value: reentryText(s) };
  const fmt = stacks.length >= 2 ? chipShort : (n: number) => n.toLocaleString();
  const limit = s.buyIn?.rebuyLimit;
  const sub = [stacks.length >= 3 ? `${stacks.length}단계` : '', limit ? `최대 ${limit}회` : ''].filter(Boolean).join(' · ');
  return { value: stacks.length >= 3 ? `${fmt(stacks[0])} → ${fmt(stacks[stacks.length - 1])}` : stacks.map(fmt).join(' → '), sub: sub || undefined };
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
