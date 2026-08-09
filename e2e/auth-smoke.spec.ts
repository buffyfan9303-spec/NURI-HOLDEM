// 인증 스모크 — 로그인 후 주요 화면이 크래시 없이 렌더되는지.
//
// ⚠ 이 파일은 2026-07 이전까지 **한 번도 실행된 적이 없었다**. E2E_EMAIL 이 설정된 적이 없어
//    항상 skip 됐고, 그래서 안의 로그인 절차가 깨져 있다는 걸 아무도 몰랐다
//    (로그인 모달의 배경 오버레이가 헤더 '로그인' 버튼 클릭을 가로챈다).
//    '항상 건너뛰는 테스트'는 게이트가 아니라 주석이다 — 그래서 아래 두 가지를 바꿨다:
//      ① CI 에서는 자격증명이 없으면 skip 이 아니라 **실패**시킨다(조용히 안 도는 걸 막는다).
//      ② 로그인 UI 를 실제로 거치는 테스트는 딱 하나만 두고, 나머지는 세션을 직접 주입한다.
//         로그인 흐름 자체는 그 하나가 지키고, 다른 테스트는 로그인 화면이 바뀌어도 안 깨진다.
//
// 자격증명은 환경변수로만 주입(레포에 절대 커밋 금지): E2E_EMAIL, E2E_PASSWORD.
// ⚠ 반드시 전용 테스트 계정/매장으로 돌릴 것 — 실 운영 매장 금지. 여기서는 변이를 하지 않는다.
import { test, expect } from '@playwright/test';
import { loginAs, dismissOverlays, stabilizeBackstack } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const HAS_CREDS = !!EMAIL && !!PASSWORD;

test.describe('인증 스모크', () => {
  // CI 에서 자격증명이 빠지면 '조용한 skip' 이 아니라 즉시 실패시킨다.
  // 로컬에서는 자격증명 없이 공개 스모크만 돌리는 게 정상이므로 skip 유지.
  test('자격증명 설정 확인(CI 필수)', async () => {
    if (!HAS_CREDS && process.env.CI) {
      throw new Error(
        'E2E_EMAIL/E2E_PASSWORD 가 CI 에 없다 — 인증 스모크가 통째로 건너뛰어진다.\n'
        + 'GitHub 리포 Settings → Secrets and variables → Actions 에 등록하고 워크플로에서 env 로 넘길 것.',
      );
    }
    test.skip(!HAS_CREDS, '로컬: 자격증명 미설정 — 공개 스모크만 실행');
    expect(HAS_CREDS).toBe(true);
  });

  test('🔐 로그인 화면으로 실제 로그인된다(이 흐름은 UI 로 검증하는 유일한 테스트)', async ({ page }) => {
    test.skip(!HAS_CREDS, '자격증명 미설정');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await stabilizeBackstack(page); // 새 페이지는 history.length=1 이라 모달이 열리자마자 닫힌다
    await page.goto('/');
    // 익명 첫 방문에도 모달이 떠 있어(공지/이벤트) 헤더 버튼 클릭이 가로채인다 — 먼저 걷어낸다.
    await dismissOverlays(page);
    await page.getByRole('button', { name: '로그인' }).first().click();

    // 모달 안에서만 조작한다 — 헤더 버튼은 이 시점에 배경 오버레이에 덮여 클릭이 가로채인다.
    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.locator('input[type="email"]').fill(EMAIL!);
    await dialog.locator('input[type="password"]').first().fill(PASSWORD!);
    await dialog.getByRole('button', { name: /^로그인$/ }).last().click();

    // 로그인 성공 → 헤더 '로그인' 버튼이 사라진다(프로필로 대체)
    await expect(page.getByRole('button', { name: '로그인' })).toHaveCount(0, { timeout: 20_000 });
    expect(errors, `로그인 중 예외: ${errors.join(' | ')}`).toEqual([]);
  });

  test('내 매장 진입 — 장부/클락 섹션이 크래시 없이 렌더된다(변이 없음)', async ({ page }) => {
    test.skip(!HAS_CREDS, '자격증명 미설정');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '로그인' })).toHaveCount(0, { timeout: 20_000 });
    await dismissOverlays(page); // 온보딩 모달이 하단 탭바 클릭을 가로챈다

    // 내 매장 탭(업주/직원/운영자만 노출) — 없으면 일반 계정이므로 통과로 간주
    const myStore = page.getByRole('button', { name: /내 ?매장/ }).first();
    if (await myStore.count() === 0) {
      test.info().annotations.push({ type: 'note', description: '내 매장 탭 없음(일반 계정) — 장부/클락 스모크 생략' });
    } else {
      await myStore.click();
      await expect(page.locator('#root')).not.toBeEmpty();
      await page.waitForTimeout(2000); // 섹션 지연 로드

      // 장부·클락 섹션을 실제로 열어 본다(진입만 — 변이 없음)
      for (const name of [/장부/, /클락|타이머/, /순위/]) {
        const nav = page.getByRole('button', { name }).first();
        if (await nav.count()) {
          await nav.click().catch(() => {});
          await page.waitForTimeout(1200);
          await expect(page.locator('#root')).not.toBeEmpty();
        }
      }
    }
    expect(errors, `내 매장 진입 중 예외: ${errors.join(' | ')}`).toEqual([]);
  });

  test('로그인 사용자의 주요 탭이 예외 없이 렌더된다', async ({ page }) => {
    test.skip(!HAS_CREDS, '자격증명 미설정');
    // 로그인 왕복 + 탭 4개를 1.5초씩 머무르며 도는 테스트다 — 기본 30초로는 네트워크가
    // 조금만 느려도 단언에 닿기 전에 죽는다(실패가 아니라 시간 초과로 끝나 원인이 안 보였다).
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await dismissOverlays(page);

    for (const name of [/라이브|실시간/, /커뮤니티/, /장터/, /일정|탐색/]) {
      const tab = page.getByRole('button', { name }).first();
      if (await tab.count()) {
        await tab.click().catch(() => {});
        await page.waitForTimeout(1500);
        await expect(page.locator('#root')).not.toBeEmpty();
      }
    }
    expect(errors, `탭 이동 중 오류: ${errors.join(' | ')}`).toEqual([]);
  });
});
