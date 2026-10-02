// 쪽지 ⇄ 알림(그리고 전체 ⇄ 안 읽음) 오가기 — 이미 본 목록은 한 프레임에 바뀌고, 카드 밖으로 늘어진 옛 목록이 없다.
//
// 오너 원문(2026-10-02): "쪽지함과 알림을 왔다갔다하면 드르륵 내려가는 모션이 눈에 보여. 이런 비슷한 부분까지 오류 다 잡아."
// 원인(프레임 실측 · 390/1440 · 알림 8건 / 쪽지 3건): 하위 탭 판 교체(src/lib/tabCover.ts handOffSubPanel)가 떠나는 목록을
//   이벤트 시점 모양 그대로 fixed 복제본으로 세워 240ms 걷는데, 알림 카드는 **내용 높이를 따라가는 뜨는 카드**라 커밋에서
//   679→254px 로 줄었다. fixed 복제본은 카드의 overflow 를 안 받아 알림 목록(619px)이 카드 밑으로 **425px(1440: 450px)** 늘어진 채
//   걷혔다(전체→안 읽음 377/402px). 반대 방향은 커진 카드 아래 새 목록이 먼저 보이고 위만 겹쳐 걷혔다.
// 고침: 판을 자르는 그릇의 높이가 커밋에서 바뀌면 복제본을 세우지 않는다(한 프레임 교체). 그릇이 그대로인 판(내 정보·약관·
//   지면 위 커뮤니티·GTO)은 종전처럼 떠나는 판이 선다 — tab-handoff-gate ④⑥ 이 그쪽을 잠근다.
// 재는 것(매 rAF · 클릭 뒤 800ms): ① 떠나는 판 복제본의 보이는 상자가 카드 밖으로 나간 양 = 0
//   ② 카드 높이가 바뀐 이동에서 복제본이 선 프레임 = 0 ③ 카드 안 행이 정착 뒤 위치에서 움직인 양 = 0(드르륵 0).
// 손가락 조건: 모바일은 CDP touchStart→110ms→touchEnd(Playwright click 은 누름 0ms 라 프레스 부류를 못 본다).
import type { Page, CDPSession } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const peer = (i: number) => `1111111${i}-1111-4111-8111-111111111111`;

async function boot(page: Page, w: number) {
  await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
  await page.addInitScript(() => { try { localStorage.setItem('nuri-theme', 'dark'); } catch { /* 차단 환경 */ } });
  const uid = await stubLogin(page);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/notifications\?/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(
    Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`, user_id: uid, type: 'system', title: `알림 제목 ${i}`, message: `알림 본문 ${i} 두 줄 설명 길게 길게 길게 길게`,
      read: i > 2, created_at: new Date(Date.now() - i * 3600e3).toISOString(), link: '/x',
    })))));
  await page.route(/\/rest\/v1\/user_messages/, (r) => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fallback();
    if (!decodeURIComponent(req.url()).includes('order=created_at.desc')) return r.fulfill(json([]));
    return r.fulfill(json(Array.from({ length: 3 }, (_, i) => ({
      id: `m${i}`, sender_id: peer(i), recipient_id: uid, body: `쪽지 ${i}`, created_at: new Date(Date.now() - i * 6e4).toISOString(),
      read_at: null, sender_deleted: false, recipient_deleted: false,
    }))));
  });
  await page.route(/\/rest\/v1\/rpc\/get_public_profiles/, (r) => r.fulfill(json(
    Array.from({ length: 3 }, (_, i) => ({ id: peer(i), nickname: `상대${i}`, name: `상대${i}`, avatar_color: null })))));
  await page.goto('/?tab=home');
  const bell = page.locator('button[aria-label^="알림"]');
  await expect(bell).toBeVisible({ timeout: 20_000 });
  await bell.click();
  await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible();
  await page.waitForTimeout(1200);
}

type Rec = { over: number; cloneFrames: number; cardH: number[]; rowMove: number; rows: number };

/** 탭 하나를 누르고 800ms 동안 프레임마다 잰다. */
async function measure(page: Page, cdp: CDPSession | null, sel: string, name: string): Promise<Rec> {
  const tab = page.getByRole('dialog', { name: '알림' }).locator(sel).getByRole('tab', { name, exact: true });
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
          const ib = v.length === 1 ? v[0] : v.length < 3 ? v[0] : v[2];
          over = Math.max(over, Math.round(r.bottom - ib - c.bottom));
        }
        const ul = card.querySelector('[data-notif-panel]');
        const rows = ul ? [...ul.children].map((li) => [li, Math.round(li.getBoundingClientRect().top - c.top)] as [Element, number]) : [];
        out.push({ over, clone, cardH: Math.round(c.height), rows });
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
    return { over: Math.max(0, ...f.map((x) => x.over)), cloneFrames: f.filter((x) => x.clone).length, cardH: [...new Set(f.map((x) => x.cardH))], rowMove, rows: last.size };
  });
}

for (const w of [390, 1440]) {
  test(`🔴 쪽지⇄알림·전체⇄안 읽음 ${w} — 카드 밖 늘어짐 0 · 높이가 바뀐 이동은 한 프레임 교체 · 행 이동 0`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, w);
    const cdp = w < 768 ? await page.context().newCDPSession(page) : null;
    const STEPS: [string, string][] = [
      ['[data-notif-tabbar]', '쪽지'], ['[data-notif-tabbar]', '알림'], ['[data-notif-tabbar]', '쪽지'], ['[data-notif-tabbar]', '알림'],
      ['[data-notif-actions]', '안 읽음'], ['[data-notif-actions]', '전체'], ['[data-notif-actions]', '안 읽음'], ['[data-notif-actions]', '전체'],
    ];
    const bad: string[] = []; const log: string[] = []; let resized = 0;
    for (const [i, [sel, name]] of STEPS.entries()) {
      const r = await measure(page, cdp, sel, name);
      log.push(`#${i} ${name} over=${r.over} clone=${r.cloneFrames} cardH=${r.cardH.join('/')} rowMove=${r.rowMove} rows=${r.rows}`);
      expect(r.rows, `#${i} ${name}: 카드 안 목록 행을 못 모았다 — 측정 대상이 틀렸다`).toBeGreaterThan(0);
      if (r.over > 0) bad.push(`#${i} ${name}: 떠나는 목록이 카드 밑으로 ${r.over}px 늘어졌다`);
      if (r.cardH.length > 1) { resized += 1; if (r.cloneFrames > 0) bad.push(`#${i} ${name}: 카드 높이가 바뀐(${r.cardH.join('→')}) 이동에 옛 목록 복제본이 ${r.cloneFrames}프레임 섰다`); }
      if (r.rowMove > 0) bad.push(`#${i} ${name}: 카드 안 행이 정착 자리에서 ${r.rowMove}px 움직였다(드르륵)`);
    }
    console.log(`[notif-revisit ${w}]\n  ${log.join('\n  ')}`);
    expect(resized, '카드 높이가 바뀐 이동이 없다 — 픽스처가 결함 조건(알림 8 · 쪽지 3 · 안 읽음 3)을 못 만들었다').toBeGreaterThanOrEqual(6);
    expect(bad).toEqual([]);
  });
}
