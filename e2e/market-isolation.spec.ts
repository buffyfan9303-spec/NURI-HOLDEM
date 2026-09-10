// 장터·커뮤니티 — 조회 실패를 '없음'으로 위장하지 않고, 스레드·그룹이 바뀔 때 이전 화면이 새 화면에 남지 않는다.
//
// 잠그는 것(WP2-p0-market-group):
//  ① 메시지함에서 구매자 A 스레드를 보다가 B 로 넘어갔는데 B 조회가 실패하면 — A 와의 대화가 B 이름 아래 남으면 안 된다.
//     '못 불러왔다'는 카드와 다시 시도 버튼이 보여야 한다(ChatPane key + err 분기).
//  ② 메시지함·내 판매목록·찜한 매물 — 조회 실패에 '아직 없습니다'가 아니라 오류·다시 시도가 보인다.
//     세 모달의 닫기 버튼 실효 히트영역은 44px 이상이다(hit 토큰).
//  ③ 게시글 상세 — 목록의 '고정'·'끌올' 배지가 상세에도 있다. 댓글 조회 실패는 빈 목록이 아니라 오류 카드다.
//  ④ 그룹 페이지 — 채팅 조회가 실패하면 '불러오는 중…'이 영원히 남지 않고 다시 시도가 보인다.
//
// 세션은 **가짜**를 심는다(voucher-sheet-open.spec 3종 세트: 디코드 가능한 JWT · /auth/v1/user · profiles).
// 운영 DB 에는 쓰지 않는다 — 읽기는 page.route 로 갈아끼우고, 쓰기(읽음 처리·조회수)는 _fixtures 가드가 끊는다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000a1';
const B1  = '00000000-0000-4000-8000-0000000000b1';
const B2  = '00000000-0000-4000-8000-0000000000b2';
const L1  = '11111111-1111-4111-8111-1111111111c1';
const G1  = '22222222-2222-4222-8222-2222222222d1';

/** 서명 없는 JWT — supabase-js 는 클라이언트에서 디코드만 한다. 아무 문자열이면 getSession() 이 세션을 버린다. */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'seller@example.com',
          app_metadata: {}, user_metadata: { name: '판매자' }, created_at: new Date().toISOString() },
};
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const fail = json({ message: 'injected' }, 500);

const listingRow = {
  id: L1, title: '테스트 매물 칩세트', category: 'chips', description: '테스트', price: 50_000, condition: 'A',
  status: 'on_sale', images: [], region: '서울', shipping_available: true, pickup_only: false,
  seller_id: UID, seller_name: '판매자', seller_avatar_color: '#5A6175', seller_trade_count: 0, seller_verified: false,
  created_at: new Date().toISOString(), view_count: 0, like_count: 0, comment_count: 0,
};
const msg = (buyer: string, content: string, agoMs: number) => ({
  id: `${buyer.slice(-2)}-${agoMs}`, listing_id: L1, buyer_id: buyer, sender_id: buyer, content,
  created_at: new Date(Date.now() - agoMs).toISOString(),
});

/** 가짜 로그인 세션 + 부팅에 필요한 최소 목킹. 이후 route 는 테스트별로 얹는다. */
async function bootAs(page: Page) {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 }); // 유저 = 모바일 99%
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/auth\/v1\/token/, (r) => r.fulfill(json(FAKE)));
  // ⚠ getMyProfile 은 .single() — 배열로 주면 user.id 가 undefined 인 반쪽 로그인이 된다(settle-pane.spec 기록)
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: '판매자', nickname: '판매자', role: 'user', status: 'active',
    activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await stabilizeBackstack(page);
}

async function gotoMarket(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '장터', exact: true }).first().click({ timeout: 15_000 });
}

/** hit 토큰의 ::after 투명 확장까지 합친 실효 히트영역 — live-card-fit.spec 의 ::before 합산과 같은 방식 */
async function hitArea(btn: import('@playwright/test').Locator) {
  return btn.evaluate((el) => {
    const a = getComputedStyle(el, '::after');
    const r = el.getBoundingClientRect();
    return { w: Math.max(r.width, parseFloat(a.width) || 0), h: Math.max(r.height, parseFloat(a.height) || 0) };
  });
}

test('🔴 메시지함 — 스레드를 갈아탔는데 조회가 실패해도 이전 상대의 대화가 남지 않는다', async ({ page }) => {
  await bootAs(page);
  await page.route(/\/rest\/v1\/marketplace_listings\?/, (r) => r.fulfill(json([listingRow])));
  await page.route(/\/rest\/v1\/rpc\/get_public_profiles/, (r) => r.fulfill(json([
    { id: B1, nickname: '구매자B1', name: 'B1', avatar_color: '#0EA5E9' },
    { id: B2, nickname: '구매자B2', name: 'B2', avatar_color: '#0EA5E9' },
  ])));
  await page.route(/\/rest\/v1\/listing_message_reads\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
  await page.route(/\/rest\/v1\/listing_messages\?/, (r) => {
    const url = r.request().url();
    if (url.includes(`buyer_id=eq.${B1}`)) return r.fulfill(json([msg(B1, 'B1 전용 대화 본문', 60_000)]));
    if (url.includes(`buyer_id=eq.${B2}`)) return r.fulfill(fail);       // B2 스레드 조회만 실패
    // 메시지함 목록(order=created_at.desc) — 두 스레드
    return r.fulfill(json([msg(B2, 'B2 문의', 10_000), msg(B1, 'B1 문의', 60_000)]));
  });
  await gotoMarket(page);

  await page.getByRole('button', { name: /메시지함/ }).click();
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.getByRole('button', { name: /구매자B1/ }).click({ timeout: 15_000 });
  await expect(dialog.getByText('B1 전용 대화 본문')).toBeVisible({ timeout: 10_000 });

  await dialog.getByRole('button', { name: '목록으로' }).click();
  await dialog.getByRole('button', { name: /구매자B2/ }).click({ timeout: 10_000 });
  await expect(dialog.getByRole('button', { name: /다시 시도/ }), '조회 실패인데 재시도가 없다').toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText('B1 전용 대화 본문'), 'B1 과의 대화가 B2 화면에 남았다').toHaveCount(0);
  await expect(dialog.getByText('구매자에게 답장을 보내보세요'), '실패를 빈 대화로 위장했다').toHaveCount(0);
});

test('🔴 내 장터 3목록 — 조회 실패는 오류·다시 시도로 보이고, 닫기 버튼은 44px 히트영역', async ({ page }) => {
  await bootAs(page);
  await page.route(/\/rest\/v1\/listing_messages\?/, (r) => r.fulfill(fail));
  await page.route(/\/rest\/v1\/listing_likes\?/, (r) => r.fulfill(fail));
  await page.route(/\/rest\/v1\/marketplace_listings\?/, (r) =>
    r.fulfill(r.request().url().includes('seller_id=eq.') ? fail : json([listingRow])));
  await gotoMarket(page);

  const cases: [RegExp, string][] = [
    [/메시지함/, '아직 대화가 없습니다'],
    [/내 판매목록/, '등록한 판매글이 없습니다'],
    [/찜한 매물/, '찜한 매물이 없습니다'],
  ];
  for (const [opener, emptyText] of cases) {
    await page.getByRole('button', { name: opener }).click();
    const dialog = page.locator('[role="dialog"]').last();
    await expect(dialog.getByRole('button', { name: /다시 시도/ }), `${opener}: 조회 실패인데 재시도가 없다`).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(emptyText), `${opener}: 실패를 빈 상태로 위장했다`).toHaveCount(0);

    const close = dialog.getByRole('button', { name: '닫기' });
    const hit = await hitArea(close);
    console.log(`[닫기 히트영역 ${opener}]`, JSON.stringify(hit));
    expect(hit.w, '닫기 버튼 히트영역이 44px 미만').toBeGreaterThanOrEqual(44);
    expect(hit.h, '닫기 버튼 히트영역이 44px 미만').toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });
  }
});

// ── 게시글 상세: 고정·끌올 배지 + 댓글 실패 카드 ─────────────────────────────
const postRow = (id: string, title: string, over: Record<string, unknown>) => ({
  id, user_id: '00000000-0000-4000-8000-0000000000e1', user_name: '작성자', user_role: 'user', user_color: '#5A6175',
  content: `${title} 본문`, title, category: 'free', created_at: new Date(Date.now() - 3_600_000).toISOString(),
  like_count: 0, comment_count: 2, view_count: 0, badbeat_count: 0, goodrun_count: 0, cheer_count: 0, bump_count: 0,
  blinded: false, bumped_until: null, pinned_at: null, ...over,
});
const PIN  = postRow('33333333-3333-4333-8333-3333333333a1', '고정 공지글', { pinned_at: new Date().toISOString() });
const BUMP = postRow('33333333-3333-4333-8333-3333333333a2', '끌올된 글',   { bumped_until: new Date(Date.now() + 3_600_000).toISOString() });

test('🔴 게시글 상세 — 목록의 고정·끌올 배지가 상세에도 있고, 댓글 실패는 빈 목록이 아니다', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  // getPosts 는 최신 50건·끌올·고정 세 번 조회한다 — 같은 두 행을 돌려주면 id 로 중복 제거된다.
  await page.route(/\/rest\/v1\/community_posts\?/, (r) => r.fulfill(json([PIN, BUMP])));
  await page.route(/\/rest\/v1\/comments\?/, (r) => r.fulfill(fail)); // 댓글만 실패
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '게시판', exact: true }).first().click();

  const dialog = page.locator('[role="dialog"]').last();
  await page.getByRole('button', { name: /고정 공지글/ }).first().click({ timeout: 15_000 });
  await expect(dialog.getByText('고정', { exact: true }), '상세에 고정 배지가 없다').toHaveCount(1, { timeout: 10_000 });
  await expect(dialog.getByRole('button', { name: /다시 시도/ }), '댓글 조회 실패인데 재시도가 없다').toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText('첫 댓글을 남겨보세요'), '댓글 실패를 빈 목록으로 위장했다').toHaveCount(0);
  await dialog.getByRole('button', { name: '닫기' }).first().click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 5_000 });

  await page.getByRole('button', { name: /끌올된 글/ }).first().click({ timeout: 15_000 });
  await expect(dialog.getByText('끌올', { exact: true }), '비작성자 상세에 끌올 배지가 없다').toHaveCount(1, { timeout: 10_000 });
});

// ── 그룹 페이지: 채팅 조회 실패 → 무한 '불러오는 중…' 금지 ───────────────────
test('🔴 그룹 페이지 — 채팅 조회가 실패하면 무한 로딩이 아니라 다시 시도가 보인다', async ({ page }) => {
  await bootAs(page);
  // 내가 개설한 딜러팀 하나 — 개설자라 멤버 전용 영역(채팅 탭)이 바로 열린다
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{
    id: G1, name: '테스트 딜러팀', region: '서울', address: '', owner_id: UID, approved: true, status: 'active',
    kind: 'dealer_team', join_approval: true, follower_count: 0, display_order: 1, is_paid_ad: false,
    verification_status: 'unverified', images: [], created_at: FAKE.user.created_at,
  }])));
  await page.route(/\/rest\/v1\/group_members\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
  await page.route(/\/rest\/v1\/venue_notices\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/group_messages\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(fail) : r.fallback()));
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '홀덤펍', exact: true }).first().click();
  await page.getByRole('button', { name: /내 커뮤니티 관리/ }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: /테스트 딜러팀/ }).first().click({ timeout: 10_000 });

  await expect(page.getByText('운영 중인 그룹')).toBeVisible({ timeout: 15_000 });
  const panel = page.locator('[data-group-panel]');
  await expect(panel.getByRole('button', { name: /다시 시도/ }), '채팅 조회 실패인데 재시도가 없다').toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('불러오는 중…'), '실패가 무한 로딩으로 남았다').toHaveCount(0);
  await expect(panel.getByText('첫 메시지를 남겨보세요'), '실패를 빈 채팅으로 위장했다').toHaveCount(0);
});
