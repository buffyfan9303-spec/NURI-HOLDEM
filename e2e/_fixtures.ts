// E2E 공용 fixture — **운영 프로젝트에 쓰지 않는다.**
//
// 왜: Playwright 는 프로덕션 빌드(4173)를 검사하는데, 그 빌드가 가리키는 Supabase 는 운영 프로젝트다
//   (`localhost` 라고 운영 DB 가 아닌 것이 아니다). 비로그인 스모크도 조회수 RPC(increment_post_view·
//   bump_schedule_view)·client_errors 삽입 같은 쓰기를 일으킨다. 그래서 브라우저가 내보내는 요청 중
//   **읽기(GET/HEAD)와 읽기 전용 RPC(STABLE 로 선언된 것)** 만 통과시키고 나머지는 네트워크 단에서 끊는다.
//   앱은 supabase-js 가 fetch 실패를 {error} 로 돌려주므로 죽지 않고 '실패' 분기로 간다 — 그 분기가 곧 테스트 대상이다.
// 허용: 격리 프로젝트(E2E_SUPABASE_URL 이 운영 ref 가 아닐 때)에서 E2E_ALLOW_WRITES=1 을 줄 때만 쓰기 통과.
// 노드 쪽 쓰기(restAs)는 e2e/_session.ts 가 같은 규칙으로 막는다.
import { test as base, expect } from '@playwright/test';
import { PROD_REF, WRITES_ALLOWED } from './_session';

/** 읽기 전용 RPC — 라이브 pg_proc 에서 provolatile in ('s','i') 이고 anon/authenticated 실행 가능한 것(2026-09-05 실측)
 *  + 정의를 직접 읽어 쓰기가 없음을 확인한 VOLATILE 3종(venue_today_games·venue_announce_status·client_error_rate_ok).
 *  새 읽기 RPC 를 추가할 때는 마이그레이션에 `stable` 을 선언하고 여기에도 한 줄 — 둘 다 없으면 E2E 에서 막힌다(의도된 실패). */
export const READ_ONLY_RPCS = new Set([
  'can_access_ledger', 'can_manage_pos', 'can_manage_venue', 'can_manage_venue_staff', 'current_season_standings',
  'get_activity_leaderboard', 'get_domestic_rankings', 'get_equipped_marks', 'get_my_staff_invites', 'get_my_venue_invites',
  'get_my_venue_staff', 'get_nick_colors', 'global_ranking_totals', 'is_account_active', 'is_ci_verified', 'is_group_manager',
  'is_group_member', 'is_league_participant', 'is_slug_available', 'is_verified_owner', 'kill_switch_is_set', 'ledger_is_closed',
  'list_venue_owners', 'list_venue_seasons', 'my_championships', 'my_role', 'poll_results', 'pos_has_password',
  'public_activity_points', 'schedule_reservation_counts', 'schedule_reservations_for_owner', 'search_registered_players',
  'season_results', 'shout_queue_info', 'shout_rules', 'venue_buyin_counts', 'venue_hall_of_fame', 'venue_player_counts',
  'venue_ranking_real_name_optins', 'venue_rating_summary', 'venues_season_leaders', 'get_my_buyin_requests_current',
  'get_public_profiles', 'ranking_top_venues',
  // VOLATILE 이지만 정의를 읽어 select 만 함을 확인(2026-09-05): 오늘 게임·공지 상태·오류율·가용성 검사·추천 통계
  'venue_today_games', 'venue_announce_status', 'client_error_rate_ok', 'is_nickname_available', 'is_email_available', 'is_name_available', 'my_referral_stats',
]);

const SUPABASE_API = /^https:\/\/([a-z0-9]+)\.supabase\.co\/(rest|auth|storage|functions)\/v1\/(.*)$/;

/** 이 요청을 통과시켜도 되는가 — 순수 함수(테스트 가능) */
export function isAllowedRequest(method: string, url: string, writesAllowed = WRITES_ALLOWED): boolean {
  const m = SUPABASE_API.exec(url);
  if (!m) return true;                                   // Supabase 가 아니면 관여하지 않는다
  const [, ref, service, rest] = m;
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return true;
  if (service === 'rest' && rest.startsWith('rpc/')) {
    const name = rest.slice(4).split(/[?/]/)[0];
    if (READ_ONLY_RPCS.has(name)) return true;
  }
  // 세션 발급·갱신·폐기는 **앱 데이터 변이가 아니다** — UI 로그인 스펙(auth-smoke·auto-login)이 이걸 지나간다.
  // signup(계정 생성)·user(비밀번호 변경)·recover·verify 는 진짜 변이라 계속 막는다.
  if (service === 'auth' && /^(token\?.*grant_type=(password|refresh_token)|logout(\?|$))/.test(rest)) return true;
  return writesAllowed && ref !== PROD_REF;
}

export const test = base.extend({
  context: async ({ context }, run, testInfo) => {
    const blocked: string[] = [];
    await context.route(SUPABASE_API, (route) => {
      const req = route.request();
      if (isAllowedRequest(req.method(), req.url())) return route.continue();
      blocked.push(`${req.method()} ${req.url().replace(/^https:\/\/[a-z0-9]+\.supabase\.co/, '')}`);
      return route.abort('blockedbyclient');
    });
    await run(context);
    if (blocked.length) testInfo.annotations.push({ type: 'blocked-writes', description: [...new Set(blocked)].join('\n') });
  },
});
export { expect };
