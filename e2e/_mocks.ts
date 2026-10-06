// 운영 데이터에 기대던 스펙을 독립시키는 공용 목 — 오픈 초기화(2026-10-08)로 게시글·그룹·이벤트가 비어도 같은 판정이 서도록.
//
// 원칙(이 파일을 쓰는 스펙이 지킬 것)
//   · 목은 'page.route' 라 _fixtures 의 쓰기 차단·E2E_PROD_EMPTY(_prodEmpty.ts)보다 먼저 이긴다 — 운영이 차 있어도 비어 있어도 같다.
//   · 목을 깔면 **건너뛰기(skip) 대신 단언**으로 바꾼다. 데이터가 없어서 조용히 넘어가던 자리를 이제 반드시 재야 한다.
//   · 모양은 실제 서버 응답을 베낀다(PostgREST: 단건 요청은 Accept 에 pgrst.object — 객체, 아니면 배열).
import type { Page, Route } from '@playwright/test';

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json' as const, body: JSON.stringify(body) });

/** 게시글 한 줄 — 칸 전부 채운 실제 모양(board-oneline longFeed 에서 옮겼다). */
export function postRow(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `fab-${i}`, user_id: `u-fab-${i}`, user_name: `작성자${i}`, user_role: 'user', user_color: '#888', user_avatar: null,
    content: `본문 ${i}`, created_at: new Date(Date.UTC(2026, 8, 30, 12) - i * 3600_000).toISOString(),
    like_count: 0, comment_count: 0, view_count: 0, category: 'free', title: `목록 길이용 글 ${i}`, images: [],
    badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
    ...over,
  };
}

/** 게시판 목록을 count 건으로 고정한다(GET 만 — 쓰기는 _fixtures 가 막는다). 운영 글이 0건이어도 같은 목록이 선다. */
export const mockPosts = (page: Page, count = 24, over?: (i: number) => Record<string, unknown>) =>
  page.route(/\/rest\/v1\/community_posts\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const rows = Array.from({ length: count }, (_, i) => postRow(i, over?.(i)));
    // 검색(`title.ilike.%키워드%`)은 서버가 거른다 — 목도 같은 결과를 내야 '검색 결과 없음' 판정이 선다.
    const kw = /title\.ilike\.%?([^,)%]*)/.exec(decodeURIComponent(r.request().url()))?.[1];
    const hit = kw ? rows.filter((p) => [p.title, p.content, p.user_name].some((v) => String(v).toLowerCase().includes(kw.toLowerCase()))) : rows;
    return r.fulfill(json(hit));
  });

/** 그룹 한 곳 — `?v=<MOCK_GROUP_ID>` 로 그룹 페이지가 열린다(운영에 그룹이 0개여도). */
export const MOCK_GROUP_ID = '00000000-0000-4000-8000-0000000000a1';
export const MOCK_GROUP_NAME = 'E2E 목 그룹';
export const mockGroupRow = {
  id: MOCK_GROUP_ID, name: MOCK_GROUP_NAME, kind: 'club', owner_id: '00000000-0000-4000-8000-0000000000b1',
  approved: true, join_approval: false, status: 'active', region: '서울', description: `${MOCK_GROUP_NAME} 소개`, images: [],
  follower_count: 0, is_paid_ad: false, display_order: 0, verification_status: 'unverified', contact_phone: null, kakao_url: null,
  created_at: '2026-10-01T00:00:00Z',
};
/** 그룹 한 곳을 두 길로 내준다 — ① 부팅 목록 조회(venues?select=*… — `?v=` 딥링크는 이 목록에서 대상을 찾는다) ② id 지정 조회.
 *  목록 응답은 이 그룹 한 곳뿐이다(운영 매장 목록은 이 테스트가 보려는 것이 아니다). */
export const mockGroup = (page: Page) =>
  page.route(/\/rest\/v1\/venues\?/, (r: Route) => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fallback();
    const byId = req.url().includes('id=eq.');
    if (byId && !req.url().includes(`id=eq.${MOCK_GROUP_ID}`)) return r.fallback();
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill(json(single ? mockGroupRow : [mockGroupRow]));
  });

/** 진행 중인 이벤트 하나 + 남은 카드 — 홈의 이벤트 배너(home-event-banner)와 이벤트 판이 선다. */
export const MOCK_EVENT_SLUG = 'card-open-2026-09';
/** opened = 앞에서부터 열린 카드 수. 기본 0 — 안 열린 카드(.foil)만 세는 스펙(스켈레톤 칸 수 = 본문 칸 수)이 칸 수를 그대로 쓸 수 있게. */
export const mockEventBoard = (cards = 12, opened = 0) => ({
  slug: MOCK_EVENT_SLUG, title: '오픈 기념 이벤트', subtitle: null, status: 'live',
  venueId: '00000000-0000-0000-0000-000000000000', startsAt: null, endsAt: null, voucherTitle: '매장이용권',
  cards: Array.from({ length: cards }, (_, i) => (i < opened
    ? { idx: i + 1, opened: true, tier: 1, count: 1, by: '누군가' }
    : { idx: i + 1, opened: false, tier: null, count: null, by: null })),
  myTickets: 0, remainByTier: { 1: 0, none: cards - opened }, totalByTier: { 1: opened, none: cards - opened }, voucherByTier: { 1: 1 },
});
export const mockEventCampaigns = () => [
  { slug: MOCK_EVENT_SLUG, title: '오픈 기념 이벤트', subtitle: null, status: 'live', hidden_at: null, starts_at: null, ends_at: null },
];
/** 한 응답(JSON) — 같은 모양을 context 수준 스위치(_fixtures E2E_EVENT_LIVE)와 page 수준 목이 함께 쓴다. */
export const eventLiveResponse = (url: string) => (/\/rest\/v1\/event_campaigns\?/.test(url) ? mockEventCampaigns()
  : /\/rest\/v1\/rpc\/event_board/.test(url) ? mockEventBoard() : null);
export const mockEvent = async (page: Page, cards = 12, opened = 0) => {
  await page.route(/\/rest\/v1\/event_campaigns\?/, (r) => r.fulfill(json(mockEventCampaigns())));
  await page.route(/\/rest\/v1\/rpc\/event_board/, (r) => r.fulfill(json(mockEventBoard(cards, opened))));
};

/** 승인된 대회 한 건 — `?s=<MOCK_SCHEDULE_ID>` 딥링크로 일정 상세가 열린다(운영에 일정이 없어도). schedules 읽기 전부를 이 한 건으로 답한다. */
export const MOCK_SCHEDULE_ID = '44444444-4444-4444-8444-444444444444';
const kstDay = (d: number) => new Date(Date.now() + 9 * 3_600_000 + d * 86_400_000).toISOString().slice(0, 10);
export const mockScheduleRow = () => ({
  id: MOCK_SCHEDULE_ID, title: 'E2E 목 대회', venue_id: '33333333-3333-4333-8333-333333333333', pub_name: 'E2E 목 홀덤펍', region: '서울',
  address: '서울 강남구 1', date: kstDay(3), start_time: '19:00:00', duration: '5시간', format: 'MTT', guaranteed: true, prize_pool: 1_000_000,
  buy_in: { amount: 60_000 }, approved: true, display_order: 1, is_premium: false, premium_until: null,
  owner_id: '00000000-0000-4000-8000-0000000000ee', unread_qna_count: 0, view_count: 0, is_competition: false, grade: null,
});
export const mockSchedule = (page: Page) =>
  page.route(/\/rest\/v1\/schedules\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill(json(single ? mockScheduleRow() : [mockScheduleRow()]));
  });

/** 유료 광고(AD 배지) 매장 한 곳 — 커뮤니티 '홀덤펍' 목록이 이 한 곳으로 선다(운영에 유료 노출 매장이 없어도). id 지정 조회는 건드리지 않는다. */
export const mockPaidVenue = (page: Page) =>
  page.route(/\/rest\/v1\/venues\?/, (r: Route) => {
    const req = r.request();
    if (req.method() !== 'GET' || req.url().includes('id=eq.')) return r.fallback();
    return r.fulfill(json([{ ...mockGroupRow, id: '00000000-0000-4000-8000-0000000000c1', name: 'E2E 목 광고 매장', kind: 'venue', is_paid_ad: true, premium_until: null }]));
  });
