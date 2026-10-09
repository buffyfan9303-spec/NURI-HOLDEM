// roti-1009 애드온 상태 이월(오너 2026-10-09 "로티 부스터 데이는 에드온이잖아 이것도 판별해서 넣어야지").
// 원천: Documents/누리홀덤_영상분석_0930/roti-1009/addon-verify.md P2-1 · P2-2 · P3-1.
// 보는 것:
//   ① 부스터데이(애드온) 클락이 남은 채 깐부전(애드온 없음) 장부를 시작하면 클락 isAddon·addonStack 이 둘 다 꺼지는가
//      (예전엔 clockPatchFromSchedule 이 켜기만 해서 50,000 이 남고 TV 에 ADD-ON 이 떴다). 애드온 있는 포스터는 그대로 켜지는가(양성).
//   ② 장부 애드온 줄 머리 안내가 세션 addonEntry 를 말하는가(0 = 안 들어감 · 0.5 = 0.5엔트리).
//   ③ 클락 설정 시드가 세션 '애드온 없음'이면 스택도 0 으로 맞추는가.
//   + 화면 배선(장부 폼·애드온 줄·클락 시드)이 이 판정 함수를 쓰는가 — 화면 동작 자체는 e2e/ledger-addon-carry-1009.spec.ts.
// 음성 대조(2026-10-09 실행 기록은 보고서): clockPatchFromSchedule 의 애드온 두 줄을 옛 `if (sc.buyIn?.addonStack) {…}` 로 되돌리면 ①이,
//   addonEntryNote 를 고정 문구로 되돌리면 ②가, clockAddonFromSession 의 `return { isAddon: false, addonStack: 0 }` 을 base 스택으로 바꾸면 ③이 빨개진다.
// 실행: npx vitest run src/lib/addonCarry.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clockPatchFromSchedule, posterAddonOf, clockAddonFromSession, applyToClock } from './gameInherit';
import { ledgerStartClockConfig } from './ledgerStart';
import { computeLiveStats, defaultClockConfig, emptyClockState, type ClockConfig } from '../api/clock';
import { addonEntryNote, type LedgerSession } from '../api/ledger';
import type { Schedule } from '../api/schedules';

const src = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');

// 운영 일정 원형(roti-1009 addon-author.md): 부스터데이 buy_in = 10만 · 시작 5만 · 리엔트리 5만 · 애드온 5만/5만 · 0.5엔트리.
const BOOSTER = { id: 'b', title: '로티 부스터데이', venueId: 'v', date: '2026-10-08', regCloseTime: '16LV',
  buyIn: { amount: 100_000, startStack: 50_000, rebuyStack: 50_000, addon: 50_000, addonStack: 50_000, addonEntry: 0.5 },
  structure: { levels: [] } } as unknown as Schedule;
// 깐부전 — 애드온 칸이 없다(10-09 d4a68be7 과 같은 모양).
const KKANBU = { id: 'k', title: '단독 깐부전', venueId: 'v', date: '2026-10-09', regCloseTime: '16LV',
  buyIn: { amount: 80_000, startStack: 50_000, rebuyStack: 70_000 }, structure: { levels: [] } } as unknown as Schedule;
const FORM = { earlyBonus: 5_000, doubleEarlyBonus: 10_000, earlyDoubleLevel: 1, earlySingleLevel: 4, startStack: 50_000, rebuyStack: 70_000 };
// 어제 부스터데이를 돌리고 남은 클락 설정(장부 시작의 베이스 = 지금 클락 행 config).
const boosterLeftover = (): ClockConfig => ({ ...defaultClockConfig(), title: '로티 부스터데이', isAddon: true, addonStack: 50_000, rebuyStack: 50_000 });

describe('① 포스터 애드온 판정 — 없으면 끈다(장부 폼·클락이 같은 함수)', () => {
  it('posterAddonOf: 스택+가격 · 스택만 · 가격만 · 없음 · buy_in 없음', () => {
    expect(posterAddonOf(BOOSTER)).toEqual({ isAddon: true, addonStack: 50_000, addonAmount: 50_000 });
    expect(posterAddonOf({ buyIn: { amount: 1, addonStack: 30_000 } })).toEqual({ isAddon: true, addonStack: 30_000, addonAmount: 0 });
    expect(posterAddonOf({ buyIn: { amount: 1, addon: 30_000 } })).toEqual({ isAddon: true, addonStack: 0, addonAmount: 30_000 });
    expect(posterAddonOf(KKANBU)).toEqual({ isAddon: false, addonStack: 0, addonAmount: 0 });
    expect(posterAddonOf({ buyIn: undefined } as unknown as Schedule)).toEqual({ isAddon: false, addonStack: 0, addonAmount: 0 });
  });

  it('🔴 반례: 부스터데이 클락이 남은 채 깐부전 장부 시작 → 클락 애드온 0(isAddon false · addonStack 0)', () => {
    expect(clockPatchFromSchedule(KKANBU)).toMatchObject({ isAddon: false, addonStack: 0 });
    const cfg = ledgerStartClockConfig(boosterLeftover(), KKANBU, null, FORM);
    expect([cfg.isAddon, cfg.addonStack]).toEqual([false, 0]);
    // 칩 결과: 수기 애드온 보정 1 이 남아도 총 칩에 50,000 이 끼지 않는다(예전엔 addons × 남은 50,000).
    const st = { ...emptyClockState('v', cfg, 1), adjAddons: 1 };
    expect(computeLiveStats(st, { entries: 2, rebuys: 0, earlies: 0, doubleEarlies: 0, totalBuyins: 2 }, { ...cfg, earlyBonus: 0, doubleEarlyBonus: 0 }).totalStack).toBe(100_000);
  });

  it('양성: 애드온 포스터는 그대로 켜진다(어제 깐부전 클락 위에서도) · 가격만인 포스터는 켜고 지난 스택은 안 남긴다', () => {
    const plain = { ...defaultClockConfig(), isAddon: false, addonStack: 0 };
    const on = ledgerStartClockConfig(plain, BOOSTER, null, FORM);
    expect([on.isAddon, on.addonStack]).toEqual([true, 50_000]);
    const priceOnly = ledgerStartClockConfig(boosterLeftover(), { ...KKANBU, buyIn: { amount: 80_000, addon: 30_000 } } as Schedule, null, FORM);
    expect([priceOnly.isAddon, priceOnly.addonStack]).toEqual([true, 0]);
  });

  it('병합 순서 유지: 포스터 없는 장부는 클락 값 그대로 · 게임 프리셋 애드온은 포스터 꺼짐보다 이긴다', () => {
    const none = ledgerStartClockConfig(boosterLeftover(), null, null, FORM);
    expect([none.isAddon, none.addonStack]).toEqual([true, 50_000]);   // 포스터가 말하지 않으면 기존 동작
    const preset = applyToClock({ addonStack: 40_000 });
    const withPreset = ledgerStartClockConfig(defaultClockConfig(), KKANBU, preset, FORM);
    expect([withPreset.isAddon, withPreset.addonStack]).toEqual([true, 40_000]);
  });
});

describe('③ 클락 설정 시드 — 세션 애드온 없음이면 스택도 0', () => {
  const sess = (isAddon: boolean | undefined, addonStack: number) => ({ isAddon, addonStack }) as Pick<LedgerSession, 'isAddon' | 'addonStack'>;
  it('세션 꺼짐 → 둘 다 0(예전엔 isAddon 만 꺼지고 프리셋 스택 50,000 이 남아 TV 는 ADD-ON)', () => {
    expect(clockAddonFromSession(sess(false, 0), { isAddon: true, addonStack: 50_000 })).toEqual({ isAddon: false, addonStack: 0 });
  });
  it('세션 켜짐 → 세션 스택, 세션 스택 없으면 클락 스택 · 세션 판정 없음 → 클락 그대로', () => {
    expect(clockAddonFromSession(sess(true, 30_000), { isAddon: false, addonStack: 50_000 })).toEqual({ isAddon: true, addonStack: 30_000 });
    expect(clockAddonFromSession(sess(true, 0), { isAddon: true, addonStack: 50_000 })).toEqual({ isAddon: true, addonStack: 50_000 });
    expect(clockAddonFromSession(sess(undefined, 0), { isAddon: true, addonStack: 50_000 })).toEqual({ isAddon: true, addonStack: 50_000 });
  });
});

describe('② 애드온 줄 머리 안내 = 세션 addonEntry', () => {
  it('0·없음 = 바인·엔트리에 안 들어감 · 0.5 = 1회 0.5엔트리 · 0.7 · 1', () => {
    expect(addonEntryNote({})).toBe('바인·엔트리에 안 들어감');
    expect(addonEntryNote({ addonEntry: 0 })).toBe('바인·엔트리에 안 들어감');
    expect(addonEntryNote({ addonEntry: 0.5 })).toBe('1회 0.5엔트리');
    expect(addonEntryNote({ addonEntry: 0.7 })).toBe('1회 0.7엔트리');
    expect(addonEntryNote({ addonEntry: 1 })).toBe('1회 1엔트리');
  });
});

describe('배선 — 화면이 같은 판정 함수를 쓴다', () => {
  const ledger = src('../components/features/NuriPosLedger.tsx');
  it('장부 폼 포스터 상속: 애드온 세 칸을 posterAddonOf 로 **늘** 쓴다(켜기만 하는 조건문이 남지 않는다)', () => {
    const body = ledger.slice(ledger.indexOf('applySchedInheritRef.current = (sc: Schedule) => {'), ledger.indexOf('// A1(2026-09-28) — 게임관리'));
    expect(body).toMatch(/const addon = posterAddonOf\(sc\);\n\s*setIsAddon\(addon\.isAddon\); setAddonStack\(addon\.addonStack\); setAddonAmount\(addon\.addonAmount\);/);
    expect(body).not.toMatch(/if \(sc\.buyIn\?\.addon/);
  });
  it('애드온 줄: 세션 addonEntry 를 넘기고 addonEntryNote 로 말한다', () => {
    expect(ledger).toMatch(/<AddonRow buyin=\{cell\.buyin\} amount=\{session\.addonAmount \?\? 0\} entry=\{session\.addonEntry\}/);
    expect(ledger).toMatch(/\$\{wonToMan\(amount\)\}만 · \$\{addonEntryNote\(\{ addonEntry: entry \}\)\}/);
    expect(ledger).not.toMatch(/만 · 바인·엔트리에 안 들어감`/);
  });
  it('클락 설정 시드: clockAddonFromSession 으로 두 칸을 함께', () => {
    const clock = src('../components/features/clock/TournamentClock.tsx');
    const body = clock.slice(clock.indexOf('const seededInitial = useMemo'), clock.indexOf('const startClock = async'));
    expect(body).toMatch(/\.\.\.clockAddonFromSession\(seedSession, base\),/);
    expect(body).not.toMatch(/addonStack: \(seedSession\.isAddon/);
  });
});
