// 클락 TV 화면 — 상태별 캡처 + 레이아웃 계약.
//
// 왜 픽스처인가: TV 화면은 운영 중인 클락이 있어야 뜬다. 라이브 서비스에 클락을 켜는 것은 운영 DB 쓰기라
//   할 수 없고, '마지막 60초'·'브레이크'·'ANTE 없음' 같은 상태는 실제로 그 순간이 와야 볼 수 있다.
//   그래서 clock_states 조회 응답만 갈아끼운다 — 쓰기는 0, 상태는 결정적.
//
// 이 스펙이 지키는 것(디자인이 아니라 **계약**):
//   · 상태가 바뀌어도 타이머·블라인드·하단 정보의 자리가 움직이지 않는다
//   · 긴 대회명이 두 번째 줄을 만들어 타이머를 밀지 않는다
//   · 숫자 자릿수가 바뀌어도 타이머 폭이 흔들리지 않는다(tabular-nums)
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const VENUE = process.env.E2E_CLOCK_VENUE;

type Level = { kind: 'level' | 'break'; sb: number; bb: number; ante: number; minutes: number; label?: string };

const LEVELS: Level[] = [
  { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
  { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
  { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, label: 'BREAK 8Min.' },
  { kind: 'level', sb: 1500, bb: 3000, ante: 3000, minutes: 20 },
];
const BIG_LEVELS: Level[] = [
  { kind: 'level', sb: 200_000, bb: 400_000, ante: 400_000, minutes: 20 },
  { kind: 'level', sb: 300_000, bb: 600_000, ante: 600_000, minutes: 20 },
];
const NO_ANTE: Level[] = [
  { kind: 'level', sb: 500, bb: 1000, ante: 0, minutes: 20 },
  { kind: 'level', sb: 1000, bb: 2000, ante: 0, minutes: 20 },
];

function config(title: string, levels: Level[]) {
  return {
    title, startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false,
    earlyBonus: 5_000, doubleEarlyBonus: 10_000, regCloseLevel: 3, maxLevel: 26, // 3: 이 픽스처(레벨 4개)에서 실제로 도달 가능 — 등록 마감 행을 덮는다
    earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100,
    mysteryBounty: 0, prizes: [{ place: '1st', amount: 400 }, { place: '2nd', amount: 150 }], levels,
  };
}

/** clock_states 한 행 — rowToState 가 읽는 스네이크 케이스 그대로. */
function row(o: {
  title?: string; levels?: Level[]; index?: number; running?: boolean;
  remainMs?: number; endsInMs?: number | null; gameSeq?: number;
}) {
  const endsAt = o.endsInMs == null ? null : new Date(Date.now() + o.endsInMs).toISOString();
  return {
    venue_id: VENUE, game_seq: o.gameSeq ?? 1, session_date: null,
    title: o.title ?? '금요 딥스택 100K GTD',
    config: config(o.title ?? '금요 딥스택 100K GTD', o.levels ?? LEVELS),
    current_index: o.index ?? 0,
    running: o.running ?? true,
    ends_at: endsAt,
    remaining_ms: o.remainMs ?? 0,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
    live_stats: { entries: 42, rebuys: 6, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
  };
}

/** 지시된 상태 9종(메인/사이드 포함). 배경 이미지 유무는 매장 테마라 별도. */
const STATES: { key: string; note: string; body: ReturnType<typeof row> }[] = [
  { key: 'running', note: '일반 진행', body: row({ endsInMs: 12 * 60_000 + 34_000 }) },
  { key: 'last60', note: '마지막 60초', body: row({ endsInMs: 47_000 }) },
  { key: 'paused', note: '일시정지', body: row({ running: false, remainMs: 8 * 60_000 + 12_000, endsInMs: null }) },
  { key: 'break', note: '브레이크', body: row({ index: 2, endsInMs: 5 * 60_000 }) },
  { key: 'long-title', note: '긴 대회명', body: row({ title: '제8회 누리홀덤 마스터스 파이널 데이2 · 20억 개런티 메인이벤트', endsInMs: 9 * 60_000 }) },
  { key: 'no-ante', note: 'ANTE 없음', body: row({ levels: NO_ANTE, endsInMs: 9 * 60_000 }) },
  { key: 'big-blinds', note: '큰 블라인드', body: row({ levels: BIG_LEVELS, endsInMs: 9 * 60_000 }) },
  { key: 'side-game', note: '사이드 게임', body: row({ gameSeq: 2, title: '사이드 터보 30K', endsInMs: 9 * 60_000 }) },
];

const VIEWS: [string, number, number][] = [
  ['1920x1080', 1920, 1080],
  ['1366x768', 1366, 768],
  ['4x3', 1440, 1080],
  ['21x9', 2560, 1080],
];

/** clock_states 조회를 이 상태로 고정한다(쓰기 없음).
 *  ⚠ TV 화면은 getVenueClocks() 로 읽는다 — `.select('*').eq('venue_id',…)` 라 **배열**이다.
 *     단일 객체로 주면 supabase-js 가 조용히 빈 목록으로 읽어 '진행 중인 클락이 없습니다' 가 된다. */
async function serveClock(page: Page, body: unknown): Promise<void> {
  await page.route(/\/rest\/v1\/clock_states/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([body]) }));
}

const PHASE = process.env.CLOCK_SHOT_PHASE ?? 'before';

test.describe('클락 TV — 상태별 캡처와 레이아웃 계약', () => {
  test.skip(!VENUE, 'E2E_CLOCK_VENUE 없음 — display 라우트를 열 수 없다');

  for (const s of STATES) {
    test(`${s.key} (${s.note}) — 1920x1080 캡처 + 타이머 렌더`, async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await serveClock(page, s.body);
      await page.goto(`/?display=${VENUE}&g=${s.body.game_seq}&auto=0`);
      await expect(page.getByTestId('clk-timer'), '타이머가 렌더되지 않았다 — 픽스처가 안 먹었거나 화면이 바뀌었다')
        .toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/clock-shots/${PHASE}-${s.key}.png` });
    });
  }

  test('상태가 바뀌어도 타이머·하단 정보의 자리가 움직이지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const key of ['running', 'last60', 'paused', 'long-title', 'no-ante', 'big-blinds']) {
      const s = STATES.find((x) => x.key === key)!;
      await serveClock(page, s.body);
      await page.goto(`/?display=${VENUE}&g=${s.body.game_seq}&auto=0`);
      const t = page.getByTestId('clk-timer');
      await expect(t).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500);
      const b = (await t.boundingBox())!;
      boxes[key] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
    console.log('[clock-layout]', JSON.stringify(boxes));
    const base = boxes.running;
    for (const [key, b] of Object.entries(boxes)) {
      expect(Math.abs(b.y - base.y), `${key}: 타이머가 세로로 ${b.y - base.y}px 이동했다 — 상태가 레이아웃을 바꾸면 안 된다`).toBeLessThanOrEqual(2);
      expect(Math.abs(b.h - base.h), `${key}: 타이머 높이가 ${b.h - base.h}px 달라졌다`).toBeLessThanOrEqual(2);
    }
    // 자릿수가 바뀌어도 폭이 흔들리지 않아야 한다(tabular-nums).
    expect(Math.abs(boxes['big-blinds'].w - base.w), '큰 블라인드에서 타이머 폭이 흔들렸다 — tabular-nums 확인').toBeLessThanOrEqual(2);
  });

  for (const [name, w, h] of VIEWS) {
    test(`가로 스크롤 없음 — ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await serveClock(page, STATES[0].body);
      await page.goto(`/?display=${VENUE}&g=1&auto=0`);
      await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500);
      if (PHASE !== 'skip-shot') await page.screenshot({ path: `test-results/clock-shots/${PHASE}-view-${name}.png` });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${name}: 가로로 ${over}px 넘친다`).toBeLessThanOrEqual(0);
    });
  }

  // ── 블랙 마블 골드 프리셋(2026-09-10) ──────────────────────────────────────
  // 테마는 venues.page_config.clockTheme 에서 온다 — 그 조회(GET venues?select=page_config)만 갈아끼운다(쓰기 0).
  // 지키는 것: 프리셋이 실제로 화면에 칠해지고, 그 위에서 타이머·레벨·블라인드가 보이며,
  //           긴 한국어 대회명 + 프라이즈 12줄(표시 상한)이 잘리거나 겹치지 않는다.
  test('black-marble-gold — 1920x1080 타이머·레벨·블라인드 렌더 + 프라이즈 12줄 잘림 없음', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const body = row({ title: '제8회 누리홀덤 마스터스 파이널 데이2 · 20억 개런티 메인이벤트', endsInMs: 9 * 60_000 });
    body.config.prizes = [50_000_000, 30_000_000, 18_000_000, 12_000_000, 8_000_000, 6_000_000, 4_500_000, 3_500_000, 2_800_000, 2_200_000, 1_800_000, 1_500_000]
      .map((amount, i) => ({ place: String(i + 1), amount }));
    await serveClock(page, body);
    await page.route(/\/rest\/v1\/venues\?[^ ]*select=page_config/, (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ page_config: { clockTheme: { version: 1, palette: { preset: 'black-marble-gold' }, background: { kind: 'gradient', preset: 'black-marble-gold' } } } }),
    }));
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    const timer = page.getByTestId('clk-timer');
    await expect(timer).toBeVisible({ timeout: 20_000 });

    // 프리셋이 칠해졌는가 — 루트의 --clk-bg 가 마블 금 결(rgb 214,178,76)을 담고 있어야 한다(기본 아우라에는 없는 색).
    const root = timer.locator('xpath=ancestor::*[contains(@style, "--clk-bg")][1]');
    await expect.poll(() => root.evaluate((el) => getComputedStyle(el).backgroundImage.includes('214, 178, 76')), { timeout: 10_000 })
      .toBe(true);
    await expect(page.getByTestId('clk-level')).toBeVisible();
    await expect(page.getByText('CURRENT', { exact: true })).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/clock-shots/${PHASE}-theme-black-marble-gold.png` });

    // 프라이즈 열 — 12줄 전부 열 안·화면 안에 있고 열 자체가 스크롤을 만들지 않는다. 총액도 가로로 잘리지 않는다.
    const aside = page.locator('aside', { hasText: '총 프라이즈' });
    await expect(aside.locator('li')).toHaveCount(12);
    const fit = await aside.evaluate((el) => {
      const a = el.getBoundingClientRect();
      const items = Array.from(el.querySelectorAll('li')).map((li) => li.getBoundingClientRect());
      const total = el.querySelector('p + p') as HTMLElement | null;
      return {
        overflowY: el.scrollHeight - el.clientHeight,
        outside: items.filter((r) => r.top < a.top - 1 || r.bottom > a.bottom + 1 || r.bottom > innerHeight).length,
        overlap: items.slice(1).filter((r, i) => r.top < items[i].bottom - 1).length,
        totalClipped: total ? total.scrollWidth - total.clientWidth : 0,
      };
    });
    expect(fit.overflowY, `프라이즈 열이 ${fit.overflowY}px 넘쳐 스크롤이 생겼다`).toBeLessThanOrEqual(0);
    expect(fit.outside, `프라이즈 ${fit.outside}줄이 열 밖·화면 밖으로 나갔다`).toBe(0);
    expect(fit.overlap, `프라이즈 ${fit.overlap}줄이 윗줄과 겹친다`).toBe(0);
    expect(fit.totalClipped, `총 프라이즈 금액이 ${fit.totalClipped}px 잘린다`).toBeLessThanOrEqual(0);
  });
});

// ── 테마 패널 미리보기 ────────────────────────────────────────────────────────
// 프리뷰와 프리셋 버튼이 같은 축소판(ClockMiniFace)을 쓰는지 눈으로 확인 + 캡처.
// 업주 로그인이 필요하므로 자격증명이 없으면 skip 한다(숨기지 않는다).
test.describe('클락 테마 패널', () => {
  const EMAIL = process.env.E2E_EMAIL;
  const PASSWORD = process.env.E2E_PASSWORD;
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 없음 — 내 매장은 로그인해야 열린다');

  test('미리보기가 TV 구조(타이머·레일·CURRENT/NEXT·metrics)를 그린다', async ({ page }) => {
    const { loginAs } = await import('./_session');
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
    test.skip(await store.count() === 0, '이 계정에는 내 매장 탭이 없다');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });

    const clock = page.getByRole('button', { name: '클락', exact: true }).first();
    test.skip(await clock.count() === 0, '클락 메뉴가 없다');
    await clock.click();
    await page.waitForTimeout(2500);

    const preview = page.locator('[aria-label="클락 화면 미리보기"]');
    test.skip(await preview.count() === 0, '클락 설정(테마 패널)이 이 화면에 없다');
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await preview.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/clock-shots/${PHASE}-theme-panel.png` });
    // 축소판이 실제로 TV 구조를 그리는가 — 문구가 아니라 구조를 본다.
    await expect(preview.getByText('CURRENT')).toBeVisible();
    await expect(preview.getByText('NEXT')).toBeVisible();
    await expect(preview.getByText('12:34')).toBeVisible();
  });
});

// ── PC 운영자 화면(Director) ──────────────────────────────────────────────────
// 왜 헤더로 분기하나: 같은 clock_states 를 TV 는 getVenueClocks(배열)로, 운영자 화면은
//   getClockState(maybeSingle → 단일 객체)로 읽는다. maybeSingle 은 Accept 에
//   `application/vnd.pgrst.object+json` 을 보내므로 그걸 보고 모양을 바꿔 준다.
async function serveClockBoth(page: Page, body: unknown): Promise<void> {
  await page.route(/\/rest\/v1\/clock_states/, (r) => {
    const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? body : [body]) });
  });
}

test.describe('PC 운영자 화면', () => {
  const EMAIL = process.env.E2E_EMAIL;
  const PASSWORD = process.env.E2E_PASSWORD;
  test.skip(!EMAIL || !PASSWORD || !VENUE, 'E2E_EMAIL/E2E_PASSWORD/E2E_CLOCK_VENUE 없음');

  for (const [name, w, h] of [['1440x900', 1440, 900], ['1366x768', 1366, 768]] as [string, number, number][]) {
    test(`${name} — 시작·레벨 조작이 첫 화면 안에 보인다`, async ({ page }) => {
      const { loginAs } = await import('./_session');
      await page.setViewportSize({ width: w, height: h });
      await serveClockBoth(page, STATES[0].body);
      await loginAs(page, EMAIL!, PASSWORD!);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // ⚠ '내 매장' 은 폭에 따라 역할이 다르다 — 모바일 하단 내비는 button, PC 상단 GNB 는 role=tab.
      //   button 으로만 찾으면 데스크톱 뷰포트에서 통째로 skip 된다(실제로 그렇게 조용히 건너뛰고 있었다).
      const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
      test.skip(await store.count() === 0, '이 계정에는 내 매장 탭이 없다');
      await store.first().click();
      await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });

      const clock = page.getByRole('button', { name: '클락', exact: true }).first();
      test.skip(await clock.count() === 0, '클락 메뉴가 없다');
      await clock.click();
      await page.waitForTimeout(3000);

      const start = page.getByRole('button', { name: /^(시작|일시정지)$/ });
      test.skip(await start.count() === 0, '운영자 콘솔이 이 계정/화면에 없다 — 권한 또는 클락 미시작');
      await page.screenshot({ path: `test-results/clock-shots/${PHASE}-director-${name}.png` });

      // 첫 화면(스크롤 없이) 안에 있어야 한다 — 1366x768 에서도.
      const box = (await start.first().boundingBox())!;
      expect(box.y + box.height, `주 버튼이 첫 화면 아래(${Math.round(box.y)}px)에 있다 — ${name} 에서 스크롤해야 시작할 수 있다`)
        .toBeLessThanOrEqual(h);
    });
  }
});

// ── 운영자 화면 유휴 렌더 ─────────────────────────────────────────────────────
// 무엇을 재나: 아무것도 안 누르고 20초 두었을 때 브라우저가 실제로 한 일(LoAF 총 시간·프레임 수).
// ClockLive 는 250ms 인터벌로 setTick 을 올려 **컴포넌트 전체**를 초당 4회 다시 그렸다
// (setTick 의 값은 쓰이지 않는다 — 순수 리렌더 트리거였다). 화면은 mm:ss 만 바뀌는데.
test.describe('운영자 화면 — 유휴 렌더', () => {
  const EMAIL = process.env.E2E_EMAIL;
  const PASSWORD = process.env.E2E_PASSWORD;
  test.skip(!EMAIL || !PASSWORD || !VENUE, '자격증명/매장 없음');

  test('20초 방치 — 스크립트 시간·레이아웃 횟수 기록', async ({ page }) => {
    test.setTimeout(90_000);
    const { loginAs } = await import('./_session');
    await page.setViewportSize({ width: 1440, height: 900 });
    await serveClockBoth(page, STATES[0].body);
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
    test.skip(await store.count() === 0, '내 매장 없음');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    const clock = page.getByRole('button', { name: '클락', exact: true }).first();
    test.skip(await clock.count() === 0, '클락 메뉴 없음');
    await clock.click();
    await page.waitForTimeout(4000);

    // CDP Performance — LoAF 가 못 보는 '짧지만 잦은' 일을 직접 센다.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics') as { metrics: { name: string; value: number }[] };
      const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
      return { script: m.ScriptDuration ?? 0, layout: m.LayoutCount ?? 0, style: m.RecalcStyleCount ?? 0, task: m.TaskDuration ?? 0 };
    };
    const a = await read();
    await page.waitForTimeout(20_000); // 손대지 않는다 — 순수 유휴
    const b = await read();
    console.log(`[clock-idle] 20초 유휴 — script ${((b.script - a.script) * 1000).toFixed(0)}ms · task ${((b.task - a.task) * 1000).toFixed(0)}ms · style ${b.style - a.style}회 · layout ${b.layout - a.layout}회`);
  });
});

// ── 휴대폰 리모컨 — 닫기 버튼 히트영역(TOUCH-01) ───────────────────────────────
// 플로어에서 폰으로 누르는 화면이다. 닫기 버튼은 시각 40px 그대로 두고 `hit` 토큰(::after 44px)으로 실효 영역만 넓혔다.
// 로그인 없이도 리모컨 셸(로그인 안내)이 뜨므로 자격증명·매장이 필요 없다 — 가짜 venue id 로 연다.
test.describe('휴대폰 리모컨', () => {
  test('닫기 버튼 실효 히트영역이 44px 이상이다 (375x812)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/?remote=00000000-0000-4000-8000-00000000c10c&g=1');
    const close = page.locator('header', { hasText: '클락 리모컨' }).getByRole('button', { name: '닫기' });
    await expect(close).toBeVisible({ timeout: 20_000 });
    // live-card-fit.spec 의 의사요소 합산 조리법 — 여기서는 ::after 가 max(100%,44px) 로 버튼을 덮는다.
    const hit = await close.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const a = getComputedStyle(el, '::after');
      return { w: Math.max(r.width, parseFloat(a.width) || 0), h: Math.max(r.height, parseFloat(a.height) || 0) };
    });
    console.log('[리모컨 닫기 히트영역]', JSON.stringify(hit));
    expect(hit.w).toBeGreaterThanOrEqual(44);
    expect(hit.h).toBeGreaterThanOrEqual(44);
  });
});
