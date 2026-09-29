// 오너 결정 #3(2026-09-29, docs/HANDOFF-2026-09-29-results.md §4) — 장부 애드온 → 클락·TV 애드온 수 + 총칩 자동.
// 재현 원천: 최종 점검 P1-① — 장부 애드온 3건(현금·이용권·미수)인데 TV ADDON 0 · TOTAL CHIPS 500,000(참값 590,000).
// 음성 대조: clock.ts computeLiveStats 의 `(derived.addons ?? 0) +` 를 지우면 '🔴 P1-①' 두 단언이 빨개진다.
//            20260929s 의 `-l.a_addons` 를 `0` 으로 되돌리면 '서버 하한' 단언이 빨개진다.
// 실행: npx vitest run src/api/clock.addonLedger.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveClockCounts, computeLiveStats, composeLiveStats, ledgerLiveStats, clampAdjCount, addonAutoOf,
  defaultClockConfig, emptyClockState, type ClockConfig,
} from './clock';
import type { LedgerBuyin } from './ledger';

const cfg: ClockConfig = { ...defaultClockConfig(), startStack: 50_000, rebuyStack: 50_000, addonStack: 30_000, isAddon: true, earlyBonus: 0, doubleEarlyBonus: 0 };
const noEarly = { earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null, openedAt: null };
const row = (i: number, addon?: { method: 'cash' | 'ticket'; unpaid?: boolean }): LedgerBuyin => ({
  id: `b${i}`, venueId: 'v1', sessionDate: '2026-09-29', gameSeq: 1, playerName: `p${i}`, entryNo: 1,
  paymentMethod: 'cash', isUnpaid: false, buyinAt: '2026-09-29T10:00:00.000Z', isSplit: false,
  cashAmount: 100_000, cardAmount: 0, transferAmount: 0, ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0,
  earlyOverride: null, addonMethod: addon?.method ?? null, addonUnpaid: !!addon?.unpaid, addonAmount: addon ? 50_000 : 0,
});
// P1-① 픽스처: 바인 10명 · 애드온 3건(현금 완납 · 이용권 · 미수) — 미수·이용권도 칩은 받았다(돈과 칩은 다른 축).
const buyins = [
  ...Array.from({ length: 7 }, (_, i) => row(i)),
  row(7, { method: 'cash' }), row(8, { method: 'ticket' }), row(9, { method: 'cash', unpaid: true }),
];

describe('#3 장부 애드온 → 클락 애드온·총칩', () => {
  const s = { ...emptyClockState('v1', cfg), sessionDate: '2026-09-29' };

  it('장부 몫이 애드온 수를 센다(결제수단·미수 무관)', () => {
    expect(deriveClockCounts(buyins, noEarly).addons).toBe(3);
  });
  it('🔴 P1-① — TV 애드온 3 · 총칩 590,000(= 10×5만 + 3×3만)', () => {
    const ls = ledgerLiveStats(s, buyins, null);
    expect(ls.addons).toBe(3);
    expect(ls.totalStack).toBe(590_000);
    // 읽는 쪽(TV·리모컨·대시보드) 합성도 같은 값 — 저장된 장부 몫 + 행의 열
    const c = composeLiveStats({ ...s, liveStats: ls })!;
    expect([c.addons, c.totalStack]).toEqual([3, 590_000]);
  });
  it('수기 보정은 장부 몫 위에 더해진다(+1 → 4 · 620,000)', () => {
    const ls = ledgerLiveStats(s, buyins, null);
    const c = composeLiveStats({ ...s, adjAddons: 1, liveStats: ls })!;
    expect([c.addons, c.totalStack]).toEqual([4, 620_000]);
  });
  it('하한 = −(장부 애드온) — [−] 로 장부 몫까지 되돌릴 수 있고 그 밑으로는 안 내려간다', () => {
    const ls = ledgerLiveStats(s, buyins, null);
    expect(addonAutoOf(ls)).toBe(3);
    let adj = 0;
    for (let i = 0; i < 6; i++) adj = clampAdjCount(addonAutoOf(ls), adj, -1);
    expect(adj).toBe(-3);
    expect(computeLiveStats({ ...s, adjAddons: adj }, ls.ledger!, cfg).addons).toBe(0);
  });
  it('낡은 스냅샷(장부 몫에 addons 없음)은 예전과 같다 — 보정 열만', () => {
    const { addons: _drop, ...oldLedger } = ledgerLiveStats(s, buyins, null).ledger!;
    void _drop;
    const c = composeLiveStats({ ...s, adjAddons: 2, liveStats: { ...ledgerLiveStats(s, buyins, null), ledger: oldLedger } })!;
    expect(c.addons).toBe(2);
    expect(addonAutoOf({ ledger: oldLedger })).toBe(0);
  });
  it('애드온은 엔트리·리바인·얼리에 섞이지 않는다', () => {
    const d = deriveClockCounts(buyins, noEarly);
    expect([d.entries, d.rebuys, d.totalBuyins]).toEqual([10, 0, 10]);
  });
  it('🔴 배선 — 장부 화면의 작성 트리거 키가 애드온을 본다(애드온만 추가돼도 TV 가 따라간다)', () => {
    const s = readFileSync(join(__dirname, '../components/features/NuriPosLedger.tsx'), 'utf8');
    const key = s.match(/const statsKeyOf = [\s\S]*?return `([^`]*)`/);
    expect(key?.[1]).toContain('${d.addons ?? 0}');
  });
  it('서버 하한 — 20260929s 의 clock_adjust_counts 가 장부 몫 addons 를 하한으로 쓴다', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20260929s_clock_addon_floor.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
    expect(sql).toMatch(/'ledger' ->> 'addons'/);
    expect(sql).toMatch(/adj_addons\s*=\s*greatest\(least\(c\.adj_addons,\s*-l\.a_addons\)/);
    expect(sql).toMatch(/revoke all on function public\.clock_adjust_counts\([^)]*\) from public, anon/);
  });
});
