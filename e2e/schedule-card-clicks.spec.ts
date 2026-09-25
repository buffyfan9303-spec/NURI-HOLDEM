// e2e/schedule-card-clicks.spec.ts — 일정 목록 줄의 **세 갈래 클릭**이 각각 맞는 곳으로 가는가.
//
// 🔴 왜 (2026-09-18 오너):
//   "이거 클릭하면 포스터가 나와야 하고, 실시간 게임인 경우 실시간 탭이 나와야 해.
//    위에 테스트 홀덤펍을 누를 경우 홀덤펍 매장 페이지로 이동해야 하고"
//   한 줄 안에 **목적지가 다른 클릭이 셋** 있다(카드 본문 / 매장명 / 즐겨찾기).
//   중첩 클릭은 조용히 깨지는 부류다 — `stopPropagation` 하나만 빠져도 매장을 누르면
//   포스터가 같이 열리거나, 포스터를 누르면 매장으로 새 버린다. 화면은 멀쩡해 보인다.
//
// ⚠ 이 스펙은 **운영 데이터를 안 쓴다.** 라이브 판정은 '지금 돌고 있는 클락'에 달려 있어
//   운영 데이터로는 재현 시점을 고를 수 없다(실제로 이 스펙을 쓰는 날 라이브 탭이 비어 있었다).
//   그래서 clock_states 까지 목킹해 **라이브 상태를 만들어** 검증한다.
// ⚠ 목킹은 핸들러 하나다(schedule-card-fit 과 같은 규칙) — 겹치면 route.continue 가 조용히 샌다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { kstToday } from '../src/lib/kst';

const VENUE_ID = '22222222-2222-4222-8222-222222222222';
const TODAY = kstToday(Date.now());
const LIVE_TITLE = '진행 중인 데일리 토너먼트';

const ROWS = [
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    title: LIVE_TITLE,
    venue_id: VENUE_ID, pub_name: '누리 테스트 홀덤펍', region: '서울',
    address: '서울 어딘가 1', date: TODAY, start_time: '18:00:00', duration: '4시간',
    format: 'NLH', guaranteed: true, prize_pool: 10_000_000, prize_percent: null,
    is_competition: true, grade: 'daily', blinds: null,
    buy_in: { amount: 100_000, gameType: '홀덤' },
    display_order: 0, is_premium: true, owner_id: VENUE_ID, approved: true,
    unread_qna_count: 0, view_count: 1, premium_until: null, reg_close_time: '12LV 00:30',
    structure: { lateRegLevels: 12, startingChips: 30_000 },
  },
];

/** 이 대회에 **매칭되는** 클락 한 대(같은 매장·같은 날짜·같은 제목 → quality 'title'). */
const CLOCK_ROW = {
  venue_id: VENUE_ID, game_seq: 1, session_date: TODAY, title: LIVE_TITLE, running: true,
  current_index: 3, ends_at: null, remaining_ms: 7 * 60 * 1000,
  adj_entries: 24, adj_rebuys: 5, adj_earlies: 2, adj_addons: 0, eliminations: 6,
  live_stats: null,
  config: {
    title: LIVE_TITLE, startStack: 30_000, rebuyStack: 30_000, addonStack: 30_000,
    isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0,
    regCloseLevel: 12, maxLevel: 20, earlyDoubleLevel: 2, earlySingleLevel: 4,
    earlyDoubleMin: 40, earlySingleMin: 80, mysteryBounty: 0, prizes: [],
    levels: Array.from({ length: 20 }, (_, i) => ({
      level: i + 1, sb: 100 * (i + 1), bb: 200 * (i + 1), ante: 200 * (i + 1), minutes: 20, isBreak: false,
    })),
  },
};

const VENUE_ROW = {
  id: VENUE_ID, name: '누리 테스트 홀덤펍', region: '서울', address: '서울 어딘가 1',
  approved: true, status: 'active', is_paid_ad: false, display_order: 1,
  follower_count: 3, rating: 4.5,
};

/** 단일 핸들러 — 외부로 나가는 모든 요청이 여기를 지난다(실네트워크 0). */
// 🔴 `entries` — '클락은 도는데 아직 아무도 안 들어온 게임' 을 만들 수 있게 열어 둔다(기본은 픽스처 값).
//   그 상태에서 카드가 `0 / 0` 을 그리면 '아무도 없다' 로 읽혀 틀린 정보가 된다 — 아래 계약이 그걸 잡는다.
async function mockAll(page: Page, live: boolean, entries?: number) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/rest\/v1\/schedules/.test(url)) return json(ROWS);
    if (/\/rest\/v1\/clock_states/.test(url)) {
      return json(live ? [entries === undefined ? CLOCK_ROW : { ...CLOCK_ROW, adj_entries: entries, eliminations: 0 }] : []);
    }
    if (/\/rest\/v1\/venues/.test(url)) return json([VENUE_ROW]);
    if (/\/rest\/v1\/rpc\//.test(url)) return json([]);
    if (/\/rest\/v1\//.test(url)) return json([]);
    if (/supabase\.co/.test(url)) return json({});
    return route.abort('blockedbyclient');
  });
}

async function openBrowse(page: Page, live: boolean, entries?: number) {
  await page.addInitScript(() => {
    try { localStorage.setItem('nuri-theme', 'dark'); } catch { /* 저장소 차단 환경 */ }
  });
  await mockAll(page, live, entries);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '전체 일정', exact: false }).first().click({ timeout: 15_000 });
  const card = page.locator('main[data-tab="browse"] article.cv-card-list').first();
  await card.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(900);
  return card;
}

test.describe('일정 줄의 세 갈래 클릭', () => {
  test('🔴 카드 본문을 누르면 **포스터 상세**가 열린다 (매장 페이지가 아니다)', async ({ page }) => {
    const card = await openBrowse(page, false);
    await card.getByRole('heading').click();
    const panel = page.locator('[data-sched-panel]');
    await expect(panel, '포스터 상세가 안 열렸다').toBeVisible({ timeout: 15_000 });
    // 새 버림 방지 — 매장 페이지가 같이 열리면 안 된다(반대 방향도 같은 이유로 기다렸다 센다)
    await page.waitForTimeout(1200);
    await expect(
      page.getByRole('dialog', { name: /매장 페이지/ }),
      '카드를 눌렀는데 매장 페이지까지 열렸다 — 클릭이 두 곳으로 샌다',
    ).toHaveCount(0);
    await expect(panel, '상세에 대회 제목이 없다').toContainText(LIVE_TITLE);
  });

  test('🔴 매장명을 누르면 **매장 페이지**로 간다 (포스터가 열리면 안 된다)', async ({ page }) => {
    const card = await openBrowse(page, false);
    // 매장 줄의 첫 버튼이 VenueLink 다(TOP 배지는 span, 즐겨찾기는 그 뒤).
    const venueBtn = card.locator('button').first();
    await expect(venueBtn, '매장 링크 버튼을 못 찾았다').toContainText('누리 테스트 홀덤펍');
    await venueBtn.click();
    await expect(
      page.getByRole('dialog', { name: /매장 페이지/ }),
      '매장명을 눌렀는데 매장 페이지가 안 열렸다',
    ).toBeVisible({ timeout: 15_000 });
    // ⚠ **기다렸다가 재야 한다.** 포스터는 첫 열림에 `startTransition` 으로 열려(App.tsx
    //   handleScheduleSelect — lazy 첫 렌더의 불투명 폴백을 피하려고) 클릭 직후 ~300ms 동안 DOM 에 없다.
    //   기다리지 않고 세면 '아직 안 열린 것'을 '안 열린 것'으로 착각한다.
    //
    // 🔴 음성 대조 기록(2026-09-18) — `VenueLink` 의 `stopPropagation` 을 **지워도 이 검사는 통과했다.**
    //   거짓 통과가 아니라, 같은 계약을 **두 겹**이 지키고 있어서다:
    //     ① VenueLink 의 `e.stopPropagation()`  ② App `handleVenueClick` 의 `setOpenSchedule(null)`(App.tsx:2487)
    //   한 겹을 지워도 다른 겹이 막는다. 그래서 이 검사는 '어느 한 구현'이 아니라 **유저가 보는 결과**를
    //   지킨다 — 두 겹이 **모두** 사라져야 빨개진다. 구현을 바꿀 때 둘 중 하나만 남겨도 계약은 산다.
    await page.waitForTimeout(1500);
    await expect(
      page.locator('[data-sched-panel]'),
      '매장명을 눌렀는데 포스터 상세까지 열렸다 — VenueLink 의 stopPropagation 이 빠졌다',
    ).toHaveCount(0);
  });

  test('🔴 실시간(클락이 도는) 대회면 상세가 **실시간 화면**으로 열린다', async ({ page }) => {
    const card = await openBrowse(page, true);
    await card.getByRole('heading').click();
    const panel = page.locator('[data-sched-panel]');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const text = (await panel.textContent()) ?? '';
    // 라이브 클락 패널이 뜨면 '지금 몇 레벨/남은 시간/엔트리' 가 보인다.
    // 정적 포스터 요약에는 없는 값들이라 이 셋으로 두 화면을 가른다.
    expect(
      /레벨/.test(text) && /엔트리|참가/.test(text),
      `실시간인데 상세가 정적 포스터 요약으로 열렸다. 본문:\n${text.replace(/\s+/g, ' ').slice(0, 300)}`,
    ).toBe(true);
  });

  test('실시간이 아니면 같은 상세가 **정적 요약**으로 열린다 — 위 검사가 늘 참이 아님을 증명한다', async ({ page }) => {
    // 🔴 대조군. 이게 없으면 위 검사는 '아무 때나 통과하는 검사' 일 수 있다.
    const card = await openBrowse(page, false);
    await card.getByRole('heading').click();
    const panel = page.locator('[data-sched-panel]');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel, '클락이 없는데 라이브 문구가 보인다').not.toContainText('남은 시간');
  });
});

// ── 일정 카드 우측 열의 `생존/엔트리` (2026-09-22 오너 2차) ────────────────────────
//
// 오너: "게임이 시작된 경우 19:00 아래에 라이브인 경우 19/21(21명 등록 19명 생존) 이런식으로".
// 이 스펙에 붙이는 이유: **라이브 클락 픽스처가 여기에만 있다.** `schedule-card-fit` 의 픽스처에는
//   클락이 없어 그 줄이 아예 안 그려진다 — 거기서 재면 '0건이라 통과' 하는 빈 검사가 된다.
// 값의 정본은 `fieldCounts()`(src/lib/clockLevel.ts) 하나다. 여기 픽스처는
//   `adj_entries: 24` · `eliminations: 6` · liveStats 없음 → 엔트리 24, 생존 18 이어야 한다.
test.describe('일정 카드 — 라이브 필드 현황', () => {
  test('🔴 클락이 도는 대회 카드의 시각 아래에 `생존/엔트리` 가 실측값으로 뜬다', async ({ page }) => {
    const card = await openBrowse(page, true);
    const field = card.getByTestId('schedule-field-count');
    await expect(field, '라이브인데 생존/엔트리 줄이 없다').toBeVisible({ timeout: 15_000 });
    // 🔴 **보이는 텍스트만** 잰다. `textContent` 에는 `sr-only` 안내말이 섞여 들어와
    //   ("생존 18/명, 엔트리 24명") 화면에 뭐가 보이는지를 말해 주지 못한다.
    //   보이는 것은 숫자와 슬래시뿐이어야 한다 — 픽스처의 24 엔트리 · 6 아웃 = 생존 18.
    const visible = await field.evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.sr-only').forEach((n) => n.remove());
      return (clone.textContent ?? '').replace(/\s+/g, '');
    });
    expect(visible, '화면에 보이는 생존/엔트리 값이 클락 실측과 다르다').toBe('18/24');
    // 보조기술은 숫자만으로 무슨 비율인지 알 수 없다 — 말로 읽어 주는지 따로 확인한다.
    //   ('/' 는 aria-hidden 이라 낭독에서 빠지고 "생존 18명, 엔트리 24명" 으로 읽힌다.)
    const full = (await field.textContent()) ?? '';
    expect(full, '접근성 안내말(생존/엔트리)이 없다').toMatch(/생존[\s\S]*18[\s\S]*엔트리[\s\S]*24/);
    // 🔴 2026-09-25 SCHEDULE-ROW-E — 시각은 가운데 셋째 줄(`18:00 시작 · 레지 … · 18/24`)로 갔다(오너 E안).
    //   종전 '오른쪽 모서리가 시각과 같다'(옛 우측 열) 대신 **시각과 같은 문단(③ 줄) 안에서 시각 뒤**에 오는지 본다.
    //   ⚠ '같은 시각적 줄' 은 요구하지 않는다 — 레지마감 저장값(예: '12LV 00:30')이 길면 문단이 어절에서 접히는 것이 설계다(잘림 0).
    const pos = await card.evaluate((c) => {
      const grp = c.querySelector<HTMLElement>('[data-testid="schedule-start-group"]');
      const t = c.querySelector<HTMLElement>('[data-testid="schedule-start-time"]');
      const f = c.querySelector<HTMLElement>('[data-testid="schedule-field-count"]');
      if (!grp || !t || !f) return null;
      const tr = t.getBoundingClientRect(), fr = f.getBoundingClientRect();
      return { inGroup: grp.contains(t) && grp.contains(f),
        after: !!(t.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) && fr.top >= tr.top - 0.5 };
    });
    expect(pos, '시각 또는 필드 현황을 못 찾았다').not.toBeNull();
    expect(pos!.inGroup, '필드 현황이 시작 시각과 같은 ③ 줄(schedule-start-group)에 있지 않다').toBe(true);
    expect(pos!.after, '필드 현황이 시작 시각 뒤에 오지 않는다').toBe(true);


  });

  test('🔴 대조 — 클락이 없으면 그 줄이 아예 없다(시작 전 `0 / 0` 금지)', async ({ page }) => {
    const card = await openBrowse(page, false);
    await expect(card.getByTestId('schedule-start-time'), '시각이 없다 — 대조가 대상에 도달 못 했다').toBeVisible();
    await expect(card.getByTestId('schedule-field-count'),
      '클락이 없는데 필드 현황이 떴다 — 시작 전 0/0 은 "아무도 없다" 로 읽힌다').toHaveCount(0);
  });
});

// 🔴 `hasField` 가 실제로 무언가를 막는지 — **클락은 도는데 엔트리 0** 인 상태.
//   이 대조가 없으면 위 '클락 없음' 검사만으로는 가드가 있는지 없는지 구분할 수 없다
//   (클락이 아예 없으면 `regInfo` 자체가 undefined 라 어떤 가드든 통과한다).
test('🔴 클락은 도는데 엔트리가 0이면 그 줄을 그리지 않는다 (0/0 금지)', async ({ page }) => {
  const card = await openBrowse(page, true, 0);
  // 대조가 대상에 도달했는지 — 클락이 실제로 매칭됐다는 증거를 먼저 잡는다.
  await expect(card.getByTestId('schedule-start-time'), '시각이 없다 — 대조가 대상에 도달 못 했다').toBeVisible();
  await expect(card.getByTestId('schedule-field-count'),
    '엔트리 0 인데 필드 현황을 그렸다 — `0 / 0` 은 "아무도 없다" 로 읽힌다').toHaveCount(0);
});
