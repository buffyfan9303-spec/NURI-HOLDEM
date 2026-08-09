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

/** uid 만 필요할 때 */
export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}
