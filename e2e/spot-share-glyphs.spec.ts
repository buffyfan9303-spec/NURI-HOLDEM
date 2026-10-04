// 게시판 SPOT 공유(피드 카드·글 상세)의 글자는 전부 웹폰트가 그린다 — 시스템 대체 글꼴 0 (M3-03, 2026-10-04)
//
// 결함: SPOT 글을 처음 열면 화면이 0.3초(CPU4 rAF 최대 간격 중앙값 283~450ms, CPU6 483~517ms) 멈췄다.
//   트레이스로 잰 원인은 '강제 레이아웃' 자체가 아니라 그 레이아웃 안의 **글꼴 대체 탐색**이었다 —
//   카드 무늬 ♠♦♣ 는 Pretendard 에 없어서(♥ 만 있다) 무늬 글자 하나하나가 대체 글꼴을 찾아 웹폰트 면을 새로 만들었다
//   (FontDataManager::onMakeFromStreamArgs 15회 363ms · 그 Layout 606ms). 무늬를 SVG 로 바꾸자 0회 · 127ms,
//   rAF 최대 간격 중앙값 CPU4 183~200ms · CPU6 350ms. 원자료: 문서 폴더 fix-m3-03-1004.md.
//   (SpotTable 의 clientWidth 읽기를 ResizeObserver 로 옮기는 것만으로는 그 레이아웃을 App.tsx 의 다음 읽기가 똑같이 치렀다 — 283ms.)
//
// 무엇을 보나: CDP CSS.getPlatformFontsForNode 로 SPOT 공유 화면 안 글자 요소마다 '실제로 그린 글꼴' 을 받아
//   웹폰트가 아닌(isCustomFont=false) 글꼴이 하나라도 있으면 실패한다. 성능 수치(기기·부하마다 흔들린다) 대신
//   원인 자체를 잠근다 — 무늬를 다시 글자로 되돌리면 이 시험이 빨개진다(음성 대조 확인).
// 거짓 통과 방지: 잰 글자 요소 수·카드 수가 0 이면 실패한다. 무늬 4종(♠♥♦♣)이 다 나오는 판을 쓴다.
//
// ⚠ 운영 DB 무접촉: stubLogin(로컬) + page.route 픽스처. _fixtures 가 비-GET 을 끊는다.
import { test, expect } from './_fixtures';
import { type CDPSession, type Page, type Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const PID = '00000000-0000-4000-8000-0000000e0001';
const TITLE = '글자시험 SPOT 리버';
// 내 카드 A♥ K♦ · 보드 9♣ 5♥ 2♠ 7♦ 3♣ → 무늬 4종이 모두 나온다
const SPOT = {
  v: 3, game: 'nlhe', format: 'cash', tableSize: 6, sbBb: 0.5, anteBb: 0, effectiveBb: 100,
  heroPos: 'BTN', villainPos: 'BB', extraPos: [], hero: ['Ah', 'Kd'], villain: [[]],
  board: ['9c', '5h', '2s', '7d', '3c'], street: 'river',
  actions: [
    { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
    { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 2.5 },
    { street: 'river', actor: 'villain', type: 'check' },
  ],
};
const post = {
  id: PID, user_id: '00000000-0000-4000-8000-0000000f0001', user_name: '작성자', user_role: 'user', user_color: '#7c3aed',
  user_avatar: null, content: '이 자리에서 어떻게 하시겠어요?', created_at: '2026-10-04T00:00:00Z', like_count: 0, comment_count: 0,
  view_count: 0, category: 'hand', title: TITLE, images: [], badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0,
  bumped_until: null, bump_count: 0, pinned_at: null,
};
const spotRow = { spot: SPOT, reveal_villain: false, reveal_result: false };

async function install(page: Page) {
  await page.route(/\/rest\/v1\/community_posts\?/, (r: Route) => {
    const url = decodeURIComponent(r.request().url());
    const row = url.includes('post_spots(') ? { ...post, post_spots: spotRow } : post;
    if (/[?&]id=eq\./.test(url)) return r.fulfill(json((r.request().headers()['accept'] ?? '').includes('pgrst.object') ? row : [row]));
    return r.fulfill(json([row]));
  });
  await page.route(/\/rest\/v1\/post_spots\?/, (r: Route) => r.fulfill(json({ post_id: PID, ...spotRow, coverage_kind: 'chart_nash', source_label: null, dataset_version: 'x', analysis: null })));
  await page.route(/\/rest\/v1\/post_hands\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/post_polls\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/comments\?/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r: Route) => r.fulfill(json([])));
}

/** scope 안에서 글자를 직접 가진 요소마다 실제로 그린 글꼴을 받는다. 웹폰트가 아닌 글꼴을 쓴 요소 목록과 잰 수를 돌려준다. */
async function systemFonts(page: Page, cdp: CDPSession, scope: string) {
  const marked = await page.evaluate((sel) => {
    let n = 0;
    for (const root of document.querySelectorAll(sel)) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if ([...el.childNodes].some((c) => c.nodeType === 3 && (c.textContent ?? '').trim()) && el.getClientRects().length) { el.setAttribute('data-glyph-probe', ''); n++; }
      }
    }
    return { n, cards: document.querySelectorAll(`${sel} [data-card]`).length };
  }, scope);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-glyph-probe]' });
  const bad: string[] = [];
  for (const nodeId of nodeIds) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    const sys = fonts.filter((f) => !f.isCustomFont);
    if (sys.length) {
      const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId });
      bad.push(`${sys.map((f) => `${f.familyName}×${f.glyphCount}`).join(',')} ← ${outerHTML.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
  }
  await page.evaluate(() => document.querySelectorAll('[data-glyph-probe]').forEach((e) => e.removeAttribute('data-glyph-probe')));
  return { ...marked, probed: nodeIds.length, bad };
}

test('SPOT 공유 피드 카드·글 상세의 글자는 전부 웹폰트가 그린다(대체 글꼴 탐색 0 — 첫 열기 멈춤 원인)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { try { localStorage.setItem('nuri:board-view', 'feed'); } catch { /* 사생활 모드 */ } });
  await stubLogin(page);
  await stabilizeBackstack(page);
  await install(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const tab = page.getByRole('button', { name: '게시판', exact: true }).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click();
  const feed = page.locator('[data-spot-feed]').filter({ visible: true }).first();
  if (!(await feed.isVisible().catch(() => false))) {
    const toggle = page.getByTestId('board-view-toggle');
    if (await toggle.count() && (await toggle.getAttribute('data-view')) === 'compact') await toggle.click();
  }
  await expect(feed, '피드에 SPOT 테이블이 없다').toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);

  const f = await systemFonts(page, cdp, '[data-spot-feed]');
  expect(f.cards, '피드 카드 수(0 이면 잰 것이 없다)').toBeGreaterThanOrEqual(7);
  expect(f.probed, '피드에서 잰 글자 요소 수').toBeGreaterThan(5);
  expect(f.probed).toBe(f.n);

  await page.locator('li').filter({ hasText: TITLE }).filter({ visible: true }).first().evaluate((n) => (n as HTMLElement).click());
  const felt = page.getByRole('dialog').first().locator('[data-spot-post] [data-felt]');
  await expect(felt, '상세에 테이블이 없다').toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const d = await systemFonts(page, cdp, '[role=dialog] [data-spot-post]');
  expect(d.cards, '상세 카드 수(0 이면 잰 것이 없다)').toBeGreaterThanOrEqual(7);
  expect(d.probed, '상세에서 잰 글자 요소 수').toBeGreaterThan(10);

  expect([...f.bad.map((b) => `피드: ${b}`), ...d.bad.map((b) => `상세: ${b}`)],
    'SPOT 공유 화면에 웹폰트가 못 그려 시스템 대체 글꼴로 그린 글자가 있다 — 첫 열기 레이아웃에서 대체 글꼴 탐색 비용을 치른다(무늬는 SVG 로)').toEqual([]);
});
