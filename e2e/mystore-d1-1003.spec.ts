// 내 매장 D1(2026-10-03) 회귀 게이트. 전부 목킹(운영 쓰기 0).
//
//   ① 대시보드 '오늘 장부' 칸이 확인 중(스켈레톤 107px) → 미시작(48px)으로 접히며 아래 카드 격자가 약 60px 올라갔다
//      (C1 재검토 R-dash: 1440 CLS 0.017 · 390 0.029, 첫 진입·매장 전환 모두).
//   ② 그 아래 '지금 할 일' 카드가 확인 중엔 없다가 정착 순간 생겨 격자를 PC 72px·390 104~125px 밀었다(D1 재검토 D-a).
//      실제 영업 매장은 거의 늘 할 일이 있다(어제 마감 이력 → '그대로 열기', 정오 이후 포스터 없음 → '대회 등록하기').
//      할 일 판정이 시각(정오)에 따라 갈리므로 **시각을 고정해 정오 전·후를 둘 다** 돈다(종전 스펙은 실행 시각에 따라 결과가 갈렸다).
//   ③ 관리자 매장 전환(판이 다시 마운트되지 않는 경로)에서 A 연락처 저장 응답이 늦게 오면 B 입력칸에 A 번호가 들어갔다
//      (D1 재검토 crit P1 — 그대로 B 를 저장하면 B 공개 매장 페이지에 A 번호가 실린다).
//   원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-mystore-d1-1003.md · review-mystore-d1-1003-crit.md
//
// 음성 대조: ① origin/main 5c223417 에서 FAIL(107→48) · ② 7a94abc8 의 정오 후·이력 있음에서 FAIL(격자 72/104px) · ③ 7a94abc8 에서 FAIL.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const VENUE_B = '44444444-4444-4444-8444-444444444444';
const DELAY = 1200;        // 전환: '확인 중'을 여러 프레임 보이게 — 오늘 장부 조회(ledger_sessions)를 늦춘다
const FIRST_DELAY = 4000;  // 첫 진입: 대시보드는 '내 매장'을 누르기 전에 숨은 채 조회를 시작한다 — 누름 뒤까지 안 끝나게
const YDAY = new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);

/** 어제 마감한 장부 1건 — '지금 할 일'에 '지난 게임 그대로 열기'가 뜨는 조건(getLastClosedRound). */
const lastRoundRow = (venue: string) => ({
  venue_id: venue, session_date: YDAY, game_seq: 1, title: '어제 메인', buyin_amount: 50_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${YDAY}T10:00:00+09:00`, operators: [], reg_closed: true, closed: true, closed_at: `${YDAY}T22:00:00+09:00`,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${YDAY}T01:00:00Z`, clock_snapshot: null,
});

type Frame = { t: number; badge: string; h: number; next: number | null; reserve: boolean; todo: boolean; rh: number; th: number };

/** 매 프레임 '오늘 장부' 칸의 배지·높이, 아래 카드 격자의 문서 y, 할 일 자리 예약·카드 유무를 적는다(문서 시작부터). */
async function installSampler(page: Page, hour: number) {
  await page.addInitScript((h) => {
    // '지금 할 일'의 정오 분기(hour >= 12)만 고정한다 — 날짜·서버 시각·타이머는 그대로 둔다.
    Date.prototype.getHours = function () { return h; };
    const w = window as unknown as { __f: unknown[]; __ls: { t: number; v: number; input: boolean }[] };
    w.__f = []; w.__ls = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean }; w.__ls.push({ t: s.startTime, v: s.value, input: s.hadRecentInput }); } })
        .observe({ type: 'layout-shift', buffered: true });
    } catch { /* 지원 안 함 */ }
    const tick = () => {
      const band = [...document.querySelectorAll<HTMLElement>('[data-pane="dashboard"] button')]
        .find((b) => b.getClientRects().length && (b.querySelector('span > span')?.textContent ?? '').trim() === '오늘 장부');
      if (band) {
        const badge = (band.querySelector('span > span:nth-child(2)')?.textContent ?? '').trim();
        const pane = band.closest('[data-pane="dashboard"]');
        // 아래 카드 격자(대시보드 카드 10장) — C1 재검토가 잰 이동의 출처 노드 div.grid.grid-cols-1
        const nx = [...(pane?.querySelectorAll<HTMLElement>('div.grid.grid-cols-1') ?? [])].find((g) => g.getClientRects().length) ?? null;
        w.__f.push({ t: performance.now(), badge, h: band.getBoundingClientRect().height, next: nx ? nx.getBoundingClientRect().top + scrollY : null,
          reserve: !!pane?.querySelector('[data-testid="todo-reserve"]'), todo: !!pane?.querySelector('[data-testid="todo-cta"]'),
          rh: pane?.querySelector('[data-testid="todo-reserve"]')?.getBoundingClientRect().height ?? 0,
          th: pane?.querySelector('[data-testid="todo-cta"]')?.parentElement?.getBoundingClientRect().height ?? 0 });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, hour);
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __f: Frame[] }).__f);
const resetFrames = (page: Page) => page.evaluate(() => { const w = window as unknown as { __f: unknown[]; __ls: unknown[] }; w.__f = []; w.__ls = []; });

/** expectTodo — 정착 뒤 '지금 할 일' 카드가 있어야 하는 조건이면 격자 이동 0 까지 단언한다. 없으면 접힘을 허용(칸 높이만). */
function judge(f: Frame[], label: string, expectTodo: boolean) {
  const checking = f.filter((x) => x.badge === '확인 중');
  const idle = f.filter((x) => x.badge === '미시작');
  const hs = [...checking, ...idle].map((x) => x.h);
  const span = Math.max(...hs) - Math.min(...hs);
  // 격자 위치는 판이 처음 보인 뒤 300ms 부터 잰다 — 첫 프레임들은 '내 매장' 누름 직후 셸이 자리 잡는 이동(입력 직후라 CLS 면제)이다
  //   (실측: 첫 진입 1440 격자 top 501→576 이 누름 22ms 뒤, 확인 중→미시작은 4초 뒤).
  const t0 = (f[0]?.t ?? 0) + 300;
  const nexts = [...checking, ...idle].filter((x) => x.t >= t0).map((x) => x.next).filter((x): x is number => x != null);
  const nspan = nexts.length ? Math.max(...nexts) - Math.min(...nexts) : 0;
  const reserved = checking.filter((x) => x.reserve).length;
  const todoEnd = idle.length ? idle[idle.length - 1].todo : false;
  console.log(`[${label}] frames=${f.length} 확인중=${checking.length}(h ${checking[0]?.h.toFixed(1)} · 할일자리 ${reserved}) 미시작=${idle.length}(h ${idle[idle.length - 1]?.h.toFixed(1)} · 할일카드 ${todoEnd}) 높이폭=${span.toFixed(1)} 격자 y폭=${nspan.toFixed(1)} 자리h=${checking[checking.length - 1]?.rh.toFixed(1)} 카드h=${idle[idle.length - 1]?.th.toFixed(1)}`);
  expect(checking.length, `${label}: '확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
  expect(idle.length, `${label}: '미시작' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
  expect(span, `${label}: '오늘 장부' 칸 높이가 확인 중 → 미시작에서 바뀌었다(아래 카드가 밀린다)`).toBeLessThanOrEqual(1);
  expect(todoEnd, `${label}: 정착 뒤 '지금 할 일' 카드 유무가 이 조건의 전제와 다르다`).toBe(expectTodo);
  if (!expectTodo) return; // 이력 없는 새 매장·정오 전 — 정착 뒤 할 일이 없어 예약 자리가 접히는 것은 허용한다
  expect(reserved, `${label}: 확인 중에 '지금 할 일' 자리를 예약하지 않았다`).toBeGreaterThan(5);
  expect(nexts.length, `${label}: 아래 카드 격자를 못 쟀다 — 빈 검사`).toBeGreaterThan(5);
  // 할 일 문구는 종류마다 줄 수가 달라 자리표시와 몇 px 어긋날 수 있다(390: 자리 91.3 · '그대로 열기' 93.4) — 3px 안을 '이동 없음'으로 본다
  //   (종전 결함은 72~125px).
  expect(nspan, `${label}: 아래 카드 격자가 세로로 움직였다`).toBeLessThanOrEqual(3);
}

/** ledger_sessions — 지정 매장의 GET 을 늦추고, history 면 '어제 마감 1건' 질의에 답한다. */
async function routeSessions(p: Page, o: { delayFor?: string; delay: number; history: boolean }) {
  await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r: Route) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const u = r.request().url();
    if (!o.delayFor || u.includes(`venue_id=eq.${o.delayFor}`)) await sleep(o.delay);
    if (o.history && /closed=eq\.true/.test(u) && /session_date=lt\./.test(u)) {
      const v = /venue_id=eq\.([0-9a-f-]+)/.exec(u)?.[1] ?? MOCK_VENUE;
      return r.fulfill(json(single(r) ? lastRoundRow(v) : [lastRoundRow(v)])).catch(() => {});
    }
    return r.fallback().catch(() => {});
  });
}

for (const hour of [9, 14] as const) {
  for (const history of [false, true] as const) {
    // 할 일이 있는 조건: 어제 이력('그대로 열기') 또는 정오 이후(포스터 없음 → '대회 등록하기')
    const expectTodo = history || hour >= 12;
    const tag = `${hour}시·${history ? '어제 이력' : '이력 없음'}`;
    for (const [W, H] of [[1440, 900], [390, 844]] as const) {
      test(`${W} ${tag} — 첫 진입: 확인 중 → 미시작에서 '오늘 장부' 칸 높이·아래 카드 위치가 그대로다`, async ({ page }) => {
        test.setTimeout(90_000);
        await installSampler(page, hour);
        await bootOwner(page, { viewport: { width: W, height: H }, goto: false, extra: (p) => routeSessions(p, { delay: FIRST_DELAY, history }) });
        await page.goto('/');
        await openMyStore(page);
        await expect(page.locator('[data-pane="dashboard"] button').filter({ hasText: '미시작' }).first(), '미시작에 닿지 못했다').toBeVisible({ timeout: 25_000 });
        await page.waitForTimeout(800);
        judge(await frames(page), `${W} ${tag} 첫 진입`, expectTodo);
      });

      test(`${W} ${tag} — 매장 A→B 전환: B 확인 중 → 미시작에서 칸 높이·아래 카드 위치가 그대로다`, async ({ page }) => {
        test.setTimeout(90_000);
        await installSampler(page, hour);
        const writes: string[] = [];
        page.on('request', (r) => { if (/supabase\.co\/rest\//.test(r.url()) && !['GET', 'HEAD'].includes(r.method()) && !/\/rpc\/|\/client_errors/.test(r.url())) writes.push(`${r.method()} ${r.url().slice(0, 100)}`); });
        await bootOwner(page, {
          viewport: { width: W, height: H },
          extra: async (p) => {
            await p.route(/\/rest\/v1\/rpc\/my_member_venues/, (r) => r.fulfill(json([{ id: MOCK_VENUE, name: '테스트 홀덤펍', relation: 'owner' }, { id: VENUE_B, name: '둘째 매장', relation: 'coowner' }])));
            await p.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers|can_manage_venue_staff|can_manage_venue_schedules|can_manage_schedule)($|\?)/, (r) => r.fulfill(json(true)));
            await routeSessions(p, { delayFor: VENUE_B, delay: DELAY, history });
          },
        });
        await openMyStore(page);
        const pick = page.locator('#mystore-venue-pick');
        await expect(pick, '매장 고르개가 없다(이 검사의 전제)').toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[data-pane="dashboard"] button').filter({ hasText: '미시작' }).first()).toBeVisible({ timeout: 25_000 });
        await page.waitForTimeout(500);
        await resetFrames(page);
        await pick.focus();
        await page.keyboard.press('ArrowDown');
        await expect(pick, 'B 매장을 못 골랐다(이 검사의 전제)').toHaveValue(VENUE_B);
        await page.waitForTimeout(DELAY + 2000);
        judge(await frames(page), `${W} ${tag} 전환`, expectTodo);
        const ls = await page.evaluate(() => (window as unknown as { __ls: { t: number; v: number; input: boolean }[] }).__ls);
        const cls = ls.filter((x) => !x.input).reduce((s, x) => s + x.v, 0);
        console.log(`[${W} ${tag} 전환] 입력 밖 이동 합=${cls.toFixed(4)}`);
        // 1440 은 셸이 움직이지 않는다(C1) — 대시보드 정착 이동이 사라졌으면 0 근처다(재검토 전 B 어제 이력 0.0142).
        //   390 은 셸 쪽 기존 이동(max-lg:border-b −47px, 기준에도 같은 값)이 있어 단언하지 않고 기록만 한다.
        if (W >= 1024 && expectTodo) expect(cls, `${W} ${tag}: 매장 전환 뒤 입력 밖 레이아웃 이동이 남았다`).toBeLessThan(0.005);
        expect(writes).toEqual([]);
      });
    }
  }
}

// ── ③ 관리자 매장 전환 중 연락처 저장 응답 지연 ──────────────────────────────────────────────────
test('1440 — 관리자: A 연락처 저장 응답이 B 로 바꾼 뒤에 와도 B 입력칸에 A 번호가 들어가지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  const PHONE_A = '010-1111-1111', PHONE_B = '010-2222-2222';
  const row = (id: string, name: string, phone: string) => ({
    id, name, region: '서울', address: `${name} 주소`, owner_id: '00000000-0000-4000-8000-0000000000aa', approved: true, status: 'active',
    verification_status: 'verified', is_paid_ad: false, display_order: 1, follower_count: 0, rating: 0, page_config: null,
    business_hours: '18:00~04:00', contact_phone: phone, contact_phones: [{ label: '대표', phone }], kakao_url: '', created_at: '2026-01-01T00:00:00Z',
  });
  const A = row(MOCK_VENUE, '테스트 홀덤펍', PHONE_A), B = row(VENUE_B, '둘째 매장', PHONE_B);
  let saved = 0;
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    profile: { role: 'admin' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/venues\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = r.request().url();
        const one = u.includes(`id=eq.${VENUE_B}`) ? B : u.includes(`id=eq.${MOCK_VENUE}`) ? A : null;
        if (single(r)) return r.fulfill(json(one ?? A));
        return r.fulfill(json(one ? [one] : [A, B]));
      });
      // 저장 RPC — 목으로 받고 2초 늦게 답한다(운영에 나가지 않는다).
      await p.route(/\/rest\/v1\/rpc\/update_venue_contacts/, async (r) => { saved += 1; await sleep(2000); return r.fulfill({ status: 204, body: '' }).catch(() => {}); });
    },
  });
  await openMyStore(page);
  const pick = page.locator('#mystore-venue-pick');
  await expect(pick, '관리자 매장 고르개가 없다(이 검사의 전제)').toBeVisible({ timeout: 20_000 });
  await expect(pick).toHaveValue(MOCK_VENUE);
  await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button, [data-main-enter] button')].find((b) => b.getClientRects().length && /매장 설정/.test(b.textContent ?? ''))?.click(); });
  const phone = page.getByRole('textbox', { name: '연락처 1 번호' });
  await expect(phone, 'A 연락처를 못 불러왔다(이 검사의 전제)').toHaveValue(PHONE_A, { timeout: 20_000 });
  await page.getByRole('button', { name: /위치 · 연락처 · 영업시간 · 카카오톡 저장/ }).click();
  await expect.poll(() => saved, { message: '저장 요청이 나가지 않았다(이 검사의 전제)' }).toBe(1);
  await pick.selectOption(VENUE_B);   // 저장 응답(2초)이 오기 전에 B 로
  await expect(phone, 'B 연락처를 못 불러왔다(이 검사의 전제)').toHaveValue(PHONE_B, { timeout: 20_000 });
  await page.waitForTimeout(2600);     // A 저장 응답이 도착한 뒤
  const vals = await page.getByRole('textbox', { name: /연락처 \d+ 번호/ }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  console.log('[관리자 전환 연락처] B 입력칸', vals);
  expect(vals, 'A 저장 응답이 B 입력칸을 A 번호로 덮었다').not.toContain(PHONE_A);
  expect(vals).toContain(PHONE_B);
});
