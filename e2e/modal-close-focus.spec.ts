// 공용 Modal(src/components/atoms/Modal.tsx) ✕ 닫기 — 키보드(Tab)로 포커스하면 링이 **화면에 보인다**(리드 2026-09-27, 장부 점검 발견).
// 판정은 computed style 만이 아니라 픽셀이다: ✕ 둘레(버튼 ±6px)를 포커스 전·후로 찍어 **바뀐 픽셀 수**를 센다 —
//   outline 이 계산돼 있어도 조상(overflow-hidden·둥근 모서리·스크롤 상자)이 잘라 버리면 보이지 않는다.
// 실행: E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/modal-close-focus.spec.ts --project=mobile-chromium
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const listingRow = {
  id: '11111111-1111-4111-8111-1111111111c3', title: '포커스 매물', category: 'table', description: '테스트',
  price: 300_000, condition: 'B', status: 'on_sale', images: [], region: '서울', shipping_available: false, pickup_only: true,
  seller_id: '00000000-0000-4000-8000-0000000000e3', seller_name: '판매자', seller_avatar_color: '#5A6175',
  seller_trade_count: 0, seller_verified: false, created_at: new Date().toISOString(), view_count: 0, like_count: 0, comment_count: 0,
};
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** 가장 안쪽 대화상자의 ✕ 까지 Tab 으로 간다(키보드 포커스). 찾으면 그 버튼의 화면 사각형. */
async function tabToClose(page: Page, dialogText: string) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate((txt) => {
      const a = document.activeElement as HTMLElement | null;
      const dlg = [...document.querySelectorAll('[role="dialog"]')].filter((d) => (d.textContent ?? '').includes(txt)).pop();
      if (!a || !dlg || a.getAttribute('aria-label') !== '닫기' || a.closest('[role="dialog"]') !== dlg) return null;
      const b = a.getBoundingClientRect(); const cs = getComputedStyle(a);
      return { x: b.x, y: b.y, w: b.width, h: b.height, fv: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}` };
    }, dialogText);
    if (r) return r;
  }
  return null;
}
/** ✕ 둘레의 보이는 변화 — 포커스된 그림과 포커스를 뺀 그림(같은 자리)의 다른 픽셀 수. */
async function ringPixels(page: Page, r: { x: number; y: number; w: number; h: number }) {
  const clip = { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: r.w + 12, height: r.h + 12 };
  const on = await page.screenshot({ clip, animations: 'disabled' });
  // blur() 는 쓰지 않는다 — 대화상자 포커스 가둠이 ✕ 로 되돌려 링이 그대로 남는다(실측 changed 0). 다음 칸으로 Tab.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const off = await page.screenshot({ clip, animations: 'disabled' });
  return page.evaluate(async ([a, b]) => {
    const dec = async (s: string) => { const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob()); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext('2d')!; g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; };
    const x = await dec(a), y = await dec(b);
    let n = 0;
    for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > 60) n++;
    return { changed: n, total: x.length / 4 };
  }, [on.toString('base64'), off.toString('base64')] as [string, string]);
}

for (const [w, scheme] of [[390, 'dark'], [360, 'light']] as const) {
  test(`✕ 포커스 링이 보인다 — 가운데 대화상자 ${w} ${scheme}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: 800 });
    await page.addInitScript((s) => { try { localStorage.setItem('nuri-theme', s); } catch { /* 차단 */ } }, scheme);
    await page.route(/\/rest\/v1\/marketplace_listings\?/, (r) => r.fulfill(json([listingRow])));
    await stabilizeBackstack(page);
    await page.goto('/');
    await dismissOverlays(page);
    await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
    await page.getByRole('button', { name: '장터', exact: true }).first().click({ timeout: 15_000 });
    await page.getByRole('button', { name: /포커스 매물/ }).first().click({ timeout: 15_000 });
    await page.getByRole('button', { name: '판매자에게 연락' }).click();
    await expect(page.locator('[role="dialog"]').filter({ hasText: '채팅은 로그인 후 이용 가능합니다' }).last()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    const r = await tabToClose(page, '채팅은 로그인 후 이용 가능합니다');
    expect(r, 'Tab 으로 ✕ 에 닿지 못했다').not.toBeNull();
    expect(r!.fv, '키보드 포커스인데 :focus-visible 이 아니다').toBe(true);
    const px = await ringPixels(page, r!);
    // 44px 버튼 둘레 2px 링 ≈ 둘레 180px × 2px × DPR² — 최소 절반은 보여야 한다(잘린 링·없는 링 모두 빨강)
    const dpr = await page.evaluate(() => devicePixelRatio);
    const need = Math.round(180 * 2 * dpr * dpr * 0.5);
    console.log(`[close-focus ${w} ${scheme}] outline=${r!.outline} changed=${px.changed}/${px.total} need≥${need}`);
    expect(px.changed, `✕ 포커스 링이 거의 안 보인다(바뀐 픽셀 ${px.changed} < ${need})`).toBeGreaterThanOrEqual(need);
  });
}

// 제목 있는 시트(Modal header 의 ✕) — 가입 화면의 약관 '보기' 시트
for (const [w, scheme] of [[390, 'light'], [360, 'dark']] as const) {
  test(`✕ 포커스 링이 보인다 — 제목 시트 ${w} ${scheme}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: 800 });
    await page.addInitScript((s) => { try { localStorage.setItem('nuri-theme', s); } catch { /* 차단 */ } }, scheme);
    await stabilizeBackstack(page);
    await page.goto('/');
    await page.getByRole('button', { name: '로그인' }).first().click();
    await page.getByRole('button', { name: '회원가입' }).last().click();
    await page.getByRole('button', { name: '보기', exact: true }).first().click();
    await expect(page.locator('[role="dialog"]').filter({ hasText: '확인했습니다' }).last()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    const r = await tabToClose(page, '확인했습니다');
    expect(r, 'Tab 으로 ✕ 에 닿지 못했다').not.toBeNull();
    expect(r!.fv).toBe(true);
    const px = await ringPixels(page, r!);
    const dpr = await page.evaluate(() => devicePixelRatio);
    const need = Math.round(180 * 2 * dpr * dpr * 0.5);
    console.log(`[close-focus sheet ${w} ${scheme}] outline=${r!.outline} changed=${px.changed}/${px.total} need≥${need}`);
    expect(px.changed, `✕ 포커스 링이 거의 안 보인다(바뀐 픽셀 ${px.changed} < ${need})`).toBeGreaterThanOrEqual(need);
  });
}
