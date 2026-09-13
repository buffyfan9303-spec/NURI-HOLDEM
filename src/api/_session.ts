// src/api/_session.ts — 로그인한 사람이 누구인지 알아내는 단 하나의 통로
//
// ── 왜 만들었나 ─────────────────────────────────────────────────────────────
// 앱 전체에 `supabase.auth.getUser()` 가 37군데 흩어져 있었다.
// getUser() 는 이름과 달리 **매번 /auth/v1/user 로 네트워크 왕복**을 한다
// (supabase-js v2 는 JWT 유효성 검증을 서버에 위임한다).
//
// 그래서 장부에서 바인 하나 승인할 때, 커뮤니티에서 좋아요 한 번 누를 때마다
// "인증 왕복 1회 + 실제 작업 1회" 로 최소 두 번을 기다렸다. 지하 매장의
// LTE 에서는 이 왕복 하나가 체감 지연의 절반이었다.
//
// getSession() 은 로컬 저장소에서 읽는다. 만료가 임박했으면 supabase-js 가
// 알아서 갱신해 주므로 '오래된 토큰을 쥐고 있는' 문제도 없다.
//
// ── 이게 보안을 낮추지 않는 이유 ────────────────────────────────────────────
// 여기서 얻은 uid 는 두 가지에만 쓴다.
//   ① 내 것만 골라 보여주는 클라이언트 필터
//   ② insert 할 때 작성자 칼럼에 넣는 값
// 진짜 인가는 전부 RLS 가 한다. RLS 는 요청에 실려 온 JWT 를 **서버가 직접**
// 검증해 auth.uid() 를 만들기 때문에, 브라우저에서 로컬 uid 를 위조해 봐야
// 서버가 보는 auth.uid() 는 바뀌지 않는다 — 위조한 insert 는 정책에서 거부된다.
// 즉 getUser() 의 서버 검증은 RLS 위에 얹힌 **중복 방어**였고,
// 그 대가로 모든 버튼이 왕복을 하나씩 더 내고 있었다.
//
// ── 그래도 getUser() 를 써야 하는 곳 ────────────────────────────────────────
// "지금 이 순간 토큰이 살아 있는가" 자체가 조작의 전제인 경우 —
// 비밀번호·이메일 변경, 계정 삭제, 결제 수단 등록 같은 것들.
// 그런 자리에서는 이 헬퍼를 쓰지 말고 supabase.auth.getUser() 를 직접 불러라.
import { supabase, IS_MOCK } from '../lib/supabase';

/**
 * 지금 로그인한 사람. 비로그인이면 null.
 *
 * 반환 모양을 `{ id }` 로 맞춘 건 기존 호출부
 * (`const { data: { user } } = await supabase.auth.getUser()` → `user.id`)
 * 를 그대로 두고 갈아끼우기 위해서다.
 */
export async function currentUser(): Promise<{ id: string } | null> {
  // 모의 모드에선 supabase 가 null 이다. 호출부들이 대개 IS_MOCK 로 먼저 빠져나가지만,
  // 통로가 하나로 모인 김에 여기서도 막아 둔다(빈 환경변수로 뜬 화면이 흰 화면이 되지 않게).
  if (IS_MOCK) return null;
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  return id ? { id } : null;
}

/**
 * `currentUser` 와 같지만 **세션을 읽지 못한 것**과 **로그인하지 않은 것**을 구분한다.
 *
 * ⚠ 왜 따로 필요한가 (A01, 2026-09-12):
 *   `getSession()` 은 저장소 읽기 실패·토큰 갱신 실패(네트워크·5xx)에도 **reject 하지 않고**
 *   `{ data: { session: null }, error }` 로 resolve 한다. 그래서 `currentUser()` 는
 *   '일시적으로 확인 불가' 를 '비로그인' 과 똑같은 `null` 로 돌려줬다.
 *   AuthContext 는 그 null 을 정상 성공으로 받아 **재시도 없이 비로그인 화면**을 만든다 —
 *   토큰은 저장소에 멀쩡히 있는데 화면만 로그아웃된다. 사용자 눈에는 '자동 로그인이 안 됐다' 다.
 *
 *   같은 결함을 프로필 조회(`getMyProfile`)는 2026-09-11 에 '던지기' 로 이미 막았다.
 *   **한 겹 앞인 세션 조회에 같은 구멍이 남아 있던 것**이라, 같은 방식으로 막는다.
 *
 * ⚠ 여기서 토큰을 지우지 않는다. 일시 오류에 저장소를 비우면 회복 가능한 상황을 확정 로그아웃으로 만든다.
 *   무효·폐기된 세션 정리는 SDK 와 명시적 로그아웃 경로가 맡는다.
 *
 * 기존 `currentUser()` 는 그대로 둔다 — 호출부가 67곳이고, 대부분은 '비로그인이면 조용히 건너뛴다' 가 맞다.
 *
 * @throws 세션을 읽지 못했을 때(일시 오류). 호출부의 catch 가 **기존 상태를 유지**하고 재시도하게 한다.
 */
export async function currentUserStrict(): Promise<{ id: string } | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;                       // 확인 불가 — 비로그인으로 단정하지 않는다
  const id = data.session?.user?.id;
  return id ? { id } : null;                    // null 은 '정말 로그인 안 함' 일 때만
}

/** uid 만 필요할 때 */
export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}
