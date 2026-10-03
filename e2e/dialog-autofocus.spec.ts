// 대화상자 autoFocus 존중 + 닫을 때 연 버튼 복귀(2026-10-03 재점검 후속, 리드 결정).
//
// 실측된 결함(수정 전 빌드):
//   ① 글쓰기 시트를 열면 '내용' 칸(autoFocus)에 포커스가 갔다가 ~58ms 뒤 atoms/useDialogFocus 의 첫 포커스 타이머가
//      '닫기'로 뺏었다 — 작성자가 의도한 '열면 바로 입력' 이 죽어 있었다.
//   ② 겹친 창(상세 위 글쓰기): autoFocus 가 커밋되는 순간 아래 상세 창의 되잡기(focusin)가 포커스를 자기 쪽으로 끌어갔다
//      (새 창은 아직 스택에 안 올라가 '맨 위'가 아래 창이었다).
//   ③ 열기 전 포커스(opener)를 effect 에서 읽어 autoFocus 칸(또는 ②에서 끌려간 버튼)으로 기록 → 닫아도 연 버튼으로 안 돌아왔다.
// 세션은 가짜(로컬), 외부 요청은 하나도 continue 하지 않는다. 운영 쓰기 0.
import { test, expect, type Page, type Route } from '@playwright/test';
import { SUPABASE_URL } from './_session';

const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '00000000-0000-4000-8000-0000000000r2';
const AUTHOR = '00000000-0000-4000-8000-0000000000a2';
const me = {
  access_token: [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.'),
  refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'writer@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};
const meProfile = {
  id: UID, name: '쓰는사람이름', nickname: '쓰는사람', email: 'writer@example.com', role: 'user', approved: true, status: 'active',
  venue_id: null, activity_points: 0, joined_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z',
  agreed_to_terms: true, consented_legal_version: 2,
};
const TITLE = '자동 포커스 점검용 글';
const post = {
  id: 'af-1', user_id: AUTHOR, user_name: '작성자', user_role: 'user', user_color: '#8B5CF6', user_avatar: null,
  content: '[화면 점검용 예시 글입니다.]', created_at: '2026-10-01T09:00:00Z',
  like_count: 0, comment_count: 0, view_count: 3, category: 'free', title: TITLE, images: [], badbeat_count: 0,
  goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
};
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
/** 첫 포커스 타이머(50ms)가 확실히 지나간 뒤를 본다. */
const SETTLE = 600;

async function boot(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error('baseURL 이 없다');
  const ORIGIN = new URL(baseURL).origin;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } },
    [`sb-${REF}-auth-token`, JSON.stringify(me)] as [string, string]);
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
  await expect(page.getByText(TITLE).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
}

const form = (page: Page) => page.locator('[role="dialog"]').filter({ has: page.getByPlaceholder('내용을 입력하세요') });
const content = (page: Page) => form(page).getByPlaceholder('내용을 입력하세요');
const writeBtn = (page: Page) => page.getByRole('button', { name: /글쓰기$/ }).filter({ visible: true }).first();
const active = (page: Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null;
  return a ? `${a.tagName}${a.getAttribute('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''}${a.getAttribute('placeholder') ? `(${a.getAttribute('placeholder')})` : ''}` : 'null';
});

test.describe('대화상자 autoFocus 존중 · 닫으면 연 버튼으로', () => {
  test('글쓰기 시트: 열면 내용 칸에 포커스가 남고, Escape 로 닫으면 글쓰기 버튼으로 돌아온다', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    await writeBtn(page).click();
    await expect(form(page), '글쓰기 시트가 안 열렸다').toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(SETTLE);
    await expect(content(page), `첫 포커스 타이머가 autoFocus 칸을 덮었다(지금 포커스: ${await active(page)})`).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(form(page), 'Escape 로 시트가 안 닫혔다').toBeHidden();
    await expect(writeBtn(page), `닫은 뒤 연 버튼으로 안 돌아왔다(지금 포커스: ${await active(page)})`).toBeFocused({ timeout: 3_000 });
  });

  test('글쓰기 시트: 바깥(배경)을 눌러 닫아도 글쓰기 버튼으로 돌아온다', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    await writeBtn(page).click();
    await expect(form(page)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(SETTLE);
    const top = await form(page).boundingBox();
    if (!top || top.y < 40) throw new Error(`시트 위에 배경이 안 남는다(y=${top?.y}) — 바깥 클릭을 잴 수 없다`);
    await page.mouse.click(195, top.y / 2);
    await expect(form(page), '배경 클릭으로 시트가 안 닫혔다').toBeHidden();
    await expect(writeBtn(page), `닫은 뒤 연 버튼으로 안 돌아왔다(지금 포커스: ${await active(page)})`).toBeFocused({ timeout: 3_000 });
  });

  test('겹친 창(게시글 상세 위 글쓰기): autoFocus 칸이 유지되고, 닫으면 상세의 연 버튼으로 돌아온다', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    await page.getByText(TITLE).filter({ visible: true }).first().click();
    const root = page.locator('[data-pd-root]');
    await expect(root, '게시글 상세가 안 열렸다').toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(SETTLE);
    const summary = page.locator('summary[aria-label="게시글 메뉴"]');
    await summary.focus();
    await expect(summary).toBeFocused();
    // 포스터 상세 '대회 후기 쓰기' 와 같은 경로(openPostForm → App 이 글쓰기 시트를 연다).
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:open-post-form', { detail: { category: 'free' } })));
    await expect(form(page), '겹친 글쓰기 시트가 안 열렸다').toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(SETTLE);
    await expect(content(page), `아래 상세 창 또는 첫 포커스 타이머가 autoFocus 칸을 뺏었다(지금 포커스: ${await active(page)})`).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(form(page), 'Escape 로 위 시트가 안 닫혔다').toBeHidden();
    await expect(root, 'Escape 가 아래 상세까지 닫았다').toBeVisible();
    await expect(summary, `닫은 뒤 상세의 연 버튼으로 안 돌아왔다(지금 포커스: ${await active(page)})`).toBeFocused({ timeout: 3_000 });
  });

  test('양성 대조: autoFocus 가 없는 창(게시글 상세)은 종전대로 첫 요소(닫기)에 포커스, 닫으면 목록의 글로 돌아온다', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    const item = page.getByText(TITLE).filter({ visible: true }).first();
    await item.click();
    await expect(page.locator('[data-pd-root]')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(SETTLE);
    await expect(page.locator('[role="dialog"]').getByRole('button', { name: '닫기' }).first(), '첫 포커스가 닫기가 아니다').toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-pd-root]')).toBeHidden();
    const back = await page.evaluate(() => {
      const a = document.activeElement;
      return !!a && a !== document.body && !a.closest('[role="dialog"]') && (a.textContent ?? '').includes('자동 포커스 점검용 글');
    });
    expect(back, `닫은 뒤 목록의 글로 안 돌아왔다(지금 포커스: ${await active(page)})`).toBe(true);
  });

  test('390 레이아웃: 글쓰기 시트는 화면 안에 있고, 화면이 키보드 높이만큼 줄어도 내용 칸·게시 버튼이 보인다', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    await writeBtn(page).click();
    await expect(form(page)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(SETTLE);
    const measure = () => page.evaluate(() => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector('textarea[placeholder="내용을 입력하세요"]'))!;
      const r = (el: Element | null) => { const b = el!.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
      return { vh: window.innerHeight, sheet: r(dlg), ta: r(dlg.querySelector('textarea')),
        submit: r(dlg.querySelector('button[type="submit"]')), focused: document.activeElement?.tagName };
    });
    const full = await measure();
    console.log('[af-390 full]', JSON.stringify(full));
    expect(full.sheet.top, '시트 위가 화면 밖').toBeGreaterThanOrEqual(0);
    expect(full.submit.bottom, '게시 버튼이 화면 아래로 잘렸다').toBeLessThanOrEqual(full.vh);
    // 키보드 근사(약 300px): 화면 높이를 줄인다. 실제 키보드(시각 뷰포트만 줄어드는 Android 기본값)와 같지 않다 — 근사일 뿐이다.
    await page.setViewportSize({ width: 390, height: 544 });
    await page.waitForTimeout(400);
    const kb = await measure();
    console.log('[af-390 kb]', JSON.stringify(kb));
    expect(kb.sheet.top, '줄어든 화면에서 시트 위가 화면 밖').toBeGreaterThanOrEqual(0);
    expect(kb.ta.top, '줄어든 화면에서 내용 칸이 화면 위로 나갔다').toBeGreaterThanOrEqual(0);
    expect(kb.ta.top, '줄어든 화면에서 내용 칸이 화면 아래에 있다').toBeLessThan(kb.vh);
    expect(kb.submit.bottom, '줄어든 화면에서 게시 버튼이 잘렸다').toBeLessThanOrEqual(kb.vh);
    expect(kb.focused, '화면이 줄며 포커스를 잃었다').toBe('TEXTAREA');
  });
});
