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

// ── M1(2026-09-21) 커뮤니티 — **분절과 역행**을 잡는다 ────────────────────────────
//
// 위 N1 검사는 GTO 만 본다. 오너가 '본문 1·2·3 이 제각각'이라고 한 화면은 **커뮤니티**였고,
// 원인이 둘이었다:
//   ① 외치기 래퍼(`CommunityTab.tsx` 의 `mx-auto w-full max-w-3xl`)에 표식이 없어 **혼자 정적**이었다.
//   ② `startTabEnter` 가 `requestAnimationFrame` 으로 한 프레임 미뤄, 그 프레임이 **정착 위치로 페인트**된
//      뒤 다음 프레임에 +8 로 점프했다 — 사용자에겐 0→+8 **역행**으로 보인다.
//
// 그래서 여기서는 위 검사가 안 보는 두 가지를 본다:
//   (a) 대상이 **처음 보이는 프레임**에서 이미 +8 쪽인가 (역행 금지)
//   (b) 모든 프레임에서 대상들의 값이 **서로 같은가** (분절 금지 — 피크 한 프레임만 보면 놓친다)
//
// 음성 대조(둘 다 확인함):
//   · `tabEnter.ts` 의 `attempt()` 를 `requestAnimationFrame(attempt)` 로 되돌리면 (a) 가 빨개진다.
//   · 외치기 래퍼의 `data-main-enter` 를 떼면 대상 수가 줄어 cohort 단언이 빨개진다.
test('🔴 M1 — 커뮤니티 본문 cohort 가 첫 프레임부터 같은 값으로 함께 들어온다 (역행·분절 금지)', async ({ page }) => {
  test.setTimeout(180_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
  await page.waitForTimeout(2_500);

  // 🔴 전환은 **하단바 버튼을 실제로 눌러서** 일으킨다. `nuri:goto-tab` 커스텀 이벤트로 재현하려다
  //   2026-09-21 에 헛발을 디뎠다: 커뮤니티에서는 대상 5개가 잡히는데 transform 이 끝까지 `none` 이라
  //   "모션이 없다"로 읽혔다(실측). 하단바 경로는 같은 조건에서 정상 재현된다 —
  //   그리고 오너가 지적한 것도 **하단 대메뉴를 누른 뒤**의 화면이다. 재현 경로를 사용자 경로와 맞춘다.
  const navBtn = page.getByRole('navigation', { name: '하단 내비게이션' })
    .getByRole('button', { name: /커뮤니티/ });
  await expect(navBtn, '하단바에 커뮤니티 칸이 없다').toBeVisible({ timeout: 15_000 });

  // 샘플러를 **먼저** 걸어 두고 그 다음에 누른다 — 첫 프레임을 놓치면 역행 검사가 성립하지 않는다.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__m1rows = [];
    const tick = () => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-tab="community"] [data-main-enter]'))
        .filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 0
          && e.getBoundingClientRect().top < window.innerHeight);
      const ys = els.map((e) => {
        const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(e).transform);
        return m ? +Number(m[1].split(',')[5]).toFixed(2) : 0;
      });
      (w.__m1rows as unknown[]).push({ t: +performance.now().toFixed(1), ys });
      if ((w.__m1rows as unknown[]).length < 60) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await navBtn.click();
  await page.waitForTimeout(1_500);
  const r = await page.evaluate(() => (window as unknown as Record<string, unknown>).__m1rows) as { t: number; ys: number[] }[];

  // 🔴 **대상이 화면에 나타난 첫 프레임**부터 본다. '움직이는 프레임만' 으로 거르면 안 된다 —
  //   역행의 정체가 바로 "보이는데 아직 안 움직인(=정착 위치로 페인트된) 프레임" 이라, 그걸 걸러내면
  //   검사가 스스로 증거를 버린다. 2026-09-21 음성 대조에서 실제로 그랬다: `rAF` 지연을 되살린
  //   결함 빌드가 **그대로 통과**했다(잘못된 통과). 전환 전에는 pane 이 display:none 이라 ys.length 가 0 이다.
  const appeared = r.filter((f) => f.ys.length > 0);
  expect(appeared.length, '커뮤니티 본문 대상이 한 프레임도 안 잡혔다 — 표식이 사라졌거나 탭이 안 열렸다')
    .toBeGreaterThan(2);

  const first = appeared[0];
  // (a) 역행 금지 — 대상이 **보이기 시작한 그 프레임**에서 이미 +8 쪽이어야 한다.
  //   한 프레임이라도 정착(0)으로 먼저 그려지면 사용자 눈에는 "내려갔다 올라온다"로 보인다.
  expect(Math.max(...first.ys),
    `대상이 보이기 시작한 첫 프레임의 변위가 ${Math.max(...first.ys)}px 다 — 정착 위치로 한 번 그려진 뒤 ` +
    `튀어 올랐다(0→+8 역행). 시퀀스: ${appeared.slice(0, 6).map((f) => `${f.t}:${f.ys[0]}`).join(' ')}`)
    .toBeGreaterThanOrEqual(5.5);
  expect(Math.max(...first.ys), '첫 프레임 변위가 과하다').toBeLessThanOrEqual(10);
  const moving = appeared;

  // 🔴 cohort — 외치기 래퍼까지 들어와야 한다. 검색·여백·필터·목록 4개 + 외치기 = 5.
  expect(first.ys.length,
    `커뮤니티 첫 화면의 진입 대상이 ${first.ys.length}개다 — 외치기 래퍼(mx-auto w-full max-w-3xl)가 빠졌을 수 있다`)
    .toBeGreaterThanOrEqual(5);

  // 🔴 (b) 분절 금지 — **모든 프레임에서** 서로 같은 값이어야 한다(피크 한 프레임만 보면 놓친다).
  for (const f of moving) {
    expect(f.ys.length, `t=${f.t} 에서 대상 수가 ${f.ys.length} 로 줄었다`).toBe(first.ys.length);
    expect(+(Math.max(...f.ys) - Math.min(...f.ys)).toFixed(2),
      `t=${f.t} 에서 대상들이 제각각이다: ${JSON.stringify(f.ys)} — 이게 오너가 본 '본문 1·2·3 분절'이다`)
      .toBeLessThanOrEqual(1);
  }
  // 단조 감소(+8 → 0) — 중간에 다시 커지면 역행이다.
  for (let i = 1; i < moving.length; i++) {
    expect(Math.max(...moving[i].ys),
      `t=${moving[i].t} 에서 변위가 다시 커졌다 (${Math.max(...moving[i - 1].ys)} → ${Math.max(...moving[i].ys)})`)
      .toBeLessThanOrEqual(Math.max(...moving[i - 1].ys) + 0.5);
  }
});

// ── C1(2026-09-21) 커뮤니티 밝기 점프 ───────────────────────────────────────────
//
// 진입 모션 중 `[data-main-enter]` 가 transform 으로 **새 stacking context** 가 되면서 `.aura-bg`(fixed)
// 위로 올라갔다가, 끝나면(`fill:'none'`) 다시 아래로 내려간다. 그 순간 아우라 gradient 가 카드 위에 덮여
// **색이 바뀐다.** 운영 390×844 실측: 카드 안 픽셀 중간 rgb(14,19,34) → 종료 rgb(21,22,46).
//
// 재는 법: 170ms 를 쫓지 않고 애니메이션을 **중간에 일시정지**해 결정적으로 만든 뒤 같은 ROI 를 두 번 찍어
// **PNG 바이트를 직접 비교**한다(색이 같으면 인코딩 결과도 같다 — 디코더 의존성이 필요 없다).
//
// 음성 대조(확인함): `src/index.css` 의 모바일 `.aura-bg { z-index: -1 }` 을 `0` 으로 되돌리면
//   이 검사가 빨개진다(실측: 같은 ROI PNG 가 118바이트 → 342바이트로 갈렸다).
test('🔴 C1 — 본문 진입 모션의 중간과 종료에서 카드 픽셀 색이 바뀌지 않는다', async ({ page }) => {
  test.setTimeout(180_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
  await page.waitForTimeout(2_000);

  // 처방이 실제로 걸려 있는가 — 이 한 줄이 없으면 아래 픽셀 비교가 '왜 같은지' 를 설명하지 못한다.
  const z = await page.evaluate(() => {
    const el = document.querySelector('.aura-bg');
    return el ? getComputedStyle(el).zIndex : null;
  });
  expect(z, '모바일에서 .aura-bg 가 음수 z 가 아니다 — 애니메이션 전/중/후 쌓임 순서가 달라진다').toBe('-1');

  // 위 M1 검사와 같은 이유로 **실제 하단바 버튼**을 누른다(커스텀 이벤트로는 커뮤니티 모션이 안 선다).
  await page.getByRole('navigation', { name: '하단 내비게이션' })
    .getByRole('button', { name: /커뮤니티/ }).click();

  // 진입 애니메이션만 골라 중간(85ms)에 세운다.
  // ⚠ `.reveal` 같은 scroll-driven(progress based) 애니는 `currentTime` 에 ms 를 못 넣는다 — duration 으로 가른다.
  const paused = await page.evaluate(() => {
    let n = 0;
    for (const a of document.getAnimations()) {
      const eff = a.effect as KeyframeEffect | null;
      if (!eff?.getKeyframes) continue;
      if (eff.getTiming().duration !== 170) continue;
      const kf = eff.getKeyframes() as { transform?: string }[];
      if (!kf.some((f) => typeof f.transform === 'string' && f.transform.includes('translateY(8px)'))) continue;
      a.pause(); a.currentTime = 85; n += 1;
    }
    return n;
  });
  expect(paused, '진입 애니메이션을 하나도 못 세웠다 — 모션이 없으면 이 검사는 아무것도 재지 않는다').toBeGreaterThan(0);
  await page.waitForTimeout(250);

  // 글자가 없는 평평한 영역을 ROI 로 — 색만 비교되게 한다.
  const roi = await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-main-enter], [data-main-enter] *'))) {
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 30) continue;
      if (r.top < 60 || r.bottom > window.innerHeight - 90) continue; // 헤더·하단바 밖
      return { x: Math.round(r.x + 8), y: Math.round(r.y + 5), width: 12, height: 8 };
    }
    return null;
  });
  expect(roi, '카드 ROI 를 못 잡았다 — 대상이 없거나 화면 밖이다').not.toBeNull();

  const mid = await page.screenshot({ clip: roi! });
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const eff = a.effect as KeyframeEffect | null;
      if (eff?.getTiming && eff.getTiming().duration === 170) { try { a.finish(); } catch { /* 이미 끝남 */ } }
    }
  });
  await page.waitForTimeout(400);
  const settled = await page.screenshot({ clip: roi! });

  expect(mid.equals(settled),
    `모션 중간과 종료의 카드 픽셀이 다르다 (mid ${mid.length}B vs settled ${settled.length}B) — ` +
    '아우라가 transform 전/후로 카드 위아래를 오가며 색이 점프한다').toBe(true);
});

// ── B1(2026-09-21) 하단바 알약 **아래 여백** ────────────────────────────────────
//
// 오너: 하단바가 화면 아래에서 너무 떠 보인다. 운영 390×844(safe-area 0) 실측에서 `nav` 는 bottom:0 인데
// 알약 아래가 8.5 CSS px 남아 있었다(`App.tsx` 의 `mb-[calc(0.5rem+var(--tabbar-lift))]`, 루트 폰트 17px).
// 4.25px 로 좁혔다. 이 검사는 **그 값이 다시 벌어지는 것**과 **안전영역 계약이 깨지는 것**을 같이 잡는다.
//
// 음성 대조: `mb-[calc(0.25rem+…)]` 을 `0.5rem` 으로 되돌리면 gap 이 8.5 가 되어 상한(6)을 넘는다.
test('🔴 B1 — 하단바 알약 아래 여백이 2~6px 이고 안전영역 계약은 그대로다', async ({ page }) => {
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
    return {
      // 안전영역을 뺀 순수 여백 — 기기에 safe-area 가 있어도 같은 값이 나와야 한다.
      gap: +(nr.bottom - ir.bottom - (parseFloat(cs.paddingBottom) || 0)).toFixed(2),
      navBottomOffset: +(window.innerHeight - nr.bottom).toFixed(2), // fixed bottom:0 계약
      position: cs.position,
      btnH: btn ? +btn.getBoundingClientRect().height.toFixed(2) : -1,
    };
  });
  expect(m, '하단바 구조를 못 찾았다').not.toBeNull();
  expect(m!.position, '하단바가 fixed 가 아니다').toBe('fixed');
  expect(m!.navBottomOffset, '하단바가 화면 바닥에 붙어 있지 않다 — bottom:0 계약이 깨졌다').toBeLessThanOrEqual(0.5);
  expect(m!.gap, `알약 아래 여백이 ${m!.gap}px 다 — 2~6px 범위를 벗어났다`).toBeGreaterThanOrEqual(2);
  expect(m!.gap, `알약 아래 여백이 ${m!.gap}px 다 — 너무 떠 있다(종전 8.5px 회귀)`).toBeLessThanOrEqual(6);
  // 여백을 줄이면서 터치 표적을 깎지 않았는지 — 44px 계약은 별개다.
  expect(m!.btnH, `하단바 버튼 높이가 ${m!.btnH}px 로 44px 미만이다`).toBeGreaterThanOrEqual(44);
});
