// NICKNAME-RULES(오너 2026-09-24) — "누리홀덤에서 쓰는 이름은 닉네임·실명 두 개뿐. 닉네임은 중복 불가,
//   30일에 한 번 변경 + 하단 공지. 이용권 받는 사람은 닉네임·실명 둘 다 검색, 실명은 '실명 → 닉네임' 후보."
//
// 화면 계약만 본다(서버 판정은 supabase/migrations/20260924k_nickname_rules.sql 리허설 몫).
//   · 설정: 닉네임 한 칸(profiles.nickname) + 실명 줄(읽기 전용). 옛 '받는 아이디' 칸은 없다.
//   · 30일: nickname_changed_at 기준. 안이면 입력칸 비활성 + "… · 다음 변경 가능: M월 D일"(KST). 첫 변경은 열림.
//     키가 없는 옛 서버 응답이면 name_changed_at 으로 판정(배포 순서가 어긋나도 거짓 안내가 없다).
//   · 서버 거절 문장(30일·사칭어)은 번역 없이 그대로 보인다.
//   · 이용권 받는 사람: search_voucher_recipients 로 찾고 후보 줄은 '실명 → 닉네임', 저장·표시는 닉네임만.
// 세션은 위조(stubLogin·bootOwner)하고 조회만 갈아 끼운다. 운영 DB 에 쓰지 않는다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const DAY = 86_400_000;
/** 화면과 같은 규칙(KST)으로 'M월 D일' — 단언이 로컬 시간대에 흔들리지 않게 */
const kstMD = (ms: number) => { const d = new Date(ms + 9 * 3600_000); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function openSettings(page: Page, over: Record<string, unknown>) {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubLogin(page, over);
  await stabilizeBackstack(page);
  await page.goto('/?tab=home');
  await page.getByRole('button', { name: '검증계정 메뉴' }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: '내 정보 열기' }).click();
  const tab = page.locator('[data-profile-tabbar]').getByRole('tab', { name: '설정', exact: true });
  await tab.evaluate((b) => (b as HTMLElement).click());
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

test('🔴 설정은 닉네임·실명 두 칸 — 받는 아이디 칸이 없다', async ({ page }) => {
  await openSettings(page, { nickname_changed_at: null, real_name: '홍길동' });
  await expect(page.getByTestId('nickname-input')).toHaveValue('검증계정');
  await expect(page.getByTestId('real-name-row')).toContainText('홍길동');
  await expect(page.locator('#recv-id-input')).toHaveCount(0);
  await expect(page.getByText('받는 아이디')).toHaveCount(0);
});

test('🔴 닉네임 30일 안 — 입력칸 비활성 + 다음 변경 가능 날짜 공지', async ({ page }) => {
  const changed = Date.now() - 5 * DAY;
  await openSettings(page, { nickname_changed_at: new Date(changed).toISOString() });
  await expect(page.getByTestId('nickname-input')).toBeDisabled();
  await expect(page.getByTestId('name-cooldown-notice'))
    .toContainText(`닉네임은 30일에 한 번 변경할 수 있어요 · 다음 변경 가능: ${kstMD(changed + 30 * DAY)}`);
});

test('🔴 닉네임 첫 변경 — 열려 있고 날짜 없이 규칙만', async ({ page }) => {
  await openSettings(page, { nickname_changed_at: null });
  await expect(page.getByTestId('nickname-input')).toBeEnabled();
  await expect(page.getByTestId('name-cooldown-notice')).toHaveText('닉네임은 30일에 한 번 변경할 수 있어요');
});

test('🔴 30일 지남 — 다시 열린다', async ({ page }) => {
  await openSettings(page, { nickname_changed_at: new Date(Date.now() - 31 * DAY).toISOString() });
  await expect(page.getByTestId('nickname-input')).toBeEnabled();
  await expect(page.getByTestId('name-cooldown-notice')).not.toContainText('다음 변경 가능');
});

test('🔴 옛 서버 응답(nickname_changed_at 키 없음) — name_changed_at 으로 판정', async ({ page }) => {
  await openSettings(page, { name_changed_at: new Date(Date.now() - 5 * DAY).toISOString() });
  await expect(page.getByTestId('nickname-input')).toBeDisabled();
});

for (const serverMsg of [
  '닉네임은 30일에 한 번 변경할 수 있어요 (다음 변경 가능: 10월 24일)',
  '사용할 수 없는 닉네임입니다',
]) {
  test(`🔴 서버 거절 문장을 그대로 보여 준다 — ${serverMsg.slice(0, 14)}`, async ({ page }) => {
    let setCalls = 0;
    let profilePatches = 0;
    await openSettings(page, { nickname_changed_at: null });
    await page.route(/\/rest\/v1\/rpc\/is_nickname_available/, (r) => r.fulfill(json(true)));
    await page.route(/\/rest\/v1\/rpc\/set_my_nickname/, (r) => {
      setCalls += 1;
      return r.fulfill(json({ code: 'P0001', message: serverMsg, details: null, hint: null }, 400));
    });
    page.on('request', (q) => { if (q.method() === 'PATCH' && /\/rest\/v1\/profiles\?/.test(q.url())) profilePatches += 1; });
    await page.getByTestId('nickname-input').fill('새닉네임');
    await page.getByRole('button', { name: '저장하기', exact: true }).click();
    await expect(page.getByText(serverMsg, { exact: true })).toBeVisible();
    expect(setCalls, '닉네임 변경이 set_my_nickname 을 타지 않았다').toBe(1);
    expect(profilePatches, '거절됐는데 프로필 패치가 나갔다').toBe(0);
  });
}

test.describe('이용권 받는 사람 — 닉네임·실명 검색', () => {
  test('🔴 실명을 치면 "실명 → 닉네임" 후보, 고르면 닉네임만 남는다 · 1자는 안내', async ({ page }) => {
    test.setTimeout(120_000);
    const calls: { p_venue_id?: string; p_q?: string }[] = [];
    let oldFinder = 0;
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, appSettings: { identity_voucher_enabled: 'on' } });
    await page.route(/\/rest\/v1\/rpc\/search_voucher_recipients/, (r) => {
      const b = r.request().postDataJSON() as { p_venue_id?: string; p_q?: string };
      calls.push(b);
      return r.fulfill(json(b.p_q === '홍길동'
        ? [{ user_id: '00000000-0000-4000-8000-00000000a001', nickname: '길동이', real_name: '홍길동', verified: true, matched: 'real_name' },
           { user_id: '00000000-0000-4000-8000-00000000a002', nickname: '홍길동팬', real_name: null, verified: false, matched: 'partial' }]
        : []));
    });
    await page.route(/\/rest\/v1\/rpc\/find_user_for_transfer/, (r) => { oldFinder += 1; return r.fulfill(json([])); });

    await openMyStore(page);
    const entry = page.locator('[data-mystore-rail] button').filter({ hasText: '이용권' }).filter({ visible: true });
    await entry.first().click({ timeout: 20_000 });
    const panel = page.getByTestId('voucher-issue');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    await panel.getByTestId('voucher-recv-by-name').click();
    const input = panel.getByRole('combobox');
    await input.fill('홍');
    await expect(panel.getByText('닉네임·실명을 2자 이상 입력하세요.')).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls.length, '1자인데 검색 요청이 나갔다').toBe(0);

    await input.fill('홍길동');
    const opts = panel.getByRole('option');
    await expect(opts).toHaveCount(2);
    await expect(opts.nth(0)).toContainText('홍길동 → 길동이');
    await expect(opts.nth(1)).toContainText('홍길동팬');
    await expect(opts.nth(1)).toContainText('미인증');
    expect(calls.at(-1), '매장 id 없이 검색했다(권한 판정 불가)').toEqual({ p_venue_id: MOCK_VENUE, p_q: '홍길동' });
    expect(oldFinder, '옛 find_user_for_transfer 로 찾았다').toBe(0);

    await opts.nth(0).getByRole('button').click();
    const chosen = panel.getByText('받는 손님:', { exact: false });
    await expect(chosen).toContainText('길동이');
    await expect(chosen, '선택 뒤에도 실명이 남았다 — 저장값(holderName)은 닉네임만').not.toContainText('홍길동');
  });
});
