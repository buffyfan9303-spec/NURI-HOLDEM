// 4회차 모션 점검(audit4-motion-1004.md) 홈·셸 결함 회귀 게이트 — M4-01 · M4-02 · M4-04 · M3-07.
//
// 원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit4-motion-1004.md (design-reviewer 2026-10-04)
//   M4-01(P2) 내 정보를 끝까지 내리고 더 밀면 뒤 홈이 같이 스크롤(137→344px) — 닫으면 읽던 자리를 잃는다.
//   M4-02     헤더 축소·복원마다 입력 없는 CLS 0.015(줄 높이를 바꿔 아래 본문 전체가 12.75px 밀렸다).
//   M4-04     계정 메뉴 닫힘 0.24s·(.4,0,.2,1) ≠ 알림 패널 닫힘 0.18s·(.32,.72,0,1).
//   M3-07     라이트 알림 패널 열 때 ~72ms 회색으로 어두워짐(휘도 −24) — 딤이 0.45 에서 시작해 패널보다 먼저 어두워졌다.
//
// 음성 대조(2026-10-04, origin/main 55d9dd8a 가짜 env 빌드): 아래 다섯 검사 전부 실패 → 수정 빌드에서 전부 통과(보고 참고).
// 운영 DB 에는 쓰지 않는다 — 로그인은 stubLogin(로컬 세션 위조), 쓰기는 _fixtures 가 끊는다. 데이터와 무관한 화면(GTO 도구 탭)에서 잰다.
// ⚠ 스크롤은 실제 손가락(CDP touchMove) — Input.synthesizeScrollGesture(touch)는 이 하네스에서 스크롤을 만들지 못한다(design-reviewer 실측).
import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function swipe(cdp: CDPSession, page: Page, x: number, y0: number, y1: number, ms = 140, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const docState = (page: Page) => page.evaluate(() => ({
  y: Math.round(window.scrollY),
  shrunk: document.documentElement.dataset.headerShrunk ?? '',
}));

async function bootTools(page: Page, login: boolean) {
  await stabilizeBackstack(page);
  if (login) await stubLogin(page);
  await page.goto('/?tab=tools');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 30_000 });
  await dismissOverlays(page);
  await page.waitForTimeout(1500);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  // 전제 — 문서가 짧으면 아래 검사는 아무것도 재지 못한다. 조용히 넘기지 않는다.
  expect(max, `전제 조건: GTO 도구 탭 최대 스크롤 ${max}px — 헤더 축소(56)·스크롤 샘을 재기에 짧다`).toBeGreaterThan(300);
}

test.describe('M4-01 내 정보 — 안쪽 끝에서 더 밀어도 뒤 문서가 움직이지 않는다', () => {
  test('🔴 로그인: 열기 전 자리 그대로 · 닫은 뒤에도 그 자리', async ({ page }) => {
    test.setTimeout(120_000);
    await bootTools(page, true);
    await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' as ScrollBehavior }));
    await page.waitForTimeout(500);
    const s0 = await docState(page);
    expect(s0.y, '전제 조건: 뒤 문서를 200px 로 못 내렸다').toBeGreaterThan(150);
    await page.getByRole('button', { name: '검증계정 메뉴' }).click();
    await page.getByRole('button', { name: '내 정보 열기' }).click();
    await expect(page.locator('h1', { hasText: '내 정보' })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const cdp = await page.context().newCDPSession(page);
    for (let k = 0; k < 8; k++) { await swipe(cdp, page, 200, 760, 160); await page.waitForTimeout(100); }
    await page.waitForTimeout(900);
    const s1 = await docState(page);
    for (let k = 0; k < 4; k++) { await swipe(cdp, page, 200, 200, 760); await page.waitForTimeout(100); }
    await page.waitForTimeout(900);
    const s2 = await docState(page);
    await page.evaluate(() => history.back());
    await expect(page.locator('h1', { hasText: '내 정보' })).toBeHidden({ timeout: 10_000 });
    await page.waitForTimeout(600);
    const s3 = await docState(page);
    const log = `열기 전 ${JSON.stringify(s0)} · 위로 밀기 뒤 ${JSON.stringify(s1)} · 아래로 밀기 뒤 ${JSON.stringify(s2)} · 닫은 뒤 ${JSON.stringify(s3)}`;
    for (const s of [s1, s2, s3]) {
      expect(Math.abs(s.y - s0.y), `내 정보 안의 손가락이 뒤 문서를 움직였다(scroll chaining) — ${log}`).toBeLessThanOrEqual(1);
      expect(s.shrunk, `뒤 헤더 축소 상태가 바뀌었다 — ${log}`).toBe(s0.shrunk);
    }
  });

  test('🔴 비로그인(로그인 랜딩): 같은 루트 — 뒤 문서가 움직이지 않는다', async ({ page }) => {
    test.setTimeout(120_000);
    // 비로그인은 헤더에 진입 버튼이 없다 — 비밀번호 OTP 복귀 경로(sessionStorage nh_pw_otp)가 부팅 때 '내 정보'를 연다(App.tsx).
    await page.addInitScript(() => { try { sessionStorage.setItem('nh_pw_otp', String(Date.now())); } catch { /* 차단 환경 */ } });
    await bootTools(page, false);
    await expect(page.getByRole('heading', { name: '반갑습니다' })).toBeVisible({ timeout: 15_000 });
    // 뒤 문서를 읽던 자리로 — 잠금은 사용자 스크롤만 막는다(프로그램 스크롤은 된다).
    await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' as ScrollBehavior }));
    await page.waitForTimeout(500);
    const s0 = await docState(page);
    expect(s0.y, '전제 조건: 뒤 문서를 200px 로 못 내렸다').toBeGreaterThan(150);
    const cdp = await page.context().newCDPSession(page);
    for (let k = 0; k < 8; k++) { await swipe(cdp, page, 200, 760, 160); await page.waitForTimeout(100); }
    await page.waitForTimeout(900);
    const s1 = await docState(page);
    expect(Math.abs(s1.y - s0.y), `로그인 랜딩 안의 손가락이 뒤 문서를 움직였다 — 전 ${JSON.stringify(s0)} 후 ${JSON.stringify(s1)}`).toBeLessThanOrEqual(1);
  });
});

test('🔴 M4-02 헤더 축소·복원 — 입력 없는 레이아웃 이동 0 · 축소는 그대로(보이는 밑면 47.75 · 아이콘 가운데)', async ({ page }) => {
  test.setTimeout(120_000);
  await bootTools(page, false);
  await page.evaluate(() => {
    const w = window as unknown as { __m42: { v: number; src: string[] }[] };
    w.__m42 = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] })[]) {
        if (e.hadRecentInput) continue;
        w.__m42.push({ v: e.value, src: (e.sources ?? []).map((s) => (s.node as HTMLElement | undefined)?.className?.toString().slice(0, 40) ?? '?') });
      }
    }).observe({ type: 'layout-shift', buffered: false });
  });
  const cdp = await page.context().newCDPSession(page);
  for (let k = 0; k < 4; k++) { await swipe(cdp, page, 200, 700, 380); await page.waitForTimeout(200); }
  await page.waitForTimeout(800);
  const down = await page.evaluate(() => {
    const h = document.querySelector('[data-stack-header]')!.getBoundingClientRect();
    const bell = document.querySelector('header button[aria-label^="알림"]')!.getBoundingClientRect();
    return { y: Math.round(scrollY), shrunk: document.documentElement.dataset.headerShrunk ?? '', bottom: +h.bottom.toFixed(2), top: +Math.max(0, h.top).toFixed(2), bellMid: +(bell.top + bell.height / 2).toFixed(2) };
  });
  // 축소 자체가 살아 있어야 한다 — 안 접혔으면 아래 CLS 0 은 아무것도 재지 않은 것이다.
  expect(down.shrunk, `전제 조건: 내렸는데 헤더가 안 접혔다 ${JSON.stringify(down)}`).toBe('1');
  expect(down.bottom, `축소 상태 보이는 헤더 밑면이 47.75 가 아니다 ${JSON.stringify(down)}`).toBeCloseTo(47.75, 0);
  expect(Math.abs(down.bellMid - (down.top + down.bottom) / 2), `알림 버튼이 보이는 헤더 띠 가운데가 아니다 ${JSON.stringify(down)}`).toBeLessThanOrEqual(1.5);
  for (let k = 0; k < 6; k++) { await swipe(cdp, page, 200, 300, 700); await page.waitForTimeout(200); }
  await page.waitForTimeout(800);
  const up = await docState(page);
  expect(up.shrunk, `전제 조건: 맨 위로 올렸는데 헤더가 안 펴졌다 ${JSON.stringify(up)}`).toBe('');
  const shifts = await page.evaluate(() => (window as unknown as { __m42: { v: number; src: string[] }[] }).__m42);
  const sum = shifts.reduce((a, s) => a + s.v, 0);
  expect(sum, `헤더 축소·복원 중 입력 없는 레이아웃 이동 ${sum.toFixed(4)} — ${JSON.stringify(shifts).slice(0, 400)}`).toBeLessThan(0.001);
});

test('🔴 M4-04 계정 메뉴 닫힘 = 알림 패널 닫힘(같은 길이·곡선)', async ({ page }) => {
  test.setTimeout(120_000);
  await bootTools(page, true);
  const grabClose = (sel: string) => page.evaluate((sel) => new Promise<string>((res) => {
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector<HTMLElement>(sel);
      const a = el?.getAnimations().find((x) => (x as CSSAnimation).animationName === 'fade-out');
      if (el && a) { const cs = getComputedStyle(el); res(`${cs.animationDuration} ${cs.animationTimingFunction}`); return; }
      if (performance.now() - t0 > 2000) { res('none'); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }), sel);
  const menuBtn = page.getByRole('button', { name: '검증계정 메뉴' });
  await menuBtn.click();
  await expect(page.getByRole('button', { name: '내 정보 열기' })).toBeVisible();
  await page.waitForTimeout(500);
  const pm = grabClose('header [data-menu-leave]');
  await menuBtn.click();
  const menu = await pm;
  await page.waitForTimeout(1200);
  await page.locator('header button[aria-label^="알림"]').click();
  await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  const pn = grabClose('[role=dialog][aria-label="알림"]');
  await page.keyboard.press('Escape');
  const notif = await pn;
  expect(menu, '계정 메뉴 닫힘 애니메이션을 못 잡았다(측정 공허)').not.toBe('none');
  expect(notif, '알림 패널 닫힘 애니메이션을 못 잡았다(측정 공허)').not.toBe('none');
  expect(menu, `헤더 드롭다운 두 개의 닫힘이 다르다 — 계정 메뉴 [${menu}] vs 알림 패널 [${notif}]`).toBe(notif);
});

test('🔴 M3-07 라이트 알림 패널 열기 — 딤이 패널보다 먼저 어두워지지 않는다(회색 번쩍 없음)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { localStorage.setItem('nuri-theme', 'light'); } catch { /* 차단 환경 */ } });
  await bootTools(page, true);
  // 클릭과 같은 태스크에서 rAF 표본기를 건다 — 첫 프레임을 놓치면 이 결함(첫 프레임 딤 0.45)은 안 보인다.
  const frames = await page.evaluate(() => new Promise<{ scrim: number; panel: number }[]>((res) => {
    const out: { scrim: number; panel: number }[] = [];
    let n = 0;
    const tick = () => {
      const panel = document.querySelector<HTMLElement>('[role=dialog][aria-label="알림"]');
      const scrim = panel?.previousElementSibling as HTMLElement | null;
      if (panel && scrim) out.push({ scrim: +Number(getComputedStyle(scrim).opacity).toFixed(3), panel: +Number(getComputedStyle(panel).opacity).toFixed(3) });
      if (out.length >= 24 || ++n > 240) { res(out); return; }
      requestAnimationFrame(tick);
    };
    document.querySelector<HTMLElement>('header button[aria-label^="알림"]')!.click();
    requestAnimationFrame(tick);
  }));
  expect(frames.length, '알림 패널·딤 표본을 못 모았다(측정 공허)').toBeGreaterThan(10);
  expect(frames[frames.length - 1].scrim, '딤이 끝내 켜지지 않았다').toBeGreaterThan(0.9);
  const ahead = frames.filter((f) => f.scrim > f.panel + 0.05);
  expect(ahead, `딤이 패널보다 먼저 어두워진 프레임 ${ahead.length}개 — 반투명 패널 뒤로 어두운 딤이 비쳐 회색으로 번쩍인다: ${JSON.stringify(frames.slice(0, 6))}`).toEqual([]);
});

// ── PR #164 독립 검토 회귀(design-reviewer 2026-10-04, dr164 하네스 S·U) ─────────────────────────────────────────
// 음성 대조: 45772069(PR 원본) 빌드에서 두 검사 모두 실패 → 수정 빌드 통과(보고 참고).
test('🔴 M4-02 후속 — 축소된 헤더 밑 +1~+5px 은 헤더가 아니라 그 아래 요소가 누름을 받는다', async ({ page }) => {
  test.setTimeout(120_000);
  await bootTools(page, false);
  const cdp = await page.context().newCDPSession(page);
  for (let k = 0; k < 3; k++) { await swipe(cdp, page, 200, 700, 380); await page.waitForTimeout(200); }
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const hd = document.querySelector<HTMLElement>('[data-stack-header]')!;
    const hb = hd.getBoundingClientRect().bottom;
    const hits: string[] = [];
    for (let dy = 1; dy <= 5; dy++) for (const x of [40, 195, 350]) {
      const e = document.elementFromPoint(x, hb + dy) as HTMLElement | null;
      if (e && hd.contains(e)) hits.push(`+${dy}@${x}:${e.tagName}.${String(e.className).slice(0, 30)}`);
    }
    return { shrunk: document.documentElement.dataset.headerShrunk ?? '', hb: +hb.toFixed(2), hits };
  });
  expect(r.shrunk, `전제 조건: 헤더가 안 접혔다 ${JSON.stringify(r)}`).toBe('1');
  expect(r.hits, `보이는 헤더(밑면 ${r.hb}) 아래 띠의 누름을 헤더가 가로챈다 — 섹션 바·본문·검색 띠 윗부분이 죽는다`).toEqual([]);
});

test('🔴 M4-04 후속 — 계정 메뉴 항목으로 탭을 옮길 때 메뉴가 떠나는 판보다 먼저 사라지지 않는다(옛 판 비침 없음)', async ({ page }) => {
  test.setTimeout(120_000);
  await bootTools(page, true);
  // 홈에서 출발 — '도구' 항목이 탭 이동(떠나는 판 handOffPane + 메뉴 handoff)이 된다.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'home' })));
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '검증계정 메뉴' }).click();
  await expect(page.getByRole('button', { name: '내 정보 열기' })).toBeVisible();
  await page.waitForTimeout(600);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const frames = await page.evaluate(() => new Promise<{ menu: number; pane: number }[]>((res) => {
    const out: { menu: number; pane: number }[] = [];
    let n = 0;
    const tick = () => {
      const menu = document.querySelector<HTMLElement>('header [data-menu-leave]');
      const pane = document.querySelector<HTMLElement>('[data-pane-leaving]');
      if (menu && pane) out.push({ menu: +Number(getComputedStyle(menu).opacity).toFixed(3), pane: +Number(getComputedStyle(pane).opacity).toFixed(3) });
      if (++n > 90) { res(out); return; }
      requestAnimationFrame(tick);
    };
    const item = [...document.querySelectorAll<HTMLElement>('header div.w-56 button')].find((b) => (b.textContent ?? '').trim() === '도구');
    item!.click();
    requestAnimationFrame(tick);
  }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(frames.length, '메뉴 퇴장과 떠나는 판이 함께 있는 프레임을 못 모았다(측정 공허 — 판 handoff 가 안 돌았다)').toBeGreaterThan(3);
  const early = frames.filter((f) => f.menu < f.pane - 0.05);
  expect(early, `메뉴가 떠나는 판보다 먼저 사라진 프레임 ${early.length}개 — 메뉴 자리로 옛 판이 비친다: ${JSON.stringify(frames.slice(0, 12))}`).toEqual([]);
});
