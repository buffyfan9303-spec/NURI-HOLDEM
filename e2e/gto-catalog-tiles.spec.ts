// GTO 카탈로그 '자주 쓰는 도구' 타일 4칸 — 즐겨찾기 0·1·4·6개(2026-10-05 독립 검토 P2-2).
// 종전 빌드(e24633db)에서 즐겨찾기 1개면 타일이 1칸만(반쪽 줄) 남았다 — 이 스펙의 '1개' 경우가 실패한다.
// 계약: 타일은 늘 4칸 · 즐겨찾기가 앞 · 모자라면 기본 4개(누리 스팟·프리플랍 레인지 차트·푸시·폴드 차트·GTO 핸드 분석)로 채움(중복 0) ·
//       5번째 즐겨찾기부터는 '즐겨찾기 더' 리스트 · 22개 도구가 화면에서 하나도 사라지지 않는다.
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const DEF = ['spot', 'range', 'pushfold', 'gto'];
const CASES: { name: string; favs: string[]; tiles: string[]; more: string[] }[] = [
  { name: '0개', favs: [], tiles: DEF, more: [] },
  { name: '1개', favs: ['icm'], tiles: ['icm', 'spot', 'range', 'pushfold'], more: [] },
  { name: '4개', favs: ['icm', 'tda', 'outs', 'pot'], tiles: ['icm', 'tda', 'outs', 'pot'], more: [] },
  { name: '6개(기본 1개 포함)', favs: ['icm', 'spot', 'tda', 'outs', 'pot', 'glossary'], tiles: ['icm', 'spot', 'tda', 'outs'], more: ['pot', 'glossary'] },
];

for (const c of CASES) {
  test(`즐겨찾기 ${c.name} — 타일 4칸 · 즐겨찾기 먼저 · 나머지 리스트 · 도구 22개 유지`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubLogin(page);
    await stabilizeBackstack(page);
    await page.addInitScript((f) => { try { localStorage.setItem('nuri:fav-tools', f); } catch { /* */ } }, JSON.stringify(c.favs));
    await page.goto('/?tab=tools');
    await dismissOverlays(page);
    const feat = page.getByTestId('tools-featured');
    await expect(feat).toBeVisible({ timeout: 20_000 });
    const tiles = await feat.locator('button[data-testid^="tool-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('tool-', '')));
    expect(tiles, '타일 칸·순서').toEqual(c.tiles);
    const more = page.getByTestId('tools-fav-more');
    if (c.more.length) {
      const m = await more.locator('button[data-testid^="tool-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('tool-', '')));
      expect(m, "5번째 즐겨찾기부터 '즐겨찾기 더' 리스트").toEqual(c.more);
    } else {
      await expect(more, '즐겨찾기가 4개 이하인데 더 보기 리스트가 섰다').toHaveCount(0);
    }
    const all = await page.locator('main [data-testid^="tool-"]').evaluateAll((els) => [...new Set(els.filter((e) => e.getClientRects().length).map((e) => e.getAttribute('data-testid')))]);
    expect(all.length, '화면의 도구 종류 수가 22 가 아니다 — 타일로 옮긴 도구가 사라졌거나 숨김 도구가 나왔다').toBe(22);
  });
}

// 2026-10-06 오너 시안(gto-tiles-1006) — 카드 탭은 그 도구를, 별 탭은 즐겨찾기만(카드는 안 열린다). 기본 4개의 포인트 색은 격자 변수에서 켜진다.
const NAMES: Record<string, string> = { spot: '누리 스팟', range: '프리플랍 레인지 차트', pushfold: '푸시 · 폴드 차트', gto: 'GTO 핸드 분석' };
async function openTools(page: import('@playwright/test').Page, favs: string[] = []) {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.addInitScript((f) => { try { if (!sessionStorage.getItem('e2e:fav-seeded')) { localStorage.setItem('nuri:fav-tools', f); sessionStorage.setItem('e2e:fav-seeded', '1'); } } catch { /* */ } }, JSON.stringify(favs));
  await page.goto('/?tab=tools');
  await dismissOverlays(page);
  const feat = page.getByTestId('tools-featured');
  await expect(feat).toBeVisible({ timeout: 20_000 });
  return feat;
}
const tileOrder = (feat: import('@playwright/test').Locator) =>
  feat.locator('button[data-testid^="tool-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('tool-', '')));

for (const k of DEF) {
  test(`타일 탭 → '${NAMES[k]}' 도구가 열린다`, async ({ page }) => {
    const feat = await openTools(page);
    await feat.getByTestId(`tool-${k}`).click();
    const dlg = page.getByRole('dialog', { name: NAMES[k] });
    await expect(dlg, '카드를 눌렀는데 그 도구 화면이 안 열렸다').toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`#tool=${k}\\b`));
  });
}

test('별 탭 — 카드는 안 열리고 즐겨찾기만 켜고 끈다 · 새로고침 뒤에도 남는다', async ({ page }) => {
  const feat = await openTools(page);
  const add = feat.getByRole('button', { name: 'GTO 핸드 분석 즐겨찾기 추가' });
  await expect(add).toHaveAttribute('aria-pressed', 'false');
  // 눌림 영역: 별 글리프 위·별 왼쪽 6px 은 별, 카드 가운데는 카드(도구 열기) — 둘이 서로를 가로채지 않는다.
  //   (2026-10-06 P2 이후 별 박스는 34×44 실박스 — 그보다 왼쪽은 제목 칸이라 카드가 받는다. 아래 'CDP 터치' 테스트가 제목 끝 글자를 잠근다.)
  const hits = await page.evaluate(() => {
    const star = document.querySelector('[data-testid="tools-featured"] button[aria-label="GTO 핸드 분석 즐겨찾기 추가"]')!;
    const card = document.querySelector('[data-testid="tools-featured"] [data-testid="tool-gto"]')!;
    const g = star.querySelector('svg')!.getBoundingClientRect(); const c = card.getBoundingClientRect();
    const at = (x: number, y: number) => { const e = document.elementFromPoint(x, y); return e === star || star.contains(e) ? 'star' : e === card || card.contains(e) ? 'card' : 'other'; };
    return [at(g.x + g.width / 2, g.y + g.height / 2), at(g.x - 6, g.y + g.height / 2), at(c.x + c.width * 0.35, c.y + c.height / 2)];
  });
  expect(hits, '별 글리프 · 별 왼쪽 6px · 카드 가운데').toEqual(['star', 'star', 'card']);
  await add.click();
  const del = feat.getByRole('button', { name: 'GTO 핸드 분석 즐겨찾기 해제' });
  await expect(del).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog'), '별을 눌렀는데 카드(도구)가 열렸다 — 별과 카드 탭이 겹친다').toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('nuri:fav-tools'))).toBe('["gto"]');
  expect(await tileOrder(feat), '즐겨찾기한 도구가 타일 맨 앞으로').toEqual(['gto', 'spot', 'range', 'pushfold']);
  // reload() 는 앱이 걷어낸 주소(?tab=)로 홈에 떨어진다 — 같은 진입 주소로 다시 연다(저장소는 그대로).
  await page.goto('/?tab=tools');
  await dismissOverlays(page);
  await expect(page.getByTestId('tools-featured').getByRole('button', { name: 'GTO 핸드 분석 즐겨찾기 해제' }), '기기 저장이 새로고침 뒤에 사라졌다').toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('tools-featured').getByRole('button', { name: 'GTO 핸드 분석 즐겨찾기 해제' }).click();
  await expect(page.getByTestId('tools-featured').getByRole('button', { name: 'GTO 핸드 분석 즐겨찾기 추가' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('nuri:fav-tools'))).toBe('[]');
  expect(await tileOrder(page.getByTestId('tools-featured')), '별을 끄면 기본 4개 순서로 돌아온다').toEqual(DEF);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('기본 4개 타일 아이콘 — 시안 글리프의 파랑 포인트가 켜지고 리스트 행은 한 색이다', async ({ page }) => {
  const feat = await openTools(page);
  // 레인지 격자 글리프: 12칸 중 2칸이 포인트 색(--icon-accent), 나머지는 선 색(currentColor) 반투명
  const fills = await feat.getByTestId('tool-range').locator('svg rect').evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
  expect(fills.length, '레인지 타일이 시안 격자 글리프(12칸)가 아니다').toBe(12);
  const color = await feat.getByTestId('tool-range').locator('svg').first().evaluate((e) => getComputedStyle(e).color);
  const accent = fills.filter((f) => f !== color);
  expect(accent.length, `포인트 칸이 2개가 아니다(${fills.join(' / ')})`).toBe(2);
  // 갈래를 고르면 같은 도구가 리스트 행으로 — 거기서는 포인트도 선 색 한 가지
  await page.locator('[data-lane="explore"]').click();
  const row = page.locator('[data-tools-lanepanel] [data-testid="tool-range"]');
  await expect(row).toBeVisible();
  const rowFills = await row.locator('svg rect').evaluateAll((els) => els.map((e) => getComputedStyle(e).fill));
  const rowColor = await row.locator('svg').first().evaluate((e) => getComputedStyle(e).color);
  expect(new Set(rowFills), '리스트 행 아이콘에 포인트 색이 새어 나왔다').toEqual(new Set([rowColor]));
});

// 🔴 2026-10-06 독립 검토 P2 — 제목 끝 글자를 누르면 별(44px 확장)이 가로채 즐겨찾기만 켜지고 도구가 안 열렸다.
//   Playwright click 은 누름 0ms·요소 중심 기준이라 이 부류를 못 본다 → CDP 터치(100ms+ 누름)로 **글자 좌표**를 직접 누른다.
async function touchAt(page: import('@playwright/test').Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
for (const w of [390, 360]) {
  for (const [k, ch] of [['pushfold', '트'], ['gto', '석']] as const) {
    test(`${w}px — '${NAMES[k]}' 제목 끝 글자 '${ch}' 터치는 도구를 열고, 별 글리프 터치는 즐겨찾기만 켠다`, async ({ page }) => {
      const feat = await openTools(page);
      await page.setViewportSize({ width: w, height: 844 });
      await feat.getByTestId(`tool-${k}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const pt = await feat.getByTestId(`tool-${k}`).evaluate((btn, c) => {
        const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
        let last: Text | null = null;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.textContent ?? '').includes(c)) last = n as Text;
        if (!last) return null;
        const i = last.textContent!.lastIndexOf(c);
        const r = document.createRange(); r.setStart(last, i); r.setEnd(last, i + 1);
        const b = r.getBoundingClientRect();
        // 글자의 오른쪽 끝 안쪽(가장 별에 가까운 자리)을 누른다
        return { x: b.right - 2, y: b.top + b.height / 2 };
      }, ch);
      expect(pt, `제목에서 '${ch}' 를 못 찾았다 — 측정이 성립하지 않는다`).not.toBeNull();
      await touchAt(page, pt!.x, pt!.y);
      await expect(page.getByRole('dialog', { name: NAMES[k] }), `'${ch}' 를 눌렀는데 도구가 안 열렸다(별이 가로챘다)`).toBeVisible({ timeout: 15_000 });
      expect(await page.evaluate(() => localStorage.getItem('nuri:fav-tools')), '글자를 눌렀는데 즐겨찾기가 바뀌었다').toBe('[]');
      await page.getByRole('dialog', { name: NAMES[k] }).getByRole('button', { name: '닫기' }).first().click();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });

      const star = feat.getByRole('button', { name: `${NAMES[k]} 즐겨찾기 추가` });
      const g = await star.locator('svg').boundingBox();
      await touchAt(page, g!.x + g!.width / 2, g!.y + g!.height / 2);
      await expect(feat.getByRole('button', { name: `${NAMES[k]} 즐겨찾기 해제` }), '별 글리프를 눌렀는데 즐겨찾기가 안 켜졌다').toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(400);
      await expect(page.getByRole('dialog'), '별을 눌렀는데 도구가 열렸다').toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('nuri:fav-tools'))).toBe(JSON.stringify([k]));
    });
  }
}
