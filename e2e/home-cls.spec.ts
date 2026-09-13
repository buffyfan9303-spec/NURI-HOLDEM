// 홈 — 데이터가 도착할 때 화면이 밀리지 않는가.
//
// 오너 상시 지시: "멈췄다가 주르륵 콘텐츠가 아래로 나오는 건 절대 안 됨."
//
// ⚠ 이 스펙은 응답을 **목킹**한다. 운영에 오늘·내일 대회가 없는 날이 있어서, 실데이터에만
//   의존하면 정작 재야 할 '데이터가 있는 홈'을 못 만든다(2026-09-08 실제로 그랬다).
//   목킹은 마크업을 흉내 내는 게 아니라 **앱 자신을 렌더**시키는 것이라, 여기서 잰 높이는 진짜 기하다.
//
// 잠그는 것: 히어로가 라이브 유무로 136 ↔ 98px 을 오가며 그 아래 전체를 38px 위로 당기던 것.
//
// ⚠ 같은 하네스로 스켈레톤 행 높이·--card-h-list·카드 메타 잘림도 잠그려 했는데 **뺐다** —
//   e2e 컨텍스트에서는 목킹한 일정 행이 렌더되지 않아(스켈레톤만 뜬다) 스켈레톤끼리 비교하며
//   조용히 통과했다. 거짓으로 통과하는 게이트는 없느니만 못하다.
//   그 셋은 로컬 실측(응답 목킹 + 프로덕션 빌드)으로 검증했고 수치는 커밋 메시지에 남겼다:
//     스켈레톤 98 → 116(실제와 일치) · --card-h-list 95 → 116 · 카드 3행 메타 59 → 69px(전폭)
//   목킹 행이 e2e 에서 렌더되지 않는 원인을 찾으면 그때 다시 붙인다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
// KST 날짜 헬퍼 — 같은 로직을 스펙 안에 새로 만들지 않는다(두 벌이 되는 순간 그게 버그다).
import { kstToday } from '../src/lib/kst';

const VENUE_ID = '11111111-1111-4111-8111-111111111111';
// ⚠ 2026-09-13: 여기가 `d.toISOString().slice(0,10)`(UTC) 이었다. 아래 47~49행이 이 값을 **달력 날짜**로 쓴다.
//   ⚠⚠ **내가 처음 적은 근거는 틀렸다**(2차 독립 검증이 잡았다). "앱은 KST 로 배치한다" 고 썼는데,
//     오늘/내일 **버킷팅**을 하는 곳은 `HomeTab.tsx:186` 의 `toLocaleDateString('en-CA')` 로 **기기 로컬**이다.
//     KST 인 것은 `scheduleStatus.ts:24` 의 **시작 시각**뿐이다. 그래서 픽스처만 KST 로 바꾸면
//     KST 기기에서는 고쳐지고 **UTC CI(ubuntu-latest)에서는 같은 버그가 재발**한다 — 버그가 옮겨 갈 뿐이다.
//   → 진짜 수정은 `playwright.config.ts` 의 **`timezoneId: 'Asia/Seoul'` 고정**이다(거기 근거를 적었다).
//     시간대가 고정되면 버킷(기기 로컬)·시작 시각(KST)·픽스처(KST)가 **셋 다 같은 날짜**를 보고,
//     하루 중 어느 시각에 어느 러너에서 돌려도 결과가 같다. 이 파일의 `kstToday` 는 그 고정과 **짝**이다.
//   원래 증상: 한국 시간 00:00~09:00 에 '오늘' 행이 어제로 찍히고, 05:00 이후엔 `시작(19:00)+10h` 를 넘겨 `ended` 가 된다.
//   ⚠ 이 스펙은 그래도 **통과했다** — 단언이 라이브 유무 두 조건의 **대칭 비교**라 양쪽에서 똑같이 상쇄되기 때문이다.
//     실패가 아니라 거짓 통과였고, `theme-tokens-v7` 에서 고친 것과 같은 가족이다.
//   실측(2026-09-13 06:07 KST, 프로덕션 빌드 프로브): 현행 = 4행 중 **2장만 렌더** / 고친 뒤 = **4장 전부**.
//   ⚠ 아래 11~16행의 "목킹 행이 e2e 에서 렌더되지 않는다(스켈레톤만 뜬다)" 는 **이것과 별개다** —
//     내 프로브(나머지 REST 를 빈 배열로 막음)에서는 행이 정상 렌더됐다. 그 메모는 여전히 미해결이다.
//   `session_date`(36행)도 같은 함수를 쓰므로 `matchClockSchedule` 의 문자열 완전 일치는 그대로 유지된다.
const iso = (d: Date) => kstToday(d.getTime());

const scheduleRow = (i: number, date: string) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
  title: ['NURI 데일리 터보', '위클리 메인이벤트 GTD 1000만', '새틀라이트 진출권', '미드나잇 딥스택'][i % 4],
  venue_id: VENUE_ID, pub_name: '누리홀덤 강남점', region: '서울 강남',
  address: '서울 강남구 테헤란로 1', date, start_time: '19:00:00', duration: '4시간',
  format: 'NLH', guaranteed: true, prize_pool: 10_000_000, prize_percent: null,
  is_competition: true, grade: 'daily', blinds: null,
  buy_in: { amount: 1_000_000, rebuy: 1_000_000, addon: 500_000 },
  display_order: i, is_premium: false, owner_id: VENUE_ID, approved: true,
  unread_qna_count: 0, view_count: 12, premium_until: null, reg_close_time: '22:00:00',
});

const clockRow = () => ({
  venue_id: VENUE_ID, game_seq: 1, session_date: iso(new Date()),
  running: true, current_index: 12, remaining_ms: 540_000,
  ends_at: new Date(Date.now() + 540_000).toISOString(), updated_at: new Date().toISOString(),
  eliminations: 126, adj_entries: 0, adj_rebuys: 0,
  live_stats: { alive: 87, entries: 213, buyInAmount: 1_000_000 },
  config: { levels: [{ sb: 50_000, bb: 100_000, ante: 0, minutes: 20 }] },
  title: '위클리 메인이벤트',
});

/** 응답만 갈아끼운다 — 운영 DB 는 건드리지 않는다(_fixtures 의 쓰기 차단과 같은 정신). */
async function seed(page: Page, { live, slowSchedules = 0 }: { live: boolean; slowSchedules?: number }) {
  const today = iso(new Date());
  const tomorrow = iso(new Date(Date.now() + 86_400_000));
  const rows = [0, 1, 2, 3].map((i) => scheduleRow(i, i % 2 === 0 ? today : tomorrow));
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(/\/rest\/v1\/schedules\?/, async (r) => {
    if (slowSchedules) await new Promise((x) => setTimeout(x, slowSchedules));
    await r.fulfill(json(rows));
  });
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{
    id: VENUE_ID, name: '누리홀덤 강남점', region: '서울 강남', address: '서울 강남구 테헤란로 1',
    approved: true, status: 'active', is_paid_ad: false, display_order: 1, follower_count: 10, rating: 4.8,
  }])));
  await page.route(/\/rest\/v1\/clock_states\?/, (r) => r.fulfill(json(live ? [clockRow()] : [])));
}

// §6(2026-09-13) 재구성으로 **거대한 GTO 히어로(h2)가 사라졌다** — 그 자리를 '오늘 안내'가 대신한다.
// 앵커를 `main.tab-pane h2` 로 두면 요소를 못 찾아 null 이 되고, 이 게이트는 '히어로를 못 찾았다'로
// 터진다. 셀렉터를 **느슨하게 푸는 것이 아니라**(그건 게이트 무력화다) 같은 역할의 요소로 옮긴다:
// 지금 상단 칸의 높이를 정하는 것은 `home-today` 다. 여기도 클락 도착 전후로 문구가 한 조각
// 늘어나므로(`· 지금 등록 가능 N개`), 이 스펙이 원래 재려던 **바로 그 위험**이 그대로 남아 있다.
const heroH = (page: Page) => page.evaluate(() => {
  const hero = document.querySelector('main[data-tab="home"] [data-testid="home-today"]');
  return hero ? Math.round(hero.getBoundingClientRect().height) : null;
});
const schedSectionY = (page: Page) => page.evaluate(() => {
  const s = [...document.querySelectorAll('main.tab-pane section')]
    .find((x) => (x.querySelector('h3')?.textContent || '').includes('오늘·내일'));
  return s ? Math.round(s.getBoundingClientRect().y) : null;
});

test.describe('홈 — 데이터가 도착해도 아래가 밀리지 않는다', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 375, height: 812 }); });

  test('🔴 라이브 유무로 히어로 높이가 달라지지 않는다', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await seed(page, { live: false });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const noLive = { hero: await heroH(page), y: await schedSectionY(page) };

    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const p2 = await ctx.newPage();
    await seed(p2, { live: true });
    await p2.goto('/');
    await p2.waitForLoadState('networkidle');
    await p2.waitForTimeout(3000);
    const withLive = { hero: await heroH(p2), y: await schedSectionY(p2) };
    await ctx.close();

    console.log('[홈 CLS] 히어로', JSON.stringify({ noLive, withLive }));
    expect(noLive.hero, '히어로를 못 찾았다').toBeTruthy();
    // 콜드 진입은 clocksLoaded=false 라 '라이브 없음' 골격이 먼저 그려지고, 클락이 도착하며 분기가 바뀐다.
    // 두 분기 높이가 다르면 그 차이만큼 아래 전체가 튄다 — 실측 2026-09-08: 136 ↔ 98(38px).
    expect(Math.abs((withLive.hero ?? 0) - (noLive.hero ?? 0)),
      `히어로가 라이브 유무로 ${noLive.hero} ↔ ${withLive.hero} 로 달라진다`).toBeLessThanOrEqual(4);
    if (noLive.y != null && withLive.y != null) {
      expect(Math.abs(withLive.y - noLive.y),
        `일정 섹션 시작 y 가 ${noLive.y} ↔ ${withLive.y} 로 달라진다`).toBeLessThanOrEqual(4);
    }
  });

});
