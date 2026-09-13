// UI-08-1 계정 A→B 경계 — 실계정 없이 **동작**으로 잡는다: A 계정으로 낸 조회가 B 로 바뀐 뒤 늦게 도착해도 상태를 못 건드린다 (2026-09-13).
// 음성 대조: scopedLoad.ts 의 `if (fresh()) ok(v)` 에서 `if (fresh())` 를 지우면 첫 케이스가 실패한다.
// 실행: npx vitest run src/lib/scopedLoad.test.ts
import { describe, it, expect } from 'vitest';
import { scopedLoad, bumpScope, type ScopeRef } from './scopedLoad';

function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('scopedLoad — 계정 경계 뒤 도착한 응답은 버린다', () => {
  it('🔴 A 계정 업적 조회 중 로그아웃→B 로그인, B 응답 반영 뒤 A 응답 도착 → A 값이 B 화면에 실리지 않는다', async () => {
    const ref: ScopeRef = { current: { seq: 0, owner: 'anon' } };
    const state = { badges: null as string | null, err: null as unknown, settled: 0 };
    bumpScope(ref, 'user-A');
    const a = deferred<string>();
    scopedLoad(ref, a.promise, (v) => { state.badges = v; }, (e) => { state.err = e; }, () => { state.settled += 1; });
    bumpScope(ref, 'anon');           // 로그아웃 — 상태는 호출부가 비운다
    bumpScope(ref, 'user-B');
    const b = deferred<string>();
    scopedLoad(ref, b.promise, (v) => { state.badges = v; }, (e) => { state.err = e; }, () => { state.settled += 1; });
    b.resolve('B의 업적'); await flush();
    expect(state.badges).toBe('B의 업적');
    a.resolve('A의 업적(개인정보)'); await flush();
    expect(state.badges, 'A 계정의 값이 B 화면을 덮었다').toBe('B의 업적');
    expect(state.settled, 'A 의 finally 도 무시된다').toBe(1);
  });
  it('🔴 늦은 A 의 실패도 B 에 오류를 띄우지 않는다', async () => {
    const ref: ScopeRef = { current: { seq: 0, owner: 'user-A' } };
    const state = { err: null as unknown };
    const a = deferred<number>();
    scopedLoad(ref, a.promise, () => {}, (e) => { state.err = e; });
    bumpScope(ref, 'user-B');
    a.reject(new Error('A 세션 만료')); await flush();
    expect(state.err).toBeNull();
  });
  it('같은 계정의 재시도(같은 owner, 새 seq)는 최신 응답만 반영한다 · 정상 경로는 그대로', async () => {
    const ref: ScopeRef = { current: { seq: 0, owner: 'user-A' } };
    const state = { v: 0 };
    bumpScope(ref, 'user-A');
    const first = deferred<number>();
    scopedLoad(ref, first.promise, (v) => { state.v = v; }, () => {});
    bumpScope(ref, 'user-A');   // 다시 시도
    const second = deferred<number>();
    scopedLoad(ref, second.promise, (v) => { state.v = v; }, () => {});
    second.resolve(2); await flush(); first.resolve(1); await flush();
    expect(state.v).toBe(2);
  });
});
