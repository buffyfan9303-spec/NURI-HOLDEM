import { test } from '@playwright/test';
import fs from 'node:fs';

// 사용설명서용 실화면 스크린샷 캡처(문서 전용, 앱 변이 없음 — 화면 진입/모달 오픈까지만).
//   실행: E2E_EMAIL=test1@nuriholdem.com E2E_PASSWORD=... npx playwright test e2e/capture-manual-shots.spec.ts --project=mobile-chromium
//   결과: public/guide/shots/*.png (390px 폭). 자격 미설정 시 공개 화면만 캡처.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const OUT = 'public/guide/shots';

test.use({ viewport: { width: 390, height: 850 } });

async function skipOnboarding(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('nuri_onboarding_v1', '1'); } catch { /* noop */ }
    // 캡처 전용: Playwright 새 페이지는 history.length=1이라 모달 열림 직후 backstack이 닫아버림
    // (실사용자는 앱을 돌아다닌 뒤라 무관 — 프로덕션 클릭으로 정상 확인함). back-close만 무력화.
    try { history.back = () => {}; history.go = () => {}; } catch { /* noop */ }
  });
}
async function shot(page: import('@playwright/test').Page, name: string, fullPage = true) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}
async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const email = page.getByPlaceholder('you@example.com');
  // 모달이 바로 안 열릴 수 있어 최대 4회 재시도
  for (let i = 0; i < 4 && await email.count() === 0; i++) {
    await page.getByRole('button', { name: '로그인' }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  await email.waitFor({ state: 'visible', timeout: 8_000 });
  await email.fill(EMAIL!);
  const pw = page.getByPlaceholder('••••••••').first();
  await pw.fill(PASSWORD!);
  await pw.press('Enter');
  await email.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
async function gotoSection(page: import('@playwright/test').Page, label: string) {
  // 모바일 아코디언 트리거(현재 섹션 셰브론) 클릭 → 항목 클릭
  const trigger = page.locator('button:has(svg)').filter({ hasText: /^(대시보드|포스터·예약|게임 프리셋|장부|통계|순위 입력|매장 랭킹|연합 리그|클락|출근 관리|매장이용권\/QR|매장 꾸미기|직원 관리|설정)/ }).first();
  if (await trigger.count()) { await trigger.click().catch(() => {}); await page.waitForTimeout(300); }
  const item = page.getByRole('button', { name: label, exact: true }).first();
  if (await item.count()) { await item.click().catch(() => {}); await page.waitForTimeout(900); return true; }
  return false;
}

test('공개 화면 캡처(비로그인)', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('/');
  await page.waitForTimeout(1800);
  await shot(page, 'pub-01-browse');
  // 지난 대회 → 상세
  const past = page.getByText('5to1200').first();
  if (await past.count()) { await past.click().catch(() => {}); await page.waitForTimeout(1200); await shot(page, 'pub-02-detail'); }
});

test('업주 화면 캡처(로그인)', async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 미설정');
  test.setTimeout(150_000);
  await skipOnboarding(page);
  await login(page);

  // 내 매장 진입
  const myStore = page.getByRole('button', { name: '내 매장', exact: true }).first();
  await myStore.click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, 'own-01-dashboard');

  const sections: [string, string][] = [
    ['포스터·예약', 'own-02-posters'],
    ['게임 프리셋', 'own-03-presets'],
    ['장부', 'own-04-ledger'],
    ['통계', 'own-05-stats'],
    ['순위 입력', 'own-06-ranking'],
    ['매장 랭킹', 'own-07-venuerank'],
    ['클락', 'own-08-clock'],
    ['매장이용권/QR', 'own-09-voucher'],
    ['매장 꾸미기', 'own-10-decorate'],
    ['직원 관리', 'own-11-staff'],
    ['설정', 'own-12-settings'],
  ];
  for (const [label, name] of sections) {
    const ok = await gotoSection(page, label);
    if (ok) await shot(page, name);
  }

  // 포스터 폼 모달
  await gotoSection(page, '포스터·예약');
  const addBtn = page.getByRole('button', { name: /\+ 새 게임|첫 게임 등록/ }).first();
  if (await addBtn.count()) { await addBtn.click().catch(() => {}); await page.waitForTimeout(1000); await shot(page, 'own-13-poster-form'); }
});
