// 내 매장 모바일 — '장부 시작' 막대가 입력칸을 덮지 않는가 · 단계 레일에 스크롤바가 없는가(오너 2026-09-25 실기기).
//
// 1) 장부 미시작 → '장부 시작 설정' 폼. 모바일에서 실행 버튼 막대가 `sticky bottom-[--tabbar-safe]` 라
//    스크롤 내내 화면 아래쪽(탭바 위)에 떠서 담당 직원 칩·입력칸·'지난 게임 그대로 열기' 카드를 덮었다.
//    → 모바일(<1024, 하단 탭바가 있는 폭)은 폼 끝의 일반 버튼으로 둔다. PC(lg+)는 종전 sticky bottom-0.
// 2) 단계 레일(overflow-x-auto)은 overflow-y 도 auto 가 되고, 칸 누름 확장(±8px)이 레일 히트 자리(±6.375px)를
//    넘어 **세로로 1~2px 넘쳐** 오른쪽 끝에 세로 스크롤바가 그려졌다.
// ⚠ 목킹 업주(e2e/_mockOwner) — 배치 계약 전용. 가상 키보드·주소창 접힘(dvh)은 이 하네스가 재현하지 못한다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

const RAIL = '[data-mystore-rail]';

async function openLedgerForm(page: Page, w: number, h: number) {
  await bootOwner(page, { viewport: { width: w, height: h } });
  await openMyStore(page);
  await expect(page.locator(RAIL), '목킹 업주로 내 매장 단계 바를 열지 못했다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(`${sel} button`)].find((b) => b.textContent?.trim() === '장부')?.click(), RAIL);
  await page.waitForTimeout(2000);
  const today = page.getByRole('button', { name: /오늘 장부/ }).first();
  if (await today.isVisible().catch(() => false)) await today.evaluate((b) => (b as HTMLElement).click());
  await expect(page.getByRole('button', { name: '장부 시작', exact: true }), '장부 시작 설정 폼이 안 열렸다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

/** 막대(실행 버튼의 부모)가 막대 밖 컨트롤을 덮는 넓이(px²) 합 — 화면에 보이는 부분만. */
const coverAt = (page: Page, where: 'top' | 'mid' | 'end') => page.evaluate((wh) => {
  const bar = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '장부 시작')!.parentElement!;
  const form = bar.parentElement!;
  const fr = form.getBoundingClientRect();
  const y = scrollY + fr.top;
  const target = wh === 'top' ? y - 80 : wh === 'mid' ? y + fr.height / 2 - innerHeight / 2 : document.documentElement.scrollHeight;
  window.scrollTo(0, Math.max(0, target));
  const b = bar.getBoundingClientRect();
  let area = 0; const hits: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('input,select,textarea,button,[role=button]')) {
    if (bar.contains(el) || !el.offsetParent) continue;
    let fixed = false; for (let p: HTMLElement | null = el; p; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') { fixed = true; break; }
    if (fixed) continue; // 하단 탭바·FAB 등은 막대 문제와 무관
    const r = el.getBoundingClientRect();
    const ix = Math.min(r.right, b.right) - Math.max(r.left, b.left), iy = Math.min(r.bottom, b.bottom, innerHeight) - Math.max(r.top, b.top, 0);
    if (ix > 0.5 && iy > 0.5) { area += ix * iy; hits.push(`${el.tagName}:${(el.textContent || (el as HTMLInputElement).placeholder || '').trim().slice(0, 12)} ${ix.toFixed(0)}×${iy.toFixed(0)}`); }
  }
  return { scrollY: Math.round(scrollY), barTop: Math.round(b.top), barPos: getComputedStyle(bar).position, area: Math.round(area), hits: hits.slice(0, 6) };
}, where);

test.describe('내 매장 모바일 — 장부 시작 막대 · 레일 스크롤바', () => {
  for (const [W, H] of [[360, 780], [390, 844], [412, 915]] as const) {
    test(`${W}px — 장부 시작 막대가 스크롤 0·중간·끝에서 입력칸을 덮지 않고, 레일은 스크롤바가 없다`, async ({ page }) => {
      test.setTimeout(120_000);
      await openLedgerForm(page, W, H);
      for (const wh of ['top', 'mid', 'end'] as const) {
        await page.waitForTimeout(250);
        const m = await coverAt(page, wh);
        console.log(`[bar ${W} ${wh}]`, JSON.stringify(m));
        expect.soft(m.area, `${wh}: 장부 시작 막대(${m.barPos}, top ${m.barTop}, scrollY ${m.scrollY})가 컨트롤을 덮는다 ${m.hits.join(' | ')}`).toBe(0);
      }
      // 끝까지 내리면 실행 버튼은 여전히 누를 수 있다(탭바에 안 가린다) — 기능 보존
      const btn = page.getByRole('button', { name: '장부 시작', exact: true });
      await btn.evaluate((b) => b.scrollIntoView({ block: 'center' }));
      const hitOk = await btn.evaluate((b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && (e === b || b.contains(e)); });
      expect(hitOk, '장부 시작 버튼 중심을 다른 요소가 가로챈다').toBe(true);

      const rail = await page.evaluate((sel) => {
        const r = document.querySelector<HTMLElement>(sel)!; const cs = getComputedStyle(r);
        return { sh: r.scrollHeight, ch: r.clientHeight, oy: cs.overflowY, sw: r.scrollWidth, cw: r.clientWidth, barW: r.offsetWidth - r.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) };
      }, RAIL);
      console.log(`[rail ${W}]`, JSON.stringify(rail));
      expect(rail.sw, '레일이 가로로 넘친다(7칸 한 줄 계약)').toBeLessThanOrEqual(rail.cw);
      expect.soft(rail.barW, `레일에 세로 스크롤바 폭 ${rail.barW}px 이 그려진다`).toBe(0);
      expect.soft(rail.oy === 'hidden' || rail.sh <= rail.ch, `레일이 세로로 스크롤된다(overflow-y ${rail.oy}, ${rail.sh}>${rail.ch})`).toBe(true);
    });
  }

  test('1440 — PC 는 종전 sticky 하단 고정 그대로', async ({ page }) => {
    test.setTimeout(120_000);
    await openLedgerForm(page, 1440, 900);
    const pos = await page.evaluate(() => getComputedStyle([...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '장부 시작')!.parentElement!).position);
    expect(pos, 'PC 의 장부 시작 막대가 sticky 가 아니다 — 모바일 처방이 샜다').toBe('sticky');
    // PC 레일도 같은 overflow-x-auto 라 세로 넘침이 있으면 Windows 크롬에서 클래식 스크롤바(폭 차지)가 그려진다
    const rail = await page.evaluate((sel) => { const r = document.querySelector<HTMLElement>(sel)!; return { sh: r.scrollHeight, ch: r.clientHeight, oy: getComputedStyle(r).overflowY }; }, RAIL);
    console.log('[rail 1440]', JSON.stringify(rail));
    expect(rail.oy === 'hidden' || rail.sh <= rail.ch, `PC 레일이 세로로 스크롤된다(${rail.sh}>${rail.ch})`).toBe(true);
  });
});
