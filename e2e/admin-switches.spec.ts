// 관리자 → 기능 스위치 — **누른 것이 서버에 닿고, 앱이 그 값을 쓰는가** (2026-09-11 오너 지시)
//
// 오너: "관리자에서 실제 모든 것을 관리할 수 있게 … 연동하면 제대로 표기가 되는지까지 확인."
//
// 이 화면이 생긴 이유: app_settings 의 운영 스위치 중 identity_voucher_enabled 만
//   **어디에서도 관리되지 않았다**. src/lib/identityFlag.ts 는 "앱 → 관리자 탭 → app_settings 저장 경로"
//   라고 적어 뒀는데 그 화면이 없어서, 본인인증·매장이용권 전체를 SQL 로만 켤 수 있었다.
//
// 이 스펙이 잠그는 것
//   ① 스위치가 **서버 값**을 읽어 표시한다(화면이 자기 기억을 말하지 않는다).
//   ② 켜면 set_app_setting 이 실제로 불리고, **되읽은 값**으로 화면이 바뀐다.
//   ③ 저장이 거부되면(운영자 아님·RLS) 성공으로 보이지 않고 상태가 되돌아온다.
//   ④ '이 앱이 쓰는 값' 이 서버 값을 따라온다 — 그게 '연동됐다' 의 정의다.
//   ⑤ 켜기 전 선행 조건(20260911g) 경고가 꺼짐일 때만 선다.
//
// 세션은 가짜(로컬), 데이터는 page.route — 운영 DB 에 아무것도 보내지 않는다(_fixtures 가드).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-00000000ad11';
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

type Opts = {
  /** app_settings 초기값 */
  settings?: Record<string, string>;
  /** set_app_setting 을 거부한다(운영자 아님 흉내) */
  denySave?: boolean;
  /** app_settings 읽기를 실패시킨다 */
  readFail?: boolean;
};

/** 관리자 세션을 로컬에만 심고, app_settings 를 메모리 저장소로 흉내 낸다. */
async function bootSwitches(page: Page, opts: Opts = {}) {
  const store: Record<string, string> = { ...(opts.settings ?? {}) };
  const saves: { key: string; value: string }[] = [];
  const denied = json({ message: 'permission denied for function set_app_setting', code: '42501' }, 403);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET'
    ? r.fulfill(json({
      id: UID, name: '운영자', nickname: '운영자', role: 'admin', approved: true, status: 'active',
      venue_id: null, activity_points: 0, created_at: '2026-01-01T00:00:00Z',
      agreed_to_terms: true, consented_legal_version: 2,
    }))
    : r.fallback()));

  // app_settings 읽기 — maybeSingle 이라 단건 객체(또는 null)를 돌려준다.
  await page.route(/\/rest\/v1\/app_settings\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    if (opts.readFail) return r.fulfill(json({ message: 'permission denied for table app_settings', code: '42501' }, 403));
    const m = /key=eq\.([a-z_0-9]+)/.exec(r.request().url());
    const k = m?.[1] ?? '';
    return r.fulfill(json(k in store ? { value: store[k] } : null));
  });

  // 다른 관리 목록은 비워 둔다(이 스펙의 관심 밖).
  for (const t of ['schedules', 'venues', 'community_posts', 'marketplace_notices', 'shouts', 'notifications', 'client_errors', 'community_ads', 'home_banners']) {
    await page.route(new RegExp(`/rest/v1/${t}\\?`), (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
  }

  // ⚠ set_app_setting 라우트는 _fixtures 의 쓰기 차단보다 **나중에** 걸어야 이긴다.
  await page.route(/\/rest\/v1\/rpc\/set_app_setting/, async (r) => {
    if (r.request().method() !== 'POST') return r.fallback();
    if (opts.denySave) return r.fulfill(denied);
    const body = JSON.parse(r.request().postData() || '{}') as { p_key?: string; p_value?: string };
    const key = body.p_key ?? '';
    const value = body.p_value ?? '';
    saves.push({ key, value });
    if (value === '') delete store[key]; else store[key] = value;   // 서버 규약: 빈 문자열 = 해제
    return r.fulfill(json(null));
  });
  await page.route(/\/rest\/v1\/rpc\//, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));

  await stabilizeBackstack(page);
  await page.goto('/?tab=admin');
  await dismissOverlays(page);

  const nav = page.getByRole('button', { name: '기능 스위치', exact: true }).first();
  await expect(nav, '관리자 화면에 "기능 스위치" 섹션이 없다').toBeVisible({ timeout: 25_000 });
  await nav.click();
  await expect(page.getByTestId('switch-identity')).toBeVisible({ timeout: 10_000 });
  return { store, saves };
}

const toggle = (page: Page) => page.getByTestId('switch-identity-toggle');
const state = (page: Page) => page.getByTestId('switch-identity-state');

test.describe('관리자 → 기능 스위치 · 본인인증/매장이용권', () => {
  test('🔴 서버 값이 없으면 "꺼짐" 으로, 저장값은 (없음) 으로 정직하게 표시된다', async ({ page }) => {
    await bootSwitches(page);
    await expect(state(page)).toHaveText('꺼짐');
    await expect(page.getByTestId('switch-identity-server')).toHaveText('(없음)');
    await expect(page.getByTestId('switch-identity-live')).toHaveText('off');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('서버 값이 on 이면 켜짐으로 읽어 온다 — 화면이 자기 기억이 아니라 서버를 말한다', async ({ page }) => {
    await bootSwitches(page, { settings: { identity_voucher_enabled: 'on' } });
    await expect(state(page)).toHaveText('켜짐');
    await expect(page.getByTestId('switch-identity-server')).toHaveText('on');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('🔴 켜면 set_app_setting 이 on 으로 불리고, 되읽은 값으로 화면이 바뀐다', async ({ page }) => {
    const { saves } = await bootSwitches(page);
    await expect(state(page)).toHaveText('꺼짐');
    await toggle(page).click();
    await expect(state(page)).toHaveText('켜짐', { timeout: 10_000 });
    expect(saves, 'set_app_setting 이 불리지 않았다 — 화면에서만 켜졌다').toEqual([
      { key: 'identity_voucher_enabled', value: 'on' },
    ]);
    await expect(page.getByTestId('switch-identity-server')).toHaveText('on');
  });

  test('🔴 연동 확인 — 켠 뒤 "이 앱이 쓰는 값" 이 서버 값을 따라온다', async ({ page }) => {
    await bootSwitches(page);
    await expect(page.getByTestId('switch-identity-live')).toHaveText('off');
    await toggle(page).click();
    // refreshIdentityFlag() 가 구독자에게 통지해야 이 칸이 바뀐다. 안 바뀌면 저장만 되고 앱은 모르는 상태다.
    await expect(page.getByTestId('switch-identity-live'), '앱이 쓰는 값이 서버를 따라오지 않았다 — 연동 끊김')
      .toHaveText('on', { timeout: 10_000 });
  });

  test('🔴 저장이 거부되면 성공으로 보이지 않고 상태가 되돌아온다', async ({ page }) => {
    await bootSwitches(page, { denySave: true });
    await expect(state(page)).toHaveText('꺼짐');
    await toggle(page).click();
    // 낙관적 UI 가 실패를 덮으면 여기서 '켜짐' 이 된다 — 그게 이 앱이 반복해서 겪은 거짓말이다.
    await expect(state(page), '거부됐는데 켜진 것처럼 보인다').toHaveText('꺼짐', { timeout: 10_000 });
    await expect(page.getByTestId('switch-identity-server')).toHaveText('(없음)');
  });

  test('읽기 실패는 빈 상태가 아니라 오류로 보인다', async ({ page }) => {
    await bootSwitches(page, { readFail: true });
    const card = page.getByTestId('switch-identity');
    await expect(card.getByText(/다시 시도|불러오지|실패/).first()).toBeVisible({ timeout: 10_000 });
    // 못 읽은 동안에는 토글이 잠겨 있어야 한다 — 모르는 값을 덮어쓰지 않는다.
    await expect(toggle(page)).toBeDisabled();
  });

  test('🔴 켜기 전 선행 마이그레이션 경고가 꺼짐일 때만 선다', async ({ page }) => {
    await bootSwitches(page);
    await expect(page.getByText('20260911g').first(), '켜기 전 경고가 없다').toBeVisible();
    await toggle(page).click();
    await expect(state(page)).toHaveText('켜짐', { timeout: 10_000 });
    await expect(page.getByText('20260911g'), '이미 켠 뒤에도 경고가 남아 있다').toHaveCount(0);
  });
});

test.describe('관리자 → 기능 스위치 · 클락 광고(전 매장 공통)', () => {
  test('등록된 광고가 없으면 그 사실을 말한다', async ({ page }) => {
    await bootSwitches(page);
    const card = page.getByTestId('switch-clock-ad');
    await expect(card).toBeVisible();
    await expect(card.getByText('등록된 광고가 없습니다', { exact: false })).toBeVisible();
    await expect(card.getByText('전 매장 공통').first(), '전역 설정임을 밝히지 않는다').toBeVisible();
  });

  test('저장된 크기를 읽어 눌린 상태로 표시한다', async ({ page }) => {
    await bootSwitches(page, { settings: { clock_ad_size: 'lg' } });
    const card = page.getByTestId('switch-clock-ad');
    await expect(card.getByRole('button', { name: '크게', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByRole('button', { name: '작게', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test('🔴 크기 저장이 거부되면 되돌아간다 — 새로고침하면 원래대로이던 침묵 실패', async ({ page }) => {
    await bootSwitches(page, { settings: { clock_ad_size: 'sm' }, denySave: true });
    const card = page.getByTestId('switch-clock-ad');
    await card.getByRole('button', { name: '크게', exact: true }).click();
    await expect(card.getByRole('button', { name: '작게', exact: true }), '거부됐는데 크기가 바뀐 채로 남았다')
      .toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  });

  test('크기를 바꾸면 서버에 저장된다', async ({ page }) => {
    const { saves } = await bootSwitches(page, { settings: { clock_ad_size: 'sm' } });
    const card = page.getByTestId('switch-clock-ad');
    await card.getByRole('button', { name: '보통', exact: true }).click();
    await expect(card.getByRole('button', { name: '보통', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(saves).toEqual([{ key: 'clock_ad_size', value: 'md' }]);
  });
});
