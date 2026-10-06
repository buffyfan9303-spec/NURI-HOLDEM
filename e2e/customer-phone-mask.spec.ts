// CUSTOMER-PHONE-MASK(오너 2026-09-25) → 20261006s3(오너 결정 2026-10-06)로 범위가 바뀌었다.
//   · 닉네임으로 찾은 행은 내 매장 손님이어도 서버가 phone_masked 를 null 로 준다(검색 RPC 4개).
//   · 가린 번호가 이용권 받는 사람 칸에 보이는 길은 이제 **번호 조회(find_user_by_phone)** 뿐이고, 가린 실명(name_masked)도 함께 온다.
//   · 받는 사람 칸의 번호 경로는 '010' 고정 + 뒤 8자리 — 8자리가 다 찼을 때만 **한 번** 부른다(9·10자리 자동완성 조회 없음).
//   · 하루 상한(PT429)이면 "오늘 조회 한도를 넘었습니다. 내일 다시 시도해 주세요".
// 화면 계약: 값이 있으면 이름 옆에 작게, null 이면 **요소 자체가 없다**(자리도 차지하지 않는다). 겹침·잘림 없음.
// ⚠ RPC 는 목킹이다 — 서버 범위 규칙(누가 null 인가·상한 셈)은 이 스펙이 재지 않는다(supabase/tests/20261006s3_rehearsal.sql 14건이 정본).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

const IDENTITY_ON = { identity_voucher_enabled: 'on' };
const RAIL = '[data-mystore-rail]';
const ROWS = [
  { id: '11111111-1111-4111-8111-111111111111', display: '길동이', verified: true, phone_masked: '010-****-5678', name_masked: '김*혜' },
  // 같은 번호의 다른 계정(서버 limit 5) — 실명 없음·번호 칸 비움 → 화면은 아무것도 그리지 않아야 한다.
  { id: '22222222-2222-4222-8222-222222222222', display: '길동이형아주긴닉네임열자넘김테스트', verified: true, phone_masked: null, name_masked: null },
];
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function openVoucherPane(page: Page) {
  await openMyStore(page);
  await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const visible = page.locator(`${RAIL} button`).filter({ hasText: '이용권' }).filter({ visible: true });
  expect(await visible.count(), '이용권 진입점이 정확히 하나여야 한다').toBe(1);
  await visible.first().click();
  await page.waitForTimeout(2000);
}

/** find_user_by_phone 목킹 — 부른 횟수와 보낸 p_phone 을 센다. */
async function bootWithPhone(page: Page, width: number, reply: (r: Route) => Promise<void>) {
  const calls: string[] = [];
  await bootOwner(page, {
    viewport: { width, height: 900 }, appSettings: IDENTITY_ON,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/find_user_by_phone/, (r) => {
        calls.push(String((r.request().postDataJSON() as { p_phone?: string } | null)?.p_phone));
        return reply(r);
      });
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => r.fulfill(json([])));
    },
  });
  await openVoucherPane(page);
  await expect(page.getByTestId('voucher-issue')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('voucher-recv-by-phone').click();
  await expect(page.getByTestId('recv-phone-prefix')).toHaveText('010 -');
  return { calls, input: page.getByRole('combobox', { name: '휴대전화번호 010 뒤 8자리' }) };
}

for (const width of [360, 390, 1280]) {
  test(`🔴 ${width}px — 번호는 8자리가 찼을 때만 1회 조회 · 후보 줄에 가린 실명·번호(1건), null 행은 요소가 없다, 겹침·잘림 없음`, async ({ page }) => {
    test.setTimeout(120_000);
    const { calls, input } = await bootWithPhone(page, width, (r) => r.fulfill(json(ROWS)));

    // 7자리까지는 부르지 않는다(옛 화면은 9·10자리에서도 불렀다)
    await input.pressSequentially('1234567', { delay: 30 });
    await page.waitForTimeout(800);
    expect(calls, '8자리 전에 번호 조회가 나갔다').toEqual([]);
    await expect(page.getByText('010 뒤 8자리를 모두 입력하면 찾습니다.')).toBeVisible();

    await input.pressSequentially('8', { delay: 30 });
    await expect.poll(() => calls.length, { timeout: 5_000 }).toBe(1);
    expect(calls[0], '서버에는 010 + 8자리 11자리 숫자만 간다').toBe('01012345678');

    // 9번째 숫자는 받지 않고, 더 부르지도 않는다
    await input.pressSequentially('9', { delay: 30 });
    await expect(input).toHaveValue('12345678');
    // 하이픈 붙은 전체 번호를 붙여 넣어도 뒤 8자리로 받는다(같은 번호라 재조회 없음)
    await input.fill('010-1234-5678');
    await expect(input).toHaveValue('12345678');
    await page.waitForTimeout(800);
    expect(calls.length, '같은 번호를 다시 불렀다').toBe(1);

    const options = page.getByRole('option');
    await expect(options).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByTestId('cand-phone')).toHaveCount(1);
    await expect(page.getByTestId('cand-name')).toHaveCount(1);
    await expect(options.first().getByTestId('cand-phone')).toHaveText('010-****-5678');
    await expect(options.first().getByTestId('cand-name')).toHaveText('김*혜');
    // null 행: 요소 0 — 빈 span 이 자리를 차지하지 않는다
    expect(await options.nth(1).getByTestId('cand-phone').count()).toBe(0);
    expect(await options.nth(1).getByTestId('cand-name').count()).toBe(0);
    // 겹침·잘림: 닉네임 → 가린 실명 → 가린 번호 순서로 서로 겹치지 않고, 번호는 행 안에 잘리지 않고 들어간다
    const m = await options.first().evaluate((li) => {
      const name = li.querySelector('span.truncate') as HTMLElement;
      const nm = li.querySelector('[data-testid="cand-name"]') as HTMLElement;
      const ph = li.querySelector('[data-testid="cand-phone"]') as HTMLElement;
      const a = name.getBoundingClientRect(), n = nm.getBoundingClientRect(), b = ph.getBoundingClientRect();
      const liR = li.getBoundingClientRect();
      return { nameRight: a.right, nmLeft: n.left, nmRight: n.right, phoneLeft: b.left, phoneRight: b.right, liRight: liR.right,
        clipped: ph.scrollWidth > ph.clientWidth + 1 || nm.scrollWidth > nm.clientWidth + 1, phW: b.width, nmW: n.width };
    });
    expect(m.phW, '번호 span 폭 0 — 그려지지 않았다').toBeGreaterThan(40);
    expect(m.nmW, '실명 span 폭 0 — 그려지지 않았다').toBeGreaterThan(10);
    expect(m.nameRight, `닉네임이 실명 위로 겹친다: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.nmLeft + 0.5);
    expect(m.nmRight, `실명이 번호 위로 겹친다: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.phoneLeft + 0.5);
    expect(m.phoneRight, `번호가 행 밖으로 나간다: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.liRight + 0.5);
    expect(m.clipped, '실명·번호 글자가 잘렸다').toBe(false);
    await page.screenshot({ path: `${process.env.PM2_SHOT_DIR ?? 'test-results'}/phone-mask-${width}.png` });
  });
}

test('🔴 390px — 하루 조회 상한(PT429)이면 정해진 문구를 보인다', async ({ page }) => {
  test.setTimeout(120_000);
  const { calls, input } = await bootWithPhone(page, 390, (r) => r.fulfill(json(
    // 서버 원문과 달라도 화면은 코드(PT429)로 정해진 문구를 낸다 — 클라 매핑을 본다
    { code: 'PT429', message: 'rate limit exceeded', details: null, hint: null }, 429)));
  await input.pressSequentially('87654321', { delay: 30 });
  await expect.poll(() => calls.length, { timeout: 5_000 }).toBe(1);
  await expect(page.getByTestId('recv-cand-err')).toHaveText('오늘 조회 한도를 넘었습니다. 내일 다시 시도해 주세요');
  await expect(page.getByRole('option')).toHaveCount(0);
});
