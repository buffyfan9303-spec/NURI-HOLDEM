// 포스터 저장이 **거짓 성공**을 말하지 않는다 (2026-09-20 · R1-B)
//
// 🔴 무엇이 문제였나
//   `PosterFormModal.tsx` 의 submit 은 `onSubmit(...)` 을 **기다리지 않고** 곧바로
//   '포스터가 등록되었습니다'(성공) 토스트를 띄우고 `onClose()` 했다.
//   App 쪽(`handleSubmitPoster`)은 이미 `Promise.allSettled` 로 전부/부분/전무 실패를 정확히
//   판정하고 있었는데 **그 결과가 폼까지 오지 않았다.** 그래서 저장이 실패하면 업주는
//     ① '포스터가 등록되었습니다'(성공) → ② '포스터 등록에 실패했습니다'(실패)
//   를 연달아 보고, 그때 폼은 이미 닫혀 **입력이 통째로 사라진 뒤**였다.
//   3주 반복 중 1주만 실패한 경우도 똑같이 '성공' 으로 닫혔다.
//
// 이 스펙이 잠그는 것: 실패·부분 성공에 (a) 성공 토스트 없음 (b) 폼 안 닫힘 (c) 입력 보존.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

const SCHEDULES_POST = /\/rest\/v1\/schedules(\?|$)/;
const TITLE = '거짓성공 검사용 게임';

/** 업주로 내 매장 → 포스터 단계 → '+ 새 게임' 으로 포스터 폼을 연다. */
async function openPosterForm(page: Page) {
  await openMyStore(page);
  await expect(page.locator('[data-tab="my-store"]'), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: /포스터/ }).first().click();
  await page.waitForTimeout(1200);
  const newBtn = page.getByRole('button', { name: /새 게임/ }).first();
  await expect(newBtn, "'+ 새 게임' 버튼이 없다 — 포스터 폼 진입로가 바뀌었다").toBeVisible({ timeout: 20_000 });
  await newBtn.click();
  await expect(page.getByRole('heading', { name: '새 포스터 등록' }), '포스터 폼이 안 열렸다')
    .toBeVisible({ timeout: 20_000 });
}

/** 필수 칸만 채운다(게임 이름·날짜·지역·참가비·보장 상금·레지마감). */
async function fillRequired(page: Page, weeks = 1) {
  const kstTomorrow = new Date(Date.now() + 9 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
  // ⚠ 라벨이 여러 개 걸린다. 게다가 `useDelayedUnmount` 때문에 **이전 모달 인스턴스가 잠시 남는다** —
  //   `.first()` 로 잡으면 숨은 옛 폼의 칸을 채우려다 타임아웃 난다(실제로 150s 타임아웃을 봤다).
  //   → 지금 보이는 다이얼로그 안으로 좁힌다.
  const f = (name: string) => dialog(page).getByLabel(name, { exact: false }).first();
  await f('게임 이름').fill(TITLE);
  await f('날짜').fill(kstTomorrow);
  await f('지역').selectOption({ index: 1 });
  await f('참가비').fill('100000');
  await f('보장 상금').fill('1000');
  await f('레벨').fill('10');
  if (weeks > 1) {
    const rep = page.getByLabel('반복', { exact: false }).first();
    if (await rep.count()) await rep.selectOption(String(weeks)).catch(() => {});
  }
}

/** 지금 열려 있는 포스터 폼 다이얼로그. `useDelayedUnmount` 로 옛 인스턴스가 잠시 남아
 *  전역 셀렉터는 strict mode 로 터진다 — 모든 조작을 이 안으로 좁힌다. */
const dialog = (page: Page) => page.getByRole('dialog')
  .filter({ has: page.getByRole('heading', { name: '새 포스터 등록' }) }).last();
const submitBtn = (page: Page) => dialog(page).getByRole('button', { name: /등록하기|저장 중/ });
const submit = (page: Page) => submitBtn(page).click();
const formOpen = (page: Page) => page.getByRole('heading', { name: '새 포스터 등록' }).last().isVisible();

test.describe('포스터 저장 — 거짓 성공 없음', () => {
  test('🔴 저장이 실패하면 성공 토스트 없이 폼이 열린 채 남고 입력이 보존된다', async ({ page }) => {
    test.setTimeout(150_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 } });
    // 저장 POST 만 실패시킨다 — GET 은 목킹 그대로.
    let posts = 0;
    await page.route(SCHEDULES_POST, (r) => {
      if (r.request().method() !== 'POST') return r.fallback();
      posts += 1;
      return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) });
    });
    await openPosterForm(page);
    await fillRequired(page);
    await submit(page);
    await page.waitForTimeout(2500);

    expect(posts, '저장 요청이 아예 안 나갔다 — 이 검사가 아무것도 재지 않았다').toBeGreaterThan(0);
    // (a) 성공 토스트가 뜨면 안 된다
    await expect(page.getByText('포스터가 등록되었습니다'),
      '저장이 실패했는데 성공 토스트가 떴다 — 거짓 성공이다').toHaveCount(0);
    // (b) 폼이 닫히면 안 된다
    expect(await formOpen(page), '저장이 실패했는데 폼이 닫혔다 — 입력이 사라진다').toBe(true);
    // (c) 입력이 남아 있어야 한다
    await expect(dialog(page).getByLabel('게임 이름', { exact: false }).first(),
      '폼은 열려 있는데 입력이 지워졌다').toHaveValue(TITLE);
    // (d) 실패를 실제로 알려야 한다
    await expect(page.getByText(/등록에 실패|실패했습니다/).first(),
      '실패했는데 아무 안내도 없다').toBeVisible({ timeout: 10_000 });
  });

  test('🔴 저장에 성공하면 그때 성공 토스트가 뜨고 폼이 닫힌다 (양성 대조)', async ({ page }) => {
    test.setTimeout(150_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 } });
    let posts = 0;
    await page.route(SCHEDULES_POST, (r) => {
      if (r.request().method() !== 'POST') return r.fallback();
      posts += 1;
      return r.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify([{ id: 'bbbbbbbb-0000-4000-8000-00000000000' + posts, title: TITLE, approved: false }]),
      });
    });
    await openPosterForm(page);
    await fillRequired(page);
    await submit(page);

    // ⚠ 토스트를 **먼저** 본다. 토스트는 몇 초 뒤 스스로 사라지므로 폼 닫힘을 기다린 뒤에 찾으면
    //   이미 없어져 '성공했는데 토스트가 없다' 로 잘못 실패한다(실제로 한 번 그렇게 빨개졌다).
    await expect(page.getByText('포스터가 등록되었습니다').first(),
      '성공했는데 성공 토스트가 없다').toBeVisible({ timeout: 15_000 });
    expect(posts, '저장 요청이 안 나갔다').toBeGreaterThan(0);
    // ⚠ 이 양성 대조가 없으면 위 테스트는 '폼이 영원히 안 닫힌다' 로도 통과한다.
    await expect(page.getByRole('heading', { name: '새 포스터 등록' }),
      '저장에 성공했는데 폼이 안 닫혔다 — 이번엔 반대로 고장 난 것이다').toHaveCount(0, { timeout: 10_000 });
  });

  test('🔴 저장 중에는 제출 버튼이 잠겨 같은 포스터가 두 번 생기지 않는다', async ({ page }) => {
    test.setTimeout(150_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 } });
    let posts = 0;
    await page.route(SCHEDULES_POST, async (r) => {
      if (r.request().method() !== 'POST') return r.fallback();
      posts += 1;
      await new Promise((res) => setTimeout(res, 1500)); // 느린 서버 — 연타 창을 만든다
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'cccccccc-0000-4000-8000-00000000000' + posts, title: TITLE }]) });
    });
    await openPosterForm(page);
    await fillRequired(page);
    const btn = submitBtn(page);
    await btn.click();
    await page.waitForTimeout(350);
    await expect(btn, '저장 중인데 버튼이 안 잠겼다 — 연타하면 포스터가 두 벌 생긴다').toBeDisabled();
    await page.waitForTimeout(3000);
    expect(posts, `저장 요청이 ${posts}번 나갔다 — 한 번이어야 한다`).toBe(1);
  });
});
