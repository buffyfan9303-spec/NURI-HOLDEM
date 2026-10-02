// 쪽지 ⇄ 알림(그리고 전체 ⇄ 안 읽음) 오가기 — 카드 높이 불변 · 한 프레임 교체 · 약 10행 · 탭별 스크롤 기억.
//
// 오너 원문(2026-10-02): "쪽지함과 알림을 왔다갔다하면 드르륵 내려가는 모션이 눈에 보여. 이런 비슷한 부분까지 오류 다 잡아."
// 원인(프레임 실측 · 390/1440): 알림 카드가 목록 길이를 따라 커졌다 줄었고(알림 8 → 쪽지 3: 679→254px), 하위 탭 판 교체
//   (src/lib/tabCover.ts handOffSubPanel)의 떠나는 목록 복제본이 fixed 라 카드 밖으로 **425px(1440: 450px)** 늘어진 채 240ms 걷혔다.
//   카드 높이가 같아도(두 목록 다 길 때) 행 높이가 다른 두 목록(쪽지 64.75px · 알림 80.63px)이 240ms 겹쳐 걷혀 행이 계단처럼 내려가 보였다.
// 오너 결정(같은 날): "목록을 길게 남기지 말고 줄여라. 스크롤해서 내려 보게 하고 한 번에 10개 정도. 안 되면 알림 창은 항상 즉시 전환."
//   → ① 본문 그릇 하나가 두 탭 높이를 정한다(두 목록 중 긴 쪽 · 바닥 160px · 상한 44rem ≈ 10행 · 화면이 낮으면 카드 max-h) — 안에서 스크롤.
//     ② 알림 창 하위 탭은 복제본 없이 한 프레임 교체(INSTANT_SUB_SCOPES). ③ 목록 스크롤 자리는 탭마다 기억 · overscroll-contain.
// 재는 것(매 rAF · 누름 전 1표본 + 누른 뒤 800ms): 카드 높이가 모든 프레임·모든 이동에서 하나 · 복제본 프레임 0 · 카드 밖 늘어짐 0 ·
//   정착 자리에서 움직인 행 0. 정착 뒤: 화면에 온전히 보이는 행 수 · 탭별 스크롤 자리 · overscroll-behavior.
// 손가락 조건: 모바일은 CDP touchStart→110ms→touchEnd(Playwright click 은 누름 0ms 라 프레스 부류를 못 본다).
import type { Page, CDPSession } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const peer = (i: number) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`;

async function boot(page: Page, w: number, nNotif: number, nThread: number) {
  await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
  await page.addInitScript(() => { try { localStorage.setItem('nuri-theme', 'dark'); } catch { /* 차단 환경 */ } });
  const uid = await stubLogin(page);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/notifications\?/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(
    Array.from({ length: nNotif }, (_, i) => ({
      id: `n${i}`, user_id: uid, type: 'system', title: `알림 제목 ${i}`, message: `알림 본문 ${i} 두 줄 설명 길게 길게 길게 길게`,
      read: i > 2, created_at: new Date(Date.now() - i * 3600e3).toISOString(), link: '/x',
    })))));
  await page.route(/\/rest\/v1\/user_messages/, (r) => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fallback();
    if (!decodeURIComponent(req.url()).includes('order=created_at.desc')) return r.fulfill(json([]));
    return r.fulfill(json(Array.from({ length: nThread }, (_, i) => ({
      id: `m${i}`, sender_id: peer(i), recipient_id: uid, body: `쪽지 ${i}`, created_at: new Date(Date.now() - i * 6e4).toISOString(),
      read_at: null, sender_deleted: false, recipient_deleted: false,
    }))));
  });
  await page.route(/\/rest\/v1\/rpc\/get_public_profiles/, (r) => r.fulfill(json(
    Array.from({ length: nThread }, (_, i) => ({ id: peer(i), nickname: `상대${i}`, name: `상대${i}`, avatar_color: null })))));
  await page.goto('/?tab=home');
  const bell = page.locator('button[aria-label^="알림"]');
  await expect(bell).toBeVisible({ timeout: 20_000 });
  await bell.click();
  await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible();
  await page.waitForTimeout(1200);
}

type Rec = { over: number; cloneFrames: number; cardH: number[]; rowMove: number; rows: number; fullRows: number };
const tabOf = (page: Page, sel: string, name: string) =>
  page.getByRole('dialog', { name: '알림' }).locator(sel).getByRole('tab', { name, exact: true });

/** 탭 하나를 누르고 800ms 동안 프레임마다 잰다. */
async function measure(page: Page, cdp: CDPSession | null, sel: string, name: string): Promise<Rec> {
  const tab = tabOf(page, sel, name);
  const box = (await tab.boundingBox())!;
  await page.evaluate(() => {
    const out: { over: number; clone: boolean; cardH: number; rows: [Element, number][] }[] = [];
    (window as unknown as { __nf: typeof out }).__nf = out;
    const t0 = performance.now();
    const tick = () => {
      const card = document.querySelector('[role="dialog"][aria-label="알림"]');
      if (card) {
        const c = card.getBoundingClientRect();
        let over = 0; let clone = false;
        for (const g of card.querySelectorAll('[data-pane-leaving]')) {
          clone = true;
          const r = g.getBoundingClientRect();
          const m = /inset\(([^)]*)\)/.exec(getComputedStyle(g).clipPath);
          const v = m ? m[1].split(/\s+/).map(parseFloat) : [0, 0, 0, 0];
          const ib = v.length < 3 ? v[0] : v[2];
          over = Math.max(over, Math.round(r.bottom - ib - c.bottom));
        }
        const ul = card.querySelector('[data-notif-panel]');
        const rows = ul ? [...ul.children].map((li) => [li, Math.round(li.getBoundingClientRect().top - c.top)] as [Element, number]) : [];
        out.push({ over, clone, cardH: Math.round(c.height * 10) / 10, rows });
      }
      if (performance.now() - t0 < 800) requestAnimationFrame(tick);
    };
    tick(); // 누르기 전 모습을 첫 표본으로 — 첫 rAF 가 누름보다 늦으면 '높이가 바뀌었다'를 못 본다
  });
  if (cdp) {
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(110);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await tab.evaluate((el: HTMLElement) => el.click());   // locator.click 의 자동 스크롤이 측정을 오염시키지 않게
  }
  await page.waitForTimeout(950);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  return page.evaluate(() => {
    const f = (window as unknown as { __nf: { over: number; clone: boolean; cardH: number; rows: [Element, number][] }[] }).__nf;
    const last = new Map(f[f.length - 1].rows);
    let rowMove = 0;
    // 정착 뒤 자리와 다른 프레임의 같은 행(정착 판에 남은 행만) — 단계적으로 내려오면 여기서 잡힌다
    for (const fr of f) for (const [li, top] of fr.rows) { const t = last.get(li); if (t !== undefined) rowMove = Math.max(rowMove, Math.abs(top - t)); }
    const ul = document.querySelector('[role="dialog"][aria-label="알림"] [data-notif-panel]')!;
    const u = ul.getBoundingClientRect();
    const fullRows = [...ul.children].filter((li) => { const q = li.getBoundingClientRect(); return q.top >= u.top - 0.5 && q.bottom <= u.bottom + 0.5; }).length;
    return { over: Math.max(0, ...f.map((x) => x.over)), cloneFrames: f.filter((x) => x.clone).length, cardH: [...new Set(f.map((x) => x.cardH))], rowMove, rows: last.size, fullRows };
  });
}

const STEPS: [string, string][] = [
  ['[data-notif-tabbar]', '쪽지'], ['[data-notif-tabbar]', '알림'], ['[data-notif-tabbar]', '쪽지'], ['[data-notif-tabbar]', '알림'],
  ['[data-notif-actions]', '안 읽음'], ['[data-notif-actions]', '전체'], ['[data-notif-actions]', '안 읽음'], ['[data-notif-actions]', '전체'],
];

// 짧은 목록(알림 8 · 쪽지 3 — 예전엔 카드가 탭마다 커졌다 줄었다)과 긴 목록(알림 20 · 쪽지 12 — 카드 높이는 같아도 두 목록이 겹쳐 걷혔다)
for (const w of [390, 1440]) for (const [nN, nT] of [[8, 3], [20, 12]] as const) {
  test(`🔴 쪽지⇄알림·전체⇄안 읽음 ${w} 알림${nN}·쪽지${nT} — 카드 높이 불변 · 복제본 0 · 늘어짐 0 · 행 이동 0`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, w, nN, nT);
    const cdp = w < 768 ? await page.context().newCDPSession(page) : null;
    const bad: string[] = []; const log: string[] = []; const heights = new Set<number>();
    for (const [i, [sel, name]] of STEPS.entries()) {
      const r = await measure(page, cdp, sel, name);
      r.cardH.forEach((h) => heights.add(h));
      log.push(`#${i} ${name} over=${r.over} clone=${r.cloneFrames} cardH=${r.cardH.join('/')} rowMove=${r.rowMove} rows=${r.rows} full=${r.fullRows}`);
      expect(r.rows, `#${i} ${name}: 카드 안 목록 행을 못 모았다 — 측정 대상이 틀렸다`).toBeGreaterThan(0);
      if (r.over > 0) bad.push(`#${i} ${name}: 떠나는 목록이 카드 밑으로 ${r.over}px 늘어졌다`);
      if (r.cloneFrames > 0) bad.push(`#${i} ${name}: 옛 목록 복제본이 ${r.cloneFrames}프레임 섰다(알림 창은 한 프레임 교체)`);
      if (r.rowMove > 0) bad.push(`#${i} ${name}: 카드 안 행이 정착 자리에서 ${r.rowMove}px 움직였다(드르륵)`);
    }
    console.log(`[notif-revisit ${w} N${nN} T${nT}] heights=${[...heights].join('/')}\n  ${log.join('\n  ')}`);
    if (heights.size > 1) bad.push(`카드 높이가 탭·필터마다 달랐다: ${[...heights].join(' / ')}px`);
    expect(bad).toEqual([]);
  });
}

// 약 10행 · 탭별 스크롤 기억 · 뒤 화면으로 스크롤이 새지 않음
for (const w of [390, 1440]) {
  test(`🔴 알림 창 ${w} — 긴 목록은 약 10행(화면이 낮으면 화면 안) · 탭마다 스크롤 자리 기억 · overscroll-contain`, async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page, w, 20, 20);
    const dlg = page.getByRole('dialog', { name: '알림' });
    const list = dlg.locator('[data-notif-panel]');
    const info = () => list.evaluate((ul) => {
      const u = ul.getBoundingClientRect(); const card = ul.closest('[role="dialog"]')!.getBoundingClientRect();
      const full = [...ul.children].filter((li) => { const q = li.getBoundingClientRect(); return q.top >= u.top - 0.5 && q.bottom <= u.bottom + 0.5; }).length;
      return { full, top: ul.scrollTop, os: getComputedStyle(ul).overscrollBehaviorY, cardBottom: card.bottom, vh: innerHeight };
    });
    const go = async (sel: string, name: string) => { await tabOf(page, sel, name).evaluate((el: HTMLElement) => el.click()); await page.waitForTimeout(400); };
    const scrollTo = async (y: number) => { await list.evaluate((ul, v) => { ul.scrollTop = v; ul.dispatchEvent(new Event('scroll')); }, y); await page.waitForTimeout(200); };

    const n0 = await info();
    // 1440×900 은 상한 44rem(748px)이 들어간다 — 알림 9행 · 쪽지 11행. 390×844 는 카드 가용 높이(본문 619px)가 먼저 자른다 — 알림 7행 · 쪽지 9행.
    const want = w < 768 ? { notif: 7, thread: 9 } : { notif: 9, thread: 10 };
    expect(n0.full, `알림 목록이 한 번에 ${n0.full}행 보인다(기대 ≥ ${want.notif})`).toBeGreaterThanOrEqual(want.notif);
    expect(n0.full, '알림이 약 10행보다 훨씬 많이 보인다 — 목록이 줄지 않았다').toBeLessThanOrEqual(11);
    expect(n0.cardBottom, '카드가 화면 밖으로 나갔다').toBeLessThanOrEqual(n0.vh);
    expect(n0.os, '알림 목록 끝에서 뒤 화면이 같이 굴러간다').toBe('contain');
    await scrollTo(400);
    await go('[data-notif-tabbar]', '쪽지');
    const t0 = await info();
    expect(t0.full, `쪽지 목록이 한 번에 ${t0.full}행 보인다(기대 ≥ ${want.thread})`).toBeGreaterThanOrEqual(want.thread);
    expect(t0.os).toBe('contain');
    expect(t0.top, '처음 연 쪽지 탭은 맨 위에서 시작한다').toBe(0);
    await scrollTo(120);
    await go('[data-notif-tabbar]', '알림');
    expect((await info()).top, '알림으로 돌아왔는데 스크롤 자리를 잃었다').toBe(400);
    await go('[data-notif-tabbar]', '쪽지');
    expect((await info()).top, '쪽지로 돌아왔는데 스크롤 자리를 잃었다').toBe(120);
  });
}
