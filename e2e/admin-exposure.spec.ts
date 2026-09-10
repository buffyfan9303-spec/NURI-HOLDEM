// 관리자 → 노출 관리 — **화면이 진실을 말하는가** (2026-09-11 오너 지시)
//
// 오너 리포트: "노출 관리 배너 탭에 '등록된 배너가 없습니다' 만 뜬다. 연동이 안 된 것 같다."
// 확인된 원인 셋을 고쳤고, 이 스펙이 그 셋을 잠근다.
//   ① 조회 실패가 '등록된 배너가 없습니다' 로 위장되지 않는다 — 실패는 실패로 보인다.
//   ② 빈 상태 문구가 PosterCarousel 의 실제 동작과 일치한다.
//      (예전 문구는 삭제된 '내장 기본 배너 폴백' 을 표시 중이라 말하고,
//       등록 배너가 캐러셀을 '대신한다' 고 했다 — 실제로는 앞에 붙기만 한다.)
//   ③ 노출 관리 5개 하위 탭이 전부 실제 화면을 렌더한다(빈 껍데기·죽은 탭 없음).
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

/** 관리자 세션을 로컬에만 심고, 관리자 화면이 읽는 목록을 전부 비워 둔다(빈 상태를 보기 위해). */
type Fail = { notices?: boolean; errors?: boolean; users?: boolean };
async function bootAdmin(page: Page, opts: { bannersFail?: boolean; banners?: unknown[]; skipBannerRoute?: boolean; fail?: Fail } = {}) {
  const fail = opts.fail ?? {};
  const denied = json({ message: 'permission denied', code: '42501' }, 403);
  await page.setViewportSize({ width: 1280, height: 900 });   // 운영자는 PC
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    // ⚠ 회원 '목록' 질의(order= 가 붙는다)만 실패시킨다 — 로그인용 단건 조회까지 막으면
    //   관리자로 아예 못 들어가서 검사 자체가 성립하지 않는다.
    if (fail.users && /order=/.test(r.request().url())) return r.fulfill(denied);
    return r.fulfill(json({
      id: UID, name: '운영자', nickname: '운영자', role: 'admin', approved: true, status: 'active',
      venue_id: null, activity_points: 0, created_at: '2026-01-01T00:00:00Z',
      agreed_to_terms: true, consented_legal_version: 2,
    }));
  });
  // 배너 — 실패를 주입할 수 있게 별도 라우트. skipBannerRoute 면 호출부가 직접 건다(요청 수를 세는 테스트).
  if (!opts.skipBannerRoute) await page.route(/\/rest\/v1\/home_banners\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    if (opts.bannersFail) return r.fulfill(json({ message: 'permission denied for table home_banners', code: '42501' }, 403));
    return r.fulfill(json(opts.banners ?? []));
  });
  // 나머지 관리 목록은 빈 배열(빈 상태 문구를 보기 위해). fail 에 지정된 것만 403 으로 돌려준다.
  for (const t of ['schedules', 'venues', 'community_posts', 'marketplace_notices', 'shouts', 'notifications', 'client_errors', 'community_ads']) {
    const shouldFail = (t === 'marketplace_notices' && !!fail.notices) || (t === 'client_errors' && !!fail.errors);
    await page.route(new RegExp(`/rest/v1/${t}\\?`), (r) => {
      if (r.request().method() !== 'GET') return r.fallback();
      return r.fulfill(shouldFail ? denied : json([]));
    });
  }
  await page.route(/\/rest\/v1\/rpc\//, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));

  await stabilizeBackstack(page);
  await page.goto('/?tab=admin');
  await dismissOverlays(page);
}

/** 관리자 화면 본문 — 이 탭만 data-tab 이 없어 '노출 관리' 를 품은 보이는 main 으로 잡는다 */
const adminPane = (page: Page) => page.locator('main').filter({ hasText: '노출 관리' }).first();

/** 관리자 화면의 '노출 관리' 섹션으로 들어가 지정한 하위 탭을 연다 */
async function openExposure(page: Page, sub: string) {
  const section = page.getByRole('button', { name: '노출 관리', exact: true }).first();
  await expect(section, '관리자 화면에 노출 관리 섹션이 없다 — 관리자로 안 들어갔을 수 있다')
    .toBeVisible({ timeout: 25_000 });
  await section.click();
  const pill = page.getByRole('button', { name: sub, exact: true }).first();
  await expect(pill, `노출 관리에 '${sub}' 하위 탭이 없다`).toBeVisible({ timeout: 10_000 });
  await pill.click();
  await page.waitForTimeout(700);
}

test.describe('관리자 → 노출 관리', () => {
  test('🔴 배너 조회가 실패하면 "없음" 이 아니라 실패로 보인다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { bannersFail: true });
    await openExposure(page, '배너');

    // 실패인데 '등록된 배너가 없습니다' 로 위장되면 안 된다 — 이게 오너가 본 그 화면이다
    await expect(page.getByText('등록된 배너가 없습니다'),
      '조회가 403 인데 "등록된 배너가 없습니다" 로 위장했다').toHaveCount(0);
    await expect(page.getByText(/불러오지 못했|다시 시도|실패/).first(),
      '조회 실패가 화면에 전혀 표시되지 않는다').toBeVisible({ timeout: 10_000 });
  });

  test('🔴 배너가 정말 없을 때의 안내가 홈 캐러셀의 실제 동작과 일치한다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { banners: [] });
    await openExposure(page, '배너');

    await expect(page.getByText('등록된 배너가 없습니다')).toBeVisible({ timeout: 10_000 });
    // 삭제된 폴백을 '표시 중' 이라 말하면 안 된다
    await expect(page.getByText(/내장된 기본 배너/),
      '2026-09-10 에 삭제된 폴백을 아직 표시 중이라고 말한다').toHaveCount(0);
    // '대신합니다' 는 거짓 — PosterCarousel 은 [...posters, ...brands, ...dyn] 로 앞에 붙일 뿐이다
    await expect(page.getByText(/이 목록이 홈 캐러셀을 대신/),
      '등록 배너가 브랜드 슬라이드를 대체한다고 잘못 말한다').toHaveCount(0);
    await expect(page.getByText(/브랜드 슬라이드/),
      '지금 무엇이 도는지(브랜드 슬라이드) 를 말하지 않는다').toBeVisible();
  });

  test('🔴 등록된 배너가 있으면 목록으로 서고 상태 배지가 붙는다', async ({ page }) => {
    test.setTimeout(90_000);
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    await bootAdmin(page, {
      banners: [{
        id: 'bbbbbbbb-0000-4000-8000-000000000001', title: '테스트 배너', subtitle: '부제',
        image_url: '/favicon.png', link_url: '/?tab=browse', sort_order: 0,
        starts_at: today, ends_at: null, active: true,
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
      }],
    });
    await openExposure(page, '배너');

    // ⚠ 관리자 pane 은 다른 탭과 달리 data-tab 이 없다(App.tsx:3284 조건부 렌더) — 보이는 main 으로 좁힌다.
    //   좁히지 않으면 홈 캐러셀에 숨어 있는 같은 제목의 슬라이드가 먼저 잡힌다.
    const admin = adminPane(page);
    await expect(admin.getByText('등록된 배너가 없습니다'), '배너가 있는데 없다고 말한다').toHaveCount(0);
    await expect(admin.getByText('테스트 배너').filter({ visible: true }).first(),
      '등록된 배너가 관리 목록에 없다').toBeVisible({ timeout: 10_000 });
    await expect(admin.getByText('게재중').filter({ visible: true }).first(),
      '오늘 시작·활성인데 게재중 배지가 없다').toBeVisible();
  });

  test('🔴 노출 관리 5개 하위 탭이 전부 실제 화면을 그린다 — 빈 껍데기가 없다', async ({ page }) => {
    test.setTimeout(120_000);
    await bootAdmin(page, { banners: [] });
    const section = page.getByRole('button', { name: '노출 관리', exact: true }).first();
    await expect(section).toBeVisible({ timeout: 25_000 });
    await section.click();

    const panel = adminPane(page);
    for (const sub of ['배너', '광고', '외치기', '게시물', '공지']) {
      const pill = page.getByRole('button', { name: sub, exact: true }).first();
      await expect(pill, `하위 탭 '${sub}' 이 없다`).toBeVisible({ timeout: 10_000 });
      await pill.click();
      await page.waitForTimeout(600);
      // 탭을 눌렀는데 아무것도 안 그려지면(=죽은 탭) 텍스트가 거의 없다
      const chars = await panel.evaluate((el) => (el.textContent ?? '').replace(/\s+/g, '').length);
      expect(chars, `'${sub}' 탭이 사실상 빈 화면이다(글자 ${chars}자)`).toBeGreaterThan(80);
    }
  });

  // ③ 등록 직후 홈 캐러셀도 갱신되는가 — 공지에만 있던 배선을 배너에도 이었다(App.reloadHomeBanners).
  //    이게 없으면 저장은 되는데 같은 세션의 홈은 부팅 때 받은 목록을 계속 들고 있어 '안 나온다' 로 읽힌다.
  // ③ 배너를 바꾸면 홈 캐러셀 조회가 다시 도는가 — 공지에만 있던 배선을 배너에도 이었다(App.reloadHomeBanners).
  //    이게 없으면 저장은 되는데 같은 세션의 홈은 부팅 때 받은 목록을 계속 들고 있어 '안 나온다' 로 읽힌다.
  //    등록(submit)은 이미지 업로드가 선행돼야 하므로, 같은 changed() 를 타는 **노출 토글**로 확인한다.
  test('🔴 배너 노출을 토글하면 홈 캐러셀 조회가 다시 돈다 (onChanged 배선)', async ({ page }) => {
    test.setTimeout(90_000);
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const row = {
      id: 'bbbbbbbb-0000-4000-8000-000000000009', title: '배선 확인용 배너', subtitle: '',
      image_url: '/favicon.png', link_url: null, sort_order: 0,
      starts_at: today, ends_at: null, active: true,
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    };
    // ⚠ 두 조회는 URL 이 완전히 같다(둘 다 select=*&order=…). 대신 getActiveHomeBanners 만
    //   같은 Promise.all 에서 킬스위치 설정(app_settings key=home_banner_fallback)을 함께 읽는다 —
    //   그 요청 수가 '홈 캐러셀 피드가 다시 돌았는가' 의 정확한 신호다.
    const hits = { active: 0, write: 0 };
    await page.route(/\/rest\/v1\/home_banners/, (r) => {
      const req = r.request();
      if (req.method() !== 'GET') { hits.write += 1; return r.fulfill(json({}, 204)); }
      return r.fulfill(json([row]));
    });
    await page.route(/\/rest\/v1\/app_settings/, (r) => {
      if (r.request().method() !== 'GET') return r.fallback();
      if (/home_banner_fallback/.test(r.request().url())) hits.active += 1;
      return r.fulfill(json(null));
    });
    await bootAdmin(page, { skipBannerRoute: true });
    await openExposure(page, '배너');

    const admin = adminPane(page);
    await expect(admin.getByText('배선 확인용 배너').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
    const beforeActive = hits.active;

    await admin.getByRole('button', { name: '켜짐', exact: true }).first().click();
    await page.waitForTimeout(1800);

    expect(hits.write, '토글 요청이 나가지 않았다').toBeGreaterThan(0);
    expect(hits.active,
      `배너를 바꿨는데 홈 캐러셀 조회가 다시 돌지 않았다(before ${beforeActive} / after ${hits.active}) — onChanged 배선이 끊겼다`)
      .toBeGreaterThan(beforeActive);
  });

  // ④ 응답을 기다리는 동안 "없습니다" 라고 단정하지 않는다 (2026-09-11 2차).
  //    ①은 **거부되는** 실패만 갈랐다. 응답이 늦거나 매달리면 — supabase 클라이언트에 타임아웃이
  //    없어 catch 가 영영 안 돈다 — 예전 화면과 글자 하나 다르지 않은 문구가 계속 서 있었다.
  test('🔴 배너 목록을 기다리는 동안에는 "없습니다" 라고 말하지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    let release: (() => void) | null = null;
    const held = new Promise<void>((r) => { release = r; });
    await page.route(/\/rest\/v1\/home_banners/, async (r) => {
      if (r.request().method() !== 'GET') return r.fulfill(json({}, 204));
      await held;                       // 응답을 붙들어 '대기 중' 을 재현한다
      return r.fulfill(json([]));
    });
    await bootAdmin(page, { skipBannerRoute: true });
    await openExposure(page, '배너');

    const admin = adminPane(page);
    // 아직 아무 응답도 안 왔다 — 여기서 단정하면 그게 오너가 본 화면이다
    await expect(admin.getByText('등록된 배너가 없습니다'),
      '응답 전인데 "등록된 배너가 없습니다" 라고 단정했다').toHaveCount(0);
    await expect(admin.locator('[aria-busy="true"]'),
      '대기 중 표시(스켈레톤)가 없다').toBeVisible({ timeout: 5_000 });

    release!();
    // 응답이 오면 그제야 빈 상태를 말한다
    await expect(admin.getByText('등록된 배너가 없습니다')).toBeVisible({ timeout: 10_000 });
  });
});

// ── 2026-09-11 2차: 배너에서 고친 규격을 형제 화면에도 적용했다. 그 셋을 잠근다. ──
test.describe('관리자 — 실패를 "없음" 으로 위장하지 않는다', () => {
  test('🔴 공지 탭 — 조회 실패가 "등록된 공지가 없습니다" 로 위장되지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { banners: [], fail: { notices: true } });
    await openExposure(page, '공지');
    const admin = adminPane(page);
    await expect(admin.getByText('등록된 공지가 없습니다'),
      '조회가 403 인데 "공지가 없습니다" 로 위장했다').toHaveCount(0);
    await expect(admin.getByText(/불러오지 못했|다시 시도|권한/).first(),
      '조회 실패가 화면에 안 뜬다').toBeVisible({ timeout: 10_000 });
  });

  test('🔴 오류 로그 — 조회 실패를 "깨끗합니다" 라고 안심시키지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { banners: [], fail: { errors: true } });
    const section = page.getByRole('button', { name: '오류 로그', exact: true }).first();
    await expect(section).toBeVisible({ timeout: 25_000 });
    await section.click();
    await page.waitForTimeout(1000);
    const admin = page.locator('main').filter({ hasText: '수집 내역' }).first();
    await expect(admin.getByText(/깨끗합니다/),
      '조회가 403 인데 "깨끗합니다" 라고 안심시켰다 — 감시 화면에서 가장 위험한 거짓말이다').toHaveCount(0);
    await expect(admin.getByText(/불러오지 못했|다시 시도|권한/).first(),
      '조회 실패가 화면에 안 뜬다').toBeVisible({ timeout: 10_000 });
  });

  test('🔴 회원 관리 — 조회 실패가 "조건에 맞는 회원이 없습니다" 로 위장되지 않는다', async ({ page }) => {
    test.setTimeout(90_000);
    await bootAdmin(page, { banners: [], fail: { users: true } });
    const section = page.getByRole('button', { name: '회원 관리', exact: true }).first();
    await expect(section).toBeVisible({ timeout: 25_000 });
    await section.click();
    await page.waitForTimeout(1200);
    const admin = page.locator('main').filter({ hasText: '회원 관리' }).first();
    await expect(admin.getByText('조건에 맞는 회원이 없습니다'),
      '조회가 403 인데 "회원이 없습니다" 로 위장했다').toHaveCount(0);
    await expect(admin.getByText(/불러오지 못했|다시 시도|권한/).first(),
      '조회 실패가 화면에 안 뜬다').toBeVisible({ timeout: 10_000 });
  });
});
