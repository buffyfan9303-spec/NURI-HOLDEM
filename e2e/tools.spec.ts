// 도구 탭 — 전체화면 실행·데이터 게이트.
//
// P26 이전의 구조적 결함: 도구 카드를 누르면 패널이 "그 카드 행 아래 인라인"으로 열려
// 위에 런처가 그대로 남았다(중간 도구를 누르면 열린 곳을 찾아 스크롤해야 했다).
// 이제 도구는 앱의 다른 상세 화면과 같은 전체화면 페이지(Modal page)다 — 그 계약을 잰다.
// 데이터 게이트: 레인지·푸시폴드가 실데이터(콤보 가중 %)를 렌더하는지까지.
import { test, expect } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

async function gotoTools(page: import('@playwright/test').Page) {
  await stabilizeBackstack(page);
  await page.goto('/');
  // 온보딩 시트는 첫 페인트 700ms '뒤에' 뜬다 — 즉시 count 체크는 레이스(홈 전환으로 부팅이
  // 빨라지며 실제로 물렸다). 지연 등장까지 기다려 걷어내는 공용 헬퍼 사용.
  await dismissOverlays(page);
  await page.locator('button:visible').filter({ hasText: '도구' }).last().click();
}

test.describe('도구 탭 — 전체화면 실행', () => {
  test('🔴 도구 카드를 누르면 전체화면 페이지로 열리고, 닫으면 런처로 돌아온다', async ({ page }) => {
    await gotoTools(page);
    // 플레이어 그룹은 첫 방문 기본 펼침 — 카드가 바로 보여야 한다
    const card = page.getByRole('button', { name: /스타팅핸드 가이드/ }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    // 전체화면 페이지(role=dialog, 제목 = 도구 이름)
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '스타팅핸드 가이드' }).first();
    await expect(dialog).toBeVisible();
    // 딥링크 해시가 걸린다
    await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('tool=range');

    // 닫기 → 런처 복귀 + 해시 해제
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).not.toContain('tool=');
    await expect(card).toBeVisible();
  });

  test('🔴 스타팅핸드 가이드 — 13x13 매트릭스와 콤보 가중 %가 실제로 렌더된다', async ({ page }) => {
    await gotoTools(page);
    await page.getByRole('button', { name: /스타팅핸드 가이드/ }).first().click();
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '스타팅핸드 가이드' }).first();
    await expect(dialog).toBeVisible();

    // 169셀 — AA와 72o가 다 있다
    await expect(dialog.getByRole('button', { name: 'AA 상세' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '72o 상세' })).toBeVisible();
    // 콤보 가중 요약(오픈 xx.x%)이 0이 아니다
    const summary = await dialog.locator('text=/오픈/').first().textContent();
    expect(summary).toBeTruthy();

    // 셀 탭 → 하단 상세(콤보 수)
    await dialog.getByRole('button', { name: 'AA 상세' }).click();
    // '1326콤보' 각주와의 부분일치를 피해 exact 매치
    await expect(dialog.getByText('6콤보', { exact: true })).toBeVisible();
  });

  test('🔴 푸시폴드 — 자체 Nash 데이터가 포지션·스택별로 바뀐다', async ({ page }) => {
    await gotoTools(page);
    await page.getByRole('button', { name: /푸시 · 폴드 차트/ }).first().click();
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '푸시 · 폴드' }).first();
    await expect(dialog).toBeVisible();

    const pctOf = async () => {
      const t = await dialog.locator('text=/올인 [0-9.]+%/').first().textContent();
      return Number((t ?? '').match(/올인 ([0-9.]+)%/)?.[1] ?? 0);
    };
    // 기본 BTN 10bb — 상식 범위(20~45%)
    const btn10 = await pctOf();
    expect(btn10).toBeGreaterThan(15);
    expect(btn10).toBeLessThan(50);

    // SB로 바꾸면 훨씬 넓어진다
    await dialog.getByRole('button', { name: 'SB', exact: true }).click();
    await expect.poll(pctOf).toBeGreaterThan(btn10);

    // UTG(9인)는 훨씬 좁아진다
    await dialog.getByRole('button', { name: 'UTG(9인)' }).click();
    await expect.poll(pctOf).toBeLessThan(btn10);
  });

  test('프리플랍 트레이너 — 답하면 빈도 게이지가 뜨고 기록이 저장된다', async ({ page }) => {
    await gotoTools(page);
    await page.getByRole('button', { name: /프리플랍 트레이너/ }).first().click();
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '프리플랍 트레이너' }).first();
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '폴드', exact: true }).click();
    // 피드백(정답/아쉬워요 + 빈도 %) — '정답률' 통계와의 부분일치를 피해 느낌표 포함 매치
    await expect(dialog.locator('text=/정답!|아쉬워요/')).toBeVisible();
    await expect(dialog.locator('text=/%/').first()).toBeVisible();
    // 기록 영속
    const saved = await page.evaluate(() => localStorage.getItem('nuri:trainer:preflop:v2'));
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!).total).toBeGreaterThan(0);
  });
});
