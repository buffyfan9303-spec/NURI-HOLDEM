// 장터 누름 영역 — 모바일 390·360 에서 누를 수 있는 것은 **실제로 눌리는 면**이 44×44 이상이다(리드 2026-09-27, community-team 점검).
// 판정은 박스 크기가 아니라 elementFromPoint 다(0.5px 표본이라 정확히 44 인 상자는 43.5 로 읽힌다 — 문턱 43.5): 중심에서 가로·세로로 0.5px 씩 나가며 그 요소(또는 그 라벨 짝)가 잡히는 거리를 잰다.
//   ::after·::before 확장(.hit·tap-y-44)도 잡히고, 이웃이 덮거나 조상이 잘라 먹은 곳은 빠진다 — "숫자는 맞는데 안 눌리는" 부류까지 본다.
// 대상: 분류 칩 전부 · 최신순/조회수순 · 거래완료 포함(체크박스+글자) · 검색칸 · 글쓰기 · 불러오기 실패 카드의 '다시 시도'.
// 음성 대조: 23ec3007 빌드 — 분류 칩 가로 22~34 · 정렬 세로 38 · 체크박스 13 · 검색/글쓰기 41 로 FAIL.
// 실행: E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/market-hit.spec.ts --project=mobile-chromium
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const row = (i: number) => ({
  id: `11111111-1111-4111-8111-11111111110${i}`, title: `누름 매물 ${i}`, category: 'pokerGear', description: 't', price: 10_000 * i, condition: 'B',
  status: 'on_sale', images: [], region: '서울', shipping_available: false, pickup_only: true, seller_id: '00000000-0000-4000-8000-0000000000e9',
  seller_name: '판매자', seller_avatar_color: '#5A6175', seller_trade_count: 0, seller_verified: false, created_at: new Date().toISOString(),
  view_count: 0, like_count: 0, comment_count: 0,
});

/** 요소(sel 로 찾은 것 중 보이는 전부)의 실효 누름 면 — 가로·세로(중심을 지나는 줄에서 연속으로 잡히는 길이). */
async function hits(page: Page, sel: string) {
  return page.evaluate((sel) => {
    const own = (t: Element, h: Element | null): boolean => {
      if (!h) return false;
      if (t === h || t.contains(h)) return true;
      const lab = h.closest('label');
      if (lab && (lab.contains(t) || (lab.htmlFor && (t as HTMLElement).id === lab.htmlFor))) return true; // 라벨 짝(체크박스)
      return t instanceof HTMLInputElement && t.type === 'checkbox' && !!t.id && !!h.closest(`label[for="${t.id}"]`);
    };
    const run = (t: Element, cx: number, cy: number, dx: number, dy: number) => { let d = 0; while (d < 60 && own(t, document.elementFromPoint(cx + dx * (d + 0.5), cy + dy * (d + 0.5)))) d += 0.5; return d; };
    return [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length).map((t) => {
      const b = t.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const w = run(t, cx, cy, -1, 0) + run(t, cx, cy, 1, 0), h = run(t, cx, cy, 0, -1) + run(t, cx, cy, 0, 1);
      return { label: ((t as HTMLElement).innerText || (t as HTMLInputElement).placeholder || (t as HTMLElement).id || t.tagName).trim().slice(0, 10), box: `${b.width.toFixed(1)}×${b.height.toFixed(1)}`, w, h };
    });
  }, sel);
}

async function openMarket(page: Page, w: number, scheme: 'dark' | 'light', fail = false) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.addInitScript((s) => { try { localStorage.setItem('nuri-theme', s); } catch { /* 차단 */ } }, scheme);
  await page.route(/\/rest\/v1\/marketplace_listings\?/, (r) => (fail ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }) : r.fulfill(json([row(1), row(2), row(3)]))));
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '장터', exact: true }).first().click({ timeout: 15_000 });
  await expect(page.locator('[data-market-catbar]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

for (const [w, scheme] of [[390, 'dark'], [360, 'light']] as const) {
  test(`장터 누름 영역 ${w} ${scheme} — 칩·정렬·거래완료·검색·글쓰기 44×44`, async ({ page }) => {
    test.setTimeout(90_000);
    await openMarket(page, w, scheme);
    const rows = [
      ...(await hits(page, '[data-market-catbar] button')).map((r) => ({ ...r, k: '분류' })),
      ...(await hits(page, 'button')).filter((r) => /^(최신순|조회수순)$/.test(r.label)).map((r) => ({ ...r, k: '정렬' })),
      ...(await hits(page, '#includeSold')).map((r) => ({ ...r, k: '거래완료' })),
      ...(await hits(page, 'input[type="search"][placeholder="제목으로 검색…"]')).map((r) => ({ ...r, k: '검색' })),
      ...(await hits(page, 'button')).filter((r) => r.label === '글쓰기').map((r) => ({ ...r, k: '글쓰기' })),
    ];
    const uniq = [...new Map(rows.map((r) => [`${r.k}:${r.label}`, r])).values()];
    console.log(`[market-hit ${w} ${scheme}]\n  ${uniq.map((r) => `${r.k} ${r.label} box=${r.box} hit=${r.w}×${r.h}`).join('\n  ')}`);
    expect(new Set(uniq.map((r) => r.k)).size, '대상을 다 못 찾았다(0개 초록 방지)').toBe(5);
    expect(uniq.filter((r) => r.w < 43.5 || r.h < 43.5).map((r) => `${r.k} ${r.label} ${r.w}×${r.h}`)).toEqual([]);
  });

  test(`불러오기 실패 '다시 시도' ${w} ${scheme} — 44×44`, async ({ page }) => {
    test.setTimeout(90_000);
    await openMarket(page, w, scheme, true);
    const btn = page.getByRole('button', { name: '다시 시도' }).first();
    await expect(btn).toBeVisible({ timeout: 15_000 });
    const r = (await hits(page, 'button')).filter((x) => x.label === '다시 시도');
    console.log(`[market-hit retry ${w} ${scheme}] ${r.map((x) => `box=${x.box} hit=${x.w}×${x.h}`).join(' | ')}`);
    expect(r.length).toBeGreaterThan(0);
    expect(r.filter((x) => x.w < 43.5 || x.h < 43.5).map((x) => `${x.w}×${x.h}`)).toEqual([]);
  });
}
