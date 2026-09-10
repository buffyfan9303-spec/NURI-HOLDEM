// 개인 ROI 계산 — 공식을 못 박는다(0원 분모·음수·재진입/애드온·삭제 후 재계산·필터·월별·부족 안내)
// + insert 하위호환 폴백(마이그레이션 전 서버가 컬럼 부재로 거절하면 새 필드 없이 재시도).
import { describe, it, expect } from 'vitest';
import {
  roiStats, filterRoiRows, roiNotice, isMemoEntry, investedOf, resultOf, ROI_MIN_EVENTS,
  bankrollInsertPayload, insertWithRoiFallback, isMissingColumnError, stripRoiColumns, type RoiRow,
} from './roi';

const row = (o: Partial<RoiRow>): RoiRow => ({
  entryDate: '2026-09-05', amount: 0, buyIn: 0, rebuy: 0, addon: 0, venueName: '', gameName: '', ...o,
});

describe('roiStats — 공식', () => {
  it('🔴 참가비 0 이면 ROI·ITM 은 null(계산 불가) — 옛 +/- 행은 분모가 없어 지표에서 빠진다', () => {
    const s = roiStats([row({ amount: 5000 }), row({ amount: -3000 })]);
    expect(s.events).toBe(0);
    expect(s.roi).toBeNull();
    expect(s.itm).toBeNull();
    expect(s.avgBuyIn).toBeNull();
    expect(s.bestResult).toBeNull();
    expect(s.net).toBe(0);
  });

  it('참가 2회: 하나는 전액 손실, 하나는 2배 → invested 20000 · net 10000 · ROI 50 · ITM 50', () => {
    const s = roiStats([
      row({ buyIn: 10000, amount: -10000 }),   // result 0 → 입상 아님
      row({ buyIn: 10000, amount: 20000 }),    // result 30000 → 입상
    ]);
    expect(s.events).toBe(2);
    expect(s.invested).toBe(20000);
    expect(s.net).toBe(10000);
    expect(s.resultSum).toBe(30000);
    expect(s.roi).toBe(50);
    expect(s.itm).toBe(50);
    expect(s.moneyIn).toBe(1);
    expect(s.avgBuyIn).toBe(10000);
    expect(s.bestResult).toBe(30000);
  });

  it('재진입·애드온은 참가비에 합산된다 — result = net + invested', () => {
    const r = row({ buyIn: 100000, rebuy: 100000, addon: 50000, amount: -50000 });
    expect(investedOf(r)).toBe(250000);
    expect(resultOf(r)).toBe(200000);   // 20만 받고 25만 넣었다 → 입상(result>0)이지만 ROI 는 음수
    const s = roiStats([r]);
    expect(s.roi).toBe(-20);
    expect(s.itm).toBe(100);
  });

  it('음수 ROI: 전부 잃으면 -100', () => {
    const s = roiStats([row({ buyIn: 30000, amount: -30000 }), row({ buyIn: 70000, amount: -70000 })]);
    expect(s.roi).toBe(-100);
    expect(s.itm).toBe(0);
    expect(s.bestResult).toBe(0);
  });

  it('본전(순결과 0·참가비 있음)은 일정이 아니라 참가 기록이고, result>0 이라 입상(민캐시)이다', () => {
    const r = row({ buyIn: 50000, amount: 0 });
    expect(isMemoEntry(r)).toBe(false);
    expect(isMemoEntry(row({}))).toBe(true);
    const s = roiStats([r]);
    expect(s.moneyIn).toBe(1);
    expect(s.roi).toBe(0);
  });

  it('🔴 삭제 후 재계산 — 행을 빼면 지표가 그 행 없이 다시 나온다(누적 캐시 없음)', () => {
    const a = row({ buyIn: 10000, amount: 40000 });
    const b = row({ buyIn: 10000, amount: -10000 });
    expect(roiStats([a, b]).roi).toBe(150);
    expect(roiStats([b]).roi).toBe(-100);
    expect(roiStats([]).roi).toBeNull();
  });

  it('월별 추세 — 참가비 있는 행만, 오래된 달부터', () => {
    const s = roiStats([
      row({ entryDate: '2026-09-10', buyIn: 10000, amount: 5000 }),
      row({ entryDate: '2026-08-01', buyIn: 10000, amount: -10000 }),
      row({ entryDate: '2026-08-20', buyIn: 20000, amount: 30000 }),
      row({ entryDate: '2026-07-01', amount: 99999 }),   // 참가비 없음 → 추세에 안 나온다
    ]);
    expect(s.months).toEqual([
      { month: '2026-08', events: 2, invested: 30000, net: 20000 },
      { month: '2026-09', events: 1, invested: 10000, net: 5000 },
    ]);
  });
});

describe('filterRoiRows — 기간·매장·게임', () => {
  const rows = [
    row({ entryDate: '2026-09-01', buyIn: 1, venueName: '강남', gameName: '데일리' }),
    row({ entryDate: '2026-09-02', buyIn: 1, venueName: '홍대', gameName: '데일리' }),
    row({ entryDate: '2026-08-31', buyIn: 1, venueName: '강남', gameName: '위클리' }),
  ];
  it('빈 필터는 전체', () => { expect(filterRoiRows(rows)).toHaveLength(3); });
  it('월 접두 + 매장 + 게임 문자열 일치', () => {
    expect(filterRoiRows(rows, { monthPrefix: '2026-09' })).toHaveLength(2);
    expect(filterRoiRows(rows, { venue: '강남' })).toHaveLength(2);
    expect(filterRoiRows(rows, { venue: '강남', game: '데일리' })).toHaveLength(1);
    expect(filterRoiRows(rows, { venue: '강 남' })).toHaveLength(0);   // 부분 일치 아님
  });
});

describe('roiNotice — 데이터 부족 안내', () => {
  it('0건 → 참가비 안내 · 3건 미만 → N건부터 · 충분하면 null', () => {
    expect(roiNotice({ events: 0 })).toMatch(/참가비/);
    expect(roiNotice({ events: 1 })).toBe(`기록 ${ROI_MIN_EVENTS}건부터 ROI 를 보여드려요 (지금 1건)`);
    expect(roiNotice({ events: ROI_MIN_EVENTS })).toBeNull();
  });
});

describe('insert 하위호환 — 마이그레이션 전 서버', () => {
  const base = { entryDate: '2026-09-05', amount: -50000, memo: ' 메모 ' };

  it('새 필드가 기본값(0·빈 문자열)이면 payload 에 넣지 않는다(옛 스키마 그대로 통과)', () => {
    const p = bankrollInsertPayload('u1', { ...base, buyIn: 0, rebuy: 0, addon: 0, venueName: '', gameName: '  ' });
    expect(p).toEqual({ user_id: 'u1', entry_date: '2026-09-05', amount: -50000, memo: '메모' });
  });

  it('값이 있으면 그 컬럼만 실린다', () => {
    const p = bankrollInsertPayload('u1', { ...base, buyIn: 50000.7, rebuy: 0, addon: 10000, venueName: ' 강남 ', gameName: '' });
    expect(p).toEqual({ user_id: 'u1', entry_date: '2026-09-05', amount: -50000, memo: '메모', buy_in: 50000, addon: 10000, venue_name: '강남' });
    expect(stripRoiColumns(p)).toEqual({ user_id: 'u1', entry_date: '2026-09-05', amount: -50000, memo: '메모' });
  });

  it('컬럼 부재 판정 — PGRST204 · 42703 · 메시지 문형. 다른 400 은 아니다', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'buy_in' column of 'bankroll_entries' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: '42703', message: 'column "buy_in" of relation "bankroll_entries" does not exist' })).toBe(true);
    expect(isMissingColumnError({ message: "Could not find the 'addon' column of 'bankroll_entries' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: '23514', message: 'new row violates check constraint' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });

  it('🔴 참가비를 넣었는데 컬럼 부재로 거절되면 새 필드 없이 한 번 더 — degraded=true', async () => {
    const calls: Record<string, unknown>[] = [];
    const insert = async (p: Record<string, unknown>) => {
      calls.push(p);
      return { error: 'buy_in' in p ? { code: 'PGRST204', message: "Could not find the 'buy_in' column" } : null };
    };
    const p = bankrollInsertPayload('u1', { ...base, buyIn: 50000, rebuy: 0, addon: 0, venueName: '강남', gameName: '' });
    const r = await insertWithRoiFallback(p, insert);
    expect(r.error).toBeNull();
    expect(r.degraded).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ user_id: 'u1', entry_date: '2026-09-05', amount: -50000, memo: '메모' });
  });

  it('새 필드가 없으면 재시도하지 않는다 · 다른 오류도 재시도하지 않는다', async () => {
    let n = 0;
    const missing = { code: 'PGRST204', message: 'x' };
    const r1 = await insertWithRoiFallback(
      bankrollInsertPayload('u1', { ...base, buyIn: 0, rebuy: 0, addon: 0, venueName: '', gameName: '' }),
      async () => { n++; return { error: missing }; });
    expect(n).toBe(1);
    expect(r1).toEqual({ error: missing, degraded: false });

    n = 0;
    const other = { code: '23514', message: 'check' };
    const r2 = await insertWithRoiFallback(
      bankrollInsertPayload('u1', { ...base, buyIn: 1000, rebuy: 0, addon: 0, venueName: '', gameName: '' }),
      async () => { n++; return { error: other }; });
    expect(n).toBe(1);
    expect(r2).toEqual({ error: other, degraded: false });
  });

  it('재시도도 실패하면 오류를 그대로 돌려주고 degraded 는 아니다', async () => {
    const r = await insertWithRoiFallback(
      bankrollInsertPayload('u1', { ...base, buyIn: 1000, rebuy: 0, addon: 0, venueName: '', gameName: '' }),
      async (p) => ({ error: 'buy_in' in p ? { code: 'PGRST204' } : { code: '42501' } }));
    expect(r).toEqual({ error: { code: '42501' }, degraded: false });
  });
});
