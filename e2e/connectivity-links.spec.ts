// CONNECTIVITY-ALL(오너 2026-09-24) — 알림·링크·뒤로가기가 **약속한 화면까지** 가는가.
//
// 감사(root-cause 크롤, 2026-09-24)에서 실측된 끊김 5종을 잠근다. 전부 '수정 전 빌드 FAIL / 수정 후 PASS' 로 음성 대조했다.
//   ① 푸시 알림 클릭 — sw.js toAppLink 가 모르는 경로(/posts/<id> · /wallet · /my-store/ledger …)를 그대로 하드 이동 →
//      앱엔 경로 라우터가 없어 **홈에 떨어졌다**. 이제 /?nl=<원문> 으로 부팅해 알림 패널과 같은 처리기로 연다.
//      앱이 이미 떠 있으면 SW 가 전체 새로고침 대신 메시지(nuri:notif-link)로 넘기고, 앱이 받았다고 답한다.
//   ② 탭 → 다른 탭 → 뒤로가기 — 떠났던 탭이 **맨 위(0)** 로 돌아왔다. 이제 떠날 때 위치로(탭을 직접 누르면 여전히 맨 위).
//   ③ '/staff-schedule'(출근 스케줄 확정) — 처리기가 없어 제목 토스트로 끝났다 → 내 매장 '출근 관리' 판.
//   ⑤ 앱 안 `?post=<id>` 링크 — openInternalLink 에 분기가 없어 **전체 새로고침**으로 떨어졌다.
//   ⑥ 내 정보 →「내 장터 거래」/「순위 · 상점」→ 뒤로가기 — '내 정보' 가 아니라 그 전 탭으로 갔다.
//
// ⚠ ① 의 SW 매핑은 **서빙된 /sw.js 를 받아서** 그 toAppLink 를 그대로 쓴다(베끼면 드리프트한다).
//   실제 푸시 수신·notificationclick 은 헤드리스에서 못 만든다 — 그 경계(SW → client.postMessage)는
//   앱 쪽 수신기를 같은 모양의 MessageEvent 로 두드려 잠근다. 실기기 푸시는 NOT_RUN 이다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stubLogin, dismissOverlays, stabilizeBackstack } from './_session';
import { bootOwner, MOCK_DAY, MOCK_UID } from './_mockOwner';
import { mockSchedules } from './_schedules';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const POST_ID = '7e57c0de-0000-4000-8000-00000000c0a1';
const POST_TITLE = '연결성 검증 글 C0A1';
const postRow = {
  id: POST_ID, user_id: 'u-c0a1', user_name: '작성자', user_role: 'user', user_color: '#888', user_avatar: null,
  content: '본문 C0A1', created_at: '2026-09-02T00:00:00Z', like_count: 0, comment_count: 0, view_count: 0,
  category: 'free', title: POST_TITLE, images: [], badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
};
/** 글 단건·목록 조회를 로컬로 — 운영 글이 지워져도 이 스펙은 흔들리지 않는다. */
async function mockPost(page: Page) {
  await page.route(/\/rest\/v1\/community_posts\?/, (r: Route) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    const byId = /[?&]id=eq\./.test(r.request().url());
    return r.fulfill(json(byId ? (single ? postRow : [postRow]) : []));
  });
}
/** 서명 없는 스텁 토큰은 서버가 401 — 읽기는 Authorization 을 빼서 anon 으로. ⚠ stubLogin **보다 먼저** 건다(나중 route 가 이긴다). */
async function anonReads(page: Page) {
  await page.route(/\/rest\/v1\//, async (r) => {
    const h = { ...r.request().headers() }; delete h['authorization'];
    return r.continue({ headers: h });
  });
}
/** 전체 새로고침 감지 — 부팅마다 sessionStorage 카운터 +1. */
async function bootCounter(page: Page) {
  await page.addInitScript(() => {
    try { sessionStorage.setItem('__boots', String(Number(sessionStorage.getItem('__boots') || '0') + 1)); } catch { /* noop */ }
  });
}
const boots = (page: Page) => page.evaluate(() => Number(sessionStorage.getItem('__boots') || '0'));
/** 서빙 중인 /sw.js 의 toAppLink 원문. */
async function swToAppLink(page: Page): Promise<(s: string) => string> {
  const sw = await (await page.request.get('/sw.js')).text();
  const src = sw.slice(sw.indexOf('function toAppLink'), sw.indexOf('\n}', sw.indexOf('function toAppLink')) + 2);
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return toAppLink;`)() as (s: string) => string;
}
const visibleTabs = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('[data-tab]')].filter((p) => p.offsetParent !== null).map((p) => p.dataset.tab));
const postOpen = (page: Page) => page.getByRole('group', { name: '게시글 반응' });

test.describe('① 푸시 알림 링크', () => {
  test('🔴 sw.js toAppLink — 경로형은 ?nl=<원문>, 아는 부팅 딥링크·홈·정적 파일은 그대로', async ({ page }) => {
    const to = await swToAppLink(page);
    for (const raw of ['/posts/' + POST_ID, '/wallet', '/support', '/invites', '/staff-schedule', '/my-store/ledger', '/my-store/partners']) {
      expect(to(raw), `${raw} 가 앱이 여는 부팅 경로로 안 바뀌었다 — 푸시를 누르면 홈에 떨어진다`).toBe('/?nl=' + encodeURIComponent(raw));
    }
    expect(to('/schedules/abc')).toBe('/?s=abc');
    expect(to('/community/v1')).toBe('/?venue=v1');
    expect(to('/my-store')).toBe('/?tab=my-store');
    expect(to('/admin')).toBe('/?tab=admin');
    expect(to('/')).toBe('/');
    expect(to('/about.html')).toBe('/about.html');
    expect(to('?tab=tools')).toBe('/?tab=tools');
    expect(to('https://example.com/x')).toBe('https://example.com/x');
  });

  test('🔴 유저: 푸시 /posts/<id> · /wallet 부팅 → 그 글 · 내 정보가 열리고 주소에서 nl 이 지워진다', async ({ page }) => {
    await stabilizeBackstack(page); await anonReads(page); await stubLogin(page); await mockPost(page);
    const to = await swToAppLink(page);
    await page.goto(to('/posts/' + POST_ID));
    await expect(postOpen(page), '푸시 /posts/<id> 가 글을 안 열었다(홈에 떨어짐)').toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(POST_TITLE).first()).toBeVisible();
    expect(await page.evaluate(() => location.search), '1회성 nl 이 주소에 남았다 — 새로고침마다 다시 열린다').not.toContain('nl=');

    await page.goto(to('/wallet'));
    await expect(page.locator('[data-profile-panel]'), '푸시 /wallet 이 내 정보(지갑)를 안 열었다').toBeVisible({ timeout: 20_000 });
  });

  for (const [raw, check] of [
    ['/my-store/ledger', async (p: Page) => { const d = p.getByTestId('ledger-date'); await expect(d, '장부 알림 푸시가 오늘 장부 보드에 안 앉았다').toBeVisible({ timeout: 25_000 }); await expect(d).toHaveValue(MOCK_DAY); }],
    ['/my-store/partners', async (p: Page) => { await expect(p.locator('[data-pane="partners"]'), '파트너 알림 푸시가 파트너 판을 안 열었다').toBeVisible({ timeout: 25_000 }); }],
    ['/staff-schedule', async (p: Page) => { await expect(p.locator('[data-pane="attendance"]'), '출근 스케줄 알림 푸시가 출근 관리 판을 안 열었다').toBeVisible({ timeout: 25_000 }); }],
  ] as const) {
    test(`🔴 업주: 푸시 ${raw} 부팅 → 내 매장의 그 판`, async ({ page }) => {
      test.setTimeout(90_000);
      await bootOwner(page, { goto: false });
      const to = await swToAppLink(page);
      await page.goto(to(raw));
      await expect.poll(() => visibleTabs(page), { timeout: 25_000 }).toContain('my-store');
      await check(page);
    });
  }

  test('🔴 앱이 떠 있을 때 SW 메시지(nuri:notif-link) — 새로고침 없이 열고 받았다고 답한다', async ({ page }) => {
    await bootCounter(page); await stabilizeBackstack(page); await anonReads(page); await stubLogin(page); await mockPost(page);
    await page.goto('/'); await dismissOverlays(page);
    await page.waitForSelector('[data-tab="home"]', { timeout: 20_000 });
    const b0 = await boots(page);
    const send = (link: string) => page.evaluate((l) => new Promise<unknown>((res) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => res('no-reply'), 2500);
      ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data); };
      navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'nuri:notif-link', link: l }, ports: [ch.port2] }));
    }), link);
    expect(await send('/posts/' + POST_ID), '앱이 SW 메시지에 답하지 않았다 — SW 는 전체 새로고침으로 떨어진다').toBe(true);
    await expect(postOpen(page)).toBeVisible({ timeout: 15_000 });
    expect(await send('https://example.com/'), '외부 링크는 앱이 거절해야 SW 가 예전 경로(navigate)로 간다').toBe(false);
    expect(await boots(page), '메시지 경로가 앱을 다시 부팅했다').toBe(b0);
  });
});

test('🔴 ③ 알림 /staff-schedule → 내 매장 출근 관리 판(제목 토스트로 끝나지 않는다)', async ({ page }) => {
  test.setTimeout(90_000);
  await bootOwner(page, { extra: async (p) => {
    await p.route(/\/rest\/v1\/notifications\?/, (r) => r.request().method() === 'GET'
      ? r.fulfill(json([{ id: 'aaaaaaaa-0000-4000-8000-0000000005c1', user_id: MOCK_UID, type: 'system', title: '출근 스케줄 확정', message: 'm', read: false, created_at: new Date().toISOString(), link: '/staff-schedule' }]))
      : r.fulfill({ status: 204, body: '' }));
  } });
  await page.locator('button[aria-label^="알림"]').first().click();
  await page.getByRole('tab', { name: '알림', exact: true }).click();
  await page.getByText('출근 스케줄 확정').first().click();
  await expect(page.locator('[data-pane="attendance"]'), '출근 스케줄 알림이 출근 관리 판을 안 열었다').toBeVisible({ timeout: 25_000 });
});

test('🔴 ⑤ 앱 안 ?post=<id> 알림 링크 — 새로고침 없이 글을 연다', async ({ page }) => {
  await bootCounter(page); await stabilizeBackstack(page); await anonReads(page); await stubLogin(page); await mockPost(page);
  await page.route(/\/rest\/v1\/notifications\?/, (r) => r.request().method() === 'GET'
    ? r.fulfill(json([{ id: '11111111-1111-4111-8111-11111111c0a1', user_id: 'x', type: 'system', title: '링크 글 알림', message: 'm', read: false, created_at: new Date().toISOString(), link: `?post=${POST_ID}` }]))
    : r.fulfill({ status: 204, body: '' }));
  await page.goto('/'); await dismissOverlays(page);
  await page.waitForSelector('[data-tab="home"]', { timeout: 20_000 });
  const b0 = await boots(page);
  await page.locator('button[aria-label^="알림"]').first().click();
  await page.getByRole('tab', { name: '알림', exact: true }).click();
  await page.getByText('링크 글 알림').first().click();
  await expect(postOpen(page)).toBeVisible({ timeout: 15_000 });
  expect(await boots(page), '?post= 링크가 앱을 전체 새로고침했다(openInternalLink 에 분기가 없다)').toBe(b0);
});

test.describe('② 탭 → 다른 탭 → 뒤로가기: 떠난 자리로', () => {
  const goTab = (page: Page, t: string) => page.evaluate((tab) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: tab })), t);
  for (const [from, to] of [['home', 'live'], ['community', 'tools']] as const) {
    test(`🔴 ${from} → ${to} → back`, async ({ page }) => {
      await mockSchedules(page); await stabilizeBackstack(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/'); await dismissOverlays(page);
      await page.waitForSelector('[data-tab="home"]', { timeout: 20_000 });
      if (from !== 'home') { await goTab(page, from); await expect.poll(() => visibleTabs(page)).toContain(from); await page.waitForTimeout(800); }
      const max = await page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight);
      await page.evaluate((y) => window.scrollTo(0, y), Math.min(600, max - 20));
      await page.waitForTimeout(500);
      const y0 = await page.evaluate(() => Math.round(scrollY));
      // 전제 — 잴 것이 있어야 한다(맨 위에서 떠나면 '위치 보존' 은 아무것도 단언하지 않는다).
      expect(y0, `${from} 이 스크롤되지 않는다(max ${max}) — 이 검사가 아무것도 재지 않는다`).toBeGreaterThan(150);
      // '보던 자리' = 판이 화면에서 놓인 위치. scrollY 로 재면 안 된다 — 헤더는 인플로우 sticky 라 접힘 상태가 바뀌면
      //   같은 화면이 scrollY 로는 ±12.75px 다르게 나온다(실측: 떠날 때 헤더 61·y 349 → 돌아와 48·y 336, 판 위치는 같다).
      const paneTop = () => page.evaluate((t) => Math.round(document.querySelector(`[data-tab="${t}"]`)!.getBoundingClientRect().top), from);
      const top0 = await paneTop();
      await goTab(page, to);
      await expect.poll(() => visibleTabs(page)).toContain(to);
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => Math.round(scrollY)), '탭을 직접 옮기면 맨 위여야 한다(2026-09-19 지시)').toBe(0);
      await page.evaluate(() => history.back());
      await expect.poll(() => visibleTabs(page)).toContain(from);
      await page.waitForTimeout(700);
      const top1 = await paneTop();
      expect(Math.abs(top1 - top0), `뒤로가기로 돌아온 ${from} 판이 떠날 때(top ${top0}, y ${y0})가 아니라 top ${top1}(y ${await page.evaluate(() => Math.round(scrollY))})에 섰다`).toBeLessThanOrEqual(2);
    });
  }
});

for (const btn of ['내 장터 거래', '순위 · 상점']) {
  test(`🔴 ⑥ 내 정보 → 「${btn}」 → 뒤로가기 = 내 정보`, async ({ page }) => {
    // 2026-09-24: App 트레일 겹 + CommunityTab 외부 지정 섹션 = 진입 섹션 — 첫 뒤로가기로 내 정보가 열린다(수정 전 빌드 FAIL 확인).
    await stabilizeBackstack(page); await anonReads(page); await stubLogin(page);
    await page.goto('/'); await dismissOverlays(page);
    await page.waitForSelector('[data-tab="home"]', { timeout: 20_000 });
    await page.getByRole('button', { name: /메뉴$/ }).first().click();
    await page.getByRole('button', { name: '내 정보 열기' }).click();
    const panel = page.locator('[data-profile-panel]');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: btn }).click();
    await expect(panel).toBeHidden({ timeout: 10_000 });
    await expect.poll(() => visibleTabs(page)).toContain('community');
    await page.waitForTimeout(600);
    await page.evaluate(() => history.back());
    await expect(panel, `「${btn}」 에서 뒤로가기가 내 정보로 안 돌아왔다`).toBeVisible({ timeout: 10_000 });
  });
}
