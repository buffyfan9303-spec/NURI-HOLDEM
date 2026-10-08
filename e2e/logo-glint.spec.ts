// 헤더 로고 글린트(2026-10-08 오너 "메인에 최고의 모션 딱 1개") — 첫 표시에 빛 한 줄기가 한 번 지나간다.
//
// 지키는 것:
//   ① 레이아웃 0 영향 — 글린트가 있는 동안·지나가는 중·지운 뒤 헤더·로고·탭바 상자가 0px 도 안 바뀐다.
//   ② 한 번만 — 끝나면 노드가 사라지고, 새로고침해도 같은 세션에선 다시 안 돈다.
//   ③ reduced-motion — 아예 그리지 않는다(세션 표시도 안 남긴다).
//   ④ 입력에 양보 — 재생 중 첫 터치가 오면 2 프레임 안에 노드가 없다(저사양 CI 에서 눌림 프레임이 래스터에 밀리지 않게).
// ③ 만 있으면 글린트가 통째로 고장 나도 초록이다 — 그래서 ① 이 "실제로 생겼고 실제로 움직였다" 를 먼저 단언한다.
// 음성 대조(2026-10-08): NuriClassicLogo 의 reduced-motion 판정 줄을 지우면 ③ 이, LogoGlint 의 setOn(false) 타이머를 지우면 ② 가 실패했다.
// ④ 는 입력 양보 이전 빌드(90a36485)에서 3/3 실패(남은 노드 1), 수정 빌드에서 통과.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const GLINT = '[data-testid="logo-glint"]';

/** 홈 본문은 데이터가 들어오며 자라므로 빼고, 셸(헤더·헤더 버튼·로고·탭바)만 잰다. */
const shellBoxes = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('header, header button, [aria-label="NURI HOLDEM"], nav')].map((e) => {
    const r = e.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].join(',');
  }));

/** 보이는 로고 글린트의 그라디언트 이동량(SMIL animVal). 시작 전 null. */
const glintX = (page: Page) => page.evaluate(() => {
  const g = [...document.querySelectorAll('[data-testid="logo-glint"] linearGradient')].pop() as SVGLinearGradientElement | undefined;
  const t = g?.gradientTransform.animVal;
  return t && t.numberOfItems ? t.getItem(0).matrix.e : null;
});

test.describe('헤더 로고 글린트', () => {
  test('첫 표시 1회 — 셸 상자 불변 · 끝나면 제거 · 새로고침해도 재생 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(GLINT).first().waitFor({ state: 'attached', timeout: 10_000 });
    const before = await shellBoxes(page);
    // 시작 전 띠는 상자(x 9.18~) 밖에 있어야 한다 — 기본값이 비면 begin 전 항등 위치(다이아 한가운데)에 멈춰 보였다(PR #239 검토 P2)
    expect(await page.evaluate(() => (document.querySelector('[data-testid="logo-glint"] linearGradient') as SVGLinearGradientElement)
      .gradientTransform.baseVal.getItem(0).matrix.e)).toBeLessThanOrEqual(-18);

    await expect.poll(() => glintX(page), { timeout: 3_000 }).toBeGreaterThan(20); // 실제로 글자 위를 지나는 중
    const mid = await shellBoxes(page);

    await expect(page.locator(GLINT)).toHaveCount(0, { timeout: 5_000 });
    const after = await shellBoxes(page);
    expect(mid).toEqual(before);
    expect(after).toEqual(before);
    await expect(page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true })).toHaveCount(1);

    await page.reload();
    await page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true }).waitFor();
    for (let i = 0; i < 25; i++) { // 글린트 수명(350 + 1300ms)보다 길게 — 한 번이라도 생기면 실패
      expect(await page.locator(GLINT).count()).toBe(0);
      await page.waitForTimeout(100);
    }
  });

  // 360(갤럭시)·320 은 글자 층이 접히고 다이아만 남는다 — 빛은 접힌 글자 svg 안이 아니라 보이는 다이아 위로 지나가야 한다(PR #239 검토 P2).
  test('좁은 폭 360 — 보이는 다이아 위로 지나가고, 숨은 PC 인스턴스는 아무것도 안 그린다', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    const glint = page.locator(GLINT);
    await glint.first().waitFor({ state: 'attached', timeout: 10_000 });
    await expect(glint).toHaveCount(1); // 헤더의 PC 인스턴스(display:none)는 빠진다
    await expect(glint).toBeVisible();
    const box = await glint.boundingBox();
    expect(box && Math.round(box.width)).toBe(24); // 다이아만 남은 로고 상자(w-6)
    // 마스크의 글자 몫은 보이는 글자 층과 같이 접힌다 — 다이아 몫만 남는다
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-testid="logo-glint"] mask path')]
      .filter((p) => p.getClientRects().length > 0).length)).toBe(0);
    await expect.poll(() => glintX(page), { timeout: 3_000 }).toBeGreaterThan(0); // 다이아(x 9.18~29) 위를 지나는 중
    await expect(glint).toHaveCount(0, { timeout: 5_000 });
  });

  // 장식은 입력에 양보한다 — 마스크 래스터가 프레임 간격을 늘리는 저사양 CI 에서 눌림(:active) 프레임이 밀려 press-align ① 이 act=0 으로 실패했다(PR #239).
  // 첫 터치가 오면 글린트 노드는 2 프레임 안에 없어야 한다. touchCancel 로 끝내 탭(click)이 홈의 무엇도 열지 않게 한다.
  test('재생 중 CDP touchStart → 2 rAF 안에 글린트 노드 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(GLINT).first().waitFor({ state: 'attached', timeout: 10_000 });
    await expect.poll(() => glintX(page), { timeout: 3_000 }).toBeGreaterThan(20); // 실제로 재생 중 — 끝난 뒤의 0 으로 거짓 통과하지 않게
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 500 }] });
    const left = await page.evaluate(() => new Promise<number>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.querySelectorAll('[data-testid="logo-glint"]').length)))));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(left, '첫 입력 뒤에도 글린트가 남아 눌림 프레임과 래스터를 다툰다').toBe(0);
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
      await expect(page.locator('header').first()).toBeVisible();
      await expect(page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true })).toHaveCount(1);
      await expect(page.locator('nav').filter({ visible: true }).first()).toBeVisible();
      await expect(page.locator(GLINT)).toHaveCount(0);
    });
  }

  // 다이아만 보일 때(라이트 · <373) 빛이 다이아 위에 머무는 시간 — 글자까지 가는 범위·곡선 그대로면 82~101ms 라 '반짝' 으로 읽혔다(review-239b P3-a).
  // 재생이 시작되면 SMIL 시계를 멈추고 시작점부터 10ms 씩 되감아 띠 위치를 읽는다(타이머·프레임 속도와 무관하게 결정적).
  // 밝은 띠가 다이아(x 9.18~29.18) 위에 있는 구간은 이동량 −10~12 다(띠 기울기·정지점에서 계산한 평균 흰빛 기준 — 검토 실측 82~101ms 를 같은 기준으로 재현한 값).
  // 음성 대조(2026-10-09): LogoGlint 의 '다이아만' 분기를 지우면 360·라이트가 ≈100ms 로 실패, 분기 조건을 항상 참으로 바꾸면 390 다크의 끝점 94 가 실패.
  const shine = (page: Page) => page.evaluate(() => new Promise<{ ms: number; end: number }>((resolve) => {
    const tick = () => {
      const svg = [...document.querySelectorAll<SVGSVGElement>('[data-testid="logo-glint"]')].pop();
      const a = svg?.querySelector('animateTransform') as SVGAnimationElement | null;
      const g = svg?.querySelector('linearGradient') as SVGLinearGradientElement | null;
      let start: number | null = null;
      try { start = a ? a.getStartTime() : null; } catch { /* 아직 시작 전 */ }
      if (!svg || !g || start === null) { requestAnimationFrame(tick); return; }
      svg.pauseAnimations();
      let ms = 0, end = 0;
      for (let t = 0; t <= 850; t += 10) {
        svg.setCurrentTime(start + t / 1000);
        const x = g.gradientTransform.animVal.getItem(0).matrix.e;
        if (x >= -10 && x <= 12) ms += 10;
        end = x;
      }
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
        expect(r.end, '끝에서는 다이아를 벗어나 있어야 지울 때 튀지 않는다').toBeGreaterThan(16);
      } else {
        expect(r.end).toBeCloseTo(94, 0);
      }
    });
  }

  test('reduced-motion — 글린트를 그리지 않는다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true }).waitFor();
    for (let i = 0; i < 25; i++) { // 위와 같은 창
      expect(await page.locator(GLINT).count()).toBe(0);
      await page.waitForTimeout(100);
    }
    expect(await page.evaluate(() => sessionStorage.getItem('nuri-glint'))).toBeNull();
  });
});
