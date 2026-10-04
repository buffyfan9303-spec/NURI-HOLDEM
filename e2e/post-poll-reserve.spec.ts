// 글 상세의 투표 블록이 첫 프레임부터 같은 높이로 서는가 (2026-10-02 독립 검토 경미 항목)
//
// 결함: 상세를 열면 투표 블록이 첫 보이는 프레임에 없고, fetchAttachment 응답 뒤(0ms 응답이면 18~30ms, 300ms 지연이면
//   약 630ms 뒤) 228px 로 들어와 아래(공개 블록·반응 줄)를 밀었다. 스팟 글과 일반 투표 글이 같은 블록이라 둘 다 그랬다.
// 원문: 문서 폴더 review-share-a2-1001.md §3 '상세 안 투표가 늦게 뜸'.
// 고침: 게시판 목록이 질문·보기 이름(post_polls)을 같은 요청에 끼워 받고(api/community POST_LIST_SELECT),
//   상세는 응답 전까지 그 보기로 같은 마크업을 그린다(누를 수 없음 · aria-busy) — postAttachments.pollFromEmbed.
// 무엇을 재나: 상세를 여는 순간부터 rAF 마다 '투표 선택지' 그룹이 있는지와 그 높이. 집계 응답을 300ms 늦춘다.
//   ① 상세가 보이는(불투명도 > 0.3) 프레임 중 투표가 없는 프레임 0 ② 투표 그룹 높이가 한 값 ③ 응답 뒤 보기를 누를 수 있다.
// 거짓 통과 방지: 잰 프레임 수 > 10, 투표가 보인 프레임 > 0.
// ⚠ 운영 DB 무접촉: stubLogin + page.route 픽스처. _fixtures 가 비-GET 을 끊는다.
import { test, expect } from './_fixtures';
import { type Page, type Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const pid = (n: number) => `00000000-0000-4000-8000-0000000a${String(n).padStart(4, '0')}`;
const SPOT = {
  v: 3, game: 'nlhe', format: 'cash', tableSize: 6, sbBb: 0.5, anteBb: 0, effectiveBb: 100,
  heroPos: 'CO', villainPos: 'BTN', extraPos: ['SB'], hero: ['Th', 'Td'], villain: [[], []], board: ['9c', '5h', '2s'], street: 'flop',
  actions: [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 }, { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 2.5 },
    { street: 'preflop', actor: 'villain', pos: 'SB', type: 'call', sizeBb: 2.5 }, { street: 'flop', actor: 'villain', type: 'check' },
    { street: 'flop', actor: 'villain', pos: 'SB', type: 'check' }],
};
const POSTS = [
  { n: 1, title: '투표자리 스팟 글', spot: true, options: ['체크', '벳'] },
  { n: 2, title: '투표자리 일반 글', spot: false, options: ['찬성', '반대', '모르겠음'] },
];
const pollRow = (p: typeof POSTS[number]) => ({ id: `poll-${p.n}`, question: '당신이라면 어떻게 하시겠어요?', closes_at: null,
  post_poll_options: p.options.map((label, i) => ({ id: `o${p.n}-${i}`, idx: i, label })) });
const row = (p: typeof POSTS[number], embed: boolean) => ({
  id: pid(p.n), user_id: `00000000-0000-4000-8000-0000000b${String(p.n).padStart(4, '0')}`, user_name: `작성자${p.n}`,
  user_role: 'user', user_color: '#7c3aed', user_avatar: null, content: '어떻게 생각하세요?',
  created_at: '2026-10-01T00:00:00Z', like_count: 0, comment_count: 0, view_count: 0, category: p.spot ? 'hand' : 'free',
  title: p.title, images: [], badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0,
  bumped_until: null, bump_count: 0, pinned_at: null,
  ...(embed ? { post_spots: p.spot ? { spot: SPOT, reveal_villain: false, reveal_result: false } : null, post_polls: pollRow(p) } : {}),
});

async function install(page: Page) {
  await page.route(/\/rest\/v1\/community_posts\?/, (r: Route) => {
    const url = decodeURIComponent(r.request().url());
    const rows = POSTS.map((p) => row(p, url.includes('post_spots(')));
    const m = /[?&]id=eq\.([0-9a-f-]+)/.exec(url);
    if (m) {
      const one = rows.find((x) => x.id === m[1]) ?? null;
      const obj = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
      return r.fulfill(json(obj ? one : one ? [one] : []));
    }
    return r.fulfill(json(rows));
  });
  await page.route(/\/rest\/v1\/post_spots\?/, (r: Route) => r.fulfill(json(r.request().url().includes(pid(1))
    ? { post_id: pid(1), spot: SPOT, reveal_villain: false, reveal_result: false, coverage_kind: 'chart_nash', source_label: null, dataset_version: 'x', analysis: null }
    : null)));
  await page.route(/\/rest\/v1\/post_hands\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/post_polls\?/, (r: Route) => {
    const p = POSTS.find((x) => r.request().url().includes(pid(x.n)));
    return r.fulfill(json(p ? { id: `poll-${p.n}`, post_id: pid(p.n), question: '당신이라면 어떻게 하시겠어요?', closes_at: null } : null));
  });
  // 집계 응답을 300ms 늦춘다 — 결함이 있으면 그동안 투표가 없다가 뜬다
  await page.route(/\/rest\/v1\/rpc\/poll_results/, async (r: Route) => {
    const n = Number(String(JSON.parse(r.request().postData() || '{}').p_poll_id).replace('poll-', ''));
    const p = POSTS.find((x) => x.n === n)!;
    await new Promise((res) => setTimeout(res, 300));
    return r.fulfill(json(p.options.map((label, i) => ({ option_id: `o${n}-${i}`, idx: i, label, votes: i + 1 }))));
  });
  await page.route(/\/rest\/v1\/post_poll_votes\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/comments\?/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r: Route) => r.fulfill(json([])));
}

for (const p of POSTS) {
  test(`상세 투표 블록이 첫 프레임부터 같은 높이 — ${p.spot ? '스팟 글' : '일반 투표 글'}`, async ({ page }) => {
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
    const li = page.locator('li').filter({ hasText: p.title }).filter({ visible: true }).first();
    await expect(li).toBeVisible({ timeout: 20_000 });

    await page.evaluate(() => {
      const w = window as unknown as { __g: { op: number; vote: boolean; h: number }[]; __stop: boolean };
      w.__g = []; w.__stop = false;
      const tick = () => {
        const dl = document.querySelector('[role=dialog]');
        if (dl) {
          let op = 1;
          for (let e: Element | null = dl; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
          const g = dl.querySelector('[aria-label="투표 선택지"]');
          w.__g.push({ op, vote: !!g, h: g ? Math.round(g.getBoundingClientRect().height * 10) / 10 : 0 });
        }
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await li.evaluate((n) => (n as HTMLElement).click());
    const group = page.getByRole('dialog').first().getByRole('group', { name: '투표 선택지' });
    await expect(group).toBeVisible({ timeout: 15_000 });
    // ③ 응답 뒤에는 누를 수 있다(자리 잡기 상태가 풀린다)
    await expect(group.getByRole('button').first()).toBeEnabled({ timeout: 5_000 });
    await page.waitForTimeout(400);
    const g = await page.evaluate(() => {
      const w = window as unknown as { __g: { op: number; vote: boolean; h: number }[]; __stop: boolean };
      w.__stop = true; return w.__g;
    });
    const seen = g.filter((x) => x.op > 0.3);
    expect(seen.length, '잰 프레임 수').toBeGreaterThan(10);
    expect(seen.filter((x) => x.vote).length, '투표가 보인 프레임').toBeGreaterThan(0);
    expect(seen.filter((x) => !x.vote).length, '상세가 보이는데 투표 블록이 없는 프레임(늦게 들어와 아래를 민다)').toBe(0);
    expect([...new Set(seen.map((x) => x.h))], '투표 그룹 높이가 바뀌었다(아래를 민다)').toHaveLength(1);
    expect(await group.getByRole('button').allTextContents(), '보기 이름').toEqual(p.options);
  });
}

// ── 닫힐 때 투표 칸이 먼저 사라지는가 (감사 3회차 M3-01, 2026-10-04) ──
// 결함: 첨부 조회 effect 가 open=false 가 되는 순간에도 맨 앞에서 setAttachment(null) 을 했다. 닫히는 동안 Modal 은 200ms 남아 있는데
//   그 사이 투표 칸이 먼저 없어지고 아래 내용이 위로 튀었다(입력 없는 CLS 0.034, CPU4·6 5/5).
// 고침: 닫힘에서는 첨부를 비우지 않는다(effect 맨 앞 setAttachment(null) 제거 · 조회 실패 때만 비운다).
// 무엇을 재나(CPU 4배): 응답이 도착해 투표가 선 상태에서 history.back() 으로 닫고, 닫히는 동안 rAF 마다 '투표 선택지' 그룹의 유무·높이와
//   입력 없는 layout-shift 합. ① 닫힘 중 보이는(불투명도>0.3) 프레임에 투표가 없는 프레임 0 ② 그룹 높이 한 값 ③ shift 합 < 0.005.
// 거짓 통과 방지: 닫힘이 실제 시작됐는지(대화상자가 사라짐)와 잰 프레임 수 > 3, 닫힘 전 투표가 보였는지.
for (const p of POSTS) {
  test(`닫는 동안 투표 칸이 그대로 — ${p.spot ? '스팟 글' : '일반 투표 글'} (CPU 4배)`, async ({ page }) => {
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
    const li = page.locator('li').filter({ hasText: p.title }).filter({ visible: true }).first();
    await expect(li).toBeVisible({ timeout: 20_000 });
    await li.evaluate((n) => (n as HTMLElement).click());
    const group = page.getByRole('dialog').first().getByRole('group', { name: '투표 선택지' });
    await expect(group).toBeVisible({ timeout: 15_000 });
    await expect(group.getByRole('button').first()).toBeEnabled({ timeout: 5_000 }); // 집계 응답 도착 = attachment state 가 채워진 뒤
    await page.waitForTimeout(600); // 열림 전환 정착

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      const w = window as unknown as { __g: { op: number; vote: boolean; h: number }[]; __stop: boolean; __cls: number };
      w.__g = []; w.__stop = false; w.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: false });
      const tick = () => {
        const dl = document.querySelector('[role=dialog]');
        let op = 0;
        if (dl) { op = 1; for (let e: Element | null = dl; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); }
        const g = dl?.querySelector('[aria-label="투표 선택지"]');
        w.__g.push({ op, vote: !!g, h: g ? Math.round(g.getBoundingClientRect().height * 10) / 10 : 0 });
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.evaluate(() => history.back());
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 }); // 닫힘 끝(언마운트)
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const w = window as unknown as { __g: { op: number; vote: boolean; h: number }[]; __stop: boolean; __cls: number };
      w.__stop = true; return { g: w.__g, cls: w.__cls };
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const seen = r.g.filter((x) => x.op > 0.3);
    expect(seen.length, '닫힘 중 보인 프레임 수(0이면 닫힘을 못 잰 것)').toBeGreaterThan(3);
    expect(seen.filter((x) => x.vote).length, '닫힘 중 투표가 보인 프레임').toBeGreaterThan(0);
    expect(seen.filter((x) => !x.vote).length, '닫히는데 투표 칸이 먼저 사라진 프레임(아래가 위로 튄다)').toBe(0);
    expect([...new Set(seen.filter((x) => x.vote).map((x) => x.h))], '닫힘 중 투표 그룹 높이가 바뀌었다').toHaveLength(1);
    expect(r.cls, '닫힘 중 입력 없는 layout-shift 합').toBeLessThan(0.005);
  });
}

// 글을 바로 갈아탈 때(이전/다음 글) 새 글 제목이 보이는 프레임에는 새 글의 투표(보기)가 서 있고 옛 글 보기가 남지 않는다 —
//   첨부 state 를 닫힘에서 안 비우므로 글 전환 사이 옛 글 첨부가 새 글에 칠해지지 않는지(attachmentFor 가드)를 잠근다.
test('이전 글의 투표가 다음 글에 남지 않는다 (글 전환)', async ({ page }) => {
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
  const li = page.locator('li').filter({ hasText: POSTS[0].title }).filter({ visible: true }).first();
  await expect(li).toBeVisible({ timeout: 20_000 });
  await li.evaluate((n) => (n as HTMLElement).click());
  const dlg = page.getByRole('dialog').first();
  await expect(dlg.getByRole('group', { name: '투표 선택지' }).getByRole('button').first()).toBeEnabled({ timeout: 15_000 });
  await page.evaluate((titles) => {
    const w = window as unknown as { __g: { a: boolean; b: boolean; labels: string }[]; __stop: boolean };
    w.__g = []; w.__stop = false;
    const tick = () => {
      const dl = document.querySelector('[role=dialog]');
      if (dl) {
        const g = dl.querySelector('[aria-label="투표 선택지"]');
        // 이웃 버튼 안에도 제목이 적히므로 제목 칸(data-pd-title)만 본다
        const head = [...dl.querySelectorAll('[data-pd-title]')].map((h) => h.textContent ?? '').join('|');
        w.__g.push({ a: head.includes(titles[0]), b: head.includes(titles[1]),
          labels: g ? [...g.querySelectorAll('button')].map((x) => x.textContent ?? '').join('|') : '(없음)' });
      }
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, POSTS.map((x) => x.title));
  await dlg.locator('[data-pd-nav-dir="next"]').evaluate((n) => (n as HTMLElement).click());
  await expect(dlg.getByRole('group', { name: '투표 선택지' }).getByRole('button')).toHaveCount(3, { timeout: 15_000 });
  await page.waitForTimeout(700);
  const g = await page.evaluate(() => {
    const w = window as unknown as { __g: { a: boolean; b: boolean; labels: string }[]; __stop: boolean };
    w.__stop = true; return w.__g;
  });
  const onB = g.filter((x) => x.b && !x.a);
  expect(onB.length, '새 글 제목이 보인 프레임(0이면 전환을 못 잰 것)').toBeGreaterThan(3);
  expect(onB.filter((x) => /체크|벳/.test(x.labels)).length, '새 글 제목 아래 옛 글 투표 보기가 남은 프레임').toBe(0);
  expect(onB.filter((x) => x.labels === '(없음)').length, '새 글 제목 아래 투표 칸이 없는 프레임').toBe(0);
});
