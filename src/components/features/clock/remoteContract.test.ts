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
    expect(stopBranch![0]).toContain('currentIndex: eff.index');
  });
});

// (2026-09-13 수정) 이 describe 는 원래 "참 분기는 `next.liveStats` 를 그대로 흘린다" 까지 고정하려던
// 자리였다. 그 동작은 **틀렸다** — 리모컨으로 누른 탈락(eliminations)·보정(adj*)이 TV 보드에 영원히
// 반영되지 않는다(ClockDisplay 는 liveStats.alive 를 읽고, 남은 쓰기 경로인 TournamentClock 의 디바운스
// effect 는 deps 가 derivedKey(장부 카운트+바인단가)뿐이라 이 변화로 발사되지 않는다. 무인이면 PC 자체가 없다).
// 그래서 계약을 "장부를 재계산하지 않는다"(C02 의 진짜 요지)로 좁히고, 갱신 책임은
// applyRemoteStatDelta 에 넘긴다 — 동작 검증은 src/api/clock.remoteStats.test.ts 가 한다.
describe('C02 · 리모컨은 장부 연동 클락의 통계를 "장부에서" 재계산해 저장하지 않는다', () => {
  it('persist 가 장부 연동(state.sessionDate) 분기에서 computeLiveStats·derived 를 쓰지 않는다', () => {
    const m = code.match(/const persist = useCallback\(async \(patch: Partial<ClockState>\) => \{[\s\S]*?\n {2}\}, \[/);
    expect(m, 'persist 정의를 찾지 못했다').not.toBeNull();
    const body = m![0];
    // 삼항의 sessionDate 쪽(참 분기, `?` 와 `:` 사이)에 장부 재계산이 있으면 안 된다.
    const ternary = body.match(/const liveStats = state\.sessionDate\s*\?\s*([\s\S]*?)\s*:\s*([\s\S]*?);/);
    expect(ternary, 'liveStats 삼항 분기를 찾지 못했다').not.toBeNull();
    const truthyBranch = ternary![1];
    expect(truthyBranch).not.toContain('computeLiveStats');
    expect(truthyBranch, '리모컨의 1회성 buyins(derived)가 장부 연동 분기에 들어갔다 — C02 회귀').not.toContain('derived');
  });

  it('참 분기는 정본 스냅샷에 state 변화분만 얹는다(그대로 흘리면 TV 가 멈춘다)', () => {
    const body = code.match(/const persist = useCallback\(async \(patch: Partial<ClockState>\) => \{[\s\S]*?\n {2}\}, \[/)![0];
    const truthyBranch = body.match(/const liveStats = state\.sessionDate\s*\?\s*([\s\S]*?)\s*:\s*/)![1];
    expect(truthyBranch).toContain('applyRemoteStatDelta');
    expect(truthyBranch, 'next.liveStats 를 그대로 흘리면 리모컨 조작이 TV 에 반영되지 않는다').not.toMatch(/^next\.liveStats/);
  });
});
