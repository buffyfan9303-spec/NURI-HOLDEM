// e2e/calendar-first-screen.spec.ts — 캘린더 첫 화면 계약(오너 2026-09-24).
//
// 오너: "캘린더를 누르면 S25·S26·아이폰 16 Pro 기준 한 화면에 캘린더가 전부 보여야 해, 바로."
// → 캘린더 탭 진입 첫 화면에서 **이번 달 요약(+/−·ROI·뱅크롤)과 월 그리드 6주 전체**가
//   헤더 아래 ~ 하단 탭바 위에 스크롤 없이 들어온다.
// 기준 뷰포트(CSS px): Galaxy S25 360×780 · (S26 은 공식 수치 미확인 — 기본형 동급 360×780 가정) · iPhone 16 Pro 402×874 ·
//   S25 Ultra 412×915 · 최소폭 320×640.
// ⚠ 이 하네스는 주소창이 접히지 않아 dvh == svh 다(CLAUDE.md) — 여기서 재는 높이는 svh(주소창 펼친 상태, 더 좁은 쪽) 기준이다.
// 음성 대조(보고서): 날짜 칸 높이를 100px 로 늘리면(CAL_NEG=1 스타일 주입) S25 360×780·320 이 빨개진다.
// 데이터는 전부 로컬 목킹(개인 기록 = 본인만) — 운영 DB 무접촉. 기록이 많은 날(한 날 4건 + SPOT + 예약)을 일부러 넣는다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-00000000c01a';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cal@example.com', app_metadata: {}, user_metadata: { name: '캘린더' }, created_at: new Date().toISOString() },
};
const T = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const MON = T.slice(0, 7);
// ⚠ 2026-09-27 — 고정 날짜(3·7·11·15·18·22·27일)가 **오늘과 겹치면** 그 기록이 오늘 칸 합계에 더해져 '+108만' 이 깨졌다
//   (27일 실측: +108만 − 150만 = −41.5만, 3eb2ad26 이전 빌드도 같은 실패 — 제품이 아니라 픽스처가 날짜에 묶여 있었다). 오늘과 겹치면 다음 날로 민다(최대 28일).
const TD = Number(T.slice(8, 10));
const d = (n: number) => `${MON}-${String(n === TD ? n + 1 : n).padStart(2, '0')}`;
let seq = 0;
const br = (date: string, amount: number, memo = '', extra: Record<string, unknown> = {}) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12, '0')}`, entry_date: date, amount, memo,
  buy_in: 0, rebuy: 0, addon: 0, venue_name: '', game_name: '', created_at: `${date}T10:00:00Z`, ...extra,
});
const ROWS = [
  br(T, -100000, '', { buy_in: 100000, venue_name: '누리 테스트 홀덤펍 강남 센텀점', game_name: '위클리 메인' }),
  br(T, 1234567, '', { buy_in: 100000, rebuy: 100000, venue_name: '로티 아레나', game_name: '데일리 딥스택' }),
  br(T, 0, '금요일 위클리 메인 참가 예정 — 친구랑'),
  br(T, -50000, '캐시 게임'),
  br(d(3), 250000), br(d(7), -30000), br(d(11), 1200000), br(d(15), -80000), br(d(18), 0, '토너 계획'), br(d(22), 45000), br(d(27), -1500000),
];
const SPOT = { v: 3, game: 'nlhe', format: 'mtt', tableSize: 9, sb: 0.5, bb: 1, anteBb: 1, heroPos: 'BTN', villainPos: 'BB', effectiveBb: 25, street: 'preflop', actions: [], heroCards: ['As', 'Kd'], board: [], extra: [] };
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function openCalendar(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } }, [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({ id: UID, name: '캘린더', nickname: '캘린더', role: 'user', status: 'active', activity_points: 0, created_at: FAKE.user.created_at })));
  await page.route(/\/rest\/v1\/schedule_likes\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/schedule_reservations\?/, (r) => r.fulfill(json([{ schedule_id: 'bbbbbbbb-0000-4000-8000-000000000001', display_name: 'x', created_at: `${T}T01:00:00Z`,
    schedules: { title: '누리 테스트 위클리 메인', date: T, start_time: '19:00:00', venue_id: null, venues: { name: '로티 아레나' } } }])));
  await page.route(/\/rest\/v1\/bankroll_entries\?/, (r) => r.fulfill(json(ROWS)));
  await page.route(/\/rest\/v1\/spot_reviews\?/, (r) => r.fulfill(json([{ id: 'cccccccc-0000-4000-8000-000000000001', spot: SPOT, coverage_kind: 'chart_nash', source_label: null, dataset_version: 'v1', created_at: `${T}T05:00:00Z` }])));
  if (process.env.CAL_NEG) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style'); st.textContent = '.cal-day{height:100px!important}'; document.head.appendChild(st);
  }));
  await page.goto('/?tab=calendar');
  const pane = page.locator('[data-tab="calendar"]');
  await expect(pane).toBeVisible({ timeout: 20_000 });
  // 기록이 실제로 그려진 뒤에 잰다(빈 달로 재면 가벼운 화면에서 거짓 통과한다) — 오늘 칸에 그날 +/− 가 떠야 한다.
  await expect(pane.locator(`[data-cal-date="${T}"] [data-cal-net]`), '오늘 칸에 그날 +/− 가 안 떴다 — 기록 목킹이 안 걸렸다').toHaveText('+108만', { timeout: 20_000 });
  return pane;
}

for (const [name, w, h] of [['Galaxy S25', 360, 780], ['iPhone 16 Pro', 402, 874], ['S25 Ultra', 412, 915], ['최소폭', 320, 640]] as const) {
  test(`🔴 ${name} ${w}×${h} — 요약 + 월 그리드 6주가 스크롤 없이 첫 화면에 들어온다`, async ({ page }) => {
    test.setTimeout(60_000);
    const pane = await openCalendar(page, w, h);
    const r = await page.evaluate(() => {
      const pane = document.querySelector('[data-tab="calendar"]')!;
      const cells = [...pane.querySelectorAll<HTMLElement>('.cal-day')];
      const nav = document.querySelector<HTMLElement>('nav[aria-label="하단 내비게이션"]');
      const navTop = nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 0 ? nav.getBoundingClientRect().top : innerHeight;
      const hdr = document.querySelector('[data-stack-header]')?.getBoundingClientRect().bottom ?? 0;
      const sum = pane.querySelector('[data-testid="cal-summary"]')!.getBoundingClientRect();
      return {
        cells: cells.length, scrollY, navTop, hdr,
        gridBottom: Math.max(...cells.map((c) => c.getBoundingClientRect().bottom)),
        sumTop: sum.top, sumBottom: sum.bottom,
        minCellH: Math.min(...cells.map((c) => c.getBoundingClientRect().height)),
        minCellW: Math.min(...cells.map((c) => c.getBoundingClientRect().width)),
      };
    });
    console.log(`[cal-first ${w}×${h}] ${JSON.stringify(r)}`);
    expect(r.cells, '월 그리드가 6주(42칸)가 아니다').toBe(42);
    expect(r.scrollY, '첫 화면이 이미 스크롤돼 있다 — 측정 전제가 깨졌다').toBe(0);
    expect(r.sumTop, '요약이 헤더 밑에 가려졌다').toBeGreaterThanOrEqual(r.hdr - 0.5);
    expect(r.gridBottom, `월 그리드 마지막 줄이 탭바에 가린다(그리드 하단 ${r.gridBottom} > 탭바 ${r.navTop})`).toBeLessThanOrEqual(r.navTop + 0.5);
    expect(r.minCellH, '날짜 칸 높이가 터치 44px 미만이다').toBeGreaterThanOrEqual(44);
    await expect(pane.getByTestId('cal-summary')).toBeInViewport({ ratio: 1 });
  });
}
