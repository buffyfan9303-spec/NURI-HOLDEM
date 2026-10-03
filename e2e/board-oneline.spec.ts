// 게시판 상단 한 줄(오너 결정 2026-10-04 안 A) — 세 줄(글쓰기 바 · 검색+최신|인기 · 카테고리+보기)을 한 줄 + 글쓰기 FAB 로.
//
// 이 파일이 보는 것(수정 전 빌드에서는 ①부터 실패한다 — 한 줄도 FAB 도 없다)
//   ① 390·360: 칩 레일·🔍·⇅·보기 토글이 **같은 44px 줄** 하나에 있고, 아이콘·칩 히트영역이 44px 이상이다.
//   ② 🔍 → 같은 줄이 입력칸으로 바뀐다: 줄 높이·목록 위치 이동 0, 입력에 포커스. ✕ → 돌아오고 검색어는 남아 🔍 에 점.
//      열린 채 다른 탭에 갔다 와도(keep-alive) 열린 상태·검색어가 그대로다. 화면 높이가 키보드만큼 줄어도 줄이 제자리.
//   ③ ⇅ 메뉴는 화면 안에 열리고, '인기'를 고르면 정렬 이름이 바뀌고 닫힌다. 바깥을 누르면 닫힌다.
//   ④ 보기 토글 하나가 모아보기↔펼쳐보기를 오가고 저장한다(기본 compact — N08 는 board-view-toggle.spec 이 따로 본다).
//   ⑤ FAB: 하단 탭바·'맨 위로'·토스트 자리·마지막 글(최대 스크롤)과 겹치지 않고, 비로그인이면 로그인 유도를 띄운다.
//   ⑥ 실제 손가락(CDP 터치): 칩 레일을 밀면 가로로 움직이고, 칩·🔍 를 눌러(누름 120ms) 동작한다.
//   ⑦ 동작 줄이기(reduced-motion)에서도 같은 결과이고 열림·메뉴에 1ms 넘는 애니메이션·전환이 없다(전역 규칙의 0.01ms 전환은 센다지 않는다).
// 게시글은 운영 DB 읽기(_fixtures 가 쓰기를 막는다).
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

async function openBoard(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await page.locator('[data-testid="sec-tab-board"]').first().waitFor({ timeout: 25_000 });
  // locator.click 은 자동 스크롤로 측정을 흔든다 — DOM click(저장소 관행)
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
  await expect(page.getByTestId('board-search-open'), '한 줄 검색 아이콘이 없다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

const row = (page: Page) => page.evaluate(() => {
  const r = (el: Element | null) => { const b = el!.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const rail = document.querySelector('[data-board-cat-rail]');
  const list = document.querySelector('[data-sec="board"] [data-board-loaded] ul');
  return {
    rail: r(rail), search: r(document.querySelector('[data-testid="board-search-open"]')),
    sort: r(document.querySelector('[data-testid="board-sort"]')), view: r(document.querySelector('[data-testid="board-view-toggle"]')),
    chips: [...rail!.querySelectorAll('button')].map((b) => r(b)),
    list: list ? r(list) : null, docTop: list ? list.getBoundingClientRect().top + scrollY : null,
    lineH: document.querySelector('[data-board-topline]')!.getBoundingClientRect().height,
    lineDocTop: document.querySelector('[data-board-topline]')!.getBoundingClientRect().top + scrollY,
    vw: innerWidth,
  };
});

for (const w of [390, 360]) {
  test(`① ${w}: 칩·🔍·⇅·보기가 한 44px 줄 · 히트 44 · 글쓰기 바 없음`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await openBoard(page);
    const g = await row(page);
    expect(g.lineH, '줄 높이').toBeCloseTo(44, 0);
    for (const [k, b] of [['search', g.search], ['sort', g.sort], ['view', g.view]] as const) {
      expect(b.w, `${k} 폭`).toBeGreaterThanOrEqual(44);
      expect(b.h, `${k} 높이`).toBeGreaterThanOrEqual(44);
      expect(Math.abs(b.t - g.rail.t), `${k} 가 칩 레일과 같은 줄이 아니다`).toBeLessThanOrEqual(1);
      expect(b.r, `${k} 가 화면 밖`).toBeLessThanOrEqual(w);
    }
    for (const c of g.chips) expect(c.h, '칩 히트 높이').toBeGreaterThanOrEqual(44);
    expect(g.rail.r, '칩 레일이 아이콘을 덮는다').toBeLessThanOrEqual(g.search.l + 0.5);
    // 칩이 넘치면 오른쪽 끝을 흐린다(가려진 칩이 있다는 단서)
    const fade = await page.locator('[data-board-cat-rail]').evaluate((el) => ({ over: el.scrollWidth > el.clientWidth + 1, cls: el.className }));
    if (fade.over) expect(fade.cls, '넘치는데 끝 흐림이 없다').toMatch(/scroll-fade-r/);
    // 예전 '나누고 싶은 이야기…' 글쓰기 바는 없고 FAB 가 있다
    await expect(page.locator('[data-sec="board"]').getByText('나누고 싶은 이야기를 적어보세요')).toHaveCount(0);
    await expect(page.getByTestId('board-write')).toBeVisible();
    // 줄은 문서에서 한 줄 — 목록 위 여백이 예전 세 줄(151.6px)보다 짧다
    expect(g.list!.t - g.rail.t, '줄 위끝 → 목록 위끝').toBeLessThan(70);
  });
}

test('② 🔍 열기/닫기 — 줄 높이·목록 이동 0, 포커스, 검색어 유지·점, 탭 왕복 유지, 키보드 높이에서도 제자리', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  const g0 = await row(page);
  await page.getByTestId('board-search-open').click();
  const input = page.getByRole('searchbox', { name: /게시글 검색/ });
  await expect(input).toBeFocused();
  const ib = (await input.boundingBox())!;
  const g1 = await row(page);
  expect(g1.lineH, '열었는데 줄 높이가 바뀌었다').toBeCloseTo(g0.lineH, 1);
  expect(Math.abs(g1.docTop! - g0.docTop!), '열었는데 목록이 움직였다').toBeLessThanOrEqual(0.5);
  expect(ib.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(ib.y - g1.rail.t), '입력칸이 그 줄 자리에 서지 않았다').toBeLessThanOrEqual(1);
  await input.fill('zq없는말');
  await expect(page.locator('[data-board-loaded]')).toHaveAttribute('data-board-loaded', 'done', { timeout: 10_000 });
  // 키보드 근사 — 화면 높이를 줄여도 줄과 입력칸이 제자리·포커스 유지
  const before = await input.boundingBox();
  await page.setViewportSize({ width: 390, height: 520 });
  await page.waitForTimeout(300);
  const after = await input.boundingBox();
  expect(Math.abs(after!.y - before!.y), '화면이 줄며 줄이 움직였다').toBeLessThanOrEqual(1);
  expect(after!.y + after!.height, '줄어든 화면에서 입력칸이 가렸다').toBeLessThanOrEqual(520);
  await expect(input).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  // 탭 왕복 — 열린 채 그대로
  await page.locator('nav').getByRole('button', { name: '홈', exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await expect(input, '탭 왕복 뒤 검색창이 닫혔다').toBeVisible({ timeout: 5_000 });
  await expect(input).toHaveValue('zq없는말');
  // ✕ — 같은 줄로 돌아오고 검색어는 남는다(🔍 에 점), 포커스는 🔍 로
  await page.getByTestId('board-search-close').click();
  await expect(input).toHaveCount(0);
  const btn = page.getByTestId('board-search-open');
  await expect(btn).toBeFocused();
  await expect(btn.locator('[data-board-search-dot]')).toHaveCount(1);
  await expect(page.locator('[data-sec="board"]').getByText('검색 결과가 없습니다')).toBeVisible();
  const g2 = await row(page);
  expect(Math.abs(g2.lineDocTop - g0.lineDocTop), '닫았는데 줄 위치가 다르다').toBeLessThanOrEqual(0.5);
  // 다시 열어 지우면 점도 사라진다
  await btn.click();
  await input.fill('');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('board-search-open').locator('[data-board-search-dot]')).toHaveCount(0);
});

for (const w of [390, 360]) {
  test(`③ ${w}: ⇅ 메뉴는 화면 안 · 인기 선택 · 바깥 누르면 닫힘`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await openBoard(page);
    const sort = page.getByTestId('board-sort');
    await expect(sort).toHaveAttribute('aria-label', '정렬: 최신');
    await sort.click();
    const menu = page.getByRole('menu', { name: '정렬' });
    await expect(menu).toBeVisible();
    const m = (await menu.boundingBox())!;
    expect(m.x, '메뉴가 왼쪽 화면 밖').toBeGreaterThanOrEqual(0);
    expect(m.x + m.width, '메뉴가 오른쪽 화면 밖').toBeLessThanOrEqual(w);
    // 메뉴가 목록 위에 그려진다(목록 행이 가로채지 않는다)
    const c = { x: m.x + m.width / 2, y: m.y + m.height * 0.75 };
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[role="menu"]'), c), '메뉴 아래쪽을 목록이 덮는다').toBe(true);
    for (const it of await menu.getByRole('menuitemradio').all()) expect((await it.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId('board-sort-popular').click();
    await expect(menu).toHaveCount(0);
    await expect(sort).toHaveAttribute('aria-label', '정렬: 인기');
    await expect(page.getByTestId('board-sort-popular')).toHaveCount(0);
    // 바깥 누르면 닫힌다
    await sort.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(4, m.y + m.height + 24); // 왼쪽 여백(page-x) — 누를 것이 없는 자리
    await expect(menu).toHaveCount(0);
    // Escape 도 닫고 버튼으로 포커스를 돌린다
    await sort.click();
    await expect(page.getByTestId('board-sort-popular')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(sort).toBeFocused();
  });
}

test('④ 보기 토글 하나 — 모아보기↔펼쳐보기·저장·aria-pressed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => { try { localStorage.removeItem('nuri:board-view'); } catch { /* 차단 */ } });
  await openBoard(page);
  const t = page.getByTestId('board-view-toggle');
  await expect(t).toHaveAttribute('data-view', 'compact');
  await expect(t).toHaveAttribute('aria-pressed', 'false');
  await t.click();
  await expect(t).toHaveAttribute('data-view', 'feed');
  await expect(t).toHaveAttribute('aria-pressed', 'true');
  const m = await page.evaluate(() => ({ cards: document.querySelectorAll('.cv-row-lg').length, rows: document.querySelectorAll('.cv-row-sm').length, s: localStorage.getItem('nuri:board-view') }));
  expect(m).toMatchObject({ rows: 0, s: 'feed' });
  expect(m.cards).toBeGreaterThan(0);
  await t.click();
  await expect(t).toHaveAttribute('data-view', 'compact');
  expect(await page.evaluate(() => localStorage.getItem('nuri:board-view'))).toBe('compact');
});

for (const w of [390, 360]) {
  test(`⑤ ${w}: FAB — 탭바·맨 위로·토스트 자리·마지막 글과 안 겹침, 비로그인은 로그인 유도`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await page.addInitScript(() => { (window as unknown as { __login: number }).__login = 0; window.addEventListener('nuri:require-login', () => { (window as unknown as { __login: number }).__login += 1; }); });
    await openBoard(page);
    const probe = () => page.evaluate(() => {
      const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const fab = r(document.querySelector('[data-testid="board-write"]'))!;
      const lis = [...document.querySelectorAll('[data-sec="board"] [data-board-loaded] li')].filter((x) => (x as HTMLElement).offsetParent);
      const nav = [...document.querySelectorAll('nav')].map((n) => n.getBoundingClientRect()).filter((b) => b.bottom >= innerHeight - 4 && b.height > 0)[0];
      const d = document.createElement('div'); d.style.height = 'var(--tabbar-float)'; document.body.append(d); const tabbarFloat = d.offsetHeight; d.remove();
      return { fab, last: r(lis[lis.length - 1] ?? null), navTop: nav ? nav.top : null, top: r(document.querySelector('.scroll-top-fab')), vh: innerHeight, vw: innerWidth, tf: tabbarFloat };
    });
    const ov = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
    for (const at of ['top', 'max'] as const) {
      if (at === 'max') { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(500); }
      const p = await probe();
      expect(p.fab.r - p.fab.l, 'FAB 폭').toBeGreaterThanOrEqual(44);
      expect(p.fab.r, 'FAB 가 화면 밖').toBeLessThanOrEqual(p.vw);
      if (p.navTop != null) expect(p.fab.b, `${at}: FAB 가 하단 탭바에 닿는다`).toBeLessThanOrEqual(p.navTop);
      expect(ov(p.fab, p.top!), `${at}: '맨 위로' 버튼과 겹친다`).toBe(false);
      // 하단 중앙 토스트 자리(--tabbar-float 위 2줄 = 65.75px)보다 위에 선다
      expect(p.vh - p.fab.b, `${at}: 토스트 2줄 자리와 겹친다`).toBeGreaterThanOrEqual(p.tf + 65.75);
      if (at === 'max' && p.last) expect(ov(p.fab, p.last), '최대 스크롤에서 마지막 글을 가린다').toBe(false);
    }
    // 예전 비로그인 바 문구('로그인하면 게시글을 작성할 수 있습니다')는 버튼 이름·툴팁으로 남는다
    await expect(page.getByTestId('board-write')).toHaveAttribute('aria-label', /로그인하면 글을 쓸 수 있어요/);
    await expect(page.getByTestId('board-write')).toHaveAttribute('title', /로그인하면 글을 쓸 수 있어요/);
    await page.getByTestId('board-write').click();
    expect(await page.evaluate(() => (window as unknown as { __login: number }).__login), '비로그인 FAB 가 로그인 유도를 안 띄웠다').toBe(1);
  });
}

// ⑧ 리드 결정(2026-10-04): 맨 끝까지 스크롤해도 FAB 가 푸터 문구(계정 삭제 안내·공지·소개문·사업자 정보)를 덮지 않는다.
//    예전 fixed FAB 는 360 맨 끝에서 '계정 삭제 안내'·'공지'·소개문 오른쪽을 덮었다 — 그 빌드에서 360·320 이 실패한다.
for (const w of [390, 360, 320]) {
  test(`⑧ ${w}: 맨 끝 스크롤에서 FAB 가 푸터 글자와 겹치지 않는다(겹침 0)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await openBoard(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const fab = document.querySelector('[data-testid="board-write"]')!.getBoundingClientRect();
      const foot = document.querySelector('[data-testid="business-footer"]');
      const hits: string[] = [];
      const tw = document.createTreeWalker(foot!, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const b of rg.getClientRects()) {
          if (b.width > 0 && !(b.right <= fab.left || b.left >= fab.right || b.bottom <= fab.top || b.top >= fab.bottom)) { hits.push(n.textContent.trim().slice(0, 24)); break; }
        }
      }
      return { hits, atEnd: Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)) <= 2, fabH: fab.height, footer: !!foot };
    });
    expect(r.footer, '푸터(business-footer)가 없다 — 검사 대상이 사라졌다').toBe(true);
    expect(r.atEnd, '맨 끝까지 못 내렸다').toBe(true);
    expect(r.fabH, 'FAB 가 그려지지 않았다').toBeGreaterThanOrEqual(44);
    expect(r.hits, `FAB 가 푸터 글자를 덮는다: ${JSON.stringify(r.hits)}`).toEqual([]);
  });
}

test('⑥ 실제 손가락(CDP 터치) — 칩 레일 밀기 · 칩 누르기 · 🔍 누르기', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  const cdp = await page.context().newCDPSession(page);
  const rail = page.locator('[data-board-cat-rail]');
  const rb = (await rail.boundingBox())!;
  const y = rb.y + rb.height / 2;
  const x0 = await rail.evaluate((el) => el.scrollLeft);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rb.x + rb.width - 10, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rb.x + rb.width - 10 - i * 18, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // 관성 스크롤이 멈출 때까지(두 번 읽어 같으면 정지)
  await expect.poll(async () => { const a = await rail.evaluate((el) => el.scrollLeft); await page.waitForTimeout(150); return a === await rail.evaluate((el) => el.scrollLeft); }, { timeout: 5_000 }).toBe(true);
  await page.waitForTimeout(800); // 사람 손: 밀고 나서 바로 누르면 Chrome 은 첫 터치를 '관성 멈춤'으로 먹는다(정상 동작)
  const x1 = await rail.evaluate((el) => el.scrollLeft);
  expect(x1, `밀었는데 칩 레일이 안 움직였다(${x0}→${x1})`).toBeGreaterThan(x0 + 20);
  expect(await rail.getAttribute('class'), '밀어 둔 상태면 왼쪽도 흐린다').toMatch(/scroll-fade-(l|x)/);
  const tap = async (sel: string) => {
    const b = (await page.locator(sel).first().boundingBox())!;
    const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await page.waitForTimeout(120);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
  };
  // ⚠ CDP 합성 터치로 레일을 민 직후의 **첫 터치**는 Chrome 이 '관성 멈춤'으로 먹고 click 을 내지 않는다(1.2s 뒤에도 같음).
  //   옛 빌드(세 줄 레일)에서도 똑같이 재현돼 앱 결함이 아니다(2026-10-04 실측) — 누를 것 없는 왼쪽 여백을 한 번 짚고 시작한다.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 4, y: y + 80 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  // 보이는 칩 중 비활성 하나를 누른다
  const idx = await rail.evaluate((el) => {
    const rr = el.getBoundingClientRect();
    return [...el.querySelectorAll('button')].findIndex((b) => { const c = b.getBoundingClientRect(); return b.getAttribute('aria-pressed') === 'false' && c.left >= rr.left + 4 && c.right <= rr.right - 30; });
  });
  expect(idx, '누를 칩이 보이지 않는다').toBeGreaterThan(-1);
  await page.evaluate(() => { const w = window as unknown as { __ev: string[] }; w.__ev = []; for (const t of ['touchstart', 'click']) document.addEventListener(t, (e) => w.__ev.push(t + ':' + ((e.target as Element).closest?.('button')?.textContent ?? (e.target as Element).tagName)), true); });
  await tap(`[data-board-cat-rail] button >> nth=${idx}`);
  const ev = await page.evaluate(() => (window as unknown as { __ev: string[] }).__ev);
  await expect(rail.locator('button').nth(idx), `칩 터치가 안 먹었다 — 이벤트 ${JSON.stringify(ev)}`).toHaveAttribute('aria-pressed', 'true');
  await tap('[data-testid="board-search-open"]');
  await expect(page.getByRole('searchbox', { name: /게시글 검색/ })).toBeFocused();
  await tap('[data-testid="board-search-close"]');
  await expect(page.getByRole('searchbox', { name: /게시글 검색/ })).toHaveCount(0);
});

test.describe('⑦ 동작 줄이기', () => {
  test('열림·메뉴가 같은 결과이고 도는 애니메이션이 없다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await openBoard(page);
    const g0 = await row(page);
    await page.getByTestId('board-search-open').click();
    const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && Number(a.effect?.getTiming().duration) > 1 && (a.effect as KeyframeEffect | null)?.target instanceof Element
      && ((a.effect as KeyframeEffect).target as Element).closest('[data-board-topline]'))
      .map((a) => `${(a as CSSTransition).transitionProperty ?? (a as CSSAnimation).animationName}:${a.effect?.getTiming().duration}`));
    expect(await running(), '검색 열림에 애니메이션이 돈다').toEqual([]);
    expect((await row(page)).lineH).toBeCloseTo(g0.lineH, 1);
    await page.getByTestId('board-search-close').click();
    await page.getByTestId('board-sort').click();
    await expect(page.getByRole('menu', { name: '정렬' })).toBeVisible();
    expect(await running(), '정렬 메뉴에 애니메이션이 돈다').toEqual([]);
  });
});
