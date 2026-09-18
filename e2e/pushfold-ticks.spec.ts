// 푸시·폴드 차트 — 데이터 없는 깊이를 **고르기 전에** 눈금이 말하는가 (2026-09-19)
//
// 오너: "10BB 이하로 내려가면 차트가 색이 아무것도 채워져 있지 않아". 실측 결과 2~6bb(뒤 2명 이상)는
// 값이 틀려 내린 격리 구간이고 화면은 그 사실을 적고 있었지만, 눈금이 7~20 과 똑같이 생겨 전달되지 않았다.
// 이 스펙이 잠그는 것 — 되돌리면 각 줄이 빨개진다:
//   ① 현재 자리(BTN) 기준으로 데이터 없는 눈금(2~6)이 data-has-data="false" + aria-disabled 로 구분된다
//   ② 그 눈금은 여전히 눌리고, 누르면 이유("일시적으로 내렸습니다")가 **첫 줄**에 온다
//   ③ 자리를 SB 로 바꾸면 2bb 부터 정상 표시(data-has-data="true")로 바뀌고 행렬에 색이 든다
// ⚠ 로그인은 stubLogin(로컬). 운영 DB 무접촉.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

test.describe('푸시·폴드 눈금 — 없는 깊이를 미리 말한다', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 BTN 은 2~6bb 눈금이 구분되고, 눌러도 되며, 이유가 첫 줄에 온다 · SB 는 2bb 부터 정상', async ({ page }) => {
    await stubLogin(page);
    await stabilizeBackstack(page);
    await page.goto('/?tab=tools#tool=pushfold');
    const dlg = page.getByRole('dialog').first();
    const picker = dlg.getByTestId('pushfold-stack-picker');
    await expect(picker).toBeVisible({ timeout: 20_000 });
    const tick = (s: number) => picker.locator(`button[data-stack="${s}"]`);

    // ① 기본 BTN(뒤 2명): 2~6 없음 · 7~20 있음
    for (const s of [2, 3, 4, 5, 6]) {
      await expect(tick(s), `${s}bb 눈금이 '없음' 으로 표시되지 않았다`).toHaveAttribute('data-has-data', 'false');
      // aria-disabled 를 붙이면 Playwright(와 보조기기)가 '비활성' 으로 보고 누르지 못한다 — 눌러야 이유를 읽는다
      await expect(tick(s), `${s}bb 눈금에 aria-disabled 가 붙었다 — 누를 수 없게 된다`).not.toHaveAttribute('aria-disabled', 'true');
    }
    for (const s of [7, 8, 9, 10, 12, 15, 20]) {
      await expect(tick(s), `${s}bb 눈금이 '없음' 으로 잘못 표시됐다`).toHaveAttribute('data-has-data', 'true');
    }
    // 흐린 눈금은 실제로 다르게 보인다(점선 밑줄) — 속성만 있고 모양이 같으면 전달되지 않는다
    const deco = await tick(5).evaluate((el) => getComputedStyle(el).textDecorationStyle);
    expect(deco, '없음 눈금에 점선 밑줄이 없다').toBe('dotted');

    // ② 눌린다 → 이유가 첫 줄
    await tick(5).click();   // 실제 클릭(액션 가능성 검사 포함) — dispatchEvent 로 우회하면 '못 누르는' 회귀를 놓친다
    const box = dlg.getByTestId('pushfold-no-data');
    await expect(box).toBeVisible();
    await expect(box.locator('p').first(), '이유가 첫 줄이 아니다').toContainText('일시적으로 내렸습니다');
    await expect(box.locator('p').first()).toContainText('5bb');
    await expect(dlg.locator('button[aria-label$=" 상세"]'), '데이터 없는 깊이에 행렬이 그려졌다').toHaveCount(0);

    // ③ SB(뒤 1명)는 2bb 부터 정상
    await dlg.getByRole('button', { name: 'SB', exact: true }).click();
    for (const s of [2, 3, 4, 5, 6]) {
      await expect(tick(s), `SB 에서 ${s}bb 가 '없음' 으로 남아 있다 — 자리 기준으로 계산하지 않는다`).toHaveAttribute('data-has-data', 'true');
    }
    await tick(2).click();
    await expect(dlg.getByTestId('pushfold-no-data')).toHaveCount(0);
    const colored = await dlg.locator('button[aria-label$=" 상세"]').evaluateAll((els) => els.filter((e) => !!(e as HTMLElement).style.background).length);
    expect(colored, 'SB 2bb 행렬에 색칠된 셀이 없다').toBeGreaterThan(100);
  });
});
