// 일정(schedules) 목킹 — 게이트가 **라이브 데이터로 조용히 꺼지는 것**을 막는다.
//
// 2026-09-21 배경: 오너 결정 8-ⓓ 로 더미 일정 6건을 손님 화면에서 내리자 라이브 `schedules` 의
// 표시 대상이 0건이 됐다. 그 결과 `test.skip(...)` 조건부 게이트 4~5개가 한꺼번에 '통과 → 건너뜀'
// 으로 바뀌었다(658 passed/16 skipped → 655/20). **빨개지지 않고 줄어드는** 실패 부류라 제일 위험하다.
// → 일정에 의존하는 스펙은 라이브를 읽지 말고 여기서 만든 고정 픽스처를 읽는다.
//
// 🔴 절대 날짜를 박지 마라. 오늘 `voucher-sheet-open.spec.ts` 가 하드코딩한 만료일(2026-09-20)이
//    지나면서 코드 변경 0 으로 CI 가 빨개졌다(HANDOFF §0-a19 '테스트 픽스처의 시한폭탄').
//    모든 날짜는 `Date.now()` 기준 상대값이다.
import type { Page } from '@playwright/test';

/** KST 기준 날짜(YYYY-MM-DD). Node 의 TZ 설정과 무관하게 UTC+9 로 직접 계산한다 —
 *  브라우저는 playwright.config 의 `timezoneId: 'Asia/Seoul'` 로 이미 KST 다. */
export const kstDay = (offset = 0) =>
  new Date(Date.now() + 9 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);

/** 픽스처가 덮는 날짜 — 끝난 대회 1건, 오늘 2건, 내일 1건, 모레·글피 각 1건.
 *  · 앞으로 열리는 것은 시작 19:00~23:30 이라 KST 어느 시각에도 `scheduleStatus` 가 'ended' 가 아니다
 *    (ended = 시작 + 10h).
 *  · 날짜가 여러 종류여야 first-screen 의 정렬 검사(서로 다른 날짜 2개 이상)가 성립한다.
 *
 *  🔴 **끝난 대회(d: -2)를 일부러 넣는다.** 이게 없으면 first-screen 의 두 검사
 *     (`끝난 대회가 첫 화면에 카드로 뜨지 않는다` · `끝난 대회에 '마감 임박'이 붙지 않는다`)는
 *     **잴 대상이 없어 항상 통과**한다 — `toEqual([])` 형태라 목록에 끝난 대회가 애초에 없으면 참이다.
 *     `src/App.tsx:2557` 의 `hideEnded = !q && searchState.dates.length === 0` 이 정상 동작하면
 *     이 행은 본문 목록에 **나타나지 않고** 하단 '지난 대회' 섹션에만 뜬다. 나타난다면 그게 잡아야 할 버그다.
 *     ⚠ '섞일까 봐 뺀다' 로 되돌리지 마라 — 그건 검사 대상을 데이터에서 없애 검사를 무력화하는 것이다. */
const ROWS = [
  { d: -2, t: '19:00', title: '목킹 끝난 대회' },
  { d: 0, t: '23:00', title: '목킹 데일리 A' },
  { d: 0, t: '23:30', title: '목킹 데일리 B' },
  { d: 1, t: '19:00', title: '목킹 내일 대회' },
  { d: 2, t: '19:30', title: '목킹 모레 대회' },
  { d: 3, t: '20:00', title: '목킹 글피 대회' },
];

/** 목킹이 만들어 내는 '오늘·내일' 카드 수 — 스펙이 이 값으로 단언한다(skip 대신 크게 실패). */
export const MOCK_TODAY_TOMORROW = ROWS.filter((r) => r.d >= 0 && r.d <= 1).length;
/** 목킹이 만들어 내는 서로 다른 날짜 수 */
/** 본문 목록에 **보여야 하는** 서로 다른 날짜 수 — 끝난 대회는 hideEnded 로 빠지므로 뺀다. */
export const MOCK_DISTINCT_DATES = new Set(ROWS.filter((r) => r.d >= 0).map((r) => r.d)).size;
/** 끝난 대회의 제목 — 본문 목록에 이게 보이면 hideEnded 가 깨진 것이다. */
export const MOCK_ENDED_TITLE = '목킹 끝난 대회';

function buildRows() {
  return ROWS.map((r, i) => ({
    id: `e2e-mock-schedule-${i + 1}`,
    title: r.title,
    venue_id: null,
    pub_name: '목킹 홀덤펍',
    region: '서울',
    address: '서울시 강남구',
    date: kstDay(r.d),
    start_time: `${r.t}:00`,
    duration: '6시간',
    format: 'MTT',
    guaranteed: true,
    prize_pool: 1_000_000,
    prize_percent: null,
    is_competition: false,
    grade: null,
    blinds: null,
    reg_close_time: null,
    buy_in: { amount: 30_000 + i * 10_000 },
    seats: null,
    structure: null,
    description: null,
    side_events: null,
    ranking_prizes: null,
    partners: null,
    promotions: null,
    payment_methods: null,
    rules: null,
    poster_url: null,
    poster_color: null,
    display_order: i + 1,
    is_premium: false,
    premium_until: null,
    owner_id: 'e2e-mock-owner',
    unread_qna_count: 0,
    approved: true,
    view_count: 0,
    rejected_at: null,
    reject_reason: null,
  }));
}

/**
 * `schedules` 읽기를 고정 픽스처로 대체한다. **goto 전에** 부른다.
 * `page.route` 는 `_fixtures.ts` 의 context route 를 이긴다(page > context).
 *
 * @param rows 목킹 값을 일부러 틀리게 만드는 음성 대조용 재정의(예: 1건만).
 */
export async function mockSchedules(page: Page, rows = buildRows()) {
  await page.route(/\/rest\/v1\/schedules\?/, (route) => {
    const url = route.request().url();
    const accept = route.request().headers()['accept'] ?? '';
    const single = /vnd\.pgrst\.object\+json/.test(accept);
    const idEq = /[?&]id=eq\.([^&]+)/.exec(url);
    const body = idEq ? rows.filter((r) => r.id === decodeURIComponent(idEq[1])) : rows;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: single ? JSON.stringify(body[0] ?? null) : JSON.stringify(body),
    });
  });
}
