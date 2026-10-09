// 헤더 로고 글린트 — 2026-10-08 오너 "메인에 최고의 모션 딱 1개" 로 첫 표시 1회였다가,
// 2026-10-09 오너 "모션그래픽 넣은 부분들 처음에 한번 나오고 안나와서 내가 인지를 못하는 것 같아 이거 계속 반복되게" 로 **주기 반복**이 됐다.
//
// 왜 계약을 바꿨나: 종전 ②("한 번만 — 끝나면 노드 제거 · 새로고침해도 같은 세션에선 재생 0")는 이제 요구의 반대다.
//   세션당 1회(sessionStorage 'nuri-glint')를 걷고 8초마다 다시 지나가게 했다(LogoGlint · lib/glintLoop.ts).
//   노드는 남고, 쉬는 동안 빛은 상자 밖 대기 위치(gradientTransform 기본값 ≤ −18)에 있다 — 그래서 "노드 0" 대신 "이동량이 대기 위치" 로 잰다.
//
// 지키는 것:
//   ① 레이아웃 0 영향 — 첫 회차 중·쉼·두 번째 회차 중 헤더·로고·탭바 상자가 0px 도 안 바뀐다.
//   ② 반복 — 첫 회차 뒤 대기 위치로 돌아가고, 약 8초 뒤 두 번째 회차가 실제로 지나간다.
//   ③ 멈춤 — 문서가 숨으면 지나가던 빛을 거두고 숨은 동안 0회, 다시 보이면 새 주기로 재개. 헤더의 숨은(display:none) 인스턴스는 0회.
//   ④ reduced-motion — 로드 때 켜져 있으면 청크도 안 받고 0, 도중에 켜지면 그 자리에서 거두고 그 뒤 0.
//   ⑤ 입력에 양보 — 재생 중 첫 터치가 오면 2 프레임 안에 대기 위치(저사양 CI 에서 눌림 프레임이 래스터에 밀리지 않게). 다음 주기에 다시.
// ①·② 가 "실제로 생겼고 실제로 움직였다" 를 먼저 단언한다 — ③·④ 만 있으면 글린트가 통째로 고장 나도 초록이다.
// 음성 대조(2026-10-09, build.md): 반복 시계를 '첫 회차만' 으로 되돌린 빌드 사본에서 ② 의 두 번째 회차 단언이 실패한다.
// 이전 기록: ⑤ 는 입력 양보 이전 빌드(90a36485)에서 3/3 실패. ① 의 셸 셀렉터는 재생 구간에만 헤더·로고·탭바를 1px 옮긴 사본에서 2/2 실패(2026-10-09).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const GLINT = '[data-testid="logo-glint"]';
/** 대기 위치(LogoGlint 의 gradientTransform 기본값). 이보다 작거나 같으면 빛은 로고 상자 밖이다. */
const REST = -18;
/** 반복 간격(LogoGlint GLINT_PERIOD) */
const PERIOD = 8000;

/** 셸 헤더·하단 탭바 — 앱이 선언한 표지로만 고른다.
 *  ⚠ 맨 `header`·`nav` 는 본문에도 있다(일정 섹션 HEADER · BusinessFooter 법정 링크 nav). 오늘 일정이 스켈레톤을 대신하며
 *    푸터 nav 가 y 909→688 로 올라오자 글린트와 무관하게 '셸 상자 불변' 이 깨졌다(2026-10-09 CI, PR #244·#247 같은 줄). */
const HEADER = '[data-stack-header]';
const TABBAR = 'nav[aria-label="하단 내비게이션"]';
/** 홈 본문은 데이터가 들어오며 자라므로 빼고, 셸(헤더·헤더 버튼·로고·탭바·탭 버튼)만 잰다. */
const shellBoxes = (page: Page) => page.evaluate((sel) =>
  [...document.querySelectorAll(sel)].map((e) => {
    const r = e.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].join(',');
  }), [HEADER, `${HEADER} button`, `${HEADER} [aria-label="NURI HOLDEM"]`, TABBAR, `${TABBAR} button`].join(', '));

/** 보이는 로고 글린트의 그라디언트 이동량(SMIL animVal). 헤더의 PC·모바일 인스턴스 중 상자가 있는 쪽만 본다. 없으면 null. */
const glintX = (page: Page) => page.evaluate(() => {
  const svg = [...document.querySelectorAll('[data-testid="logo-glint"]')].find((s) => s.getClientRects().length > 0);
  const t = svg?.querySelector('linearGradient')?.gradientTransform.animVal;
  return t && t.numberOfItems ? t.getItem(0).matrix.e : null;
});

/** 페이지 시작부터 매 프레임 보이는 글린트 이동량을 바뀔 때마다 기록한다.
 *  ⚠ 회차가 850ms 로 짧아, 폴링을 셸 측정 뒤에 시작하면 4 워커 부하에서 첫 회차를 통째로 놓쳤다(2026-10-09 실측 — 5초 동안 −18 만 읽힘). */
const recordGlint = (page: Page) => page.addInitScript(() => {
  const log: [number, number][] = [];
  (window as unknown as { __glint: typeof log }).__glint = log;
  const tick = () => {
    const svg = [...document.querySelectorAll('[data-testid="logo-glint"]')].find((s) => s.getClientRects().length > 0);
    const t = svg?.querySelector('linearGradient')?.gradientTransform.animVal;
    const x = t && t.numberOfItems ? t.getItem(0).matrix.e : null;
    if (x !== null && (!log.length || log[log.length - 1][1] !== x)) log.push([performance.now(), x]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
/** 기록에서 회차 시작 시각들 — 이동량이 `over` 를 처음 넘은 때. 대기 위치(≤ −18)로 돌아와야 다음 회차로 센다. */
const runStarts = (page: Page, over = 20) => page.evaluate((o) => {
  const starts: number[] = [];
  let inRun = false;
  for (const [t, x] of (window as unknown as { __glint: [number, number][] }).__glint) {
    if (!inRun && x > o) { starts.push(t); inRun = true; } else if (inRun && x <= -18) inRun = false;
  }
  return starts;
}, over);
const runCount = async (page: Page, over = 20) => (await runStarts(page, over)).length;
/** 지금 회차가 지나가는 중일 때까지 기다린다 — 첫 회차를 놓쳤으면 다음 주기까지 */
const waitRunning = (page: Page) => expect.poll(() => glintX(page), { timeout: PERIOD + 5_000, intervals: [20] }).toBeGreaterThan(20);

test.describe('헤더 로고 글린트(주기 반복)', () => {
  test('반복 — 첫 회차 → 대기 위치 → 약 8초 뒤 두 번째 회차 · 셸 상자 불변', async ({ page }) => {
    test.setTimeout(60_000);
    await recordGlint(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(GLINT).first().waitFor({ state: 'attached', timeout: 10_000 });
    const before = await shellBoxes(page);
    // 셀렉터가 셸을 실제로 잡았는가 — 못 잡으면 빈 배열끼리 같아 아래 불변 단언이 거짓 통과한다
    await expect(page.locator(HEADER)).toHaveCount(1);
    await expect(page.locator(TABBAR)).toHaveCount(1);
    await expect(page.locator(GLINT).filter({ visible: true })).toHaveCount(1);
    // 시작 전 띠는 상자(x 9.18~) 밖에 있어야 한다 — 기본값이 비면 begin 전 항등 위치(다이아 한가운데)에 멈춰 보였다(PR #239 검토 P2)
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-testid="logo-glint"] linearGradient')]
      .map((g) => (g as SVGLinearGradientElement).gradientTransform.baseVal.getItem(0).matrix.e)
      .every((e) => e <= -18))).toBe(true);

    // 두 회차가 지나갈 때까지 셸 상자를 200ms 마다 잰다 — 회차 중·쉼 어느 순간에도 0px
    const deadline = Date.now() + 2 * PERIOD + 6_000;
    let boxesSeen = 0;
    while ((await runCount(page)) < 2 && Date.now() < deadline) {
      expect(await shellBoxes(page)).toEqual(before);
      boxesSeen++;
      await page.waitForTimeout(200);
    }
    const starts = await runStarts(page);
    expect(starts.length, `회차 시작 ${JSON.stringify(starts.map(Math.round))}`).toBeGreaterThanOrEqual(2);
    expect(boxesSeen, '셸 상자를 실제로 여러 번 쟀다').toBeGreaterThan(20);
    // 첫 회차는 첫 표시 직후다(마운트 + 350ms) — 첫 회차가 무언가에 거둬지면 첫 시작이 다음 주기(≈9s)로 밀린다.
    //   실측(2026-10-09): 입력 판정에 'scroll' 을 넣었더니 홈 가로 레일의 자체 scroll(≈1.1s)이 첫 회차를 74ms 만에 거뒀다.
    expect(starts[0], `첫 회차 시작 ${Math.round(starts[0])}ms`).toBeLessThan(5_000);
    // 같은 회차를 두 번 센 것이 아니다 — 대기 위치로 돌아온 뒤 주기 하나만큼 떨어져 있다
    const gap = starts[1] - starts[0];
    expect(gap, `두 회차 간격 ${Math.round(gap)}ms`).toBeGreaterThan(PERIOD - 1_000);
    expect(gap).toBeLessThan(PERIOD + 1_500);
    // 실제로 글자 끝까지 지나갔다(다크 390 = 끝 94 근처)
    expect(Math.max(...(await page.evaluate(() => (window as unknown as { __glint: [number, number][] }).__glint.map(([, x]) => x))))).toBeGreaterThan(85);
    expect(await shellBoxes(page)).toEqual(before);
    await expect(page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true })).toHaveCount(1);
  });

  // 360(갤럭시)·320 은 글자 층이 접히고 다이아만 남는다 — 빛은 접힌 글자 svg 안이 아니라 보이는 다이아 위로 지나가야 한다(PR #239 검토 P2).
  test('좁은 폭 360 — 보이는 다이아 위로 지나가고, 숨은 PC 인스턴스는 한 번도 안 움직인다', async ({ page }) => {
    test.setTimeout(45_000);
    await recordGlint(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    const visible = page.locator(GLINT).filter({ visible: true });
    await visible.first().waitFor({ state: 'visible', timeout: 10_000 });
    await expect(visible).toHaveCount(1);
    const box = await visible.boundingBox();
    expect(box && Math.round(box.width)).toBe(24); // 다이아만 남은 로고 상자(w-6)
    // 마스크의 글자 몫은 보이는 글자 층과 같이 접힌다 — 다이아 몫만 남는다
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-testid="logo-glint"] mask path')]
      .filter((p) => p.getClientRects().length > 0).length)).toBe(0);
    await expect.poll(() => runCount(page, 0), { timeout: PERIOD + 5_000 }).toBeGreaterThan(0); // 다이아(x 9.18~29) 위를 지났다
    // 숨은 인스턴스(display:none 헤더)는 반복 시계가 IntersectionObserver 로 빼낸다 — 이동량이 대기 위치에서 한 번도 안 바뀐다
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-testid="logo-glint"]')]
      .filter((s) => !s.getClientRects().length)
      .map((s) => (s.querySelector('linearGradient') as SVGLinearGradientElement).gradientTransform.animVal.getItem(0).matrix.e)))
      .toEqual([-18]);
  });

  // 장식은 입력에 양보한다 — 마스크 래스터가 프레임 간격을 늘리는 저사양 CI 에서 눌림(:active) 프레임이 밀려 press-align ① 이 act=0 으로 실패했다(PR #239).
  // 첫 터치가 오면 빛은 2 프레임 안에 대기 위치여야 한다. touchCancel 로 끝내 탭(click)이 홈의 무엇도 열지 않게 한다. 그 회차만 멈추고 다음 주기엔 다시 지나간다.
  test('재생 중 CDP touchStart → 2 rAF 안에 대기 위치 · 다음 주기에 다시', async ({ page }) => {
    test.setTimeout(60_000);
    await recordGlint(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(GLINT).first().waitFor({ state: 'attached', timeout: 10_000 });
    await waitRunning(page); // 실제로 재생 중 — 끝난 뒤의 대기 위치로 거짓 통과하지 않게
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 500 }] });
    const left = await page.evaluate(() => new Promise<number | null>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const svg = [...document.querySelectorAll('[data-testid="logo-glint"]')].find((s) => s.getClientRects().length > 0);
        const t = svg?.querySelector('linearGradient')?.gradientTransform.animVal;
        resolve(t && t.numberOfItems ? t.getItem(0).matrix.e : null);
      }))));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(left, '첫 입력 뒤에도 빛이 글자 위에 남아 눌림 프레임과 래스터를 다툰다').toBeLessThanOrEqual(REST);
    const n = await runCount(page);
    await expect.poll(() => runCount(page), { timeout: PERIOD + 4_000 }).toBeGreaterThan(n); // 다음 주기
  });

  // 문서가 숨으면(다른 앱·다른 탭) 반복을 멈춘다 — 안 보이는 곳에서 래스터를 돌리지 않는다. 다시 보이면 새 주기로.
  // 헤드리스는 뒤 탭도 visible 로 잡혀 진짜로 숨길 수 없다(motion-census-1009 NOT_RUN) — visibilityState 를 덮고 이벤트를 쏜다(앱은 이 둘만 본다).
  test('문서 숨김 — 지나가던 빛을 거두고 숨은 동안 0회 · 다시 보이면 재개', async ({ page }) => {
    test.setTimeout(60_000);
    await recordGlint(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(GLINT).first().waitFor({ state: 'attached', timeout: 10_000 });
    await waitRunning(page);
    const setVis = (v: 'hidden' | 'visible') => page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, v);
    await setVis('hidden');
    await expect.poll(() => glintX(page), { timeout: 500, intervals: [20] }).toBeLessThanOrEqual(REST); // 지나가던 빛을 거뒀다
    const n = await runCount(page);
    await page.waitForTimeout(PERIOD + 2_000);
    expect(await runCount(page), '숨은 동안 회차가 돌았다').toBe(n);
    await setVis('visible');
    await expect.poll(() => runCount(page), { timeout: 3_000 }).toBeGreaterThan(n); // 새 주기의 첫 회차(350ms 뒤)
  });

  test('reduced-motion(로드 때) — 청크도 안 받고 그리지 않는다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let asked = 0;
    page.on('request', (r) => { if (/\/assets\/LogoGlint-/.test(r.url())) asked++; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true }).waitFor();
    for (let i = 0; i < 25; i++) { // 첫 회차(350ms)·수명(850ms)보다 길게
      expect(await page.locator(GLINT).count()).toBe(0);
      await page.waitForTimeout(100);
    }
    expect(asked, '동작 줄이기인데 글린트 청크를 받았다').toBe(0);
  });

  test('reduced-motion(도중에 켬) — 지나가던 빛을 거두고 그 뒤 0회', async ({ page }) => {
    test.setTimeout(60_000);
    await recordGlint(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(GLINT).first().waitFor({ state: 'attached', timeout: 10_000 });
    await waitRunning(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => glintX(page), { timeout: 1_000, intervals: [20] }).toBeLessThanOrEqual(REST);
    const n = await runCount(page);
    await page.waitForTimeout(PERIOD + 2_000);
    expect(await runCount(page), '동작 줄이기 뒤에 회차가 돌았다').toBe(n);
  });

  // 장식이 앱을 넘어뜨리면 안 된다 — 청크를 못 받거나(끊김·배포 사이 옛 주소가 index.html 로 오는 경우) 그리다 터져도 헤더·탭바는 그대로다(PR #239 검토 P1).
  const failures: [string, (page: Page) => Promise<unknown>][] = [
    ['청크 끊김', (page) => page.route(/\/assets\/LogoGlint-[^/]+\.js/, (r) => r.abort())],
    ['청크 자리에 index.html', (page) => page.route(/\/assets\/LogoGlint-[^/]+\.js/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }))],
    // React 가 <image> 속성을 setAttribute 로 쓰는 커밋 단계에서 던지게 한다 — 헤더 첫 화면에 SVG <image> 는 글린트 마스크뿐이다
    ['그리다 오류', (page) => page.addInitScript(() => {
      SVGImageElement.prototype.setAttribute = () => { throw new Error('glint-e2e'); };
    })],
  ];
  for (const [name, inject] of failures) {
    test(`${name} — 앱은 그대로, 글린트만 없다`, async ({ page }) => {
      await inject(page);
      let asked = 0;
      page.on('request', (r) => { if (/\/assets\/LogoGlint-/.test(r.url())) asked++; });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await expect.poll(() => asked, { timeout: 10_000 }).toBeGreaterThan(0); // 실패 경로를 실제로 탔다
      await page.waitForTimeout(1_500);
      await expect(page.getByText('일시적인 문제가 발생했습니다')).toHaveCount(0);
      await expect(page.locator(HEADER)).toBeVisible();
      await expect(page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true })).toHaveCount(1);
      await expect(page.locator(TABBAR)).toBeVisible(); // 맨 nav 는 본문 푸터 nav 도 잡아 탭바가 없어도 통과했다
      await expect(page.locator(GLINT)).toHaveCount(0);
    });
  }

  // 다이아만 보일 때(라이트 · <373) 빛이 다이아 위에 머무는 시간 — 글자까지 가는 범위·곡선 그대로면 82~101ms 라 '반짝' 으로 읽혔다(review-239b P3-a).
  // 재생이 시작되면 SMIL 시계를 멈추고 시작점부터 10ms 씩 되감아 띠 위치를 읽는다(타이머·프레임 속도와 무관하게 결정적).
  // 밝은 띠가 다이아(x 9.18~29.18) 위에 있는 구간은 이동량 −10~12 다(띠 기울기·정지점에서 계산한 평균 흰빛 기준 — 검토 실측 82~101ms 를 같은 기준으로 재현한 값).
  // 음성 대조(2026-10-09): LogoGlint 의 '다이아만' 분기를 지우면 360·라이트가 ≈100ms 로 실패, 분기 조건을 항상 참으로 바꾸면 390 다크의 끝점 94 가 실패.
  const shine = (page: Page) => page.evaluate(() => new Promise<{ ms: number; end: number }>((resolve) => {
    const tick = () => {
      const svg = [...document.querySelectorAll<SVGSVGElement>('[data-testid="logo-glint"]')].find((s) => s.getClientRects().length > 0);
      const a = svg?.querySelector('animateTransform') as SVGAnimationElement | null;
      const g = svg?.querySelector('linearGradient') as SVGLinearGradientElement | null;
      let start: number | null = null;
      try { start = a ? a.getStartTime() : null; } catch { /* 아직 시작 전 */ }
      if (!svg || !g || start === null) { requestAnimationFrame(tick); return; }
      svg.pauseAnimations();
      let ms = 0;
      for (let t = 0; t < 850; t += 10) {
        svg.setCurrentTime(start + t / 1000);
        const x = g.gradientTransform.animVal.getItem(0).matrix.e;
        if (x >= -10 && x <= 12) ms += 10;
      }
      // 끝점은 활성 구간의 마지막 순간(849ms)에서 읽는다 — fill="remove" 라 850ms 정각에는 이미 대기 위치(−18)로 돌아가 있다
      svg.setCurrentTime(start + 0.849);
      const end = g.gradientTransform.animVal.getItem(0).matrix.e;
      resolve({ ms, end });
    };
    tick();
  }));
  for (const [w, theme, gemOnly] of [[360, 'dark', true], [390, 'light', true], [390, 'dark', false]] as const) {
    test(`${w} ${theme} — ${gemOnly ? '다이아만: 빛이 다이아 위에 400ms 이상' : '글자까지: 범위 그대로(끝 94)'}`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* 차단 환경 */ } }, theme);
      await page.setViewportSize({ width: w, height: 844 });
      await page.goto('/');
      await page.locator(GLINT).first().waitFor({ state: 'attached', timeout: 10_000 });
      const r = await shine(page);
      if (gemOnly) {
        expect(r.ms, '다이아 위 밝은 띠 체류(ms)').toBeGreaterThanOrEqual(400);
        expect(r.ms).toBeLessThanOrEqual(500);
        expect(r.end, '끝에서는 다이아를 벗어나 있어야 대기 위치로 돌아갈 때 튀지 않는다').toBeGreaterThan(16);
      } else {
        expect(r.end).toBeCloseTo(94, 0);
      }
    });
  }
});
