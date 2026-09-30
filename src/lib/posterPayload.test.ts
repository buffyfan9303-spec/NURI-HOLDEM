// W-02 계약 — 포스터 수정 저장은 폼이 모르는 칸을 지우지 않고, 바꾸지 않은 칸은 싣지 않는다.
import { describe, it, expect } from 'vitest';
import type { Schedule } from '../api/schedules';
import { buyInOwnedFields, posterFormFromSchedule, posterSaveParts, sameJson } from './posterPayload';

const base = (over: Partial<Schedule> = {}): Schedule => ({
  id: 's1', title: '로티 부스터데이', venueId: 'v', pubName: '로티', region: '경기북부', date: '2026-10-01', startTime: '17:00',
  duration: '25/15분', format: 'MTT', guaranteed: true, prizePool: 10_000_000, regCloseTime: '16LV 00:12',
  buyIn: { amount: 100_000, rebuy: 100_000, rebuyLimit: 3, startStack: 50_000, rebuyStack: 50_000, addon: 50_000, addonStack: 50_000, gameType: '파이널롤백20' },
  structure: { startingChips: 50_000, blindLevelMinutes: 25, levels: [
    { sb: 100, bb: 200, ante: 200, minutes: 25 },
    { sb: 0, bb: 0, ante: 0, minutes: 8, isBreak: true, label: 'BREAK TIME 8MINS / 100칩 레이스' },
  ] },
  rules: ['2블라인드 자리비울시 먹처리됩니다.'], description: '문의 010', sideEvents: [{ name: '핀볼', startBefore: '17LV 시작 전', note: '50GP' }],
  displayOrder: 1, isPremium: false, ownerId: 'o', unreadQnaCount: 0, approved: true,
  ...over,
});

const openEdit = (s: Schedule) => posterFormFromSchedule(s, s.date);

describe('W-02 — 수정 저장이 기존 칸을 지우지 않는다', () => {
  it('아무것도 안 바꾼 저장은 buy_in·structure·규정·설명·사이드 이벤트를 싣지 않는다(서버 값 그대로 · 재심사 없음)', () => {
    const s = base();
    const f = openEdit(s);
    expect(posterSaveParts(s, f, { ...f })).toEqual({});
  });

  it('참가비만 바꿔도 rebuy·rebuyLimit·폼이 모르는 키는 그대로 남는다', () => {
    const s = base({ buyIn: { ...base().buyIn, ...({ futureKey: 'x' } as object) } });
    const f = openEdit(s);
    const p = posterSaveParts(s, f, { ...f, buyIn: 120_000 });
    expect(p.buyIn).toEqual({ ...s.buyIn, amount: 120_000 });
    expect(p.structure).toBeUndefined();
  });

  it('폼이 소유한 칸을 비우면 그 키만 지운다', () => {
    const s = base();
    const f = openEdit(s);
    const p = posterSaveParts(s, f, { ...f, rebuyLimit: 0 });
    expect(p.buyIn).not.toHaveProperty('rebuyLimit');
    expect(p.buyIn).toMatchObject({ rebuy: 100_000, rebuyStack: 50_000 });
  });

  it('소유 키는 전부 저장본에서 읽힌다 — 새 칸을 추가하고 posterFormFromSchedule 에서 안 읽으면 여기서 빨개진다', () => {
    const full = {
      amount: 100_000, gameType: '딥스택', addonStack: 50_000, addon: 50_000, startStack: 50_000, rebuyStack: 70_000,
      rebuy: 90_000, rebuyLimit: 3, rebuyStacks: [70_000, 70_000, 80_000], earlyTiers: [{ level: 1, chips: 10_000 }, { level: 4, chips: 5_000 }],
      addonEntry: 0.5, voucherPerEntry: 10,
    };
    const owned = Object.keys(buyInOwnedFields(openEdit(base())));
    expect(Object.keys(full).sort()).toEqual([...owned].sort()); // 소유 키가 늘면 이 픽스처도 늘려라
    const f = openEdit(base({ buyIn: full as Schedule['buyIn'] }));
    expect(sameJson(buyInOwnedFields(f), full)).toBe(true);
  });

  it('레벨 표를 고치면 structure 의 다른 키(startingChips)는 보존하고 브레이크 원문은 남는다', () => {
    const s = base();
    const f = openEdit(s);
    const lv = [...f.blindLevels!, { sb: 200, bb: 400, ante: 400, minutes: 25 }];
    const p = posterSaveParts(s, f, { ...f, blindLevels: lv });
    expect(p.structure?.startingChips).toBe(50_000);
    expect(p.structure?.levels?.[1]).toMatchObject({ isBreak: true, label: 'BREAK TIME 8MINS / 100칩 레이스' });
    expect(p.structure?.levels).toHaveLength(3);
  });

  it('얼리 없음([])과 미입력(undefined)은 다른 값이다', () => {
    const s = base();
    const f = openEdit(s);
    expect(f.earlyTiers).toBeUndefined();
    expect(posterSaveParts(s, f, { ...f, earlyTiers: [] }).buyIn?.earlyTiers).toEqual([]);
  });
});

describe('신규 등록 — 새 칸은 비워 두면 싣지 않는다', () => {
  const empty = { ...openEdit(base()), buyIn: 30_000, gameType: '', addonStack: 0, addonCost: 0, startStack: 0, rebuyStack: 0,
    rebuyPrice: 0, rebuyLimit: 0, rebuyStacks: [], earlyTiers: undefined, addonEntry: 0, voucherPerEntry: 0,
    blindLevels: [], description: '', rules: [], sideEvents: [] };
  it('참가비만 있으면 buy_in = { amount } 하나', () => {
    expect(posterSaveParts(null, null, empty)).toEqual({ buyIn: { amount: 30_000 } });
  });
  it('입력한 새 칸만 실린다', () => {
    const p = posterSaveParts(null, null, { ...empty, voucherPerEntry: 10, rules: ['a', ' ', 'b'], earlyTiers: [{ level: 4, chips: 5000 }, { level: 1, chips: 20000 }] });
    expect(p.buyIn).toEqual({ amount: 30_000, voucherPerEntry: 10, earlyTiers: [{ level: 1, chips: 20000 }, { level: 4, chips: 5000 }] });
    expect(p.rules).toEqual(['a', 'b']);
    expect(p).not.toHaveProperty('description');
  });
});
