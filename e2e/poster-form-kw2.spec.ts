// KW-2 포스터 폼 — W-02(수정 저장이 buy_in 을 통째로 덮어 rebuy·rebuyLimit 소실) · W-16(세부 규칙 칸) · W-18(첫 바인 프리셋).
//
// 🔴 W-02 재현(2026-09-29 목 업주 1440): 시드 포스터 '수정' → 아무것도 안 바꾸고 저장 →
//   PATCH buy_in = {amount,gameType,addonStack,addon,startStack,rebuyStack} — rebuy·rebuyLimit 가 사라졌고,
//   서버 트리거는 buy_in 전체를 비교하므로 승인된 포스터가 재심사로 내려갔다.
// 이 스펙은 **운영 DB 쓰기 0** — schedules GET/PATCH/POST 를 전부 여기서 받는다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_UID, MOCK_VENUE, MOCK_VENUE_NAME, MOCK_DAY } from './_mockOwner';

const DAY = new Date(Date.parse(`${MOCK_DAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const ID = 'aaaaaaaa-0000-4000-8000-00000000c0de';
const ROW = {
  id: ID, title: '로티 부스터데이', venue_id: MOCK_VENUE, pub_name: MOCK_VENUE_NAME, region: '경기북부',
  date: DAY, start_time: '17:00', duration: '25/15분', format: 'MTT', guaranteed: true, prize_pool: 10_000_000,
  prize_percent: null, reg_close_time: '16LV 00:12', is_competition: false, grade: null, blinds: null,
  buy_in: { amount: 100_000, rebuy: 100_000, rebuyLimit: 3, startStack: 50_000, rebuyStack: 50_000, addon: 50_000, addonStack: 50_000, gameType: '파이널롤백20', futureKey: 'keep' },
  structure: { startingChips: 50_000, blindLevelMinutes: 25, levels: [
    { sb: 100, bb: 200, ante: 200, minutes: 25 },
    { sb: 0, bb: 0, ante: 0, minutes: 8, isBreak: true, label: 'BREAK TIME 8MINS / 100칩 레이스' },
    { sb: 200, bb: 400, ante: 400, minutes: 25 },
  ] },
  description: '문의 010', rules: ['2블라인드 자리비울시 먹처리됩니다.'], side_events: [{ name: '핀볼', startBefore: '17LV 시작 전', note: '50GP' }],
  promotions: [{ discountType: 'level', badge: '5만', title: '1LV 바인 5만 할인', discountWon: 50_000, level: 1 }],
  payment_methods: ['현금'], partners: [], ranking_prizes: [{ rank: '1st', amount: 400, unit: 'T' }], seats: null,
  poster_url: null, poster_color: '#7C2D7E', display_order: 1, is_premium: false, owner_id: MOCK_UID, approved: true,
  rejected_at: null, reject_reason: null, unread_qna_count: 0, created_at: new Date().toISOString(),
};

type Body = Record<string, unknown>;
async function boot(page: Page, rows: unknown[], writes: { method: string; body: Body }[]) {
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/schedules(\?|$)/, (r: Route) => {
        const m = r.request().method();
        if (m === 'GET') {
          const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? rows[0] ?? null : rows) });
        }
        if (m === 'PATCH' || m === 'POST') {
          const body = JSON.parse(r.request().postData() ?? '{}') as Body;
          writes.push({ method: m, body });
          return r.fulfill({ status: m === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify([{ ...ROW, ...body, id: ID }]) });
        }
        return r.fallback();
      });
    },
  });
}

const dialog = (page: Page, name: string) => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name }) }).last();

async function openPosters(page: Page) {
  await openMyStore(page);
  await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: /포스터/ }).first().click();
}

async function openEdit(page: Page) {
  await openPosters(page);
  const row = page.locator('[data-tab="my-store"]').getByText('로티 부스터데이').filter({ visible: true }).first();
  await expect(row, '시드 포스터 행이 안 보인다').toBeVisible({ timeout: 20_000 });
  await page.locator('[data-tab="my-store"]').getByRole('button', { name: '수정', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: '포스터 수정' })).toBeVisible({ timeout: 20_000 });
}

test.describe('KW-2 포스터 폼', () => {
  test('🔴 W-02 아무것도 안 바꾼 수정 저장은 buy_in·structure·규정을 싣지 않는다', async ({ page }) => {
    test.setTimeout(120_000);
    const writes: { method: string; body: Body }[] = [];
    await boot(page, [ROW], writes);
    await openEdit(page);
    await dialog(page, '포스터 수정').getByRole('button', { name: '수정 완료' }).click();
    await expect.poll(() => writes.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const b = writes[0].body;
    expect(writes[0].method).toBe('PATCH');
    // buy_in 을 싣는다면 저장본과 **같아야** 한다(키 소실 = 손님에게 틀린 가격 + 재심사).
    if ('buy_in' in b) expect(b.buy_in).toEqual(ROW.buy_in);
    expect(b, 'buy_in 을 싣지 않아야 한다(바꾼 칸 없음)').not.toHaveProperty('buy_in');
    expect(b).not.toHaveProperty('structure');
    expect(b).not.toHaveProperty('rules');
    expect(b).not.toHaveProperty('side_events');
    expect(b).not.toHaveProperty('description');
  });

  test('🔴 W-02 리엔트리 스택만 바꾸면 rebuy·rebuyLimit·모르는 키는 그대로 남는다', async ({ page }) => {
    test.setTimeout(120_000);
    const writes: { method: string; body: Body }[] = [];
    await boot(page, [ROW], writes);
    await openEdit(page);
    const d = dialog(page, '포스터 수정');
    await d.getByLabel('리바인 스택', { exact: false }).first().fill('70000');
    await d.getByRole('button', { name: '수정 완료' }).click();
    await expect.poll(() => writes.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(writes[0].body.buy_in).toEqual({ ...ROW.buy_in, rebuyStack: 70_000 });
  });

  test('W-16 세부 규칙·브레이크 원문이 신규 등록 POST 에 실린다 · W-18 첫 바인 프리셋 = 3만 할인', async ({ page }) => {
    test.setTimeout(150_000);
    const writes: { method: string; body: Body }[] = [];
    await boot(page, [], writes);
    await openPosters(page);
    await page.getByRole('button', { name: /새 게임/ }).first().click();
    const d = dialog(page, '새 포스터 등록');
    await expect(d).toBeVisible({ timeout: 20_000 });
    const f = (name: string) => d.getByLabel(name, { exact: false }).first();
    await f('게임 이름').fill('키키 토너먼트');
    await f('날짜').fill(DAY);
    await f('지역').selectOption('경기북부');
    await f('참가비').fill('100000');
    await d.getByRole('radio', { name: /엔트리/ }).click();
    await f('레벨').fill('16');
    // 블라인드 표 — 레벨 1 + 브레이크(원문)
    await d.getByRole('button', { name: /블라인드 표 편집 열기/ }).click();
    await d.getByRole('button', { name: '+ 레벨 추가' }).click();
    await d.getByRole('button', { name: '+ 브레이크' }).click();
    await d.getByPlaceholder('SB', { exact: true }).first().fill('100');
    await d.getByPlaceholder('BB', { exact: true }).first().fill('200');
    await d.getByLabel('브레이크 2 이름').fill('DINNER BREAK 20MIN');
    // 순위별 상금이 있으면 비율 없이 엔트리 게임을 등록할 수 있다(키키)
    await d.getByRole('button', { name: /순위 추가/ }).click();
    await d.getByPlaceholder('값', { exact: true }).first().fill('140');
    await d.getByPlaceholder(/단위/).first().fill('대회초대권');
    // 세부 규칙
    await d.getByRole('button', { name: /리엔트리 가격·한도/ }).click();
    // KW-1b — N장 × 1만원 ≠ 참가비면 경고(저장은 막지 않음) · 100장 초과는 등록 전에 막는다(서버도 100 으로 자름).
    const warn = d.getByTestId('voucher-per-entry-warn');
    await f('참가 1회 = 이용권').fill('5');
    await expect(warn).toBeVisible();
    await f('참가 1회 = 이용권').fill('10');
    await expect(warn).toHaveCount(0);
    await f('회차별 리엔트리 스택').fill('80000, 80000, 90000');
    await f('얼리칩').selectOption('tiers');
    await d.getByLabel('얼리 1단 마지막 레벨').fill('1');
    await d.getByLabel('얼리 1단 추가 칩').fill('20000');
    await d.getByRole('button', { name: '+ 단계 추가' }).click();
    await d.getByLabel('얼리 2단 추가 칩').fill('15000');
    await f('운영 규정').fill('플로어 재량으로 변경 될 수 있습니다.\n매장이용권과 대회초대권 교차수령 가능');
    await f('상세 설명').fill('BUY IN 매장이용권 10장');
    await d.getByRole('button', { name: '+ 사이드 이벤트' }).click();
    await d.getByLabel('사이드 이벤트 1 이름').fill('핀볼');
    await d.getByLabel('사이드 이벤트 1 시작').fill('17LV 시작 전');
    // W-18
    await d.getByRole('button', { name: /첫 바인 3만 할인/ }).click();
    await f('참가 1회 = 이용권').fill('101');
    await d.getByRole('button', { name: '등록하기' }).click();
    // 입력칸 max=100 이라 브라우저 검증이 제출 자체를 막는다(폼 코드의 100장 가드는 그 뒤 두 번째 벽).
    expect(await f('참가 1회 = 이용권').evaluate((el) => (el as HTMLInputElement).validity.rangeOverflow)).toBe(true);
    await page.waitForTimeout(500);
    expect(writes.length, '100장 초과가 저장됐다').toBe(0);
    await f('참가 1회 = 이용권').fill('10');
    await d.getByRole('button', { name: '등록하기' }).click();
    await expect.poll(() => writes.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const b = writes[0].body;
    expect(b.buy_in).toEqual({
      amount: 100_000, voucherPerEntry: 10, rebuyStacks: [80_000, 80_000, 90_000],
      earlyTiers: [{ level: 1, chips: 20_000 }, { level: 2, chips: 15_000 }],
    });
    expect((b.structure as { levels: Body[] }).levels[1]).toMatchObject({ isBreak: true, label: 'DINNER BREAK 20MIN' });
    expect(b.rules).toEqual(['플로어 재량으로 변경 될 수 있습니다.', '매장이용권과 대회초대권 교차수령 가능']);
    expect(b.description).toBe('BUY IN 매장이용권 10장');
    expect(b.side_events).toEqual([{ name: '핀볼', startBefore: '17LV 시작 전' }]);
    expect(b.promotions).toEqual([expect.objectContaining({ discountType: 'firstBuyin', discountWon: 30_000 })]);
  });
});
