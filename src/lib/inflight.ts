// src/lib/inflight.ts — '동시에' 나가는 같은 요청을 한 번으로 합친다(중복 네트워크 제거).
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 콜드 부팅 실측(2026-08-29 · 프로덕션 빌드 · 로그인 상태): REST 요청 70건 중 **14건이 중복**이었다.
//   ×4 rpc/get_my_staff_invites · ×4 user_blocks(2쿼리) · ×2 profiles · ×2 venues(verification_status)
//   ×2 rpc/claim_daily_login_point · ×2 venue_follows · ×2 venue_reviews(limit 5000)
// 원인은 AuthContext 가 부팅 중 프로필을 두 경로(직접 조회 + onAuthStateChange)로 세팅하면서
// `user` 참조가 3~4번 갈리고, `[user]` 의존 이펙트들이 그 횟수만큼 재발화한 것이다.
// 중복 요청은 서버 왕복뿐 아니라 응답 JSON 파싱까지 메인스레드에서 반복시킨다
// (콜드 마운트 프로파일: fetch 40.5ms + supabase processResponse 16.3ms · 모바일 375 CPU 4x).
//
// ── 무엇을 하나 ─────────────────────────────────────────────────────────────
// **비행 중(in-flight)** 인 같은 키의 요청이 있으면 그 프라미스를 그대로 돌려준다.
//   · 캐시가 아니다 — 응답이 도착(성공·실패 무관)하는 순간 키를 버린다. 이후 호출은 새로 나간다.
//     따라서 데이터 신선도·재조회 시점은 이전과 완전히 동일하다(요청 '개수'만 줄어든다).
//   · 두 번째 호출자는 첫 번째와 같은 값을 받는다 — 같은 순간에 같은 쿼리를 두 번 쏘던 것이라
//     화면에 들어가는 값도 동일하다(렌더 결과 불변).
//   · 실패도 공유한다. 각자 catch 해서 재시도하면 그때는 키가 이미 비어 새 요청이 나간다.
//
// ⚠ 주의: 반환값 객체를 **공유**하게 되므로 호출부가 결과를 직접 변형(mutate)하면 안 된다.
//   현재 적용 대상(프로필·차단목록·초대·팔로우·평점 집계)은 모두 읽기 전용으로만 쓰인다.
const flying = new Map<string, Promise<unknown>>();

/** key 가 같은 요청이 비행 중이면 그 프라미스를 재사용한다. */
export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = flying.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = run().finally(() => { if (flying.get(key) === p) flying.delete(key); });
  flying.set(key, p);
  return p;
}
