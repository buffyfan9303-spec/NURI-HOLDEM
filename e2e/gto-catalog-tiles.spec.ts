// GTO 카탈로그 '자주 쓰는 도구' 타일 4칸 — 즐겨찾기 0·1·4·6개(2026-10-05 독립 검토 P2-2).
// 종전 빌드(e24633db)에서 즐겨찾기 1개면 타일이 1칸만(반쪽 줄) 남았다 — 이 스펙의 '1개' 경우가 실패한다.
// 계약: 타일은 늘 4칸 · 즐겨찾기가 앞 · 모자라면 기본 4개(누리 스팟·프리플랍 레인지 차트·푸시·폴드 차트·GTO 핸드 분석)로 채움(중복 0) ·
//       5번째 즐겨찾기부터는 '즐겨찾기 더' 리스트 · 22개 도구가 화면에서 하나도 사라지지 않는다.
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const DEF = ['spot', 'range', 'pushfold', 'gto'];
const CASES: { name: string; favs: string[]; tiles: string[]; more: string[] }[] = [
  { name: '0개', favs: [], tiles: DEF, more: [] },
  { name: '1개', favs: ['icm'], tiles: ['icm', 'spot', 'range', 'pushfold'], more: [] },
  { name: '4개', favs: ['icm', 'tda', 'outs', 'pot'], tiles: ['icm', 'tda', 'outs', 'pot'], more: [] },
  { name: '6개(기본 1개 포함)', favs: ['icm', 'spot', 'tda', 'outs', 'pot', 'glossary'], tiles: ['icm', 'spot', 'tda', 'outs'], more: ['pot', 'glossary'] },
];

for (const c of CASES) {
  test(`즐겨찾기 ${c.name} — 타일 4칸 · 즐겨찾기 먼저 · 나머지 리스트 · 도구 22개 유지`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubLogin(page);
    await stabilizeBackstack(page);
    await page.addInitScript((f) => { try { localStorage.setItem('nuri:fav-tools', f); } catch { /* */ } }, JSON.stringify(c.favs));
    await page.goto('/?tab=tools');
    await dismissOverlays(page);
    const feat = page.getByTestId('tools-featured');
    await expect(feat).toBeVisible({ timeout: 20_000 });
    const tiles = await feat.locator('button[data-testid^="tool-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('tool-', '')));
    expect(tiles, '타일 칸·순서').toEqual(c.tiles);
    const more = page.getByTestId('tools-fav-more');
    if (c.more.length) {
      const m = await more.locator('button[data-testid^="tool-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('tool-', '')));
      expect(m, "5번째 즐겨찾기부터 '즐겨찾기 더' 리스트").toEqual(c.more);
    } else {
      await expect(more, '즐겨찾기가 4개 이하인데 더 보기 리스트가 섰다').toHaveCount(0);
    }
    const all = await page.locator('main [data-testid^="tool-"]').evaluateAll((els) => [...new Set(els.filter((e) => e.getClientRects().length).map((e) => e.getAttribute('data-testid')))]);
    expect(all.length, '화면의 도구 종류 수가 22 가 아니다 — 타일로 옮긴 도구가 사라졌거나 숨김 도구가 나왔다').toBe(22);
  });
}
