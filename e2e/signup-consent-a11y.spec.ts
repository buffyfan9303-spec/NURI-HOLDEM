// 가입 동의 체크박스 — 접근 가능한 이름 + 누름 영역 44px (2026-09-29 최종 점검 D4).
//
// 왜: 가입 시트의 동의 체크박스가 `<label onClick>` 과 **연결되지 않아**(htmlFor·감싸기 없음) 스크린리더가
//   "만 19세 이상" 같은 필수 동의를 이름 없는 '체크박스' 로만 읽었다. 누름 표적은 13×13 상자뿐이었다.
//   같은 역할의 ConsentGateModal 은 <label> 로 감싸 이름이 있다 — 그 문법으로 맞춘다.
// 잠그는 것: ① 동의 체크박스 8개가 전부 자기 문구를 이름으로 갖는다(이름 없는 checkbox 0)
//   ② 각 체크박스를 토글하는 누름 영역(감싸는 label)이 44×44 이상이고, 그 영역 **모서리**를 눌러도 토글된다
//   ③ 문구·필수/선택 표시는 그대로.
import { test, expect } from './_fixtures';
import type { Locator, Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const ROWS: [RegExp, boolean][] = [
  [/^전체 동의 \(필수 \+ 선택 포함\)$/, false],
  [/^\[필수\]\s*본인은 만 19세 이상 성인입니다/, true],
  [/^\[필수\]\s*서비스 이용약관에 동의합니다/, true],
  [/^\[필수\]\s*개인정보 수집·이용에 동의합니다/, true],
  [/^\[필수\]\s*불법 환전·사행성 행위 금지 서약에 동의합니다/, true],
  [/^\[선택\]\s*마케팅 정보 수신에 동의합니다/, false],
  [/^\[선택\]\s*랭킹 프로필 공개에 동의합니다/, false],
  [/^\[선택\]\s*위치기반서비스 이용약관에 동의합니다/, false], // SignupLocationConsent — 원래 이름은 있었고 누름 높이가 20.7px(1280) 였다
];

async function openSignup(page: Page): Promise<Locator> {
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog').first();
  await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '누리홀덤 시작하기' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
  return dialog;
}

for (const width of [360, 1280]) {
  test(`🔴 가입 동의 체크박스 — 이름 8/8 · 누름 44px · 모서리 토글 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const dialog = await openSignup(page);

    const nameless = (await dialog.ariaSnapshot()).split('\n').filter((l) => /^\s*- checkbox(\s*\[[^\]]*\])*\s*$/.test(l));
    expect(nameless, '이름 없는 체크박스가 있다 — 스크린리더가 무엇에 동의하는지 못 읽는다').toEqual([]);

    for (const [name] of ROWS) {
      const box = dialog.getByRole('checkbox', { name });
      await expect(box, `${name} 이름의 체크박스가 정확히 하나여야 한다`).toHaveCount(1);
      // 누름 영역 = 이 체크박스를 감싼 label(없으면 상자 자체)
      const hit = await box.evaluate((el) => {
        const t = (el.closest('label') ?? el).getBoundingClientRect();
        return { w: t.width, h: t.height };
      });
      expect(hit.h, `${name} 누름 높이 ${hit.h.toFixed(1)}px < 44`).toBeGreaterThanOrEqual(44);
      expect(hit.w, `${name} 누름 폭 ${hit.w.toFixed(1)}px < 44`).toBeGreaterThanOrEqual(44);
    }

    // 모서리를 눌러도 토글된다 — 선택 항목(마케팅)으로 잰다(필수 상태를 건드리지 않는다). 누른 뒤 되돌린다.
    const mk = dialog.getByRole('checkbox', { name: ROWS[5][0] });
    const target = mk.locator('xpath=ancestor::label[1]');
    await target.scrollIntoViewIfNeeded();
    const r = (await target.boundingBox())!;
    await expect(mk).not.toBeChecked();
    await page.mouse.click(r.x + r.width - 3, r.y + 2);
    await expect(mk, '누름 영역 오른쪽 위 모서리를 눌렀는데 토글되지 않았다').toBeChecked();
    await page.mouse.click(r.x + 3, r.y + r.height - 2);
    await expect(mk, '누름 영역 왼쪽 아래 모서리를 눌렀는데 되돌아가지 않았다').not.toBeChecked();
  });
}
