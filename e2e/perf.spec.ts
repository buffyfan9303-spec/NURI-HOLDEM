import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

// [DS] MO-1 — 성능 회귀 게이트: CPU 4× 스로틀 + 375×812(갤럭시 A17 ≈ Pixel 5 + 2× → 4×는 안전 마진).
// 첫 도입은 '기록 + 느슨한 상한'(현 상태 회귀 방지) — MO-2~9 진행하며 임계를 조인다(§20.6).
// 측정은 페이지 내 PerformanceObserver 주입(LoAF·layout-shift) — 라이브러리 0.

// 성능 측정 스펙은 병렬 워커 CPU 경합에 취약(단독 실행은 delta=0) — 임계는 그대로 두고 재시도만 허용
test.describe.configure({ retries: 2 });

// ── 측정기 ────────────────────────────────────────────────────────────────────
// 숫자만 있으면 원인을 **추측**하게 된다. CLS 0.14 가 나와도 '무엇이 무엇을 밀었는지'가 없으면
// min-height 를 감으로 붙이는 수밖에 없다. 그래서 shift 마다 source 노드·이동 전후 rect·발생 시각을
// 함께 남긴다. hadRecentInput(사용자 입력 직후)은 CLS 정의대로 제외한다.
export interface ShiftRec {
  value: number;
  t: number;               // 발생 시각(ms, navigationStart 기준)
  sources: { node: string; from: [number, number, number, number]; to: [number, number, number, number]; dy: number }[];
}
export interface LoafRec { t: number; dur: number; blocking: number; script: string }
export interface PerfBag {
  cls: number; longFrames: number;
  shifts: ShiftRec[];
  loaf: LoafRec[];
  reqs: { url: string; t: number }[];
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const bag: PerfBag = { cls: 0, longFrames: 0, shifts: [], loaf: [], reqs: [] };
    (window as unknown as { __perf: PerfBag }).__perf = bag;

    /** 노드를 사람이 읽을 수 있는 한 줄로 — 셀렉터만으로는 어느 카드인지 모른다. */
    const describe = (n: Node | null): string => {
      const el = n instanceof Element ? n : (n?.parentElement ?? null);
      if (!el) return '(node 없음)';
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
      const aria = el.getAttribute('aria-label');
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
      return `${tag}${id}${cls}${aria ? `[${aria}]` : ''}${txt ? ` «${txt}»` : ''}`;
    };
    const rect = (r: DOMRectReadOnly | undefined): [number, number, number, number] =>
      r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : [0, 0, 0, 0];

    try {
      new PerformanceObserver((l) => {
        type Src = { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly };
        for (const e of l.getEntries() as (PerformanceEntry & { value?: number; hadRecentInput?: boolean; sources?: Src[] })[]) {
          if (e.hadRecentInput) continue;               // CLS 정의: 입력 직후 이동은 제외
          const v = e.value ?? 0;
          bag.cls += v;
          if (v < 0.001) continue;                      // 잡음은 목록에 남기지 않는다(합계에는 이미 포함)
          bag.shifts.push({
            value: +v.toFixed(4),
            t: Math.round(e.startTime),
            sources: (e.sources ?? []).map((s) => ({
              node: describe(s.node),
              from: rect(s.previousRect),
              to: rect(s.currentRect),
              dy: Math.round((s.currentRect?.y ?? 0) - (s.previousRect?.y ?? 0)),
            })),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* noop */ }

    try {
      new PerformanceObserver((l) => {
        type Script = { name?: string; sourceURL?: string; duration?: number };
        for (const e of l.getEntries() as (PerformanceEntry & { blockingDuration?: number; scripts?: Script[] })[]) {
          const blocking = e.blockingDuration ?? 0;
          if (blocking > 100) bag.longFrames += 1;
          if (e.duration > 50) {
            const top = (e.scripts ?? []).slice().sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
            bag.loaf.push({
              t: Math.round(e.startTime), dur: Math.round(e.duration), blocking: Math.round(blocking),
              script: top ? `${top.name ?? ''} ${top.sourceURL ?? ''}`.trim().slice(0, 80) : '',
            });
          }
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
    } catch { /* noop */ }

    // 같은 데이터를 두 번 받아오는지 보기 위한 요청 기록(중복 fetch 회귀 감시).
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) bag.reqs.push({ url: e.name, t: Math.round(e.startTime) });
      }).observe({ type: 'resource', buffered: true });
    } catch { /* noop */ }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.setViewportSize({ width: 375, height: 812 });
});

const readPerf = (page: Page) => page.evaluate(() => (window as unknown as { __perf: PerfBag }).__perf);

/** 큰 shift 부터 사람이 읽을 수 있게 — 원인 노드와 몇 px 밀렸는지까지. */
function reportShifts(label: string, p: PerfBag, top = 4): void {
  const sorted = [...p.shifts].sort((a, b) => b.value - a.value).slice(0, top);
  for (const s of sorted) {
    const src = s.sources.map((x) => `${x.node} y ${x.from[1]}→${x.to[1]} (${x.dy >= 0 ? '+' : ''}${x.dy}px)`).join(' | ');
    console.log(`[shift:${label}] value=${s.value} @${s.t}ms ${src || '(source 없음)'}`);
  }
  const slow = [...p.loaf].sort((a, b) => b.dur - a.dur).slice(0, 3);
  for (const f of slow) console.log(`[loaf:${label}] ${f.dur}ms (blocking ${f.blocking}ms) @${f.t}ms ${f.script}`);
}

test('perf① 홈 콜드 진입 — CLS·롱프레임 기록 + 상한', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('오늘·내일 일정').first()).toBeVisible();
  await page.waitForTimeout(3500); // 배너·개인화 블록 도착분까지 CLS 에 포함
  const p = await readPerf(page);
  console.log(`[perf-baseline] browse-cold CLS=${p.cls.toFixed(3)} longFrames=${p.longFrames}`);
  reportShifts('home-cold', p);
  // 상한 = 실측 + 작은 여유(2026-09-10, 프로덕션 빌드·Pixel 7·5회 연속: CLS 0.190 / 롱프레임 1 — 목킹 픽스처라 결정적).
  //   예전 0.35/40 은 실측의 2배/40배라 회귀를 못 잡았다. CLS 는 +0.06(≈30%), 롱프레임은 CI 러너 편차를 감안해 8.
  expect(p.cls, 'browse 콜드 CLS').toBeLessThan(0.25);
  expect(p.longFrames, 'browse 콜드 롱프레임').toBeLessThan(8);
});

test('perf② browse→live 탭 전환 — 전환 구간 롱프레임 상한', async ({ page }) => {
  test.setTimeout(60_000); // 병렬 부하에서 마운트 대기(≤30s)가 기본 타임아웃을 소진한다
  await page.goto('/');
  // 병렬 스위트 부하에서 마운트가 늦으면 nav 대기가 기본 타임아웃을 넘긴다 — 마운트 마커로 명시 대기
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 30_000 });
  const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
  await expect(nav).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const before = await readPerf(page);
  await nav.getByRole('button', { name: /^라이브/ /* 진행 중 게임이 있으면 배지 숫자가 접근성 이름에 붙는다('라이브 1') — exact 는 저녁마다 깨진다 */ }).click();
  await expect(page.getByText('진행 중 게임')).toBeVisible();
  await nav.getByRole('button', { name: '홈', exact: true }).click();
  await page.waitForTimeout(800);
  const after = await readPerf(page);
  const delta = after.longFrames - before.longFrames;
  console.log(`[perf-baseline] tab-switch longFrames delta=${delta}`);
  reportShifts('tab-switch', after, 2);
  // 실측 0(5회 연속, 2026-09-10) — 예전 15 는 회귀 한 번에 롱프레임 열 개가 생겨도 통과했다. CI 편차용 여유 6.
  expect(delta, '탭 전환 왕복 롱프레임').toBeLessThan(6);
});

test('perf③ 커뮤니티 스크롤 — 스크롤 구간 CLS·롱프레임 상한', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
  await nav.getByRole('button', { name: '커뮤니티', exact: true }).click();
  await page.waitForTimeout(2000);
  const before = await readPerf(page);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(120);
  }
  const after = await readPerf(page);
  const clsDelta = after.cls - before.cls;
  const lfDelta = after.longFrames - before.longFrames;
  console.log(`[perf-baseline] community-scroll CLS delta=${clsDelta.toFixed(3)} longFrames delta=${lfDelta}`);
  reportShifts('community-scroll', after, 3);
  // 실측 CLS 0.015 / 롱프레임 0(5회 연속, 2026-09-10). 예전 0.15/20 은 실측의 10배/무한대. 여유: CLS 0.05(3배), 롱프레임 8.
  expect(clsDelta, '커뮤니티 스크롤 CLS').toBeLessThan(0.05);
  expect(lfDelta, '커뮤니티 스크롤 롱프레임').toBeLessThan(8);
});

// ── 홈 삽입 밀림 게이트 ────────────────────────────────────────────────────────
// 무엇을 잡나: 마운트 후 도착한 데이터가 **이미 보이는 콘텐츠 위**에 칸을 만들어 아래를 밀어내는 것.
// 실측(2026-09-07, CPU 4× · 375×812): `오늘·내일 일정` 이 940ms 에 y 369→452 로 +83px 밀렸다.
//   같은 프레임에 푸터도 693→776 으로 같은 83px. 즉 그 위에 83px 짜리 칸이 새로 생겼다는 뜻이다.
// 응답을 조작하지 않고 **지연**시켜 재현한다 — payload 모양에 의존하지 않아 API 가 바뀌어도 이 게이트는 산다.
const EVENT_RPC = /\/rest\/v1\/rpc\/event_board/;

/** '오늘·내일 일정' 이 첫 페인트 이후 세로로 움직인 총량(px). 0 이어야 한다. */
function scheduleDrift(p: PerfBag): number {
  let dy = 0;
  for (const s of p.shifts) for (const src of s.sources) if (src.node.includes('오늘·내일 일정')) dy += Math.abs(src.dy);
  return dy;
}

// 케이스 3종. '첫 방문' 은 지난 사실이 없어 예약할 근거가 없다 — 그건 기록만 하고 게이트로 걸지 않는다.
//   (근거 없이 항상 예약하면 이벤트가 없는 대다수 유저에게 영구 빈칸이 생긴다.)
type HomeCase = { label: string; seen: boolean | null; gate: boolean; route: (p: Page) => Promise<void> };
const delayEvent = async (page: Page) => {
  await page.route(EVENT_RPC, async (r) => { await new Promise((f) => setTimeout(f, 1200)); await r.continue(); });
};
const noEvent = async (page: Page) => {
  await page.route(EVENT_RPC, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
};
const HOME_CASES: HomeCase[] = [
  { label: '이벤트 있음 · 재방문', seen: true, gate: true, route: delayEvent },
  { label: '이벤트 없음 · 재방문', seen: false, gate: true, route: noEvent },
  { label: '이벤트 있음 · 첫 방문(기록만)', seen: null, gate: false, route: delayEvent },
];

for (const c of HOME_CASES) {
  test(`perf④ 홈 콜드 — ${c.label}: 오늘·내일 일정이 밀리지 않는다`, async ({ page }) => {
    if (c.seen !== null) {
      const v = c.seen ? '1' : '0';
      await page.addInitScript((val) => { try { localStorage.setItem('nuri:event-banner-seen', val as string); } catch { /* noop */ } }, v);
    }
    await c.route(page);
    await page.goto('/');
    await expect(page.getByText('오늘·내일 일정').first()).toBeVisible();
    await page.waitForTimeout(3500);
    // '이벤트 있음' 케이스는 진행 중인 이벤트가 실제로 있어야 성립한다(2026-09-10 런칭 정리로 오픈 이벤트가 삭제됐다).
    //   없으면 seen=1 로 예약한 칸이 '이벤트 없음' 응답에 접히는 게 정상 동작이라, 이 게이트의 전제가 아니다.
    if (c.route === delayEvent) {
      const hasEvent = await page.locator('button').filter({ hasText: /오픈 기념|카드 오픈|이벤트/ }).count();
      test.skip(hasEvent === 0, '진행 중인 이벤트가 없다 — 이벤트 있음 케이스는 잴 수 없다');
    }
    const p = await readPerf(page);
    const drift = scheduleDrift(p);
    console.log(`[perf-home] ${c.label} CLS=${p.cls.toFixed(3)} 일정드리프트=${drift}px longFrames=${p.longFrames}`);
    reportShifts(`home:${c.label}`, p, 3);
    // 게이트는 **드리프트 하나**다. CLS 총합은 기록만 한다.
    //   왜: CLS 는 이 계약을 격리하지 못한다. 안에 마운트 시점의 푸터 이동(div.reveal y 0→687)이 섞여 있고,
    //   그건 이번에 고친 '늦게 도착한 칸의 삽입'과 다른 원인이다. 게다가 병렬 워커 부하에서 크게 흔들린다
    //   (단독 0.056 → 전체 스위트 0.139. 실제로 이 임계로 한 번 깨졌다).
    //   드리프트는 레이아웃 사실이라 부하와 무관하게 0 이거나 아니거나 둘 중 하나다 — 게이트는 이쪽이어야 한다.
    if (c.gate) {
      expect(drift, `'오늘·내일 일정' 이 첫 페인트 뒤 ${drift}px 밀렸다 — 늦게 도착한 칸이 위에 삽입되고 있다`).toBe(0);
    }
  });
}
