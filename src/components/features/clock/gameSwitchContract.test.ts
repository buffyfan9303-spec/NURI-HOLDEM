// 멀티 클락 게임 전환 — 세대 가드 계약 (C04, 2026-09-12 재현/고정)
//
// 재현: switchGame(2) → switchGame(1) 을 빠르게 하면 2번 getClockState 응답이 늦게 도착해
//   그새 이미 1번으로 넘어간 화면을 덮는다(curGameSeqRef.current 만 즉시 갱신되고 응답엔 가드가 없었다).
// 렌더 트리 테스트로 잡기 어렵다(auth·supabase·ledger API를 다 채워야 한다) — 저장소가 이미 쓰는
// 소스 계약 테스트 방식으로 잠근다(remoteContract.test.ts·fullscreenContract.test.ts 와 같은 결).
//
// 고침: N01(캘린더·알림)에서 쓴 공통 계약 src/lib/staleResponse.ts 의 isStaleResponse 를 그대로 쓴다 —
//   owner = 이 요청이 보여주려는 게임(gameSeq). switchGame·startClock(quickStart 경유)·reloadState 가 공유.
// 실행: npx vitest run src/components/features/clock/gameSwitchContract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'TournamentClock.tsx'), 'utf-8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('C04 · 게임 전환 응답에 isStaleResponse 세대 가드가 있다', () => {
  it('공통 계약 isStaleResponse 를 import 한다(화면마다 다르게 막지 않는다)', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*isStaleResponse[^}]*\}\s*from\s*['"].*staleResponse['"]/);
  });

  it('switchGame 이 응답 처리 전에 isStaleResponse 로 낡은 응답을 걸러낸다', () => {
    const m = code.match(/const switchGame = useCallback\(\(g: number\) => \{[\s\S]*?\n {2}\}, \[/);
    expect(m, 'switchGame 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toContain('isStaleResponse(');
    // setState 가 가드 없이 무조건 호출되면 회귀 — stale 체크 다음 줄에 setState 가 있어야 한다.
    expect(body).toMatch(/isStaleResponse\([^)]*\)\)\s*(return;|\{\s*return;)/);
  });

  it('startClock 완료 시점에도 낡은 요청이면 화면(setState/setView)을 바꾸지 않는다', () => {
    const m = code.match(/const startClock = async \([\s\S]*?\n {2}\};/);
    expect(m, 'startClock 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toContain('isStaleResponse(');
  });
});

describe('H03-06 · 게임 A 에서 무장한 되돌리기·실행취소는 게임 B 에 쓰이지 않는다', () => {
  it('persistFor 는 무장 시점의 (매장#게임) 키가 지금 stateRef 와 다르면 쓰지 않는다', () => {
    // 2026-10-09 — 부모의 지금 (매장, 게임)(ownerNow) 도 같이 본다: 매장 전환은 ClockLive 를 언마운트해 stateRef 가 A 로 굳는다(PR #244 검증 P2).
    expect(code).toMatch(/const persistFor = \(owner: string, patch: Partial<ClockState>\): boolean => \{\s*if \(clockOwnerKey\(ownerNow\(\)\) !== owner \|\| clockOwnerKey\(stateRef\.current\) !== owner\) return false;/);
    expect(code).toMatch(/const ownerNow = useCallback\(\(\) => \(\{ venueId: venueNow\.current, gameSeq: curGameSeqRef\.current \}\), \[\]\);/);
    expect(code).toMatch(/<ClockLive[\s\S]{0,300}ownerNow=\{ownerNow\}/);
  });
  it('레벨 되돌리기·일시정지/재개 실행취소가 모두 persistFor 를 지난다(맨 persist 금지)', () => {
    expect(code).toMatch(/const undoOwner = levelUndoOwnerRef\.current;\s*const done = persistFor\(undoOwner, levelUndoPatch\(levelUndo\)\)/);
    expect(code).not.toMatch(/\bpersist\(levelUndoPatch\(/);
    const undos = code.match(/label: '실행취소', onClick: \(\) => [^\n]*/g) ?? [];
    expect(undos.length).toBe(2);
    for (const u of undos) expect(u).toContain('persistFor(owner,');
  });
  it('후속 — 쓰지 않았으면 말없이 넘기지 않고 안내한다(실행취소 2곳 · 레벨 되돌리기)', () => {
    const undos = code.match(/label: '실행취소', onClick: \(\) => [^\n]*/g) ?? [];
    expect(undos.length).toBe(2);
    for (const u of undos) expect(u).toMatch(/if \(!persistFor\(owner, [^\n]*\)\) undoSkipped\(owner\);/);
    expect(code).toMatch(/if \(!done\) \{ undoSkipped\(undoOwner\); return; \}/);
    // 2026-10-09 — 문구는 무장 시점 주인 키 대 부모의 지금 (매장, 게임) 으로 판정한다(매장이 바뀌었으면 '다른 매장').
    //   판정 본체 시험은 src/lib/storeP3_1009.test.ts, 실제 매장 전환 경로는 e2e/clock-undo-venue-switch-1009.spec.ts.
    expect(code).toMatch(/const undoSkipped = \(owner: string\) => toast\.show\(undoSkippedText\(owner, ownerNow\(\)\), 'info'\);/);
  });
  it('게임·매장이 바뀌면 되돌리기 버튼을 거둔다', () => {
    expect(code).toMatch(/useEffect\(\(\) => \{ setLevelUndo\(null\); \}, \[state\.venueId, state\.gameSeq\]\);/);
  });
});
