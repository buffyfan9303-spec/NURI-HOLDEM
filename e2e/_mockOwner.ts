// 목킹 업주 세션 — **계정 없이** 매장주 화면(내 매장·클락 콘솔·테마 패널)을 연다.
//
// 왜 이게 필요한가
//   운영자 콘솔·테마 패널 스펙은 `E2E_EMAIL/E2E_PASSWORD` 가 있을 때만 돌았다. 그 계정은
//   2026-09-10 오너 결정으로 은퇴했고(운영 테스트 데이터 정리), 그 뒤로 PC 운영자 화면은
//   **한 번도 검사되지 않았다**. 계정을 다시 만드는 방법도 있지만 그건 라이브 서비스에
//   가짜 업주·가짜 매장을 상주시키는 일이라 같은 정리를 또 해야 한다.
//   settle-pane·store-destination 이 이미 쓰고 있는 조리법(가짜 세션 3종 + 응답 갈아끼우기)을
//   한 곳으로 모아 재사용한다 — **운영 DB 쓰기 0**, 결정적, CI 에서 영구히 돈다.
//
// 조리법 3종 (하나라도 빠지면 '반쪽 로그인' 이 된다)
//   ① 디코드 가능한 JWT — supabase-js 는 클라이언트에서 만료만 디코드한다. 아무 문자열이면 세션을 버린다.
//   ② /auth/v1/user · profiles(.single() 이라 **객체**) — 배열로 주면 user.id 가 비어 로그인이 반만 된다.
//   ③ 권한 RPC — 화면은 서버 판정(can_*)을 받아 메뉴를 켠다. 이게 없으면 메뉴가 통째로 닫힌다.
//
// ⚠ 읽기(GET)만 갈아끼운다. 쓰기는 fallback 으로 흘려 _fixtures 의 운영 쓰기 가드가 그대로 끊게 둔다 —
//   스텁이 200 을 돌려주면 가드가 무력화된 것을 통과로 착각한다.
import type { Page, Route } from '@playwright/test';
import { SUPABASE_URL } from './_session';

const REF = new URL(SUPABASE_URL).hostname.split('.')[0];
/** supabase-js v2 의 세션 키 — 앱이 로드되기 전에 심으면 정상 로그인으로 부팅한다. */
export const STORAGE_KEY = `sb-${REF}-auth-token`;

export const MOCK_UID = '00000000-0000-4000-8000-0000000000ee';
export const MOCK_VENUE = '33333333-3333-4333-8333-333333333333';
export const MOCK_VENUE_NAME = '테스트 홀덤펍';
/** ⚠ 앱의 '오늘'은 **KST**(kstToday)다. UTC 날짜를 쓰면 한국 새벽에 픽스처만 하루 어긋난다. */
export const MOCK_DAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: MOCK_UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
export const FAKE_SESSION = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: MOCK_UID, aud: 'authenticated', role: 'authenticated', email: 'owner@example.com',
    app_metadata: {}, user_metadata: { name: '업주' }, created_at: new Date().toISOString(),
  },
};

export interface MockOwnerOpts {
  /** 화면 크기. 매장 운영은 PC 99% 라 기본 1440×900. */
  viewport?: { width: number; height: number };
  /** clock_states GET 응답 1행(주면 진행 중 클락이 있는 상태로 부팅). */
  clock?: unknown;
  /** venues.page_config — 클락 테마(clockTheme) 등. */
  pageConfig?: unknown;
  /** app_settings(key→value) — 클락 광고(CLOCK_AD_KEY) 등. */
  appSettings?: Record<string, string>;
  /** profiles 응답 덮어쓰기 — 공동 사장(role='user' 인데 이 매장의 사장)을 흉내낼 때 쓴다. */
  profile?: Record<string, unknown>;
  /** 권한 RPC 응답. 기본 전부 true(업주). */
  perms?: Partial<Record<'can_access_ledger' | 'can_manage_pos' | 'can_view_vouchers' | 'can_manage_venue_staff' | 'can_manage_venue_schedules', boolean>>;
  /** 스펙별 추가 라우트 — bootOwner 의 기본 라우트보다 **먼저** 걸린다(나중에 건 route 가 이긴다). */
  extra?: (page: Page) => Promise<void>;
  /** 기본 true. false 면 goto 를 호출부가 직접 한다(딥링크 등). */
  goto?: boolean;
}

/** 목킹 업주로 앱을 부팅한다. 반환값은 픽스처가 쓰는 id 들. */
export async function bootOwner(page: Page, opts: MockOwnerOpts = {}) {
  const vp = opts.viewport ?? { width: 1440, height: 900 };
  await page.setViewportSize(vp);
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [STORAGE_KEY, JSON.stringify(FAKE_SESSION)] as [string, string]);

  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
  const restGet = (body: unknown) => (r: Route) => (r.request().method() === 'GET' ? r.fulfill(json(body)) : r.fallback());

  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE_SESSION.user)));
  // getMyProfile 은 .single() — 객체 하나여야 한다.
  await page.route(/\/rest\/v1\/profiles\?/, restGet({
    id: MOCK_UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active',
    venue_id: MOCK_VENUE, activity_points: 0, created_at: FAKE_SESSION.user.created_at,
    ...opts.profile,
  }));
  const venueRow = {
    id: MOCK_VENUE, name: MOCK_VENUE_NAME, region: '서울', address: '서울 강남구 1', owner_id: MOCK_UID,
    approved: true, status: 'active', verification_status: 'verified',
    is_paid_ad: false, display_order: 1, follower_count: 3, rating: 4.5,
    // ⚠ fetchVenuePageConfig 는 venues.select('page_config').single() 이다 — 여기 없으면 테마가 안 붙는다.
    page_config: opts.pageConfig ?? null,
  };
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    return r.fulfill(json(isSingle(r) ? venueRow : [venueRow]));
  });
  const perms = { can_access_ledger: true, can_manage_pos: true, can_view_vouchers: true, can_manage_venue_staff: true, can_manage_venue_schedules: true, ...opts.perms };
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers|can_manage_venue_staff|can_manage_venue_schedules)/, (r) => {
    const m = /rpc\/(\w+)/.exec(r.request().url());
    return r.fulfill(json(perms[(m?.[1] ?? '') as keyof typeof perms] ?? false));
  });
  await page.route(/\/rest\/v1\/app_settings\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const key = /key=eq\.([^&]+)/.exec(r.request().url())?.[1] ?? '';
    const v = opts.appSettings?.[decodeURIComponent(key)];
    // maybeSingle() — 없으면 null 이 정답이다(빈 배열을 주면 supabase-js 가 그대로 null 로 읽는다).
    return r.fulfill(json(isSingle(r) ? (v == null ? null : { value: v }) : (v == null ? [] : [{ value: v }])));
  });
  await page.route(/\/rest\/v1\/notifications\?/, restGet([]));
  // 클락 콘솔은 Promise.all([클락 상태, 프리셋, 장부 목록]) 로 연다 — **셋 중 하나라도** 401 이면
  //   패널 전체가 '클락을(를) 불러오지 못했습니다 / 로그인이 만료되었습니다' 로 떨어진다(실패를 삼키지 않는 설계).
  //   그래서 빈 목록이라도 200 으로 답해 준다.
  await page.route(/\/rest\/v1\/clock_presets\?/, restGet([]));
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    return r.fulfill(json(isSingle(r) ? null : []));
  });
  await page.route(/\/rest\/v1\/ledger_buyins\?/, restGet([]));
  // ⚠ ledger_players 는 '있으면 좋은' 조회가 아니라 **차단 조회**다.
  //   getLedgerPlayers 는 실패를 삼키지 않고 throw 하는데(src/api/ledger.ts), 그게
  //   StoreDashboard 의 core Promise.all 과 NuriPosLedger 첫 로더에 들어 있다 —
  //   한 줄이 없으면 '내 매장' 첫 화면부터 LoadErrorCard 다. 아무도 대시보드를 단언하지 않아
  //   그동안 드러나지 않았을 뿐이다(2026-09-12 적대적 검토에서 발견).
  await page.route(/\/rest\/v1\/ledger_players\?/, restGet([]));
  await page.route(/\/rest\/v1\/venue_rankings\?/, restGet([]));
  await page.route(/\/rest\/v1\/game_presets\?/, restGet([]));
  // 클락 상태는 **항상** 라우트한다 — clock 을 안 준 스펙에서도.
  //   안 걸어 두면 그 조회만 운영 서버로 나가 가짜 토큰이 401 을 받고,
  //   콘솔 전체가 '클락을(를) 불러오지 못했습니다 / 로그인이 만료되었습니다' 로 떨어진다.
  //   클락은 두 모양으로 읽힌다 — 목록(getVenueClocks, 배열)과 단건(.maybeSingle(), 객체).
  await page.route(/\/rest\/v1\/clock_states/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    if (opts.clock === undefined) return r.fulfill(json(isSingle(r) ? null : []));
    return r.fulfill(json(isSingle(r) ? opts.clock : [opts.clock]));
  });
  await opts.extra?.(page);
  if (opts.goto !== false) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  }
  return { uid: MOCK_UID, venueId: MOCK_VENUE, day: MOCK_DAY };
}

/** '내 매장' 은 ≥lg 에서 role=tab, 모바일에서 button — 폭과 무관하게 보이는 button 으로 잡는다. */
export const openMyStore = (page: Page) =>
  page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
