import { test, expect } from '@playwright/test';

// 인증 스모크(옵션) — 로그인 후 내 매장(장부/클락) 화면이 크래시 없이 렌더되는지.
// 자격증명은 환경변수로만 주입(레포에 절대 커밋 금지): E2E_EMAIL, E2E_PASSWORD.
//   없으면 전체 skip(공개 스모크만 게이트로 동작).
//   ⚠ 변이(바인 추가·클락 시작 등)는 실데이터를 건드리므로 여기서 하지 않는다 — 화면 진입까지만 검증.
//   전용 테스트 매장/계정으로 돌리는 걸 권장(실 운영 매장으로 돌리지 말 것).
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe('인증 스모크', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 미설정 — 인증 스모크 건너뜀');

  test('로그인 → 세션 확립', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('button', { name: '로그인' }).first().click();
    await page.locator('input[type="email"]').fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole('button', { name: '로그인' }).last().click();
    // 로그인 성공 → 헤더 '로그인' 버튼이 사라진다(프로필로 대체)
    await expect(page.getByRole('button', { name: '로그인' })).toHaveCount(0, { timeout: 15_000 });
    expect(errors, `로그인 중 예외: ${errors.join(' | ')}`).toEqual([]);
  });

  test('내 매장 진입(업주 계정일 때) — 장부/클락 섹션 렌더, 변이 없음', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('button', { name: '로그인' }).first().click();
    await page.locator('input[type="email"]').fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole('button', { name: '로그인' }).last().click();
    await expect(page.getByRole('button', { name: '로그인' })).toHaveCount(0, { timeout: 15_000 });

    // 내 매장 탭(업주/직원/운영자만 노출) — 없으면 일반 계정이므로 통과로 간주
    const myStore = page.getByRole('button', { name: '내 매장', exact: true });
    if (await myStore.count() === 0) {
      test.info().annotations.push({ type: 'note', description: '내 매장 탭 없음(일반 계정) — 장부/클락 스모크 생략' });
    } else {
      await myStore.first().click();
      await expect(page.locator('#root')).not.toBeEmpty();
    }
    expect(errors, `내 매장 진입 중 예외: ${errors.join(' | ')}`).toEqual([]);
  });
});
