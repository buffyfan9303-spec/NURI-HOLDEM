/**
 * R11-01·R11-03 (11회차 재발·연결성 점검, 2026-10-08) — 지연 청크를 부팅/첫 사용 중에 한 번 못 받아도, 망이 돌아오면 **새로고침 없이** 쓸 수 있다.
 *
 * 원인: 브라우저는 실패한 동적 import 를 주소별로 모듈 맵에 남긴다 → 같은 주소를 다시 import 하면 즉시 실패한다.
 *   로더 4곳(sbFunctionsLazy · sbStorageLazy · tdaRulesLoad · locationConsent)이 '비우고 다시 부르기'만 해서 새로고침 전까지 계속 고장이었다.
 *   고침 = src/lib/retryImport.ts 가 재시도 때 청크 주소에 ?r=n 을 붙인다.
 * 시나리오(청크마다 독립): 그 청크**만** 끊는다 → 기능을 써 보고 실패를 확인(hits) → 끊김 해제 → 같은 기능을 다시 쓴다 → 된다.
 * 거짓 통과 방지: ① 차단이 실제로 요청을 끊었다(hits>0) ② 해제 전 실패 상태를 먼저 단언 ③ 회복이 새로고침이 아니다(창 표식 유지)
 *   ④ 차단 정규식이 ?r= 새 주소까지 잡는다(끝이 (\?.*)?$) — 안 그러면 재시도 URL 이 차단을 피해 '고쳐지지 않았는데 통과'한다.
 * 실행: E2E_BASE_URL=<빌드 서버> npx playwright test e2e/lazy-chunk-retry-1008.spec.ts --project=mobile-chromium
 *   (프로덕션 빌드 필요 — 개발 서버는 청크 주소가 다르다)
 */
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';
import { LEGAL_VERSION } from '../src/lib/legalVersion';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

/** 청크 하나만 끊는다. needle 이 있으면 이름이 흔한 청크(dist-*)를 내용으로 한 번 더 걸러 엉뚱한 청크를 끊지 않는다. */
async function blockChunk(context: BrowserContext, re: RegExp, needle?: string) {
  const st = { block: true, hits: 0 };
  await context.route(re, async (r) => {
    if (!needle) {
      if (!st.block) return r.continue();
      st.hits++;
      return r.abort('internetdisconnected');
    }
    const resp = await r.fetch();
    const body = await resp.text();
    if (st.block && body.includes(needle)) {
      st.hits++;
      return r.abort('internetdisconnected');
    }
    return r.fulfill({ response: resp, body });
  });
  return st;
}

const markNoReload = (page: Page) => page.evaluate(() => { (window as unknown as { __noReload?: 1 }).__noReload = 1; });
const noReload = (page: Page) => page.evaluate(() => (window as unknown as { __noReload?: 1 }).__noReload);

async function bootTools(page: Page) {
  await stabilizeBackstack(page);
  await stubLogin(page);
  await page.goto('/?tab=tools');
  await expect(page.getByTestId('tool-tda')).toBeVisible({ timeout: 30_000 });
  await markNoReload(page);
}
const openTda = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="tool-tda"]')?.click());
async function closeDialog(page: Page) {
  await page.evaluate(() => document.querySelector<HTMLElement>('[role="dialog"] button[aria-label="닫기"]')?.click());
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0, { timeout: 5_000 });
}

test('R11-03 규칙 본문(tdaRules)을 못 받아도 망이 돌아오면 다시 열어 새로고침 없이 본문이 뜬다', async ({ page, context }) => {
  test.setTimeout(90_000);
  const chunk = await blockChunk(context, /\/assets\/tdaRules-[^/?]+\.js(\?.*)?$/);
  await bootTools(page);

  await openTda(page);
  await expect(page.locator('[role="dialog"] [aria-busy="true"]').first(), '끊긴 동안은 스켈레톤이어야 한다(시나리오 불성립)').toBeVisible({ timeout: 10_000 });
  await expect.poll(() => chunk.hits, { timeout: 10_000, message: '차단이 청크 요청을 끊지 못했다' }).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: '2026 TDA 규칙', level: 3 })).toHaveCount(0);

  chunk.block = false; // 망 복구 — online 이벤트 없음
  await closeDialog(page);
  await openTda(page);
  await expect(page.getByRole('heading', { name: '2026 TDA 규칙', level: 3 }), '망이 돌아왔는데 규칙 본문이 안 뜬다 — 같은 주소의 실패 import 를 재사용').toBeVisible({ timeout: 15_000 });
  expect(await noReload(page), '새로고침으로 회복했다').toBe(1);
});

test('R11-01 엣지 함수 클라이언트(FunctionsClient)를 못 받아도 망이 돌아오면 같은 화면에서 AI 답변이 온다', async ({ page, context }) => {
  test.setTimeout(90_000);
  const chunk = await blockChunk(context, /\/assets\/FunctionsClient-[^/?]+\.js(\?.*)?$/);
  let asked = 0;
  await page.route(/\/functions\/v1\/tda-assist/, (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    asked++;
    return r.fulfill({ ...json({ text: 'E2E 목 답변입니다' }), headers: CORS });
  });
  await bootTools(page);
  await openTda(page);
  await expect(page.getByRole('heading', { name: '2026 TDA 규칙', level: 3 })).toBeVisible({ timeout: 20_000 });
  const chip = page.getByRole('dialog').getByRole('button', { name: '딜러가 카드를 쏟았어요' });

  await chip.click();
  await expect.poll(() => chunk.hits, { timeout: 10_000, message: '차단이 청크 요청을 끊지 못했다' }).toBeGreaterThan(0);
  await expect(page.getByText('네트워크가 끊겼습니다', { exact: false }), '끊긴 동안은 실패 안내가 떠야 한다').toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('AI 안내', { exact: true })).toHaveCount(0);
  expect(asked, '청크가 끊겼는데 함수 호출이 나갔다').toBe(0);

  chunk.block = false;
  await chip.click();
  await expect(page.getByText('AI 안내', { exact: true }), '망이 돌아왔는데 AI 답변이 안 온다 — 함수 클라이언트 청크가 영영 고장').toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('E2E 목 답변입니다')).toBeVisible();
  expect(asked).toBeGreaterThan(0);
  expect(await noReload(page), '새로고침으로 회복했다').toBe(1);
});

test('R11-01 스토리지 클라이언트(storage-js)를 못 받아도 망이 돌아오면 같은 화면에서 프로필 사진이 저장된다', async ({ page, context }) => {
  test.setTimeout(120_000);
  // 청크 이름(dist-*)이 흔해 내용으로 거른다 — 이 패키지의 첫 클래스 이름.
  const chunk = await blockChunk(context, /\/assets\/dist-[^/?]+\.js(\?.*)?$/, 'IcebergError');
  const BASE = { id: '00000000-0000-4000-8000-0000000000f1', email: 'verify@example.test', name: '검증계정', nickname: '검증계정', role: 'user', approved: true,
    status: 'active', agreed_to_terms: true, agreed_to_marketing: false, consented_legal_version: LEGAL_VERSION, activity_points: 10, badges: [], avatar_color: '#8B5CF6', avatar_url: null };
  const st = { patch: 0, posts: 0 };
  await stabilizeBackstack(page);
  await stubLogin(page);
  await page.route(/\/rest\/v1\/profiles\?/, (r) => {
    if (r.request().method() !== 'PATCH') return r.fallback();
    st.patch++;
    return r.fulfill(json(BASE));
  });
  await page.route(/\/storage\/v1\/object\/avatars\//, (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 404, body: '' });
    st.posts++;
    return r.fulfill(json({ Key: 'avatars/x/avatar.webp', Id: 'x' }));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '검증계정 메뉴' })).toBeVisible({ timeout: 20_000 });
  await markNoReload(page);

  await page.getByRole('button', { name: '검증계정 메뉴' }).click();
  await page.getByRole('button', { name: '내 정보 열기' }).click();
  await page.locator('[data-profile-tabbar] [role="tab"]', { hasText: '설정' }).evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-profile-tabbar] [role="tab"]', { hasText: '설정' })).toHaveAttribute('aria-selected', 'true');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 400;
    const g = c.getContext('2d')!; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 400, 400); g.fillStyle = '#0000ff'; g.fillRect(400, 0, 400, 400);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[data-profile-panel] input[type="file"]').setInputFiles({ name: 'half.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('[aria-labelledby="avatar-cropper-title"] .touch-none')).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '적용' }).click();

  const save = page.getByRole('button', { name: '저장하기' });
  await save.click();
  await expect.poll(() => chunk.hits, { timeout: 15_000, message: '차단이 청크 요청을 끊지 못했다' }).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(st.posts, '청크가 끊겼는데 업로드가 나갔다').toBe(0);
  expect(st.patch, '업로드 실패인데 프로필이 저장됐다').toBe(0);

  chunk.block = false;
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  await expect.poll(() => st.posts, { timeout: 15_000, message: '망이 돌아왔는데 업로드가 안 나간다 — 스토리지 클라이언트 청크가 영영 고장' }).toBeGreaterThan(0);
  await expect.poll(() => st.patch, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await noReload(page), '새로고침으로 회복했다').toBe(1);
});

test('R11-03 위치 동의 시트(LocationConsentSheet)를 못 받아도 망이 돌아오면 다시 시도에서 시트가 뜬다', async ({ page, context }) => {
  test.setTimeout(90_000);
  const VENUE = '11111111-2222-3333-4444-555555555555';
  const chunk = await blockChunk(context, /\/assets\/LocationConsentSheet-[^/?]+\.js(\?.*)?$/);
  let checkIns = 0;
  await stabilizeBackstack(page);
  await stubLogin(page);
  await page.route(/\/rest\/v1\/app_settings\?.*checkin_geo_enabled/, (r) => r.fulfill(json({ value: 'on' })));
  await page.route(/\/rest\/v1\/venues\?.*select=checkin_geo_required/, (r) => r.fulfill(json({ checkin_geo_required: true })));
  await page.route(/\/rest\/v1\/rpc\/get_my_location_consent/, (r) => r.fulfill(json({ state: 'unset' })));
  await page.route(/\/rest\/v1\/rpc\/set_my_location_consent/, (r) => r.fulfill(json({ state: 'denied', terms_version: 3, granted_at: null, revoked_at: null })));
  await page.route(/\/rest\/v1\/rpc\/check_in/, (r) => { checkIns++; return r.fulfill(json({ name: '검증 홀덤', points: 3, streak: 1 })); });

  await page.goto(`/?checkin=${VENUE}`);
  await markNoReload(page);
  await expect.poll(() => chunk.hits, { timeout: 30_000, message: '차단이 청크 요청을 끊지 못했다(동의 시트를 요청하지 않았다)' }).toBeGreaterThan(0);
  await expect.poll(() => checkIns, { timeout: 15_000, message: '시트를 못 받으면 좌표 없이 출석은 이어져야 한다' }).toBeGreaterThan(0);
  await expect(page.getByTestId('location-consent-sheet')).toHaveCount(0);

  chunk.block = false;
  // 위치 확인 출석 매장이 동의 없이 거부한 상황의 재시도 시트를 연다(App 의 이벤트 진입 — 매장 페이지·이용권 시트도 같은 경로).
  await page.evaluate((venueId) => window.dispatchEvent(new CustomEvent('nuri:checkin-geo-retry', { detail: { venueId, code: 'consent' } })), VENUE);
  await expect(page.getByTestId('checkin-geo-retry')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('checkin-geo-retry-btn').click();
  await expect(page.getByTestId('location-consent-sheet'), '망이 돌아왔는데 동의 시트가 안 뜬다 — 시트 청크가 영영 고장').toBeVisible({ timeout: 15_000 });
  expect(await noReload(page), '새로고침으로 회복했다').toBe(1);
});
