// 오너 2026-10-10 요구 A·C·D·E·F — 동작을 실제 타이머·탭·운영 읽기 데이터로 잰다(쓰기는 _fixtures 가 끊는다).
//   A 홈 배너 5초 자동 넘김 · 숨은 탭에서는 멈춤 / B 이벤트 등수별 매장 이용권 수량(개수만) / C 커뮤니티 순서·기본 게시판 / D 공지 열람 /
//   E 매장 사진 확대(PC 클릭 · 모바일 터치) / F 홈 '커뮤니티' 칸 + 모바일 이벤트 목록 진입
import { writeFileSync } from 'node:fs';
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const ROTI = 'f35b42d1-2d54-4905-95c1-1fda24e0f178'; // 로티아레나 — venues.images 는 커버 1장(운영 읽기 2026-10-10)
const counter = (page: Page) => page.getByTestId('home-banner-counter');
const label = (page: Page) => counter(page).getAttribute('aria-label');
const navTab = (page: Page, n: string) => page.locator('nav[aria-label="하단 내비게이션"] button').filter({ hasText: n }).first();
const secBtn = (page: Page, n: string) => page.locator('[data-community-secbar]').getByRole('button', { name: n, exact: true });

/** 배너 번호가 바뀔 때까지 기다리고 걸린 ms 를 돌려준다. */
async function nextChange(page: Page, from: string | null, maxMs: number) {
  const t0 = Date.now();
  await expect.poll(() => label(page), { timeout: maxMs, intervals: [100] }).not.toBe(from);
  return Date.now() - t0;
}

test('A 홈 배너는 5초마다 넘어가고, 다른 탭에 가 있는 동안에는 멈춘다', async ({ page }) => {
  await page.goto('/');
  await expect(counter(page)).toBeVisible({ timeout: 20_000 });
  const n = Number(/(\d+)장/.exec((await label(page)) ?? '')?.[1]);
  expect(n, '배너가 1장이면 자동 넘김이 없는 게 맞다 — 이 시나리오는 2장 이상이 필요하다').toBeGreaterThan(1);
  await nextChange(page, await label(page), 9_000); // 마운트 시점의 첫 주기는 시작 시각을 모른다 — 다음 주기부터 잰다
  const gap = await nextChange(page, await label(page), 9_000);
  expect(gap, `넘김 간격 ${gap}ms`).toBeGreaterThan(4_300);
  expect(gap).toBeLessThan(6_300);
  await navTab(page, '라이브').click();
  const hidden = await label(page);
  await page.waitForTimeout(6_500);
  expect(await label(page), '숨은 홈(keep-alive)에서 배너가 계속 넘어갔다 — 배경 타이머').toBe(hidden);
  await navTab(page, '홈').click();
  await nextChange(page, hidden, 7_500); // 돌아오면 다시 돈다
});

test('C 커뮤니티 하위 메뉴는 게시판 · 홀덤펍 · 실시간 순이고 처음엔 게시판이다', async ({ page }) => {
  await page.goto('/?tab=community');
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 25_000 });
  const names = (await bar.getByRole('button').allInnerTexts()).map((s) => s.trim());
  expect(names.slice(0, 3)).toEqual(['게시판', '홀덤펍', '실시간']);
  await expect(secBtn(page, '게시판')).toHaveAttribute('aria-pressed', 'true');
});

test('F 홈 오른쪽 칸 "커뮤니티" 는 커뮤니티 게시판으로 간다 — 다른 섹션을 보다 와도 게시판', async ({ page }) => {
  await page.goto('/');
  const tile = page.getByTestId('home-quick-community');
  await expect(tile).toContainText('커뮤니티', { timeout: 20_000 });
  await expect(page.getByTestId('home-quick-event'), '이벤트 칸이 남아 있다').toHaveCount(0);
  await tile.click();
  await expect(secBtn(page, '게시판')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await secBtn(page, '홀덤펍').click();
  await expect(secBtn(page, '홀덤펍')).toHaveAttribute('aria-pressed', 'true');
  await navTab(page, '홈').click();
  await page.getByTestId('home-quick-community').click();
  await expect(secBtn(page, '게시판'), '마지막 섹션(홀덤펍)이 아니라 게시판이어야 한다').toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
});

test('D 게시판 공지 — 대표 공지를 누르면 본문이 열리고 확인으로 닫힌다', async ({ page }) => {
  await page.goto('/?tab=community');
  await expect(page.getByRole('button', { name: /^공지 전체 \d+건 펼치기$/ }), '공지 영역(펼침 버튼)이 없다').toBeVisible({ timeout: 25_000 });
  const row = page.getByRole('button', { name: / · \d+(분|시간|일|주|개월|년) 전$|· 방금/ }).filter({ visible: true }).first(); // NoticeRow 이름 = `제목 · 언제`
  await expect(row, '게시판에 공지 줄이 없다(운영 공지 8건이 커뮤니티 대상)').toBeVisible({ timeout: 25_000 });
  const title = ((await row.getAttribute('aria-label')) ?? '').split(' · ')[0];
  expect(title.length).toBeGreaterThan(3);
  await row.click();
  const dlg = page.getByRole('dialog').filter({ hasText: title }).last();
  await expect(dlg, `공지 "${title}" 상세가 안 열렸다`).toBeVisible({ timeout: 10_000 });
  await expect(dlg).not.toContainText('본문 내용이 없습니다');
  await dlg.getByRole('button', { name: '확인' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: title })).toHaveCount(0, { timeout: 5_000 });
});

test.describe('모바일 390 — F 이벤트 목록 진입 · B 등수별 이용권 수량 · E 사진 확대(터치)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('F 홈 퀵 영역의 "이벤트 목록" 을 누르면 이벤트 목록이 열린다(커뮤니티 칸은 그대로) · 한 줄', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-quick-community')).toContainText('커뮤니티', { timeout: 20_000 });
    const entry = page.getByTestId('home-event-list-entry');
    await expect(entry, '모바일에서 이벤트 목록으로 가는 길이 없다').toBeVisible();
    const lines = await entry.evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
    expect(lines, '지름길 문구가 줄바꿈됐다').toBeLessThanOrEqual(2); // py-2 포함 높이 ÷ 줄높이 — 한 줄이면 1~2
    await entry.tap();
    await expect(page.getByTestId('event-list-page'), '이벤트 목록이 안 열렸다').toBeVisible({ timeout: 10_000 });
  });

  test('B 이벤트 상세 참여 안내에 등수마다 "매장 이용권 N개" — 운영 값 그대로 · 확률·금액 없음 · 한 줄', async ({ page }) => {
    // 이벤트 보드 응답을 그대로 모은다 — 기대값을 소스 문자열이 아니라 이번 실행의 실제 API 값에서 뽑는다(공개 수량이라 개인정보 아님).
    const boards: { slug?: string; voucherByTier?: Record<string, unknown> }[] = [];
    page.on('response', async (r) => {
      if (!/\/rest\/v1\/rpc\/event_board/.test(r.url()) || !r.ok()) return;
      try { const b = await r.json(); if (b && typeof b === 'object') boards.push(b); } catch { /* 본문 없음 */ }
    });
    await page.goto('/');
    await page.getByTestId('home-event-list-entry').tap({ timeout: 20_000 });
    const list = page.getByTestId('event-list-page');
    await expect(list).toBeVisible({ timeout: 10_000 });
    const item = list.getByTestId('event-list-item').first();
    // 목록 조회가 끝날 때까지 기다린다 — 항목이 뜨거나 빈 화면이 뜨는 것 둘뿐이 확정 상태다(오류는 skip 이 아니라 실패).
    const empty = list.getByTestId('event-list-empty');
    await expect(item.or(empty), '이벤트 목록이 항목도 빈 화면도 아니다(조회 오류?)').toBeVisible({ timeout: 20_000 });
    if (await empty.isVisible()) test.skip(true, 'NOT_RUN — 목록이 로드된 뒤 빈 화면("진행 중인 이벤트가 없습니다")이다');
    await item.tap();
    const guide = page.getByTestId('event-guide');
    await expect(guide).toBeVisible({ timeout: 15_000 });
    const rows = guide.getByTestId(/^event-voucher-qty-\d+$/);
    await expect(rows.first()).toBeVisible();
    const texts = (await rows.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
    expect(texts.length, '등수 칸이 없다').toBeGreaterThan(0);
    // 실제 API 값 → 화면: 칸마다 보드의 voucherByTier[등수] 로 기대 문구를 만들어 대조한다(0 은 저장된 값이라 "0개", 없거나 잘못된 값은 "수량 안내 미등록").
    const board = boards.filter((b) => b.voucherByTier && typeof b.voucherByTier === 'object').at(-1);
    expect(board, '이벤트 보드 응답을 못 잡았다 — API→화면 대조가 공허하다').toBeTruthy();
    const tierIds = await rows.evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace('event-voucher-qty-', '')));
    const expected = tierIds.map((t) => { const v = board!.voucherByTier![t]; return `${t}등 ${typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? `매장 이용권 ${v}개` : '수량 안내 미등록'}`; });
    expect(texts, `보드 voucherByTier=${JSON.stringify(board!.voucherByTier)}`).toEqual(expected);
    writeFileSync(test.info().outputPath('event-board-expected.json'), JSON.stringify({ slug: board!.slug, voucherByTier: board!.voucherByTier, displayed: texts, expected }, null, 2));
    for (const t of texts) expect(t, `등수 칸 "${t}"`).toMatch(/^\d+등 (매장 이용권 \d+개|수량 안내 미등록)$/);
    expect(await guide.innerText()).not.toMatch(/%|확률|당첨률|\d\s*원|₩|현금|환전|수익|양도/);
    // 줄바꿈 없음 — 칸 높이가 한 줄 높이 + 여백 안
    const tall = await rows.evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight) * 1.6 + 14).length);
    expect(tall, '등수 칸 문구가 두 줄로 접혔다').toBe(0);
    await expect(guide).toContainText('별도의 구매나 비용이 필요하지 않습니다'); // 무료 참여 안내 유지
    await guide.screenshot({ path: test.info().outputPath('event-guide-390.png') });
  });

  test('E 로티아레나 배너를 손가락으로 탭하면 확대 뷰어(원본 비율 · 화면 안 · 스크롤 잠금) — 뒤로/Esc 로 닫힌다', async ({ page }) => {
    await page.goto(`/?venue=${ROTI}`);
    await expect(page.locator('[data-hero-cover]'), 'PC 전용 오버레이 버튼이 모바일에 보인다').toBeHidden({ timeout: 25_000 });
    const hero = page.locator('div:has(> [data-hero-cover])').first();
    await expect(hero).toBeVisible();
    const box = (await hero.boundingBox())!;
    expect(box.y, '배너가 상세 위쪽에 있지 않다').toBeLessThan(200);
    await hero.tap({ position: { x: box.width / 2, y: box.height / 2 } }); // 터치 이벤트 → onTouchEnd 탭 판정 → onSlideTap
    const viewer = page.getByRole('dialog', { name: /확대 보기/ });
    await expect(viewer, '사진 확대 뷰어가 안 열렸다').toBeVisible({ timeout: 10_000 });
    const img = viewer.locator('img');
    await expect(img).toHaveAttribute('src', /roti-arena-cover/);
    const m = await img.evaluate((i: HTMLImageElement) => { const r = i.getBoundingClientRect(); return { fit: getComputedStyle(i).objectFit, l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, nat: i.naturalWidth,
      lock: getComputedStyle(document.documentElement).overflow, focusIn: !!document.activeElement?.closest('[role="dialog"]') }; });
    expect(m.fit).toBe('contain');
    expect(m.nat, '이미지가 안 불러와졌다').toBeGreaterThan(0);
    expect(m.l).toBeGreaterThanOrEqual(-1); expect(m.t).toBeGreaterThanOrEqual(-1);
    expect(m.r).toBeLessThanOrEqual(m.vw + 1); expect(m.b).toBeLessThanOrEqual(m.vh + 1);
    expect(m.lock, '배경 스크롤이 안 잠겼다').toBe('hidden');
    expect(m.focusIn, '초점이 뷰어 안으로 안 갔다').toBe(true);
    await page.screenshot({ path: test.info().outputPath('venue-lightbox-390.png') });
    await page.goBack();
    await expect(viewer, '뒤로가기로 안 닫혔다').toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator('div:has(> [data-hero-cover])').first(), '뒤로가기가 매장 화면까지 닫았다').toBeVisible();
    // 매장 판(VenuePage)도 열려 있는 동안 자기 스크롤 잠금을 쥔다 — 뷰어를 닫아도 html 이 hidden 인 것이 맞다(잠금은 ref-count).
    //   뷰어의 잠금이 새는지는 두 번 열고 닫은 뒤 **매장까지 닫았을 때** 풀리는지로 본다(아래).
    await hero.tap({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(viewer).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0, { timeout: 5_000 });
    await page.goBack(); // 매장 판 닫기
    await expect(page.locator('div:has(> [data-hero-cover])'), '뒤로가기가 매장 판을 안 닫았다').toHaveCount(0, { timeout: 8_000 });
    expect(new URL(page.url()).origin, '앱 밖으로 나갔다 — 시나리오가 공허하다').toBe(new URL(test.info().project.use.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost:4173').origin);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow), { message: '뷰어를 두 번 열고 닫은 뒤 매장까지 닫았는데 스크롤 잠금이 남았다(잠금 누수)' }).not.toBe('hidden');
  });
});

test.describe('E 매장 사진 확대 (PC)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
  test('로티아레나 배너 사진을 누르면 원본 사진 확대 뷰어 — Esc 로 닫히고 초점이 돌아온다', async ({ page }) => {
    await page.goto(`/?venue=${ROTI}`);
    const hero = page.locator('[data-hero-cover]');
    await expect(hero).toBeVisible({ timeout: 25_000 });
    await hero.click();
    const viewer = page.getByRole('dialog', { name: /확대 보기/ });
    await expect(viewer, '사진 확대 뷰어가 안 열렸다').toBeVisible({ timeout: 10_000 });
    await expect(viewer.locator('img')).toHaveAttribute('src', /roti-arena-cover/);
    const fit = await viewer.locator('img').evaluate((i: HTMLImageElement) => ({ fit: getComputedStyle(i).objectFit, w: i.getBoundingClientRect().width, vw: innerWidth }));
    expect(fit.fit, '원본 비율(object-contain)이 아니다').toBe('contain');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0, { timeout: 5_000 });
    await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-hero-cover'))).toBe(true);
  });

  // WebKit 은 마우스 클릭이 button 에 포커스를 주지 않는다 → 뷰어가 opener 로 부모의 '뒤로 가기'를 저장해, 닫으면 초점이 배너가 아니라 뒤로 가기로 갔다.
  // 같은 조건을 Chromium 에서 만든다: 부모 '뒤로 가기'에 초점을 두고, mousedown 기본 동작(포커스 이동)만 한 번 막는다. 클릭·핸들러·열기/닫기는 실제 그대로다.
  for (const [name, close] of [
    ['Esc', (page: Page) => page.keyboard.press('Escape')],
    ['닫기 버튼 클릭', (page: Page) => page.getByRole('dialog', { name: /확대 보기/ }).getByRole('button', { name: '닫기', exact: true }).click()],
  ] as const) {
    test(`WebKit 마우스(클릭이 포커스를 안 줌) — 배너 확대를 ${name} 으로 닫으면 초점이 그 배너로 돌아오고 매장 화면·스크롤은 그대로`, async ({ page }) => {
      await page.goto(`/?venue=${ROTI}`);
      const hero = page.locator('[data-hero-cover]');
      await expect(hero).toBeVisible({ timeout: 25_000 });
      const back = page.getByRole('button', { name: '뒤로 가기', exact: true });
      await back.focus();
      await expect(back, '전제: 부모 뒤로 가기에 초점이 있어야 한다').toBeFocused();
      const scrolls = () => page.evaluate(() => { const out = [Math.round(scrollY)]; for (let n = document.querySelector<HTMLElement>('[data-hero-cover]'); n; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) out.push(Math.round(n.scrollTop)); return out; });
      const before = await scrolls();
      const heroNode = (await hero.elementHandle())!; // 열기 전의 그 노드
      await page.evaluate(() => document.addEventListener('mousedown', (e) => e.preventDefault(), { capture: true, once: true }));
      await hero.click();
      const viewer = page.getByRole('dialog', { name: /확대 보기/ });
      await expect(viewer, '사진 확대 뷰어가 안 열렸다').toBeVisible({ timeout: 10_000 });
      await close(page);
      await expect(viewer, '뷰어가 안 닫혔다').toHaveCount(0, { timeout: 5_000 });
      await expect(hero, '뷰어를 닫았더니 매장 화면까지 닫혔다').toBeVisible();
      await expect(back, '초점이 배너가 아니라 부모의 뒤로 가기로 돌아갔다').not.toBeFocused();
      await expect.poll(() => page.evaluate((n) => document.activeElement === n, heroNode), { message: '초점이 원래 배너 노드로 돌아오지 않았다' }).toBe(true);
      expect(await scrolls(), '닫은 뒤 스크롤 위치가 바뀌었다').toEqual(before);
    });
  }
});

// ── 배너 자동 넘김 — 영구 일시정지 + 읽는 중 표식의 수명(2026-10-10 Codex 지적: WCAG 2.2.2 · 비동기 다중 hold) ────────────────────
const pauseBtn = (page: Page) => page.getByTestId('home-banner-pause');
const bannerCount = async (page: Page) => Number(/(\d+)장/.exec((await label(page)) ?? '')?.[1]);

test('A 일시정지를 누르면 마우스를 치워도 계속 서 있고, 다시 누르면 5초마다 돈다 · 다른 탭을 다녀와도 유지', async ({ page }) => {
  await page.goto('/');
  await expect(counter(page)).toBeVisible({ timeout: 20_000 });
  expect(await bannerCount(page), '2장 이상이 필요하다').toBeGreaterThan(1);
  await expect(pauseBtn(page)).toHaveAttribute('aria-pressed', 'false');
  await pauseBtn(page).evaluate((b: HTMLElement) => b.click()); // 포인터 없이 눌러 올림 정지와 섞이지 않게 한다
  await expect(pauseBtn(page)).toHaveAttribute('aria-pressed', 'true');
  const frozen = await label(page);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(6_500);
  expect(await label(page), '일시정지인데 배너가 넘어갔다').toBe(frozen);
  await navTab(page, '라이브').click();
  await navTab(page, '홈').click();
  await expect(pauseBtn(page), '탭을 다녀오자 일시정지가 풀렸다').toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(5_500);
  expect(await label(page)).toBe(frozen);
  await pauseBtn(page).evaluate((b: HTMLElement) => b.click());
  await expect(pauseBtn(page)).toHaveAttribute('aria-pressed', 'false');
  await nextChange(page, frozen, 7_500);
});

/** 지금 화면에 **정착한** 장의 이름(슬라이드 aria-label) — 스무스 스크롤 중간이면 null.
 *  번호(카운터 'n번째')로 재면 안 된다: 늦게 온 이벤트가 live 로 판정되면 homeCarouselPlan 이 이벤트를 앞으로 옮기고,
 *  브라우저 스냅 재정렬이 보던 장을 붙잡아 **같은 장의 번호만** 바뀐다(CI 38065914971 샤드3: 'NURI HOLDEM' 그대로, 2번째→3번째). */
const shownSlide = (page: Page) => page.getByTestId('home-banner-viewport').evaluate((vp: HTMLElement) => {
  const cards = [...(vp.firstElementChild as HTMLElement).children] as HTMLElement[];
  const half = cards.length / 2; // 원본 세트 + 복제 세트(복제는 aria-label 이 없다)
  const left = vp.getBoundingClientRect().left;
  let at = 0, gap = Infinity;
  cards.forEach((c, i) => { const d = Math.abs(c.getBoundingClientRect().left - left); if (d < gap) { gap = d; at = i; } });
  return gap < 1 ? cards[at % half].getAttribute('aria-label') : null;
});

test('A 일시정지 중에도 이전/다음 화살표는 동작하지만 자동으로 돌지는 않는다', async ({ page }) => {
  await page.goto('/');
  await expect(counter(page)).toBeVisible({ timeout: 20_000 });
  // 이벤트 슬라이드가 '불러오는 중'(aria-busy)이면 응답 뒤 자리가 바뀐다 — 화살표 스무스 스크롤 도중에 바뀌면 이동 목표가 엉뚱한 장이 된다.
  await expect(page.getByTestId('home-banner-viewport').locator('[aria-busy]')).toHaveCount(0, { timeout: 15_000 });
  await pauseBtn(page).evaluate((b: HTMLElement) => b.click());
  await expect(pauseBtn(page)).toHaveAttribute('aria-pressed', 'true');
  const before = await shownSlide(page);
  expect(before, '시작 장이 정착해 있지 않다').not.toBeNull();
  await page.getByRole('button', { name: '다음 배너' }).evaluate((b: HTMLElement) => b.click());
  await expect.poll(async () => { const s = await shownSlide(page); return s !== null && s !== before; }, { timeout: 3_000, intervals: [100] }).toBe(true);
  const after = await shownSlide(page); // poll 과 별개의 읽기라 null 일 수 있다 — null===null 거짓 PASS 방지
  expect(after, '화살표 뒤 정착한 장을 다시 읽지 못했다').not.toBeNull();
  expect(after, '화살표를 눌렀는데 장이 그대로다').not.toBe(before);
  await page.waitForTimeout(5_800); // 자동 넘김 한 주기(5초)보다 길게
  await expect(pauseBtn(page), '화살표를 누르자 일시정지 버튼이 풀렸다').toHaveAttribute('aria-pressed', 'true');
  const end = await shownSlide(page);
  expect(end, '5.8초 뒤 정착한 장을 읽지 못했다').not.toBeNull();
  expect(end, '일시정지인데 화살표 뒤 정착한 장에서 다른 장으로 넘어갔다').toBe(after);
});

test.describe('모바일 390 — 읽는 중 표식(손가락 수)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('A 두 손가락 중 하나만 떼도 아직 만지는 중이다 — 전부 떼면 다시 돈다', async ({ page }) => {
    await page.goto('/');
    await expect(counter(page)).toBeVisible({ timeout: 20_000 });
    expect(await bannerCount(page)).toBeGreaterThan(1);
    // 늦게 도착하는 슬라이드(이벤트 등)가 장 수·위치를 바꾸는 구간이 끝난 뒤에 잰다 — 안 그러면 그 이동을 손가락 정지 실패로 오해한다.
    let last = '', same = 0;
    await expect.poll(async () => { const cur = await label(page) ?? ''; same = cur === last ? same + 1 : 0; last = cur; return same; }, { timeout: 4_000, intervals: [300] }).toBeGreaterThanOrEqual(5);
    const box = (await page.getByTestId('home-banner-viewport').boundingBox())!;
    const p1 = { x: box.x + 60, y: box.y + 40, id: 1 };
    const p2 = { x: box.x + 130, y: box.y + 40, id: 2 };
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchEnd', touchPoints: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await page.evaluate(() => { (window as unknown as { __tl: number[] }).__tl = []; for (const t of ['touchstart', 'touchend']) document.addEventListener(t, (e) => (window as unknown as { __tl: number[] }).__tl.push((e as TouchEvent).touches.length), true); });
    await touch('touchStart', [p1]);
    await touch('touchStart', [p1, p2]);
    await touch('touchEnd', [p2]); // 둘째 손가락만 뗀다 — 첫째는 계속 닿아 있다
    const seen = await page.evaluate(() => (window as unknown as { __tl: number[] }).__tl);
    expect(seen.at(-1), `하나만 뗀 뒤에도 touches.length 가 1 이어야 이 시나리오가 유효하다(관측 ${JSON.stringify(seen)})`).toBe(1);
    const held = await label(page);
    await page.waitForTimeout(6_500);
    expect(await label(page), '한 손가락이 닿아 있는데 배너가 넘어갔다').toBe(held);
    await touch('touchEnd', [p1]);
    await nextChange(page, held, 8_000); // 다 떼면 5초 뒤 다시 돈다
  });
});

// ── 배너 늦은 도착(1장→2장) — 이미 올려져 있거나 키보드 포커스가 안에 있으면 새 pointerenter·focusin 이 안 온다(2026-10-10 Codex 지적) ──
//   픽스처: 스냅샷으로 첫 페인트 1장(자동 넘김 없음) → home_banners 가 2.5초 늦게 2장(multi). 이벤트·브랜드 슬라이드는 app_settings 목으로 끈다. 운영 DB 에 쓰지 않는다(route 목).
test.describe('데스크톱 포인터 — 배너가 1장→2장으로 늦게 도착해도 읽는 중이면 멈춰 있다', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  const json = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const row = (id: string, title: string, sort: number) => ({ id, title, subtitle: null, image_url: '/nuri-logo.png', link_url: '/?tab=community', active: true, sort_order: sort, starts_at: null, ends_at: null });
  async function openOneSlide(page: Page) {
    // 첫 페인트 = 스냅샷 1장(이벤트·브랜드 슬라이드 끔) → 2.5초 뒤 조회 응답이 2장. 앱 자신의 스냅샷 키(nuri:snap:home-banners:v1)를 심는다.
    await page.addInitScript((snap) => localStorage.setItem('nuri:snap:home-banners:v1', JSON.stringify({ t: Date.now(), data: snap })), {
      banners: [{ id: 'late-a', title: '늦은 배너 A', subtitle: '', imageUrl: '/nuri-logo.png', linkUrl: '/?tab=community', sortOrder: 1, startsAt: null, endsAt: null, active: true }],
      configured: true, showEvent: false, showBrand: false,
    });
    await page.route(/\/rest\/v1\/rpc\/event_board/, (r) => json(r, null));
    await page.route(/\/rest\/v1\/app_settings\?.*home_slide_(event|brand)/, (r) => json(r, { value: 'off' }));
    await page.route(/\/rest\/v1\/home_banners\?/, async (r) => { await new Promise((res) => setTimeout(res, 2_500)); await json(r, [row('late-a', '늦은 배너 A', 1), row('late-b', '늦은 배너 B', 2)]); });
    await stabilizeBackstack(page);
    await page.goto('/');
    await dismissOverlays(page);
    await expect(page.getByTestId('home-banner-viewport')).toBeVisible({ timeout: 20_000 });
    await expect(counter(page), '1장일 때는 자동 넘김·카운터가 없어야 이 시나리오가 유효하다').toHaveCount(0);
  }

  test('A 마우스가 이미 올려진 채로 둘째 장이 도착하면 5초 넘게 멈춰 있고, 치우면 5초 뒤 넘어간다', async ({ page }) => {
    await openOneSlide(page);
    const box = (await page.getByTestId('home-banner-viewport').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); // 1장일 때 올려 둔다 — 이후 새 pointerenter 는 없다
    await expect(counter(page), '둘째 장이 안 도착했다').toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), '이 컨텍스트가 진짜 마우스가 아니다').toBe(true);
    const held = await label(page);
    await page.waitForTimeout(6_500);
    expect(await label(page), '이미 올려져 있는데 둘째 장 도착 뒤 배너가 넘어갔다').toBe(held);
    await page.mouse.move(2, 2);
    await nextChange(page, held, 8_000);
  });

  test('A 키보드 포커스가 이미 배너 안에 있는 채로 둘째 장이 도착하면 멈춰 있고, 포커스를 빼면 넘어간다', async ({ page }) => {
    await openOneSlide(page);
    await page.keyboard.press('Shift'); // 키보드 조작 직후의 focus() 는 :focus-visible 이다
    await page.getByTestId('home-banner-viewport').getByRole('button').first().focus();
    expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible')), '키보드 포커스 전제가 안 섰다').toBe(true);
    await expect(counter(page), '둘째 장이 안 도착했다').toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="home-banner-viewport"]')), '둘째 장이 오며 포커스가 사라졌다 — 전제 무효').toBe(true);
    const held = await label(page);
    await page.waitForTimeout(6_500);
    expect(await label(page), '키보드 포커스가 안에 있는데 둘째 장 도착 뒤 배너가 넘어갔다').toBe(held);
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await nextChange(page, held, 8_000);
  });
});
