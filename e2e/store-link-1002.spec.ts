// 내 매장 매장 전환(A→B) 경계 — audit-link-1002 L-05 · L-06 · L-14 의 회귀 게이트(2026-10-02).
//
//   L-05 프리셋 편집 상태가 매장을 바꿔도 남아 A 프리셋을 B 화면에서 저장할 수 있었다 / 늦게 온 A 목록이 B 목록을 덮었다.
//   L-06 늦게 온(또는 남아 있던) A '직전 게임 설정'이 B 의 새 게임 폼을 채웠다 / A 프리셋 고르개가 B 폼에 나타났다.
//   L-14 프리셋 조회 실패가 '저장된 프리셋이 없습니다'로 보였다(못 읽음 ≠ 없음).
//
// 판은 매장 전환에 다시 마운트되지 않는다(VenueManageTab keep-alive) — 그래서 응답 지연을 넣고 A→B 를 바꾼 뒤 B 화면을 잰다.
// ⚠ 계정은 **관리자**다. 소속 매장 전환(비관리자)은 권한 재조회 동안 판 전체를 '불러오는 중…' 셸로 바꿔 판이 우연히 다시
//   마운트된다(permsLoaded=false) — 그래서 그 경로로는 이 결함이 안 보인다(2026-10-02 실측: 수정 전 빌드에서도 PASS).
//   관리자 경로는 권한을 조회하지 않아 판이 그대로 산다 — 감사의 재현 조건('관리자가 매장 A→B')과 같다.
// 운영 쓰기 0: 읽기(GET)·읽기 RPC 만 목으로 답한다. 쓰기는 _fixtures 가드가 끊는다(이 스펙은 쓰기를 기다리지 않는다).
// 음성 대조(2026-10-02): 수정 직전(243eb6d6) 빌드에서 FAIL, 수정 빌드에서 PASS — store-link-1002-report.md.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const A = MOCK_VENUE;
const B = '44444444-4444-4444-8444-444444444444';
const venueRow = (id: string, name: string, order: number) => ({
  id, name, region: '서울', address: '서울 강남구 1', owner_id: null, approved: true, status: 'active', verification_status: 'verified',
  is_paid_ad: false, display_order: order, follower_count: 0, rating: 4.5, page_config: null, created_at: new Date().toISOString(),
});
const VENUES = [venueRow(A, '테스트 홀덤펍', 1), venueRow(B, '둘째 매장', 2)];
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const venueOf = (r: Route) => /venue_id=eq\.([0-9a-f-]+)/.exec(r.request().url())?.[1] ?? '';
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const preset = (venue: string, i: number, name: string) => ({
  id: `${venue.slice(0, 8)}-0000-4000-8000-${String(i).padStart(12, '0')}`, venue_id: venue, name,
  data: { title: name, buyInWon: venue === A ? 77000 : 30000, startStack: 30000 }, updated_at: new Date().toISOString(),
});
const CLOSED_A = { session_date: '2026-09-30', game_seq: 1, title: 'A매장-지난회차', buyin_amount: 77000, card_amount: null, game_type: 'gtd', target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0, reg_closed: true, closed: true, closed_at: '2026-09-30T15:00:00Z', created_at: '2026-09-30T09:00:00Z' };
const PRESETS: Record<string, unknown[]> = { [A]: [preset(A, 1, 'A-딥스택'), preset(A, 2, 'A-터보')], [B]: [preset(B, 3, 'B-데일리')] };

interface Opts { presetDelayA?: number; presetError?: boolean; presetsB?: unknown[]; prefillDelayA?: number; lastRoundDelayB?: number; listDelayA?: number; deletes?: string[] }
const LIST_A = [{ session_date: '2026-09-29', game_seq: 1, title: 'A매장-목록게임', opened_at: '2026-09-29T09:00:00Z', reg_closed: true, closed: true, buyin_amount: 77000, operators: [] }];

async function boot(page: Page, o: Opts = {}) {
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    profile: { role: 'admin' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/venues\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const id = /[?&]id=eq\.([0-9a-f-]+)/.exec(r.request().url())?.[1];
        const rows = id ? VENUES.filter((v) => v.id === id) : VENUES;
        return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows));
      });
      await p.route(/\/rest\/v1\/game_presets\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        if (o.presetError) return r.fulfill(json({ code: '42501', message: 'permission denied for table game_presets' }, 403));
        const v = venueOf(r);
        if (v === A && o.presetDelayA) await sleep(o.presetDelayA);
        return r.fulfill(json(v === B && o.presetsB ? o.presetsB : (PRESETS[v] ?? []))).catch(() => {});
      });
      // 장부 '직전 게임 설정'(getLastLedgerSettings: buyin_amount 선택 + session_date=lt) — A 만 값이 있다. 나머지 장부 조회는 빈 응답.
      await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = decodeURIComponent(r.request().url());
        const last = /select=buyin_amount/.test(u) && /session_date=lt\./.test(u);
        // 장부 목록(getLedgerSessionList: limit=90) — A 만 1행, listDelayA 만큼 늦게. B 는 바로 빈 목록.
        if (/select=session_date,game_seq,title,opened_at/.test(u) && /limit=90/.test(u)) {
          if (venueOf(r) === A) {
            if (o.listDelayA) await sleep(o.listDelayA);
            return r.fulfill(json(LIST_A)).catch(() => {});
          }
          return r.fulfill(json([]));
        }
        // 마지막 마감 회차(getLastClosedRound: closed=eq.true + session_date=lt) — A 만 있다. B 는 lastRoundDelayB 만큼 늦게 '없음'.
        if (/closed=eq\.true/.test(u) && /session_date=lt\./.test(u)) {
          if (venueOf(r) === A) return r.fulfill(json({ ...CLOSED_A, venue_id: A }));
          if (o.lastRoundDelayB) await sleep(o.lastRoundDelayB);
          return r.fulfill(json(null)).catch(() => {});
        }
        if (last && venueOf(r) === A) {
          if (o.prefillDelayA) await sleep(o.prefillDelayA);
          return r.fulfill(json({ buyin_amount: 77000, card_amount: null, target_entries: 0, title: 'A매장-직전게임', dealers: null, event_memo: null, discounts: [] })).catch(() => {});
        }
        return r.fulfill(json(single(r) ? null : []));
      });
      await p.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(false)));
      // 장부 삭제(하드 삭제 RPC) — 운영으로 나가지 않게 여기서 받아 어느 매장으로 나갔는지만 적는다.
      await p.route(/\/rest\/v1\/rpc\/delete_ledger_session/, (r) => {
        o.deletes?.push(String((r.request().postDataJSON() as { p_venue_id?: string } | null)?.p_venue_id ?? ''));
        return r.fulfill({ status: 204, body: '' });
      });
    },
  });
  await openMyStore(page);
  await page.waitForSelector('[data-mystore-secpanel]', { timeout: 20_000 });
  await expect(page.getByLabel('관리할 매장 선택'), '관리자인데 매장 고르개가 없다').toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('관리할 매장 선택')).toHaveValue(A);
  await page.waitForTimeout(800);
  await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => /고급 기능 모두 보기/.test(x.textContent ?? ''))?.click(); });
  await page.waitForTimeout(300);
}

async function press(page: Page, sel: string, re: RegExp) {
  const ok = await page.evaluate(([s, src]) => {
    const rx = new RegExp(src);
    const b = [...document.querySelectorAll<HTMLElement>(s)].find((x) => x.offsetParent !== null && rx.test((x.textContent ?? '').trim()));
    b?.click();
    return !!b;
  }, [sel, re.source] as const);
  expect(ok, `누를 대상이 없다: ${sel} ${re}`).toBe(true);
}
const openPresets = async (page: Page) => {
  await press(page, '[data-mystore-secbar] button', /^매장 설정/);
  await page.waitForTimeout(600);
  await press(page, '[data-tab-id]', /게임 프리셋/);
};
const pane = (page: Page) => page.locator('[data-pane="presets"]');
const switchTo = (page: Page, v: string) => page.getByLabel('관리할 매장 선택').selectOption(v);

// ── L-05 ────────────────────────────────────────────────────────────────────
test('L-05 A 프리셋 수정 폼을 연 채 B 로 바꾸면 폼이 닫히고 B 목록이 보인다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page);
  await openPresets(page);
  await expect(pane(page).getByText('A-딥스택'), 'A 목록이 안 떴다').toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const li = [...document.querySelectorAll<HTMLElement>('[data-pane="presets"] li')].find((x) => /A-딥스택/.test(x.textContent ?? ''))!;
    [...li.querySelectorAll<HTMLElement>('button')].find((b) => (b.textContent ?? '').trim() === '수정')!.click();
  });
  await expect(pane(page).getByRole('heading', { name: '프리셋 수정' }), '수정 폼이 안 열렸다 — 이 검사가 아무것도 재지 않았다').toBeVisible();
  await expect(pane(page).locator('input[maxlength="40"]').first()).toHaveValue('A-딥스택');

  await switchTo(page, B);
  await page.waitForTimeout(1500);
  await expect(pane(page).getByRole('heading', { name: '프리셋 수정' }), 'A 프리셋 수정 폼이 B 매장 화면에 남았다(저장하면 A 행이 B 로 옮겨 간다)').toHaveCount(0);
  await expect(pane(page).getByText('B-데일리'), 'B 목록이 안 보인다').toBeVisible();
  await expect(pane(page).getByText('A-딥스택')).toHaveCount(0);
});

test('L-05 늦게 온 A 프리셋 목록이 B 목록을 덮지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, { presetDelayA: 2500 });
  await openPresets(page);
  await page.waitForTimeout(300); // A 목록 요청이 나갔다(2.5s 뒤 도착)
  await switchTo(page, B);
  await expect(pane(page).getByText('B-데일리'), 'B 목록이 안 떴다').toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(3500); // A 의 늦은 응답이 도착하고도 남을 시간
  await expect(pane(page).getByText('A-딥스택'), '늦게 온 A 프리셋 목록이 B 화면을 덮었다').toHaveCount(0);
  await expect(pane(page).getByText('B-데일리')).toBeVisible();
});

// ── L-14 ────────────────────────────────────────────────────────────────────
test('L-14 프리셋 조회가 실패하면 "없음"이 아니라 "못 불러옴"을 보인다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, { presetError: true });
  await openPresets(page);
  await page.waitForTimeout(2000);
  await expect(pane(page).getByText('저장된 프리셋이 없습니다'), '조회 실패를 "프리셋 없음"으로 그렸다').toHaveCount(0);
  await expect(pane(page).getByText(/프리셋.*(불러오지 못했|권한이 없습니다)/).first(), '실패 안내가 없다').toBeVisible();
  await expect(pane(page).getByRole('button', { name: /다시 시도/ })).toBeVisible();
});

// ── L-06 ────────────────────────────────────────────────────────────────────
const titleInput = (page: Page) => page.locator('[data-pane="ledger"] input[placeholder="예) 데일리 딥스택"]');

test('L-06 늦게 온 A 직전 설정·A 프리셋 목록이 B 새 게임 폼에 붙지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, { prefillDelayA: 2500, presetDelayA: 2500, presetsB: [] });
  await press(page, '[role=tablist][aria-label="매장 단계 이동"] [role=tab]', /장부/);
  await expect(titleInput(page), 'A 새 게임 폼이 안 열렸다').toBeVisible({ timeout: 15_000 });
  await switchTo(page, B); // A 의 직전 설정·프리셋 응답이 아직 오는 중
  await page.waitForTimeout(4500);
  await expect(titleInput(page), 'B 새 게임 폼이 안 열렸다').toBeVisible();
  await expect(page.locator('[data-pane="ledger"]').getByText('직전 게임 설정을 불러왔습니다'), '늦게 온 A 직전 설정이 B 폼에 "불러왔습니다"로 붙었다').toHaveCount(0);
  await expect(page.getByTestId('preset-picker-ledger'), '늦게 온 A 프리셋 목록이 B 폼의 고르개로 떴다(B 는 0개)').toHaveCount(0);
});


// ── review-store-link-1002 2a — 장부 목록 ────────────────────────────────────
// 늦게 온 A 장부 목록이 B 화면에 그려지면 그 행의 🗑 → deleteLedgerSession(지금 매장=B, A 의 날짜·회차) 로 **B 장부가 하드 삭제**됐다.
// 음성 대조: 수정 전 빌드(f6b7bc87)에서 A 행이 B 화면에 그려지고 삭제 요청이 B 로 나가 FAIL — store-link-1002b-report.md.
test('2a 늦게 온 A 장부 목록이 B 화면에 그려지지 않고, 🗑 삭제 요청이 B 매장으로 나가지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  const deletes: string[] = [];
  await boot(page, { listDelayA: 3000, deletes });
  await press(page, '[role=tablist][aria-label="매장 단계 이동"] [role=tab]', /장부/);
  await expect(page.getByRole('button', { name: '목록으로' }), '장부 보드가 안 열렸다').toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '목록으로' }).click(); // A 목록 요청이 나간다(3s 뒤 도착)
  await page.waitForTimeout(300);
  await switchTo(page, B);
  await expect(page.locator('[data-pane="ledger"]').getByText('아직 작성한 장부가 없습니다'), 'B 빈 목록이 안 떴다 — 이 검사가 아무것도 재지 않았다').toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(4000); // A 의 늦은 응답이 도착하고도 남을 시간

  // 결함이 있으면 A 행의 🗑 가 B 화면에 있다 — 실제로 눌러 꾹 확정까지 해 본다(삭제 RPC 는 위 route 가 받는다).
  const trash = page.getByRole('button', { name: '2026-09-29 메인 장부 삭제' });
  if (await trash.count()) {
    await trash.click();
    const confirm = page.getByRole('button', { name: '꾹 눌러 영구 삭제' });
    await expect(confirm).toBeEnabled({ timeout: 5_000 });
    await confirm.hover(); await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up();
    await page.waitForTimeout(800);
  }
  expect(deletes.filter((v) => v === B), `B 매장 장부 삭제 요청이 나갔다(${deletes.join(',')}) — A 목록 행으로 B 장부를 지웠다`).toEqual([]);
  await expect(page.locator('[data-pane="ledger"]').getByText('A매장-목록게임'), '늦게 온 A 장부 목록이 B 화면에 그려졌다').toHaveCount(0);
});

// ── F-1 — 직전 게임 설정이 폼보다 늦게 도착해도 칸이 채워진다 ────────────────────
// 음성 대조: 수정 전 빌드에서 '직전 게임 설정을 불러왔습니다' 는 보이는데 게임명 칸이 '' 라 FAIL.
test('F-1 늦게 온 직전 게임 설정이 새 게임 폼의 빈 칸을 채운다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, { prefillDelayA: 1500 });
  await press(page, '[role=tablist][aria-label="매장 단계 이동"] [role=tab]', /장부/);
  await expect(titleInput(page), 'A 새 게임 폼이 안 열렸다').toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-pane="ledger"]').getByText('직전 게임 설정을 불러왔습니다'), '직전 설정이 도착하지 않았다 — 이 검사가 아무것도 재지 않았다').toBeVisible({ timeout: 10_000 });
  await expect(titleInput(page), '"불러왔습니다" 문구만 뜨고 게임명 칸이 비었다').toHaveValue('A매장-직전게임');
});
