// F1(2026-10-03 재점검) — 글 상세가 열린 직후 `…` 메뉴를 누르면 열렸다가 곧바로 닫혔다.
//
// 원인(이벤트 순서 실측, 30회 중 2회 재현):
//   click summary → open=true → **18ms 뒤** focusout(summary, rel=닫기) → details onBlur → closeMenu() → open=false.
//   포커스를 '닫기'로 옮긴 것은 atoms/useDialogFocus 의 첫 포커스 타이머(열리고 50ms 뒤)다 —
//   사용자가 그 50ms 안에 창 안을 누르면 그 포커스를 덮어썼다. Modal·EventPage·EventListPage·GroupPage·VenuePage 공통.
//
// 50ms 창은 Playwright 로 맞추기 어려워(그래서 간헐이었다) **그 타이머 하나만** 1.5초로 늘려 창을 결정적으로 만든다.
//   늘린 타이머가 실제로 걸리고 실행됐는지(`__dlgTimer`)를 먼저 단언한다 — 안 걸리면 공허한 통과다.
// 세션은 가짜(로컬), 외부 요청은 하나도 continue 하지 않는다. 운영 쓰기 0.
import { test, expect, type Page, type Route } from '@playwright/test';
import { SUPABASE_URL } from './_session';
import { LEGAL_VERSION } from '../src/lib/legalVersion';

const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '00000000-0000-4000-8000-0000000000r1';
const AUTHOR = '00000000-0000-4000-8000-0000000000a1';
const me = {
  access_token: [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.'),
  refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'reader@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};
const meProfile = {
  id: UID, name: '읽는사람이름', nickname: '읽는사람', email: 'reader@example.com', role: 'user', approved: false, status: 'active',
  venue_id: null, activity_points: 0, joined_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z',
  agreed_to_terms: true, consented_legal_version: LEGAL_VERSION,
};
const TITLE = '메뉴 경합 점검용 글';
const post = {
  id: 'pm-1', user_id: AUTHOR, user_name: '작성자', user_role: 'user', user_color: '#8B5CF6', user_avatar: null,
  content: '[화면 점검용 예시 글입니다.] 메뉴가 열린 채로 있어야 합니다.', created_at: '2026-10-01T09:00:00Z',
  like_count: 0, comment_count: 0, view_count: 3, category: 'free', title: TITLE, images: [], badbeat_count: 0,
  goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
};
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const STRETCH = 1500;

async function openDetail(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error('baseURL 이 없다');
  const ORIGIN = new URL(baseURL).origin;
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } },
    [`sb-${REF}-auth-token`, JSON.stringify(me)] as [string, string]);
  // useDialogFocus 의 첫 포커스 타이머(50ms, 본문에 preventScroll 이 있는 콜백)만 늘린다.
  await page.addInitScript((ms) => {
    type ST = (fn: unknown, delay?: number, ...rest: unknown[]) => number;
    const w = window as unknown as { __dlgTimer: { set: number; fired: number }; setTimeout: ST };
    w.__dlgTimer = { set: 0, fired: 0 };
    const orig = w.setTimeout.bind(window);
    w.setTimeout = (fn, delay, ...rest) => {
      if (delay === 50 && typeof fn === 'function' && String(fn).includes('preventScroll')) {
        w.__dlgTimer.set++;
        const f = fn as (...a: unknown[]) => void;
        return orig((...a: unknown[]) => { f(...a); w.__dlgTimer.fired++; }, ms, ...rest);
      }
      return orig(fn, delay, ...rest);
    };
  }, STRETCH);
  await page.context().route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    // ── 외부. **절대 continue 하지 않는다.**
    if (/\/auth\/v1\//.test(url)) return json(route, me.user);
    if (/\/rest\/v1\/profiles\?/.test(url) && req.method() === 'GET') return json(route, meProfile);
    if (/\/rest\/v1\/community_posts\?/.test(url)) return json(route, [post]);
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, body: '' });
    if (req.method() !== 'GET') return route.fulfill({ status: 201, body: '' });
    return json(route, []);
  });
  await page.goto('/?tab=community');
  const bar = page.locator('[data-community-secbar]');
  await expect(bar, '커뮤니티 하위탭 바가 없다').toBeVisible({ timeout: 25_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await page.getByText(TITLE).filter({ visible: true }).first().click();
  await expect(page.locator('[data-pd-root]'), '게시글 상세가 열리지 않았다').toBeVisible({ timeout: 15_000 });
  const t = await page.evaluate(() => (window as unknown as { __dlgTimer: { set: number; fired: number } }).__dlgTimer);
  expect(t.set, '첫 포커스 타이머를 못 잡았다 — 창이 안 늘어나 이 스펙은 아무것도 재지 않는다').toBeGreaterThanOrEqual(1);
  expect(t.fired, '타이머가 벌써 돌았다 — 사용자 동작이 창 안에 들어가지 않는다').toBe(0);
}

const timerFired = (page: Page) => expect.poll(
  () => page.evaluate(() => (window as unknown as { __dlgTimer: { fired: number } }).__dlgTimer.fired),
  { message: '첫 포커스 타이머가 끝내 안 돌았다', timeout: STRETCH + 3_000 },
).toBeGreaterThanOrEqual(1);

const summary = (page: Page) => page.locator('summary[aria-label="게시글 메뉴"]');
const details = (page: Page) => page.locator('details:has(> summary[aria-label="게시글 메뉴"])');
const isOpen = (page: Page) => details(page).evaluate((e) => (e as HTMLDetailsElement).open);

test.describe('F1 · 게시글 메뉴 — 창이 열린 직후 눌러도 닫히지 않는다', () => {
  test('클릭: 첫 포커스 타이머 전에 연 메뉴가 타이머 뒤에도 열려 있고 신고까지 간다', async ({ page, baseURL }) => {
    await openDetail(page, baseURL);
    await summary(page).click();
    expect(await isOpen(page), '메뉴가 아예 안 열렸다').toBe(true);
    await timerFired(page);
    await page.waitForTimeout(100);
    expect(await isOpen(page), '첫 포커스 타이머가 포커스를 뺏어 메뉴가 닫혔다(F1 재발)').toBe(true);
    await page.getByRole('button', { name: '신고', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('button', { name: '신고 접수', exact: true }), '신고 시트가 안 열렸다').toBeVisible();
  });

  test('실제 터치(CDP 100ms 홀드): 타이머 전에 뗀 탭으로 연 메뉴가 유지된다', async ({ page, baseURL }) => {
    await openDetail(page, baseURL);
    const box = await summary(page).boundingBox();
    if (!box) throw new Error('메뉴 버튼 위치를 못 읽었다');
    const p = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await page.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => isOpen(page), { message: '터치로 메뉴가 안 열렸다' }).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __dlgTimer: { fired: number } }).__dlgTimer.fired),
      '터치가 타이머 뒤에 끝났다 — 경합 창 밖이라 이 단언은 공허하다').toBe(0);
    await timerFired(page);
    await page.waitForTimeout(100);
    expect(await isOpen(page), '첫 포커스 타이머가 포커스를 뺏어 메뉴가 닫혔다(F1 재발, 터치)').toBe(true);
  });

  test('양성 대조: 아무것도 안 누르면 첫 포커스는 종전대로 창 안 첫 버튼(닫기)으로 간다', async ({ page, baseURL }) => {
    await openDetail(page, baseURL);
    await timerFired(page);
    await expect(page.locator('[role="dialog"]').getByRole('button', { name: '닫기' }).first()).toBeFocused();
  });

  test('양성 대조: Escape · 바깥 탭 · 포커스 이탈(Shift+Tab)로는 여전히 닫힌다', async ({ page, baseURL }) => {
    await openDetail(page, baseURL);
    await timerFired(page);
    const root = page.locator('[data-pd-root]');

    await summary(page).click();
    expect(await isOpen(page)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await isOpen(page), 'Escape 로 메뉴가 안 닫혔다').toBe(false);
    await expect(root, 'Escape 가 글 상세까지 닫았다').toBeVisible();

    await summary(page).click();
    expect(await isOpen(page)).toBe(true);
    await root.getByText(TITLE).first().click();
    expect(await isOpen(page), '바깥 탭으로 메뉴가 안 닫혔다').toBe(false);

    await summary(page).focus();
    await page.keyboard.press('Enter');
    expect(await isOpen(page), 'Enter 로 메뉴가 안 열렸다').toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => isOpen(page), { message: '포커스가 메뉴 밖으로 나갔는데 안 닫혔다' }).toBe(false);
  });
});
