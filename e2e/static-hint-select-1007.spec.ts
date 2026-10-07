// 정적 안내 줄을 눌러도 글이 선택되거나 줄이 갈라지지 않는다 — 직원 관리 '구성원 초대' 3단계 안내(#staff-invite-hint).
//
// 오너 2026-10-07 실기기(Android·다크): 줄을 탭하면 그 줄이 파랗게 선택되고, 번호 배지와 글이 두 줄로 갈라져 아래가 밀렸다.
//   하네스(데스크톱 Chromium + Pixel 7 에뮬레이션)는 터치 길게 누르기로 글 선택을 만들지 못한다 — 실기기 증상 자체는 여기서 재현되지 않는다.
//   그래서 ① 선택이 생길 수 없다(computed user-select — 웹·설치형 둘 다) ② 줄이 block 으로 풀려도 한 줄이다(실기기 증상 모양) 를 계약으로 잠그고,
//   ③ CDP 터치 탭·길게 누르기 전후로 줄 높이와 아래 요소 y 가 그대로인지 함께 단언한다.
// 음성 대조: 수정 전(배지 flex · 맨 글자 · select-none 없음)에서는 ①②가 빨갛다(block 강제 시 줄 16→32px). ③은 하네스가 선택을 못 만들어 수정 전에도 초록이다.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/static-hint-select-1007.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function openStaff(page: Page) {
  await bootOwner(page, {
    viewport: { width: 390, height: 844 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/(get_my_venue_staff|get_my_venue_invites|get_ledger_access_user_ids|get_voucher_viewer_ids|get_schedule_manager_ids)/, (r) => r.fulfill(json([])));
    },
  });
  await openMyStore(page);
  // 모바일 '전체 메뉴' — 첫 부팅 직후 판이 한 번 다시 그려져 펼침이 날아갈 수 있어 펼쳐질 때까지 누른다(mystore-role-nav 와 같은 사정).
  const staffBtn = page.locator('[data-tab="my-store"]').getByRole('button', { name: '직원 관리', exact: true }).first();
  await expect(async () => {
    if (!(await staffBtn.isVisible())) await page.getByTestId('mystore-menu-toggle').click();
    await expect(staffBtn).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await staffBtn.click();
  const ol = page.locator('#staff-invite-hint');
  await expect(ol).toBeVisible({ timeout: 20_000 });
  await ol.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  return ol;
}

const geom = (page: Page) => page.evaluate(() => {
  const ol = document.getElementById('staff-invite-hint')!;
  const below = ol.closest('form')!.nextElementSibling as HTMLElement;
  return {
    ol: ol.getBoundingClientRect().height,
    li: [...ol.querySelectorAll('li')].map((l) => l.getBoundingClientRect().height),
    below: below.getBoundingClientRect().top,
    sel: String(getSelection()),
  };
});

test('직원 초대 안내 — 줄을 눌러도 선택되지 않고 줄 높이·아래 요소가 그대로다', async ({ page }) => {
  test.setTimeout(90_000);
  const ol = await openStaff(page);
  const lis = ol.locator('li');
  await expect(lis).toHaveCount(3);

  // ① 선택 불가 — 웹 브라우저 그대로 + 설치형(standalone) 규칙을 켠 상태 둘 다.
  //    설치형 규칙은 index.css 의 @media (display-mode: standalone) 블록을 **빌드된 그대로** 꺼내 무조건 적용한다
  //    (하네스가 display-mode 를 흉내 내지 못해서). 그 블록이 li 를 user-select:text 로 직접 연다.
  const userSelect = () => lis.evaluateAll((els) => els.flatMap((li) => [li, ...li.querySelectorAll('*')].map((e) => getComputedStyle(e).userSelect)));
  expect.soft((await userSelect()).filter((v) => v !== 'none'), '안내 줄이 선택 가능하다(웹)').toEqual([]);
  const injected = await page.evaluate(() => {
    let css = '';
    for (const sh of [...document.styleSheets]) {
      let rules: CSSRuleList; try { rules = sh.cssRules; } catch { continue; }
      for (const r of [...rules]) if (r instanceof CSSMediaRule && r.conditionText.includes('display-mode: standalone')) css += [...r.cssRules].map((x) => x.cssText).join('\n');
    }
    const st = document.createElement('style'); st.id = '__standalone'; st.textContent = css; document.head.append(st);
    return css.includes('li');
  });
  expect(injected, '설치형 규칙(li 선택 허용)을 찾지 못했다 — 잴 대상이 없으면 통과가 아니다').toBe(true);
  expect.soft((await userSelect()).filter((v) => v !== 'none'), '설치형에서 안내 줄이 선택 가능하다').toEqual([]);

  // ② 맨 글자(익명 flex 아이템) 없음 + 줄이 block 으로 풀려도(실기기 증상 모양) 번호와 글이 한 줄에 남는다.
  const bare = await lis.evaluateAll((els) => els.flatMap((li) => [...li.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim()).map((n) => n.textContent)));
  expect.soft(bare, '안내 줄에 맨 글자 노드가 있다(익명 flex 아이템)').toEqual([]);
  const split = await lis.evaluateAll((els) => els.map((li) => {
    const h0 = li.getBoundingClientRect().height;
    li.style.display = 'block';
    const h1 = li.getBoundingClientRect().height;
    li.style.display = '';
    return { h0, h1 };
  }));
  console.log('[block 강제]', JSON.stringify(split));
  for (const s of split) expect.soft(s.h1, `block 으로 풀리면 번호·글이 두 줄로 갈라진다 (${JSON.stringify(s)})`).toBeLessThan(s.h0 * 1.5);

  // ③ CDP 터치 — 탭(짧게)·길게 누르기 전후 줄 높이와 아래 요소 y 가 그대로.
  const cdp = await page.context().newCDPSession(page);
  const b = (await lis.nth(1).boundingBox())!;
  const pt = { x: b.x + b.width * 0.5, y: b.y + b.height / 2, radiusX: 4, radiusY: 4, force: 1, id: 1 };
  const g0 = await geom(page);
  for (const hold of [80, 800]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(hold);
    const mid = await geom(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    const end = await geom(page);
    console.log(`[터치 ${hold}ms]`, JSON.stringify({ g0, mid, end }));
    for (const g of [mid, end]) {
      expect(g.sel, `터치 ${hold}ms 에 글이 선택됐다`).toBe('');
      expect(Math.abs(g.ol - g0.ol), `터치 ${hold}ms 에 안내 높이가 바뀌었다`).toBeLessThanOrEqual(0.5);
      g.li.forEach((h, i) => expect(Math.abs(h - g0.li[i]), `터치 ${hold}ms 에 ${i + 1}번 줄 높이가 바뀌었다`).toBeLessThanOrEqual(0.5));
      expect(Math.abs(g.below - g0.below), `터치 ${hold}ms 에 아래 요소가 밀렸다`).toBeLessThanOrEqual(0.5);
    }
  }
});
