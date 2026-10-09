// 이용약관 제3판 — 재동의는 판 시행일(= 정식 오픈일, 2026-10-06 오너 결정)부터 차단한다(legal-full-1006 P2-2).
//
// 왜: LEGAL_VERSION 을 3 으로 올리는 순간, 옛 판정(`오늘 >= 제2판 시행일 ? 차단`)이면 **배포 당일 제2판 동의자 전원**이
//   '개정 약관 동의' 차단 게이트에 막힌다(시행 전이어도). 시행일 전에는 제2판 동의를 유효로 보고(차단 없음),
//   시행일 KST 0시부터 게이트로 명시 동의를 받는다 — 계속 이용만으로 동의한 것으로 보지 않는다(약관 제16조③ 단서).
// 재현: 같은 제2판 동의 회원(stubLogin)을 브라우저 시계만 바꿔 두 번 연다(page.clock.setFixedTime — 타이머는 그대로 돈다).
// 음성 대조: src/lib/legalVersion.ts legalConsentStage 를 옛 식으로 되돌리면 ① 이 게이트를 보고 실패한다.
// 운영 DB 에 쓰지 않는다 — 세션·프로필은 stubLogin(page.route).
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';
import { TERMS_V3_EFFECTIVE_ISO, TERMS_V3_EFFECTIVE_DATE, TERMS_V4_EFFECTIVE_ISO, TERMS_V4_EFFECTIVE_DATE } from '../src/lib/legalDeploy';

const prevDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

async function open(page: import('@playwright/test').Page, at: string, consented: number) {
  await page.clock.setFixedTime(new Date(at));
  await stubLogin(page, { consented_legal_version: consented });
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const profileSeen = page.waitForResponse((r) => /\/rest\/v1\/profiles\?/.test(r.url()), { timeout: 15_000 });
  await page.goto('/');
  await profileSeen;
  return page.locator('[role="dialog"]').filter({ has: page.getByRole('heading', { name: '개정 약관 동의' }) });
}

test('① 시행 전날 23:50 KST — 제2판 동의 회원은 차단 게이트 없이 앱을 쓴다', async ({ page }) => {
  for (const at of [`${prevDay(TERMS_V3_EFFECTIVE_ISO)}T23:50:00+09:00`]) {
    const gate = await open(page, at, 2);
    // 프로필이 도착한 뒤 게이트가 뜰 시간을 준다(첫 화면 번들에 있는 모달이라 즉시 뜬다 — ② 가 양성 대조).
    await page.waitForTimeout(1500);
    await expect(gate, `${at}: 시행 전인데 재동의 차단 게이트가 떴다`).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '하단 내비게이션' })).toBeVisible();
  }
});

test('② 시행일 00:10 KST — 제2판 동의 회원에게 차단 게이트가 뜨고 제3판 시행일을 말한다', async ({ page }) => {
  const gate = await open(page, `${TERMS_V3_EFFECTIVE_ISO}T00:10:00+09:00`, 2);
  await expect(gate, '시행일이 지났는데 재동의 게이트가 없다 — 계속 이용이 곧 동의가 된다').toBeVisible({ timeout: 10_000 });
  await expect(gate).toContainText(`개정 약관이 ${TERMS_V3_EFFECTIVE_DATE}부터 시행되었습니다.`);
});

test('③ 양성 대조 — 시행일이어도 제3판 동의 회원에게는 게이트가 없다', async ({ page }) => {
  const gate = await open(page, `${TERMS_V3_EFFECTIVE_ISO}T00:10:00+09:00`, 3);
  await page.waitForTimeout(1500);
  await expect(gate).toHaveCount(0);
});

// 제4판(제11조제4항, audit12 UP-20) — 회원에게 불리한 변경이라 공지 30일 뒤 시행일부터 제3판 동의자 차단(제16조제3항 단서).
test('④ 제4판 시행 전날 23:50 KST — 제3판 동의 회원은 차단 게이트 없이 앱을 쓴다', async ({ page }) => {
  const gate = await open(page, `${prevDay(TERMS_V4_EFFECTIVE_ISO)}T23:50:00+09:00`, 3);
  await page.waitForTimeout(1500);
  await expect(gate, '제4판 시행 전인데 재동의 차단 게이트가 떴다').toHaveCount(0);
});

test('⑤ 제4판 시행일 00:10 KST — 제3판 동의 회원에게 게이트가 뜨고 제4판 시행일을 말한다', async ({ page }) => {
  const gate = await open(page, `${TERMS_V4_EFFECTIVE_ISO}T00:10:00+09:00`, 3);
  await expect(gate, '제4판 시행일이 지났는데 재동의 게이트가 없다').toBeVisible({ timeout: 10_000 });
  await expect(gate).toContainText(`개정 약관이 ${TERMS_V4_EFFECTIVE_DATE}부터 시행되었습니다.`);
});
