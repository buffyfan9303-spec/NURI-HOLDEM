// §6 전체 성능 **기준선 실측** — 게이트가 아니라 기록이다.
//
// 왜 따로 만들었나:
//   기존 `perf.spec.ts` 는 **회귀 게이트**(상한 3개)이고, `boot-budget.spec.ts` 는 **출발 순서**만 본다.
//   §6 이 요구하는 것은 그와 다르다 — 첫 진입/재방문/새로고침의 표시·조작 시점, 흐름별 응답,
//   전송량 구성, 반복 왕복 후 누적. 그걸 **같은 조건으로 여러 번** 재서 중앙값·분산을 남긴다.
//   기존 스위트에 이걸 섞으면 매 실행이 몇 분씩 느려지므로 `NURI_PERF=1` 로 게이트한다.
//
// 실행:
//   npm run build && npx vite preview --port 4173 --strictPort   (별도 터미널)
//   NURI_PERF=1 E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/perf-baseline.spec.ts --workers=1
//   (⚠ --workers=1 필수. 워커가 CPU 를 다투면 재는 대상 자체가 왜곡된다 — boot-budget 이 실제로 뒤집혔다.)
//
// 이 파일이 지키는 측정 규율:
//   · 조건 고정: 프로덕션 빌드 · 390×844 · CPU 4× · 콜드 컨텍스트(캐시·저장소 비움) · 네트워크 스로틀 없음.
//   · **교대 측정**: 한 조건을 몰아서 재면 머신 상태 변화가 조건 차이로 둔갑한다.
//   · **service worker 를 0 으로 보고하지 않는다**: transferSize=0 인 응답은 '없는 요청'이 아니라
//     SW/캐시가 대신 준 것이다 — `swBytes`(decodedBodySize) 로 따로 센다.
//   · SW on / off 를 **둘 다** 잰다. off 는 page.route 가 필요한 A/B 의 전제지만 실사용과 다르다.
//   · 임계값으로 실패시키지 않는다. 수치만 찍는다.
import { test, isAllowedRequest } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';
import type { Browser, BrowserContext, Page } from '@playwright/test';

const VIEWPORT = { width: 390, height: 844 };
const CPU_RATE = 4;
const RUNS = Number(process.env.NURI_PERF_RUNS ?? 7); // n≥5(§6). 기본 7 — n=5 의 분산 주장이 재현되지 않은 전례가 있다.

// ── 페이지 안에서 모으는 것 ──────────────────────────────────────────────────
interface Marks {
  fcp: number; lcp: number; cls: number;
  longTasks: number; longTaskMs: number; maxLongTask: number;
  /** 마지막 long task 가 끝난 시각 — '조작 가능' 근사(TTI 자체가 아니다) */
  quietAt: number;
  /** long task 종료 시각 전부 — GA(≈4.5s 지연 주입)가 만든 꼬리를 빼고 볼 수 있게 원본을 남긴다 */
  ltEnds: number[];
  /** 하단 탭바가 DOM 에 나타난 시각 = 셸 표시 */
  shellAt: number;
  /** 스켈레톤(aria-busy)이 사라진 시각 = 콘텐츠 표시. 스켈레톤이 없었으면 shellAt */
  contentAt: number;
  dcl: number; loadEnd: number; ttfb: number;
  loafTop: { dur: number; blocking: number; t: number; script: string }[];
}

declare global {
  interface Window { __pb?: Marks }
}

/** ⚠ 관측이 대상을 바꾼다(이 저장소 전례: 프로브가 폰트 로딩을 유발했다).
 *  그래서 프로브는 PerformanceObserver + 50ms 폴링 두 개뿐이고, DOM 을 만들지 않는다. */
function probe(): void {
  const m: Marks = {
    fcp: 0, lcp: 0, cls: 0, longTasks: 0, longTaskMs: 0, maxLongTask: 0,
    quietAt: 0, ltEnds: [], shellAt: 0, contentAt: 0, dcl: 0, loadEnd: 0, ttfb: 0, loafTop: [],
  };
  window.__pb = m;
  const obs = (type: string, cb: (e: PerformanceEntry) => void) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true }); }
    catch { /* 미지원 타입은 조용히 건너뛴다 */ }
  };
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') m.fcp = Math.round(e.startTime); });
  obs('largest-contentful-paint', (e) => { m.lcp = Math.round(e.startTime); });
  obs('layout-shift', (e) => {
    const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
    if (!s.hadRecentInput) m.cls += s.value;
  });
  obs('longtask', (e) => {
    m.longTasks += 1;
    m.longTaskMs += e.duration;
    m.maxLongTask = Math.max(m.maxLongTask, Math.round(e.duration));
    m.quietAt = Math.max(m.quietAt, Math.round(e.startTime + e.duration));
    m.ltEnds.push(Math.round(e.startTime + e.duration));
  });
  obs('long-animation-frame', (e) => {
    const f = e as PerformanceEntry & { blockingDuration?: number; scripts?: { name?: string; sourceURL?: string; duration?: number }[] };
    if (e.duration < 60) return;
    const top = (f.scripts ?? []).slice().sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
    m.loafTop.push({
      dur: Math.round(e.duration), blocking: Math.round(f.blockingDuration ?? 0), t: Math.round(e.startTime),
      script: top ? `${top.name ?? ''} ${top.sourceURL ?? ''}`.trim().slice(0, 90) : '',
    });
  });
  obs('navigation', (e) => {
    const n = e as PerformanceNavigationTiming;
    m.dcl = Math.round(n.domContentLoadedEventEnd);
    m.loadEnd = Math.round(n.loadEventEnd);
    m.ttfb = Math.round(n.responseStart);
  });

  // 표시 시점 두 개 — 50ms 해상도. querySelector 두 번뿐이라 부하는 무시할 수준이다.
  let sawBusy = false;
  const t0 = performance.now();
  const id = setInterval(() => {
    const now = Math.round(performance.now());
    if (!m.shellAt && document.querySelector('nav[aria-label="하단 내비게이션"]')) m.shellAt = now;
    const busy = document.querySelector('[aria-busy="true"]');
    if (busy) sawBusy = true;
    if (!m.contentAt && m.shellAt && (sawBusy ? !busy : true)) m.contentAt = now;
    if (performance.now() - t0 > 15000 || (m.shellAt && m.contentAt)) clearInterval(id);
  }, 50);
}

/** 리소스 타임라인 요약 — SW/캐시가 준 바이트를 **0 으로 보고하지 않는다**. */
function collectResources() {
  const rs = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const kind = (r: PerformanceResourceTiming): string => {
    const u = r.name;
    if (/supabase\.co\/(rest|auth|functions|storage)\//.test(u)) return 'api';
    if (/\.woff2?(\?|$)/.test(u) || /\/fonts\//.test(u)) return 'font';
    if (/\.css(\?|$)/.test(u) || r.initiatorType === 'css') return 'css';
    if (/\.m?js(\?|$)/.test(u) || r.initiatorType === 'script') return 'js';
    if (/\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/.test(u) || r.initiatorType === 'img') return 'img';
    return 'other';
  };
  // net  = transferSize>0 (네트워크로 온 압축 바이트)
  // sw   = transferSize=0 인데 본문 크기가 보이는 것 → **SW 또는 HTTP 캐시가 준 것**. 0 으로 보고하면 거짓말이 된다.
  //        (SW 경유는 콜드에서도 transferSize 가 0 이 된다 — '캐시였다'는 뜻이 아니라 '앱이 직접 받지 않았다'는 뜻이다.)
  // opaque = 둘 다 0 → 교차 출처 + Timing-Allow-Origin 없음(Supabase API 가 여기). **모른다**를 0 으로 쓰지 않는다.
  const by: Record<string, { n: number; net: number; sw: number; opaque: number; ms: number }> = {};
  const seen: Record<string, number> = {};
  const apiSlow: { url: string; ms: number }[] = [];
  for (const r of rs) {
    const k = kind(r);
    by[k] ??= { n: 0, net: 0, sw: 0, opaque: 0, ms: 0 };
    by[k].n += 1;
    by[k].ms += r.duration;
    // 단위를 섞지 않는다 — transferSize 도 encodedBodySize 도 **압축된** 바이트다(decoded 는 쓰지 않는다).
    if (r.transferSize > 0) by[k].net += r.transferSize;
    else if (r.encodedBodySize > 0) by[k].sw += r.encodedBodySize;
    else by[k].opaque += 1;
    const key = r.name.split('#')[0];
    seen[key] = (seen[key] ?? 0) + 1;
    if (k === 'api') apiSlow.push({ url: r.name.replace(/^https:\/\/[a-z0-9]+\.supabase\.co/, '').slice(0, 110), ms: Math.round(r.duration) });
  }
  const dups = Object.entries(seen).filter(([, n]) => n > 1)
    .map(([u, n]) => `${n}× ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 110)}`);
  const initial = rs.filter((r) => /\/assets\/.*\.js$/.test(r.name) && r.startTime < 1200).length;
  return {
    by, dups, apiSlow: apiSlow.sort((a, b) => b.ms - a.ms).slice(0, 6), initialJsReqs: initial,
    swControlled: !!navigator.serviceWorker?.controller,
  };
}

// ── 하네스 ───────────────────────────────────────────────────────────────────
async function newCtx(browser: Browser, sw: 'allow' | 'block'): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: sw });
  // ⚠ browser.newContext 는 _fixtures 의 쓰기 차단을 **상속하지 않는다**. 운영 DB 에 쓰지 않도록 같은 규칙을 직접 건다.
  await ctx.route(/^https:\/\/[a-z0-9]+\.supabase\.co\/(rest|auth|storage|functions)\/v1\//, (r) =>
    isAllowedRequest(r.request().method(), r.request().url()) ? r.continue() : r.abort('blockedbyclient'));
  return ctx;
}

async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
}

async function cdpMetrics(page: Page): Promise<{ heapMB: number; nodes: number; listeners: number; docs: number }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const g = (n: string) => metrics.find((m) => m.name === n)?.value ?? 0;
  return {
    heapMB: Math.round(g('JSHeapUsedSize') / 1048576 * 10) / 10,
    nodes: g('Nodes'), listeners: g('JSEventListeners'), docs: g('Documents'),
  };
}

const med = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2 * 100) / 100;
};
const stat = (xs: number[]): string =>
  xs.length ? `중앙값 ${med(xs)} (최소 ${Math.min(...xs)} ~ 최대 ${Math.max(...xs)}, n=${xs.length})` : '표본 없음';

type Mode = 'cold' | 'warm' | 'reload';
interface BootSample extends Marks { mode: Mode; sw: string; res: ReturnType<typeof collectResources>; heapMB: number; nodes: number; listeners: number }

/** 한 번의 부팅을 잰다. cold=새 컨텍스트 첫 진입 / warm=같은 컨텍스트 2차 진입 / reload=새로고침 */
async function measureBoot(browser: Browser, mode: Mode, sw: 'allow' | 'block'): Promise<BootSample> {
  const ctx = await newCtx(browser, sw);
  const page = await ctx.newPage();
  await throttle(page);

  if (mode !== 'cold') {
    // 예열 — 스냅샷(localStorage)·SW 캐시·HTTP 캐시를 실제 재방문과 같은 상태로 만든다.
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(5000);
  }
  await page.addInitScript(probe);
  if (mode === 'reload') await page.reload({ waitUntil: 'load' });
  else if (mode === 'warm') await page.goto('/?_=w', { waitUntil: 'load' });
  else await page.goto('/', { waitUntil: 'load' });

  await page.waitForTimeout(6000); // 늦게 도착하는 배너·개인화 블록까지 CLS·요청에 담는다
  const marks = await page.evaluate(() => window.__pb!);
  const res = await page.evaluate(collectResources);
  const m = await cdpMetrics(page);
  await ctx.close();
  return { mode, sw, ...marks, cls: Math.round(marks.cls * 10000) / 10000, res, heapMB: m.heapMB, nodes: m.nodes, listeners: m.listeners };
}

// ── 1) 부팅 ──────────────────────────────────────────────────────────────────
test('PB1 부팅 기준선 — 첫 진입 · 재방문 · 새로고침 (SW on/off)', async ({ browser }) => {
  test.skip(!process.env.NURI_PERF, '측정 전용 — NURI_PERF=1 일 때만 실행');
  test.setTimeout(60 * 60_000);

  const rows: BootSample[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    // 교대 — 한 조건을 몰아 재지 않는다.
    const order: [Mode, 'allow' | 'block'][] = i % 2 === 0
      ? [['cold', 'allow'], ['warm', 'allow'], ['reload', 'allow'], ['cold', 'block']]
      : [['cold', 'block'], ['reload', 'allow'], ['warm', 'allow'], ['cold', 'allow']];
    for (const [mode, sw] of order) rows.push(await measureBoot(browser, mode, sw));
  }

  for (const sw of ['allow', 'block']) {
    for (const mode of ['cold', 'warm', 'reload'] as Mode[]) {
      const g = rows.filter((r) => r.mode === mode && r.sw === sw);
      if (!g.length) continue;
      const kb = (f: (r: BootSample) => number) => Math.round(med(g.map(f)) / 1024);
      const sum = (k: string, field: 'net' | 'sw') => kb((r) => r.res.by[k]?.[field] ?? 0);
      const opaque = (k: string) => med(g.map((r) => r.res.by[k]?.opaque ?? 0));
      console.log(
        `PB1 ${mode}/sw=${sw}\n`
        + `   TTFB ${stat(g.map((r) => r.ttfb))}ms | FCP ${stat(g.map((r) => r.fcp))}ms | LCP ${stat(g.map((r) => r.lcp))}ms\n`
        + `   셸표시 ${stat(g.map((r) => r.shellAt))}ms | 콘텐츠표시 ${stat(g.map((r) => r.contentAt))}ms\n`
        + `   조작가능 근사 — 전체 마지막 longtask ${stat(g.map((r) => r.quietAt))}ms / 서드파티(GA ≈4.5s 주입) 제외 ${stat(g.map((r) => Math.max(0, ...r.ltEnds.filter((x) => x < 4000))))}ms\n`
        + `   CLS ${stat(g.map((r) => r.cls))} | longtask ${stat(g.map((r) => r.longTasks))}건 합 ${stat(g.map((r) => Math.round(r.longTaskMs)))}ms 최대 ${stat(g.map((r) => r.maxLongTask))}ms\n`
        + `   전송(중앙값 KB) js 네트워크 ${sum('js', 'net')} / SW·캐시 ${sum('js', 'sw')} · css ${sum('css', 'net')}/${sum('css', 'sw')}`
        + ` · font ${sum('font', 'net')}/${sum('font', 'sw')} · img ${sum('img', 'net')}/${sum('img', 'sw')}`
        + ` | api 바이트는 **측정 불가**(교차 출처 TAO 없음) — 크기 미상 응답 ${opaque('api')}건\n`
        + `   요청수(중앙값) js ${med(g.map((r) => r.res.by.js?.n ?? 0))} · font ${med(g.map((r) => r.res.by.font?.n ?? 0))} · img ${med(g.map((r) => r.res.by.img?.n ?? 0))} · api ${med(g.map((r) => r.res.by.api?.n ?? 0))}`
        + ` | 1.2s 내 초기 js 청크 ${stat(g.map((r) => r.res.initialJsReqs))} | SW제어 ${g.filter((r) => r.res.swControlled).length}/${g.length}\n`
        + `   heap ${stat(g.map((r) => r.heapMB))}MB · nodes ${stat(g.map((r) => r.nodes))} · listeners ${stat(g.map((r) => r.listeners))}`,
      );
      const last = g[g.length - 1];
      for (const d of last.res.dups.slice(0, 8)) console.log(`   [중복요청 ${mode}/${sw}] ${d}`);
      for (const a of last.res.apiSlow) console.log(`   [api ${mode}/${sw}] ${a.ms}ms ${a.url}`);
      for (const f of last.loafTop.sort((a, b) => b.dur - a.dur).slice(0, 4)) console.log(`   [loaf ${mode}/${sw}] ${f.dur}ms(blocking ${f.blocking}) @${f.t}ms ${f.script}`);
    }
  }
  console.log('PB1-RAW ' + JSON.stringify(rows.map((r) => ({
    mode: r.mode, sw: r.sw, ttfb: r.ttfb, fcp: r.fcp, lcp: r.lcp, shellAt: r.shellAt, contentAt: r.contentAt,
    quietAt: r.quietAt, cls: r.cls, longTasks: r.longTasks, longTaskMs: Math.round(r.longTaskMs), heapMB: r.heapMB,
    nodes: r.nodes, listeners: r.listeners, by: r.res.by, dups: r.res.dups.length,
  }))));
});

// ── 2) 상호작용 흐름 ─────────────────────────────────────────────────────────
/** 클릭 → 마커 등장까지를 **페이지 시계**로 잰다(테스트 프로세스 시계는 부하에 흔들린다).
 *  ⚠ 모든 동작에 명시 타임아웃을 건다. playwright.config 에 actionTimeout 이 없어 기본이 '무한' 이라,
 *    오버레이가 클릭을 가로채면 **측정이 아니라 그냥 멈춘다**(첫 시도에서 20분을 날렸다). */
const ACT_TIMEOUT = 15_000;

/** ⚠ 하단 탭바는 스크롤하면 숨는다(translate-y-120%, `tabbar_autohide_v2`). 숨은 상태에서 탭을 클릭하면
 *  Playwright 가 '뷰포트 밖'이라며 무한 재시도한다 — 스크롤 흐름 뒤에는 반드시 맨 위로 돌려놓고 누른다. */
async function toTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350); // 탭바 복귀 전환(--dur-panel)
}
async function timed(page: Page, act: () => Promise<void>): Promise<number> {
  const t0 = await page.evaluate(() => performance.now());
  try { await act(); } catch (e) { console.log(`   [실패] ${(e as Error).message.split('\n')[0].slice(0, 120)}`); }
  const t1 = await page.evaluate(() => performance.now());
  return Math.round(t1 - t0);
}

test('PB2 흐름 기준선 — 탭 전환 · 모달 · 검색 · 스크롤 · 이벤트판', async ({ browser }) => {
  test.skip(!process.env.NURI_PERF, '측정 전용 — NURI_PERF=1 일 때만 실행');
  test.setTimeout(RUNS * 5 * 60_000); // 한 사이클 5분이면 충분 — 넘으면 '측정'이 아니라 '멈춤'이니 실패시켜 드러낸다

  const S: Record<string, number[]> = {};
  const push = (k: string, v: number) => { (S[k] ??= []).push(v); };

  for (let i = 0; i < RUNS; i += 1) {
    const ctx = await newCtx(browser, 'allow');
    const page = await ctx.newPage();
    await throttle(page);
    await stabilizeBackstack(page); // 뒤로가기로 모달을 닫으려면 되돌아갈 항목이 있어야 한다
    await page.addInitScript(probe);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForSelector('nav[aria-label="하단 내비게이션"]', { timeout: 30_000 });
    await page.waitForTimeout(3000); // 첫 진입 잔여 작업이 흐름 측정에 섞이지 않게 가라앉힌다
    const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
    const before = await cdpMetrics(page);

    // 탭 전환 — keep-alive 라 **첫 방문(마운트)과 재방문(display 토글)** 이 다르다. 둘 다 잰다.
    // 이름은 정규식으로만 준다 — 진행 중 게임이 있으면 접근성 이름에 배지 숫자가 붙는다('라이브 1').
    for (const [key, name, marker] of [
      ['tab-live', /^라이브/, '진행 중 게임'],
      ['tab-community', /^커뮤니티/, null],
      // 하단 탭바는 [홈·라이브·커뮤니티·GTO·캘린더(또는 내 매장)] 다 — 장터는 탭바에 없다(App.tsx items).
      ['tab-tools', /^GTO/, null],
      ['tab-calendar', /^캘린더/, null],
    ] as [string, RegExp, string | null][]) {
      // ⚠ toTop 은 **측정 구간 밖**에서 한다 — 안에 넣으면 350ms 가 전환 시간으로 둔갑한다.
      const home = async () => {
        await nav.getByRole('button', { name: '홈', exact: true }).click({ timeout: ACT_TIMEOUT });
        await page.waitForTimeout(250);
      };
      const go = async () => {
        await nav.getByRole('button', { name }).first().click({ timeout: ACT_TIMEOUT });
        if (marker) await page.getByText(marker).first().waitFor({ timeout: 15_000 }).catch(() => {});
        else await page.waitForTimeout(250);
      };
      await toTop(page);
      push(`${key}-첫마운트`, await timed(page, go));
      await toTop(page);
      await timed(page, home);
      await toTop(page);
      push(`${key}-재방문`, await timed(page, go));
      await toTop(page);
      await timed(page, home);
    }
    console.log(`   [진행 ${i + 1}/${RUNS}] 탭 전환 완료`);

    // 알림 패널 개폐 — 모달 진입 비용 + 왕복 누적
    for (let k = 0; k < 5; k += 1) {
      push('알림열기', await timed(page, async () => {
        await page.locator('header button[aria-label^="알림"]').first().click({ timeout: ACT_TIMEOUT });
        await page.locator('[role="dialog"]').first().waitFor({ timeout: 10_000 });
      }));
      // ⚠ 알림 패널에는 Escape 핸들러가 없다(NotificationPanel.tsx — 확인함). 닫는 길은 뒤로가기(backstack)와
      //   모바일 dim 탭 둘뿐이다. Escape 로 닫으려다 20분을 날렸다 — 닫히지 않은 스크림이 다음 클릭을 무한 대기시켰다.
      push('알림닫기', await timed(page, async () => {
        await page.goBack();
        await page.locator('[role="dialog"]').first().waitFor({ state: 'detached', timeout: 10_000 });
      }));
    }
    console.log(`   [진행 ${i + 1}/${RUNS}] 알림 개폐 완료`);

    // 검색/필터 — 검색 입력은 홈이 아니라 **'전체 일정'(browse) 레일**에 있다(헤더 검색 버튼은 2026-08-27 제거).
    await toTop(page);
    push('전체일정진입', await timed(page, async () => {
      await page.getByRole('button', { name: /전체 일정/ }).first().click({ timeout: ACT_TIMEOUT });
      await page.getByRole('button', { name: '검색 열기' }).first().waitFor({ timeout: 15_000 });
    }));
    // 검색창은 기본 접혀 있다(IntegratedSearchBar searchOpen=false) — 돋보기 칩으로 연다.
    push('검색창열기', await timed(page, async () => {
      await page.getByRole('button', { name: '검색 열기' }).first().click({ timeout: ACT_TIMEOUT });
      await page.locator('input[type="search"]').first().waitFor({ timeout: 10_000 });
    }));
    push('검색입력→반영', await timed(page, async () => {
      await page.keyboard.type('홀덤', { delay: 40 });
      await page.waitForTimeout(700);
    }));
    console.log(`   [진행 ${i + 1}/${RUNS}] 검색 완료`);

    // 목록 스크롤 — 커뮤니티 10회
    await toTop(page);
    await nav.getByRole('button', { name: /^커뮤니티/ }).first().click({ timeout: ACT_TIMEOUT });
    await page.waitForTimeout(1500);
    const scrollBefore = await page.evaluate(() => ({ lt: window.__pb!.longTasks, cls: window.__pb!.cls }));
    push('스크롤10회', await timed(page, async () => {
      for (let s = 0; s < 10; s += 1) { await page.evaluate(() => window.scrollBy(0, 400)); await page.waitForTimeout(100); }
    }));
    const scrollAfter = await page.evaluate(() => ({ lt: window.__pb!.longTasks, cls: window.__pb!.cls }));
    push('스크롤longtask', scrollAfter.lt - scrollBefore.lt);
    push('스크롤CLS×1000', Math.round((scrollAfter.cls - scrollBefore.cls) * 1000));

    // 이벤트 판 — 홈의 이벤트 진입 칸(없으면 건너뛴다: 진행 중 이벤트가 없는 날이 있다)
    await toTop(page);
    await nav.getByRole('button', { name: '홈', exact: true }).click({ timeout: ACT_TIMEOUT });
    await page.waitForTimeout(500);
    const ev = page.getByTestId('home-event-banner').first();
    if (await ev.count()) {
      push('이벤트판열기', await timed(page, async () => { await ev.click({ timeout: ACT_TIMEOUT }); await page.waitForTimeout(900); }));
      await page.goBack().catch(() => {});
      await page.waitForTimeout(400);
    } else if (i === 0) {
      console.log('   [건너뜀] 홈에 이벤트 배너가 없다 — 이벤트 판 진입은 잴 수 없다');
    }

    // 누적 — 위 왕복을 전부 마친 뒤의 메모리·노드·리스너 증가
    await page.evaluate(() => { (window as unknown as { gc?: () => void }).gc?.(); });
    const after = await cdpMetrics(page);
    push('heapΔMB', Math.round((after.heapMB - before.heapMB) * 10) / 10);
    push('nodesΔ', after.nodes - before.nodes);
    push('listenersΔ', after.listeners - before.listeners);
    push('docsΔ', after.docs - before.docs);
    push('누적longtask', (await page.evaluate(() => window.__pb!.longTasks)));

    await ctx.close();
  }

  for (const [k, v] of Object.entries(S)) console.log(`PB2 ${k} — ${stat(v)}`);
  console.log('PB2-RAW ' + JSON.stringify(S));
});

// ── 3) 로그인 복원 (스텁 세션 — 서버 자격증명 없음) ───────────────────────────
test('PB3 로그인 복원 기준선 — 저장된 세션으로 시작할 때', async ({ browser }) => {
  test.skip(!process.env.NURI_PERF, '측정 전용 — NURI_PERF=1 일 때만 실행');
  test.setTimeout(30 * 60_000);
  // ⚠ 이 저장소의 E2E 계정은 폐기됐다(_session.ts stubLogin 주석). 서버가 거부하는 스텁 토큰이라
  //   **화면 렌더 비용만** 잰다 — 실제 로그인 유저의 서버 응답 시간은 이 수치에 없다. 보고서에 그렇게 적을 것.
  const out: Record<string, number[]> = {};
  const push = (k: string, v: number) => { (out[k] ??= []).push(v); };
  for (let i = 0; i < RUNS; i += 1) {
    const ctx = await newCtx(browser, 'allow');
    const page = await ctx.newPage();
    await throttle(page);
    await stubLogin(page);
    await page.addInitScript(probe);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    const m = await page.evaluate(() => window.__pb!);
    const r = await page.evaluate(collectResources);
    push('FCP', m.fcp); push('LCP', m.lcp); push('셸표시', m.shellAt); push('콘텐츠표시', m.contentAt);
    push('CLS×1000', Math.round(m.cls * 1000)); push('longtask건', m.longTasks);
    push('api요청수', r.by.api?.n ?? 0); push('중복요청', r.dups.length);

    // GTO 도구는 로그인 뒤에만 그려진다(ToolsPanel) — 스텁 세션으로 **마운트 비용만** 잰다.
    //   실제 계산(스팟 평가) 입력은 재지 못한다: 서버가 거부하는 스텁이라 데이터가 붙는 화면까지 못 간다. 보고서에 명시.
    const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
    push('GTO탭마운트', await timed(page, async () => {
      await nav.getByRole('button', { name: /^GTO/ }).first().click({ timeout: ACT_TIMEOUT });
      await page.waitForTimeout(600);
    }));
    if (i === RUNS - 1) for (const d of r.dups.slice(0, 10)) console.log(`   [로그인 중복요청] ${d}`);
    await ctx.close();
  }
  for (const [k, v] of Object.entries(out)) console.log(`PB3 ${k} — ${stat(v)}`);
});
