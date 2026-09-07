// 헤더 [이용권 · 출석] — **첫 클릭에 열리는가**.
//
// 오너 2026-09-08: "우상단 프로필 왼쪽 티켓 아이콘을 누르면 이용권·출석으로 바로 가야 하는데
//                   이거 처음 누르면 안 가지고 두 번 눌러야 이동이 돼".
//
// 정체는 이벤트 페이지에서 이미 실측한 것과 **같은 것**이다(e2e/event-enter.spec.ts):
//   Suspense 경계가 그 업데이트에서 처음 마운트되면 리액트는 폴백을 반드시 커밋하고 최소 ~300ms 유지한다.
//   여기 폴백은 null 이라 화면에 아무 변화가 없어 '눌러도 안 되는' 것으로 보였다.
//
// 잠그는 것: 한 번의 클릭 뒤 시트가 뜨는가, 그리고 그때까지 몇 프레임이 흘렀는가.
// 세션은 **가짜**를 심는다 — 헤더 버튼은 user 유무만 보므로 토큰이 유효할 필요가 없다.
// 시트 안의 조회는 401 로 비어도 상관없다(여기서 재는 것은 '열리는가'다).
import { test, expect } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-000000000001';
/** 서명 없는 JWT — supabase-js 는 클라이언트에서 **디코드만** 한다(검증은 서버 몫).
 *  ⚠ 여기를 'e2e-fake' 같은 아무 문자열로 두면 getSession() 이 만료를 못 읽어 세션을 버린다.
 *    부팅 직후 한 번은 통과했다가 잠시 뒤 조용히 비로그인이 되어, 시트는 열리는데
 *    이용권 조회는 아예 나가지 않는 상태가 됐다(2026-09-08 실측 — 요청 목록에 store_vouchers 0건). */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
    email: 'e2e@example.com', app_metadata: {}, user_metadata: { name: 'E2E' },
    created_at: new Date().toISOString(),
  },
};

test('🔴 티켓 아이콘 — 한 번의 클릭으로 이용권·출석 시트가 열린다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  // GoTrue 와 profiles 도 목킹한다 — 토큰이 가짜라 서버가 401 을 주면 앱은 비로그인으로 부팅한다.
  // 운영 DB 는 건드리지 않는다(응답만 갈아끼운다).
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: FAKE.user.id, name: 'E2E', nickname: 'E2E', role: 'user', status: 'active',
    activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const btn = page.getByRole('button', { name: '이용권 · 출석' });
  await expect(btn, '헤더 티켓 버튼이 없다(로그인 상태가 아님)').toBeVisible({ timeout: 10_000 });

  // 프레임마다 '시트가 떴는가'를 적는다 — 몇 번째 프레임에 떴는지가 곧 체감이다.
  await page.evaluate(() => {
    const w = window as unknown as { __n: number; __at: number; __raf: number };
    w.__n = 0; w.__at = -1;
    const tick = () => {
      w.__n++;
      if (w.__at < 0 && document.querySelector('[role="dialog"]')) w.__at = w.__n;
      w.__raf = requestAnimationFrame(tick);
    };
    w.__raf = requestAnimationFrame(tick);
  });
  const reqs: { url: string; at: number }[] = [];
  page.on('response', (res) => { if (/\.js($|\?)/.test(res.url())) reqs.push({ url: res.url().split('/').pop() || '', at: Date.now() }); });
  const t0 = Date.now();
  await btn.click();
  await page.waitForTimeout(1500);
  console.log('[클릭 후 받은 청크]', JSON.stringify(reqs.filter((r) => r.at >= t0).map((r) => `${r.url} +${r.at - t0}ms`)));
  const r = await page.evaluate(() => {
    const w = window as unknown as { __n: number; __at: number; __raf: number };
    cancelAnimationFrame(w.__raf);
    return { frames: w.__n, openedAtFrame: w.__at };
  });
  console.log('[이용권 시트 열림]', JSON.stringify(r));
  // 한 번의 클릭으로 열려야 한다. 폴백 스로틀에 걸리면 ~300ms(≈18프레임) 동안 아무것도 안 뜬다.
  expect(r.openedAtFrame, '한 번 눌렀는데 시트가 뜨지 않았다').toBeGreaterThan(0);
  expect(r.openedAtFrame, '시트가 뜨기까지 프레임이 너무 많다(폴백 스로틀 의심)').toBeLessThanOrEqual(10);
});

// ── 수동 보내기 · 더블체크(오너 2026-09-08) ─────────────────────────────────
// "수동으로 매장이용권을 보내는 것도 넣어줘야하는데 … 보유한 매장의 매장이용권만 보이게 …
//  보내는 사람이 실수하지 않게 보낼 것인지 확실하게 확인 할 수 있도록 더블체킹하게"
//
// 잠그는 것 셋:
//  ① 보유한 매장만 목록에 뜬다.
//  ② 장수를 고를 수 있고, 확인 화면이 그 장수를 그대로 말한다.
//  ③ 체크박스를 켜기 전에는 보내기 버튼이 **비활성**이다(더블체크).
const VENUE_A = '11111111-1111-4111-8111-11111111aaaa';
const voucherRow = (i: number) => ({
  id: `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE_A, venue: { name: '누리홀덤 강남점' }, used_venue: null,
  issued_by: VENUE_A, holder_user_id: FAKE.user.id, holder_name: 'E2E',
  title: '웰컴 이용권', status: 'active', used_venue_id: null, used_at: null,
  created_at: new Date().toISOString(), expires_at: null, issue_reason: 'welcome',
});

test('🔴 수동 보내기 — 보유 매장만 · 장수 선택 · 체크 전엔 못 보낸다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: FAKE.user.id, name: 'E2E', nickname: 'E2E', role: 'user', status: 'active',
    activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await page.route(/\/auth\/v1\/token/, (r) => r.fulfill(json(FAKE)));
  await page.route(/\/rest\/v1\/store_vouchers/, (r) => r.fulfill(json([0, 1, 2, 3, 4].map(voucherRow))));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '이용권 · 출석' }).click();


  const card = page.locator('section').filter({ hasText: '수동으로 보내기' }).first();
  await expect(card, '수동 보내기 카드가 없다').toBeVisible({ timeout: 10_000 });
  // ① 보유 매장만 — 목록 행이 정확히 하나(보유한 매장 A)
  const rowBtns = card.getByRole('button');
  await expect(rowBtns).toHaveCount(1);
  await expect(rowBtns.first()).toContainText('누리홀덤 강남점');
  await expect(rowBtns.first()).toContainText('5');

  await rowBtns.first().click();
  const sheet = page.getByRole('dialog', { name: '이용권 보내기' });
  await expect(sheet).toBeVisible();

  // ② 장수 — 3장으로
  await sheet.getByRole('button', { name: '3장', exact: true }).click();
  await expect(sheet.getByLabel('보낼 장수')).toHaveValue('3');
  await sheet.getByRole('button', { name: '다음' }).click();
  await sheet.getByLabel('업주 전화번호').fill('010-1234-5678');
  await sheet.getByRole('button', { name: '받는 곳 확인' }).click();

  // ③ 더블체크 — 체크 전에는 못 보낸다
  const send = sheet.getByTestId('voucher-send-confirm');
  await expect(send).toBeVisible({ timeout: 8_000 });
  await expect(send, '체크도 안 했는데 보내기가 열려 있다').toBeDisabled();
  await expect(sheet).toContainText('3장');
  await expect(sheet, '보낸 뒤 남는 장수를 말해야 한다').toContainText('2장');
  await sheet.locator('input[type="checkbox"]').check();
  await expect(send).toBeEnabled();
});
