// PIPE-F1/F2(audit-open-1009 · 오너 A-055 "이벤트·얼리·할인이 장부에 바로") — 전부 목킹, 운영 쓰기 0.
//   원천: Documents/누리홀덤_영상분석_0930/audit-open-1009/r1-result.json PIPE-F1(P2)·PIPE-F2(P3).
//   F1 포스터를 연결해 장부를 시작해도 할인 칸이 비어 '포스터 할인 가져오기'를 눌러야만 들어갔다 — 안 누르면 로티 깐부전
//      1LV 바인이 5만·0.5엔트리 대신 10만·1엔트리로 기록된다(손계산은 src/lib/posterDiscounts.test.ts).
//   F2 직전 게임 프리필이 포스터 연동 장부의 빈 할인 칸에 **다른 포스터의 레벨 할인**을 채웠고, 프리필이 포스터 목록보다 먼저 오면
//      오늘 포스터 자동 연동 자체를 건너뛰었다(도착 순서 의존).
// 음성 대조: 수정 전 빌드(origin/main bf86c7d8)에서 🔴 5건 + 새 동작 2건이 빨간불, '양성'(오늘 포스터 없음)만 초록 — 보고서 audit-open-1009/fix-pipe/report.md.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE, MOCK_UID, MOCK_VENUE_NAME } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

type R = Record<string, unknown>;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const RAIL = '[data-mystore-rail]';

const poster = (id: string, title: string, start: string, promotions: R[]): R => ({
  id, title, venue_id: MOCK_VENUE, pub_name: MOCK_VENUE_NAME, region: '서울', date: MOCK_DAY, start_time: `${start}:00`, approved: true,
  owner_id: MOCK_UID, buy_in: { amount: 100_000, startStack: 50_000, rebuyStack: 70_000 }, guaranteed: false, display_order: 1,
  promotions, side_events: [], ranking_prizes: [], reg_close_time: '16LV', structure: { levels: [] }, created_at: new Date().toISOString(),
});
// 운영 포스터 d4a68be7(로티 단독 깐부전 2026-10-09) promotions 그대로 — 할인액 있는 3개 + 안내 문구.
const KKANBU = poster('p-kkanbu', '로티 단독 깐부전', '17:00', [
  { badge: '5만', level: 1, title: '1LV 바인 5만 할인', detail: '전체이벤트 · 사전예약 · 0.5엔트리 적용', discountWon: 50_000, discountType: 'level' },
  { badge: '7만', level: 16, title: '첫 바인 3만 할인', detail: '첫바인은 무조건 7만으로 대동단결 · 0.7엔트리 적용', discountWon: 30_000, discountType: 'firstBuyin' },
  { badge: '팀', title: '팀 리바인 1회 5만', detail: '팀이벤트', discountWon: 50_000, discountType: 'rebuy' },
  { badge: '핀볼', title: '17LV 이전 핀볼', discountType: 'custom' },
  { badge: '얼리칩', title: '2LV 시작 전 참가 +10,000칩', discountType: 'advance' },
]);
const KKANBU_DISCOUNTS = [
  { label: '1레벨', amount: 50_000, level: 1 },
  { label: '첫 바인', amount: 30_000, level: 16, kind: 'firstBuyin' },
  { label: '팀 리바인 1회 5만', amount: 50_000, level: 0, kind: 'rebuy' },
];
// 할인액 없는 포스터(안내 문구뿐) — 연결되면 할인 칸은 빈 칸이 맞다.
const PLAIN = poster('p-plain', '베가 빅이벤트', '19:00', [{ badge: '얼리칩', title: '2LV 전 +10,000칩', discountType: 'advance' }]);
const BOOSTER = poster('p-booster', '로티 부스터데이', '13:00', [
  { badge: '5만', level: 1, title: '1LV 바인 5만 할인', discountWon: 50_000, discountType: 'level' },
  { badge: '3만', title: '첫 바인 3만 할인', discountWon: 30_000, discountType: 'firstBuyin' },
]);
// 어제 장부(다른 포스터) — getLastLedgerSettings 응답. '2레벨 3만'은 오늘 깐부전에 없는 레벨 자동 할인이다.
const YESTERDAY_SETTINGS = { buyin_amount: 80_000, card_amount: null, target_entries: 0, title: '어제 데일리', dealers: null, event_memo: null, discounts: [{ label: '2레벨', amount: 30_000, level: 2 }] };

interface Opts { posters: R[]; prefill?: R | null; prefillDelay?: number; schedDelayAtLedger?: number; lastRound?: R | null }

async function bootStart(page: Page, o: Opts) {
  const sessions: R[] = [];
  const st = { atLedger: false };
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/schedules\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        if (st.atLedger && o.schedDelayAtLedger) await sleep(o.schedDelayAtLedger);   // 장부 판의 포스터 목록만 늦게(홈은 그대로)
        return r.fulfill(json(single(r) ? (o.posters[0] ?? null) : o.posters)).catch(() => {});
      });
      // 상태 있는 ledger_sessions — 시작(upsert)한 행을 다음 조회가 돌려준다. 직전 설정(select=buyin_amount + lt.)은 o.prefill.
      await p.route(/\/rest\/v1\/ledger_sessions/, async (r) => {
        const req = r.request();
        if (req.method() === 'POST') {
          const body = req.postDataJSON() as R | R[];
          for (const row of Array.isArray(body) ? body : [body]) sessions.push(row);
          return r.fulfill(json([{ opened_at: new Date().toISOString() }], 201));
        }
        if (req.method() === 'GET') {
          const u = req.url();
          if (/select=buyin_amount/.test(u) && /session_date=lt\./.test(u)) {
            if (o.prefillDelay) await sleep(o.prefillDelay);
            return r.fulfill(json(o.prefill ?? null)).catch(() => {});
          }
          if (/session_date=lt\./.test(u) && /closed=eq\.true/.test(u)) return r.fulfill(json(single(r) ? (o.lastRound ?? null) : (o.lastRound ? [o.lastRound] : [])));   // 마지막 마감 회차('지난 게임 그대로 열기')
          if (/session_date=lt\./.test(u)) return r.fulfill(json(single(r) ? null : []));
          const date = new URL(u).searchParams.get('session_date');
          const rows = sessions.filter((s) => date === `eq.${String(s.session_date)}`);
          return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows));
        }
        return r.fulfill(json([]));
      });
      await p.route(/\/rest\/v1\/clock_states/, (r) => {
        const req = r.request();
        if (req.method() === 'GET') return r.fulfill(json(single(r) ? null : []));
        if (req.method() === 'POST') return r.fulfill(json([], 201));
        return r.fulfill(json([]));
      });
    },
  });
  await openMyStore(page);
  st.atLedger = true;
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.getByRole('button', { name: '장부 시작', exact: true }), '장부 시작 설정 폼(전제)').toBeVisible({ timeout: 20_000 });
  return { sessions };
}

const discLabels = (page: Page) => page.locator('[data-pane="ledger"] input[placeholder="예) 1레벨"]');
const autoLinkedNote = (page: Page) => page.getByText('오늘 포스터 자동 연동', { exact: false });
async function start(page: Page, probe: { sessions: R[] }) {
  await page.getByRole('button', { name: '장부 시작', exact: true }).click();
  await expect.poll(() => probe.sessions.length, { message: '장부 시작이 세션을 저장하지 않았다', timeout: 15_000 }).toBeGreaterThan(0);
  return probe.sessions[0];
}

test('🔴 F1 1440 — 오늘 포스터(깐부전) 자동 연동만으로 포스터 할인 3개가 장부에 들어간다(가져오기 안 누름)', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [KKANBU] });
  await expect(autoLinkedNote(page), '오늘 포스터 자동 연동(전제)').toBeVisible({ timeout: 15_000 });
  await expect.soft(discLabels(page), '연결했는데 할인 칸이 비어 있다').toHaveCount(3);
  await expect(page.getByRole('button', { name: /포스터 할인 다시 가져오기 \(3개\)/ }), "버튼은 '다시 가져오기'로 남는다").toBeVisible();
  const s = await start(page, probe);
  expect(s.schedule_id, '깐부전에 연결(전제)').toBe('p-kkanbu');
  expect(s.discounts, '세션 할인 = 포스터 할인(1LV 5만 · 첫 바인 3만 16LV · 팀 리바인 5만)').toEqual(KKANBU_DISCOUNTS);
});

test("F1 1440 — '다시 가져오기'를 눌러도 같은 할인이 두 번 들어가지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [KKANBU] });
  const again = page.getByRole('button', { name: /포스터 할인 다시 가져오기/ });
  await expect(again).toBeVisible({ timeout: 15_000 });
  await again.click();
  await expect(discLabels(page)).toHaveCount(3);
  expect((await start(page, probe)).discounts).toEqual(KKANBU_DISCOUNTS);
});

test('🔴 F2 1440 — 직전 게임 설정이 포스터 뒤에 와도 할인은 포스터 것(어제 2레벨 할인이 끼지 않는다)', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [KKANBU], prefill: YESTERDAY_SETTINGS, prefillDelay: 2_000 });
  await expect(autoLinkedNote(page), '오늘 포스터 자동 연동(전제)').toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('직전 게임 설정을 불러왔습니다'), '직전 설정이 도착했다(전제 — 안 오면 아무것도 안 잰다)').toBeVisible({ timeout: 15_000 });
  const s = await start(page, probe);
  expect(s.schedule_id).toBe('p-kkanbu');
  expect(s.discounts, '어제 다른 포스터의 레벨 할인이 오늘 장부에 들어갔다').toEqual(KKANBU_DISCOUNTS);
});

test('🔴 F2 1440 — 직전 게임 설정이 포스터 목록보다 먼저 와도 오늘 포스터로 자동 연동된다(도착 순서 무관)', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [KKANBU], prefill: YESTERDAY_SETTINGS, schedDelayAtLedger: 3_000 });
  await expect(page.getByText('직전 게임 설정을 불러왔습니다'), '직전 설정이 먼저 도착(전제)').toBeVisible({ timeout: 15_000 });
  await expect.soft(autoLinkedNote(page), '직전 설정이 먼저 왔다고 오늘 포스터 자동 연동을 건너뛰었다').toBeVisible({ timeout: 15_000 });
  await expect.soft(page.getByPlaceholder('예) 데일리 딥스택')).toHaveValue('로티 단독 깐부전');
  const s = await start(page, probe);
  expect.soft(s.schedule_id, '오늘 포스터에 연결되지 않았다').toBe('p-kkanbu');
  expect(s.discounts, '어제 할인으로 시작했다').toEqual(KKANBU_DISCOUNTS);
});

test('🔴 F2 1440 — 할인 없는 포스터에 연결되면 할인 칸은 빈 칸(직전 게임 할인을 채우지 않는다)', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [PLAIN], prefill: YESTERDAY_SETTINGS, prefillDelay: 2_000 });
  await expect(autoLinkedNote(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('직전 게임 설정을 불러왔습니다')).toBeVisible({ timeout: 15_000 });
  const s = await start(page, probe);
  expect(s.schedule_id).toBe('p-plain');
  expect(s.discounts, '포스터에 없는 어제 할인이 들어갔다').toEqual([]);
});

test('양성 1440 — 오늘 포스터가 없으면 직전 게임 할인을 그대로 채운다(기존 동작)', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [], prefill: YESTERDAY_SETTINGS, prefillDelay: 1_000 });
  await expect(page.getByText('직전 게임 설정을 불러왔습니다')).toBeVisible({ timeout: 15_000 });
  await expect(discLabels(page)).toHaveCount(1);
  const s = await start(page, probe);
  expect(s.schedule_id ?? null).toBeNull();
  expect(s.discounts).toEqual(YESTERDAY_SETTINGS.discounts);
});

test('🔴 F1 1440 — 부스터데이를 골랐다가 깐부전으로 바꾸면 할인도 깐부전 것으로 바뀐다(손대지 않은 자동 값)', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [BOOSTER, KKANBU] });
  await page.getByRole('button', { name: '13:00 · 로티 부스터데이', exact: true }).click({ timeout: 15_000 });
  await expect.soft(discLabels(page), '부스터데이 할인 2개(전제)').toHaveCount(2);
  await page.locator('select').filter({ has: page.locator('option', { hasText: '연결 안 함 / 직접 입력' }) }).first().selectOption('p-kkanbu');
  const s = await start(page, probe);
  expect(s.schedule_id).toBe('p-kkanbu');
  expect(s.discounts, '앞 포스터의 할인이 남았다').toEqual(KKANBU_DISCOUNTS);
});

// 자동 채움의 한계 — 수정 전 빌드는 부스터데이 할인 칸 자체가 안 생겨 전제에서 빨갛다(양성 대조가 아니라 새 동작의 경계).
test('F1 1440 — 업주가 고친 할인 칸은 포스터를 바꿔도 덮지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [BOOSTER, KKANBU] });
  await page.getByRole('button', { name: '13:00 · 로티 부스터데이', exact: true }).click({ timeout: 15_000 });
  await expect(discLabels(page)).toHaveCount(2);
  await discLabels(page).first().fill('내가 고친 할인');
  await page.locator('select').filter({ has: page.locator('option', { hasText: '연결 안 함 / 직접 입력' }) }).first().selectOption('p-kkanbu');
  const s = await start(page, probe);
  expect(s.schedule_id).toBe('p-kkanbu');
  expect((s.discounts as R[]).map((d) => d.label), '업주가 고친 칸을 포스터가 덮었다').toEqual(['내가 고친 할인', '첫 바인']);
});

// P2-1(review-260) — '지난 게임 그대로 열기'(업주의 명시 선택) 뒤에 포스터 목록이 늦게 오면, 자동 연동이 게임명·단가만 포스터 것으로 덮고
//   할인은 지난 게임 것(업주 수정으로 분류)으로 남아 섞인 채 저장됐다(로티 10만: 1~2LV 7만·0.7, 3~16LV 10만·1).
//   지난 게임명 == 직전 게임명이어야 재현된다(가드가 게임명으로만 '자동 값인가'를 봤다). 업주의 선택은 자동 연동이 덮지 않는다.
const LAST_ROUND = {
  venue_id: MOCK_VENUE, session_date: '2026-01-01', game_seq: 1, closed: true, title: '어제 데일리', buyin_amount: 80_000, card_amount: 0,
  target_entries: 0, game_type: 'entry', max_entries: 0, is_addon: false, addon_stack: 0, operators: [], event_memo: null, dealers: null,
  schedule_id: null, discounts: [{ label: '2레벨', amount: 30_000, level: 2 }], early_double_min: 0, early_single_min: 0, tournament_start: null,
};
test("🔴 P2-1 1440 — '지난 게임 그대로 열기' 뒤 늦게 온 포스터가 게임명·단가만 덮어 할인이 섞이지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, { posters: [KKANBU], prefill: YESTERDAY_SETTINGS, schedDelayAtLedger: 9_000, lastRound: LAST_ROUND });
  await expect(page.getByText('직전 게임 설정을 불러왔습니다'), '직전 설정이 먼저 도착(전제)').toBeVisible({ timeout: 15_000 });
  const last = page.getByRole('button', { name: /지난 게임 그대로 열기/ });
  await expect(last, "'지난 게임 그대로 열기'(전제)").toBeVisible({ timeout: 15_000 });
  await last.click();
  await expect(page.getByText(/설정을 그대로 불러왔어요/), '지난 게임 적용(전제)').toBeVisible({ timeout: 5_000 });
  // 포스터 목록(9초 지연)이 도착해 자동 연동 이펙트가 다시 돌 시간을 준다 — 도착 전에 재면 아무것도 안 잰다.
  await page.waitForResponse((r) => /\/rest\/v1\/schedules\?/.test(r.url()) && r.request().method() === 'GET', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  const s = await start(page, probe);
  const got = { title: s.title, schedule_id: s.schedule_id ?? null, buyin_amount: s.buyin_amount, discounts: s.discounts };
  expect(got, '게임명·단가는 포스터, 할인은 지난 게임 것이 섞여 저장됐다').toEqual({
    title: '어제 데일리', schedule_id: null, buyin_amount: 80_000, discounts: [{ label: '2레벨', amount: 30_000, level: 2 }],
  });
});
