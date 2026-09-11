// 클락 스테이지 레이아웃 판정은 **스테이지 자신의 크기**로 한다 — 뷰포트가 아니다.
//
// 왜 이 게이트가 필요한가: 같은 보드 한 벌이 두 곳에서 산다.
//   (a) 매장 TV 전체화면(ClockDisplay — 뷰포트가 곧 스테이지)
//   (b) 운영자 화면 안의 16:9 미리보기·전체화면(TournamentClock — 박스가 스테이지)
// 그래서 판정 기준을 뷰포트로 잡으면 둘 중 하나가 반드시 틀린다. 실제로 두 번 틀렸다:
//   ① `md:`(폭만) — 세로 TV(1080×1920)가 폭 1080 으로 md 를 넘겨 3열이 됐다. 글자는 vmin(=폭) 기준이라
//      중앙 열(2.5/4.5 ≈ 600px)을 가로로 뚫고 타이머가 우측 지표를 덮었다(2026-09-11 실측).
//   ② `md:landscape:`(폭+뷰포트 방향) — ①은 고쳤지만, **세로 태블릿에서 가로 미리보기가 1열로 접혔다**.
//      뷰포트가 portrait 라는 이유로 16:9 박스를 세로 취급한 것이다.
//   → `.clk-*` 컨테이너 쿼리(src/index.css)로 옮겨 둘 다 맞게 했다. 이 스펙이 그 판정표를 잠근다.
//
// 방법: 앱을 열어 index.css 를 로드한 뒤(로그인·매장 불필요) 스테이지와 같은 구조의 박스를
// 네 크기로 만들어 computed style 을 잰다. 뷰포트는 일부러 **세로 태블릿**으로 둔다 —
// 뷰포트 기준으로 되돌아가면 첫 줄에서 바로 빨개진다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

/** 스테이지 루트에 `container-type: size` 가 걸린 두 호출처(TournamentClock)를 그대로 흉내 낸다. */
const PROBE = `
  <div class="clk-cols"><div class="clk-col"></div><div></div><div class="clk-col"></div></div>
  <div class="clk-narrow-only"></div><span class="clk-wide-land"></span>`;

test('클락 스테이지 — 3열 판정은 뷰포트가 아니라 스테이지 크기로 한다', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 768, height: 1024 }); // 세로 태블릿(뷰포트 portrait)
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const table = await page.evaluate((html) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(host);
    const out: Record<string, Record<string, string>> = {};
    for (const [name, w, h] of [
      ['미리보기16:9', 900, 506], ['가로TV', 1920, 1080], ['세로TV', 1080, 1920], ['작은미리보기', 600, 338],
    ] as [string, number, number][]) {
      const stage = document.createElement('div');
      stage.style.cssText = `width:${w}px;height:${h}px;container-type:size`;
      stage.innerHTML = html;
      host.appendChild(stage);
      const q = (s: string) => stage.querySelector(s) as HTMLElement;
      out[name] = {
        열수: String(getComputedStyle(q('.clk-cols')).gridTemplateColumns.split(' ').filter(Boolean).length),
        좌우열: getComputedStyle(q('.clk-col')).display,
        보조줄: getComputedStyle(q('.clk-narrow-only')).display,
        프레임: getComputedStyle(q('.clk-wide-land')).display,
      };
    }
    host.remove();
    return out;
  }, PROBE);

  const dump = JSON.stringify(table);
  // ⚠ 여기가 핵심 — 뷰포트는 portrait 인데 스테이지는 가로다. 뷰포트 기준으로 되돌리면 1열이 된다.
  expect(table['미리보기16:9'], `세로 태블릿의 16:9 미리보기가 접혔다 — 판정이 뷰포트로 돌아갔다\n${dump}`)
    .toMatchObject({ 열수: '3', 좌우열: 'flex', 보조줄: 'none', 프레임: 'block' });
  expect(table['가로TV'], `가로 TV 가 3열이 아니다\n${dump}`)
    .toMatchObject({ 열수: '3', 좌우열: 'flex', 보조줄: 'none' });
  // 세로 TV 가 3열이 되면 vmin(=폭) 기준 타이머가 중앙 열을 뚫는다 — ①의 회귀.
  expect(table['세로TV'], `세로 TV 가 3열이다 — 타이머가 우측 지표를 덮는다\n${dump}`)
    .toMatchObject({ 열수: '1', 좌우열: 'none', 보조줄: 'grid' });
  expect(table['작은미리보기'], `좁은 스테이지가 3열이다\n${dump}`)
    .toMatchObject({ 열수: '1', 좌우열: 'none' });
});
