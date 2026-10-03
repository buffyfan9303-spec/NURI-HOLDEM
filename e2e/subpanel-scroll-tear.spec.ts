// 하위 탭 판 교체 중 '판 밖은 새 스크롤, 판 안은 옛 그림' 찢김 게이트(design-reviewer 2026-09-28 결함 2 · root-cause 실측).
//
// 원인(root-cause-debugger · 운영 빌드 HEAD 5db640b8 · PC 1280 · 목킹 업주):
//   떠나는 판 복제본(handOffSubPanel)의 자리는 rAF 로 잰 scrollY(yLast)로 정한다. 그런데 P2 정렬(alignSubTabPanel)이
//   **같은 프레임의 뒤쪽 rAF** 에서 창을 올리고(사이드바를 가로 레일로 보고 밑변 기준 → 문서 맨 위 0 까지), 사이드바 이동은
//   startTransition 이라 커밋이 다음 rAF 전에 오면 yLast 가 옛 값이다 → 복제본은 옛 뷰포트(scroll 300) 자리,
//   판 밖(배너·레벨바·사이드바 열)은 scroll 0 자리 → 페이드 240ms(+첫 방문 대기) 동안 300px 찢김.
// 이 스펙: 스크롤 300·1500 × 출발 판(매장 설정·내 캘린더)에서 사이드바로 직원 관리에 간다. 복제본이 보이는 프레임마다
//   (a) 판 밖 — 화면 점 격자(40×24px)에서 복제본이 덮지 않은 점의 **실제로 칠하는 비고정 요소**가 직전 페인트 프레임과 같은 요소·같은 윗변(±2px).
//       사라짐·바뀜도 센다(design-reviewer 2026-10-03 제안). 종전 표지(판 줄 바로 위 블록 하나)는 E3 뒤 목킹 업주에게 없어 아무것도 재지 못했다.
//   (b) 판 안 — 복제본 첫 프레임의 **글자 칸** 윗변 == 직전 페인트된 원본의 같은 글자 칸(2026-10-03). 상자 윗변으로 재면 상자는 제자리인데
//       안의 내용만 튄 것(위 껍데기의 마진 겹침 소실 +12.8px · empty:hidden 껍데기 −76px)을 못 본다.
//   (c) 복제본이 실제로 섰다(페이드가 있다 — 0 프레임이면 측정이 빈 것이라 실패)
//   음성 대조(맨 아래 테스트): 판 밖에 스크롤과 함께 움직이는 표지를 심으면 (a) 가 잡아야 한다 — (a) 가 공허하지 않다는 증명.
// 표본은 **페인트 직전**(rAF 콜백이 전부 끝난 뒤 도는 ResizeObserver) — rAF 표본은 같은 프레임 뒤쪽 rAF(P2 정렬)의 스크롤을 못 본다.
// 클릭은 실제 마우스 down→up(locator.click 은 자동 스크롤로 측정을 오염시킨다).
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures'; // 운영 쓰기 차단 가드(@playwright/test 직접 임포트 금지)
import { bootOwner, openMyStore } from './_mockOwner';

const W = 1280, H = 900;

async function side(page: Page, label: string) {
  const at = await page.evaluate((l) => {
    const b = [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')]
      .find((e) => e.getClientRects().length && (e.innerText || '').replace(/\s+/g, ' ').trim().startsWith(l));
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  expect(at, `사이드바 '${label}' 없음 — 측정이 비면 거짓 통과다`).not.toBeNull();
  await page.mouse.move(at!.x, at!.y); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
}

type P = { k: string; top: number; fixed: boolean } | 'C' | null;
type F = { o: number | null; glyph: (number | null)[]; pts: P[] };

/** 출발 판에서 스크롤 → 기록기 → 직원 관리. (a)·(b)·(c) 실패 문구와 (a) 표본 수를 돌려준다. */
async function round(page: Page, from: string, scroll: number, r: number, plant: boolean) {
  await side(page, from);
  await page.waitForTimeout(1500);
  const y0 = await page.evaluate((y) => { scrollTo({ top: Math.min(y, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' as ScrollBehavior }); return scrollY; }, scroll);
  expect(y0, `${from}: 출발 판이 스크롤되지 않았다(측정이 비면 거짓 통과)`).toBeGreaterThan(200);
  // 음성 대조 표지 — 판 밖(사이드바 열)에 문서와 함께 움직이는 빨간 칸. P2 정렬이 창을 올리면 같이 움직여 (a) 에 잡혀야 한다.
  await page.evaluate(([y, on]) => { document.getElementById('tear-plant')?.remove(); if (!on) return; const d = document.createElement('div'); d.id = 'tear-plant'; d.style.cssText = `position:absolute;left:20px;top:${y + 420}px;width:180px;height:200px;background:#f00;z-index:20`; document.body.appendChild(d); }, [y0, plant] as [number, boolean]);
  await page.waitForTimeout(400);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: r % 2 ? 1 : 2 });
  await page.evaluate(() => {
    const g = window as unknown as { __f: F[] };
    const t0 = performance.now(); g.__f = [];
    const own = (e: Element) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
    const isFixed = (e: Element) => { for (let x: Element | null = e; x; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
    // (b) 기준 글자 칸 — 지금 화면에 보이는 판 안 글자(최대 8개). 복제본에서는 같은 글자 중 원래 자리에서 가장 가까운 것을 잰다.
    const refs = [...document.querySelectorAll('[data-mystore-secpanel] *')].filter((e) => { const q = e.getBoundingClientRect(); return q.height > 0 && q.top > 0 && q.bottom < innerHeight && !!own(e) && !isFixed(e); }).slice(0, 8)
      .map((e) => ({ e, t: own(e), y: e.getBoundingClientRect().top }));
    const ids = new WeakMap<Element, string>(); let nid = 0;
    const key = (e: Element) => { let k = ids.get(e); if (!k) { k = `${e.tagName}#${nid++}:${(e.textContent ?? '').trim().slice(0, 12)}`; ids.set(e, k); } return k; };
    const alpha = (c: string) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 0; const v = m[1].split(/[ ,/]+/).filter(Boolean); return v.length > 3 ? parseFloat(v[3]) : 1; };
    const paints = (el: Element) => {
      if (/^(IMG|SVG|CANVAS|VIDEO|PATH|INPUT|BUTTON)$/i.test(el.tagName)) return true;
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) return true;
      const cs = getComputedStyle(el);
      return alpha(cs.backgroundColor) > 0.02 || cs.backgroundImage !== 'none' || (parseFloat(cs.borderTopWidth) > 0 && alpha(cs.borderTopColor) > 0.02) || cs.boxShadow !== 'none';
    };
    const step = () => {
      if (performance.now() - t0 > 2500) return; // 점 격자 표본은 무겁다 — 첫 방문(청크·대기)까지 담게 넉넉히
      const lv = [...document.querySelectorAll<HTMLElement>('[data-pane-leaving]')].find((e) => !e.matches('footer, .tab-pane'));
      const glyph = lv ? refs.map((s) => [...lv.querySelectorAll('*')].filter((e) => own(e) === s.t).map((e) => e.getBoundingClientRect().top).sort((a, b) => Math.abs(a - s.y) - Math.abs(b - s.y))[0] ?? null) : refs.map((s) => s.e.getBoundingClientRect().top);
      // (a) 점 격자 — 복제본(판·푸터, pointer-events:none 이라 elementFromPoint 가 꿰뚫는다)이 덮는 점은 기하로 뺀다
      const covers = [...document.querySelectorAll<HTMLElement>('[data-pane-leaving]')].filter((e) => !e.matches('.tab-pane')).map((e) => e.getBoundingClientRect());
      const pts: P[] = [];
      for (let y = 4; y < innerHeight; y += 24) for (let x = 8; x < innerWidth; x += 40) {
        // 가장자리 2px 는 덮인 것으로 본다 — 판 열 왼쪽 경계(288.4)에 걸친 격자 열(x=288)이 복제본 밖으로 잡혀 새 판 가장자리를 '찢김'으로 셌다
        if (covers.some((q) => x >= q.left - 2 && x < q.right + 2 && y >= q.top - 2 && y < q.bottom + 2)) { pts.push('C'); continue; }
        let e = document.elementFromPoint(x, y);
        while (e && e !== document.body && e !== document.documentElement && !paints(e)) e = e.parentElement; // 투명 그릇의 이동은 보이지 않는다
        if (!e || e === document.body || e === document.documentElement) { pts.push(null); continue; }
        pts.push({ k: key(e), top: Math.round(e.getBoundingClientRect().top), fixed: isFixed(e) });
      }
      g.__f.push({ o: lv ? +getComputedStyle(lv).opacity : null, glyph, pts });
    };
    const dummy = document.createElement('div');
    dummy.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(dummy);
    const ro = new ResizeObserver(step); ro.observe(dummy);
    let w = 1;
    const tick = () => { w = 3 - w; dummy.style.width = `${w}px`; if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else { ro.disconnect(); dummy.remove(); } };
    requestAnimationFrame(tick);
  });
  await side(page, '직원 관리');
  await expect(page.locator('[data-pane="staff"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2600);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  const f = await page.evaluate(() => (window as unknown as { __f: F[] }).__f);
  const id = `${scroll} ${from} r${r}`;
  const i1 = f.findIndex((x) => x.o != null);
  if (i1 < 1) return { bad: [`${id}: 복제본 없음(페이드 0 — 측정 불가)`], torn: -1, seen: 0 };
  const pre = f[i1 - 1];
  const bad: string[] = [];
  // (b)
  const ds = f[i1].glyph.map((c, i) => (c == null || pre.glyph[i] == null ? null : c - pre.glyph[i]!)).filter((d): d is number => d != null);
  if (!ds.length) bad.push(`${id}: 복제본에서 기준 글자 칸을 못 찾았다(측정 불가)`);
  else { const worst = ds.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0); if (Math.abs(worst) > 2) bad.push(`${id}: 판 안 글자가 튐 ${Math.round(worst)}px`); }
  // (a)
  let torn = 0, seen = 0; const ex: string[] = [];
  for (const x of f.slice(i1).filter((y) => y.o != null && y.o > 0.05)) {
    x.pts.forEach((p, i) => {
      const q = pre.pts[i];
      if (p === 'C' || q === 'C') return;
      const qn = q && !q.fixed ? q : null; // 직전에 보이던 비고정 요소
      if (!p || p.fixed) { if (qn) { torn++; if (ex.length < 2) ex.push(`사라짐 ${qn.k}@${qn.top}`); } return; }
      seen++;
      if (!qn) { if (!q) { torn++; if (ex.length < 2) ex.push(`새로 드러남 ${p.k}@${p.top}`); } return; }
      if (qn.k !== p.k) { torn++; if (ex.length < 2) ex.push(`${qn.k}→${p.k}`); return; }
      if (Math.abs(qn.top - p.top) > 2) { torn++; if (ex.length < 2) ex.push(`${p.k} ${qn.top}→${p.top}`); }
    });
  }
  if (torn) bad.push(`${id}: 판 밖 찢김 ${torn}점(${ex.join(' | ')})`);
  return { bad, torn, seen };
}

for (const scroll of [300, 1500]) {
  for (const from of ['매장 설정', '내 캘린더']) {
    test(`PC 사이드바 ${from} → 직원 관리 — 스크롤 ${scroll} 에서 떠나는 판 복제본이 판 밖과 찢기지 않고 판 안 글자도 튀지 않는다`, async ({ page }) => {
      test.setTimeout(120_000);
      await bootOwner(page, { viewport: { width: W, height: H } });
      await openMyStore(page);
      await expect(page.locator('[data-mystore-secbar]')).toBeVisible({ timeout: 20_000 });
      const bad: string[] = []; let seen = 0;
      // 첫 바퀴는 첫 방문(대기 hold 포함), 둘째부터 재방문(커밋이 빨라 경합이 잘 난다 — 실측 CPU1 6/6)
      for (let r = 0; r < 4; r++) { const v = await round(page, from, scroll, r, false); bad.push(...v.bad); seen += v.seen; }
      // (a) 표본은 0 이 정상일 수 있다 — 1280 에서 복제본 밖에 보이는 것은 sticky 머리·사이드바뿐이다. (a) 가 공허하지 않다는 증명은 맨 아래 음성 대조가 한다.
      console.log(`[tear ${scroll} ${from}] (a) 판 밖 비고정 점 표본 ${seen}`);
      expect(bad, bad.join(' / ')).toEqual([]);
    });
  }
}

// 음성 대조 — (a) 가 실제 움직임을 잡는다(심은 표지가 매 바퀴 잡혀야 한다). 잡지 못하면 위 PASS 는 공허하다.
test('PC 사이드바 — (a) 음성 대조: 판 밖에 심은 스크롤 표지의 움직임을 잡는다', async ({ page }) => {
  test.setTimeout(120_000);
  await bootOwner(page, { viewport: { width: W, height: H } });
  await openMyStore(page);
  await expect(page.locator('[data-mystore-secbar]')).toBeVisible({ timeout: 20_000 });
  const torn: number[] = [];
  for (let r = 0; r < 3; r++) torn.push((await round(page, '매장 설정', 300, r, true)).torn);
  console.log(`[tear 음성 대조] 바퀴별 잡힌 점 ${torn.join(',')}`);
  // -1 = 그 바퀴에 복제본이 안 섰다(첫 방문 대기 등 — 위 본 게이트가 따로 실패시킨다). 복제본이 선 바퀴는 전부 잡아야 한다.
  expect(torn.filter((n) => n >= 0).length, '음성 대조에서 복제본이 선 바퀴가 없다').toBeGreaterThan(0);
  expect(torn.every((n) => n !== 0), `심은 표지를 못 잡은 바퀴가 있다(${torn.join(',')}) — (a) 가 공허하다`).toBe(true);
});
