// 일정 탐색 '검색 열기' 돋보기 — 아이콘이 찌그러지지 않고, 누름면은 44×44 그대로 (2026-09-29 최종 점검 D3).
//
// 왜: 칩이 `w-9 justify-center px-0` 에 CHIP_BASE(`px-3.5`)를 붙였는데 빌드된 CSS 에서 px-3.5 가 px-0 을 이겼다
//   (유틸 순서는 소스가 아니라 CSS 순서가 정한다). 내용 폭이 38.25 − 2×14.875 − 2 = 6.5px 가 되어
//   flex 가 h-4 w-4 아이콘을 6.5×17 로 눌렀다(360·390·1280 동일). computed 크기로 잰다 — 클래스 grep 은 못 본다.
import { test, expect } from './_fixtures';

for (const width of [360, 1280]) {
  test(`🔴 검색 열기 돋보기 — 정사각 아이콘 · 누름 44 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/?tab=browse');
    const btn = page.getByRole('button', { name: '검색 열기' }).first();
    await expect(btn).toBeVisible({ timeout: 20_000 });
    const m = await btn.evaluate((b) => {
      const s = b.querySelector('svg')!.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      // 누름면(.tap-44 ::before) — 위·왼쪽으로 넓힌 모서리 안쪽을 눌러도 이 버튼이 잡히는가
      const at = (x: number, y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === b || b.contains(t)); };
      return { iw: s.width, ih: s.height, bw: r.width, bh: r.height,
        hitTopLeft: at(r.left - 5.5, r.top - 5), hitBottom: at(r.left + r.width / 2, r.bottom - 2) }; // 아래 모서리는 rounded-chip 곡면 밖이라 레일이 잡는 게 맞다
    });
    expect(m.iw, `아이콘 폭 ${m.iw.toFixed(2)}px — 칩 안쪽 여백에 눌려 찌그러졌다`).toBeGreaterThanOrEqual(15);
    expect(Math.abs(m.iw - m.ih), `아이콘 ${m.iw.toFixed(2)}×${m.ih.toFixed(2)} — 정사각이 아니다`).toBeLessThan(0.5);
    expect(m.bw, '보이는 칩 폭(w-9)이 바뀌었다').toBeCloseTo(2.25 * 16, 0); // w-9 = 2.25rem — 루트 16px 에서 36(17px 시절 38.25)
    expect(m, '누름면(44×44) 위·왼쪽 확장과 아래 끝이 이 버튼을 잡지 않는다').toMatchObject({ hitTopLeft: true, hitBottom: true });
  });
}
