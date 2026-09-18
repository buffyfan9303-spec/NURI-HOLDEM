// 카드 도구 — **내가 넣은 것이 보이고, 고르는 곳에 손이 닿는가** (2026-09-19 오너 지시 2건)
//
// 오너 문장 그대로:
//   ① "핸드 리플레이어 상대 핸드가 보이지 않아"
//   ② "GTO 핸드 분석 보드를 선택할 수 없어"
//
// 둘 다 '동작이 고장' 이 아니었다 — 실측이 말해 준 것은 다른 쪽이었다.
//   ① 도구가 **내가 방금 넣은 상대 핸드를 뒷면으로 가리고 있었다**(눈감김 아이콘 2 · 카드 0).
//      단계 공개는 글을 *읽는* 사람을 위한 장치인데 *쓰는* 사람 화면에까지 걸려 있었다.
//   ② 보드 슬롯은 y284 에서 끝나는데 카드 그리드가 결과 카드 뒤 **y883**(보이는 영역 785 밖)이었다.
//      슬롯을 눌러도 화면에서는 아무 일도 안 일어난다 — 그래서 '선택할 수 없다' 가 맞는 말이었다.
//
// 그래서 이 파일은 **좌표와 개수**를 잰다. 소스 계약으로는 '멀리 있다' 를 잴 수 없다.
// ⚠ 음성 대조(이 검사가 정말 그걸 보고 있는가):
//   · HandReviewTool 의 `revealAll` 을 빼면 ①-A 가 실패한다(뒷면 2장으로 돌아간다).
//   · GtoDeepPanel 의 카드 그리드 CalcCard 를 결과 카드 뒤로 되돌리면 ②-A·②-B 가 둘 다 실패한다.
//   실제로 고치기 전 상태에서 돌려 네 개 모두 실패하는 것을 확인했다.
//
// ⚠ 로그인은 stubLogin 으로 로컬에서만 만든다(운영 DB 무접촉). 권한 검증용이 아니다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';

/** 오너가 캡처한 화면과 같은 폭. 여기서 안 보이면 실제 폰에서도 안 보인다. */
const PHONE = { width: 390, height: 844 };

async function openTool(page: Page, hash: string) {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.setViewportSize(PHONE);
  await page.goto(`/?tab=tools#tool=${hash}`);
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
  await expect(page.getByRole('dialog').first(), `#tool=${hash} 딥링크로 도구가 열리지 않았다`)
    .toBeVisible({ timeout: 20_000 });
}

test.describe('① 핸드 리플레이어 — 내가 넣은 상대 핸드가 보인다', () => {
  test('🔴 도구 미리보기의 상대 핸드는 뒷면이 아니다 — 카드 2장이 그대로 읽힌다', async ({ page }) => {
    await openTool(page, 'replay');
    const row = page.locator('[data-hand-row="상대 핸드"]').first();
    await expect(row, '상대 핸드 줄 자체가 없다 — 데모 스팟이 바뀌었는지 먼저 보라').toBeVisible({ timeout: 15_000 });

    const seen = await row.evaluate((el) => ({
      // 뒷면은 eye-off 아이콘(svg)으로 그린다. 앞면(MiniCard)은 글자다.
      hiddenIcons: el.querySelectorAll('svg').length,
      faces: [...el.querySelectorAll(':scope > div > span')].map((s) => s.textContent!.trim()).filter(Boolean),
    }));
    expect(seen.hiddenIcons, `상대 핸드가 아직 뒷면이다(눈감김 아이콘 ${seen.hiddenIcons}개). `
      + 'HandReviewTool 이 HandReplayer 에 revealAll 을 넘기고 있는지 보라').toBe(0);
    expect(seen.faces.length, `상대 핸드 카드가 ${seen.faces.length}장 보인다(2장이어야 한다)`).toBe(2);
  });

  test('🔴 단계별 보기는 없어지지 않았다 — 누르면 다시 뒷면이 된다(기능 보존)', async ({ page }) => {
    // 오너가 원한 것은 '내 화면에서 보이게' 지 '단계 공개를 없애라' 가 아니다.
    // 글을 읽는 사람 쪽 경험은 그대로여야 하고, 작성자는 여기서 그 화면을 미리 볼 수 있어야 한다.
    await openTool(page, 'replay');
    const toggle = page.getByRole('button', { name: '단계별 보기' }).first();
    await expect(toggle, '단계별 보기 토글이 사라졌다 — 읽는 사람용 단계 공개를 통째로 잃은 것이다').toBeVisible({ timeout: 15_000 });

    await toggle.click();
    const row = page.locator('[data-hand-row="상대 핸드"]').first();
    await expect
      .poll(() => row.evaluate((el) => el.querySelectorAll('svg').length), {
        message: '단계별 보기로 돌아갔는데 상대 핸드가 여전히 앞면이다 — 단계 공개가 죽었다',
        timeout: 10_000,
      })
      .toBe(2);
  });
});

test.describe('② GTO 핸드 분석 — 보드를 고를 수 있다', () => {
  test('🔴 카드 그리드가 처음 화면 안에 있다 — 슬롯을 누른 손이 그리로 바로 간다', async ({ page }) => {
    await openTool(page, 'gto');
    const firstCard = page.locator('[data-card]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // 🔴 이 한 줄이 오너의 증상 그대로다: 스크롤하지 않은 상태에서 그리드가 화면 안에 있는가.
    //   고치기 전에는 y883(보이는 영역 785)이라 실패했다.
    await expect(firstCard, '카드 그리드가 첫 화면 밖이다 — 보드 슬롯을 눌러도 화면에서는 아무 일도 안 일어난다')
      .toBeInViewport({ timeout: 10_000 });

    const gap = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]')!;
      const boardLabel = [...dlg.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Board (선택)');
      const slots = boardLabel?.nextElementSibling;
      const card = dlg.querySelector('[data-card]');
      if (!slots || !card) return null;
      return Math.round(card.getBoundingClientRect().top - slots.getBoundingClientRect().bottom);
    });
    expect(gap, '보드 슬롯 또는 카드 그리드를 못 찾았다').not.toBeNull();
    expect(gap!, `보드 슬롯 끝에서 카드 그리드까지 ${gap}px 다 — 한 화면 안(<400px)이어야 손이 이어진다`)
      .toBeLessThan(400);
  });

  test('🔴 카드 그리드는 결과 카드보다 **앞**이다 — 결과가 길어져도 그리드가 밀려나지 않는다', async ({ page }) => {
    // 위 좌표 검사만 두면, 나중에 결과 카드가 짧아졌을 때 옛 순서로도 통과해 버린다.
    // 순서 자체를 잠가 둔다(짝이 되는 도구 HandBoardPicker 도 '슬롯 → 그리드 → 결과' 다).
    await openTool(page, 'gto');
    await expect(page.locator('[data-card]').first()).toBeVisible({ timeout: 15_000 });

    const order = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]')!;
      const card = dlg.querySelector('[data-card]');
      const equity = [...dlg.querySelectorAll('p')].find((p) => /에퀴티 \(Hero vs Villain\)/.test(p.textContent!));
      if (!card || !equity) return { found: false, gridBeforeResult: false };
      // DOCUMENT_POSITION_FOLLOWING(4): equity 가 card 뒤에 있다
      return { found: true, gridBeforeResult: !!(card.compareDocumentPosition(equity) & 4) };
    });
    expect(order.found, '카드 그리드 또는 에퀴티 결과를 못 찾았다 — 데모 입력이 결과를 못 만들었을 수 있다').toBe(true);
    expect(order.gridBeforeResult, '카드 그리드가 결과 카드 뒤로 돌아갔다 — 오너가 신고한 상태 그대로다').toBe(true);
  });

  test('🔴 보드 슬롯을 누르고 그리드에서 고르면 그 카드가 보드에 앉는다(끝까지 동작)', async ({ page }) => {
    await openTool(page, 'gto');
    await expect(page.locator('[data-card]').first()).toBeVisible({ timeout: 15_000 });

    // 보드를 비우고 대상을 보드로 맞춘 뒤, 안 쓰인 카드 하나를 고른다.
    await page.getByRole('button', { name: '보드 초기화' }).first().click();
    await page.locator('[role="dialog"] button').filter({ hasText: /^Board \(선택\)$/ }).first().click();

    const pick = page.locator('[data-card]:not([disabled])').first();
    const picked = await pick.getAttribute('data-card');
    await pick.click();

    const onBoard = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]')!;
      const boardLabel = [...dlg.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Board (선택)');
      const slots = boardLabel?.nextElementSibling;
      return slots ? [...slots.querySelectorAll('button')].map((b) => b.textContent!.trim()).filter((t) => t !== '+') : [];
    });
    expect(onBoard.length, `보드에 카드가 앉지 않았다(고른 카드: ${picked}, 보드: ${JSON.stringify(onBoard)})`)
      .toBeGreaterThan(0);
  });
});
