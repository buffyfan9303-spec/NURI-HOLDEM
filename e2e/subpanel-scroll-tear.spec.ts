// 하위 탭 판 교체 중 '판 밖은 새 스크롤, 판 안은 옛 그림' 찢김 게이트(design-reviewer 2026-09-28 결함 2 · root-cause 실측).
//
// 옛 원인: 떠나는 판 복제본(handOffSubPanel)이 옛 뷰포트 자리에 240ms 남는 동안, 판 밖(배너·레벨바·사이드바 열)은 P2 정렬로
//   새 스크롤 자리에 그려져 최대 300px 찢겼다. 복제본 자리 보정·글자 칸 기준점·점 격자 판정으로 그 부류를 막아 왔다.
// 🔵 2026-10-08 8차 INSTANT-SWAP — 복제본 자체를 걷었다(src/lib/tabCover.ts 8차 절. 오너: "블러 처리되며 이동, 뒤에 살짝 네모칸").
//   찢김의 한쪽(옛 그림)이 없어졌으므로 이 부류는 생길 수 없다. 이 스펙은 같은 경로(PC 1280 · 목킹 업주 · 스크롤 300·1500 ·
//   출발 판 2종 · 4바퀴 · CPU 4배)에서 **복제본이 한 프레임도 서지 않고** 목적지 판이 첫 프레임 몇 장 안에 보이는지만 잰다.
//   (옛 점 격자 판정은 git 이력에 있다 — 복제본을 되살리면 함께 되살려라.)
// 음성 대조(2026-10-08 실행): 옛 tabCover.ts(복제본 있음) 빌드에서는 바퀴마다 '복제본 n프레임' 으로 빨개진다.
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

/** 출발 판에서 스크롤 → 기록기 → 직원 관리. 복제본이 선 프레임 수와 표본 프레임 수를 돌려준다. */
async function round(page: Page, from: string, scroll: number) {
  await side(page, from);
  await page.waitForTimeout(1500);
  await page.evaluate((y) => { scrollTo({ top: Math.min(y, document.documentElement.scrollHeight - innerHeight), behavior: 'instant' as ScrollBehavior }); }, scroll);
  await page.waitForTimeout(300);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const g = window as unknown as { __r: { n: number; clone: number } };
    g.__r = { n: 0, clone: 0 };
    const t0 = performance.now();
    const tick = () => {
      g.__r.n++;
      const big = [...document.querySelectorAll<HTMLElement>('[data-pane-leaving], [inert][aria-hidden="true"]')].some((e) => {
        if (getComputedStyle(e).position !== 'fixed') return false;
        const r = e.getBoundingClientRect();
        return r.width * Math.min(r.height, innerHeight) > innerWidth * innerHeight * 0.1;
      });
      if (big) g.__r.clone++;
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await side(page, '직원 관리');
  await expect(page.locator('[data-pane="staff"]')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1600);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  return page.evaluate(() => (window as unknown as { __r: { n: number; clone: number } }).__r);
}

for (const scroll of [300, 1500]) {
  for (const from of ['매장 설정', '내 캘린더']) {
    test(`PC 사이드바 ${from} → 직원 관리 — 스크롤 ${scroll} 에서 떠나는 판 복제본이 서지 않는다(한 프레임 교체)`, async ({ page }) => {
      test.setTimeout(120_000);
      await bootOwner(page, { viewport: { width: W, height: H } });
      await openMyStore(page);
      await expect(page.locator('[data-mystore-secbar]')).toBeVisible({ timeout: 20_000 });
      const bad: string[] = [];
      for (let r = 0; r < 4; r++) {
        const v = await round(page, from, scroll);
        expect(v.n, '표본 프레임이 너무 적다(측정 공허)').toBeGreaterThanOrEqual(10);
        if (v.clone) bad.push(`r${r}: 복제본 ${v.clone}프레임`);
      }
      expect(bad, bad.join(' / ')).toEqual([]);
    });
  }
}
