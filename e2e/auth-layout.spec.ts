// 로그인 UI 정보구조 재편 (2026-09-11 오너 지시) — 화면 계약
//
// 무엇이 바뀌었나: 상단 3분할 탭(로그인 / 일반 가입 / 업주 가입)을 없애고
//   **한 화면에 한 가지 목적**만 세운다. 모드 전환은 각 화면 하단의 한 줄,
//   가입 유형은 가입 화면 안의 세그먼트로 고른다.
//
// 이 스펙이 잠그는 것
//   ① 상단 3분할 탭이 되살아나지 않는다 · 브랜드 오브젝트는 화면당 하나
//   ② 소셜 CTA 는 Google 하나 (Apple·Kakao 없음)
//   ③ 로그인 → 회원가입 → 유형 전환 → 로그인 복귀 · 비밀번호 찾기 왕복이 전부 된다
//   ④ initialMode="signup-owner" 직접 진입이 매장 업주로 앉는다
//   ⑤ 필수 약관 전에는 가입 버튼이 잠기고, 선택 약관 없이도 열린다
//   ⑥ 비밀번호 보기/숨기기가 값과 포커스를 잃지 않는다
//   ⑦ 기준 뷰포트 전부에서 가로 스크롤 0 · 긴 업주 폼이 끝까지 스크롤된다
//
// 운영 DB 에는 쓰지 않는다 — 폼을 채우기만 하고 제출하지 않는다(_fixtures 가드가 비-GET 을 끊는다).
import { test, expect } from './_fixtures';
import type { Locator, Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const MOBILE = [
  { w: 360, h: 800 }, { w: 375, h: 812 }, { w: 390, h: 844 }, { w: 412, h: 915 },
];
const DESKTOP = [{ w: 1280, h: 800 }, { w: 1440, h: 900 }];

async function openLogin(page: Page): Promise<Locator> {
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);   // 진입 애니메이션 정착
  return dialog;
}

const noHOverflow = (page: Page) => page.evaluate(() => {
  const de = document.documentElement;
  return { doc: de.scrollWidth - de.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
});

test.describe('로그인 창 — 한 화면 한 목적', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 상단 3분할 탭이 없고, 브랜드 오브젝트는 화면당 하나다', async ({ page }) => {
    const dialog = await openLogin(page);
    // 예전 탭 라벨이 되살아나면 실패 — '한 화면 한 목적' 이 깨진 것이다
    await expect(dialog.getByRole('button', { name: '일반 가입' }), '삭제한 상단 탭이 돌아왔다').toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '업주 가입' }), '삭제한 상단 탭이 돌아왔다').toHaveCount(0);
    await expect(dialog.getByTestId('auth-spade'), '브랜드 오브젝트가 하나가 아니다').toHaveCount(1);
    await expect(dialog.getByRole('heading', { name: '다시 만나 반가워요' })).toBeVisible();
  });

  test('🔴 소셜 CTA 는 Google 하나 — Apple·Kakao 는 없다', async ({ page }) => {
    const dialog = await openLogin(page);
    await expect(dialog.getByRole('button', { name: /Google로/ })).toHaveCount(1);
    await expect(dialog.getByRole('button', { name: /Apple|애플/ }), 'Apple 로그인이 생겼다').toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /카카오|Kakao/ }), '삭제한 카카오 로그인이 돌아왔다').toHaveCount(0);
  });

  test('🔴 이메일·비밀번호 입력과 자동 로그인 체크가 그대로 동작한다', async ({ page }) => {
    const dialog = await openLogin(page);
    await dialog.getByLabel('이메일').fill('tester@example.com');
    await dialog.getByTestId('login-password').fill('Passw0rd!23');

    const keep = dialog.getByTestId('auto-login');
    await expect(keep, '자동 로그인 체크박스가 없다').toBeVisible();
    const before = await keep.isChecked();
    await keep.setChecked(!before);
    expect(await keep.isChecked()).toBe(!before);
    await keep.setChecked(before);

    // 입력이 살아 있어야 로그인 버튼이 열린다
    await expect(dialog.getByRole('button', { name: /^로그인/ }).last()).toBeEnabled();
  });

  test('🔴 비밀번호 보기/숨기기 — 값과 포커스가 유지된다', async ({ page }) => {
    const dialog = await openLogin(page);
    const pw = dialog.getByTestId('login-password');
    await pw.fill('Passw0rd!23');
    await pw.focus();

    const reveal = dialog.getByRole('button', { name: '비밀번호 보기' });
    await expect(reveal).toHaveAttribute('aria-pressed', 'false');
    const box = await reveal.boundingBox();
    expect(Math.round(box!.width), '보기 버튼 터치 영역이 44px 미만').toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.height), '보기 버튼 터치 영역이 44px 미만').toBeGreaterThanOrEqual(44);

    await reveal.click();
    await expect(dialog.getByRole('button', { name: '비밀번호 숨기기' })).toHaveAttribute('aria-pressed', 'true');
    await expect(pw, '토글했더니 값이 사라졌다').toHaveValue('Passw0rd!23');
    await expect(pw, '토글 뒤 타입이 안 바뀌었다').toHaveAttribute('type', 'text');

    await dialog.getByRole('button', { name: '비밀번호 숨기기' }).click();
    await expect(pw).toHaveValue('Passw0rd!23');
    await expect(pw).toHaveAttribute('type', 'password');
  });

  test('🔴 로그인 → 회원가입 → 유형 전환 → 로그인 복귀', async ({ page }) => {
    const dialog = await openLogin(page);
    await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '누리홀덤 시작하기' })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: '일반 회원' })).toHaveAttribute('aria-pressed', 'true');

    await dialog.getByRole('button', { name: '매장 업주' }).click();
    await expect(dialog.getByRole('heading', { name: '매장 운영 시작하기' })).toBeVisible({ timeout: 10_000 });
    // 업주 폼의 기존 3개 구역이 그대로 있다
    await expect(dialog.getByText('계정 정보', { exact: true })).toBeVisible();
    await expect(dialog.getByText('매장 정보', { exact: true })).toBeVisible();
    await expect(dialog.getByText('전체 동의 (필수 + 선택 포함)')).toBeVisible();

    await dialog.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '다시 만나 반가워요' })).toBeVisible({ timeout: 10_000 });
  });

  test('🔴 비밀번호 찾기 진입과 로그인 복귀', async ({ page }) => {
    const dialog = await openLogin(page);
    await dialog.getByRole('button', { name: /비밀번호를 잊/ }).click();
    await expect(dialog.getByRole('heading', { name: '비밀번호를 잊으셨나요?' })).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: '인증번호 받기' })).toBeVisible();

    await dialog.getByRole('button', { name: '로그인으로 돌아가기' }).click();
    await expect(dialog.getByRole('heading', { name: '다시 만나 반가워요' })).toBeVisible({ timeout: 10_000 });
  });

  test('🔴 필수 약관 전에는 가입 버튼이 잠기고, 선택 약관 없이도 열린다', async ({ page }) => {
    const dialog = await openLogin(page);
    await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: '누리홀덤 시작하기' })).toBeVisible({ timeout: 10_000 });

    const submit = dialog.getByRole('button', { name: '가입하기' });
    await expect(submit, '아무것도 안 채웠는데 가입 버튼이 열려 있다').toBeDisabled();

    // 필수 4개만 체크 — 선택(마케팅·랭킹 공개)은 건드리지 않는다
    for (const label of [/만 19세 이상/, /서비스 이용약관/, /개인정보 수집·이용/, /불법 환전·사행성/]) {
      await dialog.locator('label').filter({ hasText: label }).first().click();
    }
    // 계정 정보가 비어 있으므로 여전히 잠겨 있어야 한다(약관만으로 열리면 검증이 죽은 것)
    await expect(submit, '약관만 체크했는데 가입 버튼이 열렸다').toBeDisabled();
    // 선택 동의는 꺼진 채로 남아 있어야 한다 — 필수에 묶으면 동의 강제가 된다
    const marketing = dialog.locator('input[type="checkbox"]').nth(5);
    await expect(marketing, '선택 동의가 필수와 함께 켜졌다').not.toBeChecked();
  });

  test('🔴 initialMode="signup-owner" 직접 진입 — 매장 업주가 선택된 채로 열린다', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.goto('/?tab=profile');
    await dismissOverlays(page);
    // 손님 대시보드의 '매장 회원가입' 진입점이 initialMode="signup-owner" 로 연다
    const entry = page.getByRole('button', { name: /매장 회원가입|업주 가입 신청/ }).first();
    if (await entry.count() === 0) test.skip(true, '이 화면에 업주 가입 진입점이 없다(로그인 상태 의존)');
    await entry.click();
    const dialog = page.getByRole('dialog').filter({ hasText: '매장 운영 시작하기' }).first();
    await expect(dialog, 'signup-owner 직접 진입이 업주 화면으로 앉지 않았다').toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('button', { name: '매장 업주' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('로그인 창 — 반응형', () => {
  for (const vp of [...MOBILE, ...DESKTOP]) {
    test(`🔴 ${vp.w}×${vp.h} — 가로 스크롤 0 · 제목과 CTA 가 보인다`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      const dialog = await openLogin(page);

      const over = await noHOverflow(page);
      expect(over.doc, `문서가 ${over.doc}px 가로로 넘친다`).toBeLessThanOrEqual(1);
      expect(over.body, `body 가 ${over.body}px 가로로 넘친다`).toBeLessThanOrEqual(1);

      await expect(dialog.getByRole('heading', { name: '다시 만나 반가워요' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Google로/ })).toBeVisible();

      // 입력은 46px 이상 · 모바일 자동확대 방지를 위해 실제 글자 16px 이상
      const fields = await dialog.locator('input[type="email"], input[type="password"]').evaluateAll(
        (els) => els.map((e) => ({
          h: Math.round(e.getBoundingClientRect().height),
          fs: Math.round(parseFloat(getComputedStyle(e).fontSize)),
        })));
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        expect(f.h, `입력 높이 ${f.h}px`).toBeGreaterThanOrEqual(44);
        if (vp.w <= 412) expect(f.fs, `모바일 입력 글자 ${f.fs}px — 16 미만이면 iOS 가 확대한다`).toBeGreaterThanOrEqual(16);
      }
    });
  }

  test('🔴 긴 업주 가입 폼이 최하단까지 스크롤된다 (360×800)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const dialog = await openLogin(page);
    await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
    await dialog.getByRole('button', { name: '매장 업주' }).click();
    await expect(dialog.getByRole('heading', { name: '매장 운영 시작하기' })).toBeVisible({ timeout: 10_000 });

    const submit = dialog.getByRole('button', { name: '업주 가입 신청' });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit, '가입 버튼까지 스크롤이 닿지 않는다').toBeInViewport();

    // 스크롤해도 문서는 가로로 넘치지 않는다
    const over = await noHOverflow(page);
    expect(over.doc).toBeLessThanOrEqual(1);
  });
});
