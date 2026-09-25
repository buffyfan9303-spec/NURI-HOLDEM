// 푸시·폴드 차트 — 눈금이 깊이의 **등급**을 고르기 전에 말하는가 (2026-09-19 · 2026-09-21 개정)
//
// 오너: "10BB 이하로 내려가면 차트가 색이 아무것도 채워져 있지 않아". 2026-09-19 에는 뒤 2명 이상 2~10bb 가
// 값이 틀려 내린 격리 구간이었고 눈금이 그 사실을 점선으로 말하게 했다.
// 2026-09-21 오너 결정 "근사 계산 — 오늘 안에": 그 구간을 **다인 콜 근사(추정) 값**으로 채웠다(nash.data.ts NASH_ANTE_APPROX).
// 2026-09-25 오너 결정: **BTN(뒤 2명)은 2~10bb 도 정식 등급**이다 — 근사 없는 3인 균형(solve3.mjs)이고 독립 교차검증까지 CONFIRMED.
//   '추정' 은 이제 **CO 이상(뒤 3명+)** 의 2~10bb 만 말한다(nash.data.ts NASH_EXACT_KS · isNashApprox).
// 그래서 이 스펙은 이제 다섯 가지를 **같이** 잰다 — 하나라도 빠지면 등급 경계가 밀려도 초록이 뜬다:
//   ① BTN 2~10bb 눈금이 '있음' 이고 실제로 행렬이 그려지며 배지가 '추정' 을 **말하지 않는다**(추정→정확 전환. 되돌리면 여기서 빨개진다)
//   ② CO(뒤 3명)의 같은 구간은 출처 배지가 '추정' 이라고 말한다 — 12bb 이상은 말하지 않는다(등급이 다르다)
//   ③ 경계 — **11bb 는 눈금에 없으므로 10bb ↔ 12bb 가 바로 이웃**이다. CO 에서 눈금 하나 차이로 등급이 갈리는 것을 직접 누른다
//   ④ SB(뒤 1명)는 2bb 부터 전 깊이 정식 등급 — 자리 기준으로 계산한다
//   ⑤ 자리 기준이다 — 같은 5bb 에서 BTN 정식 ↔ CO 추정이 자리 버튼 하나로 갈린다
// ⚠ 로그인은 stubLogin(로컬). 운영 DB 무접촉.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

const SHALLOW = [2, 3, 4, 5, 6, 7, 8, 9, 10];   // 빅앤티 k≥3 추정 구간 — nash.data.ts 의 NASH_ANTE_APPROX 와 같아야 한다(BTN·SB 는 이 깊이도 정식)
const EXACT = [12, 15, 20];

test.describe('푸시·폴드 눈금 — 깊이의 등급을 미리 말한다', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 BTN 은 2bb 부터 전 깊이 정식 등급 · CO 는 2~10bb 가 추정, 12bb 부터 정식 · SB 는 2bb 부터 정식', async ({ page }) => {
    await stubLogin(page);
    await stabilizeBackstack(page);
    await page.goto('/?tab=tools#tool=pushfold');
    const dlg = page.getByRole('dialog').first();
    const picker = dlg.getByTestId('pushfold-stack-picker');
    await expect(picker).toBeVisible({ timeout: 20_000 });
    const tick = (s: number) => picker.locator(`button[data-stack="${s}"]`);
    const cells = dlg.locator('button[aria-label$=" 상세"]');
    const source = dlg.getByTestId('pushfold-source');
    const colored = () => cells.evaluateAll((els) => els.filter((e) => !!(e as HTMLElement).style.background).length);

    // ① 기본 BTN(뒤 2명): 전 깊이 '있음' — 점선(없음) 표시가 남아 있으면 표가 안 실린 것이다
    for (const s of [...SHALLOW, ...EXACT]) {
      await expect(tick(s), `${s}bb 눈금이 '없음' 으로 표시됐다 — BTN 표가 안 실렸다`).toHaveAttribute('data-has-data', 'true');
      await expect(tick(s), `${s}bb 눈금에 aria-disabled 가 붙었다 — 누를 수 없게 된다`).not.toHaveAttribute('aria-disabled', 'true');
    }
    const deco = await tick(5).evaluate((el) => getComputedStyle(el).textDecorationStyle);
    expect(deco, '5bb 눈금이 아직 점선(없음)으로 그려진다').not.toBe('dotted');

    // ①-2 BTN 5bb·10bb — 눌린다 → 행렬이 실제로 그려지고 배지가 '추정' 을 **말하지 않는다**(2026-09-25 추정→정확 전환)
    for (const s of [5, 10]) {
      await tick(s).click();   // 실제 클릭(액션 가능성 검사 포함) — dispatchEvent 로 우회하면 '못 누르는' 회귀를 놓친다
      await expect(dlg.getByTestId('pushfold-no-data'), `${s}bb BTN 에 안내 상자가 떴다 — 표가 안 읽힌다`).toHaveCount(0);
      await expect(cells, `${s}bb BTN 행렬이 없다`).toHaveCount(169);
      expect(await colored(), `${s}bb BTN 행렬에 색칠된 셀이 없다(전부 0 = 전부 폴드)`).toBeGreaterThan(20);
      await expect(source, `${s}bb BTN 배지가 '추정' 이다 — k=2 는 정확 3인 균형이다(NASH_EXACT_KS)`).toHaveAttribute('data-approx', 'false');
      await expect(source).not.toContainText('추정');
    }
    // BTN 정식 등급 나머지 깊이도 실제로 그려진다(속성만 true 이고 빈 표면 여기서 걸린다)
    for (const s of [12, 15, 20]) {
      await tick(s).click();
      await expect(dlg.getByTestId('pushfold-no-data'), `${s}bb BTN 이 막혔다`).toHaveCount(0);
      await expect(source).toHaveAttribute('data-approx', 'false');
      expect(await colored(), `${s}bb BTN 행렬에 색칠된 셀이 없다`).toBeGreaterThan(10);
    }

    // ② CO(뒤 3명) — 같은 5bb 가 자리 버튼 하나로 추정 등급이 된다(⑤ 자리 기준). 행렬은 그려지고 배지가 '추정' 이라고 말한다
    await dlg.getByRole('button', { name: 'CO', exact: true }).click();
    for (const s of [...SHALLOW, ...EXACT]) {
      await expect(tick(s), `CO ${s}bb 눈금이 '없음' 으로 표시됐다 — 추정값(NASH_ANTE_APPROX)이 안 실렸다`).toHaveAttribute('data-has-data', 'true');
    }
    await tick(5).click();
    await expect(dlg.getByTestId('pushfold-no-data'), '5bb CO 에 안내 상자가 떴다 — 추정값이 안 읽힌다').toHaveCount(0);
    await expect(cells, '5bb CO 행렬이 없다').toHaveCount(169);
    expect(await colored(), '5bb CO 행렬에 색칠된 셀이 없다(전부 0 = 전부 폴드)').toBeGreaterThan(20);
    await expect(source, '5bb CO 배지가 추정 등급을 말하지 않는다').toHaveAttribute('data-approx', 'true');
    await expect(source).toContainText('추정');

    // ③ 경계 — 눈금 하나 차이(10bb ↔ 12bb). 11bb 는 NASH_STACKS 에 없어 이 둘이 바로 이웃이다.
    await tick(10).click();
    await expect(source, '10bb CO 가 추정 등급이 아니다 — 경계 상한이 밀렸다').toHaveAttribute('data-approx', 'true');
    expect(await colored(), '10bb CO 행렬에 색칠된 셀이 없다').toBeGreaterThan(20);
    await tick(12).click();
    await expect(source, '12bb CO 가 추정 등급으로 표시됐다 — 경계가 밀렸다').toHaveAttribute('data-approx', 'false');
    await expect(source).not.toContainText('추정');
    expect(await colored(), '12bb CO 행렬에 색칠된 셀이 없다').toBeGreaterThan(20);

    // ④ SB(뒤 1명)는 2bb 부터 전 깊이 정식 — k=1 은 상대가 하나뿐이라 추정 구간이 아니다
    await dlg.getByRole('button', { name: 'SB', exact: true }).click();
    for (const s of [...SHALLOW, ...EXACT]) {
      await expect(tick(s), `SB 에서 ${s}bb 가 '없음' 으로 남아 있다 — 자리 기준으로 계산하지 않는다`).toHaveAttribute('data-has-data', 'true');
    }
    await tick(2).click();
    await expect(dlg.getByTestId('pushfold-no-data')).toHaveCount(0);
    await expect(source, 'SB 2bb 가 추정 등급으로 표시됐다 — k=1 은 정확값이다').toHaveAttribute('data-approx', 'false');
    expect(await colored(), 'SB 2bb 행렬에 색칠된 셀이 없다').toBeGreaterThan(100);
  });
});
