// R4-03(2026-10-04) — 포스터 상세 '꾹 눌러 참가 신청' 성공 뒤 홈 바인 요청 배너(myBuyinReqs)를 다시 읽는가.
// 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit4-regress-connect-1004.md#R4-03
// 형제 두 경로(QR ?buyin= · 홈 게임 선택 시트)는 보낸 뒤 getMyBuyinRequestsToday 를 다시 부른다. 포스터 경로만 안 불렀다.
// 목 환경엔 websocket 이 없어 구독으로 갱신되는 경우와 구분이 안 된다 → '재조회 RPC 호출 횟수'로 단언한다.
// ⚠ 가짜 env 로 빌드한 서버에서만 의미가 있다(env 없으면 mock 모드라 page.route 가 안 먹는다) — 메모: buyin-box-fake-env-e2e.
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';
import { kstDay } from './_schedules';
import { LEGAL_VERSION } from '../src/lib/legalVersion';

// 세션 키는 supabase URL 의 서브도메인에서 나온다 — 운영 키와 가짜 env 빌드 키(e2efake) 둘 다 심는다.
const KEYS = ['sb-idsxiqspecrucvfvtgbw-auth-token', 'sb-e2efake-auth-token'];
const UID = '00000000-0000-4000-8000-00000000c104';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const SESSION = {
  access_token: [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: exp() }), 'e2e'].join('.'),
  refresh_token: 'e2e-r404', token_type: 'bearer', expires_in: 3600, expires_at: exp(),
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'r404@example.com', app_metadata: { provider: 'email' }, user_metadata: { name: 'R404' }, created_at: '2026-01-01T00:00:00Z' },
};
const PROFILE = { id: UID, name: 'R404', nickname: 'R404', role: 'user', approved: true, status: 'active', activity_points: 0,
  agreed_to_terms: true, consented_legal_version: LEGAL_VERSION, created_at: '2026-01-01T00:00:00Z' };
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function mockAll(page: Page) {
  await page.addInitScript(([ks, v]) => { for (const k of ks) { try { localStorage.setItem(k, v); } catch { /* 차단 */ } } }, [KEYS, JSON.stringify(SESSION)] as [string[], string]);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/(?!rpc\/)/, (r: Route) => (['GET', 'HEAD'].includes(r.request().method()) ? r.fulfill(json([])) : r.abort()));
  await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(PROFILE)) : r.abort()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(SESSION.user)));
}

test('R4-03 포스터 상세 참가 신청 성공 뒤 홈 바인 요청 배너를 다시 읽는다 (390)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAll(page);
  const SID = 'e2e-r404-today';
  const row = {
    id: SID, title: 'R404 오늘 대회', venue_id: 'e2e-r404-venue', pub_name: 'R404 홀덤펍', region: '서울', address: '서울시 강남구',
    date: kstDay(0), start_time: '23:30:00', duration: '6시간', format: 'MTT', guaranteed: true, prize_pool: 1_000_000,
    prize_percent: null, is_competition: false, grade: null, blinds: null, reg_close_time: null, buy_in: { amount: 50_000 },
    seats: null, structure: null, description: null, side_events: null, ranking_prizes: null, partners: null, promotions: null,
    payment_methods: null, rules: null, poster_url: null, poster_color: null, display_order: 1, is_premium: false,
    premium_until: null, owner_id: 'e2e-r404-owner', unread_qna_count: 0, approved: true, view_count: 0, rejected_at: null, reject_reason: null,
  };
  await page.route(/\/rest\/v1\/schedules\?/, (r) => {
    const single = /vnd\.pgrst\.object\+json/.test(r.request().headers()['accept'] ?? '');
    return r.fulfill(json(single ? row : [row]));
  });
  let reads = 0, sends = 0;
  await page.route(/\/rest\/v1\/rpc\/get_my_buyin_requests_current/, (r) => { reads++; return r.fulfill(json([])); });
  await page.route(/\/rest\/v1\/rpc\/request_buyin/, (r) => { sends++; return r.fulfill(json('R404 홀덤펍')); });

  await page.goto(`/?s=${SID}`);
  const hold = page.getByRole('button', { name: /꾹 눌러 참가 신청/ });
  await expect(hold).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => reads, { message: '로그인 직후 첫 조회(App 마운트)', timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(800);   // 첫 조회·focus 갱신이 가라앉은 뒤 기준선
  const before = reads;

  // HoldToConfirmButton 은 0.7초 꾹 누르면 실행된다(pointerdown → 700ms → onConfirm)
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();

  await expect.poll(() => sends, { message: 'request_buyin 이 나가야 한다(측정 유효성)', timeout: 10_000 }).toBe(1);
  await expect.poll(() => reads - before, { message: '신청 성공 뒤 get_my_buyin_requests_current 재조회 횟수', timeout: 5_000 }).toBeGreaterThanOrEqual(1);
});
