// GTO 탭 NURI SPOT 대표 카드 — 2026-10-06 오너 시안("이거 그대로 누리스팟쪽에 적용") 이식의 동작 계약.
//
// 잠그는 것(색·모양이 아니라 '읽히고 눌리는가'):
//  ① 320·390 × 다크·라이트에서 AI 안내 줄이 **한 줄**이고 넘치지 않는다(오너: 320 에서 안내 줄 줄바꿈 없게).
//     음성 대조: 이 카드의 이전 판(배지 옆 칸에 안내 줄을 둔 flex 행)은 320 에서 두 줄이라 이 단언이 실패했다.
//  ② 두 버튼이 같은 폭 · 44px 이상 · 라벨이 잘리지 않는다.
//  ③ 카드 안 CSS·WAAPI 애니메이션이 0 이다(합성층을 만드는 transform·opacity 애니메이션 없음).
//     2026-10-09 오너 "한 번 나오고 안 나와서 인지를 못 한다 · 계속 반복" 으로 옅은 빛 띠가 9초마다 지나가지만(SpotHeroSheen),
//     그건 SVG 그라디언트(SMIL)만 옮겨 getAnimations 에 잡히지 않는다 — 반복·멈춤·대비 계약은 e2e/motion-loop-1009.spec.ts.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

for (const theme of ['dark', 'light'] as const) {
  for (const w of [320, 390]) {
    test(`🔴 NURI SPOT 카드 ${w} ${theme} — 안내 한 줄 · 같은 폭 두 버튼 44px · CSS 애니메이션 0`, async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* 저장소 차단 */ } }, theme);
      await page.setViewportSize({ width: w, height: 844 });
      await stabilizeBackstack(page);
      await page.goto('/?tab=tools');
      const hero = page.getByTestId('spot-hero');
      await expect(hero).toBeVisible({ timeout: 30_000 });
      await expect(hero.getByTestId('spot-hero-ai')).toHaveText('AI 코칭 첫 3회 무료 · 이후 회당 30P · 하루 3회');

      const m = await hero.evaluate((el) => {
        const ai = el.querySelector('[data-testid="spot-hero-ai"]') as HTMLElement;
        const lh = parseFloat(getComputedStyle(ai).lineHeight);
        const btns = [...el.querySelectorAll('button')].map((b) => {
          const r = b.getBoundingClientRect();
          return { t: (b.textContent ?? '').trim(), w: r.width, h: r.height, over: b.scrollWidth - b.clientWidth };
        });
        return {
          lines: ai.getBoundingClientRect().height / lh,
          over: ai.scrollWidth - ai.clientWidth,
          btns,
          anims: el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
        };
      });
      expect(m.lines, `안내 줄이 ${m.lines.toFixed(2)}줄`).toBeLessThan(1.5);
      expect(m.over, '안내 줄이 넘친다').toBeLessThanOrEqual(0);
      expect(m.btns.map((b) => b.t)).toEqual(['새 스팟 작성', '내 스팟']);
      expect(Math.abs(m.btns[0].w - m.btns[1].w), `두 버튼 폭 ${m.btns[0].w} / ${m.btns[1].w}`).toBeLessThanOrEqual(1);
      for (const b of m.btns) {
        expect(b.h, `${b.t} 높이 ${b.h}`).toBeGreaterThanOrEqual(44);
        expect(b.over, `${b.t} 라벨이 잘린다`).toBeLessThanOrEqual(0);
      }
      expect(m.anims, '카드 안에서 애니메이션이 돈다').toBe(0);
    });
  }
}
