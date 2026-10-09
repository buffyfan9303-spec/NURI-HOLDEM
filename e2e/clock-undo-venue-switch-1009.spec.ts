// PR #244 ③ 후속(2026-10-09 독립 검증 P2) — 관리자가 A 매장 클락을 재개한 뒤 B 매장으로 바꾸고 토스트 [실행취소] 를 누르면
//   예전엔 A 클락에 PATCH({running:false}) 가 나갔고 안내도 없었다. 매장 전환은 TournamentClock 이 setState(null) 로
//   ClockLive 를 언마운트하는데, 토스트 onClick 은 언마운트된 A 인스턴스의 stateRef(=A 로 굳음)를 봐서 주인 키가 맞다고 판정했다.
//   이제 기준은 부모의 지금 (매장, 게임) 이다 → A 에 쓰지 않고 '다른 매장으로 바뀌어…' 를 띄운다.
// 원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit12\wo-store-verify.md (P2)
// 전부 목킹(운영 쓰기 0). 음성 대조: 61f2a3cc 빌드에서 FAIL(A 로 PATCH 1건 · 안내 0), 수정 빌드에서 PASS.
import { test, expect } from './_fixtures';
import type { Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const VENUE_B = '44444444-4444-4444-8444-444444444444';

test('1440 — 관리자: A 클락 재개 → B 매장으로 전환 → [실행취소] 는 A 에 쓰지 않고 다른 매장 안내를 띄운다', async ({ page }) => {
  test.setTimeout(120_000);
  const level = (sb: number) => ({ kind: 'level', sb, bb: sb * 2, ante: sb * 2, minutes: 20 });
  const rowA: Record<string, unknown> = {
    venue_id: MOCK_VENUE, game_seq: 1, session_date: null, title: 'A매장클락',
    config: { title: 'A매장클락', startStack: 50_000, rebuyStack: 0, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 0, maxLevel: 3,
      earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [], levels: [level(100), level(200)] },
    current_index: 0, running: false, ends_at: null, remaining_ms: 7 * 60_000,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0, live_stats: null, updated_at: new Date().toISOString(),
  };
  const patches: { venue: string; body: Record<string, unknown> }[] = [];
  const venueRow = (id: string, name: string) => ({ id, name, region: '서울', address: '', owner_id: '00000000-0000-4000-8000-0000000000aa', approved: true, status: 'active',
    verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 0, rating: 0, page_config: null, created_at: '2026-01-01T00:00:00Z' });
  const VA = venueRow(MOCK_VENUE, '테스트 홀덤펍'), VB = venueRow(VENUE_B, '둘째 매장');
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    profile: { role: 'admin' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/clock_ads/, (r) => r.fulfill(json([])));
      await p.route(/\/rest\/v1\/venues\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = r.request().url();
        const one = u.includes(`id=eq.${VENUE_B}`) ? VB : u.includes(`id=eq.${MOCK_VENUE}`) ? VA : null;
        if (single(r)) return r.fulfill(json(one ?? VA));
        return r.fulfill(json(one ? [one] : [VA, VB]));
      });
      // 상태 있는 가짜 clock_states — A 매장 1행만. PATCH 는 행에 병합하고 어느 매장으로 갔는지 기록한다.
      await p.route(/\/rest\/v1\/clock_states/, (r) => {
        const m = r.request().method(), u = r.request().url();
        const isA = u.includes(`venue_id=eq.${MOCK_VENUE}`);
        if (m === 'GET') {
          const got = isA ? [rowA] : [];
          return r.fulfill(json(single(r) ? (got[0] ?? null) : got)).catch(() => {});
        }
        if (m === 'PATCH') {
          const body = r.request().postDataJSON() as Record<string, unknown>;
          patches.push({ venue: isA ? 'A' : 'B', body });
          if (isA) Object.assign(rowA, body);
          return r.fulfill(json(isA ? [rowA] : [])).catch(() => {});
        }
        return r.fallback();
      });
    },
  });
  await openMyStore(page);
  const pick = page.locator('#mystore-venue-pick');
  await expect(pick, '관리자 매장 고르개가 없다(이 검사의 전제)').toBeVisible({ timeout: 20_000 });
  await expect(pick).toHaveValue(MOCK_VENUE);
  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] button, [data-mystore-rail] [role=tab]')].find((x) => x.getClientRects().length && x.textContent?.trim() === '클락')?.click();
  });
  await page.getByTestId('clk-main-action').waitFor({ timeout: 30_000 });
  await page.getByTestId('clk-main-action').click();                       // 재개 → 토스트 [실행취소] 무장(5초)
  await expect.poll(() => rowA.running, { timeout: 10_000, message: '재개가 서버에 안 갔다(이 검사의 전제)' }).toBe(true);
  const before = patches.length;
  await pick.selectOption(VENUE_B);
  await expect(pick).toHaveValue(VENUE_B);
  await page.getByRole('button', { name: '실행취소' }).first().click({ timeout: 4_000 });
  await page.waitForTimeout(1500);   // 저장기 합치기·재시도 여유
  console.log('[매장 전환 실행취소] 전환 뒤 PATCH', JSON.stringify(patches.slice(before)));
  expect(patches.slice(before), '매장을 바꾼 뒤의 실행취소가 클락에 썼다(H03-06 매장 경계)').toEqual([]);
  expect(rowA.running, 'A 클락이 다시 정지됐다').toBe(true);
  await expect(page.getByText(/다른 매장으로 바뀌어 실행취소하지 않았어요/).first(), '매장이 바뀌었다는 안내가 없다').toBeVisible({ timeout: 5_000 });
});
