// 이벤트 참여권 매장 로고(오너 2026-10-09 "로티아레나 출석 이벤트에 로티아레나 로고 넣어서 진행해").
//
// 계약
//   ① 로고가 있으면 이벤트 판 머리(선물 타일 자리) · 홈 이벤트 슬라이드(오른쪽 위) · 이벤트 목록(선물 타일 자리)에 그려진다.
//   ② 로고 자리는 **새로 생기지 않는다** — 판 머리의 제목·카드판, 슬라이드의 글자, 목록 줄의 상자는 로고 없을 때와 같은 좌표다.
//      로고 그림이 늦게 와도(이미지 지연 목) 그 사이·뒤에 움직인 요소가 없다(layout-shift 합 = 로고 없을 때와 같음).
//   ③ 로고를 못 불러오면(404) 기존 화면 그대로 — 판·목록은 선물 타일, 슬라이드는 로고 없음(깨진 그림 아이콘 금지).
// 운영 DB 에 쓰지 않는다 — event_campaigns(로고 끼워 받기 포함)·event_board·home_banners 는 page.route 목이다(_fixtures 가 쓰기도 끊는다).
// 실행: E2E_BASE_URL=http://localhost:4280 npx playwright test e2e/event-venue-logo.spec.ts
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';
import { MOCK_EVENT_SLUG, mockEventBoard, mockEventCampaigns } from './_mocks';

const DIALOG = '[role="dialog"][aria-label="이벤트"]';
const LOGO = 'img[data-testid="event-venue-logo"]';
const ROTI = { name: '로티아레나', image_url: '/venues/roti-arena.webp' };   // 운영 로티아레나 venues.image_url 과 같은 로컬 파일
const MISSING = { name: '로티아레나', image_url: '/venues/__e2e-missing-logo.webp' };
const j = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

type Rect = [number, number, number, number];

/** brand = event_campaigns 의 끼워 받은 매장(v). null = 로고 없음(기준선). 같은 page 에서 바꿔 가며 다시 연다. */
async function setup(page: Page) {
  const state: { brand: unknown } = { brand: null };
  await page.addInitScript(() => {
    const w = window as unknown as { __ls: number };
    w.__ls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__ls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.route(/\/rest\/v1\/event_campaigns\?/, (r) => j(r, mockEventCampaigns().map((x) => ({ ...x, v: state.brand }))));
  await page.route(/\/rest\/v1\/rpc\/event_board/, (r) => j(r, mockEventBoard(12)));
  await page.route(/\/rest\/v1\/home_banners\?/, (r) => j(r, []));   // 운영 배너가 ?event= 로 이벤트 슬라이드를 대신하지 않게
  // 로고 그림을 600ms 늦게 — '자리 먼저, 그림 나중' 사이에 움직이는 것이 있으면 아래 좌표·shift 단언이 잡는다.
  await page.route((u) => u.pathname.startsWith('/venues/roti-arena'), async (r) => { await new Promise((res) => setTimeout(res, 600)); return r.continue(); });
  await page.route((u) => u.pathname.startsWith('/venues/__e2e-missing-logo'), (r) => r.fulfill({ status: 404, body: '' }));
  await stabilizeBackstack(page);
  return state;
}

/** 이벤트 판 머리 — 로고/선물 타일 칸 · 제목 · 카드판의 좌표, 그리고 그 칸이 무엇인지. */
async function openBoard(page: Page) {
  await page.goto(`/?event=${MOCK_EVENT_SLUG}`);
  const dlg = page.locator(DIALOG);
  await expect(dlg.locator('section h2').first()).toHaveText('오픈 기념 이벤트', { timeout: 20_000 });
  return dlg;
}
const boardGeo = (page: Page) => page.locator(DIALOG).evaluate((d) => {
  const r = (e: Element | null | undefined) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 100) / 100);
  };
  const sec = d.querySelector('section');
  const h2 = sec?.querySelector('h2');
  const slot = h2?.parentElement?.previousElementSibling;
  return { slot: r(slot), slotTag: slot?.tagName, h2: r(h2), grid: r(d.querySelector('.grid')), ls: (window as unknown as { __ls: number }).__ls };
});

/** 홈 이벤트 슬라이드 — 슬라이드 기준 상대 좌표(캐러셀 스크롤 위치와 무관하게). */
async function openHomeSlide(page: Page) {
  await page.goto('/');
  await dismissOverlays(page);
  const slide = page.getByTestId('home-event-banner');
  await expect(slide).toContainText('오픈 기념 이벤트', { timeout: 20_000 });
  return slide;
}
const slideGeo = (page: Page) => page.getByTestId('home-event-banner').evaluate((s) => {
  const o = s.getBoundingClientRect();
  const rel = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.x - o.x, b.y - o.y, b.width, b.height].map((n) => Math.round(n * 100) / 100); };
  const spans = Array.from(s.querySelectorAll('span')).filter((x) => x.childElementCount === 0 && x.textContent?.trim());
  const img = s.querySelector('img[data-testid="event-venue-logo"]') as HTMLImageElement | null;
  return { frame: [o.width, o.height], text: spans.map(rel), logo: img && !img.hidden ? rel(img) : null, logoLoaded: !!img && img.complete && img.naturalWidth > 0 };
});

test('🔴 로고가 있으면 판 머리·홈 슬라이드·목록에 그려지고, 다른 요소 좌표는 로고 없을 때와 같다', async ({ page }) => {
  const state = await setup(page);

  // 기준선 — 로고 없음(종전 화면)
  const slide0 = await (async () => { await openHomeSlide(page); await page.waitForTimeout(800); return slideGeo(page); })();
  await openBoard(page);
  await page.waitForTimeout(800);
  const board0 = await boardGeo(page);
  expect(board0.slotTag, '기준선인데 로고 칸이 선물 타일이 아니다').toBe('SPAN');

  // 로고 있음
  state.brand = ROTI;
  const dlg = await openBoard(page);
  const logo = dlg.locator(`section ${LOGO}`);
  await expect(logo, '판 머리에 매장 로고가 없다').toBeVisible();
  const early = await boardGeo(page);                       // 그림 도착 전(600ms 지연 목)
  await expect.poll(() => logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { message: '로고 그림이 로드되지 않았다' }).toBe(true);
  const board1 = await boardGeo(page);
  expect(board1.slotTag).toBe('IMG');
  expect(board1.slot, '로고 칸이 선물 타일 칸과 다른 상자다').toEqual(board0.slot);
  expect(early.slot, '그림 도착 전후로 로고 칸 크기가 달라졌다').toEqual(board1.slot);
  expect(board1.h2, '로고 때문에 제목이 움직였다').toEqual(board0.h2);
  expect(board1.grid, '로고 때문에 카드판이 움직였다').toEqual(board0.grid);
  expect(early.h2).toEqual(board1.h2);
  expect(board1.ls, `로고가 layout-shift 를 늘렸다(기준 ${board0.ls})`).toBeLessThanOrEqual(board0.ls + 1e-4);
  expect(await logo.evaluate((i) => getComputedStyle(i).borderRadius), '둥근 아바타가 아니다').not.toBe('0px');

  // 홈 슬라이드 — 오른쪽 위, 글자와 겹치지 않고 글자·프레임 좌표는 그대로
  await openHomeSlide(page);
  await expect.poll(async () => (await slideGeo(page)).logoLoaded, { message: '홈 이벤트 슬라이드에 로고가 안 그려졌다', timeout: 10_000 }).toBe(true);
  const slide1 = await slideGeo(page);
  expect(slide1.frame, '로고 때문에 슬라이드 프레임 크기가 바뀌었다').toEqual(slide0.frame);
  expect(slide1.text, '로고 때문에 슬라이드 글자가 움직였다').toEqual(slide0.text);
  const [lx, ly, lw, lh] = slide1.logo as Rect;
  expect(lw).toBeGreaterThanOrEqual(32); expect(lw).toBeLessThanOrEqual(48); expect(lh).toBe(lw);
  expect(lx, '로고가 글자 칸(왼쪽 64%)으로 들어왔다').toBeGreaterThanOrEqual(slide1.frame[0] * 0.64);
  expect(ly + lh, "로고가 아래 'n / N' 칩 띠까지 내려왔다").toBeLessThanOrEqual(slide1.frame[1] - 44);
  for (const t of slide1.text) {
    const [tx, ty, tw, th] = t as Rect;
    const overlap = tx < lx + lw && lx < tx + tw && ty < ly + lh && ly < ty + th;
    expect(overlap, `로고가 글자 상자 ${JSON.stringify(t)} 와 겹친다`).toBe(false);
  }

  // 목록 — 첫 줄의 선물 타일 자리
  await page.getByTestId('home-quick-event').click();
  const item = page.locator('[data-testid="event-list-page"] [data-testid="event-list-item"]').first();
  await expect(item).toBeVisible({ timeout: 15_000 });
  await expect(item.locator(LOGO), '이벤트 목록 줄에 매장 로고가 없다').toBeVisible();
});

test('🔴 로고를 못 불러오면(404) 기존 화면 그대로 — 판은 선물 타일, 슬라이드는 로고 없음', async ({ page }) => {
  const state = await setup(page);
  await openBoard(page);
  await page.waitForTimeout(800);
  const board0 = await boardGeo(page);
  const slide0 = await (async () => { await openHomeSlide(page); await page.waitForTimeout(800); return slideGeo(page); })();

  state.brand = MISSING;
  const dlg = await openBoard(page);
  await expect(dlg.locator(`section ${LOGO}`), '못 불러온 로고가 판에 남았다(깨진 그림)').toHaveCount(0, { timeout: 10_000 });
  await expect(dlg.locator('section .tile-grad').first(), '로고 실패 뒤 선물 타일로 돌아오지 않았다').toBeVisible();
  const board1 = await boardGeo(page);
  expect(board1.slot).toEqual(board0.slot);
  expect(board1.h2).toEqual(board0.h2);
  expect(board1.grid).toEqual(board0.grid);

  const slide = await openHomeSlide(page);
  // 끼워 받기는 성공했으니 img 는 한 번 생긴다 → 변형본 404 → 원본 404 → 숨김. 보이는 채로 남으면 깨진 그림이다.
  await expect.poll(async () => slide.locator(LOGO).evaluateAll((xs) => xs.filter((x) => !(x as HTMLImageElement).hidden).length), { message: '못 불러온 로고가 슬라이드에 보인다', timeout: 10_000 }).toBe(0);
  const slide1 = await slideGeo(page);
  expect(slide1.frame).toEqual(slide0.frame);
  expect(slide1.text).toEqual(slide0.text);
});
