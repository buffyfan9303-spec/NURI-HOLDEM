/* eslint-disable playwright/expect-expect --
   이 파일은 **계측 전용**이라 단언이 없는 것이 맞다. 기본은 test.skip 으로 건너뛰고,
   환경변수를 줄 때만 돌아 **숫자를 출력**한다 — 통과/실패를 가르는 게이트가 아니다.
   룰 자체는 error 로 둔다 — 진짜 게이트가 단언 없이 통과하는 것을 계속 잡아야 하기 때문이다. */
// §6 실측 — 폰트 전략 A/B (`font-display: optional` vs `swap`).
//
// 왜 이 측정이 필요한가 (2026-09-12):
//   Pretendard 가 **한 글자도 적용되지 않는다**(콜드·웜 모두 폴백). 원인은 `font-display: optional` 로 확정됐다 —
//   정적 `<link>` 로 바꿔도 미적용이었고, 같은 woff2 를 `FontFace` API 로 직접 로드하면 정상 적용됐다.
//   즉 지금은 **321KB 를 받고 픽셀은 0** 이다.
//   `swap` 으로 바꾸면 적용되지만, 코드 주석에 "swap 은 161ms 전면 재레이아웃을 만든다"는 과거 실측이 있다.
//   §4 는 "실측 없이 전략을 바꾸지 마라" 고 명시한다 — 그래서 **소스를 바꾸지 않고** 응답만 가로채 잰다.
//
// 조건 고정(§6): 같은 프로덕션 빌드 · 같은 viewport · CPU 4x 스로틀 · 콜드 캐시(컨텍스트마다 새로) ·
//   두 조건을 **교대로** 5회씩 · 중앙값과 최소~최대 스프레드를 함께 남긴다.
//
// ⚠ 이 파일은 **측정 전용**이며 게이트가 아니다. 임계값으로 실패시키지 않는다 — 숫자를 찍어 판단 근거를 만든다.
import { test } from './_fixtures';

// `fallback` = 블록 ~100ms + 스왑 구간 ~3s — optional 과 swap 의 중간. 이분법으로 결론내지 않으려고 함께 잰다.
type Variant = 'optional' | 'swap' | 'fallback' | 'fallback+metric';

interface Sample {
  variant: Variant;
  /** 실제 face.display — 조건이 정말 적용됐는지 증명한다 */
  displays: string[];
  intercepted: number;
  lcp: number;
  cls: number;
  fontApplied: boolean;
  fontBytes: number;
  fontReqs: number;
}

const RUNS = 5;

async function measure(browser: import('@playwright/test').Browser, variant: Variant): Promise<Sample> {
  // 컨텍스트를 새로 만들어 **콜드 캐시**를 보장한다(디스크·메모리 캐시·localStorage 전부 비어 있음).
  //
  // ⚠ `serviceWorkers: 'block'` 이 **필수**다(2026-09-12 실측으로 잡은 함정).
  //   이 앱은 서비스워커가 폰트 CSS 를 대신 서빙한다 — 그러면 `page.route` 가 **한 번도 발동하지 않아**
  //   `swap` 변형이 실제로는 `optional` 그대로 측정된다(첫 시도에서 `intercepted=0`, 두 조건의 CLS 가
  //   소수점까지 같게 나와 들켰다). 양쪽 조건 모두 차단해야 공정한 비교가 된다.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  // CPU 4x 스로틀 — 기존 perf.spec.ts 와 같은 조건.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  let fontBytes = 0;
  let fontReqs = 0;
  page.on('response', async (res) => {
    const u = res.url();
    if (!/\.woff2(\?|$)/.test(u)) return;
    fontReqs += 1;
    try {
      const b = await res.body();
      fontBytes += b.length;
    } catch { /* 본문을 못 읽는 응답은 건너뛴다 */ }
  });

  // `swap` 변형 — CSS 본문의 font-display 만 바꿔 돌려준다. 소스 파일은 건드리지 않는다.
  let intercepted = 0;
  if (variant !== 'optional') {
    await page.route('**/pretendardvariable-dynamic-subset.css', async (route) => {
      intercepted += 1;
      const r = await route.fetch();
      const disp = variant === 'fallback+metric' ? 'fallback' : variant;
      const css = (await r.text()).replace(/font-display:\s*optional/g, `font-display: ${disp}`);
      await route.fulfill({ response: r, body: css, headers: { ...r.headers(), 'content-type': 'text/css' } });
    });
  }

  if (variant === 'fallback+metric') {
    // Malgun(429) 대비 Pretendard(371.3) 는 64px 기준 **13.5% 좁다**.
    // 폴백에 size-adjust 로 같은 폭을 만들어 두면 교체 순간 글자가 밀리지 않는다(표준 기법).
    await page.addInitScript(() => {
      const st = document.createElement('style');
      st.textContent = `
        @font-face {
          font-family: 'NuriMetricFallback';
          src: local('Malgun Gothic'), local('맑은 고딕'), local('Apple SD Gothic Neo');
          size-adjust: 86.5%;
          font-weight: 100 900;
        }
        html, body, body * { font-family: 'Pretendard Variable', Pretendard, NuriMarks, 'NuriMetricFallback', system-ui, sans-serif !important; }
      `;
      document.documentElement.appendChild(st);
    });
  }

  await page.addInitScript(() => {
    const w = window as unknown as { __m: { lcp: number; cls: number } };
    w.__m = { lcp: 0, cls: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__m.lcp = Math.max(w.__m.lcp, e.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!s.hadRecentInput) w.__m.cls += s.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // 늦게 도착한 폰트의 교체·시프트까지 담는다(swap 의 대가가 여기서 드러난다).
  await page.waitForTimeout(4000);

  const r = await page.evaluate(() => {
    const displays = [...new Set([...document.fonts].filter((f) => f.family.includes('Pretendard')).map((f) => f.display))];
    const mk = (fam: string) => {
      const s = document.createElement('span');
      s.style.cssText = 'position:absolute;left:-9999px;font-size:64px;white-space:pre;font-family:' + fam;
      s.textContent = '오늘 내일 일정';
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return w;
    };
    const w = window as unknown as { __m: { lcp: number; cls: number } };
    return {
      lcp: Math.round(w.__m.lcp),
      cls: Math.round(w.__m.cls * 10000) / 10000,
      // 적용 판정은 **존재하지 않는 폰트와만** 비교한다(system-ui 와 비교하면 항상 참이 된다).
      fontApplied: Math.abs(mk("'Pretendard Variable'") - mk('__nuri_no_font__')) > 0.5,
      displays,
    };
  });

  await ctx.close();
  return { variant, ...r, fontBytes, fontReqs, intercepted };
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (xs: number[]) => `중앙값 ${med(xs)} (최소 ${Math.min(...xs)} ~ 최대 ${Math.max(...xs)})`;

test('폰트 전략 A/B 실측 — optional vs fallback vs fallback+metric', async ({ browser }) => {
  // ⚠ 기본은 **건너뛴다.** 이건 게이트가 아니라 판단 근거를 만드는 측정 도구다(2분 걸린다).
  //   돌리려면: `NURI_MEASURE=1 npx playwright test e2e/_measure-font.spec.ts --workers=1 --headed`
  //   ⚠ `--headed` 가 필수다 — headless 는 시스템 폰트가 달라 **반대 결론**이 난다.
  test.skip(!process.env.NURI_MEASURE, '측정 전용 — NURI_MEASURE=1 일 때만 실행');
  test.setTimeout(30 * 60_000);
  const rows: Sample[] = [];
  // **교대로** 돈다 — 한 조건을 몰아서 재면 머신 상태 변화가 조건 차이로 둔갑한다.
  for (let i = 0; i < RUNS; i += 1) {
    const order: Variant[] = i % 2 === 0
      ? ['optional', 'fallback', 'swap', 'fallback+metric']
      : ['fallback+metric', 'swap', 'fallback', 'optional'];
    for (const v of order) rows.push(await measure(browser, v));
  }

  const by = (v: Variant) => rows.filter((r) => r.variant === v);
  for (const v of ['optional', 'fallback', 'swap', 'fallback+metric'] as Variant[]) {
    const g = by(v);
    console.log(`MEASURE ${v} | LCP ${fmt(g.map((x) => x.lcp))}ms | CLS ${fmt(g.map((x) => x.cls))}`
      + ` | 폰트적용 ${g.filter((x) => x.fontApplied).length}/${g.length}`
      + ` | 폰트전송 ${fmt(g.map((x) => Math.round(x.fontBytes / 1024)))}KB (${fmt(g.map((x) => x.fontReqs))}건)`
      + ` | display=${[...new Set(g.flatMap((x) => x.displays))].join('/')} 가로챔=${g.map((x) => x.intercepted).join(',')}`);
  }
  console.log('MEASURE-RAW ' + JSON.stringify(rows));
});
