// 하단 탭바 라벨·배지가 §T1 타이포 사다리 위에 있는지 잠근다 (문서 5 §7 P0-B, 2026-09-12).
//
// 무엇을 막는가: 라벨이 `text-[11px]`, 배지가 `text-[9px]` 였다. 둘 다 **절대 px** 이라
//  ① `html{font-size:17px}`("50대 이용자 가독성"으로 16→17 올린 결정)을 통째로 무시하고
//  ② 브라우저 글자 확대도 하나도 안 받는다.
// 이 탭바는 모바일의 **유일한 1차 내비**(전 15화면 ×115 노드)인데 가장 작은 역할 토큰(11.69px)보다도 작았다.
//
// ⚠ 크기 단언만으로는 부족하다 — `text-[12.75px]` 로 바꿔도 통과한다.
//   그래서 **루트 폰트를 키워 라벨이 따라 커지는지**(= 진짜 rem 인지)를 함께 잰다. 이게 이 스펙의 핵심 계약이다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

/** 허용 칸(1rem = 17px) — t-meta 11.69 · t-tab/t-desc 12.75 · t-nav/t-title 14.88 · 17 */
const LADDER = [11.6875, 12.75, 14.875, 17];
const NAV = 'nav[aria-label="하단 내비게이션"]';

const readTabbar = () => {
  const nav = document.querySelector('nav[aria-label="하단 내비게이션"]');
  if (!nav) return null;
  const btns = [...nav.querySelectorAll('button')];
  if (!btns.length) return null;
  const rows = btns.map((b) => {
    const label = b.lastElementChild as HTMLElement;
    const r = label.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return {
      text: (label.textContent || '').trim(),
      fs: parseFloat(getComputedStyle(label).fontSize),
      client: label.clientWidth, scroll: label.scrollWidth,
      left: r.left, right: r.right,
      btnW: br.width, btnH: br.height,
    };
  });
  let overlap = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].left < rows[i - 1].right - 0.5) overlap++;
  return { rows, overlap, rootFs: parseFloat(getComputedStyle(document.documentElement).fontSize) };
};

for (const width of [390, 320]) {
  test(`${width}px — 탭바 라벨 5칸이 사다리 위에 있고 잘림·겹침이 없다`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await stabilizeBackstack(page);
    await page.locator(NAV).first().waitFor({ state: 'attached', timeout: 20_000 });

    const m = await page.evaluate(readTabbar);
    console.log(`TABBAR${width} ` + JSON.stringify(m));
    expect(m, '탭바를 못 찾았다').not.toBeNull();
    expect(m!.rows.length, '탭바가 5칸이어야 한다').toBe(5);

    for (const r of m!.rows) {
      const onLadder = LADDER.some((v) => Math.abs(v - r.fs) < 0.05);
      expect(onLadder, `"${r.text}" 라벨 ${r.fs}px 는 §T1 사다리(${LADDER.join('/')}) 밖이다`).toBe(true);
      expect(r.fs, `"${r.text}" 라벨이 권장 하한 12px 미만이다`).toBeGreaterThanOrEqual(12);
      expect(r.scroll, `"${r.text}" 가 가로로 잘린다 (보이는 ${r.client} < 필요 ${r.scroll})`)
        .toBeLessThanOrEqual(r.client + 1);
      // 히트영역 — 글자를 키우다 칸이 좁아지는 것을 막는다
      expect(r.btnH, `"${r.text}" 칸 높이가 44px 미만`).toBeGreaterThanOrEqual(44);
    }
    expect(m!.overlap, '라벨이 옆 칸을 침범한다').toBe(0);
  });
}

// 이 스펙의 핵심. 절대 px 로 되돌리면 **여기서만** 터진다.
// 🔴 2026-09-20 오너 지시: "그런 사람 없어 앞으로 200% 확대 다 빼".
//   루트 글자 17→34px 로 훌내 내던 200% 확대 케이스를 **전부 제거**했다.
//   ⚠ 되살리지 마라 — 오너가 사용자 분포를 보고 내린 결정이다.
//   ⚠ 100% 케이스는 그대로 둔다 — 긴 한글 이름에서 생기는 잘림·겹침은 거기서 계속 잡는다.
