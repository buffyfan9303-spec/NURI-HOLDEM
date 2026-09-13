// A04 — 로그아웃·계정 전환 뒤 도착한 프로필 응답을 버린다.
//
// 실측 경로(AuthContext): 부팅 조회와 그 재시도 타이머 / onAuthStateChange → setTimeout(0) 조회 /
// refreshProfile · updateProfile / 낡은 프로필의 제재 판정. 전부 `await` 뒤 `setUser` 라
// 그 사이 계정이 바뀌면 **남의 프로필과 역할**이 화면에 들어온다.
//
// 동시에 **반대 방향 사고**도 막아야 한다: 세대를 너무 쉽게 올리면 방금 한 로그인·자동 로그인이
// 스스로에게 버려져 화면이 비로그인으로 남는다. 아래 '버리면 안 되는 것들' 절이 그 경계다.
import { describe, it, expect } from 'vitest';
import {
  initialAuthGeneration, withOwner, withSignedOut, canApplyProfile,
} from './authGeneration';

const A = 'uid-A';
const B = 'uid-B';

describe('A04 — 버려야 하는 응답', () => {
  it('🔴 로그아웃 뒤 도착한 부팅 조회가 계정을 되살리지 못한다', () => {
    const captured = initialAuthGeneration();          // 부팅 조회가 나갔다
    const now = withSignedOut(captured);               // 그 사이 사용자가 로그아웃
    expect(canApplyProfile(captured, now, A), '로그아웃했는데 다시 로그인 상태가 됐다').toBe(false);
  });

  it('🔴 A 로 나간 조회가 B 로그인 뒤 도착하면 버린다 — 남의 역할·권한이 들어온다', () => {
    const captured = withOwner(initialAuthGeneration(), A);
    const now = withOwner(captured, B);
    expect(canApplyProfile(captured, now, A), 'A 의 프로필이 B 화면에 들어왔다').toBe(false);
  });

  it('🔴 낡은 제재 판정이 지금 로그인한 다른 사람을 쫓아내지 못한다', () => {
    // A 가 정지 계정이고, A 의 프로필 조회가 늦게 도착한다. 그 사이 B 가 로그인했다.
    const captured = withOwner(initialAuthGeneration(), A);
    const now = withOwner(captured, B);
    // 제재 분기에 들어가기 **전에** 이 판정이 막아야 한다.
    expect(canApplyProfile(captured, now, A), 'B 가 A 의 제재로 로그아웃당한다').toBe(false);
  });

  it('🔴 재시도 타이머가 로그아웃 뒤에 깨어나도 무효다', () => {
    const captured = initialAuthGeneration();
    const now = withSignedOut(captured);               // 1.2초 기다리는 사이 로그아웃
    expect(canApplyProfile(captured, now, A)).toBe(false);
  });

  it('로그아웃 뒤 B 로 로그인했을 때, 로그아웃 시점에 나간 조회도 무효다', () => {
    const captured = withSignedOut(withOwner(initialAuthGeneration(), A)); // 로그아웃 직후 나간 요청
    const now = withOwner(captured, B);
    // 세대는 같지만(로그아웃→로그인은 올리지 않는다) 소유자가 확정됐고 응답은 A 의 것이다.
    expect(canApplyProfile(captured, now, A), '소유자 불일치를 통과시켰다').toBe(false);
  });

  it('비로그인 확인(null) 응답도 계정이 들어온 뒤에는 반영하지 않는다', () => {
    const captured = initialAuthGeneration();
    const now = withSignedOut(captured);
    expect(canApplyProfile(captured, now, null)).toBe(false);
  });

  it('로그아웃은 이미 로그아웃 상태여도 세대를 올린다 — 진행 중인 조회를 끊는 게 목적이다', () => {
    const out1 = withSignedOut(initialAuthGeneration());
    const out2 = withSignedOut(out1);
    expect(out2.seq).toBeGreaterThan(out1.seq);
    expect(canApplyProfile(out1, out2, A)).toBe(false);
  });
});

describe('A04 — 버리면 안 되는 것들 (과잉 차단 = 자동 로그인 실패)', () => {
  it('🔴 부팅 조회는 uid 를 모른 채 나간다 — 소유자 확정만으로 버려지면 자동 로그인이 안 뜬다', () => {
    const captured = initialAuthGeneration();          // owner 미정
    const now = withOwner(captured, A);                // 세션 확인으로 A 확정
    expect(now.seq, '최초 확정에서 세대가 올랐다 — 자기 응답을 버린다').toBe(captured.seq);
    expect(canApplyProfile(captured, now, A), '자동 로그인 결과가 화면에 반영되지 않는다').toBe(true);
  });

  it('🔴 같은 계정 재확인(TOKEN_REFRESHED)은 무효화가 아니다', () => {
    const g = withOwner(initialAuthGeneration(), A);
    const again = withOwner(g, A);
    expect(again).toBe(g);                             // 참조까지 그대로 — 불필요한 재조회도 막는다
    expect(canApplyProfile(g, again, A)).toBe(true);
  });

  it('방금 한 로그인의 결과는 반영된다', () => {
    const before = initialAuthGeneration();
    const now = withOwner(before, A);
    expect(canApplyProfile(now, now, A)).toBe(true);
  });

  it('A 에서 B 로 전환했을 때 B 의 응답은 정상 반영된다', () => {
    const now = withOwner(withOwner(initialAuthGeneration(), A), B);
    expect(canApplyProfile(now, now, B)).toBe(true);
  });

  it('일일 점수 적립 결과도 같은 세대면 반영된다', () => {
    const g = withOwner(initialAuthGeneration(), A);
    expect(canApplyProfile(g, g, A)).toBe(true);
  });
});

describe('withOwner / withSignedOut 계약', () => {
  it('null 을 넘기면 로그아웃으로 취급한다', () => {
    const g = withOwner(initialAuthGeneration(), A);
    const out = withOwner(g, null);
    expect(out.owner).toBeNull();
    expect(out.seq).toBe(g.seq + 1);
  });

  it('계정 전환에서만 세대가 오른다', () => {
    const g0 = initialAuthGeneration();
    const g1 = withOwner(g0, A);       // 최초 확정 — 안 오름
    const g2 = withOwner(g1, A);       // 재확인 — 안 오름
    const g3 = withOwner(g2, B);       // 전환 — 오름
    expect([g1.seq, g2.seq, g3.seq]).toEqual([0, 0, 1]);
  });

  it('세대가 같아도 확정된 소유자가 서로 다르면 통과시키지 않는다 (방어선)', () => {
    const a = { seq: 3, owner: A };
    const b = { seq: 3, owner: B };
    expect(canApplyProfile(a, b, B), '규칙이 바뀌어도 남의 프로필이 새면 안 된다').toBe(false);
  });
});
