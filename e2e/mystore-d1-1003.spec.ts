// 내 매장 D1(2026-10-03) — 대시보드 '오늘 장부' 칸이 확인 중(스켈레톤 107px) → 미시작(48px)으로 접히며 아래 카드 격자가
//   약 60px 올라가던 이동(C1 재검토 R-dash: 1440 CLS 0.017 · 390 0.029, 첫 진입·매장 전환 모두)의 회귀 게이트. 전부 목킹(운영 쓰기 0).
//   원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\review-mystore-c1-1002.md 「R-dash」.
//
// 음성 대조: origin/main(5c223417) 빌드에서 FAIL(칸 높이 107→48), 수정 빌드에서 PASS.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const VENUE_B = '44444444-4444-4444-8444-444444444444';
const DELAY = 1200; // '확인 중' 을 실제로 여러 프레임 보이게 — 오늘 장부 조회(ledger_sessions)를 늦춘다
const FIRST_DELAY = 4000; // 첫 진입: 부팅~'내 매장' 클릭 사이에 조회가 끝나지 않게

type Frame = { t: number; badge: string; h: number; next: number | null };

/** 매 프레임 '오늘 장부' 칸의 배지·높이와 바로 아래 형제의 문서 y 를 적는다(문서 시작부터). */
async function installSampler(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __f: Frame[]; __ls: { t: number; v: number; input: boolean }[] };
    type Frame = { t: number; badge: string; h: number; next: number | null };
    w.__f = []; w.__ls = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean }; w.__ls.push({ t: s.startTime, v: s.value, input: s.hadRecentInput }); } })
        .observe({ type: 'layout-shift', buffered: true });
    } catch { /* 지원 안 함 */ }
    const tick = () => {
      const band = [...document.querySelectorAll<HTMLElement>('[data-pane="dashboard"] button')]
        .find((b) => b.getClientRects().length && (b.querySelector('span > span')?.textContent ?? '').trim() === '오늘 장부');
      if (band) {
        const badge = (band.querySelector('span > span:nth-child(2)')?.textContent ?? '').trim();
        // 아래 카드 격자(대시보드 카드 10장) — C1 재검토가 잰 이동의 출처 노드 div.grid.grid-cols-1
        const nx = [...(band.closest('[data-pane="dashboard"]')?.querySelectorAll<HTMLElement>('div.grid.grid-cols-1') ?? [])].find((g) => g.getClientRects().length) ?? null;
        (w.__f as Frame[]).push({ t: performance.now(), badge, h: band.getBoundingClientRect().height, next: nx ? nx.getBoundingClientRect().top + scrollY : null });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __f: Frame[] }).__f);
const resetFrames = (page: Page) => page.evaluate(() => { const w = window as unknown as { __f: Frame[]; __ls: unknown[] }; w.__f = []; w.__ls = []; });

function judge(f: Frame[], label: string) {
  const checking = f.filter((x) => x.badge === '확인 중');
  const idle = f.filter((x) => x.badge === '미시작');
  const hs = [...checking, ...idle].map((x) => x.h);
  const span = Math.max(...hs) - Math.min(...hs);
  // 아래 격자 위치는 판이 처음 보인 뒤 300ms 부터 잰다 — 첫 프레임들은 '내 매장' 누름 직후 셸이 자리 잡는 이동(입력 직후라 CLS 면제)이다
  //   (실측: 첫 진입 1440 격자 top 501→576 이 누름 22ms 뒤, 확인 중→미시작 은 4초 뒤).
  const t0 = (f[0]?.t ?? 0) + 300;
  const nexts = [...checking, ...idle].filter((x) => x.t >= t0).map((x) => x.next).filter((x): x is number => x != null);
  const nspan = nexts.length ? Math.max(...nexts) - Math.min(...nexts) : 0;
  console.log(`[${label}] frames=${f.length} 확인중=${checking.length}(h ${checking[0]?.h.toFixed(1)}) 미시작=${idle.length}(h ${idle[idle.length - 1]?.h.toFixed(1)}) 높이폭=${span.toFixed(1)} 아래형제 y폭=${nspan.toFixed(1)}`);
  expect(checking.length, `${label}: '확인 중' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
  expect(idle.length, `${label}: '미시작' 프레임을 못 봤다 — 빈 검사`).toBeGreaterThan(5);
  expect(span, `${label}: '오늘 장부' 칸 높이가 확인 중 → 미시작에서 바뀌었다(아래 카드가 밀린다)`).toBeLessThanOrEqual(1);
  expect(nexts.length, `${label}: 아래 카드 격자를 못 쟀다 — 빈 검사`).toBeGreaterThan(5);
  expect(nspan, `${label}: 아래 카드 격자가 세로로 움직였다`).toBeLessThanOrEqual(1);
}

for (const [W, H] of [[1440, 900], [390, 844]] as const) {
  test(`${W} — 첫 진입: '오늘 장부' 확인 중 → 미시작에서 칸 높이·아래 카드 위치가 그대로다`, async ({ page }) => {
    test.setTimeout(90_000);
    await installSampler(page);
    // 대시보드는 '내 매장'을 누르기 전에 숨은 채로 먼저 마운트돼 조회를 시작한다(keep-alive) — networkidle 을 기다리면
    //   이미 다 읽은 뒤라 '확인 중'을 볼 수 없다. 그래서 조회를 길게 늦추고, 부팅 직후 바로 '내 매장'을 연다.
    await bootOwner(page, {
      viewport: { width: W, height: H },
      goto: false,
      extra: async (p) => {
        await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r: Route) => {
          if (r.request().method() === 'GET') await sleep(FIRST_DELAY);
          return r.fallback().catch(() => {});
        });
      },
    });
    await page.goto('/');
    await openMyStore(page);
    await expect(page.locator('[data-pane="dashboard"] button').filter({ hasText: '미시작' }).first(), '미시작에 닿지 못했다').toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(600);
    judge(await frames(page), `${W} 첫 진입`);
  });

  test(`${W} — 매장 A→B 전환: B '오늘 장부' 확인 중 → 미시작에서 칸 높이·아래 카드 위치가 그대로다`, async ({ page }) => {
    test.setTimeout(90_000);
    await installSampler(page);
    const writes: string[] = [];
    page.on('request', (r) => { if (/supabase\.co\/rest\//.test(r.url()) && !['GET', 'HEAD'].includes(r.method()) && !/\/rpc\/|\/client_errors/.test(r.url())) writes.push(`${r.method()} ${r.url().slice(0, 100)}`); });
    await bootOwner(page, {
      viewport: { width: W, height: H },
      extra: async (p) => {
        await p.route(/\/rest\/v1\/rpc\/my_member_venues/, (r) => r.fulfill(json([{ id: MOCK_VENUE, name: '테스트 홀덤펍', relation: 'owner' }, { id: VENUE_B, name: '둘째 매장', relation: 'coowner' }])));
        await p.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_view_vouchers|can_manage_venue_staff|can_manage_venue_schedules|can_manage_schedule)($|\?)/, (r) => r.fulfill(json(true)));
        await p.route(/\/rest\/v1\/ledger_sessions\?/, async (r: Route) => {
          if (r.request().method() === 'GET' && r.request().url().includes(`venue_id=eq.${VENUE_B}`)) await sleep(DELAY);
          return r.fallback().catch(() => {});
        });
      },
    });
    await openMyStore(page);
    const pick = page.locator('#mystore-venue-pick');
    await expect(pick, '매장 고르개가 없다(이 검사의 전제)').toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-pane="dashboard"] button').filter({ hasText: '미시작' }).first()).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(500);
    await resetFrames(page);
    await pick.focus();
    await page.keyboard.press('ArrowDown');
    await expect(pick, 'B 매장을 못 골랐다(이 검사의 전제)').toHaveValue(VENUE_B);
    await page.waitForTimeout(DELAY + 2000);
    judge(await frames(page), `${W} 전환`);
    const ls = await page.evaluate(() => (window as unknown as { __ls: { t: number; v: number; input: boolean }[] }).__ls);
    console.log(`[${W} 전환] 입력 밖 이동 합=${ls.filter((x) => !x.input).reduce((s, x) => s + x.v, 0).toFixed(4)}`);
    expect(writes).toEqual([]);
  });
}
