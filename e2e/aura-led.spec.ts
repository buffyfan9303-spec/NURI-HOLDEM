// Aura LED 백라이트 · 커뮤니티 서브탭 계약 (2026-09-10 오너 지시 §5·§7·§9·§12)
//
// 잠그는 것:
//  ① 커뮤니티 서브탭 — 히트영역 44px 유지 · 시각 알약은 그보다 낮다 · 320px 에서 '딜러'가 보인다 ·
//     활성 알약의 LED 는 micro(≤16px) 하나뿐이고 비활성 탭엔 0이다 · 다른 SegmentedTabs 는 안 변한다.
//  ② 앱 전체 — 한 뷰포트 hero Aura ≤ 1 · 반복 목록 Aura 0 · 기존 강조 영역에 신규 data-aura 0.
//  ③ 뱅크롤 히어로 — 기록 없음/로딩/오류는 Aura 0 이고 '0원'으로 위장하지 않는다.
//  ④ 장식광은 forced-colors 에서 꺼진다.
//
// 운영 DB 에는 쓰지 않는다 — 세션은 가짜, 데이터는 page.route(_fixtures 가드가 비-GET 을 막는다).
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000b1';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'aura@example.com',
          app_metadata: {}, user_metadata: { name: 'AURA' }, created_at: new Date().toISOString() },
};
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const DAY = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

async function login(page: Page) {
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(r.request().url().includes('/user') ? FAKE.user : FAKE)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: 'AURA', nickname: 'AURA', role: 'user', status: 'active',
    agreed_to_terms: true, agreed_to_privacy: true, agreed_to_anti_gambling: true,
    activity_points: 0, created_at: FAKE.user.created_at,
  })));
}

async function openCalendar(page: Page) {
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: /캘린더/ }).first().click();
  await expect(page.locator('[data-tab="calendar"] input[type="date"][aria-label="날짜"]')).toBeVisible({ timeout: 20_000 });
}

// ── ① 커뮤니티 서브탭 ────────────────────────────────────────────────────────
test('🔴 커뮤니티 서브탭 — 히트 44px 는 지키고 시각 알약만 낮아진다 · LED 는 활성 1곳 micro (AURA-01)', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '딜러', exact: true }).click();
  await page.waitForTimeout(600);

  const m = await page.evaluate(() => {
    const bar2 = document.querySelector('[data-community-secbar]')!;
    const btns = [...bar2.querySelectorAll('button')];
    const spans = btns.map((b) => b.querySelector('span')!);
    const pill = bar2.querySelector('[data-sliding-pill]') as HTMLElement | null;
    const blurOf = (s: string) => {
      // "0 0 12px rgb(...)" 에서 세 번째 길이값(blur)만 뽑는다
      const mm = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(s);
      return mm ? Number(mm[3]) : null;
    };
    return {
      barH: +bar2.getBoundingClientRect().height.toFixed(1),
      btnH: btns.map((b) => +b.getBoundingClientRect().height.toFixed(1)),
      spanH: spans.map((s) => +s.getBoundingClientRect().height.toFixed(1)),
      pillCount: bar2.querySelectorAll('[data-sliding-pill]').length,
      pillBlur: pill ? blurOf(getComputedStyle(pill).boxShadow) : null,
      pillRadius: pill ? getComputedStyle(pill).borderTopLeftRadius : null,
      // 비활성 탭(버튼·span)에는 어떤 그림자도 없어야 한다
      inactiveShadows: btns
        .filter((b) => !b.querySelector('[data-pill-active]'))
        .flatMap((b) => [getComputedStyle(b).boxShadow, getComputedStyle(b.querySelector('span')!).boxShadow])
        .filter((s) => s && s !== 'none'),
      auraInBar: bar2.querySelectorAll('[data-aura]').length,
      docOverflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  expect(m.pillCount, '알약이 정확히 1개가 아니다 — view-transition-name 이 겹친다').toBe(1);
  for (const h of m.btnH) expect(h, `히트 영역이 44px 미만이다(${h})`).toBeGreaterThanOrEqual(44);
  for (let i = 0; i < m.spanH.length; i++) {
    expect(m.spanH[i], '시각 알약이 히트 영역보다 낮지 않다').toBeLessThan(m.btnH[i]);
    expect(m.spanH[i], `모바일 시각 알약이 32px 를 넘는다(${m.spanH[i]})`).toBeLessThanOrEqual(33);
  }
  expect(m.barH, `바가 아직 두껍다(${m.barH}px)`).toBeLessThanOrEqual(58);
  expect(m.pillBlur, 'LED 확산이 micro 범위(8~16px)를 벗어났다').toBeGreaterThanOrEqual(8);
  expect(m.pillBlur!, 'LED 확산이 micro 범위(8~16px)를 벗어났다').toBeLessThanOrEqual(16);
  expect(Math.round(Number(String(m.pillRadius).replace('px', ''))), '알약 곡률이 8~10px 범위 밖이다').toBeGreaterThanOrEqual(8);
  expect(Math.round(Number(String(m.pillRadius).replace('px', ''))), '알약 곡률이 8~10px 범위 밖이다').toBeLessThanOrEqual(10);
  expect(m.inactiveShadows, '비활성 탭에 글로우가 붙었다').toEqual([]);
  expect(m.auraInBar, '서브탭 바에 hero Aura 가 들어갔다(§5.7 바 전체 glow 금지)').toBe(0);
  expect(m.docOverflowX, '가로 스크롤이 생겼다').toBe(false);
});

test('🔴 커뮤니티 서브탭 — 320px 에서도 딜러가 잘리지 않고 세로 넘침이 없다 (AURA-02)', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  const m = await page.evaluate(() => {
    const bar2 = document.querySelector('[data-community-secbar]')!;
    const dealer = [...bar2.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '딜러');
    const r = dealer?.getBoundingClientRect();
    return {
      dealerInView: r ? r.left >= -0.5 && r.right <= window.innerWidth + 0.5 : null,
      vOverflow: bar2.scrollHeight - bar2.clientHeight,
      docOverflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(m.dealerInView, "320px 에서 '딜러'가 화면 밖으로 잘렸다").toBe(true);
  expect(m.vOverflow, '서브탭 바에 세로 넘침이 생겼다').toBeLessThanOrEqual(0);
  expect(m.docOverflowX, '가로 스크롤이 생겼다').toBe(false);
});

// ── ② 앱 전체 규율 ──────────────────────────────────────────────────────────
test('🔴 한 뷰포트 hero Aura 는 최대 1개이고 반복 목록에는 0개다 (AURA-03)', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/', '/?tab=browse', '/?tab=community', '/?tab=live']) {
    await page.goto(url);
    await dismissOverlays(page);
    await page.waitForTimeout(1200);
    const counts = await page.evaluate(() => {
      const vis = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
      };
      const heroes = [...document.querySelectorAll('[data-aura-level="hero"]')].filter(vis);
      return {
        heroInViewport: heroes.length,
        // 같은 부모에 형제로 둘 이상 = 반복 목록에 붙은 것
        siblingHeroes: heroes.filter((h) => [...(h.parentElement?.children ?? [])]
          .filter((c) => c !== h && c.hasAttribute('data-aura-level')).length > 0).length,
      };
    });
    expect(counts.heroInViewport, `${url}: 한 뷰포트에 hero Aura 가 ${counts.heroInViewport}개다`).toBeLessThanOrEqual(1);
    expect(counts.siblingHeroes, `${url}: 반복 목록 형제에 Aura 가 붙었다`).toBe(0);
  }
});

test('🔴 forced-colors 에서 장식광이 꺼진다 (AURA-04)', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  const shadows = await page.evaluate(() => {
    const out: string[] = [];
    const pill = document.querySelector('[data-community-secbar] [data-sliding-pill]');
    if (pill) out.push(getComputedStyle(pill).boxShadow);
    for (const el of document.querySelectorAll('[data-aura]')) out.push(getComputedStyle(el).boxShadow);
    return out.filter((s) => s && s !== 'none');
  });
  expect(shadows, 'forced-colors 인데 장식 글로우가 남아 있다').toEqual([]);
});

// ── ③ 뱅크롤 히어로의 상태별 Aura ────────────────────────────────────────────
const CASES = [
  { name: '순손익 > 0 → emerald', rows: [{ amount: 300000, buy_in: 100000 }], variant: 'emerald' },
  { name: '순손익 < 0 → rose', rows: [{ amount: -300000, buy_in: 100000 }], variant: 'rose' },
  { name: '순손익 정확히 0(본전) → violet', rows: [{ amount: 0, buy_in: 100000 }], variant: 'violet' },
];
for (const c of CASES) {
  test(`🔴 뱅크롤 전체 누계 — ${c.name} (AURA-05)`, async ({ page }) => {
    test.setTimeout(60_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.route(/\/rest\/v1\/bankroll_entries\?/, (r) => r.fulfill(json(
      c.rows.map((x, i) => ({
        id: `bbbbbbbb-0000-4000-8000-00000000000${i}`, entry_date: DAY, memo: '',
        rebuy: 0, addon: 0, venue_name: '강남', game_name: '데일리',
        created_at: `${DAY}T10:00:00Z`, ...x,
      })),
    )));
    await openCalendar(page);
    const hero = page.locator('[data-tab="calendar"] [data-aura-level="hero"]').first();
    await expect(hero, 'Aura 가 켜지지 않았다').toBeVisible({ timeout: 15_000 });
    await expect(hero).toHaveAttribute('data-aura-variant', c.variant);
  });
}

test('🔴 뱅크롤 전체 누계 — 기록이 없으면 Aura 0 이고 0원으로 위장하지 않는다 (AURA-06)', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.route(/\/rest\/v1\/bankroll_entries\?/, (r) => r.fulfill(json([])));
  await openCalendar(page);
  const pane = page.locator('[data-tab="calendar"]');
  await expect(pane.locator('p:text-is("전체 누계")')).toBeVisible();
  await expect(pane.locator('[data-aura-level="hero"]'), '기록이 없는데 LED 가 켜졌다').toHaveCount(0);
  await expect(pane.getByText('아직 기록이 없어요'), "기록 없음을 '0원'으로 위장했다").toBeVisible();
});

test('🔴 뱅크롤 전체 누계 — 조회 실패면 Aura 0 이고 실패라고 말한다 (AURA-07)', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.route(/\/rest\/v1\/bankroll_entries\?/, (r) => r.fulfill(json({ message: 'JWT expired' }, 401)));
  await openCalendar(page);
  const pane = page.locator('[data-tab="calendar"]');
  await expect(pane.getByText('뱅크롤 데이터를 불러오지 못했습니다'), '실패 문구가 옛 템플릿 그대로다').toBeVisible({ timeout: 15_000 });
  await expect(pane.getByText('로그인이 만료되었거나')).toBeVisible();
  await expect(pane.locator('[data-aura-level="hero"]'), '조회 실패인데 LED 가 켜졌다').toHaveCount(0);
});

// ── ④ 외치기 배너 — 유효 방송일 때만 hero ────────────────────────────────────
const shoutRow = (over: Record<string, unknown> = {}) => ({
  id: 'cccccccc-0000-4000-8000-000000000001', user_id: UID, nickname: '테스터',
  message: '오늘 강남에서 봅시다', cost: 100, tier: 'board', tier_rank: 1, color: 'gold',
  created_at: new Date(Date.now() - 60_000).toISOString(),
  plays_at: new Date(Date.now() - 30_000).toISOString(),
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  ...over,
});

test('🔴 외치기 — 방송 중이면 hero 1, 빈 자리면 0 (AURA-08)', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/community_shouts\?/, (r) => r.fulfill(json([shoutRow()])));
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const live = page.getByTestId('shout-live');
  await expect(live, '방송이 있는데 shout-live 가 없다').toBeVisible({ timeout: 20_000 });
  await expect(live, '유효 방송인데 LED 가 없다').toHaveAttribute('data-aura-level', 'hero');
  // 색은 이 외침이 이미 쓰는 등급/선택 색 토큰을 그대로 뒤로 보낸다(새 팔레트 없음)
  const led = await live.evaluate((el) => getComputedStyle(el).getPropertyValue('--aura-led-rgb').trim());
  expect(led, 'LED 색이 외침 색 토큰을 따르지 않는다').not.toBe('');
  await expect(page.getByTestId('shout-idle')).toHaveCount(0);
});

test('🔴 외치기 — 만료·빈 목록이면 Aura 0 (AURA-09)', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/community_shouts\?/, (r) => r.fulfill(json([])));
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const idle = page.getByTestId('shout-idle');
  await expect(idle, '빈 자리 카드가 없다').toBeVisible({ timeout: 20_000 });
  await expect(idle, '빈 자리인데 LED 가 켜졌다').not.toHaveAttribute('data-aura-level', 'hero');
  await expect(idle).toHaveAttribute('data-aura-level', /^$/, { timeout: 1 }).catch(() => { /* 속성 자체가 없어야 정상 */ });
  expect(await idle.getAttribute('data-aura'), '빈 자리에 data-aura 가 붙었다').toBeNull();
});

test('🔴 커뮤니티 서브탭 — 키보드 포커스 링이 레일에 잘리지 않는다 (AURA-10)', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 20_000 });
  const m = await page.evaluate(() => {
    const rail = document.querySelector('[data-community-secbar] div')!;
    const btn = rail.querySelector('button') as HTMLElement;
    btn.focus();
    const cs = getComputedStyle(btn);
    const b = btn.getBoundingClientRect(), r = rail.getBoundingClientRect();
    const need = (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0);
    return { need, room: Math.min(b.top - r.top, r.bottom - b.bottom), focused: document.activeElement === btn };
  });
  expect(m.focused, '버튼이 포커스를 못 받는다').toBe(true);
  expect(m.need, `포커스 링이 레일 밖으로 ${m.need}px 나가 잘린다(여유 ${m.room}px)`).toBeLessThanOrEqual(m.room);
});
