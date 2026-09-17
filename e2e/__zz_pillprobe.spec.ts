// 임시 계측 — 알약(SlidingPill) 12곳의 전환 중 프레임 간격·long task·본문 좌표·알약 궤적. 끝나면 지운다.
import { test, isAllowedRequest } from './_fixtures';
import type { Page } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { stabilizeBackstack, dismissOverlays, stubLogin, ANON_KEY } from './_session';
import { bootOwner, openMyStore } from './_mockOwner';

const OUT = 'C:/Users/buffy/AppData/Local/Temp/claude/C--Users-buffy-OneDrive-----------/65749b7e-e04e-4522-be5d-3e6e64266487/scratchpad/pill';
mkdirSync(`${OUT}/shots`, { recursive: true });
const rec = (o: unknown) => appendFileSync(`${OUT}/rec.jsonl`, JSON.stringify(o) + '\n');

declare global { interface Window { __S?: unknown; __vtSkip?: () => void; __vtSlow?: boolean } }

/** startViewTransition 을 감싸 저속 모드에서 skipTransition 을 무력화(앱 500ms 상한·endActive 회피). */
async function installVtWrap(page: Page) {
  await page.addInitScript(() => {
    const orig = Document.prototype.startViewTransition;
    if (!orig) return;
    Document.prototype.startViewTransition = function (this: Document, cb: () => void) {
      const t = orig.call(this, cb);
      if (window.__vtSlow && t) {
        const skip = t.skipTransition.bind(t);
        window.__vtSkip = skip;
        t.skipTransition = () => {};
      }
      return t;
    } as typeof orig;
  });
}

interface Site {
  id: string;
  vt: boolean;                 // View Transition 스코프를 타는가(아니면 CSS FLIP)
  panel?: string;              // ::view-transition 이름(패널)
  pill?: string;               // ::view-transition 이름(알약)
  panelSel?: string;           // 살아 있는 패널 DOM
  barSel: string;              // 알약 컨테이너 DOM
  /** 눌러서 전환을 일으킬 대상들(순서대로 — 왕복) */
  clicks: string[];
}

/** 실시간 계측: 클릭 직후 900ms 동안 프레임마다 샘플. */
async function realtime(page: Page, s: Site, clickSel: string, cpu: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.evaluate(({ s }) => {
    const S = { ts: [] as number[], lt: [] as number[], anim: [] as string[], live: [] as [number, number, number, number][], grp: [] as [number, string, string][], pill: [] as [number, string][] };
    window.__S = S;
    try {
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) S.lt.push(Math.round(e.duration)); });
      po.observe({ type: 'longtask', buffered: false });
    } catch { /* 미지원 */ }
    const html = document.documentElement;
    const cs = (pe: string) => getComputedStyle(html, pe);
    const panelEl = s.panelSel ? document.querySelector(s.panelSel) : null;
    const footer = document.querySelector('footer');
    const bar = document.querySelector(s.barSel);
    const livePill = bar?.querySelector('[data-sliding-pill]') as HTMLElement | null;
    const t0 = performance.now();
    let took = false;
    const tick = () => {
      const t = performance.now() - t0;
      S.ts.push(+t.toFixed(1));
      const pr = panelEl?.getBoundingClientRect(); const fr = footer?.getBoundingClientRect();
      S.live.push([+t.toFixed(0), pr ? +pr.top.toFixed(1) : -1, pr ? +pr.bottom.toFixed(1) : -1, fr ? +fr.top.toFixed(1) : -1]);
      if (s.vt && s.panel) { const g = cs(`::view-transition-group(${s.panel})`); if (g.width !== 'auto') S.grp.push([+t.toFixed(0), g.height, g.transform]); }
      if (s.vt && s.pill) { const g = cs(`::view-transition-group(${s.pill})`); if (g.width !== 'auto') S.pill.push([+t.toFixed(0), g.transform]); }
      else if (livePill) S.pill.push([+t.toFixed(0), getComputedStyle(livePill).transform]);
      if (!took && t > 80) { took = true; for (const a of document.getAnimations()) { const eff = a.effect as KeyframeEffect | null; const pe = eff?.pseudoElement ?? ''; if (pe.startsWith('::view-transition') || (eff?.target as HTMLElement | null)?.hasAttribute?.('data-sliding-pill')) S.anim.push(`${pe || 'pill'} :: ${(a as unknown as { animationName?: string; transitionProperty?: string }).animationName ?? (a as unknown as { transitionProperty?: string }).transitionProperty ?? ''}`); } }
      if (t < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { s });
  await page.evaluate((sel) => { (document.querySelector(sel) as HTMLElement).click(); }, clickSel);
  await page.waitForTimeout(1000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const S = await page.evaluate(() => window.__S) as { ts: number[]; lt: number[]; anim: string[]; live: [number, number, number, number][]; grp: [number, string, string][]; pill: [number, string][] };
  const gaps = S.ts.slice(1).map((t, i) => +(t - S.ts[i]).toFixed(1));
  const maxGap = Math.max(...gaps);
  const dropped = gaps.filter((g) => g > 34).length;
  // 본문 상단·푸터 상단이 전환 중(t>30ms)에 움직였는가 — 움직였다면 레이아웃/스크롤 원인.
  const after = S.live.filter((r) => r[0] > 30);
  const uniq = (i: number) => [...new Set(after.map((r) => r[i]))];
  return { cpu, frames: S.ts.length, maxGap, dropped, gaps: gaps.slice(0, 40), longtasks: S.lt, anim: [...new Set(S.anim)].sort(), livePanelTop: uniq(1), livePanelBottom: uniq(2), footerTop: uniq(3), grp: S.grp.filter((_, i) => i % 4 === 0), pill: S.pill.filter((_, i) => i % 4 === 0) };
}

/** 저속(3s) 계측: 중간 프레임 스크린샷 + 의사요소 기하 + 살아 있는 DOM 대조. */
async function slow(page: Page, s: Site, clickSel: string, tag: string) {
  await page.evaluate(() => { window.__vtSlow = true; });
  const st = await page.addStyleTag({ content: `::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation-duration: 3s !important; } [data-sliding-pill] { transition-duration: 3s !important; }` });
  await page.evaluate((sel) => { (document.querySelector(sel) as HTMLElement).click(); }, clickSel);
  const frames: unknown[] = [];
  for (const at of [250, 1000, 2000]) {
    await page.waitForTimeout(at === 250 ? 250 : at === 1000 ? 750 : 1000);
    const g = await page.evaluate(({ s }) => {
      const html = document.documentElement; const cs = (pe: string) => getComputedStyle(html, pe);
      const box = (pe: string) => { const c = cs(pe); return c.width === 'auto' ? null : { w: c.width, h: c.height, tf: c.transform, op: c.opacity, anim: c.animationName }; };
      const panelEl = s.panelSel ? document.querySelector(s.panelSel) : null; const footer = document.querySelector('footer');
      const bar = document.querySelector(s.barSel); const livePill = bar?.querySelector('[data-sliding-pill]') as HTMLElement | null; const act = bar?.querySelector('[data-pill-active]') as HTMLElement | null;
      const r = (el: Element | null | undefined) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), l: +b.left.toFixed(1), w: +b.width.toFixed(1) }; };
      return {
        grpPanel: s.panel ? box(`::view-transition-group(${s.panel})`) : null,
        oldPanel: s.panel ? box(`::view-transition-old(${s.panel})`) : null,
        newPanel: s.panel ? box(`::view-transition-new(${s.panel})`) : null,
        grpPill: s.pill ? box(`::view-transition-group(${s.pill})`) : null,
        grpRoot: box('::view-transition-group(root)'),
        livePanel: r(panelEl), footer: r(footer), livePill: r(livePill), active: r(act), scrollY: window.scrollY, docH: document.documentElement.scrollHeight,
      };
    }, { s });
    await page.screenshot({ path: `${OUT}/shots/${tag}-${at}.png` });
    frames.push({ at, ...g });
  }
  await page.evaluate(() => { window.__vtSkip?.(); window.__vtSlow = false; });
  await st.evaluate((el) => el.remove());
  await page.waitForTimeout(400);
  return frames;
}

async function runSite(page: Page, s: Site, cpu = 4) {
  const out: Record<string, unknown> = { id: s.id, vt: s.vt };
  try {
    const rt: unknown[] = [];
    for (const c of s.clicks) { rt.push({ click: c, ...(await realtime(page, s, c, cpu)) }); await page.waitForTimeout(500); }
    out.realtime = rt;
    const sl: unknown[] = [];
    for (let i = 0; i < s.clicks.length; i++) { sl.push({ click: s.clicks[i], frames: await slow(page, s, s.clicks[i], `${s.id}-${i}`) }); }
    out.slow = sl;
  } catch (e) { out.error = String(e).slice(0, 300); }
  rec(out);
}

async function anonRoutes(page: Page) {
  // 목킹 로그인 뒤 서버는 anon 으로 — 가짜 JWT 401 회피(읽기 전용).
  // page.route 는 컨텍스트 가드(_fixtures)보다 먼저 잡고 continue 는 실네트워크로 나간다 — 쓰기 가드를 여기서 되풀이한다.
  await page.route(/supabase\.co\/(rest|auth)\/v1\//, (r) => {
    if (!isAllowedRequest(r.request().method(), r.request().url())) return r.abort('blockedbyclient');
    return r.continue({ headers: { ...r.request().headers(), authorization: `Bearer ${ANON_KEY}` } });
  });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test('anon: community-sec · rank-tab', async ({ page }) => {
  await installVtWrap(page);
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await page.waitForSelector('[data-community-secbar]', { timeout: 20_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(2500);
  await runSite(page, { id: 'community-sec', vt: true, panel: 'community-secpanel', pill: 'community-pill', panelSel: '[data-community-secpanel]', barSel: '[data-community-secbar]',
    clicks: ['[data-testid="sec-tab-board"]', '[data-testid="sec-tab-live"]'] });
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-rank"]') as HTMLElement).click());
  await page.waitForSelector('[data-rank-tabbar]', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await runSite(page, { id: 'rank-tab', vt: true, panel: 'rank-panel', pill: 'rank-pill', panelSel: '[data-rank-panel]', barSel: '[data-rank-tabbar]',
    clicks: ['[data-rank-tabbar] button:nth-of-type(3)', '[data-rank-tabbar] button:nth-of-type(1)'] });
});

test('anon: sched-tab · legal-tab · viewmode(FLIP) · venue-tab', async ({ page }) => {
  await installVtWrap(page);
  await stabilizeBackstack(page);
  // 대회 상세 딥링크용 id — 읽기 GET 한 번(anon).
  const res = await fetch('https://idsxiqspecrucvfvtgbw.supabase.co/rest/v1/schedules?select=id,venue_id&order=date.desc&limit=1', { headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } });
  const rows = await res.json() as { id: string; venue_id: string }[];
  rec({ id: '_fixture', sched: rows[0] });
  await page.goto(`/?s=${rows[0].id}`);
  await page.waitForSelector('[data-sched-tabbar]', { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__vtSkip?.());
  await runSite(page, { id: 'sched-tab', vt: true, panel: 'sched-panel', pill: 'sched-pill', panelSel: '[data-sched-panel]', barSel: '[data-sched-tabbar]',
    clicks: ['[data-sched-tabbar] [role="tab"]:nth-of-type(2)', '[data-sched-tabbar] [role="tab"]:nth-of-type(1)'] });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  await page.goto('/');
  await page.waitForSelector('footer', { timeout: 20_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(1500);
  const toggle = await page.locator('[aria-label="보기 방식 선택"]').count();
  if (toggle) {
    await runSite(page, { id: 'viewmode-flip', vt: false, barSel: '[aria-label="보기 방식 선택"]', panelSel: '[aria-label="보기 방식 선택"] ~ *',
      clicks: ['[aria-label="보기 방식 선택"] button[aria-label="카드 보기"]', '[aria-label="보기 방식 선택"] button[aria-label="목록 보기"]'] });
  } else rec({ id: 'viewmode-flip', error: 'toggle not found on /' });

  await page.evaluate(() => { const b = [...document.querySelectorAll('footer button')].find((x) => x.textContent?.includes('이용약관')) as HTMLElement; b.click(); });
  await page.waitForSelector('[data-legal-tabbar]', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__vtSkip?.());
  await runSite(page, { id: 'legal-tab', vt: true, panel: 'legal-panel', pill: 'legal-pill', panelSel: '[data-legal-panel]', barSel: '[data-legal-tabbar]',
    clicks: ['[data-legal-tabbar] [role="tab"]:nth-of-type(2)', '[data-legal-tabbar] [role="tab"]:nth-of-type(1)'] });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  await page.goto(`/?venue=${rows[0].venue_id}`);
  await page.waitForSelector('[data-venue-tabbar]', { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__vtSkip?.());
  await runSite(page, { id: 'venue-tab', vt: true, panel: 'venue-tabpanel', pill: 'venue-pill', panelSel: '[data-venue-tabpanel]', barSel: '[data-venue-tabbar]',
    clicks: ['[data-venue-tabbar] button:nth-of-type(2)', '[data-venue-tabbar] button:nth-of-type(1)'] });
});

test('login(stub): notif-tab · notif-filter · profile-tab', async ({ page }) => {
  await installVtWrap(page);
  await stabilizeBackstack(page);
  await anonRoutes(page);
  await stubLogin(page);
  await page.goto('/');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => (document.querySelector('button[aria-label^="알림"]') as HTMLElement).click());
  await page.waitForSelector('[data-notif-tabbar]', { timeout: 20_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__vtSkip?.());
  await runSite(page, { id: 'notif-tab', vt: true, panel: 'notif-panel', pill: 'notif-pill', panelSel: '[data-notif-panel]', barSel: '[data-notif-tabbar]',
    clicks: ['[data-notif-tabbar] [role="tab"]:nth-of-type(2)', '[data-notif-tabbar] [role="tab"]:nth-of-type(1)'] });
  const hasFilter = await page.locator('[data-notif-actions] [role="tab"]').count();
  if (hasFilter) {
    await runSite(page, { id: 'notif-filter', vt: true, pill: 'notiffilter-pill', panelSel: '[data-notif-panel]', barSel: '[data-notif-actions]',
      clicks: ['[data-notif-actions] [role="tab"]:nth-of-type(2)', '[data-notif-actions] [role="tab"]:nth-of-type(1)'] });
  } else rec({ id: 'notif-filter', error: 'filter tabs not visible (mode?)' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  await page.evaluate(() => (document.querySelector('button[aria-label$="메뉴"]') as HTMLElement).click());
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('내 정보 열기') || x.getAttribute('aria-label') === '내 정보 열기') as HTMLElement; b.click(); });
  await page.waitForSelector('[data-profile-tabbar]', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__vtSkip?.());
  await runSite(page, { id: 'profile-tab', vt: true, panel: 'profile-panel', pill: 'profile-pill', panelSel: '[data-profile-panel]', barSel: '[data-profile-tabbar]',
    clicks: ['[data-profile-tabbar] [role="tab"]:nth-of-type(2)', '[data-profile-tabbar] [role="tab"]:nth-of-type(1)'] });
});

test('owner(mock): mystore rail · ledger stats · crm-range (PC 1440)', async ({ page }) => {
  await installVtWrap(page);
  await stabilizeBackstack(page);
  await bootOwner(page, { viewport: { width: 1440, height: 900 } });
  await dismissOverlays(page);
  await openMyStore(page);
  await page.waitForSelector('[data-mystore-rail]', { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__vtSkip?.());
  await runSite(page, { id: 'mystore-rail', vt: true, panel: 'mystore-secpanel', pill: 'mystore-rail-pill', panelSel: '[data-mystore-secpanel]', barSel: '[data-mystore-rail]',
    clicks: ['[data-mystore-rail] button:nth-of-type(2)', '[data-mystore-rail] button:nth-of-type(1)'] }, 2);
  // 장부 통계 SegmentedTabs(CSS FLIP): 레일 '장부' → 통계 패널
  const ledgerBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-mystore-rail] button')].find((x) => x.textContent?.includes('장부')) as HTMLElement | undefined; if (!b) return false; b.click(); return true; });
  await page.waitForTimeout(1500);
  const seg = await page.locator('[data-mystore-secpanel] [role="tablist"]').count();
  rec({ id: '_ledger', ledgerBtn, tablists: seg });
  if (seg) {
    await runSite(page, { id: 'ledger-segmented-flip', vt: false, barSel: '[data-mystore-secpanel] [role="tablist"]', panelSel: '[data-mystore-secpanel]',
      clicks: ['[data-mystore-secpanel] [role="tablist"] [role="tab"]:nth-of-type(2)', '[data-mystore-secpanel] [role="tablist"] [role="tab"]:nth-of-type(1)'] }, 2);
  }
  // 고객 분석(crm-range)
  const crm = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /고객/.test(x.textContent ?? '') && x.closest('aside, nav, [data-mystore-secbar]')) as HTMLElement | undefined; if (!b) return false; b.click(); return true; });
  await page.waitForTimeout(1500);
  const crmBar = await page.locator('[data-crm-rangebar]').count();
  rec({ id: '_crm', crm, crmBar });
  if (crmBar) {
    await runSite(page, { id: 'crm-range', vt: true, panel: 'crm-panel', pill: 'crm-pill', panelSel: '[data-crm-panel]', barSel: '[data-crm-rangebar]',
      clicks: ['[data-crm-rangebar] button:nth-of-type(2)', '[data-crm-rangebar] button:nth-of-type(1)'] }, 2);
  }
});
