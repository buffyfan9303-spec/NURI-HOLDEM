// 클락 리모컨 — 제어 계약 (C02·C03, 2026-09-12 재현/고정)
//
// 렌더 트리 테스트로 잡기 어렵다(auth·supabase·ledger API를 다 채워야 한다).
// 저장소가 이미 쓰는 소스 계약 테스트 방식으로 잠근다(fullscreenContract.test.ts 와 같은 결).
// 실행: npx vitest run src/components/features/clock/remoteContract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'ClockRemote.tsx'), 'utf-8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('C03 · STOP·레벨 이동은 raw currentIndex 가 아니라 effectiveLevel 인덱스를 쓴다', () => {
  it('moveLevel 이 levelMovePatch 에 eff.index 를 넘긴다(state.currentIndex 가 아니다)', () => {
    const m = code.match(/const moveLevel = \(delta: number\) => \{[^}]*\}/);
    expect(m, 'moveLevel 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toContain('levelMovePatch(state, eff.index, delta)');
    expect(body).not.toMatch(/levelMovePatch\(state,\s*state\.currentIndex/);
  });

  it('toggleRun 의 STOP 분기가 currentIndex 를 eff.index 로 함께 커밋한다(remainingMs 만 패치하지 않는다)', () => {
    const m = code.match(/const toggleRun = \(\) => \{[\s\S]*?\n {2}\};/);
    expect(m, 'toggleRun 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    const stopBranch = body.match(/if \(state\.running\) persist\(\{[^}]*\}\)/);
    expect(stopBranch, 'STOP persist 호출을 찾지 못했다').not.toBeNull();
    // C5(2026-09-25): 실효 레벨을 **누른 순간** 다시 잰다(at = effectiveLevel(state, nowMs())) — 렌더 시점 eff 는 최대 1초 낡았다.
    expect(stopBranch![0]).toMatch(/currentIndex: (?:eff|at)\.index/);
    expect(body).toContain('effectiveLevel(state, nowMs())');
  });
});

// K1·K5(2026-09-29 실측) — 리모컨은 통계를 **저장하지 않는다**. 표시는 TV 와 같은 합성(composeLiveStats) 한 벌이고,
// ± 는 saveClockPatch 가 카운트 차분만 서버 원자 RPC 로 보낸다. 장부 몫 스냅샷은 작성기 한 벌(syncClockLedgerStats)로만 쓴다.
// (예전 계약 — 'applyRemoteStatDelta 로 정본에 차분을 얹어 저장' — 은 낡은 사본이 남의 탈락을 지우는 원인이라 뒤집었다.
//  동작 검증: src/api/clock.remoteStats.test.ts · src/api/clock.cas.test.ts)
describe('K1·K5 · 리모컨은 통계를 계산해 저장하지 않는다(표시 = TV 와 같은 합성)', () => {
  const persist = code.match(/const persist = useCallback\((?:async )?\(patch: Partial<ClockState>\) => \{[\s\S]*?\n {2}\}, \[/)?.[0] ?? '';
  it('persist 는 composeLiveStats 로 화면만 다시 합성한다 — computeLiveStats·derived·applyRemoteStatDelta 없음', () => {
    expect(persist, 'persist 정의를 찾지 못했다').not.toBe('');
    expect(persist).toContain('composeLiveStats(moved)');
    expect(persist).not.toMatch(/computeLiveStats|derived|applyRemoteStatDelta/);
  });
  it('🔴 화면 표시 stats 도 같은 합성이다(진입 때 한 번 읽은 장부로 계산하지 않는다 — 4C)', () => {
    expect(code).toMatch(/const stats = composeLiveStats\(state\)/);
    expect(code).not.toMatch(/getLedgerBuyins|deriveClockCounts/);
  });
  it('장부 몫은 작성기 한 벌(syncClockLedgerStats)로만 쓴다', () => {
    expect(code).toContain('syncClockLedgerStats(');
    expect(code).not.toMatch(/saveClockLiveStats|saveClockState\(/);
  });
});
