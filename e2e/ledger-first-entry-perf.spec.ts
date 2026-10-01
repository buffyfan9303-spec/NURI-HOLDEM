// PC 내 매장 '장부' 첫 진입 1초 멈춤 (R-04 · store-fix-report §R-04/S-05 · 2026-10-01) — 성능 계약.
//
// 원인(store-team 실측): 장부 코드가 아니라 공용 폰트 폴백 스택의 'Pretendard FB Android' @font-face —
//   src: local('Noto Sans CJK KR'), local('NotoSansCJKkr-Regular'), local('Noto Sans KR') 중 'Noto Sans KR' 이 Windows 11 기본 글꼴(NotoSansKR-VF)과 맞아 PC 에서도
//   한글 첫 조판에 큰 가변 CJK 폴백이 끼었다. 클릭 한 번의 Layout 652ms. 그 face 만 빼면 첫 진입 917~1034 → 414~423ms.
// 고친 방식: 그 face 를 CSS 에서 빼고, 기기에 그 글꼴이 **실제로 있을 때만** FontFace API 로 등록한다(src/lib/androidFallbackFont.ts).
// 잠그는 것(1440 · 목 업주 · CPU 4배 · 실제 마우스 70ms · 새 문서 3개의 중앙값): 장부 첫 진입 뒤 2.5초 안 가장 긴 프레임(LoAF) ≤ 400ms.
//   실측(2026-10-01 · 같은 PC · 교대 실행): 수정 전 중앙값 655·580(별도 실행 1319) → 수정 후 235·268. store-team 하네스: 1017~1842 → 425~888.
//   ⚠ Event Timing 이 아니라 LoAF 다 — 장부 판 커밋은 트랜지션이라 클릭 다음 페인트 **뒤**에 와서 Event Timing 은 192~424 로 놓쳤다(실측).
// 음성 대조: 수정 전 빌드(b7ad649c) FAIL.
// @boot — 단일 워커로 따로 돈다(CPU 4배 측정은 병렬 러너 부하를 그대로 센다 — perf-tab-inp 와 같은 이유).
import { test, expect } from './_fixtures';
import { devices, type Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.describe.configure({ mode: 'serial' });
// 업주 PC = 데스크톱 크롬(모바일 에뮬이 아니다 — 매장 운영주는 PC 99%).
const DESKTOP = devices['Desktop Chrome'];
test.use({ userAgent: DESKTOP.userAgent, isMobile: false, hasTouch: false, deviceScaleFactor: 1, viewport: { width: 1440, height: 900 } });

async function oneRun(page: Page): Promise<number> {
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const single = (h: Record<string, string>) => (h['accept'] ?? '').includes('pgrst.object');
  const later = () => new Promise((z) => setTimeout(z, 120));
  await page.route(/supabase\.co\/rest\/v1\//, async (r) => {
    if (r.request().url().includes('/rest/v1/rpc/')) { await later(); return r.fulfill(json(null)); }
    if (r.request().method() !== 'GET') return r.fallback();
    await later();
    return r.fulfill(json(single(r.request().headers()) ? null : []));
  });
  await page.routeWebSocket(/realtime/, () => { /* 연결하지 않는다 */ });
  // 장부에 실제처럼 한글 이름·결제 수단이 찬 게임 하나(store-team R-04 하네스와 같은 모양) — 비용이 **한글 글리프의 첫 사용**이라
  //   빈 장부로 재면 결함이 안 보인다(실측: 빈 장부 base 322~348ms 로 통과 — 거짓 통과).
  const iso = (hm: string) => new Date(`${MOCK_DAY}T${hm}:00+09:00`).toISOString();
  const sess = {
    venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, title: '수요 딥스택 1000만 GTD', buyin_amount: 100_000, card_amount: null,
    target_entries: 40, game_type: 'gtd', max_entries: 0, is_addon: true, addon_stack: 30_000, addon_amount: 50_000,
    operators: [], discounts: [], early_double_min: 0, early_single_min: 0, tournament_start: null,
    opened_by: null, opened_at: iso('18:00'), reg_closed: false, closed: false, schedule_id: null, voucher_issued: 0,
  };
  const NAMES = ['홍길동', '박민수', '김수한무거북이와두루미', '이영희', '최강', '정다은', '한지민', '오세훈', '윤아', '서태웅'];
  const PAY = ['cash', 'card', 'transfer', 'ticket'] as const;
  const buyins = NAMES.map((name, i) => ({
    id: `bbbbbbbb-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
    player_name: name, entry_no: 1, payment_method: PAY[i % 4], is_unpaid: i === 5, is_split: false,
    cash_amount: PAY[i % 4] === 'cash' ? 100_000 : 0, card_amount: PAY[i % 4] === 'card' ? 100_000 : 0, transfer_amount: PAY[i % 4] === 'transfer' ? 100_000 : 0,
    ticket_count: 0, unpaid_amount: 0, discount_index: 0, discount_level: 0, early_override: null,
    buyin_at: iso(`18:${String(10 + i).padStart(2, '0')}`), created_by: null, request_id: null, addon_method: null, addon_unpaid: false, addon_amount: 0,
  }));
  const players = NAMES.map((name, i) => ({ id: `ffffffff-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
    name, visitor_type: i % 3 ? 'regular' : 'new', note: i === 1 ? '창가 자리 선호 · 음료 콜라' : null, sort_order: i + 1 }));
  // 계측은 부팅(goto) 전에 붙여야 첫 문서에 실린다.
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const w = window as unknown as { __ev: [number, number][] };
    w.__ev = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__ev.push([e.startTime, e.duration]); })
        .observe({ type: 'long-animation-frame', buffered: true } as PerformanceObserverInit);
    } catch { /* 미지원 */ }
  });
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => (r.request().method() !== 'GET' ? r.fallback()
        : r.fulfill(json(single(r.request().headers()) ? sess : [sess]))));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(buyins))));
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(players))));
    },
  });
  const cdp = await page.context().newCDPSession(page);
  await openMyStore(page);
  await expect(page.locator('[data-mystore-secpanel]')).toBeVisible();
  await page.waitForTimeout(2500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    // 실제 경로(store-team R-04 하네스와 같다): 사이드바 '게임 진행' → 단계 레일 '장부'(첫 진입).
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.locator('[data-mystore-secbar] button:visible').filter({ hasText: /^\s*게임 진행/ }).first().click();
    await page.waitForTimeout(2000);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const at = await page.evaluate(() => {
      const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] button, [data-mystore-rail] [role=tab]')]
        .find((x) => x.offsetParent !== null && /장부/.test(x.textContent ?? ''));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    expect(at, "단계 레일 '장부' 버튼을 못 찾았다 — 측정이 비면 거짓 통과한다").not.toBeNull();
    const t0 = await page.evaluate(() => performance.now());
    await page.mouse.move(at!.x, at!.y);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(2500);
    return await page.evaluate((t) => Math.round(Math.max(0, ...(window as unknown as { __ev: [number, number][] }).__ev
      .filter((e) => e[0] >= t - 50).map((e) => e[1]))), t0);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
}

test('🔴 PC 장부 첫 진입 — CPU 4배에서 ≤ 400ms (3문서 중앙값) @boot', async ({ context }) => {
  test.setTimeout(300_000);
  const runs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const page = await context.newPage();
    try { runs.push(await oneRun(page)); } finally { await page.close(); }
  }
  const med = [...runs].sort((a, b) => a - b)[1];
  console.log('[ledger-first-entry]', JSON.stringify(runs), 'median', med);
  expect(runs.every((r) => r > 0), `긴 프레임(LoAF)을 하나도 못 잡았다(${runs}) — 관찰기가 죽으면 거짓 통과한다`).toBe(true);
  expect(med, `장부 첫 진입 중앙값 · 실측 ${JSON.stringify(runs)}`).toBeLessThanOrEqual(400);
});
