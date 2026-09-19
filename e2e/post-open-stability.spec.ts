// 글을 열면 **내용이 제자리에 선다** (2026-09-19 오너 지시)
//
// 오너: "커뮤니티 게시판 글을 누르면 아직도 **로드가 느린건지 지지직 하면서 올라가**".
// '아직도' 가 핵심이었다 — 전날(커밋 4f677a9) 같은 증상을 한 번 고쳤는데 그게 원인이 아니었다.
//
// 근본원인 [실측 · 390×844 · CPU 4배 · 프로덕션 빌드]:
//   `SpotPostCard` 의 로딩 스켈레톤(h-[132px] + mt-3 12.75 = **144.75px**)을
//   `PostDetailModal` 이 **모든 글에** 무조건 그렸다. 스팟 글이 아니면 `null` 로 사라지면서
//   반응행·댓글·이전/다음이 통째로 위로 튄다.
//     첫 페인트 article 740px → ~310ms 에 613px
//     [data-pd-comments] top 516 → 371 (**−145px**) · LayoutShift **0.0806**
//     (sources: SECTION[data-pd-comments] · NAV 이전/다음 · DIV 반응행)
//   페이드인(160ms)이 **끝난 뒤**에 일어나 그대로 보인다.
//   운영 DB 실측: community_posts 4건 · post_spots **0건** → 지금 열리는 모든 글이 이 경로였다.
//   오너의 "로드가 느린건지" 가 정확히 이 pulse 박스가 떠 있던 시간이다.
//
// 고친 방식: 자리 예약을 **없애지 않았다** — 스팟 글일 때만 예약한다(`expectSpot`).
//   카테고리는 서버가 보장하는 선행 신호다(api/spots.ts:141 `share_spot_post` 는 항상 p_category:'hand').
//
// ⚠ 음성 대조: `PostDetailModal` 의 `expectSpot={post.category === 'hand'}` 를 지우면
//   ①이 −145px 로 실패한다. 실제로 되돌려 확인했다.
// ⚠ 이 스펙은 **일부러 응답을 늦춘다**(400ms). 목킹 없이 운영 데이터를 읽으면 응답이 빨라
//   스켈레톤이 보이지도 않고 지나가 **아무것도 재지 않는 초록 검사**가 된다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const ADS_RPC = /\/rest\/v1\/rpc\/(get_community_ads|list_community_ads)/;
const POSTS_REST = /\/rest\/v1\/community_posts\?/;
const SPOTS_REST = /\/rest\/v1\/post_spots\?/;
const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

const postRow = (id: string, title: string, category = 'free') => ({
  id, user_id: `u-${id}`, user_name: `작성자${id}`, user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${id} `.repeat(40), created_at: '2026-09-03T00:00:00Z',
  like_count: 0, comment_count: 0, view_count: 0,
  category, title, images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
});

/** post_spots 응답을 `delayMs` 만큼 늦춘다 — 스켈레톤이 **보이는 시간**을 만든다. */
async function install(page: Page, posts: unknown[], spotDelayMs: number, spotRows: unknown[]) {
  await page.route(ADS_RPC, (r) => json(r, []));
  await page.route(POSTS_REST, (r) => {
    const url = r.request().url();
    if (/[?&]id=eq\./.test(url)) return json(r, posts);
    if (/bumped_until=gt\./.test(url)) return json(r, []);
    if (/created_at=lt\.|or=\(/.test(url)) return json(r, []);
    if (/[?&]limit=/.test(url) && !/limit=50/.test(url)) return json(r, []);
    return json(r, posts);
  });
  await page.route(SPOTS_REST, async (r) => {
    await new Promise((res) => setTimeout(res, spotDelayMs));
    await json(r, spotRows);
  });
}

async function openBoardAndPost(page: Page, title: string) {
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await expect(page.locator('[data-board-loaded="done"]')).toHaveCount(1, { timeout: 10_000 });
  // ⚠ locator.click() 은 대상까지 자동 스크롤해 **측정을 오염시킨다** — evaluate 로 누른다.
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent?.trim() === t);
    (el?.closest('button,a,[role="button"]') as HTMLElement | null)?.click();
  }, title);
  await expect(page.locator('[role="dialog"]').filter({ has: page.locator('[data-pd-root]') }).first())
    .toBeVisible({ timeout: 15_000 });
}

/** 모달이 뜬 **첫 프레임**의 댓글 섹션 top 과, 응답이 다 들어온 뒤의 top. 그리고 그 사이 layout-shift 합. */
async function driftAcrossLoad(page: Page, settleMs: number) {
  return page.evaluate(async (ms) => {
    const sel = '[data-pd-comments]';
    const topOf = () => {
      const el = document.querySelector(sel);
      return el ? +el.getBoundingClientRect().top.toFixed(2) : null;
    };
    // 🔴 2026-09-20: 예전엔 **페이지 전체**의 layout-shift 합을 셌다. 그래서 다이얼로그와 무관한
    //   이동(폰트 교체·뒤 화면 이미지 등)까지 섞여 들어와 **CI 에서만 빨개졌다**
    //   (실측 CI 0.0568 vs 로컬 5/5 통과 · 1차 배포 때도 재시도로 겨우 넘어갔다).
    //   CLAUDE.md: "CLS 는 여러 원인이 뭉개지는 지표 — 기전을 직접 재는 편이 낫다."
    //   → `sources` 로 **이동을 일으킨 노드가 이 다이얼로그 안인지** 보고 그것만 센다.
    //   ⚠ 기준(0.02)은 그대로다. 무르게 한 것이 아니라 **재는 대상을 좁힌 것**이다 —
    //     원래 잡으려던 버그(SpotPostCard 스켈레톤)는 다이얼로그 안에서 나므로 그대로 걸린다.
    //   ⚠ 귀속이 안 되는 엔트리(sources 가 빈 경우)는 세지 않는다. 그걸 세면 잡음이 도로 들어온다 —
    //     대신 위의 `drift`(댓글 섹션 top 이동)가 기전을 직접 재고 있어 빈 검사가 되지 않는다.
    let shift = 0;
    const dlg = () => document.querySelector('[role="dialog"]');
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as
           { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] }[]) {
        if (e.hadRecentInput) continue;
        const d = dlg();
        const inDialog = (e.sources ?? []).some((src) => src.node && d && d.contains(src.node));
        if (inDialog) shift += e.value;
      }
    });
    po.observe({ type: 'layout-shift', buffered: false });
    const before = topOf();
    await new Promise((r) => setTimeout(r, ms));
    const after = topOf();
    po.disconnect();
    return { before, after, shift: +shift.toFixed(4), drift: before != null && after != null ? +(after - before).toFixed(2) : null };
  }, settleMs);
}

test.describe('글 열기 안정성', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 ① 스팟이 아닌 글 — 응답이 늦어도 댓글 섹션이 움직이지 않는다', async ({ page }) => {
    // 운영의 실제 상태: 전부 일반 글이고 post_spots 는 0행이다.
    await install(page, [postRow('n1', '첫째 글 제목', 'free')], 400, []);
    await openBoardAndPost(page, '첫째 글 제목');

    const r = await driftAcrossLoad(page, 900);
    expect(r.before, '댓글 섹션([data-pd-comments])을 첫 프레임에 못 찾았다 — 이 검사가 아무것도 안 보고 있다')
      .not.toBeNull();
    expect(r.after, '응답 뒤 댓글 섹션이 사라졌다').not.toBeNull();

    // 🔴 오너 증상 그 자체. 고치기 전에는 −145px 였다.
    expect(Math.abs(r.drift!), `스팟이 아닌 글인데 응답을 기다리는 동안 댓글 섹션이 ${r.drift}px 움직였다`
      + ' — 자리를 잡았다가 비워주는 상자가 다시 생겼다(SpotPostCard 스켈레톤).')
      .toBeLessThanOrEqual(1);
    expect(r.shift, `글을 여는 동안 layout-shift 합이 ${r.shift} 였다(고치기 전 0.0806)`).toBeLessThan(0.02);
  });

  test('🔴 ② 스팟 글에서는 자리를 **여전히** 예약한다 — 고치면서 CLS 방어를 잃지 않았다', async ({ page }) => {
    // 양성 대조. ①만 두면 "스켈레톤을 통째로 지워도 통과" 라 방어가 사라진 것을 못 잡는다.
    await install(page, [postRow('h1', '핸드 글 제목', 'hand')], 400, []);
    await openBoardAndPost(page, '핸드 글 제목');

    const reserved = await page.evaluate(() =>
      !!document.querySelector('[role="dialog"] .animate-pulse.rounded-aura'));
    expect(reserved, "category='hand' 인 글에서 로딩 자리 예약이 사라졌다 — 진짜 스팟 글이 도착할 때 아래가 밀린다")
      .toBe(true);
  });
});
