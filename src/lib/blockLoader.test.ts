// 차단 목록 로더 계정 축(2026-09-29). 실행: npx vitest run src/lib/blockLoader.test.ts
import { describe, it, expect } from 'vitest';
import { createBlockLoader } from './blockLoader';

function rig() {
  let state: string[] = [];
  const pending: { uid: string; ok: (v: string[]) => void; ng: (e: unknown) => void }[] = [];
  let who = '';
  const load = createBlockLoader<string[]>({
    fetch: () => new Promise((ok, ng) => pending.push({ uid: who, ok, ng })),
    apply: (v) => { state = v; },
    clear: () => { state = []; },
  });
  const call = (uid: string | null) => { who = uid ?? ''; return load(uid).catch(() => {}); };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { get state() { return state; }, pending, call, tick };
}

describe('차단 목록 로더', () => {
  it('🔴 계정 A→B 에서 B 조회가 실패해도 A 의 차단 목록이 B 에 남지 않는다', async () => {
    const r = rig();
    r.call('A'); r.pending.shift()!.ok(['A가 차단한 사람']); await r.tick();
    expect(r.state).toEqual(['A가 차단한 사람']);
    r.call('B'); r.pending.shift()!.ng(new Error('x')); await r.tick();
    expect(r.state).toEqual([]);
  });

  it('같은 계정 재조회 실패 — 직전 목록 유지(차단이 조용히 풀리지 않는다)', async () => {
    const r = rig();
    r.call('A'); r.pending.shift()!.ok(['X']); await r.tick();
    r.call('A'); r.pending.shift()!.ng(new Error('x')); await r.tick();
    expect(r.state).toEqual(['X']);
  });

  it('🔴 A 조회가 늦게 도착(B 로 바뀐 뒤) — B 화면에 A 목록을 덮지 않는다', async () => {
    const r = rig();
    r.call('A');
    r.call('B');
    const [a, b] = r.pending;
    b.ok(['B목록']); await r.tick();
    a.ok(['A목록']); await r.tick();
    expect(r.state).toEqual(['B목록']);
  });

  it('로그아웃 — 비운다', async () => {
    const r = rig();
    r.call('A'); r.pending.shift()!.ok(['X']); await r.tick();
    await r.call(null);
    expect(r.state).toEqual([]);
    expect(r.pending.length).toBe(0);
  });
});
