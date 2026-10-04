// 게시판 상단 한 줄(오너 결정 2026-10-04 안 A) — 세 줄(글쓰기 바 · 검색+최신|인기 · 카테고리+보기)을 한 줄 + 글쓰기 FAB 로.
//
// 이 파일이 보는 것(수정 전 빌드에서는 ①부터 실패한다 — 한 줄도 FAB 도 없다)
//   ① 390·360: 칩 레일·🔍·⇅·보기 토글이 **같은 44px 줄** 하나에 있고, 아이콘·칩 히트영역이 44px 이상이다.
//   ② 🔍 → 같은 줄이 입력칸으로 바뀐다: 줄 높이·목록 위치 이동 0, 입력에 포커스. ✕ → 돌아오고 검색어는 남아 🔍 에 점.
//      열린 채 다른 탭에 갔다 와도(keep-alive) 열린 상태·검색어가 그대로다. 화면 높이가 키보드만큼 줄어도 줄이 제자리.
//   ③ ⇅ 메뉴는 화면 안에 열리고, '인기'를 고르면 정렬 이름이 바뀌고 닫힌다. 바깥을 누르면 닫힌다.
//   ④ 보기 토글 하나가 모아보기↔펼쳐보기를 오가고 저장한다(기본 compact — N08 는 board-view-toggle.spec 이 따로 본다).
//   ⑤ FAB: 하단 탭바·'맨 위로'·마지막 글(최대 스크롤)과 겹치지 않고, 비로그인이면 로그인 유도를 띄운다.
//   ⑫ FAB 가 탭바 바로 위(12~16px)·오른쪽 16px — 높이·주소창 흉내(뷰포트 축소·visualViewport 가짜)에도 탭바 기준 유지, '맨 위로'는 게시판에서만 FAB 왼쪽 같은 줄.
//   ⑫-c 스크롤 0→끝→0 을 4px 단위로 훑어 FAB·'맨 위로' 겹침 0, FAB 중심 누름 = 글쓰기(PR #155 검토 P1).
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
  test(`⑤ ${w}: FAB — 탭바·맨 위로·마지막 글과 안 겹침, 비로그인은 로그인 유도`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await page.addInitScript(() => { (window as unknown as { __login: number }).__login = 0; window.addEventListener('nuri:require-login', () => { (window as unknown as { __login: number }).__login += 1; }); });
    await openBoard(page);
    const probe = () => page.evaluate(() => {
      const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const fab = r(document.querySelector('[data-testid="board-write"]'))!;
      const lis = [...document.querySelectorAll('[data-sec="board"] [data-board-loaded] li')].filter((x) => (x as HTMLElement).offsetParent);
      const nav = [...document.querySelectorAll('nav')].map((n) => n.getBoundingClientRect()).filter((b) => b.bottom >= innerHeight - 4 && b.height > 0)[0];
      return { fab, last: r(lis[lis.length - 1] ?? null), navTop: nav ? nav.top : null, top: r(document.querySelector('.scroll-top-fab')), vw: innerWidth };
    });
    const ov = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);
    for (const at of ['top', 'max'] as const) {
      if (at === 'max') { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(500); }
      const p = await probe();
      expect(p.fab.r - p.fab.l, 'FAB 폭').toBeGreaterThanOrEqual(44);
      expect(p.fab.r, 'FAB 가 화면 밖').toBeLessThanOrEqual(p.vw);
      if (p.navTop != null) expect(p.fab.b, `${at}: FAB 가 하단 탭바에 닿는다`).toBeLessThanOrEqual(p.navTop);
      expect(ov(p.fab, p.top!), `${at}: '맨 위로' 버튼과 겹친다`).toBe(false);
      // (2026-10-04 15시 오너 "우측 하단으로" — 토스트 2줄 자리 예약을 풀었다. 토스트는 z-120 으로 잠깐 FAB 위를 덮는다. 탭바 간격은 ⑫)
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

// ⑨ 디자인 검토 P1(2026-10-04): 짧은 화면(×640)에서 맨 끝까지 내리면 FAB 칸이 하위 탭 바(sticky z-30)까지 올라온다.
//    그때 탭 바가 이겨야 한다 — 391c5a78(FAB z-40)에서는 '딜러'·'장터' 중심을 FAB 가 가로챘다. 푸터 '더보기' 를 펼친 상태는 높이 760 에서 본다
//    (640 에서 펼치면 탭 바째 화면 위로 밀려 나가 잴 것이 없다 — 391c5a78 실측: 360·320×760 에서 '딜러' 를 FAB 가 가로챘다).
//    판정은 '화면 안에 들어온 탭 중심의 elementFromPoint 가 FAB 안이 아니다'.
for (const w of [390, 360, 320]) {
  for (const more of [false, true]) {
    test(`⑨ ${w}×${more ? 760 : 640}${more ? ' · 푸터 더보기 펼침' : ''}: 맨 끝 스크롤에서 하위 탭 바 누름을 FAB 가 가로채지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: more ? 760 : 640 });
      await openBoard(page);
      if (more) {
        const more = page.getByTestId('footer-more');
        await expect(more, "푸터 '더보기'(details) 가 없다 — 검사 조건이 사라졌다").toHaveCount(1);
        await more.locator('summary').evaluate((b) => (b as HTMLElement).click());
        await expect(more, '더보기가 안 펼쳐졌다').toHaveAttribute('open', '');
        await page.waitForTimeout(300);
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const fab = document.querySelector('[data-testid="board-write"]')!;
        const tabs = [...document.querySelectorAll<HTMLElement>('[data-community-secbar] [data-testid^="sec-tab-"]')];
        return tabs.map((t) => {
          const b = t.getBoundingClientRect();
          const x = b.left + b.width / 2, y = b.top + b.height / 2;
          if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return { id: t.dataset.testid, ok: true, skipped: true };
          const hit = document.elementFromPoint(x, y);
          return { id: t.dataset.testid, ok: !(hit && fab.contains(hit)), hit: hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? hit?.tagName, skipped: false };
        });
      });
      expect(r.filter((x) => !x.skipped).length, '잴 탭이 없다(탭 바가 화면 밖)').toBeGreaterThan(3);
      expect(r.filter((x) => !x.ok), `탭 중심을 FAB 가 가로챈다: ${JSON.stringify(r)}`).toEqual([]);
    });
  }
}

// ⑩ 디자인 검토 P2(2026-10-04): PC(1024·1440)에서 레일 밖 카테고리도 마우스 세로 휠로 꺼내 누를 수 있다.
for (const w of [1440, 1024]) {
  test(`⑩ ${w}: 모든 카테고리를 마우스(세로 휠)로 꺼내 누를 수 있다`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await openBoard(page);
    const rail = page.locator('[data-board-cat-rail]');
    const n = await rail.locator('button').count();
    expect(n, '카테고리 칩 수').toBeGreaterThanOrEqual(8);
    const rb = (await rail.boundingBox())!;
    const y0 = await page.evaluate(() => scrollY);
    for (let i = 0; i < n; i++) {
      const chip = rail.locator('button').nth(i);
      // 칩이 레일 안에 온전히 들어올 때까지 레일 위에서 휠(아래로)
      for (let k = 0; k < 20; k++) {
        const inside = await chip.evaluate((c) => { const r = c.getBoundingClientRect(); const p = c.parentElement!.getBoundingClientRect(); return r.left >= p.left - 0.5 && r.right <= p.right + 0.5; });
        if (inside) break;
        await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
        await page.mouse.wheel(0, 60);
        await page.waitForTimeout(80);
      }
      const b = (await chip.boundingBox())!;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await expect(chip, `${i}번째 칩을 꺼내 누르지 못했다`).toHaveAttribute('aria-pressed', 'true');
    }
    expect(await page.evaluate(() => scrollY), '레일을 휠로 밀 수 있는 동안 페이지가 세로로 움직였다').toBe(y0);
    // 레일 끝에 닿은 뒤의 세로 휠은 페이지에 돌려준다(레일 위에서도 페이지가 내려간다)
    const canScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight > 20);
    if (canScroll) {
      await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
      await page.mouse.wheel(0, 200);
      await expect.poll(() => page.evaluate(() => scrollY), { timeout: 3_000 }).toBeGreaterThan(y0);
    }
  });
}

test('⑪ 검색칸 × 는 하나(닫기) · ⇅ 메뉴는 ↑↓ 로 항목을 옮기고 페이지를 스크롤하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  await page.getByTestId('board-search-open').click();
  const input = page.getByRole('searchbox', { name: /게시글 검색/ });
  await input.fill('위클리');
  // 브라우저 기본 지우기(×)는 type=search 에만 붙는다 — 검색 의미는 role=searchbox · inputmode=search 로 유지
  expect(await input.getAttribute('type'), '기본 × 가 붙는 type=search').not.toBe('search');
  await expect(input).toHaveAttribute('inputmode', 'search');
  await page.getByTestId('board-search-close').click();
  await page.getByTestId('board-search-open').click();
  await input.fill('');
  await page.getByTestId('board-search-close').click();
  const y0 = await page.evaluate(() => scrollY);
  await page.getByTestId('board-sort').click();
  await expect(page.getByTestId('board-sort-new')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('board-sort-popular')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('board-sort-new'), '끝에서 처음으로 돌아가야 한다').toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('board-sort-popular')).toBeFocused();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => scrollY), '화살표 키에 페이지가 스크롤됐다').toBe(y0);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('board-sort')).toHaveAttribute('aria-label', '정렬: 인기');
});

// ⑫ 오너 2026-10-04 15시(실기기 하단 주소창 캡처) "글쓰기가 너무 중간 — 우측 하단으로".
//    목록을 읽는 동안(피드가 화면 아래로 이어질 때) FAB 는 탭바 윗변 12~16px 위·오른쪽 16px 이다.
//    수정 전(bottom = --tabbar-float + 4rem) 390·360·320×640 실측 간격 112px — 여기서 실패한다.
//    주소창은 하네스에 없다(재현 못 함 ≠ 없음): ⓐ 뷰포트를 주소창 높이만큼 줄여도(640→584) ⓑ innerHeight·visualViewport 를
//    가짜로 줄여 resize 를 쏴도 탭바 기준 간격이 그대로인지 본다. 소스 쪽은 communityFab.contract.test.ts 가 막는다.
//    '맨 위로'(같은 right-4 열)는 게시판에서만 FAB 왼쪽 같은 줄로 비켜서고(탭바 숨김에도 — 세로 중심 일치), 다른 하위 탭·PC 에서는 예전 자리다.
//    운영 익명 피드는 글이 적어 FAB 가 피드 끝 칸에 내려앉는다(390×640 에서도) — 떠 있는 상태를 재려고 목록을 24건으로 목킹한다.
const longFeed = (page: Page) => page.route(/\/rest\/v1\/community_posts\?/, (r) => {
  if (r.request().method() !== 'GET') return r.fallback();
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Array.from({ length: 24 }, (_, i) => ({
    id: `fab-${i}`, user_id: `u-fab-${i}`, user_name: `작성자${i}`, user_role: 'user', user_color: '#888', user_avatar: null,
    content: `본문 ${i}`, created_at: new Date(Date.UTC(2026, 8, 30, 12) - i * 3600_000).toISOString(),
    like_count: 0, comment_count: 0, view_count: 0, category: 'free', title: `목록 길이용 글 ${i}`, images: [],
    badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  }))) });
});
for (const [w, h] of [[390, 640], [360, 640], [320, 640], [390, 700], [360, 740], [390, 844]] as const) {
  test(`⑫ ${w}×${h}: FAB 가 탭바 바로 위 오른쪽 · 주소창 흉내에도 유지 · '맨 위로'와 안 겹침`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await longFeed(page);
    await openBoard(page);
    const probe = () => page.evaluate(() => {
      const fab = document.querySelector('[data-testid="board-write"]')!.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="하단 내비게이션"]')!.getBoundingClientRect();
      const st = document.querySelector('.scroll-top-fab')!.getBoundingClientRect();
      const below = [...document.querySelectorAll('[data-sec="board"] [data-board-loaded] li')].some((li) => (li as HTMLElement).offsetParent && li.getBoundingClientRect().top > fab.bottom);
      return { gap: nav.top - fab.bottom, right: innerWidth - fab.right, fabT: fab.top, fabB: fab.bottom, fabL: fab.left, stT: st.top, stB: st.bottom, stL: st.left, stR: st.right, fabR: fab.right, below, boardFab: document.documentElement.hasAttribute('data-board-fab') };
    });
    const p = await probe();
    expect(p.below, '피드가 FAB 아래로 이어지지 않는다 — 떠 있는 FAB 를 잴 조건이 아니다(목킹이 안 먹었다)').toBe(true);
    expect(p.gap, `FAB–탭바 간격 ${p.gap}px`).toBeGreaterThanOrEqual(12);
    expect(p.gap, `FAB–탭바 간격 ${p.gap}px — 목록 한가운데 떠 있다`).toBeLessThanOrEqual(16);
    expect(Math.abs(p.right - 16), `오른쪽 여백 ${p.right}px`).toBeLessThanOrEqual(1.5);
    expect(p.boardFab, '게시판 신호(html[data-board-fab])가 안 켜졌다').toBe(true);
    const noOverlap = (q: typeof p) => q.stB <= q.fabT || q.stT >= q.fabB || q.stR <= q.fabL || q.stL >= q.fabR;
    expect(noOverlap(p), `'맨 위로'(${p.stT}–${p.stB})와 FAB(${p.fabT}–${p.fabB})가 겹친다`).toBe(true);
    // 탭바 자동 숨김 상태에서도 '맨 위로'가 FAB 위에 남는다(내려오면 겹친다)
    await page.evaluate(() => document.documentElement.setAttribute('data-tabbar-hidden', ''));
    await page.waitForTimeout(450);
    const ph = await probe();
    expect(noOverlap(ph), `탭바 숨김: '맨 위로'(${ph.stT}–${ph.stB})와 FAB(${ph.fabT}–${ph.fabB})가 겹친다`).toBe(true);
    await page.evaluate(() => document.documentElement.removeAttribute('data-tabbar-hidden'));
    await page.waitForTimeout(450);
    // ⓑ 주소창 흉내 — innerHeight·visualViewport 만 줄이고 resize 를 쏜다(레이아웃 뷰포트는 그대로). FAB 는 CSS 만이라 그대로여야 한다
    await page.evaluate(() => {
      const H = innerHeight - 56;
      Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => H });
      if (window.visualViewport) Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => H });
      window.dispatchEvent(new Event('resize'));
      window.visualViewport?.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(300);
    const pv = await probe();
    expect(Math.abs(pv.gap - p.gap), `visualViewport 가짜 축소에 FAB 가 움직였다(${p.gap}→${pv.gap})`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(pv.fabB - p.fabB), 'visualViewport 가짜 축소에 FAB 가 움직였다').toBeLessThanOrEqual(0.5);
    // ⓐ 주소창이 펴져 보이는 높이가 56px 줄어든 상황 — 탭바와 같이 올라와 간격이 그대로
    await page.setViewportSize({ width: w, height: h - 56 });
    await page.waitForTimeout(400);
    const pa = await probe();
    if (pa.below) {
      expect(pa.gap, `뷰포트 ${h - 56}: FAB–탭바 간격 ${pa.gap}px`).toBeGreaterThanOrEqual(12);
      expect(pa.gap, `뷰포트 ${h - 56}: FAB–탭바 간격 ${pa.gap}px`).toBeLessThanOrEqual(16);
    }
  });
}

// ⑫-c PR #155 독립 검토 P1: 피드 끝이 올라오는 구간에서 sticky FAB 가 위로 쓸려 올라가며, FAB 위로 비켜서 있던 '맨 위로'와 겹쳐
//      FAB 중심을 누르면 '맨 위로'가 눌렸다(390×844 y 604–676 등 6개 크기 전부). 스크롤 0→끝→0 을 4px 단위로 훑으며 매 단계
//      ① 두 버튼 겹침 0 ② FAB 중심 elementFromPoint = 글쓰기 ③ '맨 위로'가 보이면 그 중심 = '맨 위로' ④ FAB 가 떠 있을 때 두 버튼 세로 중심 일치(≤1px).
for (const [w, h] of [[390, 844], [390, 640], [360, 800], [320, 640], [412, 915], [360, 740]] as const) {
  test(`⑫-c ${w}×${h}: 스크롤 0→끝→0 4px 훑기 — FAB 와 '맨 위로' 겹침 0 · FAB 중심 누름 = 글쓰기`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: w, height: h });
    await longFeed(page);
    await openBoard(page);
    const r = await page.evaluate(async () => {
      const fab = document.querySelector<HTMLElement>('[data-testid="board-write"]')!;
      const st = document.querySelector<HTMLElement>('.scroll-top-fab')!;
      const bar = document.querySelector<HTMLElement>('[data-community-secbar]')!;
      const nav = document.querySelector<HTMLElement>('nav[aria-label="하단 내비게이션"]')!;
      const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const max = document.documentElement.scrollHeight - innerHeight;
      const bad: Record<'overlap' | 'fabHit' | 'topHit' | 'align', string[]> = { overlap: [], fabHit: [], topHit: [], align: [] };
      let steps = 0, shownSteps = 0, floatSteps = 0;
      const step = async (dir: string) => {
        await raf(); steps++;
        const f = fab.getBoundingClientRect(), s = st.getBoundingClientRect();
        const shown = getComputedStyle(st).opacity !== '0' && getComputedStyle(st).pointerEvents !== 'none';
        const ix = Math.min(f.right, s.right) - Math.max(f.left, s.left), iy = Math.min(f.bottom, s.bottom) - Math.max(f.top, s.top);
        const tag = `${dir} y=${Math.round(scrollY)} hid=${document.documentElement.hasAttribute('data-tabbar-hidden')}`;
        if (shown) {
          shownSteps++;
          if (ix > 0 && iy > 0) bad.overlap.push(`${tag}: 겹침 ${ix.toFixed(1)}×${iy.toFixed(1)}`);
          const se = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
          if (!se?.closest('.scroll-top-fab')) bad.topHit.push(`${tag}: '맨 위로' 중심이 ${se?.closest('[data-testid]')?.getAttribute('data-testid') ?? se?.tagName}`);
        }
        const cx = f.left + f.width / 2, cy = f.top + f.height / 2;
        const b = bar.getBoundingClientRect(), n = nav.getBoundingClientRect();
        if (cy > b.bottom + 1 && cy < n.top - 1 && cy < innerHeight) {
          const e = document.elementFromPoint(cx, cy);
          if (!e?.closest('[data-testid="board-write"]')) bad.fabHit.push(`${tag}: FAB 중심 누름이 ${e?.closest('.scroll-top-fab') ? "'맨 위로'" : (e?.closest('[data-testid]')?.getAttribute('data-testid') ?? e?.tagName)}`);
        }
        // 떠 있는 FAB(뷰포트 아래 기준 80.75px 자리)와 '맨 위로' 세로 중심
        if (Math.abs((innerHeight - f.bottom) - 80.75) < 1) {
          floatSteps++;
          const d = Math.abs(cy - (s.top + s.height / 2));
          if (d > 1) bad.align.push(`${tag}: 세로 중심 차 ${d.toFixed(2)}px`);
          if (s.right > f.left - 4) bad.align.push(`${tag}: '맨 위로'가 FAB 왼쪽 옆이 아니다(오른쪽 ${s.right.toFixed(1)} vs FAB 왼쪽 ${f.left.toFixed(1)})`);
        }
      };
      for (let y = 0; y <= max; y += 4) { window.scrollTo({ top: y, behavior: 'instant' }); await step('down'); }
      for (let y = max; y >= 0; y -= 4) { window.scrollTo({ top: y, behavior: 'instant' }); await step('up'); }
      return { max, steps, shownSteps, floatSteps, bad };
    });
    expect(r.max, '문서가 짧아 훑을 구간이 없다(목킹 확인)').toBeGreaterThan(600);
    expect(r.shownSteps, "'맨 위로'가 한 번도 안 보였다 — 겹침을 잴 조건이 아니다").toBeGreaterThan(20);
    expect(r.floatSteps, '떠 있는 FAB 를 한 번도 못 쟀다').toBeGreaterThan(20);
    // P1 본체(겹침·가로챔)를 먼저 단언한다 — 수정 전 빌드에서 어느 쪽으로 실패했는지가 메시지에 남게.
    expect(r.bad.overlap.slice(0, 8), `FAB·'맨 위로' 겹침 ${r.bad.overlap.length}단계 / ${r.steps}`).toEqual([]);
    expect(r.bad.fabHit.slice(0, 8), `FAB 중심 누름 가로챔 ${r.bad.fabHit.length}단계 / ${r.steps}`).toEqual([]);
    expect(r.bad.topHit.slice(0, 8), `'맨 위로' 중심 가로챔 ${r.bad.topHit.length}단계`).toEqual([]);
    expect(r.bad.align.slice(0, 8), `옆 칸·세로 중심 ${r.bad.align.length}단계`).toEqual([]);
  });
}

test("⑫-b '맨 위로'는 게시판 밖(다른 하위 탭)·PC 1440 에서 예전 자리 그대로", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await openBoard(page);
  const st = () => page.evaluate(() => { const el = document.querySelector('.scroll-top-fab')!; return { b: innerHeight - el.getBoundingClientRect().bottom, rg: innerWidth - el.getBoundingClientRect().right, tf: getComputedStyle(el).transform, sig: document.documentElement.hasAttribute('data-board-fab') }; });
  const onBoard = await st();
  expect(onBoard.sig).toBe(true);
  // 게시판 밖 — '실시간' 하위 탭
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-live"]') as HTMLElement).click());
  await page.waitForTimeout(500);
  const off = await st();
  expect(off.sig, '게시판을 떠났는데 신호가 남았다').toBe(false);
  expect(off.tf, "게시판 밖에서 '맨 위로'가 옮겨졌다").toBe('none');
  // 다른 메인 탭(홈)
  await page.locator('nav').getByRole('button', { name: '홈', exact: true }).first().click();
  await page.waitForTimeout(400);
  expect((await st()).tf).toBe('none');
  // 게시판으로 돌아오면 다시 비켜선다
  await page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
  await page.waitForTimeout(500);
  const back = await st();
  expect(back.sig).toBe(true);
  expect(back.rg - off.rg, "게시판에서 '맨 위로'가 FAB 왼쪽 옆으로 비켜서지 않았다").toBeGreaterThan(55);
  // PC — FAB 숨김, '맨 위로'는 오른쪽 아래 1.25rem(transform 없음)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  const pc = await st();
  expect(pc.tf, "PC 에서 '맨 위로'가 옮겨졌다").toBe('none');
  expect(Math.abs(pc.b - 21.25), `PC '맨 위로' 아래 여백 ${pc.b}`).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('board-write')).toBeHidden();
});

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
