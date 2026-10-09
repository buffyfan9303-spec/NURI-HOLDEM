// 오픈 1회차 점검(audit-open-1009) 내 매장 지적 — 목킹 업주/직원 세션 · 운영 DB 쓰기 0 · 업주 PC 1440 + 모바일 390 · 다크/라이트.
//
//   F-01  시각 입력칸 고정 폭(StaffSchedule w-22=88px · StaffPayroll w-24=96px)이 ko-KR '오전 11:00' 을 '오전 1' 로 잘랐다
//         (11시 출근이 1시로 읽힘). 빈 칸 '-- --:--' 도 잘렸다. → 칸 폭 ≥ 브라우저가 그 칸 내용에 필요한 폭(max-content).
//   F-03  포스터 폼 이벤트·프로모션의 '자동 적용 레벨'(w-16+pr-6)·'할인액'(w-20+pr-6) number 칸 — PC 크롬은 스핀 버튼(≈18px)을
//         글자 공간 안에 늘 잡아 두어 16→'1', 60→'6', placeholder '자동'→'지', 할인 12.5→'12.' 로 잘렸다.
//   F-04  유료 노출 스위치(lib/paidExposure)가 꺼졌는데 업주 대시보드 '포스터 상단 고정 문의'·시트가 TOP 뱃지·맨 앞 표시를 약속했다.
//
// 음성 대조: 수정 전 빌드(origin/main 4d9253e8)에서 F-01·F-03·F-04 전부 FAIL, 수정 빌드 PASS — 보고서
//   C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit-open-1009\fix-store\report.md
// 실행: E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/open-fix-store-1009.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import type { Locator, Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_UID, MOCK_VENUE, MOCK_VENUE_NAME } from './_mockOwner';

const SHOT = process.env.FIX_SHOT_DIR;
const NONE = { can_access_ledger: false, can_manage_pos: false, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false };
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const DAY1 = `${MOCK_DAY.slice(0, 7)}-01`;
const YESTERDAY = new Date(Date.parse(`${MOCK_DAY}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.parse(`${MOCK_DAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

type Theme = 'dark' | 'light';
const CASES: { W: number; theme: Theme }[] = [{ W: 1440, theme: 'dark' }, { W: 1440, theme: 'light' }, { W: 390, theme: 'dark' }, { W: 390, theme: 'light' }];

// 오너 PC 는 한국어 크롬이다. ⚠ 시각 칸 표기('오전 11:00' / '11:00 AM')는 컨텍스트 locale 이 아니라 **브라우저 UI 언어**를 따른다
//   (2026-10-09 실측: locale en-US 컨텍스트에서도 한국어 Windows 크롬은 '오전 11:00'). 그래서 단언은 표기와 무관하게
//   '칸 폭 ≥ 그 칸 내용의 max-content' 로 한다 — 영어 러너(CI)에서는 '11:00 AM' 기준으로 같은 계약을 잰다.
test.use({ locale: 'ko-KR' });

/** 업주 PC 는 마우스(포인터 fine) — 터치 기기 규칙(입력 글자 16px)이 안 붙는 실제 조건으로 연다. */
async function boot(page: Page, W: number, theme: Theme, opts: Parameters<typeof bootOwner>[1] = {}) {
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* 차단 환경 */ } }, theme);
  await bootOwner(page, { viewport: { width: W, height: 900 }, ...opts });
  await openMyStore(page);
  await expect(page.locator('html')).toHaveClass(new RegExp(theme));
}

async function openSection(page: Page, W: number, label: string) {
  if (W >= 1024) {
    await page.locator('[data-mystore-secbar] button:visible').filter({ hasText: label }).first().click();
    return;
  }
  const grid = page.locator('[data-tab="my-store"] [data-main-enter] .grid').first();
  await expect(async () => {
    if (!(await grid.isVisible())) await page.getByTestId('mystore-menu-toggle').click();
    await expect(grid).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  // 메뉴는 묶음별 격자가 여러 개다(운영 · 사람 · 설정 …) — 첫 격자만 보면 '직원 관리' 를 못 찾는다.
  await page.locator('[data-tab="my-store"] [data-main-enter]').getByRole('button', { name: label, exact: true }).first().click();
}

/** 시각 칸: 실제 폭 vs 그 칸 내용(로캘·글자 크기 그대로)에 필요한 폭 — 같은 칸을 max-content 로 복제해 잰다. */
async function timeFits(inputs: Locator) {
  return inputs.evaluateAll((els) => els.map((el) => {
    const i = el as HTMLInputElement;
    const c = i.cloneNode() as HTMLInputElement;
    c.value = i.value;
    Object.assign(c.style, { width: 'max-content', minWidth: '0', maxWidth: 'none', position: 'absolute', visibility: 'hidden', left: '0', top: '0' });
    i.parentElement!.appendChild(c);
    const need = c.getBoundingClientRect().width;
    c.remove();
    const r = i.getBoundingClientRect();
    return { value: i.value || '(빈 칸)', w: +r.width.toFixed(1), need: +need.toFixed(1), right: +r.right.toFixed(1), vw: innerWidth, fs: getComputedStyle(i).fontSize };
  }));
}

/** number 칸: 글자(값 또는 placeholder) + 스핀 버튼 자리 ≤ 글자 공간. 스핀 자리는 같은 칸에 긴 값을 넣어 넘친 양으로 역산한다. */
async function numberFits(inputs: Locator) {
  return inputs.evaluateAll((els) => els.map((el) => {
    const i = el as HTMLInputElement;
    const cs = getComputedStyle(i);
    const cv = document.createElement('canvas').getContext('2d')!;
    cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const content = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const probe = i.cloneNode() as HTMLInputElement;
    probe.removeAttribute('max');
    probe.value = '8888888888';
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', width: `${i.getBoundingClientRect().width}px` });
    i.parentElement!.appendChild(probe);
    const spin = Math.max(0, probe.scrollWidth - probe.clientWidth - (cv.measureText(probe.value).width - content));
    probe.remove();
    const text = i.value || i.placeholder;
    const need = cv.measureText(text).width + spin;
    return { label: i.getAttribute('aria-label'), text, content: +content.toFixed(1), need: +need.toFixed(1), spin: +spin.toFixed(1), sw: i.scrollWidth, cw: i.clientWidth, fs: cs.fontSize };
  }));
}

for (const { W, theme } of CASES) {
  test.describe(`${W} ${theme}`, () => {
    if (W >= 1024) test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

    // ── F-01 ① 업주 › 직원 관리 › 딜러 출근 스케줄 › 날짜 칸의 출근·퇴근 ──────────────────────────────
    test(`F-01 딜러 출근 스케줄 — 출근 '오전 11:00'·빈 퇴근 칸이 잘리지 않는다 @${W} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await boot(page, W, theme, {
        extra: async (p) => {
          await p.route(/\/rest\/v1\/staff_wage\?/, (r) => (r.request().method() === 'GET'
            ? r.fulfill(json([{ staff_name: '김직원', hourly_wage: 11000, payday: 10, weekly_off: '', memo: null }])) : r.fallback()));
          await p.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET'
            ? r.fulfill(json([{ work_date: DAY1, staff_name: '김직원', start_hm: '11:00', check_in: '11:00', check_out: null, confirmed: false }])) : r.fallback()));
        },
      });
      await openSection(page, W, '직원 관리');
      await page.getByRole('button', { name: /딜러 출근 스케줄/ }).first().click();
      await page.getByRole('button', { name: /^1 김직원/ }).click();
      const panel = page.locator('div').filter({ has: page.getByText(/출근 직원 · 시각 입력/) }).last();
      const inputs = panel.locator('input[type="time"]');
      await expect(inputs).toHaveCount(2, { timeout: 15_000 });
      await inputs.first().scrollIntoViewIfNeeded();
      const m = await timeFits(inputs);
      console.log(`[F-01 스케줄 ${W} ${theme}]`, JSON.stringify(m));
      if (SHOT) await panel.screenshot({ path: `${SHOT}/f01-schedule-${W}-${theme}.png` });
      expect(m.map((x) => x.value)).toEqual(['11:00', '(빈 칸)']);
      for (const x of m) {
        expect(x.w, `'${x.value}' 칸 ${x.w}px < 필요 ${x.need}px — 글자가 잘린다`).toBeGreaterThanOrEqual(x.need - 0.5);
        expect(x.right, '칸이 화면 밖으로 나갔다').toBeLessThanOrEqual(x.vw);
      }
    });

    // ── F-01 ② 직원 › 출근 관리 › 내 출근 관리 행 ──────────────────────────────────────────────
    test(`F-01 직원 내 출근 관리 — '오전 11:00'·'오후 11:59'·빈 칸이 잘리지 않는다 @${W} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      const rows = [
        { work_date: MOCK_DAY, staff_name: '김직원', start_hm: '11:00', end_hm: null, check_in: '11:00', check_out: null, check_in_at: null, confirmed: false },
        { work_date: YESTERDAY, staff_name: '김직원', start_hm: '17:00', end_hm: null, check_in: '17:00', check_out: '23:59', check_in_at: null, confirmed: false },
      ];
      await boot(page, W, theme, {
        perms: NONE, profile: { role: 'venue_staff', name: '김직원', nickname: '김직원' },
        extra: async (p) => {
          await p.route(/\/rest\/v1\/rpc\/my_punch_state/, (r) => r.fulfill(json(rows.map((x) => ({ work_date: x.work_date, check_in: x.check_in, check_out: x.check_out })))));
          await p.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(rows)) : r.fallback()));
        },
      });
      const bar = page.locator('[data-tab="my-store"] [data-testid="staff-punch-bar"]');
      await expect(bar).toBeVisible({ timeout: 20_000 });
      await bar.getByTestId('punch-fix').click();
      const pane = page.locator('[data-pane="attendance"]');
      await expect(pane.getByText('내 출근 관리', { exact: false })).toBeVisible({ timeout: 10_000 });
      const inputs = pane.locator('input[type="time"]');
      await expect(inputs).toHaveCount(4, { timeout: 15_000 });
      await inputs.first().scrollIntoViewIfNeeded();
      const m = await timeFits(inputs);
      console.log(`[F-01 내 출근 ${W} ${theme}]`, JSON.stringify(m));
      if (SHOT) await pane.screenshot({ path: `${SHOT}/f01-self-${W}-${theme}.png` });
      expect(m.map((x) => x.value)).toEqual(['11:00', '(빈 칸)', '17:00', '23:59']);
      for (const x of m) {
        expect(x.w, `'${x.value}' 칸 ${x.w}px < 필요 ${x.need}px — 글자가 잘린다`).toBeGreaterThanOrEqual(x.need - 0.5);
        expect(x.right, '칸이 화면 밖으로 나갔다').toBeLessThanOrEqual(x.vw);
      }
    });

    // ── F-01 ③ 대시보드 › 딜러 로테이션·급여 시트의 추가 폼(같은 부류의 세 번째 시각 칸) ─────────────────────
    test(`F-01 딜러 로테이션 추가 폼 — 시작·종료 시각 칸이 잘리지 않는다 @${W} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await boot(page, W, theme, {
        extra: async (p) => {
          await p.route(/\/rest\/v1\/dealer_shifts\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
        },
      });
      await openSection(page, W, '대시보드');
      await page.getByRole('button', { name: '딜러 로테이션·급여' }).click();
      const dlg = page.getByRole('dialog');
      const inputs = dlg.locator('input[type="time"]');
      await expect(inputs).toHaveCount(2, { timeout: 15_000 });
      await inputs.first().fill('11:00');
      await inputs.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);   // 시트 진입 애니 끝
      const m = await timeFits(inputs);
      console.log(`[F-01 딜러 폼 ${W} ${theme}]`, JSON.stringify(m));
      if (SHOT) await dlg.screenshot({ path: `${SHOT}/f01-dealer-${W}-${theme}.png` });
      expect(m.map((x) => x.value)).toEqual(['11:00', '(빈 칸)']);
      for (const x of m) {
        expect(x.w, `'${x.value}' 칸 ${x.w}px < 필요 ${x.need}px — 글자가 잘린다`).toBeGreaterThanOrEqual(x.need - 0.5);
        expect(x.right, '칸이 화면 밖으로 나갔다').toBeLessThanOrEqual(x.vw);
      }
    });

    // ── F-03 포스터 수정 › 이벤트·프로모션 줄의 할인액(만)·자동 적용 레벨(LV) ─────────────────────────────
    test(`F-03 프로모션 레벨 16·60·자동, 할인 12.5 가 잘리지 않는다 @${W} ${theme}`, async ({ page }) => {
      test.setTimeout(150_000);
      const ID = 'aaaaaaaa-0000-4000-8000-00000000f003';
      const ROW = {
        id: ID, title: '깐부전', venue_id: MOCK_VENUE, pub_name: MOCK_VENUE_NAME, region: '경기북부',
        date: TOMORROW, start_time: '17:00', duration: '', format: 'MTT', guaranteed: true, prize_pool: 10_000_000,
        prize_percent: null, reg_close_time: '16LV', is_competition: false, grade: null, blinds: null,
        buy_in: { amount: 200_000, startStack: 50_000, gameType: '프리즈아웃' }, structure: null, description: '', rules: [], side_events: [],
        promotions: [
          { discountType: 'level', badge: '12.5만', title: '첫 바인 할인', discountWon: 125_000, level: 16 },
          { discountType: 'level', badge: '5만', title: '오픈 할인', discountWon: 50_000, level: 60 },
          { discountType: 'level', badge: '', title: '단골 할인', discountWon: 0, level: 0 },
        ],
        payment_methods: [], partners: [], ranking_prizes: [], seats: null,
        poster_url: null, poster_color: '#7C2D7E', display_order: 1, is_premium: false, owner_id: MOCK_UID, approved: true,
        rejected_at: null, reject_reason: null, unread_qna_count: 0, created_at: new Date().toISOString(),
      };
      await boot(page, W, theme, {
        extra: async (p) => {
          await p.route(/\/rest\/v1\/schedules(\?|$)/, (r: Route) => {
            if (r.request().method() !== 'GET') return r.fallback();
            const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
            return r.fulfill(json(single ? ROW : [ROW]));
          });
        },
      });
      await openSection(page, W, '게임 진행');
      await page.getByRole('tab', { name: /포스터/ }).first().click();
      const tab = page.locator('[data-tab="my-store"]');
      await expect(tab.getByText('깐부전').filter({ visible: true }).first(), '시드 포스터 행이 안 보인다').toBeVisible({ timeout: 20_000 });
      await tab.getByRole('button', { name: '수정', exact: true }).filter({ visible: true }).first().click();
      await expect(page.getByRole('heading', { name: '포스터 수정' })).toBeVisible({ timeout: 20_000 });
      const lv = page.getByLabel(/^프로모션 \d+ 자동 적용 레벨$/);
      const won = page.getByLabel(/^프로모션 \d+ 할인액\(만원\)$/);
      await expect(lv).toHaveCount(3, { timeout: 15_000 });
      await lv.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const m = [...await numberFits(lv), ...await numberFits(won)];
      console.log(`[F-03 ${W} ${theme}]`, JSON.stringify(m));
      if (SHOT) await lv.first().locator('xpath=ancestor::ul[1]').screenshot({ path: `${SHOT}/f03-promo-${W}-${theme}.png` });
      expect(m.map((x) => x.text)).toEqual(['16', '60', '자동', '12.5', '5', '없음']);
      for (const x of m) {
        expect(x.sw, `${x.label} '${x.text}' 값이 칸을 넘친다(scrollWidth ${x.sw} > ${x.cw})`).toBeLessThanOrEqual(x.cw);
        expect(x.need, `${x.label} '${x.text}' 글자+스핀 ${x.need}px > 글자 공간 ${x.content}px — 잘린다`).toBeLessThanOrEqual(x.content);
      }
    });

    // ── F-04 업주 대시보드 '포스터 상단 고정 문의' — 유료 노출 스위치가 꺼져 있으면 숨는다 ───────────────────────
    test(`F-04 유료 노출 꺼짐 — 대시보드에 상단 고정 문의 링크·TOP 뱃지 약속이 없다 @${W} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await boot(page, W, theme, { appSettings: { boost_contact_email: 'ace@nuriholdem.com' } });
      await openSection(page, W, '대시보드');
      const dash = page.locator('[data-pane="dashboard"]');
      await expect(dash.getByTestId('todo-cta'), '대시보드가 정착하지 않았다(빈 검사 방지)').toBeVisible({ timeout: 25_000 });
      await page.waitForTimeout(1500);
      if (SHOT) await page.screenshot({ path: `${SHOT}/f04-dash-${W}-${theme}.png` });
      await expect(dash.getByTestId('boost-inquiry'), '유료 노출이 꺼졌는데 상단 고정 문의 링크가 있다').toHaveCount(0);
      await expect(dash.getByText(/포스터 상단 고정/), '유료 노출이 꺼졌는데 상단 고정을 안내한다').toHaveCount(0);
      await expect(page.getByText(/TOP 뱃지/), '유료 노출이 꺼졌는데 TOP 뱃지를 약속한다').toHaveCount(0);
    });
  });
}
