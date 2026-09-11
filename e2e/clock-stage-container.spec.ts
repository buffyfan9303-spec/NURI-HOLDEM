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
import { TV_VENUE, serveClock } from './_clock';

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
      ['운영자미리보기', 560, 315], ['세로폰', 390, 844], ['정사각', 900, 880],
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

  // 2026-09-11 물리적 단일화로 **뒤집은 기대값**: 작은 16:9 도 3열이다.
  //   종전 경계는 `폭 768px + landscape` 라 작은 미리보기를 1열로 접었다. 그런데 보드가
  //   ClockStage 한 벌로 합쳐지고 크기 단위가 전부 cqmin 이 되면서 **절대 픽셀이 의미를 잃었다** —
  //   600×338 보드는 1920×1080 보드와 비율이 완전히 같고, 다른 것은 몇 px 인가뿐이다.
  //   768px 을 남겨 두면 운영자 16:9 미리보기(1440 창에서 약 560px)가 1열로 접혀
  //   프라이즈 열·지표 레일이 사라진다 — '미리보기 = TV 축소판' 이 거짓이 되고 운영자가 정보를 잃는다.
  //   그래서 판정은 가로세로비(4/3)로 간다. 3열이 실제로 안 들어가는 건 세로·정사각 스테이지다.
  expect(table['작은미리보기'], `작은 16:9 가 1열이다 — 미리보기가 TV 축소판이 아니게 된다\n${dump}`)
    .toMatchObject({ 열수: '3', 좌우열: 'flex' });
  expect(table['운영자미리보기'], `운영자 16:9 미리보기가 1열이다 — 프라이즈 열·지표 레일이 사라진다\n${dump}`)
    .toMatchObject({ 열수: '3', 좌우열: 'flex', 보조줄: 'none' });
  // 세로·정사각은 여전히 접힌다 — 여기서 3열을 펴면 중앙 열이 좁아 타이머가 좌우를 뚫는다.
  expect(table['세로폰'], `세로 폰 관전이 3열이다\n${dump}`)
    .toMatchObject({ 열수: '1', 좌우열: 'none', 보조줄: 'grid' });
  expect(table['정사각'], `정사각에 가까운 스테이지가 3열이다 — 4/3 미만은 접혀야 한다\n${dump}`)
    .toMatchObject({ 열수: '1', 좌우열: 'none' });
});

// ── ② 프로브가 아니라 **진짜 TV 화면**을 연다 ────────────────────────────────
//
// 왜 하나 더 필요한가: 위 테스트는 `container-type:size` 를 스스로 붙인 프로브를 잰다.
//   그래서 판정표는 지키지만 **호출처가 그 전제를 실제로 갖췄는지**는 보지 않는다.
//   실제로 e008b02 가 .clk-* 로 갈아타면서 TournamentClock 쪽만 확인하고 ClockDisplay 루트에
//   container-type 을 빠뜨렸다 — 컨테이너 쿼리는 조상에 컨테이너가 하나도 없으면 **영원히 거짓**이라
//   매장 TV 가 1열로 굳어 프라이즈 열과 지표 레일이 통째로 사라졌는데, 프로브 테스트는 초록이었다.
//   여기서는 앱이 렌더한 진짜 보드에서 두 열이 보이는지 본다.
const TV_LEVELS = [
  { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
  { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
];
const tvRow = () => ({
  venue_id: TV_VENUE, game_seq: 1, session_date: null, title: '스테이지 계약 점검',
  config: {
    title: '스테이지 계약 점검', startStack: 50_000, rebuyStack: 70_000, addonStack: 0, isAddon: false,
    earlyBonus: 5_000, doubleEarlyBonus: 10_000, regCloseLevel: 2, maxLevel: 20,
    earlyDoubleLevel: 2, earlySingleLevel: 5, earlyDoubleMin: 40, earlySingleMin: 100,
    mysteryBounty: 0, prizes: [{ place: '1st', amount: 4_000_000 }, { place: '2nd', amount: 1_500_000 }],
    levels: TV_LEVELS,
  },
  current_index: 0, running: true, ends_at: new Date(Date.now() + 9 * 60_000).toISOString(),
  remaining_ms: 0, adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 24,
  live_stats: { entries: 42, rebuys: 6, alive: 18, avgStack: 84_000, totalStack: 1_512_000, buyInAmount: 100_000 },
});

test('클락 TV — 가로 스테이지에서 프라이즈 열·지표 레일이 실제로 그려진다', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await serveClock(page, tvRow());
  await page.goto(`/?display=${TV_VENUE}&g=1&auto=0`);
  await expect(page.getByTestId('clk-timer'), '타이머가 없다 — 픽스처가 안 먹었다').toBeVisible({ timeout: 20_000 });
  // 🔴 여기가 회귀 지점 — 스테이지 루트에 container-type 이 없으면 둘 다 display:none 으로 남는다.
  await expect(page.getByTestId('clk-prizes'),
    '프라이즈 열이 TV 에 없다 — 스테이지 루트의 container-type:size 가 빠졌는지 확인하라(.clk-* 컨테이너 쿼리의 전제)')
    .toBeVisible();
  await expect(page.getByTestId('clk-rails'), '지표 레일이 TV 에 없다 — 같은 원인').toBeVisible();
});

test('클락 TV — 세로 스테이지(세로 TV)에서는 1열로 접힌다', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 1080, height: 1920 });
  await serveClock(page, tvRow());
  await page.goto(`/?display=${TV_VENUE}&g=1&auto=0`);
  await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
  // 세로에서 3열이 되면 vmin(=폭) 기준 타이머가 우측 지표를 덮는다 — ①의 회귀.
  await expect(page.getByTestId('clk-prizes'), '세로 TV 가 3열이다 — 타이머가 지표를 덮는다').toBeHidden();
  await expect(page.getByTestId('clk-rails'), '세로 TV 가 3열이다').toBeHidden();
});
