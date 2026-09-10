// 겹친 오버레이의 ESC·포커스 계약 — WP8 a11y-modal 회귀 게이트.
//
// ── 무엇을 잠그나 ─────────────────────────────────────────────────────────────
//  ① MODAL-01: 포스터 상세(page Modal) 위에 글쓰기 시트(sheet Modal)를 열고 ESC 한 번 → **위 겹만** 닫힌다.
//     예전엔 Modal 마다 window keydown 에 ESC 리스너를 달아 한 번에 전부 닫혔다.
//     이제 ESC 는 뒤로가기와 같은 backstack LIFO 규칙 하나로 처리된다(lib/backstack.ts handleEscape).
//  ② MODAL-02: 포스터 확대 보기(ImageLightbox)를 키보드로 열면 포커스가 닫기 버튼으로 들어가고,
//     Tab 이 바깥으로 새지 않으며, 닫으면 **연 버튼으로 복원**된다. 닫기 버튼은 44px(TOUCH-01).
//  ③ A11Y-02: 글쓰기 핸드 슬롯에 '버튼 안 버튼' 중첩이 없고, Space 가 슬롯을 고르지 시트를 스크롤시키지 않는다.
//  ④ TOUCH-01(조건부): 이벤트 페이지 닫기 버튼의 실효 히트영역 ≥ 44px — 진행 중 이벤트가 없으면 skip.
//
// 운영 DB 에는 쓰지 않는다 — 세션·프로필·포스터는 page.route 로 만들고, 변이는 _fixtures 가드가 끊는다.
// 세션은 **가짜**(voucher-sheet-open.spec 과 같은 3종 세트) — JWT 는 디코드 가능해야 supabase-js 가 버리지 않는다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';
import { type Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000a1';
const VENUE = '55555555-5555-4555-8555-555555555555';
const SCHED = '66666666-6666-4666-8666-666666666666';
/** 앱의 '오늘'은 KST(kstToday) — settle-pane.spec 과 같은 이유로 UTC 날짜를 쓰지 않는다. */
const kst = (offsetDays: number) => new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'e2e@example.com',
          app_metadata: {}, user_metadata: { name: 'E2E' }, created_at: new Date().toISOString() },
};

/** 며칠 뒤 승인된 포스터 한 건 — poster_url 이 있어야 '포스터 확대 보기' 버튼이 그려진다. */
const scheduleRow = () => ({
  id: SCHED, title: '접근성 테스트 메인', venue_id: VENUE, pub_name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1',
  date: kst(2), start_time: '19:00:00', duration: '5시간', format: 'MTT', guaranteed: true, prize_pool: 1_000_000,
  buy_in: { amount: 60_000 }, approved: true, display_order: 1, is_premium: false, premium_until: null,
  owner_id: UID, unread_qna_count: 0, view_count: 0, is_competition: false, grade: null,
  poster_url: '/nuri-logo.png',
});

/** 포스터 상세(제목 없는 page Modal — backstack.spec 과 같은 마커) */
const detailOf = (page: Page) => page.locator('[role="dialog"][aria-label="전체화면 보기"]');

/** ?s= 딥링크로 포스터 상세를 연다. login=true 면 가짜 세션 + 본인인증 완료 프로필(글쓰기 게이트 통과). */
async function openDetail(page: Page, login: boolean) {
  await page.setViewportSize({ width: 375, height: 812 }); // 유저는 모바일 99%
  if (login) {
    await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
      [KEY, JSON.stringify(FAKE)] as [string, string]);
    await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
    // ci_hash 가 있으면 verified — 본인인증 게이트가 켜져 있어도 글쓰기가 열린다(둘 다 막아 둔다).
    await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
      id: UID, name: 'E2E', nickname: 'E2E', role: 'user', status: 'active', ci_hash: 'e2e',
      activity_points: 0, created_at: FAKE.user.created_at,
    })));
    await page.route(/\/rest\/v1\/app_settings\?.*identity_voucher_enabled/, (r) => r.fulfill(json({ value: 'off' })));
  }
  await page.route(/\/rest\/v1\/schedules\?/, (r) => r.fulfill(json([scheduleRow()])));
  await stabilizeBackstack(page); // 새 탭은 history.length=1 이라 모달이 열리자마자 닫힌다
  await page.goto(`/?s=${SCHED}`);
  const detail = detailOf(page);
  await expect(detail, '포스터 상세가 열리지 않았다').toBeVisible({ timeout: 20_000 });
  return detail;
}

/** 상세 Q&A 탭의 '이 대회 후기 쓰기' → 글쓰기 시트(sheet Modal, 상세 위 z-60) */
async function openWriteSheet(page: Page) {
  await page.getByRole('tab', { name: 'Q&A' }).click();
  await page.getByRole('button', { name: /이 대회 후기 쓰기/ }).click();
  const sheet = page.getByRole('dialog', { name: '글쓰기' });
  await expect(sheet, '글쓰기 시트가 열리지 않았다(로그인·본인인증 게이트?)').toBeVisible({ timeout: 15_000 });
  return sheet;
}

test('🔴 포스터 상세 위 글쓰기 시트 — ESC 한 번은 위 겹만 닫는다', async ({ page }) => {
  test.setTimeout(60_000);
  const detail = await openDetail(page, true);
  const sheet = await openWriteSheet(page);

  await page.keyboard.press('Escape');
  await expect(sheet, 'ESC 로 글쓰기 시트가 안 닫혔다').toHaveCount(0, { timeout: 5_000 });
  await expect(detail, 'ESC 한 번에 아래 포스터 상세까지 같이 닫혔다 — 개별 ESC 리스너 재발').toHaveCount(1);

  // 두 번째 ESC 는 그제야 상세를 닫는다(한 번에 한 겹).
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0, { timeout: 5_000 });
});

test('🔴 포스터 확대 보기 — 열면 닫기 버튼에 포커스, Tab 이 새지 않고, 닫으면 연 버튼으로 복원', async ({ page }) => {
  test.setTimeout(60_000);
  const detail = await openDetail(page, false);
  const zoom = detail.locator('button[aria-label="포스터 확대 보기"]');
  await expect(zoom).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(600); // 고스트 클릭 가드(열린 뒤 400ms 안의 click 무시)를 지난다

  await zoom.focus();
  await page.keyboard.press('Enter');
  const box = page.getByRole('dialog', { name: /확대 보기$/ });
  await expect(box, '라이트박스가 열리지 않았다').toBeVisible({ timeout: 10_000 });

  const close = box.getByRole('button', { name: '닫기' });
  await expect(close, '열렸는데 포커스가 오버레이 아래 버튼에 남아 있다').toBeFocused();
  // 44px 터치 표준 — 전체화면이라 이 버튼이 유일한 탈출구다
  const size = await close.boundingBox();
  expect(size!.width, '닫기 버튼 폭이 44px 미만').toBeGreaterThanOrEqual(44);
  expect(size!.height, '닫기 버튼 높이가 44px 미만').toBeGreaterThanOrEqual(44);

  await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => /확대 보기$/.test(d.getAttribute('aria-label') ?? ''));
    return !!dlg && dlg.contains(document.activeElement);
  });
  expect(inside, 'Tab 을 누르자 포커스가 가려진 상세 페이지로 샜다').toBe(true);

  await page.keyboard.press('Escape');
  await expect(box, 'ESC 로 라이트박스가 안 닫혔다').toHaveCount(0, { timeout: 5_000 });
  await expect(detail, 'ESC 한 번에 아래 포스터 상세까지 닫혔다').toHaveCount(1);
  await expect(zoom, '닫은 뒤 포커스가 연 버튼으로 돌아오지 않았다').toBeFocused();
});

test('🔴 글쓰기 핸드 슬롯 — 버튼 안 버튼 중첩이 없고, Space 는 슬롯을 고르지 시트를 스크롤시키지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await openDetail(page, true);
  const sheet = await openWriteSheet(page);
  await sheet.getByRole('button', { name: '+ 핸드 추가' }).click();
  const hand = sheet.getByTestId('post-form-hand');
  await expect(hand).toBeVisible({ timeout: 10_000 });

  // 중첩 인터랙티브 0 — 가짜 버튼(div role=button) 안에 진짜 버튼이 들어 있으면 보조기술이 하나를 가린다
  await expect(hand.locator('[role="button"] button'), 'div role=button 안에 <button> 이 중첩돼 있다').toHaveCount(0);

  const villain = hand.getByRole('button', { name: '상대 핸드', exact: true });
  await villain.scrollIntoViewIfNeeded();
  await villain.focus();
  const scrollBefore = await page.evaluate(() => {
    let n = document.activeElement?.parentElement ?? null;
    while (n && n.scrollHeight <= n.clientHeight + 1) n = n.parentElement;
    return n ? n.scrollTop : 0;
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    let n = document.activeElement?.parentElement ?? null;
    while (n && n.scrollHeight <= n.clientHeight + 1) n = n.parentElement;
    return { scrollTop: n ? n.scrollTop : 0, pressed: document.activeElement?.getAttribute('aria-pressed') };
  });
  expect(after.pressed, 'Space 로 슬롯이 선택되지 않았다(진짜 버튼이 아니다)').toBe('true');
  expect(after.scrollTop, 'Space 가 시트 본문을 스크롤시켰다(preventDefault 없는 가짜 버튼)').toBe(scrollBefore);
});

// ── 이벤트 페이지 닫기 버튼 hit 영역(TOUCH-01) — 진행 중 이벤트가 없으면 배너가 없어 skip ──
test('이벤트 페이지 닫기 버튼 — 실효 히트영역 44px', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await stabilizeBackstack(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const banner = page.locator('button').filter({ hasText: /오픈 기념|카드 오픈|이벤트/ }).first();
  test.skip(await banner.count() === 0, '진행 중인 이벤트가 없다(홈 배너 없음)');
  await banner.click();
  const close = page.locator('[role="dialog"][aria-label="이벤트"] button[aria-label="닫기"]');
  await expect(close).toBeVisible({ timeout: 15_000 });
  // live-card-fit.spec 과 같은 방식 — 시각 크기와 의사요소 확장분 중 큰 쪽(.hit 은 ::after 를 max(100%,44px) 로 넓힌다)
  const hit = await close.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, '::after');
    return { w: Math.max(r.width, parseFloat(a.width) || 0), h: Math.max(r.height, parseFloat(a.height) || 0) };
  });
  console.log('[이벤트 닫기 히트영역]', JSON.stringify(hit));
  expect(hit.w).toBeGreaterThanOrEqual(44);
  expect(hit.h).toBeGreaterThanOrEqual(44);
});
