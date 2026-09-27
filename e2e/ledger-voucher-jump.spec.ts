// 장부 상단 [이용권 확인] 바로가기 (2026-09-27 오너 승인)
//
// 왜: 이용권 레일이 모든 폭에서 장부 표 **아래**로 내려가(표가 1920 에서도 5칸이던 결함 수정) 검색칸이
//   화면 2.4개 밑이 됐다. 카운터에서 이용권 확인은 바인만큼 잦다 → 상단 버튼 한 번으로 레일까지 내려가
//   검색칸에 바로 친다. 확인하는 것:
//   ① 360·390·1024·1920 에서 버튼이 한 줄 · 누름영역 44px(상자+tap-y-44) · 대비 4.5+(다크·라이트)
//   ② 누르면 레일 검색칸에 포커스, 그 칸이 화면 안에 있고 **다른 것에 가리지 않는다**(정산바·헤더)
//   ③ 이용권 권한이 없는 직원 화면에는 레일도 버튼도 없다
// 운영 DB 에 쓰지 않는다 — 전부 목킹(bootOwner). 실행: E2E_BASE_URL=<preview> npx playwright test e2e/ledger-voucher-jump.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const RAIL = '[data-mystore-rail]';
const JUMP = '[data-testid="ledger-voucher-jump"]';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const SESSION = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리 메인', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: `${MOCK_DAY}T10:00:00Z`, tournament_start: null, schedule_id: null, operators: [],
};
const PLAYERS = Array.from({ length: 12 }, (_, i) => ({
  id: `ffffffff-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
  name: `손님${i + 1}`, visitor_type: null, note: null, sort_order: i,
}));

async function openLedger(page: Page, w: number, h: number, voucher = true, scheme: 'dark' | 'light' = 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* 차단 환경 */ } }, scheme);
  await bootOwner(page, {
    viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' },   // 이용권 기능 켜짐(caps.voucher 의 전제)
    perms: voucher ? {} : { can_manage_pos: false, can_view_vouchers: false },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        return r.fulfill(json(single ? SESSION : [SESSION]));
      });
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(PLAYERS)) : r.fallback()));
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().click();
  await expect(page.locator('[data-testid="ledger-date"]'), '장부 보드가 안 열렸다').toHaveCount(1, { timeout: 20_000 });
  await page.waitForTimeout(800);
}

/** 버튼 상자·누름영역·줄 수·대비(조상 배경 합성) */
const measure = (page: Page) => page.locator(JUMP).evaluate((el) => {
  const r = el.getBoundingClientRect();
  const ps = getComputedStyle(el, '::before');
  const hitH = ps.content !== 'none' && ps.position === 'absolute' ? r.height - parseFloat(ps.top) - parseFloat(ps.bottom) : r.height;
  // 줄 수는 **글자 노드만** 잰다 — 아이콘(svg) 상자까지 섞으면 세로 위치가 달라 한 줄이 두 줄로 세진다.
  const range = document.createRange(); const tops = new Set<number>();
  for (const n of el.childNodes) {
    if (n.nodeType !== 3 || !n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const q of range.getClientRects()) if (q.width > 1) tops.add(Math.round(q.top));
  }
  const lines = tops.size;
  const parse = (s: string) => { const m = s.match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[\s,/]+/).map(Number) : [255, 255, 255, 1]; return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  let acc: number[] | null = null;
  for (let n: HTMLElement | null = el as HTMLElement; n; n = n.parentElement) {
    const c = parse(getComputedStyle(n).backgroundColor); if (c[3] === 0) continue;
    if (!acc) { acc = c; if (c[3] >= 1) break; continue; }
    const a: number = acc[3]; const prev: number[] = acc; acc = [0, 1, 2].map((i) => prev[i] * a + c[i] * (1 - a)).concat(a + c[3] * (1 - a)); if (acc[3] >= 0.999) break;
  }
  const bg = acc ?? parse(getComputedStyle(document.body).backgroundColor);
  const fg = parse(getComputedStyle(el).color);
  const l1 = lum(fg), l2 = lum(bg);
  return { w: r.width, h: r.height, hitH, lines, contrast: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
});

test.describe('장부 [이용권 확인] 바로가기', () => {
  for (const [W, H] of [[360, 780], [390, 844], [1024, 768], [1920, 1080]] as const) {
    test(`${W}px — 한 줄 · 44px · 대비 · 누르면 레일 검색칸 포커스(가리지 않음)`, async ({ page }) => {
      test.setTimeout(120_000);
      await openLedger(page, W, H);
      await expect(page.locator(JUMP), '장부 상단에 [이용권 확인] 이 없다').toHaveCount(1);
      const m = await measure(page);
      console.log(`[jump ${W}]`, JSON.stringify(m));
      expect(m.lines, '버튼 글자가 두 줄로 접혔다').toBe(1);
      expect(m.hitH, '누름영역이 44px 미만').toBeGreaterThanOrEqual(44);
      expect(m.contrast, '글자 대비 4.5 미만').toBeGreaterThanOrEqual(4.5);

      // locator.click 은 대상까지 자동 스크롤해 측정을 오염시킨다 — el.click() 으로 누른다.
      await page.locator(JUMP).evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(1200);   // smooth 스크롤 정착
      const r = await page.evaluate(() => {
        const a = document.activeElement as HTMLInputElement | null;
        if (!a || a.tagName !== 'INPUT') return { focused: false };
        const b = a.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { focused: true, placeholder: a.placeholder, top: b.top, bottom: b.bottom, vh: innerHeight, unobstructed: hit === a || a.contains(hit) };
      });
      console.log(`[jump→rail ${W}]`, JSON.stringify(r));
      expect(r.focused, '누른 뒤 레일 검색칸에 포커스가 없다').toBe(true);
      expect(r.placeholder).toContain('닉네임');
      expect(r.top, '검색칸이 화면 위로 벗어났다').toBeGreaterThanOrEqual(0);
      expect(r.bottom, '검색칸이 화면 아래로 벗어났다').toBeLessThanOrEqual(r.vh ?? 0);
      expect(r.unobstructed, '검색칸이 헤더·정산바 등에 가려 있다').toBe(true);
    });
  }

  test('라이트 테마 1024 · 390 — 대비 4.5+', async ({ page }) => {
    test.setTimeout(120_000);
    for (const [W, H] of [[1024, 768], [390, 844]] as const) {
      await openLedger(page, W, H, true, 'light');
      const m = await measure(page);
      console.log(`[jump light ${W}]`, JSON.stringify(m));
      expect(m.contrast, `라이트 ${W} 대비 4.5 미만`).toBeGreaterThanOrEqual(4.5);
      expect(m.lines).toBe(1);
    }
  });

  test('이용권 권한이 없는 직원 화면에는 레일도 바로가기도 없다', async ({ page }) => {
    test.setTimeout(120_000);
    await openLedger(page, 1280, 900, false);
    await expect(page.locator(JUMP)).toHaveCount(0);
    await expect(page.getByText('매장이용권 실시간')).toHaveCount(0);
  });
});
