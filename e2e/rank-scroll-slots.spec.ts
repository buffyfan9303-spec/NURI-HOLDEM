// 랭킹 진입 스크롤 유지(UI-06) · 랭킹 6메뉴 균등 슬롯/스크롤 레일(UI-07) — 실제 좌표·스크롤 실측 게이트.
//
// 왜 이 파일인가 (2026-09-13 오너 리포트 · 실행문 §4.2·§4.3·§9.3):
//   · subtab-motion.spec 은 "전환이 돈다" 만 본다 — 전환 뒤 문서가 **어디로 갔는지** 는 안 본다.
//     실측(390×844, 리드): 게시판 80px 에서 랭킹 첫 진입 → +140ms 에 scrollY 0. 헤더도 47.75→60.5 로 벌어졌다.
//     원인은 CommunityTab 의 섹션 복원이 첫 방문(저장값 없음)에 `?? 0` 으로 0 을 강제한 것.
//   · 랭킹 6메뉴 레일은 라벨 글자수를 그대로 폭으로 썼다(72.5/55.3/85.2/72.5/72.5/42.5) — 넓은 화면에도 균등 슬롯이 없고,
//     좁은 화면에서 '상점' 을 누르면 레일이 따라가지 않아 활성 탭이 화면 밖에 남았다.
//
// 이 파일이 보는 것
//   1. 첫 방문 진입: 진입 전/rAF/+140ms/+1000ms 타임라인에서 scrollY·헤더 높이·서브탭 바 y 가 2 CSS px 이내로 유지된다.
//   2. 재방문 복원: 랭킹에서 읽던 위치가 다른 섹션을 다녀와도 2px 이내로 돌아온다(13px 클램프 손실 회귀).
//   3. 짧은 섹션(별도 케이스): 유지할 수 없으면 `min(이전 Y, 새 문서 최대)` 로 **물리 클램프**되고 그 뒤 더 움직이지 않는다.
//   4. 넓은 폭: 6개 슬롯 폭 동일(±1px) · 가용 폭 채움 · 라벨 중심 = 슬롯 중심(±1px) · 밑줄 중심 = 라벨 중심(±1px) · 가로 넘침 없음.
//   5. 좁은 폭: 한 줄 스크롤 레일 — 첫/끝 메뉴가 잘리지 않고, 끝 탭을 누르면 레일(scrollLeft)만 움직여 활성 탭이 온전히 보이며
//      문서 세로 스크롤은 움직이지 않는다.
//
// 이 파일이 못 보는 것
//   · 실기기 손가락 누름(:active transform) — pill-press.spec 이 CDP 터치로 본다.
//   · 운영 DB 데이터 길이에 의존한다(게시판·랭킹 본문 높이). 전제 조건이 안 되면 skip 이 아니라 **실패**로 알린다.
//
// 음성 대조: CommunityTab.tsx 의 첫 방문 분기를 `?? 0` 으로 되돌리면 1 이 실패한다.
//            TierLeaderboard.tsx 버튼의 `flex-1 basis-0 min-w-max` 를 `shrink-0` 으로 되돌리면 4 가,
//            centerInRail 호출을 지우면 5 가 실패한다.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/rank-scroll-slots.spec.ts
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const RANK_LABELS = ['활동 순위', '입상', '명예의 전당', '국내 순위', '순위 인증', '상점'];

interface Probe { winY: number; docH: number; clientH: number; maxScroll: number; headerH: number; secbarY: number | null; railY: number | null }

function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const y = (sel: string) => { const el = document.querySelector(sel); return el ? +el.getBoundingClientRect().y.toFixed(2) : null; };
    const header = document.querySelector('[data-stack-header]');
    return {
      winY: +window.scrollY.toFixed(2),
      docH: doc.scrollHeight,
      clientH: doc.clientHeight,
      maxScroll: Math.max(0, doc.scrollHeight - doc.clientHeight),
      headerH: header ? +header.getBoundingClientRect().height.toFixed(2) : 0,
      secbarY: y('[data-community-secbar]'),
      railY: y('[data-rank-tabbar]'),
    };
  });
}

async function scrollWin(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), y);
  await page.waitForTimeout(400); // 헤더 히스테리시스(useScrollY rAF)·탭바 자동숨김이 가라앉은 뒤에 잰다
}

/** 탭 클릭 뒤 rAF · +140ms · +1000ms 세 지점의 타임라인 */
async function clickAndTimeline(page: Page, secId: string): Promise<{ raf: Probe; t140: Probe; t1000: Probe }> {
  await page.getByTestId(`sec-tab-${secId}`).first().click();
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
  const raf = await probe(page);
  await page.waitForTimeout(140);
  const t140 = await probe(page);
  await page.waitForTimeout(860);
  const t1000 = await probe(page);
  return { raf, t140, t1000 };
}

async function openCommunity(page: Page): Promise<void> {
  await stabilizeBackstack(page);
  await page.goto('/');
  // 모바일은 하단 탭바 button, PC(lg↑)는 GNB 의 role=tab — 둘 중 보이는 쪽을 누른다.
  const mobileTab = page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first();
  const pcTab = page.getByRole('tab', { name: '커뮤니티', exact: true }).first();
  await expect(mobileTab.or(pcTab).first()).toBeVisible({ timeout: 20_000 });
  await dismissOverlays(page);
  if (await pcTab.isVisible()) await pcTab.click(); else await mobileTab.click();
  await expect(page.locator('[data-community-secbar]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
}

/** 게시판(긴 목록)으로 가서 y 까지 내린다. 문서가 그만큼 없으면 **실패**로 알린다(skip 은 결함을 숨긴다). */
async function gotoBoardAt(page: Page, y: number): Promise<Probe> {
  await page.getByRole('button', { name: '게시판', exact: true }).first().click();
  await page.waitForTimeout(1200);
  const p0 = await probe(page);
  expect(p0.maxScroll, `전제 조건: 게시판 문서 최대 스크롤(${p0.maxScroll}px)이 ${y}px 보다 작다 — 이 데이터로는 유지 검사를 할 수 없다`).toBeGreaterThanOrEqual(y);
  await scrollWin(page, y);
  return probe(page);
}

const fmt = (p: Probe) => `winY=${p.winY} headerH=${p.headerH} secbarY=${p.secbarY} railY=${p.railY} docH=${p.docH} max=${p.maxScroll}`;

test.describe('UI-06 랭킹 진입 — 문서·헤더가 움직이지 않는다 (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('🔴 첫 방문: 게시판 80px 에서 랭킹을 눌러도 scrollY·헤더·서브탭 바가 2px 이내', async ({ page }) => {
    await openCommunity(page);
    const before = await gotoBoardAt(page, 80);
    const { raf, t140, t1000 } = await clickAndTimeline(page, 'rank');
    const log = `\n  진입 전 ${fmt(before)}\n  rAF     ${fmt(raf)}\n  +140ms  ${fmt(t140)}\n  +1000ms ${fmt(t1000)}`;
    for (const [name, p] of [['rAF', raf], ['+140ms', t140], ['+1000ms', t1000]] as const) {
      expect(Math.abs(p.winY - before.winY), `${name}: scrollY 가 ${before.winY} → ${p.winY} 로 움직였다(첫 방문 0 강제 회귀)${log}`).toBeLessThanOrEqual(2);
      expect(Math.abs(p.headerH - before.headerH), `${name}: 헤더 높이가 ${before.headerH} → ${p.headerH} 로 바뀌었다(히스테리시스가 풀림)${log}`).toBeLessThanOrEqual(2);
      expect(Math.abs((p.secbarY ?? 0) - (before.secbarY ?? 0)), `${name}: 서브탭 바 y 가 ${before.secbarY} → ${p.secbarY}${log}`).toBeLessThanOrEqual(2);
    }
    expect(t1000.railY, '랭킹 세부 탭 바가 렌더되지 않았다').not.toBeNull();
  });

  test('🔴 재방문: 랭킹에서 읽던 위치가 다른 섹션을 다녀와도 2px 이내로 복원된다', async ({ page }) => {
    await openCommunity(page);
    // 게시판은 30(헤더 펼침), 랭킹은 120(헤더 접힘) — 두 저장값의 헤더 상태가 다르게 만든다. 복원 직후 App 히스테리시스가
    // 헤더를 뒤집고 스크롤 앵커링이 그 높이 차(12.75)만큼 문서를 되밀므로, 보정(lib/headerShrink.restoreScrollTop)이 없으면
    // 게시판은 30→42.75, 랭킹은 107→94 에 선다(2026-09-13 실측). 저장·복원의 기준은 scrollTo 값이 아니라 **정착값**이다.
    const boardAt = await gotoBoardAt(page, 30);
    await page.getByTestId('sec-tab-rank').first().click();
    await page.waitForTimeout(1500); // 첫 조회·스켈레톤 교체가 끝난 뒤 읽던 위치를 만든다
    const r0 = await probe(page);
    const target = Math.min(120, r0.maxScroll);
    expect(target, `전제 조건: 랭킹 문서 최대 스크롤(${r0.maxScroll}px)이 너무 짧다`).toBeGreaterThanOrEqual(60);
    await scrollWin(page, target);
    const atRank = await probe(page);

    const board = await clickAndTimeline(page, 'board');
    expect(Math.abs(board.t1000.winY - boardAt.winY), `게시판 저장 위치(${boardAt.winY}) 복원 실패: ${fmt(board.t1000)}`).toBeLessThanOrEqual(2);

    const back = await clickAndTimeline(page, 'rank');
    const log = `\n  랭킹 읽던 위치 ${fmt(atRank)}\n  게시판 복귀    ${fmt(board.t1000)}\n  랭킹 +140ms    ${fmt(back.t140)}\n  랭킹 +1000ms   ${fmt(back.t1000)}`;
    expect(Math.abs(back.t140.winY - atRank.winY), `+140ms 복원 오차 ${Math.abs(back.t140.winY - atRank.winY)}px${log}`).toBeLessThanOrEqual(2);
    expect(Math.abs(back.t1000.winY - atRank.winY), `+1000ms 복원 오차 ${Math.abs(back.t1000.winY - atRank.winY)}px (복원 순간 문서 높이 클램프 회귀)${log}`).toBeLessThanOrEqual(2);
  });

  test('짧은 섹션(별도 케이스): 유지할 수 없으면 새 문서 최대로 클램프되고 그 뒤 더 움직이지 않는다', async ({ page }) => {
    await openCommunity(page);
    const p0 = await probe(page);
    const before = await gotoBoardAt(page, Math.min(300, p0.maxScroll > 300 ? 300 : 80));
    const { t140, t1000 } = await clickAndTimeline(page, 'dealer'); // 첫 방문 · 길이는 데이터에 따라 다르다
    const log = `\n  진입 전 ${fmt(before)}\n  +140ms  ${fmt(t140)}\n  +1000ms ${fmt(t1000)}`;
    // 기대값은 '이전 Y' 가 아니라 '이전 Y 와 새 문서 최대 중 작은 쪽' — 짧으면 물리 클램프가 정답이고 그것을 숨기지 않는다.
    expect(Math.abs(t1000.winY - Math.min(before.winY, t1000.maxScroll)), `클램프 기대값 ${Math.min(before.winY, t1000.maxScroll)} 과 다르다${log}`).toBeLessThanOrEqual(2);
    expect(Math.abs(t1000.winY - t140.winY), `+140ms 뒤에도 문서가 더 움직였다(보정 타이머·반복 스크롤 의심)${log}`).toBeLessThanOrEqual(2);
  });
});

// ── UI-07 ─────────────────────────────────────────────────────────────────────
interface Btn { label: string; x: number; w: number; cx: number; sx: number; sw: number; scx: number; active: boolean }
interface Rail { left: number; right: number; clientW: number; scrollW: number; scrollLeft: number; padL: number; padR: number; gap: number; btns: Btn[]; pill: { cx: number; w: number; opacity: string } | null; winY: number }

function railGeom(page: Page): Promise<Rail> {
  return page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('[data-rank-tabbar]')!;
    const rr = rail.getBoundingClientRect();
    const cs = getComputedStyle(rail);
    const btns = Array.from(rail.querySelectorAll<HTMLButtonElement>('button')).map((b) => {
      const br = b.getBoundingClientRect();
      const s = b.querySelector<HTMLElement>('span')!;
      const sr = s.getBoundingClientRect();
      return { label: (s.textContent ?? '').trim(), x: +br.left.toFixed(2), w: +br.width.toFixed(2), cx: +(br.left + br.width / 2).toFixed(2),
        sx: +sr.left.toFixed(2), sw: +sr.width.toFixed(2), scx: +(sr.left + sr.width / 2).toFixed(2), active: s.hasAttribute('data-pill-active') };
    });
    const pillEl = rail.querySelector<HTMLElement>('[data-sliding-pill]');
    const pr = pillEl?.getBoundingClientRect();
    return {
      left: +rr.left.toFixed(2), right: +rr.right.toFixed(2), clientW: rail.clientWidth, scrollW: rail.scrollWidth, scrollLeft: rail.scrollLeft,
      padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight), gap: parseFloat(cs.columnGap) || 0,
      btns, pill: pr && pillEl ? { cx: +(pr.left + pr.width / 2).toFixed(2), w: +pr.width.toFixed(2), opacity: getComputedStyle(pillEl).opacity } : null,
      winY: +window.scrollY.toFixed(2),
    };
  });
}

async function openRank(page: Page): Promise<void> {
  await openCommunity(page);
  await page.getByTestId('sec-tab-rank').first().click();
  await expect(page.locator('[data-rank-tabbar]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
}

function expectLabelsCentered(g: Rail) {
  expect(g.btns.map((b) => b.label), '랭킹 6메뉴 라벨·순서가 다르다').toEqual(RANK_LABELS);
  for (const b of g.btns) {
    expect(Math.abs(b.scx - b.cx), `'${b.label}' 라벨 중심 ${b.scx} ≠ 슬롯 중심 ${b.cx}`).toBeLessThanOrEqual(1);
  }
}

function expectPillOnActive(g: Rail) {
  const active = g.btns.find((b) => b.active)!;
  expect(active, '활성 탭이 없다').toBeTruthy();
  expect(g.pill, '밑줄(SlidingPill)이 없다').not.toBeNull();
  expect(g.pill!.opacity, '밑줄이 숨겨져 있다').toBe('1');
  expect(Math.abs(g.pill!.cx - active.scx), `밑줄 중심 ${g.pill!.cx} ≠ '${active.label}' 라벨 중심 ${active.scx}`).toBeLessThanOrEqual(1);
}

for (const width of [768, 1280, 1440]) {
  test.describe(`UI-07 넓은 폭 ${width}px — 6개 균등 슬롯`, () => {
    test.use({ viewport: { width, height: 900 }, isMobile: false, hasTouch: false });

    test(`🔴 ${width}px: 슬롯 폭 동일·가용 폭 채움·라벨/밑줄 중심 일치·가로 넘침 없음`, async ({ page }) => {
      await openRank(page);
      let g = await railGeom(page);
      const ws = g.btns.map((b) => b.w);
      const dump = `\n  rail clientW=${g.clientW} scrollW=${g.scrollW} pad=${g.padL}/${g.padR} gap=${g.gap}\n  ` + g.btns.map((b) => `${b.label}:w=${b.w} cx=${b.cx} scx=${b.scx}`).join(' | ');
      expect(Math.max(...ws) - Math.min(...ws), `슬롯 폭이 균등하지 않다(최대-최소)${dump}`).toBeLessThanOrEqual(1);
      const filled = ws.reduce((a, b) => a + b, 0) + g.gap * (ws.length - 1);
      expect(Math.abs(filled - (g.clientW - g.padL - g.padR)), `슬롯 합이 가용 폭을 채우지 않는다: ${filled} vs ${g.clientW - g.padL - g.padR}${dump}`).toBeLessThanOrEqual(2);
      expect(g.scrollW, `레일이 가로로 넘친다${dump}`).toBeLessThanOrEqual(g.clientW + 1);
      expectLabelsCentered(g);
      expectPillOnActive(g);

      // 다른 탭으로 옮긴 뒤에도 밑줄이 그 라벨 중심에 선다(균등 슬롯으로 바꾸며 offsetParent 측정 전제가 깨지지 않았는지)
      await page.getByRole('button', { name: '명예의 전당', exact: true }).click();
      await page.waitForTimeout(900);
      g = await railGeom(page);
      expect(g.btns.find((b) => b.active)?.label).toBe('명예의 전당');
      expectPillOnActive(g);
    });
  });
}

for (const width of [320, 360, 390, 412, 430]) {
  test.describe(`UI-07 좁은 폭 ${width}px — 한 줄 스크롤 레일`, () => {
    test.use({ viewport: { width, height: 844 } });

    test(`🔴 ${width}px: 첫/끝 메뉴 완전 노출 · 끝 탭 클릭 시 레일만 따라간다`, async ({ page }) => {
      await openRank(page);
      let g = await railGeom(page);
      const dump = () => `\n  rail L=${g.left} R=${g.right} clientW=${g.clientW} scrollW=${g.scrollW} scrollLeft=${g.scrollLeft}\n  ` + g.btns.map((b) => `${b.label}:x=${b.x} w=${b.w}`).join(' | ');
      expectLabelsCentered(g);
      expectPillOnActive(g);
      const first = g.btns[0]; const last = g.btns[g.btns.length - 1];
      // 첫 메뉴: 초기 상태에서 왼쪽이 잘리지 않는다(overflow 를 center 정렬한 구현이면 여기서 깨진다)
      expect(first.x, `첫 메뉴 '${first.label}' 왼쪽이 레일 밖이다${dump()}`).toBeGreaterThanOrEqual(g.left - 0.5);
      expect(first.x + first.w, `첫 메뉴 '${first.label}' 오른쪽이 잘린다${dump()}`).toBeLessThanOrEqual(g.right + 0.5);

      if (g.scrollW > g.clientW + 1) {
        // 넘치는 레일: 끝까지 밀면 마지막 메뉴가 온전히 보인다
        await page.evaluate(() => { const r = document.querySelector<HTMLElement>('[data-rank-tabbar]')!; r.scrollLeft = r.scrollWidth; });
        await page.waitForTimeout(200);
        g = await railGeom(page);
        const l2 = g.btns[g.btns.length - 1];
        expect(l2.x + l2.w, `끝 메뉴 '${l2.label}' 오른쪽이 잘린다${dump()}`).toBeLessThanOrEqual(g.right + 0.5);
        expect(l2.x, `끝 메뉴 '${l2.label}' 왼쪽이 레일 밖이다${dump()}`).toBeGreaterThanOrEqual(g.left - 0.5);
        await page.evaluate(() => { document.querySelector<HTMLElement>('[data-rank-tabbar]')!.scrollLeft = 0; });
        await page.waitForTimeout(200);
      } else {
        const ws = g.btns.map((b) => b.w);
        expect(Math.max(...ws) - Math.min(...ws), `넘치지 않는데 슬롯 폭이 균등하지 않다${dump()}`).toBeLessThanOrEqual(1);
      }

      // 끝 탭 클릭 → 레일(scrollLeft)만 움직여 활성 탭이 온전히 보이고, 문서 세로 스크롤은 그대로
      const y0 = (await railGeom(page)).winY;
      // ⚠ Playwright 의 locator.click() 은 누르기 전에 대상을 **스스로 스크롤해 보이게** 만든다(scrollIntoViewIfNeeded) —
      //    그러면 앱이 레일을 따라오게 하는지 검사할 수 없다(수정 전에도 통과했다). DOM click() 은 스크롤하지 않는다.
      await page.evaluate((label) => {
        const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-rank-tabbar] button')).find((b) => (b.textContent ?? '').trim() === label);
        if (!btn) throw new Error(`'${label}' 버튼이 없다`);
        btn.click();
      }, last.label);
      await page.waitForTimeout(900);
      g = await railGeom(page);
      const act = g.btns.find((b) => b.active)!;
      expect(act.label).toBe(last.label);
      expect(act.x, `활성 탭 '${act.label}' 왼쪽이 레일 밖이다${dump()}`).toBeGreaterThanOrEqual(g.left - 0.5);
      expect(act.x + act.w, `활성 탭 '${act.label}' 오른쪽이 잘린다 — 레일이 따라오지 않았다${dump()}`).toBeLessThanOrEqual(g.right + 0.5);
      expectPillOnActive(g);
      expect(Math.abs(g.winY - y0), `끝 탭 클릭이 문서 세로 스크롤을 ${y0} → ${g.winY} 로 움직였다(scrollIntoView 류)`).toBeLessThanOrEqual(2);
    });
  });
}
