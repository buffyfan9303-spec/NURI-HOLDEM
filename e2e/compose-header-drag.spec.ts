// 글쓰기 시트 — 헤더 줄(제목·닫기 행)에서도 아래로 끌어 닫는다(오너 2026-10-06).
//   "아래로 슬라이드해서 내리려면 맨 위 흰 줄(그랩 핸들)까지 가야만 된다. 조금 공간을 내려줘."
//   종전: 글쓰기 시트는 끌 수 있는 곳이 그립 래퍼(≈17px) 한 줄뿐이었다 — 헤더는 '작성 중인 시트' 라 드래그를 안 붙였다.
//   지금: confirmClose(작성 중 닫기 확인)가 있는 시트는 헤더도 그립이다 — 던지기 전에 확인을 묻기 때문에 쓰던 글이 안 날아간다.
//   본문(입력칸·버튼)은 여전히 끌어도 안 닫힌다.
// 손가락은 CDP Input.dispatchTouchEvent(실제 터치 시퀀스) — Playwright click/tap 은 누름 0ms 라 제스처 부류를 못 잰다.
// 세션은 가짜(로컬), 외부 요청은 하나도 continue 하지 않는다. 운영 쓰기 0. (부트는 write-close-confirm.spec 과 같은 문법)
// 음성 대조: Modal.tsx 헤더의 sheetTouch 조건에서 `|| !!confirmClose` 를 빼면 ①·①b 가 실패한다.
import { test, expect, type Page, type Route } from '@playwright/test';
import { SUPABASE_URL } from './_session';

const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '00000000-0000-4000-8000-0000000000c6';
const me = {
  access_token: [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.'),
  refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'drag@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};
const meProfile = {
  id: UID, name: '끄는사람이름', nickname: '끄는사람', email: 'drag@example.com', role: 'user', approved: true, status: 'active',
  venue_id: null, activity_points: 0, joined_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z',
  agreed_to_terms: true, consented_legal_version: 2,
};
const TITLE = '헤더 끌기 점검용 글';
const post = {
  id: 'hd-1', user_id: '00000000-0000-4000-8000-0000000000a6', user_name: '작성자', user_role: 'user', user_color: '#8B5CF6', user_avatar: null,
  content: '[화면 점검용 예시 글입니다.]', created_at: '2026-10-01T09:00:00Z',
  like_count: 0, comment_count: 0, view_count: 3, category: 'free', title: TITLE, images: [], badbeat_count: 0,
  goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
};
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function boot(page: Page, baseURL: string | undefined, theme: 'dark' | 'light') {
  if (!baseURL) throw new Error('baseURL 이 없다');
  const ORIGIN = new URL(baseURL).origin;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(([k, v, th]) => {
    try { localStorage.setItem(k, v); if (th === 'light') localStorage.setItem('nuri-theme', 'light'); } catch { /* 차단 */ }
  }, [`sb-${REF}-auth-token`, JSON.stringify(me), theme] as [string, string, string]);
  await page.context().route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (/\/auth\/v1\//.test(url)) return json(route, me.user);
    if (/\/rest\/v1\/profiles\?/.test(url) && req.method() === 'GET') return json(route, meProfile);
    if (/\/rest\/v1\/community_posts\?/.test(url)) return json(route, [post]);
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, body: '' });
    if (req.method() !== 'GET') return route.fulfill({ status: 201, body: '' });
    return json(route, []);
  });
  await page.goto('/?tab=community');
  await expect(page.locator('html'), '테마 클래스가 안 붙었다').toHaveClass(theme === 'light' ? /\blight\b/ : /\bdark\b/);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar, '커뮤니티 하위탭 바가 없다').toBeVisible({ timeout: 25_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await expect(page.getByText(TITLE).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
}

const sheet = (page: Page) => page.getByRole('dialog', { name: '글쓰기' });
const titleBox = (page: Page) => sheet(page).getByPlaceholder('제목을 입력하세요');
async function open(page: Page) {
  await page.getByTestId('board-write').filter({ visible: true }).first().click();
  await expect(sheet(page), '글쓰기 시트가 안 열렸다').toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500); // 열림 애니(sheet-up)·첫 포커스가 지나간 뒤
}
const sheetY = (page: Page) => sheet(page).evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m42);

/** 시트 안 지점. where: grip(그립 래퍼) · header(헤더 줄의 빈 가운데) · title(제목 글자) · input(제목 입력칸).
 *  elementFromPoint 로 그 지점이 실제로 그 요소인지(가려지지 않았는지)까지 확인해 돌려준다. */
async function point(page: Page, where: 'grip' | 'header' | 'title' | 'input') {
  const p = await page.evaluate((w) => {
    const d = document.querySelector('[role="dialog"][aria-labelledby="modal-title"]') as HTMLElement | null;
    if (!d) return null;
    const el = (w === 'grip' ? d.firstElementChild
      : w === 'header' ? d.querySelector('header')
      : w === 'title' ? d.querySelector('#modal-title')
      : d.querySelector('input[placeholder="제목을 입력하세요"]')) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.round(w === 'title' ? r.left + Math.min(12, r.width / 2) : r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, ok: !!hit && (hit === el || el.contains(hit)), h: Math.round(r.height * 100) / 100 };
  }, where);
  expect(p, `${where} 지점을 못 찾았다`).not.toBeNull();
  expect(p!.ok, `${where} 지점이 다른 요소에 가려졌다`).toBe(true);
  return p!;
}

/** 천천히 끄는 실제 손가락: touchStart → (100ms 누름) → 20회 × 12px(각 30ms) 아래로 → 중간 위치 기록 → touchEnd. */
async function slowPull(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(100);
  for (let i = 1; i <= 20; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 12 * i }] });
    await page.waitForTimeout(30);
  }
  const mid = await sheetY(page).catch(() => -1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return mid;
}
/** 실제 손가락 탭: touchStart → 120ms → touchEnd(이동 0). */
async function touchTap(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`글쓰기 시트 헤더 끌기 — ${theme}`, () => {
    test(`① 헤더 줄에서 천천히 끌면 손가락을 따라 내려가 닫히고, ② 그립도 그대로 닫힌다, ⑤ 다시 열기·뒤로 정상`, async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      await boot(page, baseURL, theme);
      let asked = 0;
      page.on('dialog', (d) => { asked++; void d.dismiss(); });

      // ① 헤더 빈 가운데
      await open(page);
      const h = await point(page, 'header');
      const midH = await slowPull(page, h.x, h.y);
      console.log(`[${theme}] header h=${h.h} mid translateY=${midH}`);
      expect(midH, `헤더에서 끌었는데 시트가 따라오지 않았다(translateY=${midH})`).toBeGreaterThan(150);
      await expect(sheet(page), '헤더에서 끌어 놓았는데 안 닫혔다').toHaveCount(0, { timeout: 5_000 });

      // ① 제목 글자 위에서 시작해도 같다
      await open(page);
      expect(Math.abs(await sheetY(page)), '다시 연 시트가 제자리(0)가 아니다').toBeLessThanOrEqual(1);
      const t = await point(page, 'title');
      const midT = await slowPull(page, t.x, t.y);
      console.log(`[${theme}] title mid translateY=${midT}`);
      expect(midT).toBeGreaterThan(150);
      await expect(sheet(page), '제목 글자에서 끌어 놓았는데 안 닫혔다').toHaveCount(0, { timeout: 5_000 });

      // ② 그립(종전 경로)
      await open(page);
      const g = await point(page, 'grip');
      const midG = await slowPull(page, g.x, g.y);
      console.log(`[${theme}] grip h=${g.h} mid translateY=${midG}`);
      expect(midG).toBeGreaterThan(150);
      await expect(sheet(page), '그립에서 끌어 놓았는데 안 닫혔다').toHaveCount(0, { timeout: 5_000 });
      expect(asked, '빈 창인데 확인을 물었다').toBe(0);

      // ⑤ 끌어 닫기 3번 뒤의 뒤로가기 = '게시판' 을 누르기 전 하위탭(홀덤펍). 시트 칸이 남았으면 이 뒤로가기가 헛돌고
      //   (게시판에 그대로), 칸을 더 소비했으면 탭 밖으로 나간다 — 정확히 한 칸 전으로 가야 한다.
      const bar = page.locator('[data-community-secbar]');
      await page.goBack();
      await expect(bar.getByRole('button', { name: '홀덤펍', exact: true }), '끌어 닫은 뒤 뒤로가기가 한 칸 전(홀덤펍)으로 가지 않았다')
        .toHaveAttribute('aria-pressed', 'true');
      // 재방문 → 다시 열기 → 뒤로가기로 닫힘
      await bar.getByRole('button', { name: '게시판', exact: true }).click();
      await open(page);
      expect(Math.abs(await sheetY(page))).toBeLessThanOrEqual(1);
      await page.goBack();
      await expect(sheet(page), '뒤로가기로 안 닫혔다').toHaveCount(0, { timeout: 5_000 });
    });

    test(`①b 쓴 글이 있으면 헤더로 끌어도 먼저 묻고(취소=제자리), ③ 입력칸에서 끌면 안 움직인다, ④ 탭은 그대로`, async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      await boot(page, baseURL, theme);
      let asked = 0;
      page.on('dialog', (d) => { asked++; void d.dismiss(); });
      await open(page);
      await titleBox(page).fill('끌어도 남아야 하는 제목');

      // ③ 입력칸 위에서 시작한 손짓 — 시트가 움직이지 않고 값이 남는다
      const i = await point(page, 'input');
      const midI = await slowPull(page, i.x, i.y);
      console.log(`[${theme}] input mid translateY=${midI}`);
      expect(Math.abs(midI), `입력칸에서 끌었는데 시트가 움직였다(translateY=${midI})`).toBeLessThanOrEqual(1);
      await page.waitForTimeout(400);
      await expect(sheet(page)).toBeVisible();
      await expect(titleBox(page)).toHaveValue('끌어도 남아야 하는 제목');
      expect(asked, '입력칸 손짓에 닫기 확인이 떴다').toBe(0);

      // ①b 헤더로 끌어 던짐 → 확인(취소) → 제자리 · 값 유지
      const h = await point(page, 'header');
      await slowPull(page, h.x, h.y);
      await expect.poll(() => asked, '헤더로 끌어 놓았는데 확인을 묻지 않았다').toBe(1);
      await page.waitForTimeout(700);
      await expect(sheet(page)).toBeVisible();
      await expect(titleBox(page)).toHaveValue('끌어도 남아야 하는 제목');
      expect(Math.abs(await sheetY(page)), '취소했는데 시트가 제자리로 안 돌아왔다').toBeLessThanOrEqual(1);

      // ④ 헤더 닫기 버튼 손가락 탭 — 드래그로 오인되지 않고 클릭이 간다(쓴 글이 있으니 확인이 뜬다)
      const x = await sheet(page).getByRole('button', { name: '닫기' }).first().boundingBox();
      await touchTap(page, Math.round(x!.x + x!.width / 2), Math.round(x!.y + x!.height / 2));
      await expect.poll(() => asked, '닫기 버튼 탭이 클릭으로 가지 않았다').toBe(2);
      await page.waitForTimeout(400);
      await expect(sheet(page)).toBeVisible();

      // ④ 본문 버튼 탭(분류 칩) — 선택이 바뀐다
      const chips = sheet(page).locator('button[aria-pressed]');
      const n = await chips.count();
      expect(n, '분류 칩(aria-pressed)이 없다 — 셀렉터가 바뀌었나').toBeGreaterThan(1);
      let target = -1;
      for (let k = 0; k < n; k++) if ((await chips.nth(k).getAttribute('aria-pressed')) === 'false') { target = k; break; }
      expect(target).toBeGreaterThanOrEqual(0);
      const cb = await chips.nth(target).boundingBox();
      await touchTap(page, Math.round(cb!.x + cb!.width / 2), Math.round(cb!.y + cb!.height / 2));
      await expect(chips.nth(target), '본문 버튼 탭이 안 먹었다').toHaveAttribute('aria-pressed', 'true');
      await expect(titleBox(page)).toHaveValue('끌어도 남아야 하는 제목');
    });
  });
}
