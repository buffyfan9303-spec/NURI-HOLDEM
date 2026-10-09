// LC-F1(audit-open-1009 r2) — 포스터의 이용권(T)·GP 상금이 프리셋을 거치면 '만원'으로 바뀌거나 사라지던 결함.
//   손계산: 1등 400T → 프리셋 → 새 포스터 1등 400T (원화 400만원이 아니다 — W-25·§28 원화 환산 금지).
import { describe, expect, it } from 'vitest';
import { applyToClock, applyToPoster, presetFromRound, presetFromSchedule } from './gameInherit';
import type { Schedule } from '../api/schedules';
import type { LedgerSession } from '../api/ledger';

const sc = {
  id: 's1', title: '부스터', date: '2026-10-09', startTime: '19:00', venueId: 'v1',
  buyIn: { amount: 60_000 },
  rankingPrizes: [
    { rank: '1st', amount: 400, unit: 'T' },
    { rank: '2nd', amount: 50, unit: 'GP' },
    { rank: '3rd', amount: 30, unit: '만원' },
  ],
} as unknown as Schedule;

const want = [
  { rank: '1st', amount: 400, unit: 'T' },
  { rank: '2nd', amount: 50, unit: 'GP' },
  { rank: '3rd', amount: 30, unit: '만원' },
];

describe('LC-F1 · 프리셋 왕복에서 상금 단위 보존', () => {
  it('포스터 → 프리셋 → 새 포스터: 400T 는 400T, GP 행도 남는다', () => {
    expect(applyToPoster(presetFromSchedule(sc)).rankingPrizes).toEqual(want);
  });
  it('클락 없이 마감한 장부 → 프리셋(presetFromRound) → 새 포스터도 같다', () => {
    const sess = { title: '부스터', buyinAmount: 60_000 } as unknown as LedgerSession;
    expect(applyToPoster(presetFromRound(sess, null, sc)).rankingPrizes).toEqual(want);
  });
  it('이전 판이 저장한 프리셋(T 행에 amountWon 병기)도 단위를 따른다', () => {
    const old = { title: 'x', rankingPrizes: [{ rank: '1st', amount: 400, unit: 'T', amountWon: 4_000_000 }] };
    expect(applyToPoster(old).rankingPrizes).toEqual([{ rank: '1st', amount: 400, unit: 'T' }]);
  });
  it('클락 상금도 단위 그대로(원 환산 없음), 만원 행만 원', () => {
    expect(applyToClock(presetFromSchedule(sc)).prizes).toEqual([
      { place: '1st', amount: 400, unit: 'T' },
      { place: '2nd', amount: 50, unit: 'GP' },
      { place: '3rd', amount: 300_000 },
    ]);
  });
});
