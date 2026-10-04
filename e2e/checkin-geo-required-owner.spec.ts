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

async function boot(page: Page, st: { lat: number | null; lng: number | null; on: boolean }, { primary = true } = {}) {
  const rpc: Record<string, unknown>[] = [];
  let reads = 0;
  await bootOwner(page, {
    appSettings: { checkin_geo_enabled: 'on' },
    extra: async (p) => {
      // 대표 여부(list_venue_owners 의 내 줄 is_primary) — false 면 공동 운영자처럼 스위치가 잠긴다(F1)
      if (!primary) await p.route(/\/rest\/v1\/rpc\/list_venue_owners/, (r) => r.fulfill(json([{ user_id: '00000000-0000-4000-8000-0000000000ee', nickname: '업주', name: '업주', is_primary: false, status: 'approved' }])));
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
  await expect(sec).toContainText('스스로 출석할 수 없습니다(QR 스캔·매장 페이지 출석 버튼·앱 카메라)');
  await expect(sec).toContainText('대시보드 「출석·QR 명단」에서 출석 요청을 승인해 주세요');
  await expect(page.getByTestId('checkin-geo-required-owner-only'), '대표인데 대표 전용 안내가 떴다').toHaveCount(0);
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

test('🔴 O3 대표가 아닌 운영자(공동 운영자) — 스위치가 잠기고 "대표 업주만" 안내(F1, 서버도 거부)', async ({ page }) => {
  test.setTimeout(120_000);
  const { rpc } = await boot(page, { lat: 37.5, lng: 127.0, on: false }, { primary: false });
  const sw = page.getByTestId('checkin-geo-required-switch');
  await expect(sw).toBeDisabled();
  await expect(page.getByTestId('checkin-geo-required-owner-only')).toHaveText('위치 확인 출석은 대표 업주만 켜고 끌 수 있습니다.');
  await sw.click({ force: true }).catch(() => {});
  expect(rpc, '잠긴 스위치가 RPC 를 불렀다').toEqual([]);
});

// 오너 B(2026-10-05) — 출석 처리 대상은 **손님이 보낸 출석 요청**에서만 고른다(전 회원 닉네임 검색 경로 없음).
// 음성 대조(2026-10-05): CheckinModal 의 pendingCheckinRequests 호출을 `reqs` 그대로로 바꾸면 '이미 출석한 요청' 이 남아 O4 가 빨개진다.
test('🔴 O4 업주 1440 — 「출석·QR 명단」의 출석 요청을 승인(staff_check_in) · 명단·요청 재조회 · 검색 경로 없음', async ({ page }) => {
  test.setTimeout(120_000);
  const U1 = 'aaaaaaaa-0000-4000-8000-000000000001';
  const U2 = 'aaaaaaaa-0000-4000-8000-000000000002';
  const reqAt = new Date(Date.now() - 10 * 60_000).toISOString();
  const calls: { search: number; staff: unknown[]; listReads: number; reqReads: string[] } = { search: 0, staff: [], listReads: 0, reqReads: [] };
  let checkedIn = false;
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/search_voucher_recipients/, (r) => { calls.search++; return r.fulfill(json([])); });
      await p.route(/\/rest\/v1\/checkin_requests\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        calls.reqReads.push(r.request().url());
        // U2 는 요청 뒤 이미 QR 로 출석했다 → 화면은 승인 대기에서 뺀다. U1 은 승인 전까지 대기, 승인 뒤 서버가 approved 로 바꾼다.
        const rows = [
          ...(checkedIn ? [] : [{ id: 'r1', venue_id: MOCK_VENUE, user_id: U1, display_name: '위치거부손님', created_at: reqAt }]),
          { id: 'r2', venue_id: MOCK_VENUE, user_id: U2, display_name: '이미온손님', created_at: reqAt },
        ];
        return r.fulfill(json(rows));
      });
      await p.route(/\/rest\/v1\/rpc\/staff_check_in/, (r) => {
        calls.staff.push(r.request().postDataJSON());
        checkedIn = true;
        return r.fulfill(json({ points: 3, streak: 1, name: '테스트 홀덤펍' }));
      });
      await p.route(/\/rest\/v1\/checkins\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        calls.listReads++;
        const now = new Date().toISOString();
        return r.fulfill(json([
          { id: 'c2', venue_id: MOCK_VENUE, user_id: U2, display_name: '이미온손님', created_at: now },
          ...(checkedIn ? [{ id: 'c1', venue_id: MOCK_VENUE, user_id: U1, display_name: '위치거부손님', created_at: now }] : []),
        ]));
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-rail]').first(), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '출석·QR 명단' }).click();
  const box = page.getByTestId('staff-checkin');
  await expect(box, '출석 요청 칸이 없다').toBeVisible({ timeout: 15_000 });
  await expect(box.getByTestId('staff-checkin-req')).toHaveCount(1);
  await expect(box.getByTestId('staff-checkin-req')).toContainText('위치거부손님');
  await expect(box, '요청 뒤 이미 출석한 손님이 승인 대기에 남았다').not.toContainText('이미온손님');
  await expect(box.getByRole('textbox'), '전 회원 검색 칸이 남았다').toHaveCount(0);
  // 20261005a P3-c — 요청 날짜는 영업일이라 KST 어제·오늘 두 날짜 + 12시간 안의 요청만 읽는다
  expect(calls.reqReads.some((u) => u.includes(`venue_id=eq.${MOCK_VENUE}`) && u.includes('status=eq.pending')
    && /request_date=in\.%28\d{4}-\d{2}-\d{2}%2C\d{4}-\d{2}-\d{2}%29|request_date=in\.\(\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2}\)/.test(u)
    && /created_at=gte\./.test(u)), '어제·오늘 영업일·이 매장·대기 요청만 읽어야 한다').toBe(true);
  if (SHOT) await page.screenshot({ path: `${SHOT}/owner-staff-checkin.png` });
  const reads0 = calls.listReads;
  const req0 = calls.reqReads.length;
  await box.getByRole('button', { name: '승인' }).click();
  await expect.poll(() => calls.staff.length).toBe(1);
  expect(calls.staff[0]).toEqual({ p_venue_id: MOCK_VENUE, p_user_id: U1 });
  await expect(page.getByText('위치거부손님님 출석 처리 완료 · +3점')).toBeVisible();
  await expect.poll(() => calls.listReads, { message: '승인 뒤 오늘 명단을 다시 읽지 않았다' }).toBeGreaterThan(reads0);
  await expect.poll(() => calls.reqReads.length, { message: '승인 뒤 요청 목록을 다시 읽지 않았다' }).toBeGreaterThan(req0);
  await expect(page.getByText('오늘 방문 2명')).toBeVisible();
  await expect(box.getByTestId('staff-checkin-empty')).toBeVisible();
  expect(calls.search, '출석 처리에서 전 회원 검색 RPC 를 불렀다').toBe(0);
});
