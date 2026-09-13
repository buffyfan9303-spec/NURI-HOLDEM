// 인증 '세대(generation)' — 로그아웃·계정 전환 뒤 **먼저 나갔던 응답**을 버리기 위한 판정.
//
// 왜 따로 있는가 (A04, 2026-09-12):
//   `AuthContext` 의 프로필 조회는 전부 `await` 뒤에 `setUser` 를 한다. 그 사이에 로그아웃이나
//   계정 전환이 일어나면 **이미 사라진 계정의 프로필이 되살아난다.** 실측된 경로 넷:
//     · 부팅 조회(재시도 타이머 포함)가 SIGNED_OUT 뒤에 도착 → 로그아웃했는데 다시 로그인 상태
//     · onAuthStateChange → setTimeout(0) 조회가 A 로 나갔는데 B 로그인 뒤 도착 → **남의 권한·역할**
//     · refreshProfile / updateProfile 이 로그아웃 뒤 도착
//     · 낡은 프로필의 제재 판정이 **지금 로그인한 다른 사람을** 강제 로그아웃
//   역할(`role`)까지 되살아나므로 이건 표시 문제가 아니라 **권한 경계** 문제다.
//
//   `staleResponse.ts` 와 같은 계보지만 인증에는 규칙이 하나 더 있다:
//   **부팅 첫 조회는 uid 를 아직 모른다.** 그래서 단순 owner 비교로는 자동 로그인이 통째로 버려진다.
//   아래 `canApplyProfile` 의 '소유자 미확정' 분기가 그 차이다.
//
// vitest 환경이 `node` 라 Provider 를 렌더해 검증할 수 없어 판정만 순수 함수로 뺀다.

/** 지금 이 탭이 믿고 있는 인증 상태. `owner` 는 확정된 auth uid, 없으면 null. */
export interface AuthGeneration {
  /** 인증이 **무효화된 횟수**. 로그아웃·계정 전환에서만 올라간다. */
  seq: number;
  /** 확정된 계정. 부팅 직후처럼 아직 모르면 null. */
  owner: string | null;
}

export function initialAuthGeneration(): AuthGeneration {
  return { seq: 0, owner: null };
}

/**
 * 계정을 `next` 로 확정한다.
 *
 * ⚠ 세대를 올리는 것은 **이전 계정이 있었고 그게 바뀔 때뿐**이다.
 *   null → uid (부팅 중 세션 확인, 로그인 성공)에서 올리면 **바로 그 요청의 응답까지 버려져**
 *   자동 로그인이 화면에 반영되지 않는다. 이건 A04 를 고치다 실제로 밟은 함정이다.
 */
export function withOwner(cur: AuthGeneration, next: string | null): AuthGeneration {
  if (next === null) return withSignedOut(cur);
  if (cur.owner === next) return cur;                       // 같은 계정 재확인(TOKEN_REFRESHED 등) — 무효화 아님
  if (cur.owner === null) return { seq: cur.seq, owner: next }; // 최초 확정
  return { seq: cur.seq + 1, owner: next };                 // 계정 전환 — 이전 계정의 in-flight 는 전부 버린다
}

/** 로그아웃. 이미 로그아웃 상태여도 **무조건 올린다** — 진행 중인 조회를 끊는 게 목적이다. */
export function withSignedOut(cur: AuthGeneration): AuthGeneration {
  return { seq: cur.seq + 1, owner: null };
}

/**
 * 요청할 때 찍어 둔 `captured` 로 받은 프로필을 **지금** 반영해도 되는가.
 *
 * @param profileId 응답이 담고 있는 계정. 프로필이 없으면(비로그인 확인) null.
 */
export function canApplyProfile(
  captured: AuthGeneration,
  cur: AuthGeneration,
  profileId: string | null,
): boolean {
  // 그 사이 로그아웃하거나 계정이 바뀌었다 — 내용과 무관하게 버린다.
  if (captured.seq !== cur.seq) return false;
  // 방어: 세대가 같은데 소유자가 다를 수는 없지만(위 규칙상 전환이면 seq 가 오른다),
  // 규칙이 바뀌어도 **남의 프로필이 새는 쪽으로는** 무너지지 않게 한 겹 더 둔다.
  if (captured.owner !== null && cur.owner !== null && captured.owner !== cur.owner) return false;
  // 소유자가 확정돼 있으면 응답도 그 사람 것이어야 한다.
  if (cur.owner !== null && profileId !== null && profileId !== cur.owner) return false;
  // cur.owner === null 은 **부팅 중 미확정**뿐이다(로그아웃은 위 seq 검사에서 이미 걸렀다).
  return true;
}
