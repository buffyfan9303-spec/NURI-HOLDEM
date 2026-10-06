// audit10 P3-3(2026-10-07) — 딜러 구인 지원서 도착 알림(20261007c, link '/dealer')을 누르면 커뮤니티 '딜러' 하위탭이 열린다.
//   서버 쪽(알림 생성·도배 방지·연락처 미포함)은 supabase/tests/20261007c_rehearsal.sql 이 라이브 롤백 리허설로 잰다.
//   여기서는 소비 화면: 알림 패널 클릭 · 푸시 부팅(?nl=/dealer) 두 경로가 같은 처리기(App.handleNavigateNotification)로 딜러 탭에 도착하는가.
//   목 로그인(운영 쓰기 0) + 알림 목록 목.
import { test, expect } from './_fixtures';
import { bootOwner } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const NOTIF = {
  id: '00000000-0000-4000-8000-00000000d0a1', user_id: '00000000-0000-4000-8000-0000000000ee', type: 'system',
  title: '📋 구인글에 지원서가 도착했어요', message: '딜러 게시판 구인글에 새 지원서가 왔어요 — 글을 열어 받은 지원서를 확인하세요',
  read: false, link: '/dealer', avatar_text: '📋', avatar_color: null, created_at: new Date().toISOString(), is_ad: false,
};

test('🔴 P3-3 알림 패널 — 지원서 도착 알림을 누르면 커뮤니티 딜러 하위탭이 열린다', async ({ page }) => {
  await bootOwner(page, {
    viewport: { width: 390, height: 844 }, profile: { role: 'user', venue_id: null }, goto: false,
    extra: async (p) => { await p.route(/\/rest\/v1\/notifications\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([NOTIF])) : r.fallback())); },
  });
  await page.goto('/');
  await page.locator('button[aria-label^="알림"]').first().click();
  const item = page.getByText(NOTIF.title, { exact: true });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();
  await expect(page.locator('[data-testid="sec-tab-dealer"]'), '딜러 하위탭이 열리지 않았다').toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect(page.locator('main[data-tab="community"]')).toBeVisible();
});

test('🔴 P3-3 푸시 부팅 ?nl=/dealer — 같은 처리기로 딜러 하위탭에 도착한다', async ({ page }) => {
  await bootOwner(page, { viewport: { width: 390, height: 844 }, profile: { role: 'user', venue_id: null }, goto: false });
  await page.goto('/?nl=%2Fdealer');
  await expect(page.locator('[data-testid="sec-tab-dealer"]'), '딜러 하위탭이 열리지 않았다').toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
});
