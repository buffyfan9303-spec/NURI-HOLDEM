// 오너 결정 클락 #1(2026-09-29, docs/HANDOFF-2026-09-29-results.md §4 #1) — 얼리 기준 = **포스터 등록 또는 장부 등록 시점의 기준**.
// 진행 중 구조 편집이 장부 세션의 얼리 창(early_double_min·early_single_min)을 바꾸지 않는다 — 지금 동작이 결정과 같다는 것을 고정한다.
//   · 판정은 장부 세션 창만 본다(earlyWindowOf, K4) — 클락 설정의 분은 세션이 있으면 안 쓴다.
//   · 세션 얼리 창을 쓰는 자리는 둘뿐이다: ① 장부 세션 폼(포스터 구조 상속 + 폼 레벨 → 분, 진행 중 클락이면 기존 값 유지)
//     ② 클락 설정 화면에서 **새로 시작할 때**(startClock). 진행 중 화면의 구조 편집(persist)은 세션을 쓰지 않는다.
// 음성 대조: TournamentClock 의 live 구조 편집 경로에 saveLedgerSession(...earlyDoubleMin...) 을 넣으면 '진행 중' 단언이,
//            NuriPosLedger submitOnce 의 `if (!clockState?.running)` 을 지우면 '진행 중 클락' 단언이 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { earlyWindowOf, deriveClockCounts, defaultClockConfig } from './clock';
import type { LedgerBuyin } from './ledger';

const src = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');

describe('클락 #1 얼리 기준 = 등록 시점(장부 세션) 스냅샷', () => {
  it('진행 중 클락 구조를 바꿔도(설정 분 변경) 판정은 세션 창 그대로', () => {
    const session = { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: '2026-09-29T10:00:00.000Z', openedAt: null };
    const b = { id: 'x', playerName: 'a', entryNo: 1, buyinAt: '2026-09-29T10:30:00.000Z' } as unknown as LedgerBuyin;
    const before = deriveClockCounts([b], earlyWindowOf({ ...defaultClockConfig(), earlyDoubleMin: 20, earlySingleMin: 40 }, session));
    const edited = deriveClockCounts([b], earlyWindowOf({ ...defaultClockConfig(), earlyDoubleMin: 60, earlySingleMin: 120 }, session));
    expect(edited).toEqual(before);
    expect(before.earlies).toBe(1);
    expect(before.doubleEarlies).toBe(0);
  });

  it('클락 화면에서 세션 얼리 창을 쓰는 곳은 startClock(새로 시작) 한 곳뿐', () => {
    const s = src('../components/features/clock/TournamentClock.tsx');
    const calls = [...s.matchAll(/saveLedgerSession\(/g)].map((m) => m.index!);
    expect(calls.length).toBe(1);
    const start = s.indexOf('const startClock = async');
    const next = s.indexOf('\n  const ', start + 30);
    expect(calls[0]).toBeGreaterThan(start);
    expect(calls[0]).toBeLessThan(next);
  });

  it('장부 세션 폼은 진행 중 클락이면 기존 얼리 창을 유지한다(포스터·폼 레벨로 다시 계산하지 않음)', () => {
    const s = src('../components/features/NuriPosLedger.tsx');
    const body = s.slice(s.indexOf('const submitOnce = '), s.indexOf('earlyDoubleMin: earlyDMin, earlySingleMin: earlySMin'));
    expect(body).toMatch(/let earlyDMin = base\.earlyDoubleMin \?\? 0, earlySMin = base\.earlySingleMin \?\? 0;/);
    // 2026-10-09 H03-08 후속 — 세션 얼리는 sessionEarlyBasis(최신 클락이 protect 면 그 설정, 아니면 cfg) 한 벌에서 나온다.
    expect(body).toMatch(/if \(!clockState\?\.running\) \{[\s\S]*const earlyCfg = basisErr \? cfg : sessionEarlyBasis\(basis, base\.sessionDate, cfg\);[\s\S]*earlyDMin = early\.earlyDoubleMin; earlySMin = early\.earlySingleMin;/);
    // 포스터 구조(레벨 길이)가 등록 때 분 환산에 들어간다 — 포스터 등록 기준
    // 2026-09-30 KW-1a: 병합은 lib/ledgerStart 로 옮겼다 — 주석 속 이름에 걸리지 않게 실제 호출 모양을 본다.
    expect(body).toMatch(/const cfg = ledgerStartClockConfig\(baseCfg, linkedSched, /);
    expect(src('../lib/ledgerStart.ts')).toMatch(/const schedPatch = sched \? clockPatchFromSchedule\(sched\) : \{\};/);
  });
});
