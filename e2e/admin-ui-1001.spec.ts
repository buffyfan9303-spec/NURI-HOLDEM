// 관리자 화면 점검 수정 묶음(2026-10-01) — 점검 A-03 · A-07 · A-08 · A-09 · A-10 · A-14
//
// 세션은 가짜(로컬), 데이터는 page.route — 운영 DB 에 아무것도 보내지 않는다(_fixtures 가드).
// 쓰기(PATCH/POST)는 전부 목으로 받아 **페이로드만** 확인한다.
// 폭 1440 · 1024 둘 다에서 돈다(관리자 = PC) — 가로 넘침도 같이 잰다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-00000000ad11';
const MEMBER = '00000000-0000-4000-8000-0000000000m1';
const OWNER = '00000000-0000-4000-8000-0000000000o1';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

const profile = (id: string, role: string, nickname: string, extra: Record<string, unknown> = {}) => ({
  id, name: `${nickname}이름`, nickname, email: `${nickname}@example.com`, role, approved: true, status: 'active',
  venue_id: null, activity_points: 0, joined_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z',
  agreed_to_terms: true, consented_legal_version: 3, ...extra,
});
const USERS = [
  profile(UID, 'admin', '운영자'),
  profile(OWNER, 'venue_owner', '사장님'),
  profile(MEMBER, 'user', '문제회원'),
];

const venue = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, region: '서울', address: '서울 어딘가 1', owner_id: UID, approved: true, status: 'active',
  kind: 'venue', is_paid_ad: false, display_order: 1, verification_status: 'unverified',
  created_at: '2026-09-01T00:00:00Z', ...extra,
});
const ADMIN_VENUE = venue('v-admin', '관리자소유펍');
const PENDING_VENUE = venue('v-pending', '새로생긴펍', { owner_id: OWNER, approved: false });

// 교차 출처 fetch 는 expose 하지 않은 헤더를 못 읽는다 — 운영 서버(PostgREST)는 content-range 를 노출한다
const COUNT_HEADERS = (n: number) => ({ 'content-range': `*/${n}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' });
interface Captured { method: string; url: string; body: string }
interface Opts { reports?: unknown[]; statsFail?: boolean; patchDelayMs?: number }

async function bootAdmin(page: Page, width: number, cap: Captured[], opts: Opts = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => {
    const req = r.request();
    if (req.method() === 'HEAD') return r.fulfill({ status: 200, headers: COUNT_HEADERS(3), body: '' });
    if (req.method() !== 'GET') return r.fallback();
    if (/order=/.test(req.url())) return r.fulfill(json(USERS));
    return r.fulfill(json(USERS[0]));
  });
  for (const t of ['schedules', 'community_posts', 'marketplace_notices', 'shouts', 'notifications', 'client_errors', 'community_ads', 'home_banners', 'rank_verifications', 'marketplace_listings', 'comments']) {
    await page.route(new RegExp(`/rest/v1/${t}\\?`), (r) => {
      const m = r.request().method();
      if (m === 'HEAD') return r.fulfill({ status: 200, headers: COUNT_HEADERS(0), body: '' });
      return m === 'GET' ? r.fulfill(json([])) : r.fallback();
    });
  }
  await page.route(/\/rest\/v1\/reports\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(opts.reports ?? [])) : r.fallback()));
  await page.route(/\/rest\/v1\/app_settings/, (r) => r.fulfill(json({ value: 'on' })));
  // 매장 — 조회는 URL 모양으로 가른다. PATCH 는 기록만 하고 성공(반영 1행)으로 답한다.
  await page.route(/\/rest\/v1\/venues\?/, async (r) => {
    const req = r.request();
    const url = req.url();
    if (req.method() === 'HEAD') return r.fulfill({ status: 200, headers: COUNT_HEADERS(2), body: '' });
    if (req.method() === 'PATCH') {
      cap.push({ method: 'PATCH', url, body: req.postData() ?? '' });
      if (opts.patchDelayMs) await new Promise((res) => setTimeout(res, opts.patchDelayMs));
      return r.fulfill(json([{ id: 'x' }]));
    }
    if (req.method() !== 'GET') return r.fallback();
    if (/kind=eq\.venue/.test(url) && /approved=eq\.false/.test(url)) return r.fulfill(json([PENDING_VENUE]));
    if (/kind=neq\.venue/.test(url)) return r.fulfill(json([]));
    if (/approved=eq\.true/.test(url)) return r.fulfill(json([ADMIN_VENUE]));
    return r.fulfill(json([ADMIN_VENUE, PENDING_VENUE]));            // 전량(관리자 매장 목록)
  });
  await page.route(/\/rest\/v1\/activity_log/, (r) => {
    if (r.request().method() === 'POST') { cap.push({ method: 'POST', url: r.request().url(), body: r.request().postData() ?? '' }); return r.fulfill({ status: 201, body: '' }); }
    return r.fulfill(json([]));
  });
  await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/admin_list_venue_owner_requests/, (r) => r.fulfill(json([
    { venue_id: 'v-admin', venue_name: '관리자소유펍', user_id: OWNER, nickname: '사장님', name: '', invited_by: '', created_at: '2026-09-30T00:00:00Z' },
  ])));
  await page.route(/\/rest\/v1\/rpc\/admin_set_post_blinded/, (r) => {
    cap.push({ method: 'RPC', url: r.request().url(), body: r.request().postData() ?? '' });
    return r.fulfill(json(null));
  });
  await page.route(/\/rest\/v1\/rpc\/admin_platform_stats/, (r) => r.fulfill(opts.statsFail
    ? json({ code: 'P0001', message: '관리자만 조회할 수 있습니다' }, 400)
    : json([{ users: 10, new_users_7d: 1, new_users_30d: 2, venues: 3, active_venues: 2, schedules: 4, upcoming_schedules: 1, checkins_today: 0, checkins_7d: 5, referrals: 0, referrals_rewarded: 0, push_subs: 0, announcements: 0, posts_7d: 1 }])));

  page.on('dialog', (d) => { void d.accept(); });
  await stabilizeBackstack(page);
  await page.goto('/?tab=admin');
  await dismissOverlays(page);
  await expect(page.getByRole('button', { name: /^운영 분석/ }).first(), '관리자로 못 들어왔다').toBeVisible({ timeout: 25_000 });
}

const nav = (page: Page, name: RegExp) => page.getByRole('button', { name }).first();
async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `가로 넘침 ${over}px`).toBeLessThanOrEqual(1);
}

for (const width of [1440, 1024]) {
  test.describe(`관리자 점검 수정 · ${width}px`, () => {
    test('A-09·A-03 승인 대기 섹션: 합계 배지 · 요약 · 새 매장 입점 승인 대기열', async ({ page }) => {
      test.setTimeout(90_000);
      const cap: Captured[] = [];
      await bootAdmin(page, width, cap);
      // 좌측 배지 = 입점 1 + 공동 업주 1 (포스터 0) — 포스터만 세던 예전에는 0 이라 배지가 없었다
      const pendingBtn = nav(page, /^승인 대기/);
      await expect(pendingBtn).toBeVisible();
      await expect(pendingBtn, '합계 배지(2)가 없다').toContainText('2', { timeout: 15_000 });
      await pendingBtn.click();

      const summary = page.getByTestId('admin-pending-summary');
      await expect(summary).toBeVisible({ timeout: 15_000 });
      await expect(summary.locator('[data-pending-key="listings"]')).toContainText('1');
      await expect(summary.locator('[data-pending-key="owners"]')).toContainText('1');
      await expect(summary.locator('[data-pending-key="posters"]'), '0 까지 보여야 한다').toContainText('0');

      // 🔴 A-03: 새 매장(kind=venue) 이 대기열에 있다
      const panel = page.locator('section').filter({ hasText: '입점·그룹 개설 승인' }).first();
      await expect(panel.getByText('새로생긴펍')).toBeVisible();
      await expect(panel.getByText('홀덤펍 입점')).toBeVisible();
      await expect(page.getByText('공동 업주(사장님) 초대 승인'), '공동 업주 대기열이 승인 대기 섹션에 없다').toBeVisible();
      await noOverflow(page);

      await panel.getByRole('button', { name: '승인', exact: true }).click();
      await expect.poll(() => cap.find((c) => c.method === 'PATCH' && /id=eq\.v-pending/.test(c.url))?.body, { timeout: 10_000 }).toBe('{"approved":true}');
      await expect.poll(() => cap.some((c) => c.method === 'POST' && /approve/.test(c.body)), { message: '감사 기록(activity_log)이 없다' }).toBe(true);
    });

    test('A-14 반려는 삭제가 아니라 숨김 상태 · 처리 중 잠금', async ({ page }) => {
      test.setTimeout(90_000);
      const cap: Captured[] = [];
      await bootAdmin(page, width, cap, { patchDelayMs: 1500 });
      await nav(page, /^승인 대기/).click();
      const panel = page.locator('section').filter({ hasText: '입점·그룹 개설 승인' }).first();
      await expect(panel.getByText('새로생긴펍')).toBeVisible({ timeout: 15_000 });
      await panel.getByRole('button', { name: '반려', exact: true }).click();
      // 처리 중(PATCH 지연)에는 승인 버튼이 '처리 중…' 으로 바뀌고 두 버튼이 모두 잠긴다
      await expect(panel.getByRole('button', { name: '처리 중…' })).toBeDisabled();
      await expect(panel.getByRole('button', { name: '반려', exact: true })).toBeDisabled();
      await expect.poll(() => cap.filter((c) => c.method === 'PATCH').length, { timeout: 10_000 }).toBe(1);
      const p = cap.find((c) => c.method === 'PATCH')!;
      expect(p.body, '삭제가 아니라 상태 전환').toContain('"status":"hidden"');
      expect(cap.some((c) => c.method === 'DELETE'), 'DELETE 요청이 나갔다').toBe(false);
    });

    test('A-08 관리자 소유 매장이 업주: 운영자로 보이고 수정 폼에서도 선택돼 있다', async ({ page }) => {
      test.setTimeout(90_000);
      await bootAdmin(page, width, []);
      await nav(page, /^매장$/).click();
      const row = page.locator('li:visible').filter({ hasText: '관리자소유펍' }).filter({ has: page.getByRole('button', { name: '장부·통계' }) }).first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row, "'미지정' 으로 보인다").toContainText('업주: 운영자');
      await expect(row).not.toContainText('업주: 미지정');
      await row.getByRole('button', { name: '관리', exact: true }).click();
      const select = row.locator('label', { hasText: '관리 업주' }).locator('select');
      await expect(select, '수정 폼의 업주 선택이 미지정으로 보인다').toHaveValue(UID);
      await noOverflow(page);
    });

    test('A-07 신고 행에서 블라인드 · 작성자 제재(회원 관리 이동 + 검색어)', async ({ page }) => {
      test.setTimeout(90_000);
      const cap: Captured[] = [];
      await bootAdmin(page, width, cap, {
        reports: [{ id: 'r1', reporter_name: '신고자', target_type: 'post', target_id: 'post-1', target_owner_id: MEMBER,
          target_summary: '문제 글', reason: '욕설', status: 'open', created_at: '2026-09-30T00:00:00Z' }],
      });
      await nav(page, /^신고/).click();
      await expect(page.getByText('문제 글')).toBeVisible({ timeout: 15_000 });
      await noOverflow(page);

      await page.getByRole('button', { name: '블라인드', exact: true }).click();
      await expect.poll(() => cap.find((c) => c.method === 'RPC')?.body, { timeout: 10_000 }).toContain('"p_blinded":true');
      await expect(page.getByRole('button', { name: '블라인드됨' })).toBeDisabled();

      await page.getByRole('button', { name: '작성자 제재', exact: true }).click();
      const search = page.getByPlaceholder('닉네임·이름·이메일로 검색');
      await expect(search, '회원 관리로 이동하지 못했다').toBeVisible({ timeout: 10_000 });
      await expect(search).toHaveValue('문제회원');
      await expect(page.getByText('문제회원').first()).toBeVisible();
    });

    test('A-10 운영 지표 실패는 0 이 아니라 실패 카드 + 재시도', async ({ page }) => {
      test.setTimeout(90_000);
      await bootAdmin(page, width, [], { statsFail: true });
      // 운영 분석 섹션(기본)에 지표 카드가 있다 — 실패 카드가 떠야 한다
      await expect(page.getByText('관리자만 조회할 수 있습니다').first(), '플랫폼 지표 실패 카드(서버 문구)가 없다').toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: '다시 시도' }).first()).toBeVisible();
    });
  });
}
