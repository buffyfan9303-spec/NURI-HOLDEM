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
// 🔴 2026-09-20 — 댓글(`comments`)을 목킹하지 않아 이 스펙이 **운영에 그대로 나가고 있었다.**
//   로컬에서는 응답이 와서 [] 로 조용히 지나가는데, CI 에서는 실패해 `LoadErrorCard` 가
//   **181.9px** 짜리로 뒤늦게 떠서 아래를 밀었다 — 그게 세 커밋을 죽인 0.0568 의 정체다.
//   CPU 8배로 조여 재현하고 자식 높이를 찍어 확정했다:
//     BEFORE  h3=21.3 · div.space-y-4=114.5
//     AFTER   h3=21.3 · **div.flex flex-col items-center=181.9**(svg 경고 + 다시 시도 버튼) · div.space-y-4=114.5
//   CLAUDE.md 경고 그대로다: "E2E 스펙 대부분이 운영 데이터를 목킹 없이 읽는다.
//   코드를 안 바꿨는데 빨개지면 회귀보다 운영 데이터를 먼저 의심하라."
//   ⚠ 목킹을 **게이트를 무르게 하는 수단으로 쓰는 것이 아니다.** 이 스펙이 잡으려는 것은
//     `SpotPostCard` 스켈레톤이고, 댓글 적재 실패는 그와 무관한 다른 경로다. 그 잡음을 끄는 것이다.
//     (댓글 로딩 자체의 CLS 는 `PostDetailModal` 이 `commentCount` 로 자리를 예약해 따로 막는다.)
const COMMENTS_REST = /\/rest\/v1\/comments\?/;
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
  await page.route(COMMENTS_REST, (r) => json(r, []));
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
  // 🔴 2026-09-20 — `data-board-loaded="done"` 뒤에 **곧바로** 눌렀더니 CI 에서 두 번 죽었다
  //   (`element(s) not found` — 다이얼로그가 안 열림). 그 표식은 '불러오기가 끝났다' 는 뜻이지
  //   '그 줄이 DOM 에 그려졌다' 는 뜻이 아니다. 느린 러너에서는 그 사이가 벌어진다.
  //   → 누르기 전에 **그 글 제목이 실제로 있는지** 기다린다. 이건 게이트를 무르게 하는 것이 아니라
  //     누르지도 못하고 실패하던 계측을 고치는 것이다.
  await page.waitForFunction(
    (t) => [...document.querySelectorAll('*')].some((e) => e.children.length === 0 && e.textContent?.trim() === t),
    title, { timeout: 15_000 },
  );
  // ⚠ locator.click() 은 대상까지 자동 스크롤해 **측정을 오염시킨다** — evaluate 로 누른다.
  const 눌렀나 = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent?.trim() === t);
    const btn = el?.closest('button,a,[role="button"]') as HTMLElement | null;
    btn?.click();
    return !!btn;
  }, title);
  // 🔴 누를 대상을 못 찾았는데 아래 `toBeVisible` 로 넘어가면 15초를 기다린 뒤
  //   '다이얼로그가 안 보인다' 는 **엉뚱한 메시지**로 죽는다. 원인을 여기서 말한다.
  expect(눌렀나, `"${title}" 글 줄을 눌를 수 있는 요소(button/a/[role=button])를 못 찾았다`
    + ' — 글 목록 마크업이 바뀌었는지 봐라(제목 텍스트 노드의 조상에 누를 것이 있어야 한다)').toBe(true);
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
    // 🔴 top 만 재면 "댓글 섹션이 **스스로 커져서** 아래를 미는" 경우를 놓친다(2026-09-20 실측:
    //   top 은 0.0 인데 `nav[data-pd-nav]` 가 +0.0568 밀렸다). 높이도 같이 잰다.
    const hOf = () => {
      const el = document.querySelector(sel);
      return el ? +el.getBoundingClientRect().height.toFixed(2) : null;
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
    // 🔴 합계만 보면 **무엇이 움직였는지 모른 채** 숫자를 쫓게 된다(2026-09-20 에 그래서 두 번 헛돌았다).
    //   움직인 노드를 이름으로 모아 실패 메시지에 싣는다 — 다음 사람이 바로 그 자리를 본다.
    const 범인: string[] = [];
    const dlg = () => document.querySelector('[role="dialog"]');
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as
           { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] }[]) {
        if (e.hadRecentInput) continue;
        const d = dlg();
        const inDialog = (e.sources ?? []).some((src) => src.node && d && d.contains(src.node));
        if (inDialog) {
          shift += e.value;
          for (const src of e.sources ?? []) {
            const n = src.node as HTMLElement | undefined;
            if (!n || !d?.contains(n)) continue;
            const cls = (n.className?.toString?.() ?? '').slice(0, 60);
            const data = [...(n.attributes ?? [])].filter((a) => a.name.startsWith('data-')).map((a) => a.name).join(',');
            범인.push(`${n.tagName?.toLowerCase()}${data ? `[${data}]` : ''}.${cls} +${e.value.toFixed(4)}`);
          }
        }
      }
    });
    po.observe({ type: 'layout-shift', buffered: false });
    const before = topOf(); const beforeH = hOf();
    await new Promise((r) => setTimeout(r, ms));
    const after = topOf(); const afterH = hOf();
    po.disconnect();
    return { before, after, beforeH, afterH,
             높이증가: beforeH != null && afterH != null ? +(afterH - beforeH).toFixed(2) : null,
             shift: +shift.toFixed(4), 범인: [...new Set(범인)].slice(0, 8),
             drift: before != null && after != null ? +(after - before).toFixed(2) : null };
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
    expect(r.shift, `글을 여는 동안 다이얼로그 안 layout-shift 합이 ${r.shift} 였다(고치기 전 0.0806).`
      + `\n  움직인 것: ${r.범인.length ? r.범인.join(' · ') : '(귀속 실패 — sources 가 비었다)'}`
      + `\n  댓글 섹션 높이 ${r.beforeH} → ${r.afterH} (${r.높이증가}px 커졌다)`
      + '\n  → 합계를 쫓지 말고 위 노드의 자리 예약을 봐라.').toBeLessThan(0.02);
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
