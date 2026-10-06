// 그룹 강퇴 = 재가입 차단(오너 결정 2026-10-02 · 서버 20261002g_group_bans) — 화면 계약.
//
//  ① 강제 탈퇴 확인 문구가 '다시 가입할 수 없다'를 알린다 · 강퇴 뒤 차단 목록을 다시 읽는다
//  ② 그룹 관리(멤버 관리)에 차단 목록이 보이고, 개설자는 '해제'로 unban_group_member 를 부른다
//  ③ 차단된 회원이 가입을 누르면 서버 문장(P0001)이 버튼 아래 안내로 남는다(예전엔 '가입 실패' 토스트로 뭉갰다)
//
// 세션은 가짜(로컬), 데이터는 전부 page.route — 운영 DB 에 아무것도 보내지 않는다(_fixtures 가드 + 쓰기는 목).
// 폭 390(손님 = 모바일) · 1440(PC) 둘 다에서 돈다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_OWNER = '00000000-0000-4000-8000-0000000000a2';
const MEMBER = '00000000-0000-4000-8000-0000000000a3';
const BANNED = '00000000-0000-4000-8000-0000000000a4';
const GID = '00000000-0000-4000-8000-0000000a0001';
const BAN_MSG = '이 그룹에서 내보내진 계정이라 다시 가입할 수 없습니다. 개설자가 차단을 풀면 가입할 수 있어요.';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'gb@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};
const PROFILE = {
  id: UID, name: '검증이름', nickname: '검증개설자', email: 'gb@example.com', role: 'user', approved: true, status: 'active',
  venue_id: null, activity_points: 0, joined_at: '2026-02-01T00:00:00Z', agreed_to_terms: true, consented_legal_version: 3,
};
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const member = (id: string, userId: string, role: 'manager' | 'member', name: string) => ({
  id, group_id: GID, user_id: userId, role, status: 'approved', member_name: name, member_color: null, created_at: '2026-09-01T00:00:00Z',
});

interface Captured { kind: string; url: string; body: string }
interface Opts { ownerId: string; myRow: unknown | null }

async function openGroup(page: Page, width: number, cap: Captured[], opts: Opts) {
  const GROUP = {
    id: GID, name: '검증 딜러팀', region: '서울', address: '', owner_id: opts.ownerId, approved: true, status: 'active',
    kind: 'dealer_team', join_approval: false, is_paid_ad: false, display_order: 1, verification_status: 'unverified',
    created_at: '2026-09-01T00:00:00Z',
  };
  let members = [member('m-owner', opts.ownerId, 'manager', '개설자'), member('m-a', MEMBER, 'member', '일반회원')];
  let bans = [{ user_id: BANNED, member_name: '차단회원', created_at: '2026-10-01T00:00:00Z' }];

  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } }, [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(PROFILE)) : r.fallback()));
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fallback();
    return /vnd\.pgrst\.object/.test(req.headers()['accept'] ?? '') ? r.fulfill(json(GROUP)) : r.fulfill(json([GROUP]));
  });
  await page.route(/\/rest\/v1\/venue_notices\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/group_messages\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/group_members\?/, (r) => {
    const req = r.request();
    const url = req.url();
    if (req.method() === 'DELETE') {
      cap.push({ kind: 'DELETE group_members', url, body: '' });
      const id = /id=eq\.([^&]+)/.exec(url)?.[1];
      const gone = members.find((m) => m.id === id);
      members = members.filter((m) => m.id !== id);
      if (gone) bans = [{ user_id: gone.user_id, member_name: gone.member_name, created_at: '2026-10-02T00:00:00Z' }, ...bans]; // 서버 트리거 흉내
      return r.fulfill(json(gone ? [gone] : []));
    }
    if (req.method() !== 'GET') return r.fallback();
    if (/user_id=eq\./.test(url)) return r.fulfill(json(opts.myRow ? [opts.myRow] : []));
    return r.fulfill(json(members));
  });
  await page.route(/\/rest\/v1\/group_bans\?/, (r) => {
    cap.push({ kind: 'GET group_bans', url: r.request().url(), body: '' });
    return r.fulfill(json(bans));
  });
  await page.route(/\/rest\/v1\/rpc\/join_group/, (r) => {
    cap.push({ kind: 'RPC join_group', url: r.request().url(), body: r.request().postData() ?? '' });
    return r.fulfill(json({ code: 'P0001', message: BAN_MSG, details: null, hint: null }, 400));
  });
  await page.route(/\/rest\/v1\/rpc\/unban_group_member/, (r) => {
    const body = r.request().postData() ?? '';
    cap.push({ kind: 'RPC unban_group_member', url: r.request().url(), body });
    const who = (JSON.parse(body) as { p_user?: string }).p_user;
    const before = bans.length;
    bans = bans.filter((b) => b.user_id !== who);
    return r.fulfill(json(before - bans.length));
  });
  await page.route(/\/rest\/v1\/rpc\/claim_daily_login_point/, (r) => r.fulfill(json(0)));

  await stabilizeBackstack(page);
  await page.goto(`/?venue=${GID}`);
  const dlg = page.getByRole('dialog', { name: '검증 딜러팀 그룹 페이지' });
  await expect(dlg, '그룹 페이지가 안 열렸다').toBeVisible({ timeout: 25_000 });
  await dismissOverlays(page);
  return dlg;
}

async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `가로 넘침 ${over}px`).toBeLessThanOrEqual(1);
}

for (const width of [390, 1440]) {
  test.describe(`그룹 차단 화면 @${width}`, () => {
    test('개설자: 차단 목록이 보이고 해제하면 unban_group_member 를 부른 뒤 목록에서 빠진다', async ({ page }) => {
      const cap: Captured[] = [];
      const asks: string[] = [];
      page.on('dialog', (d) => { asks.push(d.message()); void d.accept(); });
      const dlg = await openGroup(page, width, cap, { ownerId: UID, myRow: member('m-owner', UID, 'manager', '개설자') });

      await dlg.getByRole('button', { name: /^멤버 관리/ }).click();
      const list = dlg.getByTestId('group-bans');
      await expect(list, '멤버 관리에 차단 목록이 없다').toBeVisible();
      await expect(list.getByText('차단회원')).toBeVisible();
      await noOverflow(page);

      await list.getByRole('button', { name: '차단회원 차단 해제' }).click();
      await expect(list.getByText('차단회원')).toHaveCount(0);
      const rpc = cap.find((c) => c.kind === 'RPC unban_group_member');
      expect(rpc, '해제가 서버로 가지 않았다').toBeTruthy();
      expect(JSON.parse(rpc!.body)).toEqual({ p_group: GID, p_user: BANNED });
      expect(asks.some((a) => /다시 가입할 수 있습니다/.test(a)), `해제 확인 문구: ${asks.join(' | ')}`).toBe(true);
    });

    test('개설자: 강제 탈퇴 확인 문구에 재가입 불가 안내가 있고, 강퇴 뒤 차단 목록을 다시 읽는다', async ({ page }) => {
      const cap: Captured[] = [];
      const asks: string[] = [];
      page.on('dialog', (d) => { asks.push(d.message()); void d.accept(); });
      const dlg = await openGroup(page, width, cap, { ownerId: UID, myRow: member('m-owner', UID, 'manager', '개설자') });

      await dlg.getByRole('button', { name: /^멤버 관리/ }).click();
      const reads = cap.filter((c) => c.kind === 'GET group_bans').length;
      await dlg.getByRole('button', { name: '추방' }).click();
      await expect.poll(() => cap.some((c) => c.kind === 'DELETE group_members'), { message: '강퇴 DELETE 가 안 나갔다' }).toBe(true);
      expect(asks[0] ?? '', '강제 탈퇴 확인 문구').toMatch(/다시 가입할 수 없습니다/);
      await expect.poll(() => cap.filter((c) => c.kind === 'GET group_bans').length, { message: '강퇴 뒤 차단 목록을 다시 읽지 않았다' }).toBeGreaterThan(reads);
      await expect(dlg.getByTestId('group-bans').getByText('일반회원')).toBeVisible();
    });

    test('차단된 회원: 가입을 누르면 서버 사유가 버튼 아래 안내로 남는다', async ({ page }) => {
      const cap: Captured[] = [];
      const dlg = await openGroup(page, width, cap, { ownerId: OTHER_OWNER, myRow: null });

      await expect(dlg.getByTestId('group-bans'), '비운영진에게 차단 목록이 보인다').toHaveCount(0);
      await dlg.getByRole('button', { name: '가입하기' }).click();
      await expect.poll(() => cap.some((c) => c.kind === 'RPC join_group')).toBe(true);
      const note = dlg.getByTestId('group-join-error');
      await expect(note, '차단 안내가 버튼 아래에 없다').toBeVisible();
      await expect(note).toContainText('다시 가입할 수 없습니다');
      await noOverflow(page);
    });
  });
}
