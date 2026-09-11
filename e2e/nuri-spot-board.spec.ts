// NURI SPOT × 게시판 — 토론이 **게시판에서** 도는가 (2026-09-11 오너 지시)
//
// 오너: "스팟 토론은 누리 스팟 말고 게시판으로 보내서 게시판을 활성화."
// 그래서 확인할 것은 셋이다:
//   ① 도구의 '스팟 토론' 축이 진짜로 **게시판으로 데려간다**
//      (예전 코드는 'nuri:open-tab' 을 쐈는데 그 이름을 듣는 리스너가 앱에 없어 버튼이 죽어 있었다)
//   ② 게시글 상세에 스팟 카드가 선다
//   ③ 가려진 스팟은 **상대 카드가 화면 어디에도 없다** — 투표가 먼저인 이유가 성립한다
//
// ⚠ 운영 DB 무접촉: 로그인은 stubLogin(로컬), 데이터는 page.route fixture.
//   _fixtures 가 비-GET 을 끊으므로 쓰기 요청이 새면 테스트가 스스로 실패한다.
import { test, expect } from './_fixtures';
import { type Page, type Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

const POST_ID = '00000000-0000-4000-8000-00000000ab01';
const ME = '00000000-0000-4000-8000-0000000000f1';   // stubLogin 의 uid

const postRow = (over: Record<string, unknown> = {}) => ({
  id: POST_ID, user_id: ME, user_name: '스팟올린사람', user_role: 'user', user_color: '#888', user_avatar: null,
  content: '이 자리에서 어떻게 하시겠어요?', created_at: '2026-09-10T00:00:00Z',
  like_count: 0, comment_count: 0, view_count: 0,
  category: 'hand', title: '이 스팟 어떻게 치세요', images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  ...over,
});

/** 서버가 이미 가린 상태를 흉내낸다 — 가려진 스팟에는 villain 키가 **아예 없다**.
 *  (20260911d: 공유 시점에 hidden_* 컬럼으로 빼내고 컬럼 SELECT 를 회수한다) */
const spotJson = (reveal: boolean) => ({
  v: 1, game: 'nlhe', format: 'cash', tableSize: 6, sbBb: 0.5, anteBb: 0,
  effectiveBb: 100, heroPos: 'BTN', villainPos: 'BB',
  hero: ['As', 'Ks'],
  villain: reveal ? ['Qd', 'Qc'] : [],
  board: [], street: 'preflop', actions: [],
  // 글쓴이의 선택도 '답' 쪽이라 열리기 전에는 서버가 내려주지 않는다(hidden_action).
  ...(reveal ? { heroAction: 'raise' } : {}),
});

const spotRow = (reveal: boolean) => ({
  post_id: POST_ID, spot: spotJson(reveal),
  coverage_kind: 'chart_nash', source_label: 'BTN 오픈 표',
  dataset_version: 'nuri-charts-2026-09-11',
  reveal_villain: reveal, reveal_result: reveal, analysis: null,
});

async function installBoard(page: Page, opts: { reveal?: boolean; spot?: boolean } = {}) {
  const reveal = opts.reveal ?? false;
  await page.route(/\/rest\/v1\/community_posts\?/, (r: Route) => r.fulfill(json([postRow()])));
  await page.route(/\/rest\/v1\/post_spots\?/, (r: Route) =>
    r.fulfill(json(opts.spot === false ? null : spotRow(reveal))));
  // 상세가 함께 부르는 것들 — 비어 있어도 화면은 서야 한다.
  // ⚠ 모양을 맞춰야 한다: maybeSingle 계열은 null, **목록 계열은 빈 배열**.
  //   comments 에 null 을 물렸더니 커뮤니티 목록 자체가 안 그려졌다(실측).
  for (const re of [/\/rest\/v1\/post_hands\?/, /\/rest\/v1\/post_polls\?/]) {
    await page.route(re, (r: Route) => r.fulfill(json(null)));
  }
  await page.route(/\/rest\/v1\/comments\?/, (r: Route) => r.fulfill(json([])));
}

/** 게시판 섹션까지 들어가 글 하나를 연다 */
async function openPost(page: Page) {
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  // 커뮤니티는 lazy 청크다 — 서브탭이 실제로 그려진 뒤에 눌러야 한다(안 기다리면 클릭이 허공에 간다)
  const boardTab = page.getByRole('button', { name: '게시판', exact: true }).first();
  await expect(boardTab, '게시판 서브탭이 없다').toBeVisible({ timeout: 20_000 });
  await boardTab.click();
  // ⚠ 목록 카드에는 폭 측정용 유령 span 이 하나 더 있다
  //   (<span aria-hidden class="invisible absolute">제목</span>). 그냥 .first() 를 잡으면
  //   그 숨은 span 이 걸려 영원히 안 보인다 — 보이는 것만 고른다.
  const title = page.getByText('이 스팟 어떻게 치세요').filter({ visible: true }).first();
  await expect(title, '게시판에 글이 안 보인다').toBeVisible({ timeout: 20_000 });
  await title.click();
  const dlg = page.getByRole('dialog').first();
  await expect(dlg, '글 상세가 안 열린다').toBeVisible({ timeout: 20_000 });
  return dlg;
}

test.describe('스팟 토론은 게시판에서 돈다', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubLogin(page);
    await stabilizeBackstack(page);
  });

  test('🔴 도구의 스팟 토론 축이 실제로 게시판으로 데려간다', async ({ page }) => {
    await installBoard(page);
    await page.goto('/?tab=tools');
    await dismissOverlays(page);
    await page.getByTestId('spot-hero').getByRole('button', { name: '새 스팟 분석' }).click();
    const dlg = page.getByRole('dialog').first();
    await expect(dlg).toBeVisible({ timeout: 20_000 });
    await dlg.getByRole('tab', { name: '스팟 토론', exact: true }).click();

    // 도구 안에 피드를 만들지 않았다는 것 — 여기서 글 목록이 돌면 안 된다
    await expect(dlg.getByText(/게시판.*핸드 분석|핸드 분석.*모입니다/).first(),
      '토론이 게시판으로 간다는 안내가 없다').toBeVisible();

    // 게시판 글을 늘리는 것이 목적이므로 **올리는 문**이 먼저 있어야 한다
    await expect(dlg.getByRole('button', { name: '스팟 분석하고 올리기' }),
      '게시판에 올리러 가는 문이 없다').toBeVisible();

    await dlg.getByRole('button', { name: '게시판에서 스팟 글 보기' }).click();
    // 실제로 커뮤니티 탭이 서야 한다(예전엔 리스너가 없어 아무 일도 안 났다)
    await expect(page.locator('main[data-tab="community"]'), '게시판으로 가지 않았다')
      .toBeVisible({ timeout: 15_000 });
  });

  test('🔴 게시글 상세에 스팟 카드가 선다', async ({ page }) => {
    await installBoard(page);
    const dlg = await openPost(page);
    const card = dlg.locator('[data-spot-post]');
    await expect(card, '게시글에 스팟 카드가 없다').toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('NURI SPOT')).toBeVisible();
    await expect(card.locator('[data-spot-coverage="chart_nash"]')).toBeVisible();
    await expect(card.getByRole('button', { name: '이 스팟 분석하기' })).toBeVisible();
  });

  test('🔴 가려진 스팟은 상대 카드가 화면 어디에도 없다', async ({ page }) => {
    await installBoard(page, { reveal: false });
    const dlg = await openPost(page);
    const card = dlg.locator('[data-spot-post]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/아직 가려져 있습니다/)).toBeVisible();
    // 앵커링 금지 — 글쓴이가 뭘 했는지 먼저 보이면 "당신이라면?" 투표가 그 값에 끌려간다
    // ⚠ 텍스트로 찾으면 **가림 안내 문구**('… 글쓴이의 선택 … 가려져 있습니다')에 걸린다.
    //   실제 표시 요소만 본다.
    await expect(card.locator('[data-spot-heroaction]'), '투표 전에 글쓴이의 선택이 보인다').toHaveCount(0);
    // 상대 라벨이 아예 서지 않아야 한다 — '가림'이 표시가 아니라 실제 부재여야 한다
    await expect(card.getByLabel('상대')).toHaveCount(0);
  });

  test('🔴 공개된 스팟은 상대 카드를 보여준다', async ({ page }) => {
    await installBoard(page, { reveal: true });
    const dlg = await openPost(page);
    const card = dlg.locator('[data-spot-post]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/아직 가려져/)).toHaveCount(0);
    await expect(card.getByLabel('상대')).toBeVisible();
    await expect(card.locator('[data-spot-heroaction]'), '공개 뒤에는 글쓴이의 선택이 보여야 한다').toBeVisible();
  });

  test('🔴 스팟이 아닌 글에는 카드가 서지 않는다 — 일반 글을 망치지 않는다', async ({ page }) => {
    await installBoard(page, { spot: false });
    const dlg = await openPost(page);
    await expect(dlg.getByText('이 자리에서 어떻게 하시겠어요?').first()).toBeVisible();
    await expect(dlg.locator('[data-spot-post]'), '스팟이 없는 글에 카드가 섰다').toHaveCount(0);
  });
});
