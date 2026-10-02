// SPOT 공유 — 올인 자리의 투표 보기 · PC 상세 테이블 폭 (2026-10-02 3차 독립 검토 후속)
//
// 원문: 문서 폴더 review-share-a3-1002.md §2(투표 보기 FAIL) · §6(PC 경미).
// ① 투표: 상대가 올인했거나(v4 프리플랍 · v5 플랍) 내 스택을 덮는 벳(v6 턴 · 내 40 에 60)이면 고를 수 있는 것은 폴드·콜뿐인데
//    화면이 '레이즈' 를 보였다. 서버가 보기를 '폴드·콜·레이즈' 로 저장한 **옛 글**(20261002c 적용 전)이 그대로라는 조건으로 잰다 —
//    피드 줄(data-spot-choices)과 상세 '투표 선택지' 버튼 둘 다 폴드·콜이어야 한다(표 0 인 레이즈는 숨김).
//    양성 대조: 같은 판에서 상대가 3BB 만 벳(v2)하면 레이즈가 남는다.
// ② PC 1440 2-pane 상세: 테이블이 608px 정사각으로 커져 투표가 첫 화면 밖으로 밀렸다 → 두 단(a92c42a8).
// ③ 4차 검토(review-share-a5-1002.md) 경미: ①-a 옛 글에 레이즈 표가 있으면 피드 '폴드·콜' / 상세 '폴드·콜·레이즈'(눌림)로 갈렸다 →
//    누를 수 있는 보기는 피드 줄과 같고, 표 있는 보기는 '지난 보기'로 잠근다. ③-a 결정 줄이 첫 화면 밖 → 오른쪽 단 맨 위.
//    ③-b 긴 메모가 투표를 1280×720 첫 화면 밖으로 → 두 단에서 메모를 투표·공개 아래로. ③-c 1024 는 상세 칸 506 이라 한 단 → 기준 480.
//    ④ PC 355px 테이블에서 7인 이상 이름표 10px → 테이블 ≥ 340px 면 11.69px.
// 거짓 통과 방지: 잰 글 수·버튼 수를 픽스처와 맞춘다.
// ⚠ 운영 DB 무접촉: stubLogin + page.route 픽스처. _fixtures 가 비-GET 을 끊는다.
import { test, expect } from './_fixtures';
import { type Page, type Route, devices } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const pid = (n: number) => `00000000-0000-4000-8000-0000000f${String(n).padStart(4, '0')}`;
const BASE = { v: 3, game: 'nlhe', format: 'cash', tableSize: 6, sbBb: 0.5, anteBb: 0, effectiveBb: 100, hero: ['Ah', 'Qh'], villain: [], extraPos: [] };
const BC = ['9c', '5h', '2s', 'Kd', '3c'];
const PRE = [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1.5 }];
const LEGACY = ['폴드', '콜', '레이즈'];

type Post = { n: number; title: string; spot: Record<string, unknown>; options: string[]; expect: string[]; votes?: number[]; locked?: string[] };
const VOTES: Post[] = [
  { n: 2, title: '올인시험 v2 플랍 3BB 벳', options: LEGACY, expect: LEGACY,
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', board: BC.slice(0, 3), street: 'flop', actions: [...PRE, { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 3 }] } },
  { n: 4, title: '올인시험 v4 프리플랍 상대 올인', options: LEGACY, expect: ['폴드', '콜'],
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', board: [], street: 'preflop', actions: [PRE[0], { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 99 }] } },
  { n: 5, title: '올인시험 v5 플랍 상대 올인', options: LEGACY, expect: ['폴드', '콜'],
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', board: BC.slice(0, 3), street: 'flop', actions: [...PRE, { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 97.5 }] } },
  { n: 6, title: '올인시험 v6 턴 내 스택 넘는 벳', options: LEGACY, expect: ['폴드', '콜'],
    spot: { ...BASE, effectiveBb: 40, heroStackBb: 40, villainStackBb: 120, heroPos: 'CO', villainPos: 'BB', board: BC.slice(0, 4), street: 'turn',
      actions: [...PRE, { street: 'turn', actor: 'villain', type: 'bet', sizeBb: 60 }] } },  // a5 ①-a: 옛 글에 레이즈 표가 이미 있다(폴드 2·콜 5·레이즈 3) — 누를 수 있는 건 피드와 같은 폴드·콜, 레이즈는 표만 남긴 채 잠긴다.
  { n: 7, title: '올인시험 v4 옛 글 레이즈 표 있음', options: LEGACY, expect: ['폴드', '콜'], votes: [2, 5, 3], locked: ['레이즈'],
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', board: [], street: 'preflop', actions: [PRE[0], { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 99 }] } },
];
/** PC — 검토자가 캡처한 6인 4-way 리버(테이블 608px) · 9인 상대 5명 리버 · 긴 메모 */
const PC: Post[] = [
  { n: 11, title: 'PC시험 6인 4-way 리버', options: ['체크', '벳'], expect: ['체크', '벳'],
    spot: { ...BASE, heroPos: 'BTN', villainPos: 'BB', extraPos: ['LJ', 'HJ'], villain: [[], [], []], board: BC, street: 'river',
      actions: [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1.5 },
        { street: 'preflop', actor: 'villain', pos: 'LJ', type: 'call', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', pos: 'HJ', type: 'call', sizeBb: 2.5 },
        { street: 'river', actor: 'villain', type: 'check' }, { street: 'river', actor: 'villain', pos: 'LJ', type: 'check' }, { street: 'river', actor: 'villain', pos: 'HJ', type: 'check' }] } },  // 9인 상대 5명 리버 — PC 355px 테이블의 7인 이상 이름표 글자(a5 ④)
  { n: 12, title: 'PC시험 9인 상대 5명 리버', options: ['체크', '벳'], expect: ['체크', '벳'],
    spot: { ...BASE, tableSize: 9, heroPos: 'BTN', villainPos: 'SB', extraPos: ['BB', 'UTG', 'LJ', 'CO'], villain: [[], [], [], [], []], board: BC, street: 'river',
      actions: [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 2.5 },
        ...['BB', 'UTG', 'LJ', 'CO'].map((pos) => ({ street: 'preflop', actor: 'villain', pos, type: 'call', sizeBb: 2.5 })),
        { street: 'river', actor: 'villain', type: 'check' }, ...['BB', 'UTG', 'LJ', 'CO'].map((pos) => ({ street: 'river', actor: 'villain', pos, type: 'check' }))] } },
  // 긴 메모 — 236px 칸에서 6줄(a5 ③-b)
  { n: 13, title: 'PC시험 6인 3-way 긴 메모', options: ['체크', '벳'], expect: ['체크', '벳'],
    spot: { ...BASE, heroPos: 'CO', villainPos: 'BTN', extraPos: ['SB'], villain: [[], []], board: BC.slice(0, 3), street: 'flop',
      note: 'SB 체크 받고 얼마나 벳할지 고민했습니다. 보드가 드라이해서 작게 치는 게 맞는지, 아니면 폴라로 크게 가야 하는지 궁금합니다. 상대 둘 다 레크리에이션 성향이었고 BTN 은 콜이 넓었습니다.',
      actions: [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 2.5 },
        { street: 'preflop', actor: 'villain', pos: 'SB', type: 'call', sizeBb: 2 }, { street: 'flop', actor: 'villain', pos: 'SB', type: 'check' }] } },
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
    return r.fulfill(json((p?.options ?? []).map((label, k) => ({ option_id: `o${n}-${k}`, idx: k, label, votes: p?.votes?.[k] ?? 0 }))));
  });
  await page.route(/\/rest\/v1\/post_poll_votes\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/comments\?/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r: Route) => r.fulfill(json([])));
}

async function boot(page: Page, posts: Post[], w: number, h: number, quiet = false) {
  await page.setViewportSize({ width: w, height: h });
  // quiet: 목 로그인 탓에 나는 '공지를 불러오지 못했습니다' 상자 등 — 나머지 REST GET 을 빈 결과로(가장 먼저 등록 = 가장 낮은 우선순위)
  if (quiet) await page.route(/\/rest\/v1\//, (r: Route) => r.request().method() === 'GET'
    ? r.fulfill(json((r.request().headers()['accept'] ?? '').includes('pgrst.object') ? null : [])) : r.fallback());
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
    // 누를 수 있는 보기 = 피드 줄 보기(a5 ①-a). 표만 남긴 보기(locked)는 따로 센다.
    const all = await group.getByRole('button').evaluateAll((bs) => bs.map((b) => ({
      label: ((b as HTMLElement).innerText.split('\n')[0] ?? '').replace(/지난 보기/, '').trim(), disabled: (b as HTMLButtonElement).disabled })));
    expect(all.filter((b) => !b.disabled).map((b) => b.label), `${v.title}: 상세에서 누를 수 있는 투표 버튼`).toEqual(v.expect);
    expect(all.filter((b) => b.disabled).map((b) => b.label), `${v.title}: 표만 남긴(잠긴) 보기`).toEqual(v.locked ?? []);
    measured++;
    await page.evaluate(() => history.back());
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5_000 });
    await page.waitForTimeout(150);
  }
  expect(measured, '잰 글 수').toBe(VOTES.length);
});

// ── ③ PC 두 단 (a5 ③-a·b·c·④) ──────────────────────────────────────────────
// 1024×768 노트북(상세 칸 506px)·1280×720·1440×900, 데스크톱 UA(DPR 1·터치 없음).
// 단언: 두 단(grid) · 결정 줄이 오른쪽 단 맨 위·투표 위·칸 첫 화면 안 · 투표 첫 버튼이 칸 첫 화면 안 ·
//       긴 메모는 투표 아래 · 테이블 ≥ 340px 면 7인 이상 이름표도 11px 이상 · 좌석 겹침 0 · 가로 넘침 0.
test.describe('PC 상세 두 단', () => {
  { const { defaultBrowserType: _d, ...desk } = devices['Desktop Chrome']; void _d; test.use(desk); }
  for (const [w, h] of [[1440, 900], [1280, 720], [1024, 768]] as const) {
    test(`PC ${w}x${h} — 두 단 · 결정 줄 · 투표 첫 화면 · 메모 아래 · 이름표 글자`, async ({ page }) => {
      test.setTimeout(120_000);
      await boot(page, PC, w, h, true);
      let measured = 0;
      for (const p of PC) {
        const li = page.locator('li').filter({ hasText: p.title }).filter({ visible: true }).first();
        // 목록을 내린 상태에서 연다 — 오른쪽 칸이 sticky 로 화면 위에 붙는다(실사용에서 흔한 상태 · 공지 유무와 무관)
        await li.evaluate((n) => n.scrollIntoView({ block: 'center' }));
        await page.evaluate(() => { if (scrollY < 360) scrollTo(0, 360); });
        await page.waitForTimeout(150);
        await li.evaluate((n) => (n as HTMLElement).click());
        const group = page.locator('[data-spot-post]').filter({ visible: true }).getByRole('group', { name: '투표 선택지' });
        await expect(group, `${p.title}: 상세 투표가 없다`).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(400);
        const m = await page.evaluate(() => {
          const post = [...document.querySelectorAll('[data-spot-post]')].find((e) => (e as HTMLElement).offsetParent && e.querySelector('[role=group]')) as HTMLElement;
          const f = post.querySelector('[data-felt]') as HTMLElement;
          const g = post.querySelector('[role=group][aria-label="투표 선택지"]')!;
          const grid = post.querySelector('[data-spot-share="table"] > div') as HTMLElement;
          const dec = post.querySelector('[data-spot-decision]') as HTMLElement | null;
          const note = post.querySelector('p.border-l-2');
          let pane: Element | null = f.parentElement;
          while (pane && !/(auto|scroll)/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
          if (pane) (pane as HTMLElement).scrollTop = 0;
          const pr = (pane && pane !== document.scrollingElement ? pane : post).getBoundingClientRect();
          const top = pr.top, visBottom = Math.min(innerHeight, pane && pane !== document.scrollingElement ? pr.bottom : innerHeight);
          const R = (e: Element) => e.getBoundingClientRect();
          const seats = [...f.querySelectorAll('[data-seat]')].map(R);
          let overlaps = 0;
          for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
            const a = seats[i], b = seats[j];
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) overlaps++;
          }
          const labels = [...f.querySelectorAll('[data-seat-label]')] as HTMLElement[];
          return {
            grid: getComputedStyle(grid).display, feltW: R(f).width, paneTop: top, paneClientH: pane ? (pane as HTMLElement).clientHeight : null, visBottom, vh: innerHeight,
            decVisible: !!dec && getComputedStyle(dec).display !== 'none' && R(dec).height > 0, decText: dec?.innerText ?? '',
            decTop: dec ? R(dec).top : null, decBottom: dec ? R(dec).bottom : null, decLeft: dec ? R(dec).left : null,
            pollTop: R(g).top, pollLeft: R(g).left, firstBtnBottom: R(g.querySelector('button')!).bottom,
            noteTop: note ? R(note).top : null, pollBottom: R(g).bottom, seats: seats.length, overlaps,
            labelFs: labels.map((l) => parseFloat(getComputedStyle(l).fontSize)), labelClip: labels.filter((l) => l.scrollWidth > l.clientWidth).length,
            docOverflow: document.documentElement.scrollWidth - innerWidth,
          };
        });
        // 항목별로 따로 판정한다(soft) — 한 항목이 실패해도 나머지 항목의 이전/이후 결과가 남는다.
        console.log(`PC ${w}x${h} ${p.title}`, JSON.stringify(m));
        expect.soft(m.grid, `${p.title}: 두 단이 아니다(상세 칸이 기준보다 좁다)`).toBe('grid');
        expect(m.paneClientH, '상세 칸 스크롤 영역을 못 찾았다').not.toBeNull();
        expect.soft(m.decVisible, `${p.title}: 오른쪽 단 결정 줄이 없다`).toBe(true);
        expect.soft(m.decText ?? '').toContain('내 차례');
        expect.soft((m.decBottom ?? Infinity) - 0.5, `${p.title}: 결정 줄이 투표 아래에 있다`).toBeLessThanOrEqual(m.pollTop);
        expect.soft(Math.abs((m.decLeft ?? Infinity) - m.pollLeft), `${p.title}: 결정 줄이 투표와 다른 단에 있다`).toBeLessThan(24);
        // 화면(뷰포트와 칸 중 작은 쪽) 안 — 칸 위끝 기준 상대값만 보면 칸이 화면 밖으로 이어질 때 거짓 통과한다(첫 시도에서 실제로 그랬다)
        expect.soft(m.decTop ?? -1, `${p.title}: 결정 줄이 칸·화면 위로 잘렸다`).toBeGreaterThanOrEqual(Math.max(0, m.paneTop) - 0.5);
        expect.soft(m.firstBtnBottom, `${p.title}: 투표 첫 버튼 아래끝 ${Math.round(m.firstBtnBottom)} > 보이는 아래끝 ${Math.round(m.visBottom)}`).toBeLessThanOrEqual(m.visBottom + 0.5);
        if (m.noteTop !== null) expect.soft(m.noteTop, `${p.title}: 메모가 투표 위에 있다`).toBeGreaterThanOrEqual(m.pollBottom);
        if (m.feltW >= 340) expect.soft(Math.min(...m.labelFs), `${p.title}: 테이블 ${Math.round(m.feltW)}px 인데 이름표 ${Math.min(...m.labelFs)}px`).toBeGreaterThanOrEqual(11);
        expect.soft(m.labelClip, '이름표 잘림').toBe(0);
        expect.soft(m.overlaps, '좌석 겹침').toBe(0);
        expect.soft(m.docOverflow, '가로 넘침').toBeLessThanOrEqual(0);
        measured++;
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
      expect(measured, '잰 글 수').toBe(PC.length);
    });
  }
});
