// 쪽지 스레드 경합(P0-03) — 느린 이전 상대 응답이 현재 상대 대화를 덮지 않고,
// 전송 결과가 클릭 시점 상대와 무관하게 '지금 보고 있는' 화면에 붙지 않는가.
//
// 옛 코드에서 왜 실패하는가:
//  · loadThread 의 then 에 '지금도 이 상대인가' 비교가 없어, X1(응답 붙잡힘) → 뒤로 → X2(즉시) 뒤 X1 응답이
//    setMsgs(X1) 로 덮었다 — 헤더는 '상대X2' 인데 본문이 X1 과의 대화가 된다.
//  · handleSend 는 await 뒤 setMsgs 를 현재 화면에 무조건 반영해, 전송 중 다른 상대를 열면 방금 보낸 쪽지가
//    그 상대의 대화에 나타났다(서버 데이터는 정상 — 화면만 오염, 사용자는 '엉뚱한 사람에게 보냈다'고 믿는다).
//    모바일 LTE 의 insert 왕복(수백 ms~수 초)이 이 창이다. 고정 지연 대신 gate 로 순서를 고정한다.
// 세션은 가짜(voucher-sheet-open.spec 3종 세트). 운영 DB 에는 쓰지 않는다 — 전송 POST 는 route 가 위조하고
// 읽음 PATCH 는 _fixtures 가드가 끊는다.
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-000000000001';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** 서명 없는 JWT — supabase-js 는 클라이언트에서 디코드만 한다(만료를 읽어야 세션을 유지한다) */
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: UID, aud: 'authenticated', role: 'authenticated',
    email: 'e2e@example.com', app_metadata: {}, user_metadata: { name: 'E2E' },
    created_at: new Date().toISOString(),
  },
};
const X1 = '11111111-1111-4111-8111-111111111111';
const X2 = '22222222-2222-4222-8222-222222222222';
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const row = (id: string, sender: string, recipient: string, body: string, agoMs = 0) => ({
  id, sender_id: sender, recipient_id: recipient, body,
  created_at: new Date(Date.now() - agoMs).toISOString(), read_at: null, sender_deleted: false, recipient_deleted: false,
});
function gate() {
  let release!: () => void;
  const p = new Promise<void>((r) => { release = r; });
  return { wait: () => p, release };
}

/** 가짜 세션 부팅 + 쪽지 라우트: 목록은 즉시, X1 스레드·전송 POST 는 문(gate)이 열릴 때까지 붙잡는다 */
async function boot(page: Page, g: { x1: ReturnType<typeof gate>; send: ReturnType<typeof gate> }) {
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await stabilizeBackstack(page);
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: 'E2E', nickname: 'E2E', role: 'user', status: 'active', activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await page.route(/\/rest\/v1\/rpc\/get_public_profiles/, (r) => r.fulfill(json([
    { id: X1, nickname: '상대X1', name: '상대X1', avatar_color: null },
    { id: X2, nickname: '상대X2', name: '상대X2', avatar_color: null },
  ])));
  await page.route(/\/rest\/v1\/user_messages/, async (r) => {
    const req = r.request();
    const u = decodeURIComponent(req.url());
    if (req.method() === 'POST') {
      // 전송 — insert().select().single() 은 단일 객체를 기대한다. 실제 서버엔 닿지 않는다.
      const b = JSON.parse(req.postData() || '{}') as { recipient_id: string; body: string };
      await g.send.wait();
      return r.fulfill(json(row('m-sent', UID, b.recipient_id, b.body), 201));
    }
    if (req.method() !== 'GET') return r.fallback();   // 읽음 PATCH·HEAD 카운트 → 가드/서버
    if (u.includes(`sender_id.eq.${X1}`)) { await g.x1.wait(); return r.fulfill(json([row('m-x1', X1, UID, 'X1 대화')])); }
    if (u.includes(`sender_id.eq.${X2}`)) return r.fulfill(json([row('m-x2', X2, UID, 'X2 대화')]));
    if (u.includes('order=created_at.desc')) {
      return r.fulfill(json([row('m-x1', X1, UID, 'X1 대화'), row('m-x2', X2, UID, 'X2 대화', 60_000)]));
    }
    return r.fallback();
  });
  await page.goto('/');
  await page.locator('button[aria-label^="알림"]').click();
  await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible({ timeout: 15_000 });
}

const threadRow = (page: Page, name: string) => page.locator('li').filter({ hasText: name }).first();
const header = (page: Page, name: string) => page.locator('h2', { hasText: name });

test('🔴 느린 이전 상대(X1) 응답이 지금 보고 있는 상대(X2)의 대화를 덮지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  const g = { x1: gate(), send: gate() };
  await boot(page, g);

  await threadRow(page, '상대X1').click();          // X1 스레드 조회는 붙잡힌 채 비행 중
  await expect(header(page, '상대X1')).toBeVisible();
  await page.getByRole('button', { name: '뒤로' }).click();
  await threadRow(page, '상대X2').click();          // X2 는 즉시
  await expect(page.getByText('X2 대화')).toBeVisible();

  g.x1.release();                                   // 이제야 X1 응답 도착
  await page.waitForTimeout(1_000);
  await expect(header(page, '상대X2')).toBeVisible();
  await expect(page.getByText('X1 대화'), '늦게 온 X1 의 대화가 X2 화면을 덮었다(loadThread 에 상대 비교 없음)').toHaveCount(0);
  await expect(page.getByText('X2 대화')).toBeVisible();
});

test('🔴 전송 중 다른 상대를 열면 보낸 쪽지가 그 상대의 대화에 붙지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  const g = { x1: gate(), send: gate() };
  g.x1.release();                                   // 이 테스트는 스레드 조회는 즉시, 전송만 붙잡는다
  await boot(page, g);

  await threadRow(page, '상대X1').click();
  await expect(page.getByText('X1 대화')).toBeVisible();
  await page.getByLabel('쪽지 입력').fill('전송 경합 본문');
  await page.getByRole('button', { name: '보내기' }).click();   // POST 붙잡힘 — sending 중
  await page.getByRole('button', { name: '뒤로' }).click();
  await threadRow(page, '상대X2').click();
  await expect(page.getByText('X2 대화')).toBeVisible();

  g.send.release();                                 // X1 에게 보낸 결과가 X2 를 보는 중에 도착
  await page.waitForTimeout(1_000);
  await expect(header(page, '상대X2')).toBeVisible();
  await expect(page.locator('p', { hasText: '전송 경합 본문' }),
    '전송 중 다른 상대를 열었는데 보낸 쪽지가 그 대화에 붙었다(handleSend 결과에 수신자 비교 없음)').toHaveCount(0);
  await expect(page.getByText('X2 대화')).toBeVisible();
});
