// 본문 안 펼침/접힘 — "정적이지 말고 부드럽게, 누르면 화면이 위아래로 튀는 문제 0"(오너 2026-09-29) 회귀 게이트.
//
// 공용 atom `src/components/atoms/Fold.tsx`(높이 0↔실측 WAAPI) + `useReveal`(그리드 칸) + `onSummaryClick`(details 클램프).
// 감사(scratchpad motion-typo-audit.md §1)가 잰 결함 부류를 하나씩 대표로 잡는다:
//   ① 조건부 렌더 = 한 프레임 점프      → 일정 탐색 '공지사항'(App.tsx) — 높이가 여러 프레임에 걸쳐 변하는가(≥5단)
//   ② 옆 요소가 사라져 버튼이 올라감   → 대회 상세 '참가 예약 더보기'(ScheduleDetailModal) — 전 −9.76px
//   ③ 버튼 위에 내용이 생김            → 내 매장 대시보드 '더 보기'(StoreDashboard, 1440) — 전 +400px
//   ④ 바닥에서 닫으면 클램프          → 법정 푸터 '더보기'(BusinessFooter details, 옛 '추가 정보') — 전 +44px
//   ⑤ 한 번에 하나 열리는 아코디언      → 내 매장 직원 관리(StaffHub) — 위 항목이 닫혀 줄면 누른 항목이 끌려 올라갔다
//   ⑥ sticky 띠 안 위 삽입             → 일정 탐색 검색 입력(IntegratedSearchBar) — 칩 줄 안에서 가로로(오너 결정 (a)), 전 55.25px
//   ⑦ 지연 청크로 뺀 모달               → 대시보드 '딜러 로테이션·급여'(DealerShiftsModal) — 눌러서 열리고 폴백 판이 안 보인다
//   + 동작 줄이기 = 즉시, 탭 재방문 = 재생 0.
//
// 🔴 CLS 로 재지 않는다 — 누른 뒤 500ms 안의 이동은 hadRecentInput 이라 CLS 에서 빠져 '0' 이 저절로 참이 된다(감사 §0).
//   **누른 요소의 중심 y** 를 매 rAF 기록한다. top 이 아니라 중심인 이유: 전역 프레스 물리 `button:active{scale(.97)}` 가
//   top 을 ±0.66px 흔든다(중심은 그대로) — 레이아웃 이동과 누름 효과를 가르기 위해서다.
// 🔴 누름은 CDP 터치 120ms 홀드 — Playwright click/tap 은 누름 0ms 라 :active·transform 부류를 못 만든다(CLAUDE.md).
// 음성 대조(2026-09-29): 수정 전 빌드(HEAD cf99d1c3)에서 ①②③④ 모두 실패한다 — scratchpad motion-M-report.md.
import { test, expect } from './_fixtures';
import type { Locator, Page } from '@playwright/test';
import { kstDay } from './_schedules';
import { bootOwner, openMyStore } from './_mockOwner';

type Frame = { cy: number | null; sh: number; dt: number }; // sh = 펼침을 품은 상자 높이
type Summary = { dCenter: number; steps: number; dSH: number; long: number[] };

/** 누른 요소 중심 y · 펼침을 품은 상자(box = closest 선택자, 없으면 부모) 높이 · 프레임 간격을 ms 동안 rAF 마다 기록한다.
 *  ⚠ 문서 scrollHeight 로 재면 안 된다 — 판에 최소 높이 예약(.pane-reserve)이 걸린 화면은 내용이 자라도 문서 높이가 그대로다. */
async function record(el: Locator, ms: number, box: string): Promise<Frame[]> {
  return el.evaluate((node, [ms, box]) => new Promise<Frame[]>((res) => {
    const wrap = (box ? node.closest(box as string) : null) ?? node.parentElement!;
    const fr: Frame[] = []; const t0 = performance.now(); let last = t0;
    const f = (now: number) => {
      const r = node.isConnected ? node.getBoundingClientRect() : null;
      fr.push({ cy: r ? (r.top + r.bottom) / 2 : null, sh: +wrap.getBoundingClientRect().height.toFixed(2), dt: now - last }); last = now;
      if (now - t0 < (ms as number)) requestAnimationFrame(f); else res(fr);
    };
    requestAnimationFrame(f);
  }), [ms, box] as const);
}
const summarize = (fr: Frame[]): Summary => {
  const cys = fr.map((x) => x.cy).filter((x): x is number => x != null);
  const sh = fr.map((x) => x.sh);
  return {
    dCenter: +Math.max(...cys.map((c) => Math.abs(c - cys[0]))).toFixed(2),
    steps: sh.filter((v, i) => i > 0 && v !== sh[i - 1]).length,
    dSH: sh[sh.length - 1] - sh[0],
    long: fr.slice(1).filter((x) => x.dt > 50).map((x) => +x.dt.toFixed(1)),
  };
};
/** CDP 터치 — touchStart → 120ms → touchEnd (실제 손가락 조건). */
async function press(page: Page, el: Locator) {
  const b = (await el.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function toggle(page: Page, el: Locator, box = '', ms = 900): Promise<Summary> {
  const rec = record(el, ms, box);
  await page.waitForTimeout(30);
  await press(page, el);
  const s = summarize(await rec);
  await page.waitForTimeout(300);
  return s;
}
/** 스크롤러를 맨 아래로(문서가 짧아질 때의 클램프 조건). */
const toBottom = (el: Locator) => el.evaluate((node) => {
  let sc: Element = document.scrollingElement!;
  for (let a = node.parentElement; a; a = a.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight + 1) { sc = a; break; }
  }
  sc.scrollTop = 1e7;
});

// ── 운영 읽기 0 — 일정·공지는 고정 픽스처, 나머지 읽기는 빈 배열, 쓰기는 차단 ──
const TITLE = 'FOLD 모션 회귀';
const SCHED = {
  id: 'fffffff0-0000-4000-8000-000000000001', title: TITLE, venue_id: null,
  pub_name: '목킹 홀덤펍', region: '서울', address: '서울 어딘가 1',
  date: kstDay(1), start_time: '19:00:00', duration: '6시간', // 내일 — 예약 박스는 ended=false 여야 뜬다
  format: 'NLH', guaranteed: true, prize_pool: 1_000_000, prize_percent: null,
  is_competition: false, grade: null, blinds: null, buy_in: { amount: 30_000 }, seats: null,
  display_order: 0, is_premium: false, owner_id: 'e2e-mock-owner', approved: true,
  unread_qna_count: 0, view_count: 0, premium_until: null, reg_close_time: null,
  structure: null, description: null, side_events: null, ranking_prizes: null,
  partners: null, promotions: null, payment_methods: null, rules: null,
  poster_url: null, poster_color: null, rejected_at: null, reject_reason: null,
};
const NOTICES = [1, 2, 3].map((i) => ({
  id: `fffffff1-0000-4000-8000-00000000000${i}`, type: 'pinned', title: `목킹 공지 ${i}`, body: '본문',
  author_name: '운영', created_at: new Date(Date.now() - i * 3_600_000).toISOString(), board: 'all', sort_order: 10 - i,
}));
async function mockAll(page: Page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/rest\/v1\/schedules/.test(url)) return json([SCHED]);
    if (/\/rest\/v1\/marketplace_notices/.test(url)) return json(NOTICES);
    if (/\/rest\/v1\/rpc\/(create_reservation|request_buyin|cancel_my_reservation)/.test(url)) return json({ message: 'blocked' }, 500);
    if (/\/rest\/v1\//.test(url)) return json([]);
    if (/supabase\.co/.test(url)) return json({});
    return route.abort('blockedbyclient');
  });
  await page.addInitScript(() => { try { localStorage.setItem('nuri:install-dismissed', '1'); } catch { /* 차단 환경 */ } });
}
async function gotoBrowse(page: Page) {
  await mockAll(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=browse');
  const btn = page.locator('main[data-tab="browse"] button[aria-expanded]').filter({ hasText: '공지사항' });
  await expect(btn, '일정 탐색 공지사항 토글이 없다').toBeVisible({ timeout: 20_000 });
  await btn.evaluate((b) => b.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(600);
  return btn;
}

test.describe('Fold — 펼침/접힘은 부드럽고 누른 요소는 제자리', () => {
  test('① 일정 탐색 공지사항 — 열기·닫기 모두 여러 프레임에 걸쳐 자라고 줄며, 누른 버튼은 1px 도 안 움직인다', async ({ page }) => {
    const btn = await gotoBrowse(page);
    const open = await toggle(page, btn, 'section');
    const close = await toggle(page, btn, 'section');
    console.log(`[fold ① notices 390] open ${JSON.stringify(open)} close ${JSON.stringify(close)}`);
    expect(open.dSH, '열었는데 문서 높이가 안 늘었다 — 대상이 아니다').toBeGreaterThan(40);
    expect(open.steps, `열기가 ${open.steps}단 — 한 프레임 점프`).toBeGreaterThanOrEqual(5);
    expect(close.steps, `닫기가 ${close.steps}단 — 한 프레임 점프`).toBeGreaterThanOrEqual(5);
    expect(open.dCenter, '열 때 누른 버튼이 움직였다').toBeLessThanOrEqual(1);
    expect(close.dCenter, '닫을 때 누른 버튼이 움직였다').toBeLessThanOrEqual(1);
  });

  test('① 동작 줄이기 — 즉시 열리고 닫힌다(모션 0)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const btn = await gotoBrowse(page);
    const open = await toggle(page, btn, 'section');
    const close = await toggle(page, btn, 'section');
    console.log(`[fold ① notices 390 RM] open ${JSON.stringify(open)} close ${JSON.stringify(close)}`);
    expect(open.dSH).toBeGreaterThan(40);
    expect(open.steps, '동작 줄이기인데 높이가 여러 프레임에 걸쳐 변했다').toBeLessThanOrEqual(1);
    expect(close.steps).toBeLessThanOrEqual(1);
  });

  test('① 탭 재방문 — 열어 둔 공지가 다시 재생되지 않는다(keep-alive)', async ({ page }) => {
    const btn = await gotoBrowse(page);
    await toggle(page, btn);
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    // 다른 탭으로 갔다가 뒤로가기로 돌아온다 — 일정 탐색 판은 keep-alive 라 display 토글로 다시 보인다.
    await page.locator('nav[aria-label="하단 내비게이션"] button').filter({ hasText: '라이브' }).first().click();
    await page.waitForTimeout(800);
    await page.goBack();
    await expect(btn, '뒤로가기로 일정 탐색에 돌아오지 못했다').toBeVisible();
    await page.waitForTimeout(80);
    const running = await page.evaluate(() => document.getAnimations()
      .filter((a) => (a.effect as KeyframeEffect | null)?.getKeyframes().some((k) => 'height' in k)).length);
    expect(running, '탭을 다시 열었더니 높이 애니메이션이 다시 돌았다').toBe(0);
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  test('② 대회 상세 참가 예약 더보기 — 예약하기 CTA 가 자리를 지켜 누른 줄이 안 움직인다', async ({ page }) => {
    await mockAll(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: '전체 일정', exact: false }).first().click({ timeout: 15_000 });
    const card = page.locator('main[data-tab="browse"] article.cv-card-list').filter({ hasText: TITLE }).first();
    await card.waitFor({ timeout: 20_000 });
    await card.getByRole('heading').click();
    const dialog = page.locator('[role="dialog"][data-scroll-lock]').filter({ hasText: TITLE });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const btn = dialog.locator('button[aria-expanded]').filter({ hasText: '참가 예약' });
    await btn.evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(700);
    const open = await toggle(page, btn, 'section');
    const close = await toggle(page, btn, 'section');
    console.log(`[fold ② reserve 390] open ${JSON.stringify(open)} close ${JSON.stringify(close)}`);
    expect(open.dSH, '펼쳤는데 높이가 안 늘었다').toBeGreaterThan(100);
    expect(open.dCenter, `열 때 '더보기' 줄이 ${open.dCenter}px 움직였다 — 예약하기 CTA 가 빠졌다`).toBeLessThanOrEqual(1);
    expect(close.dCenter).toBeLessThanOrEqual(1);
    expect(open.steps).toBeGreaterThanOrEqual(5);
    expect(close.steps).toBeGreaterThanOrEqual(5);
  });

  test('③ 내 매장 대시보드 더 보기(1440) — 버튼 위에 칸이 생기고 사라져도 누른 버튼은 제자리', async ({ page }) => {
    await bootOwner(page, { viewport: { width: 1440, height: 900 } });
    await openMyStore(page);
    const btn = page.locator('main[data-tab="my-store"] button[aria-expanded]').filter({ hasText: /간단히 보기|더 보기 · 클락/ });
    await expect(btn, '대시보드 더 보기 토글이 없다').toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500); // 대시보드 데이터 파도가 가라앉을 때까지
    await btn.evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(500);
    expect(await btn.getAttribute('aria-expanded'), 'PC 는 펴고 시작한다(StoreDashboard 주석)').toBe('true');
    const close = await toggle(page, btn);
    const open = await toggle(page, btn);
    console.log(`[fold ③ dashboard 1440] close ${JSON.stringify(close)} open ${JSON.stringify(open)}`);
    expect(Math.abs(open.dSH), '더 보기가 칸을 안 바꿨다 — 대상이 아니다').toBeGreaterThan(100);
    expect(close.dCenter, `접을 때 누른 버튼이 ${close.dCenter}px 움직였다`).toBeLessThanOrEqual(1);
    expect(open.dCenter, `펼칠 때 누른 버튼이 ${open.dCenter}px 움직였다(수정 전 +400)`).toBeLessThanOrEqual(1);
  });

  for (const rm of [false, true]) test(`④ 법정 푸터 더보기 — 맨 아래에서 닫아도 요약줄이 내려오지 않는다(클램프)${rm ? ' · 동작 줄이기' : ''}`, async ({ page }) => {
    // 동작 줄이기도 따로 잰다 — 전역 `*{transition-duration:.01ms}` 가 padding 변경을 한 프레임 늦춰 RM 에서만 +44 가 남았던 부류(2026-09-29).
    if (rm) await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoBrowse(page);
    // 2026-10-03 요약줄 이름 '추가 정보' → '더보기'(법정 표시사항은 밖으로, 링크·개정 안내만 접힘) — 문구 대신 testid 로 잡는다.
    const summary = page.locator('[data-testid="business-footer"] [data-testid="footer-more"] > summary').first();
    await summary.evaluate((s) => s.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    await toggle(page, summary, 'details'); // 열기
    await toBottom(summary);
    await page.waitForTimeout(500);
    await expect(summary, '맨 아래로 내렸더니 요약줄이 화면 밖이다').toBeInViewport();
    const before = await summary.evaluate((s) => ({ h: s.parentElement!.getBoundingClientRect().height, bottom: innerHeight + scrollY >= document.documentElement.scrollHeight - 1 }));
    expect(before.bottom, '맨 아래가 아니다 — 클램프 조건을 못 만들었다').toBe(true);
    const close = await toggle(page, summary, 'details');
    const after = await summary.evaluate((s) => ({ open: (s.parentElement as HTMLDetailsElement).open, h: s.parentElement!.getBoundingClientRect().height }));
    console.log(`[fold ④ footer@bottom 390${rm ? ' RM' : ''}] close ${JSON.stringify(close)} details ${before.h}→${after.h}`);
    expect(after.open, '닫히지 않았다').toBe(false);
    expect(before.h - after.h, '닫았는데 내용이 안 줄었다 — 클램프 조건이 아니다').toBeGreaterThan(20);
    expect(close.dCenter, `바닥에서 닫자 요약줄이 ${close.dCenter}px 움직였다(수정 전 +44)`).toBeLessThanOrEqual(1);
  });

  test('⑤ 한 번에 하나 여는 아코디언(직원 관리) — 위 항목이 닫혀 줄어도 누른 항목은 제자리', async ({ page }) => {
    await bootOwner(page, { viewport: { width: 1440, height: 700 } });
    await openMyStore(page);
    await page.locator('[data-mystore-secbar] button').filter({ hasText: '직원 관리' }).first().click();
    const target = page.getByRole('button', { name: /딜러 출근 스케줄/ });
    await expect(target, '직원 관리 아코디언이 없다').toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /구성원 목록/ })).toContainText('접기'); // 첫 항목이 열린 채 시작
    await page.waitForTimeout(1500);
    // 위 항목이 줄어드는 만큼 스크롤을 되돌릴 여유가 있어야 한다 — scrollTop 은 0 아래로 못 가서, 맨 위 근처에서는
    //   원리적으로 남는 만큼 끌려간다(보고서 '한계'). 그래서 문서 맨 아래(여유 최대)에서 누른다.
    await page.evaluate(() => window.scrollTo(0, 1e7));
    await page.waitForTimeout(400);
    const room = await target.evaluate((b) => ({ y: scrollY, top: b.getBoundingClientRect().top }));
    expect(room.top, '누를 항목이 화면 밖이다').toBeGreaterThan(0);
    const s = await toggle(page, target, 'div.space-y-3');
    console.log(`[fold ⑤ staff accordion 1440] ${JSON.stringify(s)}`);
    expect(await target.textContent(), '누른 항목이 안 열렸다').toContain('접기');
    expect(s.dCenter, `위 항목이 닫히며 누른 항목이 ${s.dCenter}px 끌려갔다`).toBeLessThanOrEqual(1);
  });

  for (const w of [320, 390, 1440]) test(`⑥ 일정 탐색 검색 칩(${w}) — 입력이 칩 줄 안에서 가로로 자라 누른 칩·날짜 띠·레일·아래 목록이 안 움직인다`, async ({ page }) => {
    await mockAll(page);
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto('/?tab=browse');
    // 라벨이 열면 '검색 닫기' 로 바뀐다 — 두 라벨 모두로 같은 칩을 잡는다
    const chip = page.locator('main[data-tab="browse"] button[aria-label="검색 열기"], main[data-tab="browse"] button[aria-label="검색 닫기"]');
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    // 칩 · sticky 날짜 띠(레일 바로 위 형제) · 레일 · 레일 아래 첫 형제 · 입력 칸 폭을 매 프레임
    const watch = () => chip.evaluate((c) => new Promise<{ top: number; band: number; rail: number; below: number; w: number }[]>((res) => {
      const rail = c.parentElement!; const band = rail.previousElementSibling!; const below = rail.nextElementSibling;
      const fr: { top: number; band: number; rail: number; below: number; w: number }[] = []; const t0 = performance.now();
      const f = () => {
        const input = rail.querySelector('input[type=search]');
        fr.push({ top: c.getBoundingClientRect().top, band: band.getBoundingClientRect().height, rail: rail.getBoundingClientRect().height,
          below: below ? below.getBoundingClientRect().top : 0, w: input ? input.closest('form')!.parentElement!.getBoundingClientRect().width : 0 });
        if (performance.now() - t0 < 900) requestAnimationFrame(f); else res(fr);
      };
      requestAnimationFrame(f);
    }));
    const span = (fr: Record<string, number>[], k: string) => Math.max(...fr.map((x) => Math.abs(x[k] - fr[0][k])));
    for (const ph of ['open', 'close'] as const) {
      const rec = watch(); await page.waitForTimeout(30); await press(page, chip); const fr = await rec;
      const ws = fr.map((x) => x.w); const steps = ws.filter((v, i) => i > 0 && v !== ws[i - 1]).length;
      const r = { top: +span(fr, 'top').toFixed(2), band: span(fr, 'band'), rail: span(fr, 'rail'), below: span(fr, 'below'), steps, wEnd: ws[ws.length - 1] };
      console.log(`[fold ⑥ search ${w} ${ph}] ${JSON.stringify(r)}`);
      expect(r.top, `${ph}: 누른 칩이 ${r.top}px 움직였다(수정 전 55.25)`).toBeLessThanOrEqual(1);
      expect(r.band, `${ph}: sticky 날짜 띠 높이가 바뀌었다`).toBe(0);
      expect(r.rail, `${ph}: 칩 레일 높이가 바뀌었다`).toBe(0);
      expect(r.below, `${ph}: 레일 아래 목록이 움직였다`).toBeLessThanOrEqual(1);
      expect(r.steps, `${ph}: 입력 칸 폭이 ${r.steps}단 — 한 프레임에 생기거나 사라졌다`).toBeGreaterThanOrEqual(5);
      if (ph === 'open') {
        expect(r.wEnd, '검색 입력이 안 펼쳐졌다').toBeGreaterThan(150);
        await expect(page.locator('main[data-tab="browse"] input[type="search"]'), '열면 입력에 초점').toBeFocused();
        // 나머지 칩은 레일 가로 스크롤로 여전히 닿는다
        const last = await chip.evaluate((c) => { const rail = c.parentElement!; rail.scrollLeft = 1e5; const l = rail.lastElementChild!.getBoundingClientRect(); const rr = rail.getBoundingClientRect(); const ok = l.right <= rr.right + 1 && l.left >= rr.left - 1; rail.scrollLeft = 0; return ok; });
        expect(last, '입력을 펼치면 끝 칩에 닿지 못한다').toBe(true);
        await page.waitForTimeout(300);
      } else {
        expect(r.wEnd, '닫았는데 입력이 남았다').toBe(0);
      }
      await page.waitForTimeout(300);
    }
  });

  // D1(2026-09-30 검토) — 부모 space-y 가 판에 거는 margin(12.75px)이 여는 첫 프레임에 한 번에 생기고 닫는 끝 프레임(언마운트)에
  //   한 번에 사라졌다. 판 아래 첫 요소(after)의 top 을 매 프레임 재서, 닫기 끝 단계와 열기 첫 단계의 margin 을 본다.
  test('⑧ space-y 부모 안 판(딜러 ICM) — 부모 간격도 높이와 같이 자라고 줄어 한 프레임에 생기거나 사라지지 않는다', async ({ page }) => {
    await mockAll(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?tab=community');
    await page.locator('[data-testid="sec-tab-dealer"]').click({ timeout: 20_000 });
    const btn = page.locator('main[data-tab="community"] button').filter({ hasText: /ICM\s*계산기/ });
    await expect(btn, '딜러 ICM 토글이 없다').toBeVisible({ timeout: 20_000 });
    await btn.evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(600);
    const watch = () => btn.evaluate((b) => new Promise<{ gap: number; m: string }[]>((res) => {
      // 판 아래 첫 요소는 **닫힌 상태에서 한 번** 정한다(열린 뒤 다시 고르면 판 자신을 고른다).
      const grid = b.parentElement!; const w = window as unknown as { __foldAfter?: Element | null };
      const after = w.__foldAfter ??= grid.nextElementSibling;
      const fr: { gap: number; m: string }[] = []; const t0 = performance.now();
      const f = () => {
        const fold = grid.nextElementSibling !== after ? grid.nextElementSibling as HTMLElement | null : null;
        fr.push({ gap: after ? +(after.getBoundingClientRect().top - grid.getBoundingClientRect().bottom).toFixed(2) : NaN, m: fold ? getComputedStyle(fold).marginTop : '-' });
        if (performance.now() - t0 < 800) requestAnimationFrame(f); else res(fr);
      };
      requestAnimationFrame(f);
    }));
    const run = async () => { const rec = watch(); await page.waitForTimeout(30); await press(page, btn); return rec; };
    const open = await run(); await page.waitForTimeout(300);
    const close = await run();
    const deltas = (fr: { gap: number }[]) => fr.slice(1).map((x, i) => +(x.gap - fr[i].gap).toFixed(2)).filter((d) => d !== 0);
    const oD = deltas(open), cD = deltas(close);
    const ms = [...new Set(open.map((x) => x.m).filter((m) => m !== '-'))];
    console.log(`[fold ⑧ dealer icm 390] open ${JSON.stringify(oD)} margins ${JSON.stringify(ms)} close ${JSON.stringify(cD)}`);
    expect(Number.isNaN(open[0].gap), '판 아래 요소가 없다 — 잴 수 없다').toBe(false);
    expect(oD.reduce((a, b) => a + b, 0), '열었는데 안 자랐다 — 대상이 아니다').toBeGreaterThan(100);
    expect(ms.length, `열기 동안 판 margin 이 ${JSON.stringify(ms)} 뿐 — 첫 프레임에 한 번에 생겼다`).toBeGreaterThanOrEqual(3);
    expect(Math.abs(cD[cD.length - 1]), `닫기 끝 단계가 ${cD[cD.length - 1]}px — 부모 간격이 한 번에 사라졌다(수정 전 −13.46)`).toBeLessThanOrEqual(2);
  });

  test('⑦ 대시보드 딜러 로테이션 모달(지연 청크) — 누르면 열리고, 여는 동안 불투명 폴백 판이 없다', async ({ page }) => {
    await bootOwner(page, { viewport: { width: 1440, height: 900 } });
    await openMyStore(page);
    const btn = page.locator('main[data-tab="my-store"] button').filter({ hasText: '딜러 로테이션·급여' });
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(500);
    // 누른 뒤 대화상자가 뜰 때까지 매 프레임 — 대화상자 말고 화면을 덮는 판(Suspense 폴백 등)이 생기면 안 된다
    const rec = page.evaluate(() => new Promise<{ covered: number; dialog: boolean }>((res) => {
      let covered = 0; const t0 = performance.now();
      const f = () => {
        const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg && top && top.closest('main[data-tab="my-store"]') === null && !top.closest('header,nav,footer')) covered++;
        if (dlg || performance.now() - t0 > 3000) res({ covered, dialog: !!dlg }); else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }));
    await press(page, btn);
    const r = await rec;
    expect(r.dialog, '딜러 로테이션 모달이 안 열렸다').toBe(true);
    expect(r.covered, '열기 전 프레임에 다른 판이 화면 가운데를 덮었다(폴백 번쩍임)').toBe(0);
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
