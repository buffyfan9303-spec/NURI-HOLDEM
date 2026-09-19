// 푸시·폴드 차트 — 데이터 없는 깊이를 **고르기 전에** 눈금이 말하는가 (2026-09-19)
//
// 오너: "10BB 이하로 내려가면 차트가 색이 아무것도 채워져 있지 않아". 실측 결과 뒤 2명 이상은
// 값이 틀려 내린 격리 구간이고 화면은 그 사실을 적고 있었지만, 눈금이 나머지와 똑같이 생겨 전달되지 않았다.
//
// 2026-09-19 재산출로 격리 범위가 **빅앤티 2~6bb → 2~10bb** 로 넓어졌다(12bb 부터 게시).
// 그래서 이 스펙은 세 가지를 **같이** 잰다 — 하나라도 빠지면 경계가 밀려도 초록이 뜬다:
//   ① 양성 — 12·15·20bb 는 표가 실제로 그려진다(색칠된 셀이 있다)
//   ② 음성 — 2~10bb(뒤 2명 이상)는 안내 상자가 **실제로 렌더**되고 행렬이 없다
//   ③ 경계 — **11bb 는 눈금에 없으므로 10bb ↔ 12bb 가 바로 이웃**이다. 눈금 하나 차이로 갈리는 것을 직접 누른다
//   ④ SB(뒤 1명)는 2bb 부터 전 깊이 정상 — 자리 기준으로 계산한다
// ⚠ 로그인은 stubLogin(로컬). 운영 DB 무접촉.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

const NO_DATA = [2, 3, 4, 5, 6, 7, 8, 9, 10];   // 빅앤티 k≥2 격리 — nash.data.ts 의 NASH_ANTE_QUARANTINE 과 같아야 한다
const HAS_DATA = [12, 15, 20];

test.describe('푸시·폴드 눈금 — 없는 깊이를 미리 말한다', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 BTN 은 2~10bb 눈금이 구분되고, 눌러도 되며, 이유가 첫 줄에 온다 · 12bb 부터 표가 그려진다 · SB 는 2bb 부터 정상', async ({ page }) => {
    await stubLogin(page);
    await stabilizeBackstack(page);
    await page.goto('/?tab=tools#tool=pushfold');
    const dlg = page.getByRole('dialog').first();
    const picker = dlg.getByTestId('pushfold-stack-picker');
    await expect(picker).toBeVisible({ timeout: 20_000 });
    const tick = (s: number) => picker.locator(`button[data-stack="${s}"]`);
    const cells = dlg.locator('button[aria-label$=" 상세"]');

    // ① 기본 BTN(뒤 2명): 2~10 없음 · 12~20 있음
    for (const s of NO_DATA) {
      await expect(tick(s), `${s}bb 눈금이 '없음' 으로 표시되지 않았다`).toHaveAttribute('data-has-data', 'false');
      // aria-disabled 를 붙이면 Playwright(와 보조기기)가 '비활성' 으로 보고 누르지 못한다 — 눌러야 이유를 읽는다
      await expect(tick(s), `${s}bb 눈금에 aria-disabled 가 붙었다 — 누를 수 없게 된다`).not.toHaveAttribute('aria-disabled', 'true');
    }
    for (const s of HAS_DATA) {
      await expect(tick(s), `${s}bb 눈금이 '없음' 으로 잘못 표시됐다`).toHaveAttribute('data-has-data', 'true');
    }
    // 흐린 눈금은 실제로 다르게 보인다(점선 밑줄) — 속성만 있고 모양이 같으면 전달되지 않는다
    const deco = await tick(5).evaluate((el) => getComputedStyle(el).textDecorationStyle);
    expect(deco, '없음 눈금에 점선 밑줄이 없다').toBe('dotted');

    // ② 음성 — 눌린다 → 안내 상자가 실제로 렌더되고 이유가 첫 줄 · 행렬은 없다
    await tick(5).click();   // 실제 클릭(액션 가능성 검사 포함) — dispatchEvent 로 우회하면 '못 누르는' 회귀를 놓친다
    const box = dlg.getByTestId('pushfold-no-data');
    await expect(box).toBeVisible();
    await expect(box.locator('p').first(), '이유가 첫 줄이 아니다').toContainText('일시적으로 내렸습니다');
    await expect(box.locator('p').first()).toContainText('5bb');
    await expect(cells, '데이터 없는 깊이에 행렬이 그려졌다').toHaveCount(0);

    // ③ 경계 — 눈금 하나 차이(10bb ↔ 12bb). 11bb 는 NASH_STACKS 에 없어 이 둘이 바로 이웃이다.
    await tick(10).click();
    await expect(dlg.getByTestId('pushfold-no-data'), '10bb BTN 에 표가 떴다 — 격리 하한이 밀렸다').toBeVisible();
    await expect(cells).toHaveCount(0);
    await tick(12).click();
    await expect(dlg.getByTestId('pushfold-no-data'), '12bb BTN 이 막혔다 — 격리 상한이 밀렸다').toHaveCount(0);
    const colored12 = await cells.evaluateAll((els) => els.filter((e) => !!(e as HTMLElement).style.background).length);
    expect(colored12, '12bb BTN 행렬에 색칠된 셀이 없다').toBeGreaterThan(20);

    // ①-2 양성 — 나머지 게시 깊이도 실제로 그려진다(속성만 true 이고 빈 표면 여기서 걸린다)
    for (const s of [15, 20]) {
      await tick(s).click();
      await expect(dlg.getByTestId('pushfold-no-data'), `${s}bb BTN 이 막혔다`).toHaveCount(0);
      const n = await cells.evaluateAll((els) => els.filter((e) => !!(e as HTMLElement).style.background).length);
      expect(n, `${s}bb BTN 행렬에 색칠된 셀이 없다`).toBeGreaterThan(10);
    }

    // ④ SB(뒤 1명)는 2bb 부터 전 깊이 정상 — k=1 은 상대가 하나뿐이라 격리 대상이 아니다
    await dlg.getByRole('button', { name: 'SB', exact: true }).click();
    for (const s of [...NO_DATA, ...HAS_DATA]) {
      await expect(tick(s), `SB 에서 ${s}bb 가 '없음' 으로 남아 있다 — 자리 기준으로 계산하지 않는다`).toHaveAttribute('data-has-data', 'true');
    }
    await tick(2).click();
    await expect(dlg.getByTestId('pushfold-no-data')).toHaveCount(0);
    const colored = await cells.evaluateAll((els) => els.filter((e) => !!(e as HTMLElement).style.background).length);
    expect(colored, 'SB 2bb 행렬에 색칠된 셀이 없다').toBeGreaterThan(100);
  });
});
