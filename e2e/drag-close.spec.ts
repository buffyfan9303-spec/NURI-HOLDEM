// 끌어 내려 닫기(오너 #13) 실측 게이트 — "코드가 있다"가 아니라 **실제로 시트가 내려가는가**를 잰다.
//
// 무엇을 재나
//  ① 적용 화면(GTO 도구 전체화면 · 약관 시트): 맨 위에서 아래로 끄는 동안 실제로
//     transform: translateY 가 손가락을 따라 커지고, 손을 떼면 닫힌다.
//  ② 제외 화면(커뮤니티 글쓰기): 제목을 적다가 같은 손짓을 해도 **닫히지 않고 입력이 그대로 남는다**.
//     오너가 못박은 필수 제외 조건("중간에 적다가 실수로 내려서 초기화 되면 안 되는 게시글")이 이 단정이다.
//
// 왜 Playwright 인가: 브라우저 페인(MCP)에서는 터치 이벤트를 실제로 발생시킬 수 없고
// document.hidden 이 항상 true 라 트랜지션·모션 계열 검증이 성립하지 않는다.
import { test, expect, type Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays, loginAs } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

/** computed transform 의 translateY(px). 없으면 0. */
async function translateY(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return -1;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (m) return Number(m[1].split(',')[5]);
    const m3 = t.match(/matrix3d\(([^)]+)\)/);
    return m3 ? Number(m3[1].split(',')[13]) : 0;
  }, selector);
}

interface Touch { send(m: string, p: unknown): Promise<unknown> }

/** 진짜 터치 시퀀스(CDP) — touchStart → n회 touchMove. 손은 아직 떼지 않는다. */
async function pullStart(page: Page, x: number, y: number, dy: number, steps = 10): Promise<Touch> {
  const cdp = await page.context().newCDPSession(page) as unknown as Touch;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  return cdp;
}
const pullEnd = (cdp: Touch) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

/** 시트 본문(마지막 자식) 안에서 입력 컨트롤이 아닌 안전한 터치 지점을 고른다.
 *  ⚠ 시트는 열릴 때 sheet-up 으로 올라온다 — 그 사이에 재면 elementFromPoint 가 뷰포트 밖을
 *  가리켜 null 이 난다. 고정 지연이 아니라 '지점을 찾을 때까지' 폴링한다. */
async function bodyPoint(page: Page): Promise<{ x: number; y: number }> {
  const pick = () => page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const body = (d?.lastElementChild as HTMLElement | null) ?? (d as HTMLElement | null);
    if (!body) return null;
    const r = body.getBoundingClientRect();
    const x = Math.round(r.x + r.width / 2);
    for (let off = 10; off < Math.min(r.height, 200); off += 24) {
      const y = Math.round(r.y + off);
      const hit = document.elementFromPoint(x, y);
      if (hit && !hit.closest('input,textarea,select,[contenteditable]')) return { x, y };
    }
    return null;
  });
  let p: { x: number; y: number } | null = null;
  for (let i = 0; i < 20 && !p; i++) { p = await pick(); if (!p) await page.waitForTimeout(100); }
  expect(p, '시트 본문에서 안전한 터치 지점을 찾지 못했다').not.toBeNull();
  return p!;
}

test.describe('끌어 내려 닫기 — 적용 화면', () => {
  test('🔴 약관 시트 — 아래로 끌면 손가락을 따라 내려가고, 떼면 닫힌다', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.goto('/');
    await dismissOverlays(page);

    const open = page.getByRole('button', { name: '이용약관' }).first();
    await open.scrollIntoViewIfNeeded();
    await open.click();

    const dialog = page.locator('[role="dialog"]').filter({ hasText: '약관 및 정책' }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // 본문에 끌기 계약이 선언돼 있다(적용 대상 표식)
    await expect(dialog.locator('[data-drag-close]')).toHaveCount(1);

    const { x, y } = await bodyPoint(page);
    const cdp = await pullStart(page, x, y, 180);
    // 끄는 도중 — 시트가 실제로 아래로 이동해 있다(코드 존재가 아니라 계측값)
    const moved = await translateY(page, '[role="dialog"]');
    expect(moved, `끄는 동안 시트가 움직이지 않았다(translateY=${moved})`).toBeGreaterThan(80);

    await pullEnd(cdp);
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('🔴 GTO 도구 전체화면 — 같은 손짓으로 내려가 닫힌다(원형 동작 보존)', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 미설정 — GTO 도구는 로그인 전용');
    await stabilizeBackstack(page);
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await dismissOverlays(page);
    await page.locator('nav').getByRole('button', { name: 'GTO', exact: true }).first().click();

    const card = page.getByRole('button', { name: /스타팅핸드 가이드/ }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    const dialog = page.locator('[role="dialog"]').filter({ hasText: '스타팅핸드 가이드' }).first();
    await expect(dialog).toBeVisible();

    const { x, y } = await bodyPoint(page);
    const cdp = await pullStart(page, x, y, 180);
    const moved = await translateY(page, '[role="dialog"]');
    expect(moved, `끄는 동안 전체화면이 움직이지 않았다(translateY=${moved})`).toBeGreaterThan(80);

    await pullEnd(cdp);
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});

test.describe('끌어 내려 닫기 — 필수 제외(작성 중 화면)', () => {
  test('🔴 커뮤니티 글쓰기 — 적다가 아래로 끌어도 닫히지 않고 입력이 남는다', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 미설정 — 글쓰기는 로그인 전용');
    await stabilizeBackstack(page);
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await dismissOverlays(page);
    await page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first().click();
    // 커뮤니티 기본 하위 탭은 '홀덤펍' 이다 — 글쓰기 진입점은 '게시판' 에 있다.
    await page.getByRole('button', { name: '게시판', exact: true }).first().click();

    const write = page.getByRole('button', { name: '글쓰기' }).first();
    await expect(write).toBeVisible({ timeout: 10_000 });
    await write.click();

    const dialog = page.locator('[role="dialog"]').filter({ hasText: '글쓰기' }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const title = dialog.locator('input[placeholder="제목을 입력하세요"]');
    await title.fill('끌어내리기 회귀 검증');

    const { x, y } = await bodyPoint(page);
    const cdp = await pullStart(page, x, y, 220);
    const moved = await translateY(page, '[role="dialog"]');
    expect(moved, `작성 중 시트가 끌려 내려갔다(translateY=${moved}) — 쓰던 글이 날아가는 경로다`).toBeLessThanOrEqual(1);
    await pullEnd(cdp);

    // 손을 뗀 뒤에도 그대로 — 닫히지도, 지워지지도 않는다
    await page.waitForTimeout(400);
    await expect(dialog).toBeVisible();
    await expect(title).toHaveValue('끌어내리기 회귀 검증');
    // 계약 표식도 없어야 한다(위 계측과 짝을 이루는 이중 잠금)
    await expect(dialog.locator('[data-drag-close]')).toHaveCount(0);
  });
});
