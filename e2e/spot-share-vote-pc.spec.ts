// SPOT 공유 — 올인 자리의 투표 보기 · PC 상세 테이블 폭 (2026-10-02 3차 독립 검토 후속)
//
// 원문: 문서 폴더 review-share-a3-1002.md §2(투표 보기 FAIL) · §6(PC 경미).
// ① 투표: 상대가 올인했거나(v4 프리플랍 · v5 플랍) 내 스택을 덮는 벳(v6 턴 · 내 40 에 60)이면 고를 수 있는 것은 폴드·콜뿐인데
//    화면이 '레이즈' 를 보였다. 서버가 보기를 '폴드·콜·레이즈' 로 저장한 **옛 글**(20261002c 적용 전)이 그대로라는 조건으로 잰다 —
//    피드 줄(data-spot-choices)과 상세 '투표 선택지' 버튼 둘 다 폴드·콜이어야 한다(표 0 인 레이즈는 숨김).
//    양성 대조: 같은 판에서 상대가 3BB 만 벳(v2)하면 레이즈가 남는다.
// ② PC 1440 2-pane 상세: 테이블이 608px 정사각으로 커져 투표가 첫 화면 밖으로 밀렸다 → 테이블 폭 ≤ 420px, 투표 그룹이 첫 화면 안.
// 거짓 통과 방지: 잰 글 수·버튼 수를 픽스처와 맞춘다.
// ⚠ 운영 DB 무접촉: stubLogin + page.route 픽스처. _fixtures 가 비-GET 을 끊는다.
import { test, expect } from './_fixtures';
import { type Page, type Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const pid = (n: number) => `00000000-0000-4000-8000-0000000f${String(n).padStart(4, '0')}`;
const BASE = { v: 3, game: 'nlhe', format: 'cash', tableSize: 6, sbBb: 0.5, anteBb: 0, effectiveBb: 100, hero: ['Ah', 'Qh'], villain: [], extraPos: [] };
const BC = ['9c', '5h', '2s', 'Kd', '3c'];
const PRE = [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1.5 }];
const LEGACY = ['폴드', '콜', '레이즈'];

type Post = { n: number; title: string; spot: Record<string, unknown>; options: string[]; expect: string[] };
const VOTES: Post[] = [
  { n: 2, title: '올인시험 v2 플랍 3BB 벳', options: LEGACY, expect: LEGACY,
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', board: BC.slice(0, 3), street: 'flop', actions: [...PRE, { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 3 }] } },
  { n: 4, title: '올인시험 v4 프리플랍 상대 올인', options: LEGACY, expect: ['폴드', '콜'],
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', board: [], street: 'preflop', actions: [PRE[0], { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 99 }] } },
  { n: 5, title: '올인시험 v5 플랍 상대 올인', options: LEGACY, expect: ['폴드', '콜'],
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', board: BC.slice(0, 3), street: 'flop', actions: [...PRE, { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 97.5 }] } },
  { n: 6, title: '올인시험 v6 턴 내 스택 넘는 벳', options: LEGACY, expect: ['폴드', '콜'],
    spot: { ...BASE, effectiveBb: 40, heroStackBb: 40, villainStackBb: 120, heroPos: 'CO', villainPos: 'BB', board: BC.slice(0, 4), street: 'turn',
      actions: [...PRE, { street: 'turn', actor: 'villain', type: 'bet', sizeBb: 60 }] } },
];
/** PC — 검토자가 캡처한 6인 4-way 리버(테이블 608px) */
const PC: Post[] = [
  { n: 11, title: 'PC시험 6인 4-way 리버', options: ['체크', '벳'], expect: ['체크', '벳'],
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', extraPos: ['LJ', 'HJ'], villain: [[], [], []], board: BC, street: 'river',
      actions: [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1.5 },
        { street: 'preflop', actor: 'villain', pos: 'LJ', type: 'call', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', pos: 'HJ', type: 'call', sizeBb: 2.5 },
        { street: 'river', actor: 'villain', type: 'check' }, { street: 'river', actor: 'villain', pos: 'LJ', type: 'check' }, { street: 'river', actor: 'villain', pos: 'HJ', type: 'check' }] } },
];

async function install(page: Page, posts: Post[]) {
  const pollRow = (p: Post) => ({ id: `poll-${p.n}`, question: '당신이라면 어떻게 하시겠어요?', closes_at: null,
    post_poll_options: p.options.map((label, k) => ({ id: `o${p.n}-${k}`, idx: k, label })) });
  const row = (p: Post, url: string) => ({
    id: pid(p.n), user_id: `00000000-0000-4000-8000-0000000e${String(p.n).padStart(4, '0')}`, user_name: `작성자${p.n}`, user_role: 'user',
    user_color: '#7c3aed', user_avatar: null, content: '이 자리에서 어떻게 하시겠어요?', created_at: '2026-10-01T00:00:00Z', like_count: 0,
    comment_count: 0, view_count: 0, category: 'hand', title: p.title, images: [], badbeat_count: 0, goodrun_count: 0, blinded: false,
    cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
    ...(url.includes('post_spots(') ? { post_spots: { spot: p.spot, reveal_villain: false, reveal_result: false } } : {}),
    ...(url.includes('post_polls(') ? { post_polls: pollRow(p) } : {}),
  });
  const find = (url: string) => posts.find((p) => url.includes(pid(p.n)));
  await page.route(/\/rest\/v1\/community_posts\?/, (r: Route) => {
    const url = decodeURIComponent(r.request().url());
    const rows = posts.map((p) => row(p, url));
    const m = /[?&]id=eq\.([0-9a-f-]+)/.exec(url);
    if (m) {
      const one = rows.find((x) => x.id === m[1]) ?? null;
      return r.fulfill(json((r.request().headers()['accept'] ?? '').includes('pgrst.object') ? one : one ? [one] : []));
    }
    return r.fulfill(json(rows));
  });
  await page.route(/\/rest\/v1\/post_spots\?/, (r: Route) => {
    const p = find(r.request().url());
    return r.fulfill(json(p ? { post_id: pid(p.n), spot: p.spot, reveal_villain: false, reveal_result: false, coverage_kind: 'chart_nash', source_label: null, dataset_version: 'x', analysis: null } : null));
  });
  await page.route(/\/rest\/v1\/post_hands\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/post_polls\?/, (r: Route) => {
    const p = find(r.request().url());
    return r.fulfill(json(p ? { id: `poll-${p.n}`, post_id: pid(p.n), question: '당신이라면 어떻게 하시겠어요?', closes_at: null } : null));
  });
  await page.route(/\/rest\/v1\/rpc\/poll_results/, (r: Route) => {
    const n = Number(String(JSON.parse(r.request().postData() || '{}').p_poll_id).replace('poll-', ''));
    const p = posts.find((x) => x.n === n);
    return r.fulfill(json((p?.options ?? []).map((label, k) => ({ option_id: `o${n}-${k}`, idx: k, label, votes: 0 }))));
  });
  await page.route(/\/rest\/v1\/post_poll_votes\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/comments\?/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r: Route) => r.fulfill(json([])));
}

async function boot(page: Page, posts: Post[], w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript(() => { try { localStorage.setItem('nuri:board-view', 'feed'); } catch { /* 사생활 모드 */ } });
  await stubLogin(page);
  await stabilizeBackstack(page);
  await install(page, posts);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const tab = page.getByRole('button', { name: '게시판', exact: true }).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click();
  await expect(page.locator('[data-spot-feed]').filter({ visible: true }).first(), '피드에 SPOT 카드가 없다').toBeVisible({ timeout: 20_000 });
}

test('🔴 올인·스택을 덮는 벳이면 투표 보기는 폴드·콜 — 옛 글(서버 보기 폴드·콜·레이즈) 피드와 상세', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page, VOTES, 390, 844);
  let measured = 0;
  for (const v of VOTES) {
    const li = page.locator('li').filter({ hasText: v.title }).filter({ visible: true }).first();
    await li.scrollIntoViewIfNeeded();
    const feedLine = (await li.locator('[data-spot-choices]').innerText()).replace(/\s+/g, ' ').trim();
    expect(feedLine, `${v.title}: 피드 보기 줄`).toBe(`${v.expect.join(' · ')} — 당신이라면?`);
    await li.evaluate((n) => (n as HTMLElement).click());
    const group = page.getByRole('dialog').first().getByRole('group', { name: '투표 선택지' });
    await expect(group).toBeVisible({ timeout: 15_000 });
    await expect(group.getByRole('button').first()).toBeEnabled({ timeout: 5_000 });
    const btns = (await group.getByRole('button').allInnerTexts()).map((t) => t.split('\n')[0].trim());
    expect(btns, `${v.title}: 상세 투표 버튼`).toEqual(v.expect);
    measured++;
    await page.evaluate(() => history.back());
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
    await page.waitForTimeout(150);
  }
  expect(measured, '잰 글 수').toBe(VOTES.length);
});

test('PC 1440 상세 — 테이블 폭 420px 이하 · 투표가 첫 화면 안', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, PC, 1440, 900);
  const li = page.locator('li').filter({ hasText: PC[0].title }).filter({ visible: true }).first();
  await li.evaluate((n) => (n as HTMLElement).click());
  const felt = page.locator('[data-spot-post] [data-felt]').filter({ visible: true }).first();
  await expect(felt, '상세 테이블이 없다').toBeVisible({ timeout: 15_000 });
  const group = page.locator('[data-spot-post]').filter({ visible: true }).getByRole('group', { name: '투표 선택지' });
  await expect(group, '상세 투표가 없다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const f = [...document.querySelectorAll('[data-spot-post] [data-felt]')].find((e) => (e as HTMLElement).offsetParent) as HTMLElement;
    const g = [...document.querySelectorAll('[data-spot-post] [role=group][aria-label="투표 선택지"]')].find((e) => (e as HTMLElement).offsetParent)!;
    // 상세 칸(2-pane 오른쪽)의 위끝 — 스크롤 컨테이너가 있으면 그것, 없으면 글 머리. 그 위(공지·탭)는 목록 쪽 화면이라 뺀다.
    let pane: Element | null = f.parentElement;
    while (pane && !/(auto|scroll)/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
    const top = (pane && pane !== document.scrollingElement ? pane : f.closest('[data-spot-post]')!).getBoundingClientRect().top;
    const fr = f.getBoundingClientRect(), gr = g.getBoundingClientRect();
    return { feltW: fr.width, feltH: fr.height, paneTop: top, paneTag: pane ? pane.tagName + '.' + (pane as HTMLElement).className.slice(0, 60) : null,
      pollFromPane: gr.bottom - top, vh: innerHeight, paneClientH: pane ? (pane as HTMLElement).clientHeight : null, buttons: g.querySelectorAll('button').length };
  });
  expect(m.buttons, '투표 버튼 수').toBe(PC[0].expect.length);
  expect(m.feltW, `테이블 폭 ${m.feltW}px`).toBeLessThanOrEqual(420.5);
  console.log('PC 상세 측정', JSON.stringify(m));
  // 상세 칸(스크롤 영역)을 맨 위에 둔 채 투표 아래끝까지 보인다 — 칸 높이 안
  expect(m.paneClientH, '상세 칸 스크롤 영역을 못 찾았다').not.toBeNull();
  expect(m.pollFromPane, `상세 칸 위끝→투표 아래끝 ${Math.round(m.pollFromPane)}px > 칸 높이 ${m.paneClientH}px(첫 화면 밖)`).toBeLessThanOrEqual(m.paneClientH as number);
});
