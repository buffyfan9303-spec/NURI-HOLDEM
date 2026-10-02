// 게시판 SPOT 테이블 그림 — 좌석(이름표·카드)이 보드 카드를 덮지 않는가 (2026-10-01 독립 검토 FAIL 재발 방지)
//
// 결함: 시안 A 구현(c3fbecd6)은 좌석을 타원 위 각도(%)로만 놓아, 보드가 4~5장(턴·리버)이면
//   위쪽 좌석('Villain A · BB')의 이름표가 보드 카드를 덮었다(320 피드 22.9×12.9px — '9' 글자가 가려짐, 360 상세).
//   작성자는 보드 3장만 쟀다 — 그래서 이 시험은 **보드 장수 × 폭 × 상대 수**를 전부 돈다.
// 원문: 문서 폴더 review-share-a-1001.md §2 '좌석 겹침' 표.
//
// 무엇을 재나: 각 [data-felt] 안에서 좌석 블록([data-seat])의 **모든 하위 상자**(카드 앞·뒷면, 이름표, 액션 줄)와
//   보이는 빈 좌석 글자([data-seat-empty])를, 보드([data-board])의 모든 하위 상자(카드·스트리트 이름)와 맞대어
//   교차 면적이 0 인지 본다. 피드 카드와 글 상세 둘 다. 덤으로 좌석 블록끼리의 교차 0 · 좌석이 테이블 폭 안인지도 본다
//   (줄 배치로 고친 뒤 320 상세 9인 상대 3명에서 오른쪽 상대가 테이블 밖으로 밀린 것을 이 검사가 잡았다).
// 거짓 통과 방지: 잰 테이블 수·좌석 수·보드 카드 수가 픽스처와 다르면(=0건 측정 포함) 실패한다.
//
// ⚠ 운영 DB 무접촉: stubLogin(로컬) + page.route 픽스처. _fixtures 가 비-GET 을 끊는다.
import { test, expect } from './_fixtures';
import { type Page, type Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

type Cfg = { key: string; tableSize: number; hero: string; vils: string[] };
/** 상대 1·2·3명 × 6인·9인. 4-way 는 위쪽 줄을 꽉 채우는 6인 판과 9인 판(검토자 시나리오 ⑤). */
const CFGS: Cfg[] = [
  { key: 'hu', tableSize: 6, hero: 'BTN', vils: ['BB'] },                      // 가장 흔한 판 — 검토에서 겹친 판
  { key: '3way', tableSize: 6, hero: 'CO', vils: ['BTN', 'SB'] },              // 시안 정본과 같은 판
  { key: '4way', tableSize: 6, hero: 'BTN', vils: ['BB', 'LJ', 'HJ'] },        // 위쪽 좌석 셋이 전부 상대 — 10-02 FAIL 판(360 플랍)
  { key: '9hu', tableSize: 9, hero: 'BTN', vils: ['BB'] },
  { key: '9-3way', tableSize: 9, hero: 'CO', vils: ['BTN', 'SB'] },            // 왼쪽 끝에 셋이 끼던 판(360 피드 401~419px)
  { key: '9max', tableSize: 9, hero: 'BB', vils: ['UTG1', 'HJ', 'BTN'] },      // 9인 4-way — 10-02 FAIL 판(390 턴·리버)
  // 10-02 3차 검토(경미): 360 상세 리버에서 빈 자리 SB·CO 가 타원 아래 41px · 9인 상대 5명은 Villain A 가 타원 밖 22~31px
  { key: '8-6way', tableSize: 8, hero: 'BTN', vils: ['UTG1', 'MP', 'LJ', 'HJ', 'BB'] },
  { key: '9-6way', tableSize: 9, hero: 'BTN', vils: ['SB', 'BB', 'UTG', 'LJ', 'CO'] },
];
const BOARDS = [0, 3, 4, 5] as const;
const STREET = { 0: 'preflop', 3: 'flop', 4: 'turn', 5: 'river' } as const;
const BOARD_CARDS = ['9c', '5h', '2s', 'Kd', '3c'];

const pid = (i: number) => `00000000-0000-4000-8000-0000000c${String(i).padStart(4, '0')}`;
const CASES = CFGS.flatMap((c) => BOARDS.map((b) => ({ c, b })));
const titleOf = (i: number) => `겹침시험 ${CASES[i].c.key} 보드${CASES[i].b}장 #${i}`;

function spotOf(c: Cfg, b: 0 | 3 | 4 | 5) {
  const street = STREET[b];
  const [a, ...extra] = c.vils;
  const actions: Record<string, unknown>[] = [
    { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
    { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 2.5 },
    ...extra.map((pos) => ({ street: 'preflop', actor: 'villain', pos, type: 'call', sizeBb: 2.5 })),
  ];
  // 결정 스트리트에서 상대가 모두 체크 — 좌석 아래 액션 줄('체크')까지 그려지게
  if (street !== 'preflop') {
    actions.push({ street, actor: 'villain', type: 'check' });
    for (const pos of extra) actions.push({ street, actor: 'villain', pos, type: 'check' });
  }
  return {
    v: 3, game: 'nlhe', format: 'cash', tableSize: c.tableSize, sbBb: 0.5, anteBb: 0, effectiveBb: 100,
    heroPos: c.hero, villainPos: a, extraPos: extra, hero: ['Th', 'Td'], villain: c.vils.map(() => []),
    board: BOARD_CARDS.slice(0, b), street, actions,
  };
}

const postRow = (i: number) => ({
  id: pid(i), user_id: `00000000-0000-4000-8000-0000000d${String(i).padStart(4, '0')}`, user_name: `작성자${i}`,
  user_role: 'user', user_color: '#7c3aed', user_avatar: null, content: '이 자리에서 어떻게 하시겠어요?',
  created_at: '2026-10-01T00:00:00Z', like_count: 0, comment_count: 0, view_count: 0, category: 'hand',
  title: titleOf(i), images: [], badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0,
  bumped_until: null, bump_count: 0, pinned_at: null,
});
const spotRow = (i: number) => ({ spot: spotOf(CASES[i].c, CASES[i].b), reveal_villain: false, reveal_result: false });

async function install(page: Page) {
  await page.route(/\/rest\/v1\/community_posts\?/, (r: Route) => {
    const url = decodeURIComponent(r.request().url());
    const embed = url.includes('post_spots(');
    const rows = CASES.map((_, i) => (embed ? { ...postRow(i), post_spots: spotRow(i) } : postRow(i)));
    const m = /[?&]id=eq\.([0-9a-f-]+)/.exec(url);
    if (m) {
      const one = rows.find((p) => p.id === m[1]) ?? null;
      const obj = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
      return r.fulfill(json(obj ? one : one ? [one] : []));
    }
    return r.fulfill(json(rows));
  });
  await page.route(/\/rest\/v1\/post_spots\?/, (r: Route) => {
    const i = CASES.findIndex((_, k) => r.request().url().includes(pid(k)));
    return r.fulfill(json(i >= 0 ? { post_id: pid(i), ...spotRow(i), coverage_kind: 'chart_nash', source_label: null, dataset_version: 'x', analysis: null } : null));
  });
  await page.route(/\/rest\/v1\/post_hands\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/post_polls\?/, (r: Route) => r.fulfill(json(null)));
  await page.route(/\/rest\/v1\/comments\?/, (r: Route) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r: Route) => r.fulfill(json([])));
}

type Box = { id: string; l: number; t: number; r: number; b: number };
type FeltReport = { seats: number; boardCards: number; seatParts: number; boardParts: number; overlaps: string[]; placement: string[]; labels: number; ring: string[] };

/** 한 테이블 안의 좌석 하위 상자 × 보드 하위 상자 교차 — 페이지 안에서 잰다 */
async function measureFelt(page: Page, feltSel: string): Promise<FeltReport> {
  return page.evaluate((sel) => {
    const f = document.querySelector(sel);
    if (!f) return { seats: 0, boardCards: 0, seatParts: 0, boardParts: 0, overlaps: ['테이블 없음'], placement: [], labels: 0, ring: [] };
    const boxOf = (el: Element, id: string): Box | null => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { id, l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    };
    const seatParts: Box[] = [];
    f.querySelectorAll('[data-seat]').forEach((s) => {
      const who = s.getAttribute('data-seat');
      s.querySelectorAll('*').forEach((el) => { const b = boxOf(el, `seat:${who}:${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 12)}`); if (b) seatParts.push(b); });
    });
    f.querySelectorAll('[data-seat-empty]').forEach((el) => { const b = boxOf(el, `empty:${el.textContent}`); if (b) seatParts.push(b); });
    const board = f.querySelector('[data-board]');
    const boardParts: Box[] = [];
    board?.querySelectorAll('*').forEach((el) => { const b = boxOf(el, `board:${el.getAttribute('data-card') ?? (el.textContent || '').trim().slice(0, 8)}`); if (b) boardParts.push(b); });
    const overlaps: string[] = [];
    for (const a of seatParts) for (const b of boardParts) {
      const ix = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const iy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      // 서브픽셀 반올림 여유 0.5px — 그보다 크게 겹치면 결함
      if (ix > 0.5 && iy > 0.5) overlaps.push(`${a.id} × ${b.id} = ${ix.toFixed(1)}×${iy.toFixed(1)}px`);
    }
    // 좌석끼리도 겹치지 않고, 좌석 상자가 테이블 폭 밖으로 밀려나지 않는다(넘치면 카드 밖으로 잘린다).
    const fr = f.getBoundingClientRect();
    const blocks = [...f.querySelectorAll('[data-seat], [data-seat-empty]')]
      .map((el) => boxOf(el, el.getAttribute('data-seat') ?? `empty:${el.textContent}`)).filter((b): b is Box => !!b);
    for (let i = 0; i < blocks.length; i++) {
      const a = blocks[i];
      if (a.l < fr.left - 0.5 || a.r > fr.right + 0.5) overlaps.push(`${a.id} 가 테이블 밖 ${Math.round(Math.min(a.l - fr.left, 0))}..${Math.round(Math.max(a.r - fr.right, 0))}px`);
      for (let j = i + 1; j < blocks.length; j++) {
        const b = blocks[j];
        const ix = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const iy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ix > 0.5 && iy > 0.5) overlaps.push(`좌석 ${a.id} × ${b.id} = ${ix.toFixed(1)}×${iy.toFixed(1)}px`);
      }
    }
    // 🔴 2026-10-02 독립 검토 FAIL — 보드 자리: '안 닿음'만으로는 보드가 타원 밖·내 카드 옆에 가도 통과했다.
    //   ⓐ 보드 상자 네 모서리가 그려진 타원(rounded-full = 스타디움) 안 ⓑ 보드 아래 끝이 내 카드 위끝보다 위
    //   ⓒ 상대·빈 좌석과 보드 사이 4px 이상(피드에서 0.6px 까지 붙었다).
    const placement: string[] = [];
    const ovalEl = f.querySelector('[data-felt-oval]');
    const heroCards = f.querySelector('[data-seat="hero"]')?.firstElementChild;
    const br = board?.getBoundingClientRect();
    if (!ovalEl || !heroCards || !br) placement.push(`측정 대상 없음 oval=${!!ovalEl} hero=${!!heroCards} board=${!!br}`);
    else {
      const o = ovalEl.getBoundingClientRect();
      const rr = Math.min(o.width, o.height) / 2, ocx = o.left + o.width / 2, ocy = o.top + o.height / 2;
      const outBy = (x: number, y: number) =>
        Math.hypot(Math.max(Math.abs(x - ocx) - (o.width / 2 - rr), 0), Math.max(Math.abs(y - ocy) - (o.height / 2 - rr), 0)) - rr;
      for (const [x, y, name] of [[br.left, br.top, '왼위'], [br.right, br.top, '오른위'], [br.left, br.bottom, '왼아래'], [br.right, br.bottom, '오른아래']] as const) {
        const d = outBy(x, y);
        if (d > 0.5) placement.push(`보드 ${name} 모서리가 타원 밖 ${d.toFixed(1)}px`);
      }
      const ht = heroCards.getBoundingClientRect().top;
      if (br.bottom > ht + 0.5) placement.push(`보드 아래 끝(${br.bottom.toFixed(1)})이 내 카드 위끝(${ht.toFixed(1)})보다 아래`);
      for (const s of blocks) {
        if (s.id === 'hero') continue;
        const gx = Math.max(br.left - s.r, s.l - br.right, 0), gy = Math.max(br.top - s.b, s.t - br.bottom, 0);
        const g = Math.hypot(gx, gy);
        if (g < 4) placement.push(`${s.id}–보드 간격 ${g.toFixed(1)}px < 4`);
      }
    }
    // 🔴 10-02 3차 검토 + 오너 결정(10-02) — ⓓ 상대 이름표는 인원·폭과 무관하게 한 줄 'Villain A · UTG1'
    //   (글자가 한 줄에 그려지고, 잘리지 않고, 10px 이상) ⓔ 좌석·빈 자리 가운데가 타원 둘레에서 20px 안.
    const ring: string[] = [];
    let labels = 0;
    f.querySelectorAll('[data-seat]').forEach((s) => {
      const who = s.getAttribute('data-seat');
      if (who === 'hero') return;
      const lab = (s.querySelector('[data-seat-label]') ?? s.querySelector('.rounded-badge')) as HTMLElement | null;
      if (!lab) { ring.push(`${who} 이름표 없음`); return; }
      labels++;
      const text = (lab.textContent ?? '').replace(/\s+/g, ' ').trim();
      // 줄 수 = 보이는 글자 조각들의 세로 가운데를 3px 넘게 벌어진 무리로 센 것(요소 상자는 빼고 글자만 잰다 —
      //   inline-flex 자식 상자 위끝은 같은 줄이어도 소수점이 달라 거짓으로 여러 줄이 된다)
      const mids: number[] = [];
      const tw = document.createTreeWalker(lab, NodeFilter.SHOW_TEXT);
      for (let t = tw.nextNode(); t; t = tw.nextNode()) {
        if (!(t.textContent ?? '').trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(t);
        for (const q of rg.getClientRects()) if (q.width > 0.5) mids.push(q.top + q.height / 2);
      }
      mids.sort((a, b) => a - b);
      const lines = mids.length ? 1 + mids.slice(1).filter((m, k) => m - mids[k] > 3).length : 0;
      const fs = parseFloat(getComputedStyle(lab).fontSize);
      if (!/^Villain [A-E] · [A-Z0-9]+$/.test(text)) ring.push(`${who} 이름표 글자 '${text}'`);
      if (lines !== 1) ring.push(`${who} 이름표 ${lines}줄`);
      if (lab.scrollWidth > lab.clientWidth + 0.5) ring.push(`${who} 이름표 잘림 ${lab.scrollWidth - lab.clientWidth}px`);
      if (!(fs >= 10)) ring.push(`${who} 이름표 글자 ${fs}px < 10`);
    });
    if (ovalEl) {
      const o = ovalEl.getBoundingClientRect();
      const rr = Math.min(o.width, o.height) / 2, ocx = o.left + o.width / 2, ocy = o.top + o.height / 2;
      for (const s of blocks) {
        if (s.id === 'hero') continue;
        const x = (s.l + s.r) / 2, y = (s.t + s.b) / 2;
        const d = Math.hypot(Math.max(Math.abs(x - ocx) - (o.width / 2 - rr), 0), Math.max(Math.abs(y - ocy) - (o.height / 2 - rr), 0)) - rr;
        if (d > 20) ring.push(`${s.id} 가 타원 밖 ${d.toFixed(1)}px > 20`);
      }
    }
    return {
      seats: f.querySelectorAll('[data-seat]').length,
      boardCards: board ? board.querySelectorAll('[data-card]').length : 0,
      seatParts: seatParts.length, boardParts: boardParts.length, overlaps, placement, labels, ring,
    };
  }, feltSel);
}

function check(where: string, i: number, rep: FeltReport, bad: string[], place: string[], ring: string[]) {
  const { c, b } = CASES[i];
  // 거짓 통과 방지 — 측정 대상이 픽스처와 같아야 한다(0건이면 여기서 걸린다)
  expect(rep.seats, `${where} ${titleOf(i)}: 좌석 수`).toBe(c.vils.length + 1);
  expect(rep.boardCards, `${where} ${titleOf(i)}: 보드 카드 수`).toBe(b);
  expect(rep.seatParts, `${where} ${titleOf(i)}: 좌석 상자 0건`).toBeGreaterThan(c.vils.length + 1);
  expect(rep.boardParts, `${where} ${titleOf(i)}: 보드 상자 0건`).toBeGreaterThan(0);
  for (const o of rep.overlaps) bad.push(`${where} ${titleOf(i)}: ${o}`);
  for (const o of rep.placement) place.push(`${where} ${titleOf(i)}: ${o}`);
  expect(rep.labels, `${where} ${titleOf(i)}: 잰 상대 이름표 수`).toBe(c.vils.length);
  for (const o of rep.ring) ring.push(`${where} ${titleOf(i)}: ${o}`);
}

// 412: 테이블이 340px 를 넘는 첫 폰 폭(≈351px) — 7인 이상 이름표가 10px → 11.69px 로 커지는 경계(a5 ④, 10-02)
for (const w of [320, 360, 390, 412]) {
  test(`좌석 × 보드 겹침 0 · 보드는 타원 안·내 카드 위 · 이름표 한 줄 · 좌석은 둘레 20px 안 — 폭 ${w} · 보드 0/3/4/5장 · 상대 1/2/3/5명 · 6·8·9인 · 피드와 상세`, async ({ page }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: w, height: 844 });
    await page.addInitScript(() => { try { localStorage.setItem('nuri:board-view', 'feed'); } catch { /* 사생활 모드 */ } });
    await stubLogin(page);
    await stabilizeBackstack(page);
    await install(page);
    await page.goto('/?tab=community');
    await dismissOverlays(page);
    const tab = page.getByRole('button', { name: '게시판', exact: true }).first();
    await expect(tab).toBeVisible({ timeout: 20_000 });
    await tab.click();
    const firstFeed = page.locator('[data-spot-feed]').filter({ visible: true }).first();
    if (!(await firstFeed.isVisible().catch(() => false))) {
      // 저장된 보기가 한 줄 목록이면 펼쳐보기(카드)로 바꾼다 — 라벨이 아니라 testid(라벨이 바뀌어도 조용히 안 눌리지 않게)
      const toggle = page.getByTestId('board-view-feed');
      if (await toggle.count()) await toggle.click();
    }
    await expect(firstFeed, '피드에 SPOT 테이블이 없다').toBeVisible({ timeout: 20_000 });

    const bad: string[] = [];
    const place: string[] = [];
    const ring: string[] = [];
    // ── 피드 — 카드마다 화면에 올려(content-visibility 건너뛰기 방지) 잰다
    let feedMeasured = 0;
    for (let i = 0; i < CASES.length; i++) {
      const li = page.locator('li').filter({ hasText: titleOf(i) }).filter({ visible: true }).first();
      await li.evaluate((n) => { n.setAttribute('data-geo-card', ''); n.scrollIntoView({ block: 'center' }); });
      await page.waitForTimeout(60);
      check('피드', i, await measureFelt(page, '[data-geo-card] [data-felt]'), bad, place, ring);
      await li.evaluate((n) => n.removeAttribute('data-geo-card'));
      feedMeasured++;
    }
    expect(feedMeasured, '피드에서 잰 테이블 수').toBe(CASES.length);

    // ── 상세 — 글을 하나씩 열어 잰다
    let detailMeasured = 0;
    for (let i = 0; i < CASES.length; i++) {
      const li = page.locator('li').filter({ hasText: titleOf(i) }).filter({ visible: true }).first();
      await li.evaluate((n) => (n as HTMLElement).click());
      const felt = page.getByRole('dialog').first().locator('[data-spot-post] [data-felt]');
      await expect(felt, `${titleOf(i)} 상세에 테이블이 없다`).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(150);
      check('상세', i, await measureFelt(page, '[role=dialog] [data-spot-post] [data-felt]'), bad, place, ring);
      detailMeasured++;
      await page.evaluate(() => history.back());
      await expect(page.getByRole('dialog'), '뒤로가기로 상세가 닫히지 않는다').toHaveCount(0, { timeout: 5_000 });
      await page.waitForTimeout(250);
    }
    expect(detailMeasured, '상세에서 잰 테이블 수').toBe(CASES.length);

    expect(bad, '좌석(이름표·카드)이 보드 카드를 덮거나, 좌석끼리 겹치거나, 테이블 밖으로 밀렸다').toEqual([]);
    expect(place, '보드가 타원 밖이거나, 내 카드 줄로 내려왔거나, 좌석과 4px 미만으로 붙었다').toEqual([]);
    expect(ring, '상대 이름표가 한 줄 \'Villain A · 자리\' 가 아니거나(두 줄·잘림·10px 미만), 좌석이 타원 둘레에서 20px 넘게 벗어났다').toEqual([]);
  });
}
