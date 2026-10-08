// R12-01 (audit12 chain-1008) — 그룹 알림 3종을 앱 안 알림 패널에서 누르면 그룹이 열려야 한다.
//
// 생산자: supabase/migrations/20261002f_group_members_guard_and_notify.sql — 그룹 개설 승인(approval) · 가입 신청(system) ·
//   가입 승인(approval) 의 link 가 전부 '/?venue=<그룹 id>' 다. 이미 쌓인 알림 행이 있어 서버가 아니라 클라이언트가 해석한다
//   (src/lib/notifLink.ts parseVenueLink → App.handleNavigateNotification).
// 수정 전(origin/main d8832ebc): 일반 회원은 '매장 운영자·직원 계정에서만…' 토스트, 업주는 내 매장 탭, system 은 제목 토스트 — 그룹 안 열림.
// 목 로그인·운영 쓰기 0(_fixtures 가드).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, MOCK_UID, MOCK_VENUE } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const G = '55555555-5555-4555-8555-555555555555';
const group = { id: G, name: '테스트 그룹', kind: 'group', region: '서울', address: '', owner_id: MOCK_UID, approved: true, status: 'active', verification_status: null, is_paid_ad: false, display_order: 9, follower_count: 1, rating: 0, page_config: null };
const store = { ...group, id: MOCK_VENUE, kind: 'venue', name: '테스트 홀덤펍' };

/** venues 목록 응답 — 호출 순번마다 다른 목록을 줄 수 있다(방금 승인된 그룹: 부팅 목록엔 없고 재조회엔 있다). */
async function routeVenues(p: Page, lists: unknown[][]) {
  let n = 0;
  await p.route(/\/rest\/v1\/venues\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const u = r.request().url();
    if ((r.request().headers()['accept'] ?? '').includes('pgrst.object')) return r.fulfill(json(u.includes(G) ? group : store));
    const list = lists[Math.min(n, lists.length - 1)]; n++;
    return r.fulfill(json(list));
  });
}

async function clickNotif(page: Page, title: string) {
  await page.locator('button[aria-label^="알림"]').first().click();
  const item = page.getByText(title, { exact: true });
  await expect(item).toBeVisible({ timeout: 15_000 });
  const toasts: string[] = [];
  await page.exposeFunction('__t', (s: string) => toasts.push(s));
  await page.evaluate(() => new MutationObserver(() => {
    document.querySelectorAll('[role=status],[role=alert]').forEach((e) => { const s = (e.textContent ?? '').trim(); if (s) (window as unknown as { __t: (s: string) => void }).__t(s); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true }));
  await item.click();
  return toasts;
}

// 알림 본문에는 그룹 이름을 넣지 않는다 — 열린 알림 패널(role=dialog) 글자가 '그룹 열림' 으로 오판되지 않게.
const groupOpen = (page: Page) => page.evaluate(() =>
  /테스트 그룹/.test([...document.querySelectorAll<HTMLElement>('[role=dialog], [data-venue-page], [data-group-page]')].map((d) => d.textContent ?? '').join(' ')));

const CASES = [
  { who: 'member', type: 'approval', title: '그룹 개설 승인', link: `/?venue=${G}` },
  { who: 'member', type: 'approval', title: '그룹 가입 승인', link: `/?venue=${G}` },
  { who: 'member', type: 'system', title: '그룹 가입 신청', link: `/?venue=${G}` },
  { who: 'owner', type: 'approval', title: '그룹 가입 승인', link: `/?venue=${G}` },
  // 양성 대조: 이미 아는 링크 모양 — 이 검사가 '그룹 열림'을 실제로 본다는 증거
  { who: 'member', type: 'system', title: '대조 community', link: `/community/${G}` },
] as const;

const notifRow = (type: string, title: string, link: string) => ({
  id: '00000000-0000-4000-8000-00000000a12f', user_id: MOCK_UID, type, title, message: 'R12-01 알림 본문', read: false, link,
  avatar_text: null, avatar_color: null, created_at: new Date().toISOString(), is_ad: false,
});

for (const c of CASES) {
  test(`R12-01 알림 패널 · ${c.who} · ${c.type} '${c.title}' → 그룹이 열린다`, async ({ page }) => {
    await bootOwner(page, {
      viewport: { width: 390, height: 844 }, goto: false,
      ...(c.who === 'member' ? { profile: { role: 'user', venue_id: null } } : {}),
      extra: async (p) => {
        await p.route(/\/rest\/v1\/notifications\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([notifRow(c.type, c.title, c.link)])) : r.fallback()));
        await routeVenues(p, [[group, store]]);
      },
    });
    await page.goto('/');
    const toasts = await clickNotif(page, c.title);
    await expect.poll(() => groupOpen(page), { timeout: 5_000, message: `toasts=${toasts.join('|')}` }).toBe(true);
    expect(toasts.join('|')).not.toContain('매장 운영자·직원 계정에서만');
  });
}

test('R12-01 방금 승인된 그룹 — 부팅 목록에 없어도 한 번 다시 받아서 연다', async ({ page }) => {
  await bootOwner(page, {
    viewport: { width: 390, height: 844 }, goto: false, profile: { role: 'user', venue_id: null },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/notifications\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([notifRow('approval', '그룹 개설 승인', `/?venue=${G}`)])) : r.fallback()));
      await routeVenues(p, [[store], [store, group]]);
    },
  });
  await page.goto('/');
  // 부팅 목록(그룹 없음)이 실제로 도착한 뒤에 누른다 — 그래야 '낡은 목록' 갈래를 탄다
  await page.waitForTimeout(1_500);
  const toasts = await clickNotif(page, '그룹 개설 승인');
  await expect.poll(() => groupOpen(page), { timeout: 5_000, message: `toasts=${toasts.join('|')}` }).toBe(true);
  expect(toasts.join('|')).not.toContain('찾을 수 없는');
});

test('R12-01 반례 — 서버에도 없는 그룹이면 열지 않고 안내한다(빈 오버레이 금지)', async ({ page }) => {
  await bootOwner(page, {
    viewport: { width: 390, height: 844 }, goto: false, profile: { role: 'user', venue_id: null },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/notifications\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([notifRow('approval', '그룹 개설 승인', `/?venue=${G}`)])) : r.fallback()));
      await routeVenues(p, [[store]]);
    },
  });
  await page.goto('/');
  await page.waitForTimeout(1_500);
  const toasts = await clickNotif(page, '그룹 개설 승인');
  await expect.poll(() => toasts.join('|'), { timeout: 5_000 }).toContain('찾을 수 없는');
  expect(await groupOpen(page)).toBe(false);
});

test('R12-01 비로그인 — 푸시 원문 링크(/?venue=)로 부팅하면 그룹이 열린다(종전 부팅 딥링크 보존)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routeVenues(page, [[group, store]]);
  await page.goto(`/?venue=${G}`);
  await expect.poll(() => groupOpen(page), { timeout: 15_000 }).toBe(true);
});
