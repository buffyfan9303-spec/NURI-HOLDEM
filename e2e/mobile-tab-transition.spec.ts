// 2026-09-20: Samsung compresses the main-tab snapshot vertically; Chrome flashes
// overlapping captures. Mobile navigation must render the live pane, including on
// revisit/back. This cannot emulate Samsung's GPU.
// 🔵 2026-09-24 MOTION-UNIFY: desktop main tabs no longer use a View Transition either — every width takes the
//   same cover (src/lib/tabCover.ts, frames locked by e2e/motion-unify.spec.ts MU2). So this test now expects
//   zero page snapshots at 390·1023·1024 (it used to expect desktop VT as a positive control; R2 below keeps a
//   desktop positive control on a path that still uses VT — the venue page open).
// Run against a fresh preview: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/mobile-tab-transition.spec.ts
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';
import { mockSchedules, kstDay } from './_schedules';

// 🔴 2026-09-21 실측 — 여기 있던 `test.use({ reducedMotion: 'no-preference' })` 를 지웠다.
//   **런타임에 아무것도 하지 않는다**: `reducedMotion` 은 playwright-core 의 *브라우저 컨텍스트* 옵션이고
//   `playwright/types/test.d.ts` 의 테스트 옵션에는 없다. 실험: `'reduce'` 를 줘도
//   `matchMedia('(prefers-reduced-motion: reduce)').matches` 가 **false** 였다(기본값과 동일).
//   즉 '모션 설정을 고정했다' 고 믿게 만드는 죽은 줄이었다. 기본값이 마침 no-preference 라 동작은 그대로다.
//   ⚠ 나중에 `reduce` 가 정말 필요하면 `test.use` 말고 config 의 contextOptions 나
//     `browser.newContext({ reducedMotion: 'reduce' })` 로 줘야 한다.

for (const width of [390, 1023, 1024]) {
  test(`main tab snapshots at ${width}px: no page snapshot at any width (MOTION-UNIFY)`, async ({ page }) => {
    test.setTimeout(60_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      const native = document.startViewTransition.bind(document);
      let calls = 0;
      Object.defineProperty(window, '__mainTabVtCalls', { get: () => calls });
      document.startViewTransition = (...args) => {
        calls += 1;
        return native(...args);
      };
    });
    await page.goto('/');
    await dismissOverlays(page);
    const count = () => page.evaluate(() => Reflect.get(window, '__mainTabVtCalls') as number);
    const pane = (tab: string) => page.locator(`.tab-pane[data-tab="${tab}"]`);
    await expect(pane('home')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const navigate = async (tab: 'home' | 'tools') => {
      const label = tab === 'home' ? '홈' : 'GTO';
      const nav = width < 1024
        ? page.getByRole('navigation', { name: '하단 내비게이션' })
        : page.locator('[data-stack-tabbar]');
      const button = nav.getByRole(width < 1024 ? 'button' : 'tab', { name: label, exact: true });
      if (width < 1024) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart', touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }],
        });
        // Real touch duration: instantaneous tap misses active-state interactions.
        await page.waitForTimeout(130);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await button.click();
      }
      await expect(pane(tab)).toBeVisible();
      await expect(pane(tab === 'home' ? 'tools' : 'home')).not.toBeVisible();
    };

    await navigate('tools');
    await expect(page.getByTestId('tools-featured')).toBeVisible();
    await navigate('home');
    const beforeRevisit = await count();
    await navigate('tools');
    await expect(page.getByTestId('tools-featured')).toBeVisible();
    if (width < 1024) {
      expect(await count(), 'mobile navigation created a page snapshot').toBe(0);
      await page.evaluate(() => history.back());
      await expect(pane('home')).toBeVisible();
      expect(await count(), 'mobile back navigation created a page snapshot').toBe(0);
      await page.evaluate(() => {
        for (const tab of ['tools', 'home']) {
          window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: tab }));
        }
      });
      await expect(pane('home')).toBeVisible();
      await expect(pane('tools')).not.toBeVisible();
      expect(await count(), 'rapid mobile navigation created a page snapshot').toBe(0);
      // Match the current viewport at navigation time, not a stale mount-time value.
      await page.setViewportSize({ width: 1024, height: 844 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'tools' })));
      await expect(pane('tools')).toBeVisible();
      expect(await count(), 'desktop navigation created a page snapshot (MOTION-UNIFY: cover only)').toBe(0);
    } else {
      expect(await count(), 'desktop revisit created a page snapshot (MOTION-UNIFY: cover only)').toBe(beforeRevisit);
      const desktopCount = await count();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'home' })));
      await expect(pane('home')).toBeVisible();
      expect(await count(), 'resizing to mobile retained the desktop snapshot path').toBe(desktopCount);
    }
    await cdp.detach();
  });
}

// ── 요구 B (2026-09-22): '내 정보' 열기·닫기도 모바일에서는 live DOM ──────────────
//
// 증상: 삼성 인터넷에서 '내 정보'를 열고 X 로 닫을 때 배경 홈이 순간 눌린다.
// 원인(코드): `openMeCb` 의 warm open 과 `closeMeCb` 가 **모바일에서도** document View Transition 을
//   만든다. 그 스냅샷이 old/new 의 width·height·transform 을 보간하므로 문서 높이가 다른 두 판이
//   겹치면 배경이 눌렸다 펴진다. 일정 포스터 `f37972b` 와 **같은 계열**이고 처방도 같다.
// 이 하네스는 삼성 GPU 를 흉내내지 못한다 — 여기서 재는 것은 '스냅샷을 만들었는가' 하나다.
// 음성 대조: App.tsx 의 모바일 분기를 지우면 warm open / X close 에서 VT 가 생겨 이 검사가 빨개진다.
test.describe('me page return snapshots', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  for (const width of [360, 390, 1024]) {
    const mobile = width < 1024;
    test(`me open/close keeps ${mobile ? 'live DOM' : 'desktop transition'} at ${width}px`, async ({ page }) => {
      test.setTimeout(60_000);
      await stabilizeBackstack(page);
      await stubLogin(page);
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => {
        const native = document.startViewTransition?.bind(document);
        let calls = 0;
        Object.defineProperty(window, '__meVtCalls', { get: () => calls });
        if (native) document.startViewTransition = (...args) => { calls += 1; return native(...args); };
      });
      await page.goto('/');
      await dismissOverlays(page);

      // 진입 동선은 **헤더 아바타 메뉴 → '내 정보 열기'** 다(subtab-motion·account-isolation 과 같은 경로).
      // 메뉴 버튼을 건너뛰면 '내 정보 열기' 가 DOM 에 없어 검사가 대상에 도달하지 못한다.
      const menuBtn = page.locator('button[aria-label$="메뉴"]').first();
      const openBtn = page.getByRole('button', { name: '내 정보 열기' });
      const meTitle = page.locator('h1', { hasText: '내 정보' });
      const closeBtn = page.locator('header:has(h1:text-is("내 정보")) button[aria-label="닫기"]');
      const calls = () => page.evaluate(() => Reflect.get(window, '__meVtCalls') as number);
      // PW 의 click 은 대상까지 자동 스크롤한다 — 헤더가 접힌(느린 CPU) 상태면 +56px 밀어 측정을 오염시켰다(CI 전용 실패, 2026-09-24). CLAUDE.md 참고 메모.
      const openMe = async () => { await menuBtn.click(); await expect(openBtn).toBeVisible(); await openBtn.evaluate((b) => (b as HTMLElement).click()); await expect(meTitle).toBeVisible(); };
      const settle = () => page.waitForFunction(() => !document.getAnimations().some((a) =>
        (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition')));
      // 배경 홈의 기하 — 눌림은 여기서 보인다.
      const homeBox = async () => page.evaluate(() => {
        const el = document.querySelector('.tab-pane[data-tab="home"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), t: getComputedStyle(el).transform, y: window.scrollY };
      });

      // 🔴 대상 도달 단언 — 진입점이 없으면 '0회라서 통과' 하는 빈 검사가 된다.
      await expect(menuBtn, '헤더 아바타 메뉴를 못 찾았다 — 검사가 대상에 도달하지 못했다').toBeVisible();
      // 🔴 측정 전에 홈 문서 높이를 **안정시킨다.** 일정·배너가 비동기로 들어오는 동안 재면
      //   문서가 길어졌다 짧아지며 브라우저가 scrollY 를 깎는다(CLAUDE.md '문서가 짧아지면 scrollY 클램프').
      //   그걸 '전환이 스크롤을 튀게 했다' 로 잘못 읽으면 영원히 흔들리는 검사가 된다 — 실제로 360px 에서 13px 이 그랬다.
      await page.waitForFunction(() => {
        const w = window as unknown as { __hPrev?: number; __hHit?: number };
        const h = document.body.scrollHeight;
        if (w.__hPrev === h) { w.__hHit = (w.__hHit ?? 0) + 1; } else { w.__hPrev = h; w.__hHit = 0; }
        return (w.__hHit ?? 0) >= 3;
      }, undefined, { timeout: 15_000 });
      await page.evaluate(() => window.scrollTo(0, 140));
      // 🔴 스크롤도 **정착한 뒤에** 기준을 잡는다. `scrollTo` 직후 곧바로 재면 헤더 축소(useScrollY 의 rAF)와
      //   클램프가 아직 반영되지 않은 과도기 값을 기준으로 삼게 되고, 나중 비교에서 그 차이가
      //   '전환이 스크롤을 튀게 했다' 로 잘못 보고된다(실측 13px 이 그랬다 — 프로브로 재니 실제 보존값은 정확했다).
      await page.waitForFunction(() => {
        const w = window as unknown as { __yPrev?: number; __yHit?: number };
        const y = window.scrollY;
        if (w.__yPrev === y) { w.__yHit = (w.__yHit ?? 0) + 1; } else { w.__yPrev = y; w.__yHit = 0; }
        return (w.__yHit ?? 0) >= 3;
      }, undefined, { timeout: 10_000 });
      expect(await page.evaluate(() => window.scrollY), '스크롤이 안 걸렸다 — 스크롤 축을 못 재는 검사가 된다').toBeGreaterThan(0);
      const before = await homeBox();
      expect(before, '홈 판을 못 찾았다 — 검사가 아무것도 재지 않는다').not.toBeNull();

      // ① 첫 열림 — 양쪽 모두 VT 0 (lazy Suspense 때문에 원래부터 startTransition 이다)
      //    메뉴 열기 자체가 VT 를 쓸 수 있으므로 **절대값이 아니라 증분**으로 센다.
      const beforeOpen = await calls();
      await openMe();
      await settle();
      expect(await calls(), '첫 열림은 어느 폭에서도 스냅샷을 만들지 않는다').toBe(beforeOpen);

      // ② X 닫기 — 모바일 0, PC +1
      const beforeClose = await calls();
      await closeBtn.click();
      await expect(meTitle).toBeHidden();
      await settle();
      expect(await calls(), `X 닫기의 VT 호출 수가 기대와 다르다(${width}px)`).toBe(beforeClose + (mobile ? 0 : 1));

      // ③ warm 재열림 — 모바일 0, PC +1. 여기가 요구 B 의 핵심이다.
      const beforeWarm = await calls();
      await openMe();
      await settle();
      expect(await calls(), `warm 재열림의 VT 호출 수가 기대와 다르다(${width}px)`).toBe(beforeWarm + (mobile ? 0 : 1));

      // ④ history back 으로 닫기 — 이미 live DOM 경로라 어느 폭에서도 늘지 않는다
      const beforeBack = await calls();
      await page.evaluate(() => history.back());
      await expect(meTitle).toBeHidden();
      await settle();
      expect(await calls(), 'history back 은 원래 live DOM 경로다').toBe(beforeBack);

      // ⑤ 배경 홈에 눌림의 흔적이 없고 스크롤도 제자리다
      //
      // 🔴 여기서 **높이·폭 절대 비교는 쓰지 않는다.** 처음에 그렇게 썼다가 390/1024 에서 208px 차이로
      //   빨개졌는데, 원인은 전환 눌림이 아니라 그 사이에 **홈 콘텐츠가 비동기로 로드된 것**이었다
      //   (일정·배너가 뒤늦게 들어와 문서가 길어진다). 360px 만 우연히 타이밍이 맞아 통과했다 —
      //   즉 그 단언은 '눌림' 이 아니라 '로딩 속도' 를 재고 있었고, 그대로 뒀으면 영원히 흔들리는 검사가 된다.
      // 눌림의 실제 지표는 두 가지이고 둘 다 아래에서 잠근다:
      //   ⓐ 배경에 남은 transform(스냅샷이 보간하던 scale/translate)
      //   ⓑ `::view-transition*` pseudo 애니메이션의 존재(⑥)
      //   그리고 이 검사의 핵심 계약인 **VT 호출 수**(②③)는 위에서 이미 RED→GREEN 으로 증명된다.
      const after = await homeBox();
      expect(after!.t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(after!.t), `배경 홈에 transform 이 남았다: ${after!.t}`).toBe(true);
      // 🔴 스크롤 보존은 **모바일(live DOM 경로)에만** 건다.
      //   PC 는 이 요구에서 손대지 않은 기존 View Transition 경로이고, 거기서는 닫을 때 scrollY 가
      //   140 → 6 으로 떨어진다(1024px 실측 134px). 내 변경 전과 같은 동작이므로 여기서 회귀로 세지 않는다.
      //   PC 의 그 점프는 별개 사안이다 — 이 검사로 끌고 오면 요구 B 의 모바일 축이 가려진다.
      if (mobile) {
        expect(Math.abs(after!.y - before!.y), '닫은 뒤 스크롤이 튀었다').toBeLessThanOrEqual(1);
      }

      // ⑥ 남은 ::view-transition pseudo 애니메이션 0
      const pseudo = await page.evaluate(() => document.getAnimations()
        .filter((a) => (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition')).length);
      expect(pseudo, '전환 의사요소 애니메이션이 남아 있다').toBe(0);
    });
  }

  // 경로 선택이 **누르는 그 시점**의 폭으로 정해지는지 — 열고 나서 폭이 바뀌어도 맞아야 한다.
  test('resize while open picks the path at close time', async ({ page }) => {
    test.setTimeout(60_000);
    await stabilizeBackstack(page);
    await stubLogin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const native = document.startViewTransition?.bind(document);
      let calls = 0;
      Object.defineProperty(window, '__meVtCalls', { get: () => calls });
      if (native) document.startViewTransition = (...args) => { calls += 1; return native(...args); };
    });
    await page.goto('/');
    await dismissOverlays(page);
    const menuBtn = page.locator('button[aria-label$="메뉴"]').first();
    const openBtn = page.getByRole('button', { name: '내 정보 열기' });
    const meTitle = page.locator('h1', { hasText: '내 정보' });
    const closeBtn = page.locator('header:has(h1:text-is("내 정보")) button[aria-label="닫기"]');
    const calls = () => page.evaluate(() => Reflect.get(window, '__meVtCalls') as number);
    const settle = () => page.waitForFunction(() => !document.getAnimations().some((a) =>
      (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition')));

    await expect(menuBtn, '헤더 아바타 메뉴를 못 찾았다 — 검사가 대상에 도달하지 못했다').toBeVisible();
    await menuBtn.click();            // 390 에서 첫 열림
    await openBtn.click();
    await expect(meTitle).toBeVisible();
    await settle();
    await page.setViewportSize({ width: 1280, height: 844 });   // 열린 채로 PC 로
    const beforeClose = await calls();
    await closeBtn.click();
    await expect(meTitle).toBeHidden();
    await settle();
    expect(await calls(), '열 때가 아니라 닫는 시점의 폭으로 경로가 정해져야 한다').toBe(beforeClose + 1);
  });
});

// Samsung Internet: poster return must use the live home on mobile, too.
// Negative control: the pre-fix production build creates one VT on the first close.
test.describe('schedule detail return snapshots', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });
  for (const width of [390, 1024]) {
    test(`home poster X/back and resize at ${width}px`, async ({ page }) => {
      test.setTimeout(60_000);
      await stabilizeBackstack(page);
      await mockSchedules(page);
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => {
        const native = document.startViewTransition.bind(document);
        let calls = 0;
        Object.defineProperty(window, '__scheduleVtCalls', { get: () => calls });
        document.startViewTransition = (...args) => { calls += 1; return native(...args); };
      });
      await page.goto('/');
      await dismissOverlays(page);
      const home = page.locator('.tab-pane[data-tab="home"]');
      const card = home.getByRole('button').filter({ hasText: '목킹 데일리 A' });
      const detail = page.getByRole('dialog', { name: '전체화면 보기', exact: true });
      const count = () => page.evaluate(() => Reflect.get(window, '__scheduleVtCalls') as number);
      const settle = () => page.waitForFunction(() => !document.getAnimations().some((a) =>
        (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition')));
      await expect(card).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 140));
      // Let the scroll-compressed header settle before measuring the return position.
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      for (const back of [false, true]) {
        await card.click();
        await expect(detail).toBeVisible();
        await expect(detail.getByRole('heading', { name: '목킹 데일리 A', exact: true })).toBeVisible();
        await settle();
        const y = await page.evaluate(() => window.scrollY);
        const before = await home.boundingBox();
        const calls = await count();
        if (back) await page.evaluate(() => history.back());
        else await detail.locator('button[aria-label="닫기"]:visible').first().click();
        await expect(detail).toHaveCount(0);
        await expect(card).toBeVisible();
        await settle();
        expect(await count(), 'mobile poster return created a page snapshot').toBe(calls + (width < 1024 ? 0 : 1));
        if (width < 1024) expect(await count(), 'mobile poster reopen created a page snapshot').toBe(0);
        expect(Math.abs(await page.evaluate(() => window.scrollY) - y)).toBeLessThanOrEqual(1);
        const after = await home.boundingBox();
        expect(after!.width).toBeCloseTo(before!.width, 1);
        expect(after!.height).toBeCloseTo(before!.height, 1);
      }
      expect(await count()).toBe(width < 1024 ? 0 : 3);

      // Select the path at interaction time, including a resize while detail is open.
      await card.click();
      await expect(detail).toBeVisible();
      await settle();
      const calls = await count();
      await page.setViewportSize({ width: width < 1024 ? 1024 : 390, height: 844 });
      await detail.locator('button[aria-label="닫기"]:visible').first().click();
      await expect(detail).toHaveCount(0);
      await expect(card).toBeVisible();
      await settle();
      expect(await count()).toBe(calls + (width < 1024 ? 1 : 0));
    });
  }
});

// ── 2026-09-22: 여기 있던 N1 / M1 / C1 을 아래 R3 / R2 계약으로 **교체**했다 ────────
//
// 폐기한 것과 이유(역사를 지우지 않으려고 남긴다):
//   · N1 — "새 탭 본문이 오른쪽 6px 에서 170ms 동안 들어온다" 를 **요구**했다.
//     이번 오너 결정으로 그 모션 자체가 결함이다. 이 계약을 두면 결함을 필수 기능으로 잠근다.
//   · M1 — 그 모션의 cohort 가 분절·역행 없이 같이 들어오는지 봤다. 모션이 없으니 잴 대상이 없다.
//   · C1 — 그 모션 중간/종료의 카드 픽셀 색만 봤다. 커뮤니티 ROI 한 곳, 85ms 에 멈춘 Chromium 프레임이라
//     오너의 삼성 증상이 남아 있는데도 초록이었다. 원인(transform 합성)을 구조로 막는 쪽으로 바꾼다.
//
// 대체 계약의 원칙: **색을 재지 않고 구조를 잰다.** Chromium GPU 가 밝기 차를 안 보여 줘도
//   "본문에 새 애니메이션이 0개" 는 브라우저와 무관하게 성립한다.

/** 목적지 pane 안에서 **이번 이동 때문에 새로 시작한** 애니메이션을 센다.
 *  · WAAPI(`Element.animate`)와 CSS transition/animation 을 모두 본다.
 *  · nav 의 작은 알약·아이콘은 `.tab-pane` 밖이라 애초에 잡히지 않는다(허용).
 *  · 데이터 자체의 국소 애니메이션(스켈레톤 pulse 등)만 allowlist 로 뺀다. `*` 로 느슨하게 열지 않는다. */
const BODY_PRESENTATION_PROPS = [
  'transform', 'translate', 'scale', 'rotate', 'opacity', 'filter',
  'backdrop-filter', 'clip-path', 'mix-blend-mode', 'background-color',
];
/** 데이터 로딩 표시처럼 **이동과 무관하게 항상 도는** 국소 애니메이션. 이름을 정확히 적는다. */
const LOCAL_DATA_ANIMATIONS = ['pulse', 'nuri-skeleton', 'marquee', 'spin'];
/**
 * 스크롤 구동 리빌(`.reveal` / `reveal-up`, `src/index.css` 의 `animation-timeline: view()`).
 *
 * 🔴 **면제가 아니다.** 이름만 빼면 그 경로가 영원히 무검사가 된다(이 저장소 최다 함정).
 *   이건 탭 이동이 **시작**하는 연출이 아니라 스크롤 위치가 정하는 값이라 위 0건 계약에서는 빼되,
 *   대신 아래에서 **정착 상태를 직접 잰다**: 탭이 열린 뒤 화면 안에 있는 리빌 요소는
 *   `transform: none` · `opacity: 1` 이어야 한다. 탭 전환 순간에 눈에 보이는 변화를 남기면 빨개진다.
 *   (화면 밖 요소는 진행도 0% 라 일부러 흐린 상태다 — 그래서 '보이는 것' 만 잰다.)
 */
const SCROLL_DRIVEN = 'reveal-up';

for (const width of [390, 1023]) {
  test(`🔴 R3 — ${width}px 메인 메뉴 전환에 목적지 본문 애니메이션이 0개다`, async ({ page }) => {
    test.setTimeout(90_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width, height: 844 });
    await mockSchedules(page);
    // 계측은 페이지 스크립트보다 **먼저** 붙어야 첫 호출을 놓치지 않는다.
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const rec: Array<Record<string, unknown>> = [];
      w.__bodyAnims = rec;
      let vt = 0;
      w.__vtCalls = { get count() { return vt; } };
      const nativeVT = document.startViewTransition?.bind(document);
      if (nativeVT) {
        document.startViewTransition = ((cb: () => void) => { vt += 1; return nativeVT(cb); }) as typeof document.startViewTransition;
      }
      const nativeAnimate = Element.prototype.animate;
      Element.prototype.animate = function patched(this: Element, kf: unknown, opts: unknown) {
        try {
          const pane = this.closest?.('.tab-pane');
          if (pane) {
            rec.push({
              via: 'waapi',
              tab: pane.getAttribute('data-tab'),
              cls: (this.getAttribute('class') ?? '').slice(0, 60),
              kf: JSON.stringify(kf).slice(0, 160),
            });
          }
        } catch { /* 계측이 앱을 깨뜨리지 않는다 */ }
        return nativeAnimate.call(this, kf as Keyframe[], opts as KeyframeAnimationOptions);
      } as typeof Element.prototype.animate;
    });
    await page.goto('/');
    await dismissOverlays(page);

    const pane = (tab: string) => page.locator(`.tab-pane[data-tab="${tab}"]`);
    await expect(pane('home')).toBeVisible();

    const cdp = await page.context().newCDPSession(page);
    /** 실제 손가락 — Playwright `click()` 은 누름 0ms 라 `:active`/합성 부류를 재현하지 못한다. */
    const tapNav = async (label: string) => {
      const nav = width < 1024
        ? page.getByRole('navigation', { name: '하단 내비게이션' })
        : page.locator('[data-stack-tabbar]');
      // ⚠ `exact: true` 를 쓰지 않는다 — 라이브 버튼의 접근 이름은 진행 게임 수에 따라
      //   `라이브, 진행 중 1게임` 으로 바뀐다. 대신 **시작 앵커** 정규식으로 좁힌다:
      //   느슨한 부분일치는 다른 버튼을 잡아 조용히 거짓 통과할 수 있다(CLAUDE.md 경고).
      const button = nav.getByRole(width < 1024 ? 'button' : 'tab', { name: new RegExp(`^${label}`) });
      await expect(button, `${label} 버튼을 찾지 못했다 — 하단바 라벨이 바뀌었을 수 있다`)
        .toBeVisible({ timeout: 15_000 });
      const box = await button.boundingBox();
      expect(box, `${label} 버튼의 위치를 잴 수 없다`).not.toBeNull();
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }],
      });
      await page.waitForTimeout(130);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    const MENUS: Array<{ label: string; tab: string }> = [
      { label: '라이브', tab: 'live' },
      { label: '커뮤니티', tab: 'community' },
      { label: 'GTO', tab: 'tools' },
      { label: '캘린더', tab: 'calendar' },
      { label: '홈', tab: 'home' },
    ];

    const findings: string[] = [];
    let visited = 0;

    for (const pass of [1, 2]) { // 1회차 = first/cold, 2회차 = warm 재방문
      for (const m of MENUS) {
        await page.evaluate((props) => {
          const w = window as unknown as Record<string, unknown>;
          (w.__bodyAnims as unknown[]).length = 0;
          // CSS transition/animation 은 getAnimations 로 본다 — 이동 직전 목록을 지문으로 남긴다.
          w.__before = new Set(
            document.getAnimations().map((a) => `${a.id}|${String((a.effect as KeyframeEffect | null)?.target?.className ?? '')}`),
          );
          w.__props = props;
        }, BODY_PRESENTATION_PROPS);

        await tapNav(m.label);
        await expect(pane(m.tab)).toBeVisible({ timeout: 15_000 });
        visited += 1;

        // 정착까지 관찰한다 — 도착 직후 한 프레임만 보면 늦게 시작하는 애니메이션을 놓친다.
        await page.waitForTimeout(500);

        const res = await page.evaluate(([allow, scrollName]) => {
          const w = window as unknown as Record<string, unknown>;
          const waapi = (w.__bodyAnims as Array<Record<string, unknown>>).slice();
          const before = w.__before as Set<string>;
          const props = w.__props as string[];
          const css: string[] = [];
          const scrollDriven: string[] = [];
          for (const a of document.getAnimations()) {
            const eff = a.effect as KeyframeEffect | null;
            const target = eff?.target as Element | null;
            if (!target || !target.closest?.('.tab-pane')) continue;
            const key = `${a.id}|${String(target.className ?? '')}`;
            if (before.has(key)) continue;                       // 이동 전부터 돌던 것
            const name = String((a as unknown as { animationName?: string }).animationName ?? a.id ?? '');
            // 스크롤 구동 리빌 — 0건 계약에서는 빼되 **정착 상태를 대신 잰다**(면제가 아니다).
            if (name.includes(scrollName as string)) {
              const r = target.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0) {
                const cs = getComputedStyle(target);
                // ⚠ `none` 이 아니라 **항등 여부**로 잰다. `fill: both` 애니메이션이 붙어 있으면
                //   정착 상태에서도 computed 값이 `matrix(1, 0, 0, 1, 0, 0)` 이다 — 이동·배율은 0 이다.
                //   우리가 막으려는 것은 '보이는 변화' 이므로 항등은 통과시키고 비항등만 잡는다.
                const identity = cs.transform === 'none' || /^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/.test(cs.transform);
                if (!identity || cs.opacity !== '1') {
                  scrollDriven.push(`${name} on .${String(target.className ?? '').slice(0, 36)} transform=${cs.transform} opacity=${cs.opacity}`);
                }
              }
              continue;
            }
            if ((allow as string[]).some((x) => name.includes(x) || String(target.className ?? '').includes(x))) continue;
            const changed = (eff?.getKeyframes?.() ?? [])
              .flatMap((k) => Object.keys(k))
              .filter((p) => props.includes(p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())));
            if (!changed.length) continue;                        // 표현과 무관한 속성
            css.push(`css:${name || '(anon)'} on .${String(target.className ?? '').slice(0, 40)} [${[...new Set(changed)].join(',')}]`);
          }
          return { waapi, css, scrollDriven };
        }, [LOCAL_DATA_ANIMATIONS, SCROLL_DRIVEN] as [string[], string]);

        for (const a of res.waapi) findings.push(`pass${pass} ${m.label} waapi ${JSON.stringify(a)}`);
        for (const c of res.css) findings.push(`pass${pass} ${m.label} ${c}`);
        for (const s of res.scrollDriven) findings.push(`pass${pass} ${m.label} 스크롤리빌이 정착하지 않았다: ${s}`);
      }
    }

    // 🔴 빈 통과 방지 — 실제로 잴 대상을 돌았는지 먼저 단언한다.
    expect(visited, '메뉴를 한 번도 이동하지 않았다 — 아래 0건은 아무 의미가 없다').toBe(MENUS.length * 2);
    expect(await page.evaluate(() => (window as unknown as { __vtCalls: { count: number } }).__vtCalls.count),
      `${width}px 모바일 메인 탭에서 document View Transition 이 돌았다`).toBe(0);
    expect(findings, `메인 메뉴 전환이 목적지 본문에 애니메이션을 시작했다:\n${findings.join('\n')}`).toEqual([]);
  });
}

// ── R2: 모바일 View Transition 은 **공용 helper 한 곳**에서 막는다 ──────────────────
// caller 마다 가드를 복제하면 새 화면이 또 샌다(2026-09-22 실행서 §4 재발 사슬).
// `handleVenueClick` 이 정확히 그렇게 빠져 있었다 — 아래 (b) 가 그 회귀를 잠근다.
test('🔴 R2 — 모바일은 공용 helper 가 스냅샷을 막고, 데스크톱은 그대로 돈다', async ({ page }) => {
  test.setTimeout(90_000);
  await stabilizeBackstack(page);
  // ⚠ `mockSchedules` 의 기본 행은 `venue_id: null` 이라 매장명이 **버튼이 아니라 span** 으로 그려진다
  //   (`ScheduleCard.tsx` 의 VenueLink 는 onClick 이 없으면 span 이다). 매장 열기 경로를 재려면
  //   venue_id 가 있는 행과 venues 응답이 함께 필요하다 — 핸들러 하나로 준다
  //   (`e2e/schedule-card-clicks.spec.ts` 와 같은 규칙: 겹치면 route.continue 가 조용히 샌다).
  const VENUE_ID = '33333333-3333-4333-8333-333333333333';
  const VENUE_NAME = '전환검증 홀덤펍';
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/rest\/v1\/schedules/.test(url)) {
      return json([{
        id: 'cccccccc-0000-4000-8000-000000000001', title: '전환검증 데일리',
        venue_id: VENUE_ID, pub_name: VENUE_NAME, region: '서울', address: '서울 어딘가 1',
        date: kstDay(0), start_time: '19:00:00',
        duration: '4시간', format: 'NLH', guaranteed: true, prize_pool: 1_000_000, prize_percent: null,
        is_competition: false, grade: 'daily', blinds: null, buy_in: { amount: 30_000 },
        display_order: 1, is_premium: false, owner_id: VENUE_ID, approved: true,
        unread_qna_count: 0, view_count: 0, premium_until: null, reg_close_time: null, structure: null,
      }]);
    }
    if (/\/rest\/v1\/venues/.test(url)) {
      return json([{ id: VENUE_ID, name: VENUE_NAME, region: '서울', address: '서울 어딘가 1',
        approved: true, status: 'active', is_paid_ad: false, display_order: 1, follower_count: 0, rating: null }]);
    }
    if (/\/rest\/v1\//.test(url)) return json([]);
    if (/supabase\.co/.test(url)) return json({});
    return route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    let vt = 0;
    w.__vt = { get n() { return vt; } };
    const native = document.startViewTransition?.bind(document);
    if (native) {
      document.startViewTransition = ((cb: () => void) => { vt += 1; return native(cb); }) as typeof document.startViewTransition;
    }
  });

  // (a) 모바일: 매장 열기(handleVenueClick)가 스냅샷을 만들지 않고, 그래도 매장 화면은 열린다.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
  const card = page.locator('article.cv-card-list').first();
  await expect(card, '일정 카드가 없어 매장 링크에 도달할 수 없다').toBeVisible({ timeout: 20_000 });
  // 카드 안 첫 버튼이 매장명 링크다(`e2e/schedule-card-clicks.spec.ts` 와 같은 관례).
  // 텍스트로 **대상을 확인**한 뒤 누른다 — 엉뚱한 버튼을 눌러 놓고 초록이 되는 것을 막는다.
  const venueLink = card.locator('button').first();
  await expect(venueLink, '카드 안 매장명 링크를 찾지 못했다').toContainText(VENUE_NAME);
  const beforeVenue = await page.evaluate(() => (window as unknown as { __vt: { n: number } }).__vt.n);
  await venueLink.click();
  await expect(page.locator('[data-venue-page], [role="dialog"]').first(),
    '매장 화면이 열리지 않았다 — 가드가 기능까지 막았다').toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __vt: { n: number } }).__vt.n) - beforeVenue,
    '모바일 매장 열기에서 document View Transition 이 돌았다 (공용 helper 가드 누락)').toBe(0);
  // 스냅샷을 안 만들었으니 마커도 남으면 안 된다.
  expect(await page.evaluate(() => document.documentElement.dataset.vtScope ?? null),
    '모바일인데 data-vt-scope 마커가 남았다').toBeNull();

  // (b) 데스크톱 양성 대조 — helper 자체는 살아 있어야 한다. 죽은 helper 는 '0회' 로도 통과한다.
  // 🔵 2026-09-24 MOTION-UNIFY — PC 메인 탭은 이제 VT 가 아니라 덮개다(재방문도 0회가 정상).
  //   VT 가 남은 데스크톱 경로 = **같은 매장 열기**(handleVenueClick). (a) 와 같은 버튼으로 양성 대조한다.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await dismissOverlays(page);
  const cardPc = page.locator('article.cv-card-list').first();
  await expect(cardPc).toBeVisible({ timeout: 20_000 });
  const venueLinkPc = cardPc.locator('button').first();
  await expect(venueLinkPc).toContainText(VENUE_NAME);
  const beforeDesktop = await page.evaluate(() => (window as unknown as { __vt: { n: number } }).__vt.n);
  await venueLinkPc.click();
  await expect(page.locator('[data-venue-page], [role="dialog"]').first()).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __vt: { n: number } }).__vt.n) - beforeDesktop,
    '데스크톱 매장 열기에서 View Transition 이 0회 — helper 가 통째로 죽었을 수 있다(양성 대조 실패)').toBeGreaterThan(0);
});

// ── R2-resize: 데스크톱 전환 중 좁아져도 잔재가 남지 않는다 ───────────────────────
test('🔴 R2 — 1024 → 390 으로 좁힌 뒤에는 스냅샷도 마커도 남지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await mockSchedules(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await dismissOverlays(page);
  // 데스크톱에서 전환을 한 번 돌려 마커를 만든 뒤 바로 좁힌다.
  await page.locator('[data-stack-tabbar]').getByRole('tab', { name: '커뮤니티', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('navigation', { name: '하단 내비게이션' })
    .getByRole('button', { name: '홈', exact: true }).click();
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible({ timeout: 15_000 });
  const left = await page.evaluate(() => ({
    scope: document.documentElement.dataset.vtScope ?? null,
    dir: document.documentElement.dataset.vtDir ?? null,
    pseudo: document.getAnimations()
      .filter((a) => String((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').includes('view-transition')).length,
  }));
  expect(left, `리사이즈 뒤 전환 잔재가 남았다: ${JSON.stringify(left)}`).toEqual({ scope: null, dir: null, pseudo: 0 });
});

// ── B1(2026-09-21) 하단바 알약 **아래 여백** ────────────────────────────────────
//
// 오너: 하단바가 화면 아래에서 너무 떠 보인다. 운영 390×844(safe-area 0) 실측에서 `nav` 는 bottom:0 인데
// 알약 아래가 8.5 CSS px 남아 있었다(`App.tsx` 의 `mb-[calc(0.5rem+var(--tabbar-lift))]`, 루트 폰트 17px).
// 4.25px 로 좁혔고, FINAL-UX#NAV-GAP(2026-09-21)에서 **2.125px**(0.125rem)로 한 번 더 좁혔다.
// 여기에 버튼 `pb-1.5 → pb-1`(6.375 → 4.25px)을 더해 라벨 하단→nav 하단이 11.625 → 약 7.4px 다.
// 이 검사는 **그 값이 다시 벌어지는 것**과 **안전영역·터치 표적 계약이 깨지는 것**을 같이 잡는다.
//
// 음성 대조: `mb-[calc(0.125rem+…)]` 을 `0.25rem` 으로 되돌리면 gap 이 4.25 가 되어 상한(3)을 넘고,
//   버튼 `pb-1` 을 `pb-1.5` 로 되돌리면 라벨 하단→nav 하단이 9.5px 가 되어 상한(8)을 넘는다.
test('🔴 B1 — 하단바 알약 아래 여백과 라벨 하단 여백이 목표 범위이고 안전영역 계약은 그대로다', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
  await expect(page.getByRole('navigation', { name: '하단 내비게이션' })).toBeVisible({ timeout: 15_000 });

  const m = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="하단 내비게이션"]') as HTMLElement | null;
    if (!nav) return null;
    const inner = nav.querySelector('.pointer-events-auto') as HTMLElement | null;
    if (!inner) return null;
    const nr = nav.getBoundingClientRect(), ir = inner.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    const btn = inner.querySelector('button');
    const btns = Array.from(inner.querySelectorAll('button'));
    return {
      // 안전영역을 뺀 순수 여백 — 기기에 safe-area 가 있어도 같은 값이 나와야 한다.
      gap: +(nr.bottom - ir.bottom - (parseFloat(cs.paddingBottom) || 0)).toFixed(2),
      navBottomOffset: +(window.innerHeight - nr.bottom).toFixed(2), // fixed bottom:0 계약
      position: cs.position,
      btnH: btn ? +btn.getBoundingClientRect().height.toFixed(2) : -1,
      // 오너가 본 '떠 있음' 의 실체 — **라벨 글자 하단**에서 nav 하단(=화면 바닥)까지. **모든 칸**을 잰다:
      // 배지가 붙은 라이브·커뮤니티 칸만 값이 달라지는 부류를 첫 칸만 보면 놓친다.
      // 🔴 라벨 요소는 버튼의 **마지막 자식**이다. `span:last-child` 로 고르면 배지 span 도 잡혀 41~47px 로 오측된다(실측).
      labelGaps: btns.map((b2) => {
        const label = b2.lastElementChild as HTMLElement | null;
        return label ? +(nr.bottom - label.getBoundingClientRect().bottom).toFixed(2) : -1;
      }),
      // 라벨이 칸 밖으로 잘렸는가(여백을 줄이며 세로로 눌렸는지) — 0 이어야 한다.
      clipped: btns.filter((b2) => {
        const label = b2.lastElementChild as HTMLElement | null;
        return !!label && label.scrollHeight > label.clientHeight + 0.5;
      }).length,
      minBtnH: +Math.min(...btns.map((b2) => b2.getBoundingClientRect().height)).toFixed(2),
      iconTopGaps: btns.map((b2) => {
        const icon = b2.querySelector('[data-main-tab-icon]') as HTMLElement | null;
        return icon ? +(icon.getBoundingClientRect().top - b2.getBoundingClientRect().top).toFixed(2) : -1;
      }),
    };
  });
  expect(m, '하단바 구조를 못 찾았다').not.toBeNull();
  expect(m!.position, '하단바가 fixed 가 아니다').toBe('fixed');
  expect(m!.navBottomOffset, '하단바가 화면 바닥에 붙어 있지 않다 — bottom:0 계약이 깨졌다').toBeLessThanOrEqual(0.5);
  expect(m!.gap, `알약 아래 여백이 ${m!.gap}px 다 — 1.5~3px 범위를 벗어났다`).toBeGreaterThanOrEqual(1.5);
  expect(m!.gap, `알약 아래 여백이 ${m!.gap}px 다 — 너무 떠 있다(4.25px/8.5px 회귀)`).toBeLessThanOrEqual(3);
  // FINAL-UX#NAV-GAP 수용 기준 — **모든 칸**의 라벨 하단→nav 하단 6~8px(safe-area 0).
  expect(m!.labelGaps.length, '하단바 칸을 못 찾았다').toBeGreaterThanOrEqual(4);
  expect(Math.min(...m!.labelGaps), `라벨 하단→nav 하단 최소 ${Math.min(...m!.labelGaps)}px — 6~8px 범위를 벗어났다: ${JSON.stringify(m!.labelGaps)}`)
    .toBeGreaterThanOrEqual(6);
  expect(Math.max(...m!.labelGaps), `라벨 하단→nav 하단 최대 ${Math.max(...m!.labelGaps)}px — 너무 떠 있다(종전 11.625px 회귀): ${JSON.stringify(m!.labelGaps)}`)
    .toBeLessThanOrEqual(8);
  // 아이콘 상단 간격은 변화 0 이어야 한다(pt-2 는 안 건드렸다) — 여백을 위에서 훔쳐오지 않았다는 증거.
  for (const g of m!.iconTopGaps) expect(g, `아이콘 상단 간격이 ${g}px 다 — pt-2(8.5px)가 아니다`).toBeCloseTo(8.5, 1);
  expect(m!.clipped, '라벨이 세로로 잘린 칸이 있다').toBe(0);
  expect(m!.minBtnH, `가장 낮은 하단바 버튼이 ${m!.minBtnH}px 로 44px 미만이다`).toBeGreaterThanOrEqual(44);
  // 여백을 줄이면서 터치 표적을 깎지 않았는지 — 44px 계약은 별개다.
  expect(m!.btnH, `하단바 버튼 높이가 ${m!.btnH}px 로 44px 미만이다`).toBeGreaterThanOrEqual(44);
});
