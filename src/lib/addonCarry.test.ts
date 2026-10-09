// roti-1009 애드온 상태 이월(오너 2026-10-09 "로티 부스터 데이는 에드온이잖아 이것도 판별해서 넣어야지").
// 원천: Documents/누리홀덤_영상분석_0930/roti-1009/addon-verify.md P2-1 · P2-2 · P3-1.
// 보는 것:
//   ① 부스터데이(애드온) 클락이 남은 채 깐부전(애드온 없음) 장부를 시작하면 클락 isAddon·addonStack 이 둘 다 꺼지는가
//      (예전엔 clockPatchFromSchedule 이 켜기만 해서 50,000 이 남고 TV 에 ADD-ON 이 떴다). 애드온 있는 포스터는 그대로 켜지는가(양성).
//   ② 장부 애드온 줄 머리 안내가 세션 addonEntry 를 말하는가(0 = 안 들어감 · 0.5 = 0.5엔트리).
//   ③ 클락 설정 시드가 세션 '애드온 없음'이면 스택도 0 으로 맞추는가.
//   P2-1(review-256) 포스터를 고른 뒤 폼에서 바뀐 애드온(수동·게임 프리셋·지난 게임)도 클락에 가는가 — 세션 = 클락(F3·F4·F5).
//   + 화면 배선(장부 폼·애드온 줄·클락 시드·장부 시작 폼 값)이 이 판정 함수를 쓰는가 — 화면 동작 자체는 e2e/ledger-addon-carry-1009.spec.ts.
// 음성 대조(2026-10-09 실행 기록은 보고서): clockPatchFromSchedule 의 애드온 두 줄을 옛 `if (sc.buyIn?.addonStack) {…}` 로 되돌리면 ①이,
//   addonEntryNote 를 고정 문구로 되돌리면 ②가, clockAddonFromSession 의 `return { isAddon: false, addonStack: 0 }` 을 base 스택으로 바꾸면 ③이,
//   ledgerStartClockConfig 끝의 formClockAddon 병합을 빼면 P2-1 이 빨개진다.
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

  it('병합 순서 유지(폼 값 없는 옛 호출): 포스터 없는 장부는 클락 값 그대로 · 게임 프리셋 패치는 포스터 꺼짐보다 뒤에 온다', () => {
    const none = ledgerStartClockConfig(boosterLeftover(), null, null, FORM);
    expect([none.isAddon, none.addonStack]).toEqual([true, 50_000]);   // 포스터가 말하지 않으면 기존 동작
    const preset = applyToClock({ addonStack: 40_000 });
    const withPreset = ledgerStartClockConfig(defaultClockConfig(), KKANBU, preset, FORM);
    expect([withPreset.isAddon, withPreset.addonStack]).toEqual([true, 40_000]);
  });
});

// 🔴 review-256 P2-1 — 클락 애드온을 포스터 혼자 정하면, 포스터를 고른 **뒤** 폼에서 바뀐 애드온이 클락에 안 가서 세션과 클락이 갈렸다.
//   장부 폼은 마지막 동작이 이기고 그 값이 세션에 저장된다 → 클락도 같은 값(formClockAddon). 불변식: 세션 애드온 = 클락 애드온.
//   세션 값 = submitOnce 가 저장하는 { isAddon, addonStack: isAddon ? addonStack : 0 }.
describe('P2-1 세션 = 클락 — 폼 애드온이 클락 애드온을 정한다(포스터 연결 또는 폼 켜짐)', () => {
  const formWith = (isAddon: boolean, addonStack: number) => ({ ...FORM, addon: { isAddon, addonStack } });
  const sessionOf = (f: ReturnType<typeof formWith>) => [f.addon.isAddon, f.addon.isAddon ? f.addon.addonStack : 0];
  const clockOf = (c: ClockConfig) => [c.isAddon, c.addonStack];

  it('F1(그대로): 부스터 클락이 남음 + 깐부전 포스터 → 폼 = 포스터 꺼짐 → 세션·클락 꺼짐 0', () => {
    const k = posterAddonOf(KKANBU);
    const f = formWith(k.isAddon, k.addonStack);
    const cfg = ledgerStartClockConfig(boosterLeftover(), KKANBU, null, f);
    expect(clockOf(cfg)).toEqual(sessionOf(f));
    expect(clockOf(cfg)).toEqual([false, 0]);
  });

  it('F3: 깐부전(애드온 칸 없음) 연결 → 폼에서 애드온 수동 켬 5만 → 세션·클락 켬 5만 · 총 칩에 애드온 2건 10만이 들어간다', () => {
    const f = formWith(true, 50_000);
    for (const base of [boosterLeftover(), { ...defaultClockConfig(), isAddon: false, addonStack: 0 }]) {
      const cfg = ledgerStartClockConfig(base, KKANBU, null, f);
      expect(clockOf(cfg)).toEqual(sessionOf(f));
      expect(clockOf(cfg)).toEqual([true, 50_000]);
    }
    const cfg = ledgerStartClockConfig(boosterLeftover(), KKANBU, null, f);
    const derived = { entries: 3, rebuys: 0, earlies: 0, doubleEarlies: 0, totalBuyins: 3, addons: 2 };
    expect(computeLiveStats(emptyClockState('v', cfg, 1), derived, { ...cfg, earlyBonus: 0, doubleEarlyBonus: 0 }).totalStack).toBe(250_000);   // 3×5만 + 2×5만(수정 전 PR 판 15만)
  });

  it('F4: 게임 프리셋(애드온 4만) 적용 → 깐부전 포스터 선택(폼 꺼짐) → 세션·클락 꺼짐 · 프리셋 뒤 폼에서 다시 켜면 둘 다 켬', () => {
    const preset = applyToClock({ addonStack: 40_000 });
    const off = formWith(false, 0);
    const a = ledgerStartClockConfig(defaultClockConfig(), KKANBU, preset, off);
    expect(clockOf(a)).toEqual(sessionOf(off));
    expect(clockOf(a)).toEqual([false, 0]);
    const on = formWith(true, 40_000);   // 포스터 → 프리셋 순서(프리셋이 폼을 켠 채로 끝남)
    const b = ledgerStartClockConfig(defaultClockConfig(), KKANBU, preset, on);
    expect(clockOf(b)).toEqual(sessionOf(on));
    expect(clockOf(b)).toEqual([true, 40_000]);
  });

  it("F5: 오늘 포스터(깐부전) 자동 연동 → '지난 게임 그대로 열기'(부스터) → 세션·클락 켬 5만", () => {
    const f = formWith(true, 50_000);   // applyLastRound 가 폼을 부스터 세션 값으로 채운다(schedId 는 남는다)
    const cfg = ledgerStartClockConfig(boosterLeftover() /* inheritClockRef.full */, KKANBU, null, f);
    expect(clockOf(cfg)).toEqual(sessionOf(f));
    expect(clockOf(cfg)).toEqual([true, 50_000]);
  });

  it('폼 켜짐·스택 0(가격만 포스터) → 켬 0 — 클락에 남은 스택을 쓰지 않는다 · 폼 꺼짐이면 폼 스택은 버린다', () => {
    expect(clockOf(ledgerStartClockConfig(boosterLeftover(), KKANBU, null, formWith(true, 0)))).toEqual([true, 0]);
    expect(clockOf(ledgerStartClockConfig(boosterLeftover(), KKANBU, null, formWith(false, 50_000)))).toEqual([false, 0]);
  });

  it('양성(기존 동작): 포스터 없음 + 폼 꺼짐 → 베이스 그대로(업주가 클락에서 불러온 애드온 프리셋을 지우지 않는다) · 포스터 없음 + 폼 켜짐 → 폼', () => {
    expect(clockOf(ledgerStartClockConfig(boosterLeftover(), null, null, formWith(false, 0)))).toEqual([true, 50_000]);
    expect(clockOf(ledgerStartClockConfig(defaultClockConfig(), null, null, formWith(true, 30_000)))).toEqual([true, 30_000]);
  });

  it('폼 애드온 키는 클락 설정에 새지 않는다(applyEarlyEdit 가 패치를 그대로 펴는 함정)', () => {
    const cfg = ledgerStartClockConfig(defaultClockConfig(), KKANBU, null, formWith(true, 50_000)) as unknown as Record<string, unknown>;
    expect('addon' in cfg).toBe(false);
  });
});

describe('③ 클락 설정 시드 — 세션 애드온 없음이면 스택도 0', () => {
  const sess = (isAddon: boolean | undefined, addonStack: number) => ({ isAddon, addonStack }) as Pick<LedgerSession, 'isAddon' | 'addonStack'>;
  it('세션 꺼짐 → 둘 다 0(예전엔 isAddon 만 꺼지고 프리셋 스택 50,000 이 남아 TV 는 ADD-ON)', () => {
    expect(clockAddonFromSession(sess(false, 0), { isAddon: true, addonStack: 50_000 })).toEqual({ isAddon: false, addonStack: 0 });
  });
  it('세션 켜짐 → 세션 스택(0 이면 0 — 클락에 남은 스택으로 되돌리지 않는다, review-256 P3-2) · 세션 판정 없음 → 클락 그대로', () => {
    expect(clockAddonFromSession(sess(true, 30_000), { isAddon: false, addonStack: 50_000 })).toEqual({ isAddon: true, addonStack: 30_000 });
    expect(clockAddonFromSession(sess(true, 0), { isAddon: true, addonStack: 50_000 })).toEqual({ isAddon: true, addonStack: 0 });
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
  it('장부 시작: 클락 설정에 폼 애드온(세션에 저장하는 같은 두 값)을 넘긴다 — review-256 P2-1', () => {
    const body = ledger.slice(ledger.indexOf('const submitOnce = '), ledger.indexOf('const ok = await onSubmit({'));
    expect(body).toMatch(/const cfg = ledgerStartClockConfig\(baseCfg, linkedSched, inheritClockRef\.current\.patch,[\s\S]*?addon: \{ isAddon, addonStack \} \}\);/);
    const save = ledger.slice(ledger.indexOf('const ok = await onSubmit({'));
    expect(save).toMatch(/isAddon, addonStack: isAddon \? addonStack : 0,/);
  });
  it('가격만 있는 포스터 등으로 애드온 켬·스택 0 이면 폼이 경고한다 — review-256 P3-1', () => {
    expect(ledger).toMatch(/\{isAddon && addonStack <= 0 && \(\n\s*<p data-testid="ledger-addon-stack-warn"/);
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
