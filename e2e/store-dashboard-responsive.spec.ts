// 내 매장 대시보드 — PC 개편 후 반응형 계약 (2026-09-11)
//
// 무엇을 잠그나
//   ① 7개 뷰포트에서 **페이지 전체 가로 스크롤이 없다**. 큰 표는 자기 컨테이너 안에서만 스크롤한다.
//   ② PC(1280 이상)에서 콘텐츠가 예전 1088px(max-w-5xl)에 갇혀 있지 않다 — 폭을 실제로 쓴다.
//   ③ KPI 숫자 넷이 서로 겹치지 않는다(360 포함).
//   ④ 오늘 게임 표의 헤더·데이터가 그려지고, 표만 내부 스크롤한다.
//
// 운영 DB 에는 쓰지 않는다 — 세션·매장·장부는 전부 page.route 로 만들고, 변이는 _fixtures 가드가 끊는다.
// (no-export-ui.spec.ts 의 fixture 레시피를 그대로 따른다 — 같은 화면을 여는 검증된 경로다.)
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000ed';
const VENUE = '55555555-5555-4555-8555-555555555555';
/** 앱의 '오늘'은 KST(kstToday) — UTC 날짜를 쓰면 자정 근처에서 어제 장부를 본다. */
const kst = (o = 0) => new Date(Date.now() + 9 * 3_600_000 + o * 86_400_000).toISOString().slice(0, 10);
const DAY = kst(0);
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }),
             b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
             'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'owner2@example.com',
          app_metadata: {}, user_metadata: { name: '업주' }, created_at: new Date().toISOString() },
};

/** 게임 3개(메인 + 사이드 2) — 표에 여러 행이 그려져야 가로폭·정렬을 실제로 잰다. */
const sessionRow = (seq: number, title: string, closed = false) => ({
  venue_id: VENUE, session_date: DAY, game_seq: seq, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title, discounts: [{ label: '1레벨', amount: 50_000 }],
  early_double_min: 20, early_single_min: 40, reg_closed: false, closed,
  // opened_at 이 없으면 started=false 라 KPI 숫자 대신 '아직 시작되지 않았습니다' 가 뜬다.
  opened_at: `${DAY}T10:00:00Z`, tournament_start: `${DAY}T19:00:00Z`, schedule_id: null,
});
/** 긴 이름·큰 금액·할인·미수를 섞는다 — §15 '긴 게임명 · 큰 금액 · 0 처리' 를 한 판에서 본다. */
const buyinRow = (i: number, name: string, seq: number, over: Record<string, unknown> = {}) => ({
  id: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE, session_date: DAY, game_seq: seq, player_name: name, entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${DAY}T12:00:00Z`, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0,
  ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
  ...over,
});
const playerRow = (i: number, name: string, seq: number) => ({
  id: `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`,
  venue_id: VENUE, session_date: DAY, game_seq: seq, name, visitor_type: 'regular', note: null, sort_order: i,
});

async function openDashboard(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript(([k, v, t]) => {
    try {
      localStorage.setItem(k as string, v as string);
      // ThemeContext: localStorage['nuri-theme']==='light' 일 때만 라이트. 기본은 다크다.
      localStorage.setItem('nuri-theme', t as string);
    } catch { /* 차단 환경 */ }
  }, [KEY, JSON.stringify(FAKE), theme] as [string, string, string]);
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: '업주', nickname: '업주', role: 'venue_owner', approved: true, status: 'active',
    venue_id: VENUE, activity_points: 0, created_at: FAKE.user.created_at,
    agreed_to_terms: true, consented_legal_version: 2,
  })));
  await page.route(/\/rest\/v1\/venues\?/, (r) => r.fulfill(json([{
    id: VENUE, name: '아주아주 긴 이름의 테스트 홀덤 라운지 강남점', region: '서울', address: '서울 강남구 1', owner_id: UID,
    approved: true, status: 'active', verification_status: 'verified',
    is_paid_ad: false, display_order: 1, follower_count: 3, rating: 4.5,
  }])));
  await page.route(/\/rest\/v1\/rpc\/(can_access_ledger|can_manage_pos|can_manage_venue|can_view_vouchers)/, (r) => r.fulfill(json(true)));
  const SESSIONS = [
    sessionRow(1, '데일리 메인 토너먼트 · 1000만 GTD'),
    sessionRow(2, '사이드 새틀라이트'),
    sessionRow(3, '하이롤러', true),
  ];
  // ⚠ 같은 테이블을 두 함수가 다르게 부른다 — 하나로 답하면 한쪽이 깨진다.
  //   getLedgerSession  : .eq(game_seq).maybeSingle() → **객체 하나**(배열이면 'multiple rows' 로 실패)
  //   getLedgerRange    : .gte/.lte(session_date)     → **배열**
  //   URL 의 session_date 연산자로 가른다(gte 가 있으면 범위 조회).
  await page.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
    const u = r.request().url();
    // getLedgerSession 만이 session_date=eq. + game_seq=eq. 를 함께 쓴다 — 그때만 객체 하나.
    const m = /game_seq=eq\.(\d+)/.exec(u);
    if (m && /session_date=eq\./.test(u)) {
      return r.fulfill(json(SESSIONS.find((x) => x.game_seq === Number(m[1])) ?? null));
    }
    return r.fulfill(json(SESSIONS));
  });
  const BUYINS = [
    buyinRow(1, '김철수', 1),
    buyinRow(2, '이영희', 1, { discount_index: 1, cash_amount: 50_000 }),   // 엔트리 0.5
    // ⚠ 비분납 미수는 **금액 칸에 net 을 그대로 쓰고** is_unpaid 만 세운다(nonSplitSnapshot).
    //   unpaid_amount 는 분납 전용이라 여기 넣으면 값이 통째로 0 이 되어 미수가 사라진다.
    buyinRow(3, '박민수', 1, { is_unpaid: true }),
    buyinRow(4, '최지우', 2),
    buyinRow(5, '김철수', 2, { entry_no: 2 }),                               // 리바인
  ];
  // 둘 다 배열이지만 게임 필터가 걸린 요청(오늘 메인)에는 그 게임만 준다 — 아니면 KPI 가 사이드까지 더한다.
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => {
    const m = /game_seq=eq\.(\d+)/.exec(r.request().url());
    return r.fulfill(json(m ? BUYINS.filter((b) => b.game_seq === Number(m[1])) : BUYINS));
  });
  await page.route(/\/rest\/v1\/ledger_players\?/, (r) => r.fulfill(json([
    playerRow(1, '김철수', 1), playerRow(2, '이영희', 1), playerRow(3, '박민수', 1), playerRow(4, '최지우', 2),
  ])));
  await page.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/customer_aliases\?/, (r) => r.fulfill(json([])));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('button:visible').filter({ hasText: '내 매장' }).first().click({ timeout: 15_000 });
  await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
  // KPI 밴드가 그려질 때까지 — 여기서부터가 '대시보드가 실제로 산 상태'다.
  await expect(page.locator('[data-tab="my-store"]').getByText('오늘 장부').first()).toBeVisible({ timeout: 25_000 });
}

/** 페이지 전체 가로 스크롤 — 1px 반올림 오차는 허용(브라우저 서브픽셀). */
async function pageOverflowPx(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

const VIEWPORTS = [
  { w: 360, h: 800, name: '360 (최소 폭)' },
  { w: 390, h: 844, name: '390 (아이폰)' },
  { w: 768, h: 1024, name: '768 (태블릿)' },
  { w: 1024, h: 768, name: '1024' },
  { w: 1280, h: 800, name: '1280 (PC 기준)' },
  { w: 1440, h: 900, name: '1440' },
  { w: 1920, h: 1080, name: '1920' },
];

test('🔴 내 매장 대시보드 — 7개 뷰포트에서 페이지 가로 스크롤 0', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDashboard(page);

  const bad: string[] = [];
  for (const v of VIEWPORTS) {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.waitForTimeout(220); // 리플로우 안정화
    const over = await pageOverflowPx(page);
    if (over > 1) bad.push(`${v.name}: ${over}px 넘침`);
    // 전체 페이지로 남긴다 — 접힌 아래쪽(오늘 게임 표·카드 3열)까지 눈으로 확인해야 한다.
    await page.screenshot({ path: `test-results/dash-${v.w}.png`, fullPage: true });
  }
  expect(bad, `페이지 전체 가로 스크롤이 생겼습니다:\n${bad.join('\n')}`).toEqual([]);
});

test('🔴 PC 에서 콘텐츠가 예전 1088px 에 갇혀 있지 않다', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);

  // 루트 폰트 17px 기준: 5xl=1088 · 6xl=1224 · 7xl=1360. 개편 목표는 xl 에서 7xl.
  const w = await page.locator('[data-tab="my-store"]').evaluate((el) => {
    // 대시보드를 감싼 실제 콘텐츠 래퍼의 폭
    const wrap = el.querySelector('div[class*="max-w-"]') as HTMLElement | null;
    return (wrap ?? el).getBoundingClientRect().width;
  });
  expect(w, `1440px 에서 콘텐츠 폭이 ${Math.round(w)}px — 1088px(max-w-5xl)에 아직 갇혀 있습니다`).toBeGreaterThan(1100);
});

test('🔴 오늘 게임 표 — 그려지고, 페이지가 아니라 표만 가로 스크롤한다', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 }); // 표가 확실히 넘치는 좁은 폭
  await openDashboard(page);

  const store = page.locator('[data-tab="my-store"]');
  const table = store.locator('table').filter({ hasText: '머니인 가치' }).first();
  await expect(table, '오늘 게임 표가 그려지지 않았다').toBeVisible({ timeout: 25_000 });
  // 세 게임이 모두 행으로 있다(마감된 하이롤러 포함 — 마감이라고 표에서 사라지면 안 된다).
  await expect(table.getByRole('row')).toHaveCount(4); // 헤더 1 + 게임 3

  // 표는 넘치되(내부 스크롤 컨테이너가 받는다) 페이지는 넘치지 않는다.
  const scroller = table.locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]');
  const inner = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(inner, '좁은 폭인데 표가 내부 스크롤을 만들지 않았다 — 열이 잘렸을 수 있다').toBeGreaterThan(0);
  expect(await pageOverflowPx(page), '표가 페이지 전체를 밀어냈다').toBeLessThanOrEqual(1);
});

test('🔴 KPI 숫자 넷이 360px 에서 서로 겹치지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await openDashboard(page);

  const store = page.locator('[data-tab="my-store"]');
  const labels = ['완납 매출', '총 바이인', '미수금', '회수 이용권'];
  const boxes: { name: string; r: { x: number; y: number; w: number; h: number } }[] = [];
  for (const name of labels) {
    const el = store.getByText(name, { exact: true }).first();
    await expect(el, `KPI '${name}' 이 사라졌다`).toBeVisible({ timeout: 20_000 });
    const bb = await el.boundingBox();
    if (bb) boxes.push({ name, r: { x: bb.x, y: bb.y, w: bb.width, h: bb.height } });
  }
  const overlaps: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (hit) overlaps.push(`${boxes[i].name} ↔ ${boxes[j].name}`);
    }
  }
  expect(overlaps, `KPI 라벨이 겹칩니다: ${overlaps.join(', ')}`).toEqual([]);
});

// ── 라이트 테마 ───────────────────────────────────────────────────────────────
// AGENTS.md 참고 메모: "라이트 모드 대비는 순백이 아니라 **실제 지면(surface-base)** 으로 재라 —
//   순백 기준으로 고른 색이 지면 위에서 AA 미달이었다." 그래서 여기서는 조상들을 거슬러 올라가며
//   **실제로 칠해진 배경**을 찾아 대비를 계산한다(투명 배경을 흰색으로 가정하지 않는다).

/** sRGB 상대 휘도 — WCAG 정의 그대로. */
const LUMA = `(function (rgb) {
  var f = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
})`;

async function contrastOf(page: Page, selectorText: string): Promise<{ ratio: number; fg: string; bg: string }> {
  return page.evaluate(({ txt, lumaSrc }) => {
    const luma = eval(lumaSrc) as (rgb: number[]) => number;
    const parse = (c: string): number[] | null => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      if (p.length >= 4 && p[3] === 0) return null;   // 완전 투명 = 칠해지지 않았다
      return [p[0], p[1], p[2]];
    };
    const all = [...document.querySelectorAll('[data-tab="my-store"] *')] as HTMLElement[];
    const el = all.find((n) => n.children.length === 0 && n.textContent?.trim() === txt);
    if (!el) return { ratio: -1, fg: '', bg: '(요소 없음)' };
    const fg = parse(getComputedStyle(el).color) ?? [0, 0, 0];
    // 실제로 칠해진 조상을 찾는다 — 투명이면 계속 올라간다(순백 가정 금지)
    let bg: number[] | null = null;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      bg = parse(getComputedStyle(n).backgroundColor);
      if (bg) break;
    }
    if (!bg) bg = parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255];
    const a = luma(fg), b = luma(bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return { ratio, fg: `rgb(${fg.join(',')})`, bg: `rgb(${bg.join(',')})` };
  }, { txt: selectorText, lumaSrc: LUMA });
}

test('🔴 라이트 테마 — 레이아웃이 무너지지 않고 본문 대비가 AA 를 넘는다', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openDashboard(page, 'light');

  // 실제로 라이트로 전환됐는가 — 이걸 안 보면 다크를 두 번 검사하고 통과라고 착각한다.
  await expect.poll(() => page.evaluate(() => document.documentElement.className),
    { timeout: 15_000 }).toContain('light');

  // 레이아웃 — 다크와 같은 계약(페이지 가로 스크롤 0)
  for (const [w, h] of [[1280, 900], [390, 844]] as [number, number][]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(220);
    expect(await pageOverflowPx(page), `라이트 ${w}px 에서 페이지가 가로로 넘칩니다`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/dash-light-${w}.png`, fullPage: true });
  }

  // 대비 — KPI 라벨은 작은 글씨(2xs)라 일반 텍스트 기준 4.5:1 을 적용한다.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);
  const bad: string[] = [];
  for (const t of ['완납 매출', '총 바이인', '미수금', '회수 이용권', '오늘 장부']) {
    const c = await contrastOf(page, t);
    if (c.ratio < 0) { bad.push(`'${t}' 를 찾지 못했다`); continue; }
    if (c.ratio < 4.5) bad.push(`'${t}' 대비 ${c.ratio.toFixed(2)}:1 (글자 ${c.fg} / 지면 ${c.bg})`);
  }
  expect(bad, `라이트 테마 대비가 AA(4.5:1) 미달입니다:\n${bad.join('\n')}`).toEqual([]);
});
