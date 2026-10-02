// 포스터 승인 개편(2026-10-02 오너 A·B · 마이그레이션 20261002h) — 화면 쪽 계약.
//
//  A 관리자 1440 — 매장 관리 [프리미엄 지정] 이 기간을 함께 저장하고(premium_until), 승인 대기열은
//    그룹 전용(feed_request=false) 포스터를 빼고 그룹의 '일정 공개 요청' 에는 그룹 배지를 단다.
//  B 내 매장 1440 — 기간 안 프리미엄 매장이면 새 포스터 폼이 '바로 공개' 를 안내한다(판정은 서버 트리거).
//  C 그룹 390 — 그룹 페이지에 그룹 포스터 목록(상태 칩)과 개설자 [+ 포스터] 가 있고,
//    '전체 일정에도 공개 요청' 체크가 POST feed_request 로 실린다(venue_id = 그룹).
//
// 세션은 가짜(로컬), 데이터는 page.route — **운영 DB 쓰기 0**(_fixtures 가드 + 쓰기는 여기서 받는다).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';
import { bootOwner, openMyStore, MOCK_UID, MOCK_VENUE, MOCK_VENUE_NAME, MOCK_DAY } from './_mockOwner';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const TOMORROW = new Date(Date.parse(`${MOCK_DAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

function fakeSession(uid: string, email: string) {
  const jwt = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: uid, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
  return {
    access_token: jwt, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: uid, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
}
const profile = (id: string, role: string, nickname: string) => ({
  id, name: `${nickname}이름`, nickname, email: `${nickname}@example.com`, role, approved: true, status: 'active',
  venue_id: null, activity_points: 0, joined_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z',
  agreed_to_terms: true, consented_legal_version: 2,
});
const sched = (id: string, extra: Record<string, unknown>) => ({
  id, title: '그룹 토너', venue_id: 'g', pub_name: '그룹', region: '서울', date: TOMORROW, start_time: '19:00', duration: '',
  format: 'MTT', guaranteed: true, prize_pool: 1_000_000, buy_in: { amount: 50_000 }, display_order: 999, is_premium: false,
  owner_id: 'x', approved: false, feed_request: true, rejected_at: null, reject_reason: null, unread_qna_count: 0,
  poster_color: '#7C2D7E', created_at: '2026-10-01T00:00:00Z', ...extra,
});

// ── A. 관리자 1440 ────────────────────────────────────────────────────────────
const ADMIN = '00000000-0000-4000-8000-00000000ad21';
const GROUP_A = '22222222-2222-4222-8222-2222222222a1';
async function bootAdmin(page: Page, cap: { method: string; url: string; body: string }[]) {
  const FAKE = fakeSession(ADMIN, 'admin@example.com');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } }, [KEY, JSON.stringify(FAKE)] as [string, string]);
  const COUNT = (n: number) => ({ 'content-range': `*/${n}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' });
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => {
    const m = r.request().method();
    if (m === 'HEAD') return r.fulfill({ status: 200, headers: COUNT(1), body: '' });
    if (m !== 'GET') return r.fallback();
    return r.fulfill(json(/order=/.test(r.request().url()) ? [profile(ADMIN, 'admin', '운영자')] : profile(ADMIN, 'admin', '운영자')));
  });
  for (const t of ['community_posts', 'marketplace_notices', 'shouts', 'notifications', 'client_errors', 'community_ads', 'home_banners', 'rank_verifications', 'marketplace_listings', 'comments', 'reports']) {
    await page.route(new RegExp(`/rest/v1/${t}\\?`), (r) => {
      const m = r.request().method();
      if (m === 'HEAD') return r.fulfill({ status: 200, headers: COUNT(0), body: '' });
      return m === 'GET' ? r.fulfill(json([])) : r.fallback();
    });
  }
  // 승인 대기 후보 3개: 매장 포스터(대기) · 그룹 '일정 공개 요청'(대기) · 그룹 전용(대기열 밖이어야 한다)
  await page.route(/\/rest\/v1\/schedules\?/, (r) => {
    const m = r.request().method();
    if (m === 'HEAD') return r.fulfill({ status: 200, headers: COUNT(0), body: '' });
    if (m !== 'GET') return r.fallback();
    return r.fulfill(json([
      sched('s-venue', { title: '매장대기포스터', venue_id: 'v-1', pub_name: '일반펍' }),
      sched('s-greq', { title: '그룹공개요청', venue_id: GROUP_A, pub_name: '테스트동호회' }),
      sched('s-gonly', { title: '그룹전용포스터', venue_id: GROUP_A, pub_name: '테스트동호회', feed_request: false }),
    ]));
  });
  await page.route(/\/rest\/v1\/app_settings/, (r) => r.fulfill(json({ value: 'on' })));
  const venueRow = { id: 'v-1', name: '일반펍', region: '서울', address: '서울 1', owner_id: ADMIN, approved: true, status: 'active', kind: 'venue', is_paid_ad: false, premium_until: null, display_order: 1, verification_status: 'unverified', created_at: '2026-09-01T00:00:00Z' };
  const groupRow = { ...venueRow, id: GROUP_A, name: '테스트동호회', kind: 'club', display_order: 2 };
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    const req = r.request();
    if (req.method() === 'HEAD') return r.fulfill({ status: 200, headers: COUNT(2), body: '' });
    if (req.method() === 'PATCH') { cap.push({ method: 'PATCH', url: req.url(), body: req.postData() ?? '' }); return r.fulfill(json([{ id: 'v-1' }])); }
    if (req.method() !== 'GET') return r.fallback();
    if (/approved=eq\.false/.test(req.url())) return r.fulfill(json([]));
    if (/kind=neq\.venue/.test(req.url())) return r.fulfill(json([groupRow]));
    return r.fulfill(json([venueRow, groupRow]));
  });
  await page.route(/\/rest\/v1\/activity_log/, (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 201, body: '' }) : r.fulfill(json([]))));
  await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill(json([])));
  page.on('dialog', (d) => { void d.accept(); });
  await stabilizeBackstack(page);
  await page.goto('/?tab=admin');
  await dismissOverlays(page);
  await expect(page.getByRole('button', { name: /^운영 분석/ }).first(), '관리자로 못 들어왔다').toBeVisible({ timeout: 25_000 });
}

test.describe('포스터 승인 개편 20261002h', () => {
  test('A 관리자 1440 — 대기열은 그룹 전용을 빼고 그룹 공개 요청에 배지 · 프리미엄 지정은 기간을 함께 저장', async ({ page }) => {
    test.setTimeout(120_000);
    const cap: { method: string; url: string; body: string }[] = [];
    await bootAdmin(page, cap);

    await page.getByRole('button', { name: /^승인 대기/ }).first().click();
    const sec = page.getByTestId('admin-pending-section');
    await expect(sec.getByText('매장대기포스터')).toBeVisible({ timeout: 15_000 });
    await expect(sec.getByText('그룹공개요청')).toBeVisible();
    await expect(sec.getByText('그룹전용포스터'), '그룹 전용 포스터가 관리자 대기열에 올라왔다').toHaveCount(0);
    await expect(page.getByTestId('admin-pending-summary').locator('[data-pending-key="posters"]')).toContainText('2');
    const groupRowEl = sec.locator('li').filter({ hasText: '그룹공개요청' });
    await expect(groupRowEl.getByTestId('pending-group-badge')).toHaveText('그룹 · 일정 공개 요청');
    await expect(sec.locator('li').filter({ hasText: '매장대기포스터' }).getByTestId('pending-group-badge')).toHaveCount(0);

    // 프리미엄 지정 — 기간 30일을 고르면 PATCH 에 is_paid_ad=true + premium_until(약 30일 뒤)이 함께 실린다
    await page.getByRole('button', { name: /^게시글 관리/ }).first().click();
    await page.locator('[data-admin-secpanel]').getByRole('button', { name: '매장', exact: true }).click();
    // 버튼 이름이 지정→해제로 바뀌므로 행은 두 이름 모두로 잡는다(지정 뒤에도 같은 행이어야 배지를 본다)
    const row = page.locator('li:visible').filter({ hasText: '일반펍' }).filter({ has: page.getByRole('button', { name: /^프리미엄 (지정|해제)$/ }) }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByLabel('일반펍 프리미엄 기간').selectOption('30');
    await row.getByRole('button', { name: '프리미엄 지정' }).click();
    await expect.poll(() => cap.find((c) => /id=eq\.v-1/.test(c.url))?.body ?? '', { timeout: 10_000 }).toContain('"is_paid_ad":true');
    const body = JSON.parse(cap.find((c) => /id=eq\.v-1/.test(c.url))!.body) as { premium_until: string };
    const days = (Date.parse(body.premium_until) - Date.now()) / 86_400_000;
    expect(days, `premium_until 이 30일 뒤가 아니다(${body.premium_until})`).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    await expect(row.getByTestId('venue-premium-badge')).toContainText('프리미엄 ~');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `가로 넘침 ${over}px`).toBeLessThanOrEqual(1);
  });

  // ── B. 내 매장 1440 ─────────────────────────────────────────────────────────
  test('B 내 매장 1440 — 기간 안 프리미엄 매장의 새 포스터 폼은 바로 공개를 안내한다', async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, { viewport: { width: 1440, height: 900 }, goto: false });
    // bootOwner 의 매장 행보다 **나중에** 건다(나중 route 가 이긴다) — 같은 매장을 프리미엄(7일 남음)으로
    const premiumRow = {
      id: MOCK_VENUE, name: MOCK_VENUE_NAME, region: '서울', address: '서울 강남구 1', owner_id: MOCK_UID,
      approved: true, status: 'active', verification_status: 'verified', kind: 'venue',
      is_paid_ad: true, premium_until: new Date(Date.now() + 7 * 86_400_000).toISOString(), display_order: 1, follower_count: 3, page_config: null,
    };
    await page.route(/\/rest\/v1\/venues\?/, (r: Route) => {
      if (r.request().method() !== 'GET') return r.fallback();
      const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
      return r.fulfill(json(single ? premiumRow : [premiumRow]));
    });
    await page.route(/\/rest\/v1\/schedules(\?|$)/, (r: Route) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openMyStore(page);
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /포스터/ }).first().click();
    await page.getByRole('button', { name: /새 게임/ }).first().click();
    const d = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '새 포스터 등록' }) }).last();
    await expect(d).toBeVisible({ timeout: 20_000 });
    await expect(d.getByTestId('poster-premium-notice'), '프리미엄 매장인데 즉시 공개 안내가 없다').toContainText('바로 공개');
    await expect(d.getByTestId('poster-feed-request'), '매장 포스터에 그룹용 공개 요청 체크가 보인다').toHaveCount(0);
  });

  // ── C. 그룹 390 ─────────────────────────────────────────────────────────────
  test('C 그룹 390 — 그룹 포스터 목록·상태 칩 · 개설자 등록은 그룹으로, 공개 요청 체크가 feed_request 로 실린다', async ({ page }) => {
    test.setTimeout(150_000);
    const UID = '00000000-0000-4000-8000-0000000000c1';
    const G = '22222222-2222-4222-8222-2222222222c1';
    const FAKE = fakeSession(UID, 'club@example.com');
    const posts: Record<string, unknown>[] = [];
    let rpcCalls = 0;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } }, [KEY, JSON.stringify(FAKE)] as [string, string]);
    await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
    await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(profile(UID, 'user', '동호회장'))) : r.fallback()));
    await page.route(/\/rest\/v1\/venues\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([{
      id: G, name: '테스트동호회', region: '서울', address: '', owner_id: UID, approved: true, status: 'active',
      kind: 'club', join_approval: true, follower_count: 0, display_order: 1, is_paid_ad: false,
      verification_status: 'unverified', images: [], created_at: FAKE.user.created_at,
    }])) : r.fallback()));
    await page.route(/\/rest\/v1\/group_members\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
    await page.route(/\/rest\/v1\/venue_notices\?/, (r) => r.fulfill(json([])));
    await page.route(/\/rest\/v1\/group_messages\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
    await page.route(/\/rest\/v1\/group_posts\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
    await page.route(/\/rest\/v1\/rpc\/get_group_schedules/, (r) => {
      rpcCalls++;
      return r.fulfill(json([
        sched('g-only', { title: '그룹전용', venue_id: G, owner_id: UID, feed_request: false }),
        sched('g-req', { title: '공개요청중', venue_id: G, owner_id: UID }),
        sched('g-pub', { title: '공개된토너', venue_id: G, owner_id: UID, approved: true }),
      ]));
    });
    await page.route(/\/rest\/v1\/schedules(\?|$)/, (r) => {
      const m = r.request().method();
      if (m === 'GET') return r.fulfill(json([]));
      if (m === 'POST') {
        const b = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
        posts.push(b);
        return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(sched('new', { ...b, id: 'new' })) });
      }
      return r.fallback();
    });
    await stabilizeBackstack(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissOverlays(page);
    await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
    await page.getByRole('button', { name: '홀덤펍', exact: true }).first().click();
    await page.getByRole('button', { name: /내 커뮤니티 관리/ }).click({ timeout: 15_000 });
    await page.getByRole('button', { name: /테스트동호회/ }).first().click({ timeout: 10_000 });

    const sec = page.getByTestId('group-posters');
    await expect(sec, '그룹 페이지에 그룹 포스터 구획이 없다').toBeVisible({ timeout: 15_000 });
    await expect(sec.getByTestId('group-poster-row')).toHaveCount(3);
    const chip = (t: string) => sec.getByTestId('group-poster-row').filter({ hasText: t }).getByTestId('group-poster-status');
    await expect(chip('그룹전용')).toHaveText('그룹 전용');
    await expect(chip('공개요청중')).toHaveText('일정 공개 요청 중');
    await expect(chip('공개된토너')).toHaveText('일정 공개 중');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `가로 넘침 ${over}px`).toBeLessThanOrEqual(1);

    await sec.getByRole('button', { name: '+ 포스터' }).click();
    const d = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '새 포스터 등록' }) }).last();
    await expect(d).toBeVisible({ timeout: 20_000 });
    const feed = d.getByTestId('poster-feed-request').getByRole('checkbox');
    await expect(feed, '공개 요청 체크는 기본 꺼짐(그룹 전용)이어야 한다').not.toBeChecked();
    await expect(d.getByLabel('홀덤펍 (매장)'), '그룹 폼에 매장 선택이 보인다').toHaveCount(0);
    const f = (name: string) => d.getByLabel(name, { exact: false }).first();
    await f('게임 이름').fill('동호회 정모');
    await f('날짜').fill(TOMORROW);
    await f('지역').selectOption('서울');
    await f('참가비').fill('30000');
    await f('보장 상금').fill('50');
    await f('레벨').fill('10');
    await feed.check();
    const before = rpcCalls;
    await d.getByRole('button', { name: '등록하기' }).click();
    await expect.poll(() => posts.length, { timeout: 15_000 }).toBe(1);
    expect(posts[0].venue_id, '그룹으로 저장되지 않았다').toBe(G);
    expect(posts[0].pub_name).toBe('테스트동호회');
    expect(posts[0].feed_request).toBe(true);
    expect(posts[0].approved).toBe(false);
    await expect.poll(() => rpcCalls, { message: '저장 뒤 그룹 포스터를 다시 읽지 않았다', timeout: 10_000 }).toBeGreaterThan(before);
  });
});
