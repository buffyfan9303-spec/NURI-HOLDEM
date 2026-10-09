// PANE-FADE 누른 줄(design-reviewer 2026-10-09 P2-1·P2-2) — 9차 판 전환 막([data-pane-fade])이 **방금 누른 버튼이 든 줄**까지 덮어
//   누를 때마다 약 0.2초 절반 밝기로 흐렸다. 사양(motion-history.md ③ 위치 "하단바 위" · ④ A15 "탭바·알약은 안 흐려진다") 위반.
//   P2-1 모바일 — 막이 body 에 붙어 앱 셸(relative z-1) 쌓임 맥락 밖이었다 → 셸 안 하단바(z-50)가 body 단계에서 z=1 이라 막(z=45) 밑.
//     하단바 띠의 밝은 2% 휘도(다크 390, 홈→커뮤니티) 206 → 103 → 202. 하위 탭 판이 화면 끝까지 길면 하위 탭 막도 하단바를 덮었다.
//   P2-2 내 매장 — 단계 알약 레일([data-mystore-rail])이 판([data-mystore-secpanel]) **안**이라 subPanelOf 가 레일을 못 찾아 막 윗변 = 판 윗변
//     (= 레일 윗변). 레일 밝은 2% 휘도 1440 다크 151 → 84 · 390 203 → 111. 09-26 오너 "내 매장 알약을 누르면 검정이 됐다가 다시 나온다" 의 자리.
// 고침(src/lib/tabCover.ts 9차): 막을 셸 안(옛 덮개 자리)에 붙이고, 모바일 아래끝을 하단바 윗변에서 자르고, 하위 탭은 누른 줄(pressRow)을 판에서 뺀다.
//
// 계약(이동마다 · 실제 입력 — 모바일 CDP 터치 100ms 홀드, PC 마우스 70ms):
//   ① 막이 보이는(opacity > 0.02) rAF 프레임마다 막 rect ∩ 누른 줄 rect = 0. 누른 줄 = 메인: 하단바 · 하위: 누른 레일(+ 모바일이면 하단바).
//   ② 누른 줄 영역의 밝은 2% 휘도가 정착값보다 DROP_MAX 넘게 떨어진 화면 프레임 0(CDP 스크린캐스트 · 다크 — 막은 지면색이라 다크에서 흐려진다).
//   공허 방지: 이동마다 막이 한 프레임 이상 보였다(막이 없으면 ①은 공허 — 9차 '딱딱함 방지' 와 같은 조건) · 활성 판이 바뀌었다 · 화면 프레임을 받았다.
// 음성 대조(2026-10-09): 48342408(막이 body · 레일 못 찾음) 빌드에서 4건 모두 빨갛다(① 겹침 하단바 24,960px² · 레일 1440 58,900 / 390 ② 하강 46~91).
//   막 없는 기준 빌드(73b7df71)는 ①② 는 통과하고 '막이 한 번도 안 보였다'(공허 방지)에서만 빨갛다 — 막을 없애서 통과시킬 수 없다.
// ⚠ 하네스 Chromium 만 본다(삼성 인터넷 실기기 밝기는 재현 못 함 ≠ 없음). bootOwner 는 매장·권한만 목킹하고 읽기는 운영으로 간다(쓰기는 _fixtures 가드).
// 실행: E2E_BASE_URL=http://localhost:43xx npx playwright test e2e/pane-fade-press-row.spec.ts   (PRESS_ROW_LOG=1 → 이동별 값)
import type { Page, CDPSession } from '@playwright/test';
import { test, expect } from './_fixtures';
import sharp from 'sharp';
import { bootOwner, openMyStore } from './_mockOwner';

const WIN_MS = 700;
/** 누른 줄 밝은 2% 휘도의 프레임 하강 상한(0~255). 근거(2026-10-09 실측, 다크): 막 없는 기준 빌드 73b7df71 0~6 · 수정 빌드 0~6 ·
 *  48342408(막이 줄을 덮음) 하단바 90~91 · 내 매장 레일 1440 46~50 · 390 78~83. 상한은 그 사이. */
const DROP_MAX = 30;
const NAV = 'nav[aria-label="하단 내비게이션"]';

type Shot = { ts: number; data: string };
type Box = { x: number; y: number; w: number; h: number };
type Probe = { frames: number; fadeFrames: number; hits: string[] };
type Move = { tag: string; fadeFrames: number; hits: string[]; drops: number[]; shots: number; changed: boolean };

/** 밝은 2% 휘도(98 분위) — 누른 줄의 글자·아이콘·알약처럼 밝은 부분. 막(지면색)이 덮으면 이 값이 떨어진다. */
async function bright2(b64: string, rect: Box, vw: number): Promise<number | null> {
  const buf = Buffer.from(b64, 'base64');
  const meta = await sharp(buf).metadata();
  const sx = (meta.width ?? vw) / vw;
  const left = Math.max(0, Math.round(rect.x * sx)); const top = Math.max(0, Math.round(rect.y * sx));
  const width = Math.min((meta.width ?? 0) - left, Math.round(rect.w * sx)); const height = Math.min((meta.height ?? 0) - top, Math.round(rect.h * sx));
  if (width < 8 || height < 4) return null;
  const { data, info } = await sharp(buf).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  const ys: number[] = [];
  for (let i = 0; i < data.length; i += info.channels) ys.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  ys.sort((a, b) => a - b);
  return ys[Math.floor(ys.length * 0.98)];
}

/** 누르기 전에 rAF 표본기를 건다 — 막이 보인 프레임마다 [data-probe-row] 줄과의 겹친 넓이를 잰다. */
async function arm(page: Page): Promise<void> {
  await page.evaluate((win) => {
    const w = window as unknown as { __pr: (Probe & { done: boolean }) | null };
    const p = { frames: 0, fadeFrames: 0, hits: [] as string[], done: false };
    w.__pr = p;
    const t0 = performance.now();
    const tick = () => {
      p.frames++;
      const f = document.querySelector<HTMLElement>('[data-pane-fade]');
      const cs = f ? getComputedStyle(f) : null;
      const op = cs && cs.display !== 'none' && f!.getClientRects().length ? Number(cs.opacity) : 0;
      if (op > 0.02) {
        p.fadeFrames++;
        const a = f!.getBoundingClientRect();
        for (const row of document.querySelectorAll<HTMLElement>('[data-probe-row]')) {
          const b = row.getBoundingClientRect();
          const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ix > 0.5 && iy > 0.5 && p.hits.length < 4) {
            p.hits.push(`${row.getAttribute('data-probe-row')} 막(${[a.left, a.top, a.right, a.bottom].map(Math.round).join(',')} op ${op.toFixed(2)}) ∩ 줄(${[b.left, b.top, b.right, b.bottom].map(Math.round).join(',')}) = ${Math.round(ix * iy)}px²`);
          }
        }
      }
      if (performance.now() - t0 < win) requestAnimationFrame(tick); else p.done = true;
    };
    requestAnimationFrame(tick);
  }, WIN_MS);
}

/** 한 번 누르고 ①② 를 잰다. mark 는 누를 요소와 누른 줄들에 표식을 달고 누를 자리(화면 좌표)를 돌려준다. */
async function pressAndMeasure(page: Page, cdp: CDPSession, shots: Shot[], vw: number, mobile: boolean, tag: string,
  mark: () => Promise<{ x: number; y: number; rows: Box[]; before: string } | null>, after: () => Promise<string>): Promise<Move> {
  const m = await mark();
  expect(m, `${tag}: 누를 버튼을 못 찾았다 — 측정이 공허해진다`).not.toBeNull();
  await page.waitForTimeout(150);
  await arm(page);
  shots.length = 0;
  const t0 = Date.now();
  if (mobile) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: m!.x, y: m!.y }] });
    await page.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(m!.x, m!.y); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
  }
  await page.waitForFunction(() => (window as unknown as { __pr: { done: boolean } | null }).__pr?.done, null, { timeout: 15_000 });
  await page.waitForTimeout(120);
  const probe = await page.evaluate(() => {
    const p = (window as unknown as { __pr: Probe }).__pr;
    document.querySelectorAll('[data-probe-row]').forEach((e) => e.removeAttribute('data-probe-row'));
    return { frames: p.frames, fadeFrames: p.fadeFrames, hits: p.hits };
  });
  // ② 누른 줄마다: 정착값(창의 마지막 프레임) − 창 안 최솟값
  const inWin = shots.splice(0).filter((s) => s.ts - t0 >= -20 && s.ts - t0 <= WIN_MS);
  const drops: number[] = [];
  for (const rect of m!.rows) {
    const vals: number[] = [];
    for (const s of inWin) { const v = await bright2(s.data, rect, vw); if (v !== null) vals.push(v); }
    if (vals.length) drops.push(Math.round(vals[vals.length - 1] - Math.min(...vals)));
  }
  const changed = (await after()) !== m!.before;
  if (process.env.PRESS_ROW_LOG) console.log(`[press-row] ${tag} fadeFrames=${probe.fadeFrames} hits=${probe.hits.length} drops=${drops.join('/')} shots=${inWin.length} changed=${changed}${probe.hits.length ? ` · ${probe.hits[0]}` : ''}`);
  return { tag, fadeFrames: probe.fadeFrames, hits: probe.hits, drops, shots: inWin.length, changed };
}

function judge(moves: Move[], what: string) {
  expect.soft(moves.filter((v) => !v.changed).map((v) => v.tag), `${what}: 눌렀는데 활성 판이 안 바뀌었다(공허한 초록 방지)`).toEqual([]);
  expect.soft(moves.filter((v) => v.fadeFrames === 0).map((v) => v.tag), `${what}: 막이 한 번도 안 보였다 — ①이 공허하다(9차 딱딱함 방지 위반이기도 하다)`).toEqual([]);
  expect.soft(moves.flatMap((v) => v.hits.map((h) => `${v.tag}: ${h}`)), `${what}: 막이 방금 누른 버튼이 든 줄을 덮었다(P2-1·P2-2)`).toEqual([]);
  expect.soft(moves.filter((v) => v.drops.some((d) => d > DROP_MAX)).map((v) => `${v.tag}: 하강 ${v.drops.join('/')}`), `${what}: 누른 줄이 흐려졌다(밝은 2% 휘도 하강 > ${DROP_MAX})`).toEqual([]);
  expect.soft(moves.filter((v) => v.shots > 0).length, `${what}: 스크린캐스트 프레임을 거의 못 받았다`).toBeGreaterThanOrEqual(moves.length / 2);
}

async function startCast(page: Page): Promise<{ cdp: CDPSession; shots: Shot[] }> {
  const cdp = await page.context().newCDPSession(page);
  const shots: Shot[] = [];
  cdp.on('Page.screencastFrame', (f) => { shots.push({ ts: (f.metadata.timestamp ?? 0) * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
  return { cdp, shots };
}
const dark = (page: Page) => page.addInitScript(() => { try { localStorage.setItem('nuri-theme', 'dark'); } catch { /* 차단 환경 */ } });
const activePane = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((p) => p.style.display !== 'none')?.dataset.tab ?? '?');

test.describe('PANE-FADE — 막은 방금 누른 버튼이 든 줄을 덮지 않는다(P2-1·P2-2)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('메인 탭 · 모바일 390 다크 — 하단바(누른 탭)가 안 흐려진다', async ({ page }) => {
    await dark(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.tab-pane').length >= 2, null, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    const { cdp, shots } = await startCast(page);
    const moves: Move[] = [];
    for (const lap of [1, 2]) {
      for (const label of ['커뮤니티', 'GTO', '캘린더', '라이브', '홈']) {
        moves.push(await pressAndMeasure(page, cdp, shots, 390, true, `lap${lap} ${label}`, () => page.evaluate(([nav, nm]) => {
          const n = document.querySelector<HTMLElement>(nav);
          const b = n && [...n.querySelectorAll<HTMLElement>('button')].find((x) => x.getClientRects().length && (x.textContent ?? '').trim().startsWith(nm));
          if (!n || !b) return null;
          n.setAttribute('data-probe-row', '하단바');
          const r = b.getBoundingClientRect(); const q = n.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, rows: [{ x: q.left, y: q.top, w: q.width, h: Math.min(q.height, innerHeight - q.top) }],
            before: [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((p) => p.style.display !== 'none')?.dataset.tab ?? '?' };
        }, [NAV, label] as const), () => activePane(page)));
        await page.waitForTimeout(300);
      }
    }
    await cdp.send('Page.stopScreencast').catch(() => {});
    expect(moves).toHaveLength(10);
    judge(moves, '메인 탭 390');
  });

  test('하위 탭 · 커뮤니티 섹션 모바일 390 다크 — 섹션 레일·하단바가 안 흐려진다', async ({ page }) => {
    await dark(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => document.querySelectorAll('.tab-pane').length >= 2, null, { timeout: 15_000 });
    await page.evaluate((nav) => { [...document.querySelectorAll<HTMLElement>(`${nav} button`)].find((x) => (x.textContent ?? '').trim().startsWith('커뮤니티'))?.click(); }, NAV);
    const bar = '[data-community-secbar]';
    await page.locator(`${bar} button`).first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1500);
    const { cdp, shots } = await startCast(page);
    const moves: Move[] = [];
    const shown = () => page.evaluate(() => (document.querySelector('[data-community-secbar] [aria-selected="true"], [data-community-secbar] [aria-pressed="true"]')?.textContent ?? '').trim());
    for (let i = 0; i < 6; i++) {
      moves.push(await pressAndMeasure(page, cdp, shots, 390, true, `섹션 ${i + 1}`, () => page.evaluate(([b, nav, k]) => {
        const rail = document.querySelector<HTMLElement>(b);
        const bs = rail ? [...rail.querySelectorAll<HTMLElement>('button')].filter((x) => x.getClientRects().length && x.getAttribute('aria-selected') !== 'true' && x.getAttribute('aria-pressed') !== 'true') : [];
        const btn = bs[k % Math.max(1, bs.length)];
        if (!rail || !btn) return null;
        btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        rail.setAttribute('data-probe-row', '섹션 레일');
        const n = document.querySelector<HTMLElement>(nav); n?.setAttribute('data-probe-row', '하단바');
        const r = btn.getBoundingClientRect(); const q = rail.getBoundingClientRect(); const nq = n?.getBoundingClientRect();
        const rows = [{ x: q.left, y: q.top, w: q.width, h: q.height }];
        if (nq && nq.height > 0 && nq.top < innerHeight) rows.push({ x: nq.left, y: nq.top, w: nq.width, h: Math.min(nq.height, innerHeight - nq.top) });
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, rows,
          before: (rail.querySelector('[aria-selected="true"], [aria-pressed="true"]')?.textContent ?? '').trim() };
      }, [bar, NAV, i] as const), shown));
      await page.waitForTimeout(300);
    }
    await cdp.send('Page.stopScreencast').catch(() => {});
    expect(moves).toHaveLength(6);
    judge(moves, '커뮤니티 섹션 390');
  });

  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]] as const) {
    test(`하위 탭 · 내 매장 단계 알약 ${w} 다크 — 판 안 레일이 안 흐려진다`, async ({ page }) => {
      await dark(page);
      await bootOwner(page, { viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' } });
      await openMyStore(page);
      await expect(page.locator('[data-mystore-secpanel]')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('[data-mystore-rail] button').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(2000);
      const { cdp, shots } = await startCast(page);
      const moves: Move[] = [];
      const shownPanes = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] [data-pane]')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.pane).join('|'));
      const STEPS = ['포스터', '장부', '클락', '순위', '정산', '요약'];
      for (const label of [...STEPS, ...STEPS]) {
        moves.push(await pressAndMeasure(page, cdp, shots, w, mobile, `${label}`, () => page.evaluate(([l, nav]) => {
          const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-rail] button')].find((x) => x.offsetParent !== null && (x.textContent ?? '').replace(/\s+/g, '').includes(l));
          const rail = b?.closest<HTMLElement>('[data-mystore-rail]');
          if (!b || !rail) return null;
          b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          rail.setAttribute('data-probe-row', '단계 레일');
          const n = document.querySelector<HTMLElement>(nav); const nq = n?.getBoundingClientRect();
          const rows = [(() => { const q = rail.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; })()];
          if (n && nq && nq.height > 0 && nq.top < innerHeight) { n.setAttribute('data-probe-row', '하단바'); rows.push({ x: nq.left, y: nq.top, w: nq.width, h: Math.min(nq.height, innerHeight - nq.top) }); }
          const r = b.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, rows,
            before: [...document.querySelectorAll<HTMLElement>('[data-mystore-secpanel] [data-pane]')].filter((e) => e.style.display !== 'none').map((e) => e.dataset.pane).join('|') };
        }, [label, NAV] as const), shownPanes));
        await page.waitForTimeout(300);
      }
      await cdp.send('Page.stopScreencast').catch(() => {});
      expect(moves).toHaveLength(12);
      judge(moves, `내 매장 단계 ${w}`);
    });
  }
});

