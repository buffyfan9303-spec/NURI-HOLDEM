// 2026-09-20: Samsung compresses the main-tab snapshot vertically; Chrome flashes
// overlapping captures. Mobile navigation must render the live pane, including on
// revisit/back. Desktop keeps its existing transition. This cannot emulate Samsung's GPU.
// Negative control: remove the desktop matchMedia guard in App.tsx; mobile cases fail.
// Run against a fresh preview: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/mobile-tab-transition.spec.ts
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';

test.use({ reducedMotion: 'no-preference' });

for (const width of [390, 1023, 1024]) {
  test(`main tab snapshots at ${width}px: mobile stays live, desktop keeps transitions`, async ({ page }) => {
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
      expect(await count(), 'desktop navigation stopped using its existing transition').toBeGreaterThan(0);
    } else {
      expect(await count(), 'desktop revisit lost its existing transition').toBeGreaterThan(beforeRevisit);
      await page.waitForFunction(() => !document.getAnimations().some((animation) =>
        (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition')));
      const desktopCount = await count();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'home' })));
      await expect(pane('home')).toBeVisible();
      expect(await count(), 'resizing to mobile retained the desktop snapshot path').toBe(desktopCount);
    }
    await cdp.detach();
  });
}

// ── N1: 하단 대메뉴로 옮긴 뒤 **새 탭의 본문 콘텐츠가 한 번 들어온다** ────────────────
//
// 🔴 오너 정정(2026-09-21): "부드럽지 않다" 고 한 대상은 하단바 필이 아니라 **body 콘텐츠**였다.
//    하단바만 움직이고 본문이 정적이면 실패다. 이 검사가 그 계약을 잠근다.
//
// 무엇을 재는가 — 두 가지를 **같이** 본다. 하나만 보면 거짓 통과가 난다:
//   ① **선언값**(`getAnimations()` 의 keyframes/타이밍) — "그려지는데 값이 다르다" 를 잡는다.
//   ② **실제 렌더된 rect 변위**(첫/중간/정착) — "선언은 맞는데 안 그려진다" 를 잡는다.
//
// ⚠ rAF 샘플러는 **피크 프레임을 놓칠 수 있다.** 실측(2026-09-21 · 격리 프로덕션 빌드 · 390×844):
//   `5.8ms:0 → 10.3ms:5.89` 처럼 8px 피크가 두 샘플 사이에 들어간 전환이 있었다.
//   그래서 관측 최대값 하한은 5.5px 로 두고, **정확한 8px 은 선언값으로 잠근다.**
//
// 음성 대조: `src/lib/tabEnter.ts` 의 `startTabEnter` 호출을 `App.tsx` 에서 빼면 이 검사가 빨개진다.
test('🔴 N1 — 새 탭 본문이 8px 아래에서 170ms 동안 제자리로 들어온다 (첫·중간·정착)', async ({ page }) => {
  test.setTimeout(180_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
  await page.waitForTimeout(2000);
  // 재방문(keep-alive) 경로로 만든다 — 실제 사용 조건이자 삼성 눌림이 났던 경로다.
  for (const t of ['tools', 'community', 'home']) {
    await page.evaluate((x) => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: x })), t);
    await page.waitForTimeout(1000);
  }

  const r = await page.evaluate(async () => {
    const dest = 'tools';
    const pick = () => Array.from(document.querySelectorAll<HTMLElement>(`[data-tab="${dest}"] [data-main-enter]`))
      .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top < window.innerHeight);
    const rows: { t: number; ys: number[]; mats: string[]; ops: number[] }[] = [];
    const hdr = () => document.querySelector<HTMLElement>('[data-stack-header]')?.getBoundingClientRect().height ?? -1;
    const nav = () => document.querySelector<HTMLElement>('nav[aria-label="하단 내비게이션"]')?.getBoundingClientRect().top ?? -1;
    const hdrs: number[] = []; const navs: number[] = [];
    const t0 = performance.now();
    window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: dest }));
    await new Promise<void>((res) => {
      const tick = () => {
        const el = performance.now() - t0;
        const els = pick();
        rows.push({ t: +el.toFixed(1), ys: els.map((e) => +e.getBoundingClientRect().top.toFixed(2)),
          mats: els.map((e) => getComputedStyle(e).transform), ops: els.map((e) => Number(getComputedStyle(e).opacity)) });
        hdrs.push(hdr()); navs.push(nav());
        if (el < 420) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    // 선언값은 다음 전환에서 애니메이션이 살아 있는 동안 읽는다.
    window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'home' }));
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
    window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: dest }));
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
    const anims = pick().flatMap((e) => e.getAnimations());
    const kf = anims[0] ? (anims[0].effect as KeyframeEffect).getKeyframes() as { transform?: string }[] : [];
    const tm = anims[0] ? (anims[0].effect as KeyframeEffect).getTiming() : null;
    return { rows: rows.filter((x) => x.ys.length > 0), hdrs, navs, animCount: anims.length,
      kfFrom: kf[0]?.transform, kfTo: kf[kf.length - 1]?.transform, dur: tm?.duration, fill: tm?.fill };
  });

  // ─ 잴 것이 실제로 있었는가 — 이 두 줄이 없으면 아래 전체가 빈 검사다.
  expect(r.rows.length, 'data-main-enter 대상을 한 프레임도 못 잡았다 — 표식이 사라졌거나 탭이 안 열렸다').toBeGreaterThan(5);
  const n = r.rows[0].ys.length;
  expect(n, 'GTO 첫 화면에 움직일 대상이 없다 — hero 만이 아니라 검색·칩·도구 카드도 있어야 한다').toBeGreaterThanOrEqual(4);

  // ① 선언값
  expect(r.animCount, '진입 애니메이션 객체가 없다').toBeGreaterThan(0);
  expect(r.kfFrom, '시작 keyframe').toBe('translateY(8px)');
  expect(r.kfTo === 'translateY(0px)' || r.kfTo === 'translateY(0)', `끝 keyframe: ${r.kfTo}`).toBe(true);
  expect(r.dur, 'duration').toBe(170);
  expect(r.fill, 'fill 은 none 이어야 정착 뒤 transform 잔재가 안 남는다').toBe('none');

  // ② 실제 렌더 — 기준선은 **정착 y**(애니메이션이 커밋 몇 프레임 뒤에 시작하므로 프레임 0 은 초기값이 아니다).
  const settled = r.rows[r.rows.length - 1];
  const disp = r.rows.map((f) => ({ t: f.t, d: f.ys.map((y, i) => +(y - (settled.ys[i] ?? y)).toFixed(2)) }));
  const peak = disp.reduce((a, b) => (Math.max(...b.d) > Math.max(...a.d) ? b : a));
  const mid = disp.find((x) => x.t > peak.t && Math.max(...x.d) > 0.3 && Math.max(...x.d) < Math.max(...peak.d) * 0.7);
  console.log('[N1] 곡선#0:', disp.map((x) => `${x.t}:${x.d[0]}`).join(' '));

  for (let i = 0; i < n; i++) {
    expect(peak.d[i], `대상#${i} 관측 최대 변위 ${peak.d[i]}px — 본문이 정적이다`).toBeGreaterThanOrEqual(5.5);
    expect(peak.d[i], `대상#${i} 변위가 과하다`).toBeLessThanOrEqual(10);
  }
  // 동시 진행 — 같은 프레임에서 서로 1px 이내(제각각 낙하 금지 = 오너가 말한 '분절').
  expect(+(Math.max(...peak.d) - Math.min(...peak.d)).toFixed(2),
    `대상들이 동시에 안 움직인다: ${JSON.stringify(peak.d)}`).toBeLessThanOrEqual(1);
  expect(mid, '중간 프레임이 없다 — 한 프레임에 끝났거나 모션이 없다').toBeTruthy();
  for (let i = 0; i < n; i++) expect(mid!.d[i], `대상#${i} 중간 변위가 [0, ${peak.d[i]}] 밖`).toBeLessThan(peak.d[i]);
  for (const m of settled.mats) expect(m, '정착 뒤 transform 잔재').toBe('none');

  // ③ 삼성 눌림 재발 — 순수 y 이동만. scale/skew 가 섞이면 본문이 '눌린' 것이다.
  for (const f of r.rows) for (const m of f.mats) {
    if (m === 'none') continue;
    const v = m.match(/matrix\(([^)]+)\)/);
    expect(v, `예상 밖 transform: ${m}`).toBeTruthy();
    const [a, b, c, d] = v![1].split(',').map((x) => Number(x.trim()));
    expect(Math.abs(a - 1) < 0.001 && Math.abs(d - 1) < 0.001 && Math.abs(b) < 0.001 && Math.abs(c) < 0.001,
      `순수 y 이동이 아니다(scale/skew): ${m}`).toBe(true);
  }
  // ④ Chrome 반짝임 재발 — 대상 opacity 를 건드리지 않는다.
  for (const f of r.rows) for (const o of f.ops) expect(o, '대상 opacity 가 1 이 아니다 — 페이드는 금지다').toBeCloseTo(1, 3);
  // ⑤ 헤더·하단바는 본문 이동과 무관하게 고정.
  const hs = r.hdrs.filter((x) => x > 0); const ns = r.navs.filter((x) => x > 0);
  expect(Math.max(...hs) - Math.min(...hs), '헤더 높이가 본문 모션 중에 변했다').toBeLessThanOrEqual(1);
  expect(Math.max(...ns) - Math.min(...ns), '하단바가 본문 모션 중에 움직였다').toBeLessThanOrEqual(1);
});
