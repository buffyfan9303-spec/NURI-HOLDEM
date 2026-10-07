// 조회·안내 시트도 제목 줄을 끌어내려 닫는다(오너 2026-10-07).
//   "아래로 쓸어내려서 닫기가 되려면 제목 살짝 위에까지는 되야지 이건 맨 위에만 돼"
//   PR #209 는 매장 부스트 문의 시트에만 dragToClose 를 켰다. 같은 성격(입력 없음)의 조회·안내 시트 6곳에 호출부로 켠다.
// 켠 시트 둘을 대표로 본다: ① 본인인증 안내(VerifyGateSheet) ② 고객센터 문의의 '로그인 필요' 안내(비로그인).
// 음성 대조: ③ 같은 모달의 로그인 상태 접수 폼(입력 시트 — 켜지 않음)은 제목 줄을 끌어도 안 닫힌다.
// 손가락은 CDP Input.dispatchTouchEvent — Playwright click/tap 은 누름 0ms 라 시트 드래그(Touch Events) 부류를 못 잰다.
// 순서: 탭 단언을 드래그보다 앞에 둔다(CDP 드래그가 끝난 직후의 첫 탭은 Chrome fling 억제로 삼켜질 수 있다).
// 운영 DB 쓰기 0 — _fixtures 가 쓰기를 끊고, 세션은 stubLogin(로컬)이다.
// 음성 대조(수정 되돌리기): 두 호출부에서 `dragToClose` 를 빼면 ①·② 의 드래그 단언이 실패한다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin, dismissOverlays } from './_session';

interface Cdp { send(m: string, p: unknown): Promise<unknown> }

/** 진짜 손가락 — touchStart → (홀드) → 12단계 touchMove → touchEnd. */
async function touchDrag(page: Page, x: number, y: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page) as unknown as Cdp;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(120);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 제목 글자 정중앙 — 헤더 줄 한가운데다. 진입 애니(sheet-up)가 멈출 때까지 기다린 뒤 잰다. */
async function titlePoint(page: Page, name: string): Promise<{ x: number; y: number }> {
  const dlg = page.getByRole('dialog', { name });
  await expect(dlg, `${name} 시트가 안 열렸다`).toBeVisible({ timeout: 15_000 });
  let prev = -1;
  for (let i = 0; i < 40; i++) {
    const top = await dlg.evaluate((el) => el.getBoundingClientRect().top);
    if (Math.abs(top - prev) < 0.5) break;
    prev = top;
    await page.waitForTimeout(100);
  }
  const box = await dlg.locator('#modal-title').boundingBox();
  if (!box) throw new Error('제목 박스가 없다');
  return { x: Math.round(box.x + Math.min(box.width / 2, 60)), y: Math.round(box.y + box.height / 2) };
}

/** 3px 탭 — 드래그가 아니다. 시트가 안 닫히고 제자리여야 한다. */
async function tinyTap(page: Page, p: { x: number; y: number }): Promise<void> {
  await touchDrag(page, p.x, p.y, 3);
}

async function boot(page: Page): Promise<void> {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
}

async function openVerifyGate(page: Page): Promise<void> {
  // VerifyGateSheet 는 lazy 라 리스너가 늦게 붙는다 — 뜰 때까지 이벤트를 다시 쏜다.
  const dlg = page.getByRole('dialog', { name: '휴대폰 본인인증' });
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:require-verify', { detail: { reason: '대회 예약' } })));
    await expect(dlg).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

async function openSupport(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: '고객센터 문의' }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}

test.describe('조회·안내 시트 — 제목 줄 드래그로 닫기', () => {
  test('① 본인인증 안내 시트: 제목 3px 탭은 안 닫히고, 제목 줄을 260px 끌면 닫힌다', async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page);
    await openVerifyGate(page);
    const dlg = page.getByRole('dialog', { name: '휴대폰 본인인증' });
    const p = await titlePoint(page, '휴대폰 본인인증');

    await tinyTap(page, p);                                  // 탭 — 안 닫힌다
    await page.waitForTimeout(500);
    await expect(dlg, '제목 탭만으로 시트가 닫혔다').toBeVisible();

    await touchDrag(page, p.x, p.y, 260);                    // 드래그 — 닫힌다
    await expect(dlg, '제목 줄을 끌어내렸는데 안 닫혔다').toBeHidden({ timeout: 5_000 });
  });

  test('② 고객센터 문의(비로그인 안내): 제목 3px 탭은 안 닫히고, 끌면 닫힌다 · 닫기 버튼은 그대로 동작', async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page);
    await openSupport(page);
    const dlg = page.getByRole('dialog', { name: '고객센터 · 1:1 문의' });
    const p = await titlePoint(page, '고객센터 · 1:1 문의');

    await tinyTap(page, p);
    await page.waitForTimeout(500);
    await expect(dlg, '제목 탭만으로 시트가 닫혔다').toBeVisible();

    await dlg.getByRole('button', { name: '닫기' }).click();  // 헤더 버튼은 눌러서 닫힌다(드래그 아님)
    await expect(dlg).toBeHidden({ timeout: 5_000 });

    await openSupport(page);
    const p2 = await titlePoint(page, '고객센터 · 1:1 문의');
    await touchDrag(page, p2.x, p2.y, 260);
    await expect(dlg, '제목 줄을 끌어내렸는데 안 닫혔다').toBeHidden({ timeout: 5_000 });
  });

  // 음성 대조 — 입력 시트(로그인 상태 접수 폼)는 켜지 않았다. 같은 손짓으로 안 닫혀야 쓰던 글이 안 날아간다.
  test('③ 대조: 고객센터 문의 접수 폼(입력 시트)은 제목 줄을 끌어도 안 닫힌다', async ({ page }) => {
    test.setTimeout(90_000);
    await stubLogin(page);
    await boot(page);
    await openSupport(page);
    const dlg = page.getByRole('dialog', { name: '고객센터 · 1:1 문의' });
    const p = await titlePoint(page, '고객센터 · 1:1 문의');
    await expect(dlg.getByText('운영시간 내 순차적으로 답변드립니다'), '로그인 상태 접수 폼이 아니다 — 대조 전제가 없다').toBeVisible();

    await touchDrag(page, p.x, p.y, 260);
    await page.waitForTimeout(900);                          // 스프링 복귀까지
    await expect(dlg, '입력 시트가 제목 줄 드래그로 닫혔다').toBeVisible();
    const top = await dlg.evaluate((el) => el.getBoundingClientRect().top);
    expect(top, '입력 시트가 화면 아래로 밀려 있다').toBeLessThan(500);
  });
});
