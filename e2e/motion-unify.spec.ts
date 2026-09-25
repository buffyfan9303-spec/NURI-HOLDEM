// MOTION-UNIFY (오너 2026-09-24) — "PC 던 모바일이던 하나를 부드럽게 바꾸면 나머지 모든 페이지에서도 동일하게.
//   모바일 메인 메뉴 이동 정도의 부드러움을 모든 PC·모바일 페이지에."
//
// 🔴 5차(2026-09-26 PILL-FLASH) — 4차까지 이 스펙은 '새 판 첫 프레임에 덮개 ≥ 0.9' 를 요구했다. 그 덮개(판 위 지면색 한 장)가
//   오너가 말한 "검정색이 됐다가 다시 콘텐츠가 나와 깜빡인다" 그 자체였다(재방문에도 ~100ms 지면색 판 — root-cause-debugger 실측).
//   덮개를 없앴고, 이 스펙은 **같은 이동들이 빈 판 없이 한 프레임에 바뀐다**를 잠근다. 픽셀 휘도 판정은 e2e/pill-flash.spec.ts.
//
// 무엇을 잠그나 — 모든 화면 이동이 **가리지 않고** 바뀐다:
//   MU1 하위 탭(goSubTab 25곳) — 390 · CPU 4배 · 실제 손가락(CDP 터치 홀드)
//        덮개 0 프레임 · 판이 그대로인데 scrollY 만 움직이는 프레임 0(판 교체와 같은 프레임의 스크롤은 교체다) ·
//        재방문 스켈레톤 0 · 레이아웃 이동 < 0.02 · View Transition 0.
//   MU2 PC 메인 탭 — 1440 · CPU 4배 · 마우스. 같은 계약(재방문).
//   MU3 오버레이 닫기 — 매장 페이지(버튼·뒤로)·장터 행 상세·게시글 상세: 한 프레임에 사라지지 않고 페이드로 닫힌다(5차와 무관, 그대로).
//   MU4 첫 방문 라이브(GET +400ms) — 덮개 0 · 스켈레톤(모양 예약)이 실제 내용으로 바뀌며 무너지지 않는다(CLS < 0.02).
//
// 음성 대조(2026-09-26 실행): 옛 tabCover.ts 빌드(덮개 있음)에 돌리면 MU1·MU2·MU4 의 '덮개 0' 이 빨개진다.
// (4차 음성 대조 기록 — 덮개 한 줄·isSettled ③ 제거 — 은 덮개와 함께 사라졌다.)
// ⚠ 운영 데이터를 읽는다(매장 카드·게시글·장터 행). 코드를 안 바꿨는데 빨개지면 운영 데이터부터 의심하라(CLAUDE.md).
// ⚠ 하네스 Chromium 만 본다. 삼성 인터넷 GPU·주소창 접힘은 재현하지 못한다(재현 못 함 ≠ 없음).
// 실행: E2E_BASE_URL=http://localhost:43xx npx playwright test e2e/motion-unify.spec.ts
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';
import { mockSchedules } from './_schedules';

type F = { t: number; cov: number; ca: number; sy: number; ph: number; sig: string; sk: number; skr: number; vt: number; op: number | null; shown: boolean };
type Rec = { F: F[]; LS: [number, number][] };

/** 표본은 **페인트 뒤**(rAF 안에서 보낸 메시지 = 다음 태스크)에 뜬다 — 같은 프레임의 덮개 자리 잡기 rAF 가 끝난, 화면에 그려진 상태를 본다. */
const RECORDER = () => {
  const w = window as unknown as { __mu: { F: F[]; LS: [number, number][]; rec: boolean; root: string; ov: string; t0: number }; __vtOn: number };
  const st = { F: [] as F[], LS: [] as [number, number][], rec: false, root: '', ov: '', t0: 0 };
  w.__mu = st; w.__vtOn = 0;
  const d = document as Document & { startViewTransition?: (cb: () => void) => { finished?: Promise<void> } };
  const svt = d.startViewTransition?.bind(document);
  if (svt) d.startViewTransition = (cb) => { const t = svt(cb); w.__vtOn++; const done = () => { w.__vtOn = Math.max(0, w.__vtOn - 1); }; (t?.finished ?? Promise.resolve()).then(done, done); return t; };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (st.rec && !e.hadRecentInput) st.LS.push([e.startTime - st.t0, e.value]); }).observe({ type: 'layout-shift', buffered: false }); } catch { /* 미지원 */ }
  const inView = (el: Element) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility === 'visible'; };
  const ch = new MessageChannel();
  let tRaf = 0;
  ch.port1.onmessage = () => {
    if (!st.rec) return;
    let cov = 0; let ca = 0;
    for (const c of document.querySelectorAll('[data-tab-cover],[data-sub-cover]')) {
      const cs = getComputedStyle(c); if (cs.display !== 'none') cov = Math.max(cov, Number(cs.opacity));
      for (const a of c.getAnimations()) if (a.playState === 'running') ca = Math.max(ca, Number(a.effect?.getTiming().duration ?? 0));
    }
    const root = st.root ? [...document.querySelectorAll<HTMLElement>(st.root)].find((e) => e.getClientRects().length > 0) : null;
    const ov = st.ov ? [...document.querySelectorAll<HTMLElement>(st.ov)].filter((e) => e.getClientRects().length > 0).pop() : null;
    st.F.push({
      t: tRaf, cov: Math.round(cov * 100) / 100, ca, sy: Math.round(scrollY),
      ph: root ? root.offsetHeight : -1,
      // 판이 바뀌었는가 — 글자 전체(길이+앞뒤)를 본다. 앞 60자만 보면 같은 머리말을 가진 목록끼리 구별을 못 한다.
      sig: root ? (() => { const tx = (root.textContent ?? '').replace(/\s+/g, ''); return `${root.querySelectorAll('*').length}:${tx.length}:${tx.slice(0, 40)}:${tx.slice(-40)}`; })() : '',
      sk: [...document.querySelectorAll('.skeleton')].filter(inView).length,
      skr: root ? [...root.querySelectorAll('.skeleton, [aria-busy="true"]')].filter(inView).length : 0,
      vt: document.getAnimations().filter((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition')).length + w.__vtOn,
      op: ov ? Math.round(Number(getComputedStyle(ov).opacity) * 100) / 100 : null,
      shown: !!root,
    });
  };
  const loop = () => { if (st.rec) { tRaf = performance.now() - st.t0; ch.port2.postMessage(0); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
};

async function startRec(page: Page, root: string, ov = '') {
  await page.evaluate(([r, o]) => { const s = (window as unknown as { __mu: Rec & { rec: boolean; root: string; ov: string; t0: number } }).__mu; s.F.length = 0; s.LS.length = 0; s.root = r; s.ov = o; s.t0 = performance.now(); s.rec = true; }, [root, ov]);
}
async function stopRec(page: Page, ms = 1300): Promise<Rec> {
  await page.waitForTimeout(ms);
  return page.evaluate(() => { const s = (window as unknown as { __mu: Rec & { rec: boolean } }).__mu; s.rec = false; return { F: s.F.slice(), LS: s.LS.slice() }; });
}

/** 실제 입력 — 모바일은 CDP 터치 홀드(누름 110ms, click() 은 누름 0ms), PC 는 마우스 down/up. */
async function press(page: Page, sel: string, opts: { text?: string; idx?: number; mobile: boolean }) {
  const p = await page.evaluate(([s, tx, i]) => {
    let els = [...document.querySelectorAll(s as string)].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
    if (tx) els = els.filter((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().startsWith(tx as string));
    const el = els[i as number];
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20) };
  }, [sel, opts.text ?? '', opts.idx ?? 0]);
  expect(p, `누를 대상을 못 찾았다: ${sel} ${opts.text ?? ''}#${opts.idx ?? 0} — 운영 데이터가 바뀌었는지 먼저 본다`).not.toBeNull();
  if (opts.mobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p!.x, y: p!.y }] });
    await page.waitForTimeout(110);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(p!.x, p!.y); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up();
  }
}

/** 판 전환 계약(5차) — 한 이동의 프레임으로 판정한다. 실패는 soft 로 모아 **어느 화면들이** 깨졌는지 한 번에 보인다. */
function expectCleanSwap(r: Rec, label: string) {
  const F = r.F;
  expect.soft(F.length, `${label}: 프레임을 못 모았다 — 공허한 통과`).toBeGreaterThan(10);
  const i = F.findIndex((f, k) => k > 0 && (f.sig !== F[0].sig || f.ph !== F[0].ph || f.sy !== F[0].sy || f.shown !== F[0].shown));
  expect.soft(i, `${label}: 판이 바뀌는 프레임을 못 봤다(전환이 안 일어났다) — 아래 단언이 공허해진다`).toBeGreaterThan(0);
  expect.soft(F.filter((f) => f.cov > 0.05).map((f) => `${Math.round(f.t)}ms cov=${f.cov}`),
    `${label}: 덮개(지면색 판)가 그려졌다 — 이미 그려진 판을 가렸다 드러내는 '검정 → 콘텐츠' 깜빡임`).toEqual([]);
  // 보이는 스크롤 튐 = 판(글자 서명·높이)은 그대로인데 scrollY 만 40px 넘게 움직인 프레임. 판이 바뀐 프레임의 스크롤은 교체의 일부다.
  //   (keep-alive 판은 숨은 섹션 글자까지 textContent 에 들어가 서명만으로는 교체를 못 볼 수 있다 — 높이를 같이 본다.)
  const bareJumps = F.flatMap((f, k) => (k > 0 && Math.abs(f.sy - F[k - 1].sy) > 40 && f.sig === F[k - 1].sig && f.ph === F[k - 1].ph ? [`${Math.round(f.t)}ms ${F[k - 1].sy}→${f.sy}`] : []));
  expect.soft(bareJumps, `${label}: 같은 판에서 scrollY 순간이동(보이는 튐)`).toEqual([]);
  expect.soft(F.filter((f) => f.sk > 0).length, `${label}: 재방문인데 스켈레톤이 드러났다(콘텐츠 → 스켈레톤 → 콘텐츠)`).toBe(0);
  expect.soft(r.LS.reduce((a, [, v]) => a + v, 0), `${label}: 레이아웃 이동(흔들림)`).toBeLessThan(0.02);
  expect.soft(F.filter((f) => f.vt > 0).length, `${label}: View Transition 이 돌았다`).toBe(0);
}

async function boot(page: Page, width: number, height: number) {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width, height });
  await mockSchedules(page);
  await page.addInitScript(RECORDER);
  await page.goto('/');
  await dismissOverlays(page);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
  // 프리마운트가 끝나 재방문 경로가 된 뒤에 잰다(첫 방문은 MU4 가 따로 본다)
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('.tab-pane').length), { timeout: 20_000 }).toBeGreaterThanOrEqual(4);
}
const cpu4 = async (page: Page) => (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 });
const scrollTo = (page: Page, y: number) => page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
const TAB = (mobile: boolean) => (mobile ? 'nav[aria-label="하단 내비게이션"] button[data-main-tab]' : '[data-stack-tabbar] button[role=tab]');
const SEC = '[data-community-secbar] button';

test('🔴 MU1 — 하위 탭(390 · CPU 4배 · 터치 홀드): 커뮤니티 섹션·순위 보드·장터 분류·GTO 레인이 가리지 않고 한 프레임에 바뀐다', async ({ page }) => {
  test.setTimeout(150_000);
  await boot(page, 390, 844);
  await press(page, TAB(true), { text: '커뮤니티', mobile: true });
  await page.waitForTimeout(900);
  await press(page, SEC, { text: '게시판', mobile: true });
  await page.waitForTimeout(900);
  await cpu4(page);
  const P = '[data-community-secpanel]';
  const steps: [string, () => Promise<void>, string, (() => Promise<unknown>)?][] = [
    ['커뮤니티 게시판→홀덤펍(스크롤 600)', () => press(page, SEC, { text: '홀덤펍', mobile: true }), P, () => scrollTo(page, 600)],
    ['커뮤니티 홀덤펍→순위', () => press(page, SEC, { text: '순위', mobile: true }), P],
    ['순위 보드 → 두 번째', () => press(page, '[data-rank-tabbar] button', { idx: 1, mobile: true }), '[data-rank-panel]'],
    ['커뮤니티 순위→장터', () => press(page, SEC, { text: '장터', mobile: true }), P, () => scrollTo(page, 0)],
    // ⚠ 세 번째 분류(아이템)를 누른다 — 2026-09-24 운영 데이터에서 '전체'·'용품'은 같은 1건이라 판이 안 바뀐다(공허).
    ['장터 분류 → 세 번째', () => press(page, '[data-market-catbar] button', { idx: 2, mobile: true }), '[data-market-panel]'],
  ];
  for (const [label, act, root, pre] of steps) {
    if (pre) { await pre(); await page.waitForTimeout(500); }
    await startRec(page, root);
    await act();
    expectCleanSwap(await stopRec(page), label);
  }
  // GTO 레인
  await press(page, TAB(true), { text: 'GTO', mobile: true });
  await page.waitForTimeout(1200);
  await startRec(page, '[data-tools-lanepanel]');
  await press(page, '[data-tools-lanebar] button', { idx: 1, mobile: true });
  expectCleanSwap(await stopRec(page), 'GTO 레인 → 두 번째');
  expect(steps.length + 1, '잰 하위 탭 이동 수(커뮤니티 섹션 3 · 순위 보드 · 장터 분류 · GTO 레인)').toBe(6);
});

test('🔴 MU2 — PC 메인 탭(1440 · CPU 4배 · 마우스): 재방문도 View Transition·덮개 없이 한 프레임에 바뀐다', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page, 1440, 900);
  await cpu4(page);
  const tabs = [['커뮤니티', 'community'], ['홈', 'home'], ['라이브', 'live'], ['GTO', 'tools']] as const;
  // 한 바퀴 먼저 돈다 — 프리마운트돼 있어도 라이브는 **첫 활성화**에 데이터를 불러 스켈레톤이 선다(1440 CPU 4배 ~40ms,
  //   덮개가 있던 빌드에서도 같은 프레임 — 그땐 지면색 판에 가려졌을 뿐). 이 테스트는 재방문 계약만 본다.
  for (const [label] of tabs) { await press(page, TAB(false), { text: label, mobile: false }); await page.waitForTimeout(1200); }
  for (const [label, tab] of tabs) {
    await startRec(page, `.tab-pane[data-tab="${tab}"]`);
    await press(page, TAB(false), { text: label, mobile: false });
    expectCleanSwap(await stopRec(page), `PC ${label}`);
  }
  expect(tabs.length, '잰 PC 메인 탭 이동 수').toBe(4);
});

/** 오버레이가 한 프레임에 사라지지 않았다 — 닫기 입력 뒤 중간 투명도 프레임이 있고, 끝에는 없다. */
function expectFaded(r: Rec, label: string) {
  const ops = r.F.map((f) => f.op);
  expect.soft(ops[0], `${label}: 닫기 전 오버레이를 못 봤다 — 공허한 통과`).not.toBeNull();
  expect.soft(ops.some((o) => o !== null && o > 0.05 && o < 0.95), `${label}: 닫힘이 한 프레임 컷이다(페이드 없음)`).toBe(true);
  expect.soft(ops.at(-1), `${label}: 정착 후에도 오버레이가 남아 있다`).toBeNull();
}

test('🔴 MU3 — 오버레이 닫기(390 · CPU 4배): 매장 페이지(버튼·뒤로)·장터 행 상세·게시글 상세가 페이드로 닫힌다', async ({ page }) => {
  test.setTimeout(150_000);
  await boot(page, 390, 844);
  await press(page, TAB(true), { text: '커뮤니티', mobile: true });
  await page.waitForTimeout(900);
  await cpu4(page);
  const venueDlg = '[role=dialog][aria-label$="매장 페이지"], [role=dialog][aria-label$="그룹 페이지"]';
  const closeBtn = async (ov: string) => page.evaluate((s) => {
    const d = [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).pop();
    const b = d && [...d.querySelectorAll('button')].find((x) => /닫기|뒤로/.test(x.getAttribute('aria-label') || x.textContent || ''));
    const r = b?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, ov);
  const tapAt = async (p: { x: number; y: number } | null, label: string) => {
    expect(p, `${label}: 닫기 버튼을 못 찾았다`).not.toBeNull();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p!.x, y: p!.y }] });
    await page.waitForTimeout(110);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
  // 매장 페이지 — 버튼
  await press(page, SEC, { text: '홀덤펍', mobile: true });
  await page.waitForTimeout(900);
  await press(page, '[data-testid="venue-card"]', { mobile: true });
  await expect(page.locator(venueDlg).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await startRec(page, '', venueDlg);
  await tapAt(await closeBtn(venueDlg), '매장');
  expectFaded(await stopRec(page, 900), '매장 페이지 닫기(버튼)');
  // 매장 페이지 — 뒤로가기
  await press(page, '[data-testid="venue-card"]', { mobile: true });
  await expect(page.locator(venueDlg).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await startRec(page, '', venueDlg);
  await page.evaluate(() => history.back());
  expectFaded(await stopRec(page, 900), '매장 페이지 닫기(뒤로)');
  // 장터 첫 행 상세(공지 또는 매물 — 같은 수명 경로)
  await press(page, SEC, { text: '장터', mobile: true });
  await page.waitForTimeout(900);
  await scrollTo(page, 0);
  await press(page, '[data-sec="market"] ul li[role=button], [data-sec="market"] ul li button', { mobile: true });
  const sheet = '.fixed.inset-0.z-\\[60\\] [role=dialog]';
  await expect(page.locator(sheet).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await startRec(page, '', sheet);
  await tapAt(await closeBtn(sheet), '장터 상세');
  expectFaded(await stopRec(page, 900), '장터 행 상세 닫기');
  // 게시글 상세(전면 page)
  await press(page, SEC, { text: '게시판', mobile: true });
  await page.waitForTimeout(900);
  await scrollTo(page, 0);
  await press(page, '[data-sec="board"] li[role=button]', { mobile: true });
  const post = '.fixed.inset-0.z-\\[55\\][role=dialog]';
  await expect(page.locator(post).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await startRec(page, '', post);
  await tapAt(await closeBtn(post), '게시글');
  expectFaded(await stopRec(page, 900), '게시글 상세 닫기');
});

/** App 의 프리마운트·청크 데우기 idle(timeout 10000)을 붙잡아 라이브를 **진짜 첫 방문**으로 만든다(tab-cover.spec 과 같은 방법). */
const HOLD_PREMOUNT_IDLE = () => {
  const w = window as unknown as { requestIdleCallback?: (cb: IdleRequestCallback, o?: IdleRequestOptions) => number };
  const native = w.requestIdleCallback?.bind(window);
  w.requestIdleCallback = (cb, o) => {
    if (o?.timeout === 10000) return 0;
    return native ? native(cb, o) : window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 1);
  };
};

/** 첫 방문 라이브(GET +400ms · CPU 4배 · 390) 한 번을 잰다. */
async function firstVisitLive(page: Page): Promise<{ r: Rec; delayed: number }> {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSchedules(page);
  await page.addInitScript(RECORDER);
  await page.addInitScript(HOLD_PREMOUNT_IDLE);
  await page.goto('/');
  await dismissOverlays(page);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
  expect(await page.locator('.tab-pane[data-tab="live"]').count(), '라이브가 이미 마운트됐다 — 첫 방문 조건이 없다').toBe(0);
  let delayed = 0;
  await page.route(/supabase\.co\/rest\/v1\/(?!rpc\/)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    delayed++;
    await new Promise((z) => setTimeout(z, 400));
    await route.fallback();
  });
  await cpu4(page);
  await startRec(page, '.tab-pane[data-tab="live"]');
  await press(page, TAB(true), { text: '라이브', mobile: true });
  return { r: await stopRec(page, 2200), delayed };
}

test.describe('MU4 — 서비스 워커 없음(요청 지연을 page.route 로 건다)', () => {
  test.use({ serviceWorkers: 'block' });
  test('🔴 MU4 — 첫 방문 라이브(GET +400ms · CPU 4배): 덮개 없이 스켈레톤(모양 예약)이 보인다 — 빈 지면 판 0', async ({ page }) => {
    test.setTimeout(90_000);
    const { r, delayed } = await firstVisitLive(page);
    expect(delayed, 'GET 지연이 걸리지 않았다(전제 없음)').toBeGreaterThan(0);
    const F = r.F;
    const first = F.findIndex((f) => f.shown);
    expect(first, '라이브 판이 한 번도 보이지 않았다').toBeGreaterThanOrEqual(0);
    expect(F.filter((f) => f.cov > 0.05).map((f) => `${Math.round(f.t)}ms cov=${f.cov}`), '덮개(지면색 판)가 그려졌다').toEqual([]);
    expect(F.slice(first).some((f) => f.skr > 0), '라이브 판 안 스켈레톤을 한 번도 못 봤다 — 첫 방문 조건이 없다(공허)').toBe(true);
  });
  // LIVE-SKELETON-COLLAPSE(2026-09-26 PILL-FLASH 에서 드러남 → 같은 날 home-team 수정 · LiveGamesTab):
  //   첫 방문 라이브 스켈레톤(판 989px)이 내용(796px)으로 바뀌며 무너졌다 — LS 0.1022(`DIV.reveal space-y-1.5` 553→392).
  //   고친 방법: 목록이 오기 전엔 목록 결과에 딸린 아래 내용('오늘 곧 시작'·안내 줄)을 그리지 않고, 판 최소 높이를 화면−헤더로
  //   예약해 사업자 푸터가 로딩 전후 모두 화면 밖에 있게 했다(0·1·다수 어느 경우도 보이는 요소가 움직이지 않는다).
  //   음성 대조(2026-09-26): 수정 전 빌드에서 이 테스트는 LS 0.102 로 빨갛다.
  test('🔴 MU4b — 첫 방문 라이브: 스켈레톤 → 내용에서 판이 무너지지 않는다(CLS < 0.02)', async ({ page }) => {
    test.setTimeout(90_000);
    const { r } = await firstVisitLive(page);
    expect(r.LS.reduce((a, [, v]) => a + v, 0), '스켈레톤 → 내용에서 판이 무너졌다(모양 예약 불일치)').toBeLessThan(0.02);
  });
});
