// 클락 심층 실측(2026-09-29, scratchpad 하네스 K1~K12) 회귀 — 단위·배선.
// 실행: npx vitest run src/api/clock.deep0929.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { earlyWindowOf, deriveClockCounts, ledgerLiveStats, defaultClockConfig, emptyClockState } from './clock';
import { formatCountdown, formatElapsed } from '../lib/clockLevel';
import type { LedgerBuyin } from './ledger';

const src = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// K4 — 하네스 4D: 클락 설정 더블얼리 20분 · 장부 세션 얼리 0 → 클락 화면은 얼리 8·240,000, 장부는 0·200,000 을 번갈아 썼다.
//   음성 대조: earlyWindowOf 의 세션 분기를 `cfg || session` 으로 되돌리면 '🔴 세션이 이긴다' 가 빨개진다.
describe('K4 · 얼리 판정 창 한 벌(장부 세션 기준)', () => {
  const start = '2026-09-29T10:00:00.000Z';
  const cfg = { ...defaultClockConfig(), earlyBonus: 5_000, doubleEarlyBonus: 10_000, earlyDoubleMin: 20, earlySingleMin: 0 };
  const b = (at: string) => ({ id: at, playerName: `p${at}`, entryNo: 1, buyinAt: at } as unknown as LedgerBuyin);
  const session = { earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: start, openedAt: null, buyinAmount: 100_000 };

  it('🔴 세션이 있으면 세션이 이긴다 — 클락 설정의 분은 쓰지 않는다', () => {
    expect(earlyWindowOf(cfg, session)).toEqual({ earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: start, openedAt: null });
    expect(deriveClockCounts([b('2026-09-29T10:05:00.000Z')], earlyWindowOf(cfg, session)).earlies).toBe(0);
  });
  it('세션이 없을 때만 클락 설정', () => {
    expect(earlyWindowOf(cfg, null)).toMatchObject({ earlyDoubleMin: 20, earlySingleMin: 0 });
  });
  it('🔴 두 작성자(클락 화면·장부)가 같은 함수라 같은 스냅샷을 쓴다', () => {
    const s = { ...emptyClockState('v1', cfg), sessionDate: '2026-09-29' };
    const bs = [b('2026-09-29T10:05:00.000Z'), b('2026-09-29T10:06:00.000Z')];
    expect(ledgerLiveStats(s, bs, session)).toEqual(ledgerLiveStats({ ...s, eliminations: 0 }, [...bs], { ...session }));
    expect(ledgerLiveStats(s, bs, session).ledger?.earlies).toBe(0);
  });
  it('배선 — 세 화면이 earlyWindowOf 만 쓴다(`cfg.earlyDoubleMin ||` 우선 규칙이 되살아나지 않는다)', () => {
    for (const f of ['../components/features/clock/TournamentClock.tsx', '../components/features/NuriPosLedger.tsx', '../components/features/clock/ClockRemote.tsx']) {
      const s = src(f);
      expect(s, f).not.toMatch(/cfg\??\.earlyDoubleMin \|\| /);
      expect(s, f).not.toMatch(/earlyDoubleMin: session\.earlyDoubleMin, earlySingleMin: session\.earlySingleMin/);
    }
  });
});

// K9 — 같은 순간 화면마다 1초 달랐다(round vs floor), TV 는 경계에서 00:00 을 1초 보이고 20:00 을 건너뛰었다.
describe('K9 · 시간 글자 한 벌', () => {
  it('남은 시간은 올림 — 새 레벨 첫 순간 20:00, 마지막 0.4초는 00:01', () => {
    expect(formatCountdown(20 * 60_000)).toBe('20:00');
    expect(formatCountdown(20 * 60_000 - 1)).toBe('20:00');
    expect(formatCountdown(400)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
    expect(formatCountdown(90 * 60_000)).toBe('90:00');
    expect(formatCountdown(90 * 60_000, true)).toBe('01:30:00');
  });
  it('흐른 시간은 내림', () => { expect(formatElapsed(59_999)).toBe('00:59'); expect(formatElapsed(3_600_000)).toBe('01:00:00'); });
  it('배선 — 화면에 로컬 반올림/내림 mm:ss 가 남아 있지 않다', () => {
    const files = ['../components/features/clock/ClockStage.tsx', '../components/features/clock/ClockRemote.tsx',
      '../components/features/NuriPosLedger.tsx', '../components/features/StoreDashboard.tsx', '../components/features/VenueManageTab.tsx',
      '../components/features/clock/TournamentClock.tsx'];
    for (const f of files) expect(src(f), f).not.toMatch(/Math\.(round|floor)\(ms \/ 1000\)|Math\.floor\(rem \/ 60_000\)|pad\(rem \/ 60_000\)/);
  });
});

// K6·K12 — 전진자가 없는 운영에서 raw current_index 로 판단하던 자리.
describe('K6·K12 · 레벨 판단은 실효 레벨 한 벌', () => {
  it('리모컨 [이전/다음 레벨] 활성 조건이 eff.index 다', () => {
    const s = src('../components/features/clock/ClockRemote.tsx');
    expect(s).toMatch(/disabled=\{disabled \|\| eff\.index <= 0\}/);
    expect(s).not.toMatch(/state\.currentIndex <= 0|state\.currentIndex >= lvls/);
  });
  it('대시보드 위젯 레벨·남은 시간이 effectiveLevel 이다', () => {
    const s = src('../components/features/StoreDashboard.tsx');
    expect(s).toMatch(/const wEff = wClock \? effectiveLevel\(wClock\) : null;/);
    expect(s).not.toMatch(/levels\[wClock\.currentIndex\]|levels\[clock\.currentIndex\]/);
  });
  it('PC 레벨 ± 기준이 실효 레벨이다', () => {
    expect(src('../components/features/clock/TournamentClock.tsx')).toMatch(/levelMovePatch\(state, effectiveLevel\(state\)\.index, delta\)/);
  });
  // 음성 대조: Stepper 의 두 조건을 state.currentIndex 로 되돌리면 빨개진다(워치독이 늦으면 실효 1·raw 0 에서 [−] 가 꺼졌다).
  it('🔴 PC Level 스테퍼의 비활성 조건도 실효 레벨이다', () => {
    const s = src('../components/features/clock/TournamentClock.tsx');
    expect(s).toMatch(/plusDisabled=\{effectiveLevel\(state\)\.index >= cfg\.levels\.length - 1\} minusDisabled=\{effectiveLevel\(state\)\.index <= 0\}/);
    expect(s).not.toMatch(/state\.currentIndex >= cfg\.levels\.length - 1|minusDisabled=\{state\.currentIndex <= 0\}/);
  });
});

// K9 — 클락 남은 시간을 보여 주는 업주 화면 세 곳이 자체 1초 인터벌(마운트 시점마다 위상이 다름) 대신 공용 틱을 쓴다.
//   음성 대조: 세 곳 중 하나라도 setInterval 틱으로 되돌리면 빨개진다.
describe('K9 · 업주 화면 클락 틱 한 벌', () => {
  it('🔴 대시보드 위젯·매장 상단 바·게임 슬롯 카드가 useClockSecond 를 쓴다', () => {
    const cases: [string, RegExp][] = [
      ['../components/features/StoreDashboard.tsx', /useClockSecond\(wClock, liveWidget && active\)/],
      ['../components/features/VenueManageTab.tsx', /useClockSecond\(main, active && mainRunning\)/],
      ['../components/features/clock/TournamentClock.tsx', /useClockSecond\(clocks\.find\(\(c\) => c\.gameSeq === currentGameSeq\), active\)/],
    ];
    for (const [f, re] of cases) {
      const s = src(f);
      expect(s, f).toMatch(re);
      expect(s, f).not.toMatch(/setInterval\(\(\) => set(Now)?Tick\(\([a-z]+\) => [a-z]+ \+ 1\), 1000\)/);
    }
  });
});

// K2 — 자동 전진 두 곳(운영자 워치독 · 장부 백업 전진자)이 서버 시각을 모를 때 쓰지 않는다.
describe('K2 · 자동 전진 게이트', () => {
  it('두 전진자 모두 serverTimeKnown 을 먼저 본다', () => {
    expect(src('../components/features/clock/TournamentClock.tsx')).toMatch(/if \(!serverTimeKnown\(\)\) return;\s*const s = stateRef\.current;\s*const cu = levelCatchUp\(s\);/);
    expect(src('../components/features/NuriPosLedger.tsx')).toMatch(/if \(!serverTimeKnown\(\)\) return;[\s\S]{0,400}levelCatchUp\(c\)/);
  });
});

// K3·K11 — 쓰는 주체가 '열린 화면 하나' 가 아니다 / 장부 클락 바가 복귀·폴링으로 다시 읽는다.
describe('K3·K11 · 작성자·재조회 배선', () => {
  it('대시보드도 장부 몫 작성기를 부른다', () => {
    expect(src('../components/features/StoreDashboard.tsx')).toMatch(/syncClockLedgerStats\(c\)/);
  });
  it('live_stats 를 쓰는 화면 코드는 writeLedgerStats/syncClockLedgerStats 뿐이다', () => {
    for (const f of ['../components/features/clock/TournamentClock.tsx', '../components/features/NuriPosLedger.tsx',
      '../components/features/clock/ClockRemote.tsx', '../components/features/StoreDashboard.tsx']) {
      expect(src(f), f).not.toMatch(/saveClockLiveStats\(/);
    }
  });
  it('장부 클락 바가 창 복귀·30초 폴링으로 클락을 다시 읽는다', () => {
    expect(src('../components/features/NuriPosLedger.tsx')).toMatch(/useResyncOnWake\(reloadClock, active, 30_000\)/);
  });
});
