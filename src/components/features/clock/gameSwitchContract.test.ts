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
