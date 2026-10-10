// 글쓰기 창 — 작성 중 닫기 확인(2026-10-04 재점검 2회차 하-4 · 리드 결정).
//   제목이나 내용이 비어 있지 않으면 ESC·배경·X·뒤로가기·그립 끌기 모두 '작성 중인 내용이 있어요. 닫을까요?' 를 묻는다.
//   취소 = 창과 쓰던 글이 그대로. 확인 = 닫힘. 빈 창은 묻지 않고 바로 닫힌다.
// 🔴 실측으로 잡은 함정: lazy 청크가 이미 받아져 있으면 창이 App 의 '열림' 커밋에 바로 그려져, 자식(Modal)의 뒤로가기 칸이
//   먼저 서고 그 위에 App 의 예약 칸이 얹혔다 — ESC·뒤로가기가 예약 칸을 닫아 확인을 건너뛰었다(두 번째 열기부터 0회).
//   그래서 여기서는 **한 페이지에서 두 번** 연다(두 번째가 그 경로다).
// 세션은 가짜(로컬), 외부 요청은 하나도 continue 하지 않는다. 운영 쓰기 0.
import { test, expect, type Page, type Route } from '@playwright/test';
import { SUPABASE_URL } from './_session';
import { LEGAL_VERSION } from '../src/lib/legalVersion';

const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '00000000-0000-4000-8000-0000000000c4';
const me = {
  access_token: [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.'),
  refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'writer@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};
const meProfile = {
  id: UID, name: '쓰는사람이름', nickname: '쓰는사람', email: 'writer@example.com', role: 'user', approved: true, status: 'active',
  venue_id: null, activity_points: 0, joined_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z',
  agreed_to_terms: true, consented_legal_version: LEGAL_VERSION,
};
const TITLE = '닫기 확인 점검용 글';
const post = {
  id: 'cc-1', user_id: '00000000-0000-4000-8000-0000000000a4', user_name: '작성자', user_role: 'user', user_color: '#8B5CF6', user_avatar: null,
  content: '[화면 점검용 예시 글입니다.]', created_at: '2026-10-01T09:00:00Z',
  like_count: 0, comment_count: 0, view_count: 3, category: 'free', title: TITLE, images: [], badbeat_count: 0,
  goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
};
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const ASK = '작성 중인 내용이 있어요. 닫을까요?';

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

const boardPost = (page: Page) => page.getByText(TITLE).filter({ visible: true }).first();
const sheet = (page: Page) => page.getByRole('dialog', { name: '글쓰기' });
const titleBox = (page: Page) => sheet(page).getByPlaceholder('제목을 입력하세요');
const writeBtn = (page: Page) => page.getByRole('button', { name: /글쓰기$/ }).filter({ visible: true }).first();
async function open(page: Page) {
  await writeBtn(page).click();
  await expect(sheet(page), '글쓰기 시트가 안 열렸다').toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500); // 열림 애니·첫 포커스가 지나간 뒤
}

test.describe('글쓰기 — 작성 중 닫기 확인', () => {
  test('빈 창은 묻지 않고 닫히고, 쓴 글이 있으면 모든 닫기 경로가 묻는다(취소 = 그대로)', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    await boot(page, baseURL);
    const asked: string[] = [];
    let answer: 'accept' | 'dismiss' = 'dismiss';
    page.on('dialog', (d) => { asked.push(d.message()); void (answer === 'accept' ? d.accept() : d.dismiss()); });

    // ① 첫 열기 · 빈 창 → ESC 한 번에 닫힘, 확인 0
    await open(page);
    await page.keyboard.press('Escape');
    await expect(sheet(page), '빈 창이 ESC 로 안 닫혔다').toHaveCount(0);
    expect(asked, '빈 창인데 확인을 물었다').toEqual([]);
    await expect(boardPost(page), '빈 창을 닫았는데 게시판이 사라졌다').toBeVisible();

    // ② 두 번째 열기(청크가 이미 있는 경로) · 제목 입력
    await open(page);
    await titleBox(page).fill('쓰던 제목');

    const kept = async (how: string) => {
      await expect.poll(() => asked.length, `${how}: 확인을 묻지 않았다`).toBe(1);
      expect(asked[0]).toBe(ASK);
      asked.length = 0;
      await page.waitForTimeout(400);
      await expect(sheet(page), `${how}: 취소했는데 창이 닫혔다`).toBeVisible();
      await expect(titleBox(page), `${how}: 취소했는데 쓰던 제목이 사라졌다`).toHaveValue('쓰던 제목');
    };
    await page.keyboard.press('Escape'); await kept('ESC');
    await page.mouse.click(195, 20); await kept('배경');
    await sheet(page).getByRole('button', { name: '닫기' }).first().click(); await kept('X');
    await page.goBack(); await kept('뒤로가기');
    // 취소 뒤에도 다음 뒤로가기를 **이 창이** 받는다(칸을 다시 잡았다) — 아래 화면이 닫히거나 앱을 떠나지 않는다
    await page.goBack(); await kept('두 번째 뒤로가기');

    // ③ 확인 → 닫힘. 닫힌 뒤의 뒤로가기는 앱 안에 머문다(history 칸이 남거나 모자라지 않다)
    answer = 'accept';
    await page.keyboard.press('Escape');
    await expect(sheet(page), '확인했는데 안 닫혔다').toHaveCount(0);
    expect(asked).toEqual([ASK]);
    // 처음 섹션이 게시판이라(오너 2026-10-10) 글쓰기 시트 말고 쌓인 섹션 겹이 없다 — 닫은 뒤에도 게시판이 그대로 서 있고,
    // 다음 뒤로가기는 앱의 탭 겹(커뮤니티 → 홈)을 소비한다(src/App.tsx 탭 이력). 앱 밖으로 나가거나 시트 칸이 남아 있으면 실패한다.
    await expect(page.locator('[data-community-secbar]'), '확인해서 닫은 뒤 커뮤니티 바가 사라졌다').toBeVisible();
    await expect(boardPost(page), '확인해서 닫은 뒤 게시판이 사라졌다').toBeVisible();
    await page.goBack();
    await expect(page.locator('.tab-pane[data-tab="home"]'), '닫은 뒤 뒤로가기가 홈으로 가지 않았다(앱 밖/엉뚱한 곳)').toBeVisible();
    await expect(page.locator('[data-community-secbar]'), '홈으로 갔는데 커뮤니티 바가 남아 있다').toBeHidden();
    expect(new URL(page.url()).origin, '뒤로가기가 앱 밖으로 나갔다').toBe(new URL(baseURL!).origin);
  });

  test('그립을 끌어 던져도 먼저 묻고, 취소하면 제자리로 돌아온다(화면 밖에 굳지 않는다)', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    let asked = 0;
    page.on('dialog', (d) => { asked++; void d.dismiss(); });
    await open(page);
    await titleBox(page).fill('끌어도 남아야 하는 제목');
    const g = await page.evaluate(() => {
      const grip = document.querySelector('[role="dialog"] .touch-none') as HTMLElement | null;
      if (!grip) return null;
      const r = grip.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    expect(g, '그립이 없다(시트 그립 셀렉터가 바뀌었나)').not.toBeNull();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g!.x, y: g!.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g!.x, y: g!.y + 40 * i }] });
      await page.waitForTimeout(12);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => asked, '던졌는데 확인을 묻지 않았다').toBe(1);
    await page.waitForTimeout(700);
    await expect(sheet(page)).toBeVisible();
    await expect(titleBox(page)).toHaveValue('끌어도 남아야 하는 제목');
    const ty = await sheet(page).evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m42);
    expect(Math.abs(ty), `취소했는데 시트가 제자리로 안 돌아왔다(translateY=${ty})`).toBeLessThanOrEqual(1);
  });

  // 2026-10-04 재검토 H2 — 푸터 '취소' 가 onClose 를 직접 불러 확인 없이 닫혔다(X·ESC 와 다른 길).
  // 음성 대조: PostFormModal 푸터 onClick 을 `onClose` 로 되돌리면 실패한다.
  test('푸터 취소도 같은 확인을 지난다(빈 창은 바로 닫힘)', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    const asked: string[] = [];
    let answer: 'accept' | 'dismiss' = 'dismiss';
    page.on('dialog', (d) => { asked.push(d.message()); void (answer === 'accept' ? d.accept() : d.dismiss()); });
    const cancel = () => sheet(page).getByRole('button', { name: '취소', exact: true });

    await open(page);
    await cancel().click();
    await expect(sheet(page), '빈 창이 푸터 취소로 안 닫혔다').toHaveCount(0);
    expect(asked, '빈 창인데 확인을 물었다').toEqual([]);

    await open(page);
    await titleBox(page).fill('푸터로 닫으려던 제목');
    await cancel().click();
    await expect.poll(() => asked.length, '푸터 취소: 확인을 묻지 않았다').toBe(1);
    expect(asked[0]).toBe(ASK);
    await page.waitForTimeout(400);
    await expect(sheet(page), '푸터 취소: 확인을 취소했는데 창이 닫혔다').toBeVisible();
    await expect(titleBox(page)).toHaveValue('푸터로 닫으려던 제목');

    answer = 'accept'; asked.length = 0;
    await cancel().click();
    await expect(sheet(page), '확인했는데 안 닫혔다').toHaveCount(0);
    expect(asked).toEqual([ASK]);
  });

  // 2026-10-04 재검토 H2 — 확인 조건이 제목·내용만 봐서 사진·투표만 채운 초안은 묻지 않고 사라졌다.
  // 음성 대조: hasDraft 를 제목·내용만 보게 되돌리면 실패한다.
  test('글자 없이 사진만 채운 초안도 닫기 전에 묻는다', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    let asked = 0;
    page.on('dialog', (d) => { asked++; void d.dismiss(); });
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

    await open(page);
    await sheet(page).locator('input[type="file"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
    await expect(sheet(page).getByRole('img', { name: '첨부 이미지 1' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(() => asked, '사진만 있는 초안: 확인을 묻지 않았다').toBe(1);
    await page.waitForTimeout(400);
    await expect(sheet(page), '사진만 있는 초안이 닫혔다').toBeVisible();
    // 사진을 지우면 다시 빈 창 — 묻지 않고 닫힌다
    await sheet(page).getByRole('button', { name: '이미지 제거' }).click();
    await page.keyboard.press('Escape');
    await expect(sheet(page), '빈 창으로 돌아갔는데 안 닫혔다').toHaveCount(0);
    expect(asked).toBe(1);
  });

  test('글자 없이 투표 질문만 채운 초안도 닫기 전에 묻는다', async ({ page, baseURL }) => {
    await boot(page, baseURL);
    let asked = 0;
    page.on('dialog', (d) => { asked++; void d.dismiss(); });
    await open(page);
    await sheet(page).getByRole('button', { name: '+ 투표 추가' }).click();
    await sheet(page).getByPlaceholder('예: 이 스팟, 콜? 폴드?').fill('콜? 폴드?');
    await sheet(page).getByRole('button', { name: '닫기' }).first().click();
    await expect.poll(() => asked, '투표만 있는 초안: 확인을 묻지 않았다').toBe(1);
    await page.waitForTimeout(400);
    await expect(sheet(page), '투표만 있는 초안이 닫혔다').toBeVisible();
  });
});
