// Phase 17-5 게이트 — 기내모드 왕복: 오프라인 배너 표시 → 캐시 화면 유지 → 재연결 자동 복구.
// 홀덤펍은 지하 매장이 많다 — 네트워크 단절이 일상 운영 조건이라는 전제의 검증.
import { test, expect } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

test('🔴 기내모드 왕복 — 배너 표시·화면 유지·재연결 시 배너 소멸', async ({ page, context }) => {
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.waitForTimeout(1500); // 첫 데이터 + 스냅샷 기록

  await context.setOffline(true);
  await expect(page.locator('text=오프라인 — 저장된 정보'), '오프라인 배너가 안 뜬다').toBeVisible({ timeout: 5_000 });
  // 화면이 살아 있어야 한다(캐시 퍼스트) — 루트가 비거나 에러 전면화면이면 실패
  await expect(page.locator('#root')).not.toBeEmpty();

  await context.setOffline(false);
  await expect(page.locator('text=오프라인 — 저장된 정보'), '재연결 후에도 배너가 남아 있다').toBeHidden({ timeout: 5_000 });
});
