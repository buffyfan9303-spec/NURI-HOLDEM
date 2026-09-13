// 상단 헤더 표면(N09) + 아우라 그림자 합성(N01 §5.2-2) 실측 게이트 (2026-09-13).
//
// N09 — 오너 첨부: 로그인 헤더가 **검은 띠**(surface-base #06080F 불투명)로 그 아래 보라 서브바(.subbar-aura, bloom 미리 섞음)와
//   하드하게 끊겼다. 처방은 .glass-chrome::before 의 **불투명을 유지**한 채 같은 수법(color-mix)으로 누리 보라를 미리 섞는 것.
//   바꾸지 않는 것: 높이·로고·로그인 버튼·알림 위치·축소 임계값(56/40)·탭바 sticky offset. backdrop-filter 를 헤더 호스트에 붙이지 않는다
//   (필터가 걸린 요소는 fixed 자손의 컨테이닝 블록이 되어 알림 스크림이 헤더 안에 갇혔다 — CLAUDE.md 참고 메모).
// 이 파일이 보는 것
//   ① 헤더 ::before 가 불투명이고(alpha 1) 순수 surface-base 가 아니며, 서브바와 같은 색 계열(보라 기운 — b > r ≥ g)이다.
//      헤더↔서브바 색 거리가 옛 검은 띠(surface-base)↔서브바 거리보다 작다. 라이트도 불투명 + 옅은 인디고 기운.
//   ② 헤더 호스트에 filter/backdrop-filter/transform/will-change 가 없다(컨테이닝 블록 금지). ::before 에도 backdrop-filter 없음.
//   ③ 알림 패널을 열면 스크림(fixed inset-0)이 **뷰포트 전체**를 덮는다 — 헤더 높이에 갇히지 않는다.
//   ④ 높이(60.5)·로고·알림 버튼 위치·스크롤 축소 뒤 표면색이 그대로다(축소 임계값 계약은 headerShrink 단위 테스트).
//   ⑤ N01: `.card-aura` + `[data-aura]` 를 함께 가진 호스트의 box-shadow 가 **접촉 그림자 + LED 둘 다**를 갖는다(교체가 아니라 합성).
//      forced-colors 에서는 LED 만 빠지고 접촉 그림자는 남는다.
// 못 보는 것: 프로필 이미지 있음/없음(실계정 필요) — 비로그인 + 가짜 세션(로그인 UI)만 본다.
// 음성 대조: index.css 의 `.glass-chrome::before` color-mix 줄을 지우면 ① 이, `.card-aura[data-aura]` 합성 규칙을 지우면 ⑤ 가 실패한다.
// 실행: E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/header-surface.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000c9';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'hdr@example.com', app_metadata: {}, user_metadata: { name: 'HDR' }, created_at: new Date().toISOString() },
};

const rgb = (s: string): [number, number, number, number] | null => {
  const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  const c = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
  if (c) return [+c[1] * 255, +c[2] * 255, +c[3] * 255, c[4] === undefined ? 1 : +c[4]];
  return null;
};
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

async function open(page: Page, theme: 'dark' | 'light', login = false) {
  await page.addInitScript(({ t, l, key, fake }) => {
    try { localStorage.setItem('nuri-theme', t); if (l) localStorage.setItem(key, JSON.stringify(fake)); } catch { /* 차단 */ }
  }, { t: theme, l: login, key: KEY, fake: FAKE });
  if (login) {
    await page.route(/\/auth\/v1\/user/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE.user) }));
    await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: UID, name: 'HDR', nickname: 'hdr', role: 'user', verified: false }) }));
  }
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
}

const surfaces = (page: Page) => page.evaluate(() => {
  const h = document.querySelector<HTMLElement>('header[data-stack-header]')!;
  const cs = getComputedStyle(h); const b = getComputedStyle(h, '::before');
  const sub = document.querySelector<HTMLElement>('.subbar-aura');
  const root = getComputedStyle(document.documentElement);
  return {
    before: b.backgroundColor, beforeBackdrop: b.backdropFilter || (b as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter,
    host: { filter: cs.filter, backdrop: cs.backdropFilter, transform: cs.transform, willChange: cs.willChange, bg: cs.backgroundColor, position: cs.position, h: h.getBoundingClientRect().height, borderColor: cs.borderBottomColor },
    subbar: sub ? getComputedStyle(sub).backgroundColor : '',
    surfaceBase: root.getPropertyValue('--surface-base').trim(),
    logo: h.querySelector<HTMLElement>('button[aria-label="메인으로 이동"]')?.getBoundingClientRect().toJSON(),
    bell: h.querySelector<HTMLElement>('button[aria-label^="알림"]')?.getBoundingClientRect().toJSON(),
  };
});

for (const theme of ['dark', 'light'] as const) {
  test(`🔴 ${theme}: 헤더 표면이 불투명 보라 기운 + 서브바와 같은 계열 · 필터 없음 · 높이/로고/알림 불변`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, theme);
    const s = await surfaces(page);
    const before = rgb(s.before)!; const sub = rgb(s.subbar)!;
    const base = s.surfaceBase.split(/\s+/).map(Number);
    expect(before[3], `헤더 ::before 가 반투명(${s.before}) — 스크롤 콘텐츠가 비친다`).toBe(1);
    expect(s.beforeBackdrop === 'none' || !s.beforeBackdrop, 'backdrop-filter 가 다시 붙었다').toBe(true);
    for (const k of ['filter', 'backdrop'] as const) expect(s.host[k], `헤더 호스트 ${k}`).toBe('none');
    expect(s.host.transform).toBe('none'); expect(s.host.willChange).toBe('auto');
    expect(s.host.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);   // 배경은 ::before 레이어에만(구조 유지)
    if (theme === 'dark') {
      expect(dist(before, base), `헤더가 여전히 순수 surface-base(${s.before}) — 검은 띠`).toBeGreaterThan(6);
      expect(before[2], '보라 기운(b > r)').toBeGreaterThan(before[0]);
      expect(before[0], '보라 기운(r ≥ g)').toBeGreaterThanOrEqual(before[1]);
      expect(dist(before, sub), `헤더↔서브바 거리 ${dist(before, sub).toFixed(1)} ≥ 옛 검은 띠↔서브바 ${dist(base, sub).toFixed(1)}`).toBeLessThan(dist(base, sub));
      // 여전히 서브바보다 어둡다(같은 계열이지 같은 색은 아니다 — 경계는 얇은 선이 담당)
      expect(before[0] + before[1] + before[2]).toBeLessThan(sub[0] + sub[1] + sub[2]);
    } else {
      expect(before[2], '라이트: 옅은 인디고 기운(b ≥ r)').toBeGreaterThanOrEqual(before[0]);
      expect(before[0] + before[1] + before[2], '라이트: 밝은 면').toBeGreaterThan(720);
    }
    expect(s.host.h, '헤더 높이 60.5 불변').toBeCloseTo(60.5, 0);
    expect(s.logo?.x).toBeLessThan(40); expect(s.bell).toBeTruthy();
    // 스크롤 축소 뒤에도 표면색 그대로
    await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(300);
    const s2 = await surfaces(page);
    expect(s2.before).toBe(s.before);
    expect(s2.host.h, '축소 상태 h-11(46.75) + border 1 = 47.75 (N09 전과 동일 실측)').toBeCloseTo(47.75, 0);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    expect((await surfaces(page)).host.h).toBeCloseTo(60.5, 0);
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`🔴 ${theme}: 폭 8종에서 헤더 표면이 불투명·같은 계열이고 헤더가 가로로 넘치지 않는다`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, theme);
    for (const w of [320, 360, 390, 412, 430, 768, 1280, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(250);
      const s = await surfaces(page);
      const before = rgb(s.before)!;
      expect(before[3], `${theme} ${w}px: 반투명 ${s.before}`).toBe(1);
      if (theme === 'dark') { expect(before[2]).toBeGreaterThan(before[0]); expect(before[0]).toBeGreaterThanOrEqual(before[1]); }
      else expect(before[2]).toBeGreaterThanOrEqual(before[0]);
      const ox = await page.evaluate(() => { const h = document.querySelector<HTMLElement>('header[data-stack-header]')!; return h.scrollWidth - h.clientWidth; });
      expect(ox, `${theme} ${w}px: 헤더 가로 넘침`).toBeLessThanOrEqual(1);
    }
  });
}

test('🔴 로그인 UI(가짜 세션)에서도 같은 표면이고, 알림 스크림이 헤더에 갇히지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'dark', true);
  const s = await surfaces(page);
  expect(rgb(s.before)![3]).toBe(1);
  const bell = page.locator('button[aria-label^="알림"]').first();
  await expect(bell).toBeVisible();
  await bell.click();
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => {
    const fixed = Array.from(document.querySelectorAll<HTMLElement>('header[data-stack-header] *')).filter((el) => getComputedStyle(el).position === 'fixed');
    const vw = window.innerWidth, vh = window.innerHeight;
    return { fixed: fixed.map((el) => { const r = el.getBoundingClientRect(); return { cls: String(el.className).slice(0, 40), w: r.width, h: r.height, top: r.top }; }), vw, vh, expanded: document.querySelector('button[aria-label^="알림"][aria-expanded="true"]') != null };
  });
  expect(g.expanded, '알림 패널이 열리지 않았다').toBe(true);
  const scrim = g.fixed.find((f) => f.w >= g.vw - 1 && f.h >= g.vh - 1);
  expect(scrim, `헤더 안 fixed 요소 중 뷰포트를 덮는 것이 없다 — 스크림이 헤더에 갇혔다: ${JSON.stringify(g.fixed)}`).toBeTruthy();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
});

test('🔴 N01: .card-aura + [data-aura] 는 접촉 그림자와 LED 를 합성한다(교체 아님) · forced-colors 는 LED 만 뺀다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'dark');
  const g = await page.evaluate(() => {
    const mk = (attrs: Record<string, string>) => { const d = document.createElement('div'); d.className = 'card-aura rounded-aura border'; for (const [k, v] of Object.entries(attrs)) d.setAttribute(k, v); document.body.appendChild(d); const s = getComputedStyle(d).boxShadow; d.remove(); return s; };
    return { plain: mk({}), led: mk({ 'data-aura': '', 'data-aura-level': 'hero', 'data-aura-variant': 'violet' }), ledOnly: (() => { const d = document.createElement('div'); d.setAttribute('data-aura', ''); d.setAttribute('data-aura-level', 'hero'); document.body.appendChild(d); const s = getComputedStyle(d).boxShadow; d.remove(); return s; })() };
  });
  // 순수 [data-aura] 의 LED 색(violet 139 92 246 / .19)이 card-aura 호스트의 그림자 목록에도 있고, card-aura 의 접촉 그림자(inset 하이라이트)도 남아 있다
  expect(g.ledOnly).toMatch(/rgba\(139, 92, 246, 0\.19\)/);
  expect(g.led, `card-aura + data-aura 가 LED 를 잃었다: ${g.led}`).toMatch(/rgba\(139, 92, 246, 0\.19\)/);
  expect(g.led, `card-aura + data-aura 가 접촉 그림자를 잃었다: ${g.led}`).toMatch(/inset/);
  expect(g.led).not.toBe(g.plain);
  await page.emulateMedia({ forcedColors: 'active' });
  const f = await page.evaluate(() => { const d = document.createElement('div'); d.className = 'card-aura'; d.setAttribute('data-aura', ''); d.setAttribute('data-aura-level', 'hero'); document.body.appendChild(d); const s = getComputedStyle(d).boxShadow; d.remove(); return s; });
  expect(f, 'forced-colors 에서 LED 가 남았다').not.toMatch(/139, 92, 246/);
  await page.emulateMedia({ forcedColors: 'none' });
});
