// 하위 탭 판 교체 중 '판 밖은 새 스크롤, 판 안은 옛 그림' 찢김 게이트(design-reviewer 2026-09-28 결함 2 · root-cause 실측).
//
// 원인(root-cause-debugger · 운영 빌드 HEAD 5db640b8 · PC 1280 · 목킹 업주):
//   떠나는 판 복제본(handOffSubPanel)의 자리는 rAF 로 잰 scrollY(yLast)로 정한다. 그런데 P2 정렬(alignSubTabPanel)이
//   **같은 프레임의 뒤쪽 rAF** 에서 창을 올리고(사이드바를 가로 레일로 보고 밑변 기준 → 문서 맨 위 0 까지), 사이드바 이동은
//   startTransition 이라 커밋이 다음 rAF 전에 오면 yLast 가 옛 값이다 → 복제본은 옛 뷰포트(scroll 300) 자리,
//   판 밖(배너·레벨바·사이드바 열)은 scroll 0 자리 → 페이드 240ms(+첫 방문 대기) 동안 300px 찢김.
// 이 스펙: 스크롤 300·1500 에서 사이드바 이동을 여러 번 하고, 복제본이 보이는 모든 프레임에서
//   (a) 판 밖 비고정 표지(판 줄 바로 위 블록)가 **보이면** 그 이동량 == 복제본 이동량(같은 페이지처럼 움직인다)
//   (b) 복제본 첫 프레임 윗변 == 직전 **페인트된** 판 윗변(옛 그림이 되돌아가거나 튀지 않는다 — 표본은 ResizeObserver 로 페인트 직전에)
//   (c) 복제본이 실제로 섰다(페이드가 있다 — 0 프레임이면 측정이 빈 것이라 실패)
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

type F = { t: number; o: number | null; clone: number | null; root: number; aTop: number; aVis: boolean };

for (const scroll of [300, 1500]) {
  test(`PC 사이드바 이동 — 스크롤 ${scroll} 에서 떠나는 판 복제본이 판 밖과 찢기지 않는다`, async ({ page }) => {
    test.setTimeout(90_000);
    await bootOwner(page, { viewport: { width: W, height: H } });
    await openMyStore(page);
    await expect(page.locator('[data-mystore-secbar]')).toBeVisible({ timeout: 20_000 });
    const cdp = await page.context().newCDPSession(page);
    const bad: string[] = [];
    // 첫 바퀴는 첫 방문(대기 hold 포함), 둘째부터 재방문(커밋이 빨라 경합이 잘 난다 — 실측 CPU1 6/6)
    for (let round = 0; round < 4; round++) {
      // 출발 판 = 매장 설정(목킹 업주에서 스크롤 여유 ~2800px 인 유일한 판 — 2026-09-28 실측), 목적지 = 직원 관리(짧은 판)
      await side(page, '매장 설정');
      await page.waitForTimeout(1500);
      const y0 = await page.evaluate((y) => { scrollTo({ top: Math.min(y, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' as ScrollBehavior }); return scrollY; }, scroll);
      expect(y0, '출발 판이 짧아 스크롤 전제가 안 선다(측정이 비면 거짓 통과)').toBeGreaterThanOrEqual(scroll - 1);
      await page.waitForTimeout(400);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: round % 2 ? 1 : 2 });
      await page.evaluate(() => {
        const g = window as unknown as { __f: F[] };
        const t0 = performance.now(); g.__f = [];
        const row = document.querySelector('[data-mystore-secpanel]')!.parentElement!;
        const anchor = (row.previousElementSibling ?? row.parentElement!.firstElementChild) as HTMLElement;
        const vis = () => { const q = anchor.getBoundingClientRect(); const x = q.left + 20; for (let y = Math.max(0, q.top + 2); y < Math.min(innerHeight, q.bottom - 2); y += 8) { const e = document.elementFromPoint(x, y); if (e && anchor.contains(e)) return true; } return false; };
        const step = () => {
          const t = performance.now() - t0;
          const root = document.querySelector('[data-mystore-secpanel]')!;
          const lv = [...document.querySelectorAll<HTMLElement>('[data-pane-leaving]')].find((e) => !e.matches('footer, .tab-pane'));
          g.__f.push({ t, o: lv ? +getComputedStyle(lv).opacity : null, clone: lv ? lv.getBoundingClientRect().top : null, root: root.getBoundingClientRect().top, aTop: anchor.getBoundingClientRect().top, aVis: vis() });
        };
        // ⚠ 표본은 **페인트 직전**에 뜬다 — rAF 콜백이 전부 끝난 뒤 도는 ResizeObserver. rAF 표본은 같은 프레임의 뒤쪽 rAF(P2 정렬)가
        //   바꾼 스크롤을 못 봐, '정렬된 채 페인트 → 복제본이 옛 자리로 되돌아감(161px)' 을 놓쳤다(세로 레일만 고친 사본이 rAF 표본에선 통과).
        const dummy = document.createElement('div');
        dummy.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.appendChild(dummy);
        const ro = new ResizeObserver(step); ro.observe(dummy);
        let w = 1;
        const tick = () => { w = 3 - w; dummy.style.width = `${w}px`; if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else { ro.disconnect(); dummy.remove(); } };
        requestAnimationFrame(tick);
      });
      await side(page, '직원 관리');
      await expect(page.locator('[data-pane="staff"]')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1300);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const f = await page.evaluate(() => (window as unknown as { __f: F[] }).__f);
      const i1 = f.findIndex((x) => x.o != null);
      if (i1 < 1) { bad.push(`r${round}: 복제본 없음(페이드 0 — 측정 불가)`); continue; }
      const pre = f[i1 - 1];
      const back = f[i1].clone! - pre.root;
      if (Math.abs(back) > 2) bad.push(`r${round}: 옛 그림 튐 ${Math.round(back)}px`);
      const torn = f.slice(i1).filter((x) => x.o != null && x.o > 0.05 && x.aVis && Math.abs((x.aTop - pre.aTop) - (x.clone! - pre.root)) > 2);
      if (torn.length) bad.push(`r${round}: 찢김 ${torn.length}프레임 · 판 밖 ${Math.round(torn[0].aTop - pre.aTop)}px vs 복제본 ${Math.round(torn[0].clone! - pre.root)}px`);
    }
    expect(bad, bad.join(' / ')).toEqual([]);
  });
}
