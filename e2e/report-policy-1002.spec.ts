// 신고 정책(오너 10-02 · 20261002a) — "신고된다고 일단 글이 정지되는 게 아니다. 관리자가 보고 정한다."
//
// ① 사용자: 남의 글을 신고하면 '접수' 안내만 나오고, 글(제목·본문)은 그대로 보인다.
// ② 관리자: 신고 대기 목록에서 원문 · 같은 대상 신고 수 · 작성자 이력을 보고
//    기각 · 글 삭제 · 유저 정지(+글 삭제)를 고른다 — 전부 RPC admin_decide_report 한 번으로 간다.
//
// 세션은 가짜(로컬), 데이터는 단일 route 핸들러 — 외부 요청은 **하나도 continue 하지 않는다**
// (post-detail-read.spec.ts 의 2026-09-12 실사고 참고). 쓰기(POST)는 목으로 받아 페이로드만 본다. 운영 쓰기 0.
import { test, expect, type Page, type Route } from '@playwright/test';
import { SUPABASE_URL } from './_session';

const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = (uid: string, email: string) => ({
  access_token: [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ sub: uid, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.'),
  refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: uid, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
});
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const AUTHOR = '00000000-0000-4000-8000-0000000000a1';
const TITLE = '신고 정책 점검용 글';
const BODY = '[화면 점검용 예시 글입니다.] 신고가 들어와도 이 본문은 그대로 보여야 합니다.';
const post = {
  id: 'rp-1', user_id: AUTHOR, user_name: '작성자', user_role: 'user', user_color: '#8B5CF6', user_avatar: null,
  content: BODY, created_at: '2026-10-01T09:00:00Z', like_count: 0, comment_count: 0, view_count: 3,
  category: 'free', title: TITLE, images: [], badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
};
const profile = (id: string, role: string, nickname: string, extra: Record<string, unknown> = {}) => ({
  id, name: `${nickname}이름`, nickname, email: `${nickname}@example.com`, role, approved: true, status: 'active',
  venue_id: null, activity_points: 0, joined_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z',
  agreed_to_terms: true, consented_legal_version: 2, ...extra,
});

interface Cap { method: string; url: string; body: string }

async function install(page: Page, baseURL: string | undefined, me: ReturnType<typeof session>, meProfile: unknown,
  cap: Cap[], extra: (url: string, route: Route) => Promise<void> | void | 'skip' = () => 'skip') {
  if (!baseURL) throw new Error('baseURL 이 없다');
  const ORIGIN = new URL(baseURL).origin;
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } },
    [`sb-${REF}-auth-token`, JSON.stringify(me)] as [string, string]);
  await page.context().route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    // ── 외부. **절대 continue 하지 않는다.**
    if (req.method() !== 'GET' && req.method() !== 'HEAD') cap.push({ method: req.method(), url, body: req.postData() ?? '' });
    const r = await extra(url, route);
    if (r !== 'skip') return;
    if (/\/auth\/v1\//.test(url)) return json(route, me.user);
    if (/\/rest\/v1\/profiles\?/.test(url) && req.method() === 'GET') return json(route, meProfile);
    if (/\/rest\/v1\/community_posts\?/.test(url)) return json(route, [post]);
    if (/\/rest\/v1\/reports/.test(url) && req.method() === 'POST') return route.fulfill({ status: 201, body: '' });
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, body: '' });
    return json(route, []);
  });
}

test.describe('신고 정책 10-02', () => {
  test('사용자: 신고해도 글이 사라지지 않고 접수 안내만 뜬다', async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const READER = '00000000-0000-4000-8000-0000000000r1';
    const cap: Cap[] = [];
    await install(page, baseURL, session(READER, 'reader@example.com'),
      profile(READER, 'user', '읽는사람', { approved: false }), cap);

    await page.goto('/?tab=community');
    const bar = page.locator('[data-community-secbar]');
    await expect(bar, '커뮤니티 하위탭 바가 없다').toBeVisible({ timeout: 25_000 });
    await bar.getByRole('button', { name: '게시판', exact: true }).click();
    await page.getByText(TITLE).filter({ visible: true }).first().click();
    const root = page.locator('[data-pd-root]');
    await expect(root, '게시글 상세가 열리지 않았다').toBeVisible({ timeout: 15_000 });

    await page.locator('summary[aria-label="게시글 메뉴"]').click();
    await page.getByRole('button', { name: '신고', exact: true }).filter({ visible: true }).click();
    const submit = page.getByRole('button', { name: '신고 접수', exact: true });
    await expect(submit, '신고 시트가 안 열렸다').toBeVisible();
    await page.getByRole('button', { name: '욕설/비방', exact: true }).click();
    await submit.click();

    await expect(page.getByText('신고가 접수되었습니다. 관리자가 검토합니다.')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => cap.filter((c) => /\/rest\/v1\/reports/.test(c.url)).length, { timeout: 10_000 }).toBe(1);
    await expect(submit, '신고 시트가 안 닫혔다').toBeHidden();
    // 핵심: 글은 그대로다 — 상세가 열려 있고 제목·본문이 보이며, 숨김 안내가 없다.
    await expect(root, '신고 직후 글 상세가 닫혔다(글이 사라졌다)').toBeVisible();
    await expect(root.getByText(BODY), '신고 직후 본문이 사라졌다').toBeVisible();
    await expect(root.getByText(/숨김 처리/)).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('report-after-user.png') });
    // 신고 접수 말고 다른 쓰기(가림·삭제 RPC)는 없다
    expect(cap.filter((c) => /admin_set_post_blinded|admin_decide_report/.test(c.url)
      || (/\/rest\/v1\/community_posts/.test(c.url) && (c.method === 'PATCH' || c.method === 'DELETE'))).map((c) => c.url)).toEqual([]);
  });

  test('관리자: 원문·신고 수·작성자 이력을 보고 기각·글 삭제·유저 정지를 고른다', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const ADMIN = '00000000-0000-4000-8000-00000000ad11';
    const cap: Cap[] = [];
    let open = [
      { id: 'r1', reporter_name: '신고자1', target_type: 'post', target_id: 'rp-1', target_owner_id: AUTHOR, target_summary: TITLE, reason: '욕설/비방', status: 'open', created_at: '2026-10-01T10:00:00Z' },
      { id: 'r2', reporter_name: '신고자2', target_type: 'post', target_id: 'rp-1', target_owner_id: AUTHOR, target_summary: TITLE, reason: '스팸/도배', status: 'open', created_at: '2026-10-01T09:00:00Z' },
    ];
    const history = [
      { id: 'h1', reporter_name: '예전', target_type: 'comment', target_id: 'c-old', target_owner_id: AUTHOR, target_summary: '예전 댓글', reason: '욕설', status: 'resolved', created_at: '2026-09-01T00:00:00Z' },
    ];
    let decideReply: { status: number; body: unknown } = { status: 200, body: { status: 'dismissed', closed: 2, deleted: false, suspended_user: null } };
    const USERS = [profile(ADMIN, 'admin', '운영자'), profile(AUTHOR, 'user', '문제회원', { sanction_reason: '예전 도배' })];
    await install(page, baseURL, session(ADMIN, 'admin@example.com'), USERS[0], cap, (url, route) => {
      const m = route.request().method();
      if (/\/rest\/v1\/profiles\?/.test(url) && m === 'GET' && /order=/.test(url)) return json(route, USERS);
      if (/\/rest\/v1\/reports\?/.test(url) && m === 'GET') return json(route, [...open, ...history]);
      if (/\/rest\/v1\/rpc\/admin_decide_report/.test(url)) return json(route, decideReply.body, decideReply.status);
      if (/\/rest\/v1\/app_settings/.test(url)) return json(route, { value: 'on' });
      if (/\/functions\/v1\/notify-sanction/.test(url)) return json(route, { sent: true });
      return 'skip';
    });
    page.on('dialog', (d) => { void d.accept(); });
    await page.goto('/?tab=admin');
    await expect(page.getByRole('button', { name: /^운영 분석/ }).first(), '관리자로 못 들어왔다').toBeVisible({ timeout: 25_000 });
    await page.getByRole('button', { name: /^신고/ }).first().click();

    const rows = page.getByTestId('report-row');
    await expect(rows).toHaveCount(2, { timeout: 15_000 });
    const row = rows.first();
    await expect(row.getByTestId('report-target-text'), '원문이 안 보인다').toContainText(BODY);
    await expect(row.getByText('같은 대상 신고 2건')).toBeVisible();
    await expect(row.getByTestId('report-author-history')).toContainText('문제회원');
    await expect(row.getByTestId('report-author-history')).toContainText('받은 신고 3건(조치 1건)');
    await expect(row.getByTestId('report-author-history')).toContainText('예전 도배');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `가로 넘침 ${over}px`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath('report-queue-admin.png'), fullPage: false });

    const rpcBodies = () => cap.filter((c) => /admin_decide_report/.test(c.url)).map((c) => JSON.parse(c.body));

    // (a) 기각 — '함께 처리' 를 끄면 이 신고만
    await row.getByRole('checkbox').first().uncheck();
    open = open.filter((r) => r.id !== 'r1');   // 서버가 r1 만 닫았다
    await row.getByTestId('report-dismiss').click();
    await expect.poll(() => rpcBodies().length).toBe(1);
    expect(rpcBodies()[0]).toMatchObject({ p_report_id: 'r1', p_action: 'dismiss', p_include_same_target: false });
    await expect(rows, '처리 뒤 목록을 다시 읽지 않았다').toHaveCount(1);
    await expect(rows.first().getByText('같은 대상 신고 2건')).toHaveCount(0);

    // (b) 글 삭제 — 확인 창을 거쳐 함께 처리(기본)
    await rows.first().getByTestId('report-delete').click();
    await expect.poll(() => rpcBodies().length).toBe(2);
    expect(rpcBodies()[1]).toMatchObject({ p_action: 'delete', p_include_same_target: true });

    // (c) 유저 정지 — 사유가 없으면 실행 불가 · 30일 + 글 삭제
    await rows.first().getByTestId('report-suspend-open').click();
    const panel = page.getByTestId('report-suspend-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('report-suspend-run'), '사유 없이 정지 버튼이 눌린다').toBeDisabled();
    await panel.getByRole('button', { name: '30일', exact: true }).click();
    await panel.getByLabel('정지 사유').fill('반복 욕설');
    await panel.getByRole('checkbox').check();
    decideReply = { status: 200, body: { status: 'resolved', closed: 2, deleted: true, suspended_user: AUTHOR } };
    open = [];
    await panel.getByTestId('report-suspend-run').click();
    await expect.poll(() => rpcBodies().length).toBe(3);
    expect(rpcBodies()[2]).toMatchObject({ p_action: 'suspend', p_suspend_days: 30, p_reason: '반복 욕설', p_delete_content: true });
    await expect.poll(() => cap.filter((c) => /notify-sanction/.test(c.url)).length, { timeout: 10_000 }).toBe(1);
    // 처리 뒤 목록을 서버에서 다시 읽는다 → 비었으면 '없음'
    await expect(page.getByText('접수된 신고가 없습니다')).toBeVisible({ timeout: 10_000 });

    // 신고 표 직접 update · 가림 해제 RPC 는 한 번도 없다(옛 경로 L-02)
    expect(cap.filter((c) => /\/rest\/v1\/reports\?/.test(c.url) && c.method === 'PATCH')).toEqual([]);
    expect(cap.filter((c) => /admin_set_post_blinded|admin_dismiss_report/.test(c.url))).toEqual([]);
  });
});
