// 누르는 요소를 손가락으로 길게 눌렀을 때 브라우저 메뉴·안내가 뜨지 않게 — 2026-10-09 오너 삼성 인터넷(웹 탭) 캡처:
//   GTO '자주 쓰는 도구' 'GTO 핸드 분석' 카드 위에 회색 말풍선 '텍스트만 선택하세요' 가 떠서 남았다(문구는 저장소에 없다 = 브라우저가 그린다).
// 원리: Chromium 은 길게 누름 → 페이지에 contextmenu 를 보내고, **취소되지 않았을 때만** 브라우저 쪽 메뉴/안내를 연다.
//   그래서 계약은 '터치로 누른 버튼·탭에 온 contextmenu 는 앱이 취소한다(defaultPrevented)' 다.
// ⚠ 하네스 한계: 데스크톱 Chromium + Pixel 7 에뮬레이션은 CDP 터치 길게 누르기로 contextmenu 도, 글 선택도 만들지 못한다
//   (2026-10-09 실측: dispatchTouchEvent 700ms → click 만 · synthesizeTapGesture 1200ms → 아무 이벤트 없음 · 제목 글 선택 '' ).
//   그래서 손가락은 CDP touchStart 로 **진짜로** 대고(pointerdown pointerType=touch), 길게 누름이 만들 contextmenu 만 그 자리 요소에 보낸다.
//   마우스 오른쪽 클릭(PC)은 CDP 로 진짜 contextmenu 가 나오므로 그대로 쓴다(양성 대조 — 취소되면 안 된다).
// 음성 대조: src/main.tsx 의 installTouchContextMenuGuard() 호출을 빼면 1·2번이 빨갛다(defaultPrevented false).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/longpress-context-guard-1009.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import type { Locator, Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

async function openTools(page: Page) {
  await page.setViewportSize({ width: 412, height: 891 });
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.goto('/?tab=tools');
  await dismissOverlays(page);
  const feat = page.getByTestId('tools-featured');
  await expect(feat).toBeVisible({ timeout: 20_000 });
  return feat;
}

/** (x,y) 에 손가락을 대고(진짜 터치 pointerdown), 그 자리 요소에 길게 누름의 contextmenu 를 보낸 뒤 손가락을 거둔다(touchCancel — click 없음). */
async function longPressMenu(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(80);
  const r = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py)!;
    const ev = new PointerEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, pointerType: 'touch', clientX: px, clientY: py });
    el.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, hit: el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName, sel: String(getSelection()) };
  }, [x, y] as const);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.detach();
  return r;
}

const center = async (loc: Locator) => {
  const b = (await loc.boundingBox())!;
  return [b.x + b.width / 2, b.y + b.height / 2] as const;
};

test('1. GTO 타일(오너 캡처 자리) — 길게 누름의 contextmenu 를 앱이 취소하고, 도구는 열리지 않으며 선택도 없다', async ({ page }) => {
  await openTools(page);
  const card = page.getByTestId('tools-featured').getByTestId('tool-gto');
  const b = (await card.boundingBox())!;
  // 오너 캡처의 말풍선 꼬리 자리 = 카드 왼쪽 위 안쪽. 가운데(제목 글자 위)도 같이 본다.
  for (const [x, y] of [[b.x + 12, b.y + 8], [b.x + b.width / 2, b.y + b.height / 2]]) {
    const r = await longPressMenu(page, x, y);
    expect(r.hit, '엉뚱한 요소를 쟀다').toBe('tool-gto');
    expect(r.prevented, `타일 (${Math.round(x)},${Math.round(y)}) 길게 누름이 브라우저로 넘어간다`).toBe(true);
    expect(r.sel, '타일 글자가 선택됐다').toBe('');
  }
  await expect(page.getByRole('dialog'), '길게 누름이 도구를 열었다').toHaveCount(0);
});

test('2. 하단 탭바 버튼 — 같은 처방이 앱 전체 누르는 요소에 걸린다', async ({ page }) => {
  await openTools(page);
  const [x, y] = await center(page.locator('nav.fixed.bottom-0').getByRole('button', { name: /홈/ }).first());
  const r = await longPressMenu(page, x, y);
  expect(r.prevented, '탭바 길게 누름이 브라우저로 넘어간다').toBe(true);
});

test('3. 양성 대조 — 본문 제목 글은 길게 눌러도 앱이 막지 않고, 글은 여전히 선택된다', async ({ page }) => {
  const feat = await openTools(page);
  const h2 = feat.locator('h2').first();
  await expect(h2).toHaveText('자주 쓰는 도구');
  const [x, y] = await center(h2);
  const r = await longPressMenu(page, x, y);
  expect(r.prevented, '본문 글의 길게 누름(복사 메뉴)까지 막았다 — 기능 소실').toBe(false);
  const picked = await h2.evaluate((el) => {
    const s = getSelection()!; s.removeAllRanges(); s.selectAllChildren(el);
    return { us: getComputedStyle(el).userSelect, text: String(s) };
  });
  expect(picked.us, '본문 제목이 선택 불가가 됐다').not.toBe('none');
  expect(picked.text, '본문 제목 글이 선택되지 않는다').toBe('자주 쓰는 도구');
});

test('4. 양성 대조 — 검색 입력칸은 터치로 길게 눌러도 앱이 막지 않는다(붙여넣기 메뉴)', async ({ page }) => {
  await openTools(page);
  const [x, y] = await center(page.getByPlaceholder(/도구 검색/));
  const r = await longPressMenu(page, x, y);
  expect(r.prevented, '입력칸 길게 누름(붙여넣기)까지 막았다').toBe(false);
});

test('5. 양성 대조 — PC 마우스 오른쪽 클릭은 버튼 위에서도 브라우저 메뉴로 넘어간다', async ({ page }) => {
  await openTools(page);
  const [x, y] = await center(page.getByTestId('tools-featured').getByTestId('tool-gto'));
  await page.evaluate(() => {
    (window as unknown as { __cm: boolean[] }).__cm = [];
    // 버블 끝(window)에서 앱 처리 뒤의 결과를 본다.
    window.addEventListener('contextmenu', (e) => { (window as unknown as { __cm: boolean[] }).__cm.push(e.defaultPrevented); e.preventDefault(); /* 하네스에 진짜 메뉴를 띄우지 않게 기록 뒤 끈다 */ });
  });
  await page.mouse.click(x, y, { button: 'right' });
  const seen = await page.evaluate(() => (window as unknown as { __cm: boolean[] }).__cm);
  expect(seen.length, '오른쪽 클릭이 contextmenu 를 만들지 않았다 — 잴 대상이 없으면 통과가 아니다').toBeGreaterThan(0);
  expect(seen, '마우스 오른쪽 클릭까지 막았다').toEqual(seen.map(() => false));
});
