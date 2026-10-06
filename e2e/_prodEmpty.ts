// 오픈 초기화(open-reset-1008) 이후의 운영 DB 를 **흉내 내는 스위치** — `E2E_PROD_EMPTY=1`.
//
// 왜: 2026-10-08 오픈 초기화가 운영의 게시글·댓글·외치기·그룹·광고·6개 매장·활동 기록을 지운다(남는 것: 로티아레나 1곳·포스터 4·
//   이벤트 캠페인/카드). E2E 는 운영 읽기를 목킹 없이 쓰는 스펙이 많아, 초기화 뒤에 빨개질 스펙이 있다. 그 스펙을 **초기화 전에**
//   찾아 독립시키려면 '초기화 뒤의 운영' 을 지금 재현할 수 있어야 한다 — 이 스위치가 그것이다.
//   (운영 DB 에는 아무것도 쓰지 않는다 — 응답만 바꾼다. 쓰기는 _fixtures 가 그대로 막는다.)
//
// 어떻게: _fixtures.ts 의 SUPABASE_API 컨텍스트 핸들러가 읽기 요청마다 prodEmpty() 를 먼저 부른다.
//   · 비운 표(EMPTY_TABLES)의 GET/HEAD → 빈 배열(단건 요청은 PGRST116 406). 실서버와 같은 응답 형태.
//   · venues → 로티아레나 한 곳만 남긴다. schedules → 매장 소속 행은 로티아레나만(매장 없는 일정은 초기화 대상이 아니다).
//   · 목록을 돌려주는 읽기 RPC(순위·광고·그룹 일정) → 실제 응답이 배열이면 [] 로(스칼라·객체 RPC 는 건드리지 않는다).
//   · 스펙이 page.route 로 덮는 응답은 그대로 이긴다(page route > context route) — 목킹 스펙은 이 스위치와 무관하게 같다.
// 비운 표 목록의 출처: Documents\누리홀덤_영상분석_0930\open-reset-1008\00_backup.sql 의 scope(지울 표) 분류.
import type { Route } from '@playwright/test';

export const PROD_EMPTY = process.env.E2E_PROD_EMPTY === '1';

/** 로티아레나(slug roti) — 초기화 뒤에 남는 유일한 매장 */
export const ROTI_VENUE_ID = 'f35b42d1-2d54-4905-95c1-1fda24e0f178';

const EMPTY_TABLES = new Set([
  // 장부·클락·이용권
  'clock_states', 'voucher_transfers', 'store_vouchers', 'ledger_buyin_requests', 'ledger_buyins', 'ledger_players', 'ledger_sessions',
  'ledger_buyin_audit', 'voucher_events',
  // 출석·고객
  'event_tickets', 'checkin_requests', 'checkins', 'customer_aliases', 'customer_profiles',
  // 순위
  'venue_score_entries', 'ranking_point_awards', 'venue_rankings', 'venue_season_results', 'hall_of_fame',
  // 직원
  'staff_schedule', 'dealer_shifts',
  // 매장 활동
  'phone_lookup_audit', 'waitlist', 'voucher_credit_requests', 'venue_reviews', 'venue_messages', 'venue_follows', 'venue_announcements',
  'venue_event_requests', 'venue_match_responses', 'venue_match_posts', 'league_entries',
  // SPOT
  'spot_ai_reviews', 'spot_reviews',
  // 게시글 부속
  'post_poll_votes', 'post_poll_options', 'post_polls', 'post_spots', 'post_hands', 'post_cheers', 'post_likes', 'post_reactions', 'post_views',
  'point_purchases',
  // 커뮤니티
  'comments', 'community_posts', 'community_shouts', 'live_wall', 'user_messages', 'user_blocks', 'reports',
  // 그룹
  'group_bans', 'group_messages', 'group_posts', 'group_members',
  // 장터
  'listing_message_reads', 'listing_messages', 'listing_likes', 'listing_views', 'marketplace_listings',
  // 딜러·업주 커뮤니티
  'dealer_applications', 'dealer_posts', 'owner_posts',
  // 유저 활동
  'nickname_history', 'point_grants', 'activity_log', 'ai_usage', 'bankroll_entries', 'cosmetic_unlocks', 'mark_rentals', 'mark_unlocks',
  'mission_claims', 'rank_verifications', 'referral_ticket_grants', 'referrals', 'support_inquiries', 'location_access_log', 'client_errors',
  // 일정 활동·알림
  'schedule_views', 'schedule_likes', 'schedule_reservations', 'notifications',
]);

/** 목록(배열)을 돌려주는 읽기 RPC — 초기화 뒤에는 빈 목록이다. 응답이 배열이 아니면(스칼라·객체) 손대지 않는다. */
const EMPTY_ARRAY_RPCS = new Set([
  'venue_hall_of_fame', 'venue_rankings_public', 'get_activity_leaderboard', 'ranking_top_venues', 'venues_season_leaders',
  'get_domestic_rankings', 'community_ads_public', 'get_group_schedules', 'current_season_standings', 'season_results',
]);

const URL_RE = /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/([^/?]+)(?:\/([^?]+))?/;
const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

/** 읽기 요청 하나를 초기화 뒤 모양으로 바꿔 응답했으면 true. false 면 호출부가 평소대로 통과시킨다. */
export async function prodEmpty(route: Route): Promise<boolean> {
  try {
    return await prodEmptyInner(route);
  } catch {
    // 테스트가 먼저 끝나면 진행 중이던 route.fetch() 응답이 폐기돼 res.json()/fulfill 이 던진다
    //   ("Fetch response has been disposed") — 그 요청은 아무도 기다리지 않으니 조용히 넘긴다. 아직 살아 있으면 평소대로 통과시킨다.
    await route.continue().catch(() => { /* 이미 처리됐거나 테스트 종료 */ });
    return true;
  }
}

async function prodEmptyInner(route: Route): Promise<boolean> {
  const req = route.request();
  const m = URL_RE.exec(req.url());
  if (!m) return false;
  const [, first, second] = m;
  const wantsObject = (req.headers()['accept'] ?? '').includes('pgrst.object');
  const isHead = req.method().toUpperCase() === 'HEAD';

  if (first === 'rpc') {
    if (!second || !EMPTY_ARRAY_RPCS.has(second.split('/')[0])) return false;
    const res = await route.fetch();
    let body: unknown;
    try { body = await res.json(); } catch { return route.fulfill({ response: res }).then(() => true); }
    if (!Array.isArray(body)) return route.fulfill({ response: res }).then(() => true);
    await json(route, res.status(), []);
    return true;
  }

  if (EMPTY_TABLES.has(first)) {
    if (wantsObject) await json(route, 406, { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null });
    else if (isHead) await route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, body: '' });
    else await json(route, 200, [], { 'content-range': '*/0' });
    return true;
  }

  if (first === 'venues' || first === 'schedules') {
    const res = await route.fetch();
    if (isHead || !res.ok()) { await route.fulfill({ response: res }); return true; }
    let body: unknown;
    try { body = await res.json(); } catch { await route.fulfill({ response: res }); return true; }
    const keep = (r: Record<string, unknown>) => (first === 'venues'
      ? !('id' in r) || r.id === ROTI_VENUE_ID   // id 를 select 하지 않은 질의는 가를 수 없어 그대로 둔다
      : r.venue_id == null || r.venue_id === ROTI_VENUE_ID);
    if (Array.isArray(body)) {
      const rows = (body as Record<string, unknown>[]).filter(keep);
      await json(route, res.status(), rows, { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' });
    } else if (body && typeof body === 'object' && !keep(body as Record<string, unknown>)) {
      await json(route, 406, { code: 'PGRST116', message: 'The result contains 0 rows', details: null, hint: null });
    } else {
      await route.fulfill({ response: res });
    }
    return true;
  }
  return false;
}
