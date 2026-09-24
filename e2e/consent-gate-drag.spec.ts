// 닫을 수 없는 시트(법적 동의 게이트)는 끌어내려도 제자리에 있어야 한다 — 2026-09-24 라이브 결함.
//
// 사고: ConsentGateModal 은 onClose 를 빈 함수로 넘겼지만 Modal 시트 그립에는 드래그 핸들러가 늘 붙어 있었다.
//   그립을 끌어내리면 onSheetEnd 가 시트를 화면 밖으로 밀고 딤 opacity 를 0 으로 걷는다. onClose 는 아무 일도
//   안 하니 모달은 DOM 에 남고, 보이지 않는 딤이 화면 전체의 입력을 삼킨다 → 동의·로그아웃 둘 다 못 누르고
//   새로고침만 남는 먹통. 헤더 X 도 아무 일도 안 하는 채로 보였다.
// 수정: Modal `dismissible={false}` — 그립·드래그·배경 클릭·X·ESC 를 모두 뗀다.
// 음성 대조: ConsentGateModal 에서 dismissible={false} 를 빼면 첫 테스트가 시트 위치·딤·버튼 적중에서 실패한다.
// 양성 대조: 기본(dismissible) 시트인 약관 시트는 같은 손짓으로 여전히 닫힌다(두 번째 테스트).
//
// 왜 CDP 인가: Playwright mouse/touchscreen 은 시트 그립의 Touch Events 경로를 못 탄다(drag-close.spec 과 같은 이유).
// 운영 DB 에 쓰지 않는다 — 세션·프로필은 stubLogin(page.route)으로 만든다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin, dismissOverlays } from './_session';

interface Cdp { send(m: string, p: unknown): Promise<unknown> }

/** 진짜 손가락 — touchStart → 20단계 touchMove → touchEnd. */
async function dragDown(page: Page, x: number, y: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page) as unknown as Cdp;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 진입 애니(sheet-up)가 끝나 시트 위 끝이 멈출 때까지 기다린 뒤 그 값을 돌려준다. */
async function settledTop(page: Page, dialogSel: string): Promise<number> {
  let prev = -1;
  for (let i = 0; i < 40; i++) {
    const top = await page.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1, dialogSel);
    if (top >= 0 && Math.abs(top - prev) < 0.5) return top;
    prev = top;
    await page.waitForTimeout(100);
  }
  throw new Error('시트가 멈추지 않았다');
}

test('🔴 동의 게이트 — 시트 위쪽을 400px 끌어내려도 제자리에 있고 동의 버튼을 누를 수 있다', async ({ page }) => {
  test.setTimeout(60_000);
  await stubLogin(page, { agreed_to_terms: false, consented_legal_version: null });
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const gate = page.locator('[role="dialog"]').filter({ has: page.getByRole('heading', { name: '서비스 이용 동의' }) }).first();
  await expect(gate, '동의 미이행 회원인데 게이트가 뜨지 않았다').toBeVisible({ timeout: 15_000 });
  await gate.evaluate((el) => el.setAttribute('data-e2e-gate', ''));
  const SEL = '[data-e2e-gate]';
  const top0 = await settledTop(page, SEL);

  // 그립이 있던 자리(시트 위 끝 바로 아래) — 수정 전에는 여기에 드래그 핸들러가 늘 붙어 있었다.
  const x = 195;
  await dragDown(page, x, Math.round(top0 + 8), 400);
  await page.waitForTimeout(900);   // 스프링(≈330ms) + 딤 애니(260ms)보다 넉넉히

  const s = await page.evaluate((sel) => {
    const d = document.querySelector(sel) as HTMLElement | null;
    const dim = d?.previousElementSibling as HTMLElement | null;
    const go = [...document.querySelectorAll('button')].find((b) => /동의하고 (시작|계속)/.test(b.textContent ?? ''));
    const r = go?.getBoundingClientRect();
    const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
    return {
      top: d?.getBoundingClientRect().top ?? -1,
      vh: window.innerHeight,
      dim: dim ? Number(getComputedStyle(dim).opacity) : -1,
      goHit: !!(go && hit && go.contains(hit)),
    };
  }, SEL);

  expect(s.top, `끌어내린 뒤 시트 위 끝이 화면 밖(${s.top} ≥ ${s.vh})으로 나갔다`).toBeLessThan(s.vh);
  expect(Math.abs(s.top - top0), `시트가 제자리(${top0})로 돌아오지 않았다(${s.top})`).toBeLessThan(4);
  expect(s.dim, `딤이 걷혔다(opacity ${s.dim}) — 보이지 않는 딤이 입력을 삼키는 먹통 상태`).toBeGreaterThan(0.9);
  expect(s.goHit, '동의 버튼 자리에 동의 버튼이 아닌 것이 잡힌다 — 누를 수 없다').toBe(true);
  await expect(gate).toBeVisible();

  // ESC 로도 닫히지 않는다.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(gate).toBeVisible();

  // 닫는 수단이 보이지 않아야 한다 — 아무 일도 안 하는 X 는 거짓말이다(드래그 단언 뒤에 둔다: 음성 대조가 드래그에서 갈리게).
  await expect(gate.getByRole('button', { name: '닫기' }), '닫을 수 없는 게이트에 닫기 버튼이 보인다').toHaveCount(0);
});

// 양성 대조 — 기본(dismissible) 시트는 같은 그립 손짓으로 여전히 닫힌다. 위 단언이 '드래그 자체가 안 먹는 환경' 의 헛발이 아님을 보인다.
test('대조: 약관 시트(기본 시트)는 그립을 400px 끌어내리면 닫힌다', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);

  const open = page.getByRole('button', { name: '이용약관' }).first();
  await open.scrollIntoViewIfNeeded();
  await open.click();
  const sheet = page.locator('[role="dialog"]').filter({ hasText: '약관 및 정책' }).first();
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await sheet.evaluate((el) => el.setAttribute('data-e2e-sheet', ''));
  const top0 = await settledTop(page, '[data-e2e-sheet]');

  await dragDown(page, 195, Math.round(top0 + 8), 400);
  await expect(sheet, '기본 시트가 그립 드래그로 닫히지 않았다 — 양성 대조 실패').toBeHidden({ timeout: 5_000 });
});
