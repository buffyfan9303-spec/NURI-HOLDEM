// 20261004d(오너 결정 (다)) — 업주 PC(1440) '매장 설정 › 매장 페이지 › 출석 위치'의 「위치 확인 출석」 스위치.
//   · 좌표가 있으면 켜고 끌 수 있다 — 저장은 set_venue_checkin_geo_required RPC, 화면 상태는 서버 재조회 값(K-03)
//   · 좌표가 없으면 켤 수 없다(서버도 막는다)
//   · 업주에게 시행일·거부 효과·대체 처리(장부 직접 등록·참가 신청 승인)를 알린다
// 운영 DB 에 쓰지 않는다 — 목킹 업주(bootOwner) + route. 스위치 상태는 가짜 서버(st)가 들고 있다.
// 음성 대조(2026-10-04 실행): toggleGeo 에서 재조회 값 반영(`setSpot(s);`)을 뺀 빌드에서 O1 이 aria-checked "true" 기대 / "false" 수신으로 빨갰다(O2 는 통과).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/checkin-geo-required-owner.spec.ts --project=mobile-chromium
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const SHOT = process.env.LOC_SHOT_DIR;

async function boot(page: Page, st: { lat: number | null; lng: number | null; on: boolean }) {
  const rpc: Record<string, unknown>[] = [];
  let reads = 0;
  await bootOwner(page, {
    appSettings: { checkin_geo_enabled: 'on' },
    extra: async (p) => {
      // getVenueCheckinSpot — venues.select('lat, lng, address, checkin_geo_required')
      await p.route(/\/rest\/v1\/venues\?.*checkin_geo_required/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        reads++;
        const row = { lat: st.lat, lng: st.lng, address: '서울 강남구 1', checkin_geo_required: st.on };
        return r.fulfill(json(single(r) ? row : [row]));
      });
      await p.route(/\/rest\/v1\/rpc\/set_venue_checkin_geo_required/, (r) => {
        const body = r.request().postDataJSON() as { p_venue_id: string; p_on: boolean };
        rpc.push(body);
        if (body.p_on && (st.lat == null || st.lng == null)) {
          return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: '출석 위치를 먼저 등록해 주세요' }) });
        }
        st.on = body.p_on;
        return r.fulfill(json(st.on));
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-rail]').first(), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  // 매장 설정 → 매장 페이지
  const opened = await page.evaluate(() => {
    const pick = () => [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => x.getClientRects().length && /매장 설정/.test((x.textContent ?? '').trim()));
    let b = pick();
    if (!b) { [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => /고급 기능 모두 보기/.test(x.textContent ?? ''))?.click(); b = pick(); }
    b?.click(); return !!b;
  });
  expect(opened, '매장 설정 메뉴를 못 찾았다').toBe(true);
  await expect(page.getByRole('tablist', { name: '매장 설정 하위탭' })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('[role=tab]')].find((b) => b.getClientRects().length && (b.textContent ?? '').trim() === '매장 페이지')?.click(); });
  const sec = page.getByTestId('checkin-geo-required');
  await expect(sec, '위치 확인 출석 칸이 안 보인다').toBeVisible({ timeout: 20_000 });
  return { rpc, sec, reads: () => reads };
}

test('🔴 O1 업주 1440 — 좌표가 있으면 켜고 끈다(RPC 저장 → 재조회 값으로 상태) · 시행일·대체 처리 안내', async ({ page }) => {
  test.setTimeout(120_000);
  const st = { lat: 37.5, lng: 127.0, on: false };
  const { rpc, sec, reads } = await boot(page, st);
  const sw = page.getByTestId('checkin-geo-required-switch');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(sw).toBeEnabled();
  await expect(page.getByTestId('checkin-geo-required-state')).toHaveText('꺼짐 — 손님에게 위치를 묻지 않습니다');
  await expect(sec).toContainText('2026년 11월 5일부터');
  await expect(sec).toContainText('QR 출석이 되지 않습니다');
  await expect(sec).toContainText('장부에 직접 등록하거나 손님의 「참가 신청」을 승인해 주세요');
  const box = await sw.boundingBox();
  expect(box!.height, '스위치 누름 높이 < 44px').toBeGreaterThanOrEqual(44);

  const r0 = reads();
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  expect(rpc).toEqual([{ p_venue_id: MOCK_VENUE, p_on: true }]);
  expect(reads(), '저장 뒤 서버를 다시 읽지 않았다').toBeGreaterThan(r0);
  await expect(page.getByTestId('checkin-location').getByRole('status')).toHaveText('위치 확인 출석을 켰습니다');
  await expect(page.getByTestId('checkin-geo-required-state')).toHaveText('켜짐 — 손님에게 위치 확인을 요청합니다');
  if (SHOT) { await sec.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOT}/owner-geo-switch-on.png` }); }

  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  expect(rpc).toEqual([{ p_venue_id: MOCK_VENUE, p_on: true }, { p_venue_id: MOCK_VENUE, p_on: false }]);
});

test('🔴 O2 업주 1440 — 출석 위치(좌표)가 없으면 켤 수 없다', async ({ page }) => {
  test.setTimeout(120_000);
  const { rpc, sec } = await boot(page, { lat: null, lng: null, on: false });
  const sw = page.getByTestId('checkin-geo-required-switch');
  await expect(sw).toBeDisabled();
  await expect(sec).toContainText('출석 위치를 먼저 등록해야 켤 수 있습니다');
  expect(rpc).toEqual([]);
});
