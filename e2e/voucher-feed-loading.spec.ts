// 이용권 · QR 첫 진입 — 목록을 불러오는 동안 "아직 내역이 없습니다"(거짓 빈 상태)가 보이면 안 된다.
//   업주가 발급이 안 된 줄 알고 **다시 발급**한다(VoucherManageModal.tsx `loading` 주석). 그리고 목록이 도착할 때
//   아래 '매장이용권 발급' 칸이 크게 밀리면 안 된다(종전 1280 CLS 0.123 · +430px, docs/HANDOFF-2026-09-29-account-switch.md#8 P1-2).
// 목록 응답을 900ms 늦춰 로딩 창을 확실히 연다 — 뼈대를 한 프레임도 못 봤으면 빈 검사라 실패로 친다.
// 실행: E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/voucher-feed-loading.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const base = Date.parse('2026-09-20T03:00:00Z');
const mkRows = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `v${i}`, venue_id: MOCK_VENUE, issued_by: 'x', holder_user_id: `u${i}`, holder_name: `손님${i + 1}`,
  title: `이용권${i + 1}`, status: 'active', used_venue_id: null, used_at: null,
  created_at: new Date(base + i * 60_000).toISOString(), expires_at: null, issue_reason: 'grant', event_campaign_id: null,
  venue: { name: '테스트 홀덤펍' }, used_venue: null,
}));

async function run(page: Page, w: number, h: number, n: number) {
  await bootOwner(page, {
    viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/store_vouchers\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        await new Promise((res) => setTimeout(res, 900));
        await r.fulfill(json(mkRows(n)));
      });
      await p.route(/\/rest\/v1\/rpc\/voucher_holder_stats/, (r) => r.fulfill(json([{ holder_count: n, active_count: n, used_count: 0 }])));
      await p.route(/\/rest\/v1\/rpc\/voucher_holder_profiles/, (r) => r.fulfill(json([])));
      await p.route(/\/rest\/v1\/rpc\/voucher_issue_approved/, (r) => r.fulfill(json(true)));
      await p.route(/\/rest\/v1\/rpc\/get_voucher_quota/, (r) => r.fulfill(json(100)));
      await p.route(/\/rest\/v1\/rpc\/venue_voucher_reason_stats/, (r) => r.fulfill(json([])));
    },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-rail]').first(), '목킹 업주로 내 매장을 열지 못했다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  if (w < 1024) {
    await page.getByRole('button', { name: /전체 메뉴/ }).first().evaluate((b) => (b as HTMLElement).click());
    await page.waitForTimeout(400);
  }
  // 누르기 직전부터 rAF 마다: 거짓 빈 문구 · 로딩 뼈대 · 레이아웃 이동 합.
  //   합성 클릭은 hadRecentInput 이 안 서므로 CLS 정의대로 **누른 뒤 500ms 안** 이동(판 전환 자체 · 390 전체 메뉴 닫힘 0.28)은 뺀다.
  //   목록은 900ms 에 도착하니 그 밀림은 반드시 들어온다(수정 전 390 0.245 · 1280 0.109).
  await page.evaluate(() => {
    const g = window as unknown as { __v: { empty: number; skel: number; cls: number; done: boolean } };
    g.__v = { empty: 0, skel: 0, cls: 0, done: false }; const t0 = performance.now();
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; startTime: number }[]) if (!e.hadRecentInput && e.startTime - t0 > 500) g.__v.cls += e.value; })
      .observe({ type: 'layout-shift', buffered: false });
    const f = () => {
      const pane = document.querySelector('[data-tab="my-store"]') as HTMLElement | null;
      if (pane && /아직 내역이 없습니다/.test(pane.innerText) && !document.querySelector('[data-testid="voucher-feed"]')) g.__v.empty += 1;
      const sk = document.querySelector('[data-testid="voucher-feed-loading"]') as HTMLElement | null;
      if (sk && sk.offsetParent) g.__v.skel += 1;
      if (!g.__v.done) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  const vbtn = page.locator('button:visible', { hasText: /이용권\s*·\s*QR/ }).first();
  await vbtn.evaluate((b) => (b as HTMLElement).click());
  await expect(page.getByTestId('voucher-issue')).toBeVisible({ timeout: 15_000 });
  if (n > 0) await expect(page.getByTestId('voucher-feed')).toBeVisible({ timeout: 15_000 });
  else await expect(page.getByText('아직 내역이 없습니다', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
  return page.evaluate(() => { const g = window as unknown as { __v: { empty: number; skel: number; cls: number; done: boolean } }; g.__v.done = true; return g.__v; });
}

test.describe('이용권 · QR 첫 진입 — 로딩 중 거짓 빈 상태 없음 · 목록 도착 때 발급 칸 밀림 없음', () => {
  for (const [W, H] of [[1280, 720], [390, 844]] as const) {
    test(`${W}px · 목록 14장`, async ({ page }) => {
      test.setTimeout(120_000);
      const v = await run(page, W, H, 14);
      console.log(`[voucher-feed-loading ${W} n=14]`, JSON.stringify(v));
      expect.soft(v.skel, '로딩 뼈대를 한 프레임도 못 봤다 — 로딩 창을 못 연 빈 검사').toBeGreaterThan(0);
      expect.soft(v.empty, '불러오는 중에 "아직 내역이 없습니다" 가 보였다(거짓 빈 상태)').toBe(0);
      expect.soft(v.cls, '목록 도착 때 레이아웃 이동이 크다').toBeLessThan(0.1);
    });
  }
  // 양성 대조 — 진짜 0장이면 빈 문구는 **응답 뒤에** 그대로 나와야 한다(빈 상태 기능 보존)
  test('1280px · 0장 — 응답 뒤 빈 문구 유지', async ({ page }) => {
    test.setTimeout(120_000);
    const v = await run(page, 1280, 720, 0);
    console.log('[voucher-feed-loading 1280 n=0]', JSON.stringify(v));
    expect.soft(v.skel, '로딩 뼈대를 못 봤다').toBeGreaterThan(0);
    await expect(page.getByTestId('voucher-feed-loading')).toHaveCount(0);
    expect.soft(v.cls, '0장 매장에서 뼈대가 접히며 크게 밀렸다').toBeLessThan(0.1);
  });
});
