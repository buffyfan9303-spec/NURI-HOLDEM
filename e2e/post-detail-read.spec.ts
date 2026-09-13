// 게시글 상세 = **읽는 화면** 계약 (실행문 §5, 2026-09-12)
//
// 이 스펙이 잠그는 것 — 전부 "고쳤다"가 아니라 "다시 나빠지면 여기서 걸린다":
//   ① 모바일 상단 조작행이 한 행이다(≤60px). 예전엔 그립 + '게시글' 제목행 + 닫기가 3층으로 90.3px.
//   ② 닫기의 44px 터치 영역은 줄지 않았다(상단을 좁히느라 버튼을 깎지 않았다).
//   ③ 글 제목은 §5-2 규격(20–22px / 행간 1.32–1.48)이고 **최대 줄수로 자르지 않는다**.
//   ④ 본문 행간 1.65–1.75.
//   ⑤ (UI-03, 2026-09-13 교체 — 실행문 §7.1·§9.3) 댓글 면은 본문과 **이어지는 같은 지면**이고(예전 단언 "다른 색" 은 검은 띠의 원인이었다),
//      층 경계는 아우라 구분선(.divider-aura, 1px·양끝 투명·중앙 accent)이 말하며, 댓글 **입력창**만 한 단계 다른 면이다.
//      댓글 구역은 full-bleed 가 아니다(본문과 같은 좌우 안쪽 선). 다크·라이트 둘 다.
//   ⑥ PC 2-pane 읽기 폭 ≥ 600px.
//   (UI-02, 2026-09-13: 독립 열기는 sheet → **page 전체화면**으로 바뀌었다. ①의 '한 행' 은 이제 compact page 헤더(≈35px)다.
//    전체화면 셸·닫는 길 3종·이전/다음은 e2e/post-nav.spec.ts 가 잰다. 2-pane 인라인(⑥)은 바이트 동일.)
//   ⑦ 사진 한 장은 크롭하지 않는다(object-fit: contain).
//   ⑧ 잘림 0 — 감추는 요소(hidden/clip/말줄임)에서 **가로·세로 둘 다** 넘치지 않는다.
//
// ⚠ 목킹은 **핸들러 하나**('**/*')다. 여러 개를 겹치면 route.continue() 가 조용히 실네트워크로 나가
//   운영 Supabase 에 요청이 도달한다(2026-09-12 실사고). 그래서 _fixtures 의 test 를 쓰지 않고
//   base test + 단일 핸들러를 쓴다 — 로컬(baseURL) 외의 어떤 요청도 continue 하지 않는다.
import { test, expect, type Page, type Route } from '@playwright/test';

const LONG_URL = 'https://example.com/tournaments/2026/seoul-main-event-registration-and-schedule?utm_source=nuri&utm_campaign=verylongparam';
const BODY = [
  '[화면 점검용 예시 글입니다. 실제 게시물이 아닙니다.]',
  '',
  '처음 방문하는 매장에서 대회에 참가할 때 무엇부터 확인하면 좋을까요?',
  '',
  `참고 링크: ${LONG_URL}`,
  '',
  '띄어쓰기없이아주긴한국어단어를넣어서줄바꿈이한글자씩세로로쌓이지않는지확인합니다',
].join('\n');

const TITLE = '처음 방문하는 매장, 대회 참가 전에 확인하고 싶은 내용';
// ⚠ 포트를 하드코딩하지 않는다. 병렬 배치는 팀마다 다른 포트로 preview 를 띄우는데,
//   여기에 4173 을 박아 두면 다른 포트에서 **앱 자신의 JS·CSS 까지 `[]` 로 응답**해 부팅이 통째로 막힌다
//   (실제로 다른 포트에서 6건이 '커뮤니티 하위탭 바가 없다' 로 무더기 실패했다 — 회귀가 아니라 이 하드코딩 탓이었다).
const POSTER_PATH = '/__pd-fixture-poster.png';

const postRow = (over: Record<string, unknown> = {}) => ({
  id: 'pd-1', user_id: 'pd-u1', user_name: '화면 점검용 작성자', user_role: 'user',
  user_color: '#8B5CF6', user_avatar: null,
  content: BODY, created_at: '2026-09-12T09:00:00Z',
  like_count: 3, comment_count: 0, view_count: 12,
  category: 'free', title: TITLE, images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  ...over,
});

const postsWith = (poster: string) => [postRow(), postRow({ id: 'pd-2', title: '세로 포스터가 붙은 글', content: '포스터 확인 부탁드립니다.', images: [poster] })];

const COMMENTS = Array.from({ length: 6 }, (_, i) => ({
  id: `pd-c${i}`, post_id: 'pd-1', parent_id: null, user_id: `pd-cu${i}`,
  user_name: `댓글쓴이${i}`, user_role: 'user', is_owner: false,
  content: `댓글 예시 ${i}`, created_at: '2026-09-12T09:30:00Z',
}));

/** 세로 포스터(2:5) — 글이 이미지 안에 들어 있는 안내문 대역. 크롭되면 문장이 잘린다. */
const POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1000" viewBox="0 0 400 1000"><rect width="400" height="1000" fill="#1b1030"/><text x="200" y="120" fill="#fff" font-size="46" text-anchor="middle">맨 위 줄</text><text x="200" y="920" fill="#fff" font-size="46" text-anchor="middle">맨 아래 줄</text></svg>`;

async function install(page: Page, baseURL: string) {
  const ORIGIN = new URL(baseURL).origin;
  const POSTER = ORIGIN + POSTER_PATH;
  const j = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.context().route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('__pd-fixture-poster.png')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: POSTER_SVG });
    if (url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    // ── 여기부터는 전부 외부다. **절대 continue 하지 않는다.**
    if (/\/rest\/v1\/community_posts\?/.test(url)) return j(route, postsWith(POSTER));
    if (/\/rest\/v1\/comments\?/.test(url)) return j(route, COMMENTS);
    if (/\/rest\/v1\/shop_skus/.test(url)) return j(route, [
      { key: 'cheer', kind: 'cheer', label: '응원', descr: '', price: 30, duration_hours: 0, duration_seconds: 0, tier_rank: 1, sort: 1 },
      { key: 'bump', kind: 'bump', label: '끌올', descr: '', price: 100, duration_hours: 3, duration_seconds: 0, tier_rank: 1, sort: 2 },
    ]);
    if (/\/auth\/v1\//.test(url)) return route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
    return j(route, []);
  });
}

async function openPost(page: Page, title = TITLE) {
  await page.goto('/?tab=community');
  const bar = page.locator('[data-community-secbar]');
  await expect(bar, '커뮤니티 하위탭 바가 없다').toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await page.getByText(title).filter({ visible: true }).first().click();
  const root = page.locator('[data-pd-root]');
  await expect(root, '게시글 상세가 열리지 않았다').toBeVisible({ timeout: 15_000 });
  // ⚠ 진입 애니메이션(animate-sheet-up, 0.26s)이 도는 동안에는 **두 번의 boundingBox 호출이
  //   서로 다른 프레임을 잰다** — 시트가 올라오는 중이라 '창 상단 → 본문 상단' 거리가 113px·175px 처럼
  //   무작위로 나온다(실측). 자리가 잡힐 때까지 기다린 뒤에 잰다.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-pd-root]');
    const shell = el?.closest('[role="dialog"]') ?? el?.parentElement;
    return !!shell && shell.getAnimations().every((a) => a.playState !== 'running');
  }, undefined, { timeout: 10_000 });
  return root;
}

/** 창 상단 → 본문(article) 상단까지의 실제 거리 — **한 프레임 안에서** 두 rect 를 같이 읽는다. */
async function topBlockHeight(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-pd-root]')!;
    const shell = el.closest('[role="dialog"]') ?? el.parentElement!;
    return el.getBoundingClientRect().top - shell.getBoundingClientRect().top;
  });
}

/** 창(시트 또는 2-pane 패널) 안에서 **실제로 감춰진 채 넘친** 요소들 — 가로·세로 둘 다 본다. */
async function clippedNodes(page: Page) {
  return page.evaluate(() => {
    const article = document.querySelector('[data-pd-root]')!;
    const shell = article.closest('[role="dialog"]') ?? article.parentElement!;
    const out: { cls: string; ox: number; oy: number; t: string }[] = [];
    for (const el of Array.from(shell.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      const ox = el.scrollWidth - el.clientWidth, oy = el.scrollHeight - el.clientHeight;
      const hidX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const hidY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if ((hidX && ox > 1) || (hidY && oy > 1) || (cs.textOverflow === 'ellipsis' && ox > 1)) {
        out.push({ cls: String((el as HTMLElement).className).slice(0, 60), ox, oy, t: (el.textContent ?? '').slice(0, 20) });
      }
    }
    return out;
  });
}

const px = async (loc: ReturnType<Page['locator']>, prop: string) =>
  Number((await loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)).replace('px', ''));

test.describe('게시글 상세 — 읽는 화면(§5)', () => {
  test('🔴 모바일 상단은 한 행(≤60px)이고 닫기 44px 터치 영역은 그대로다', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, baseURL);
    const root = await openPost(page);

    const shell = page.locator('[role="dialog"]').filter({ has: page.locator('[data-pd-root]') });
    const header = shell.locator('header').first();
    await expect(header, '창 상단 조작행이 없다').toBeVisible();
    const hb = (await header.boundingBox())!;
    expect(hb.height, `상단 조작행이 ${hb.height}px — 한 행(48~60px)을 넘었다`).toBeLessThanOrEqual(60);

    const close = shell.locator('button[aria-label="닫기"]').first();
    await expect(close, '닫기 버튼이 없다').toBeVisible();
    const cb = (await close.boundingBox())!;
    expect(cb.height, `닫기 터치 높이 ${cb.height}px — 44px 미만으로 깎였다`).toBeGreaterThanOrEqual(44);
    expect(cb.width).toBeGreaterThanOrEqual(44);

    // 글 내용은 상단 바로 아래에서 시작한다 — 창 장식이 첫 화면을 먹지 않는다
    await expect(root).toBeVisible();
    const top = await topBlockHeight(page);
    expect(top, `상단 블록(그립+제목행)이 ${top.toFixed(1)}px — 60px 를 넘게 쌓였다`).toBeLessThanOrEqual(60);
  });

  test('🔴 제목·본문이 읽기 규격이고, 제목을 최대 줄수로 자르지 않는다', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, baseURL);
    await openPost(page);

    const title = page.locator('[data-pd-title]');
    await expect(title, '글 제목이 화면에 없다').toBeVisible();
    const tSize = await px(title, 'font-size');
    const tLine = await px(title, 'line-height');
    expect(tSize, `제목 ${tSize}px — §5-2 모바일 20~22px 밖`).toBeGreaterThanOrEqual(20);
    expect(tSize).toBeLessThanOrEqual(22.5);
    expect(tLine / tSize, `제목 행간 ${(tLine / tSize).toFixed(2)} — 1.32~1.48 밖`).toBeGreaterThanOrEqual(1.32);
    expect(tLine / tSize).toBeLessThanOrEqual(1.48);
    // 최대 줄수로 자르지 않는다
    const clamp = await title.evaluate((el) => getComputedStyle(el).webkitLineClamp);
    expect(clamp === 'none' || clamp === '' , `제목에 line-clamp(${clamp})가 걸렸다`).toBeTruthy();
    // 한 글자씩 세로로 쌓이지 않는다 — 두 줄이어도 높이는 (행간 × 줄수)를 크게 넘지 않는다
    const tb = (await title.boundingBox())!;
    expect(tb.height, '제목이 과도하게 세로로 쌓였다(한 글자씩 줄바꿈 의심)').toBeLessThan(tLine * 4);

    const body = page.locator('[data-pd-body]');
    await expect(body, '본문이 화면에 없다').toBeVisible();
    const bSize = await px(body, 'font-size');
    const bLine = await px(body, 'line-height');
    expect(bLine / bSize, `본문 행간 ${(bLine / bSize).toFixed(3)} — §5-2 의 1.65~1.75 밖`).toBeGreaterThanOrEqual(1.65);
    expect(bLine / bSize).toBeLessThanOrEqual(1.75);

    // 긴 URL·띄어쓰기 없는 입력이 있어도 가로로 넘치지 않는다
    expect(await clippedNodes(page), '잘린 요소가 있다').toEqual([]);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`🔴 댓글은 본문과 이어지는 같은 지면 + 아우라 구분선 + 입력창만 다른 면 (${theme})`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t as string); } catch { /* 저장소 차단 */ } }, theme);
      await install(page, baseURL);
      await openPost(page);

      const g = await page.evaluate(() => {
        const opaque = (el: Element | null): string => {
          let n: Element | null = el;
          while (n) {
            const bg = getComputedStyle(n).backgroundColor;
            if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
            n = n.parentElement;
          }
          return '';
        };
        const body = document.querySelector('[data-pd-body]')!;
        const comments = document.querySelector('[data-pd-comments]')!;
        const article = document.querySelector('[data-pd-root]')!;
        // 본문과 댓글 사이의 구분선 — 문서 순서상 본문 뒤·댓글 앞에 있는 마지막 divider-aura
        const hrs = Array.from(article.querySelectorAll('hr.divider-aura'));
        const between = hrs.filter((h) => (body.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) && (h.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING));
        // 본문 뒤에는 반응 줄의 선도 있다 — 댓글 **바로 앞** 형제만 경계선이다
        const hr = between.find((h) => h.nextElementSibling === comments) ?? null;
        // 입력 자리 — 로그인 상태면 .input(textarea), 비로그인(이 픽스처)이면 '로그인하면 댓글을…' CTA(같은 surface-high 면)
        const input = comments.querySelector<HTMLElement>('textarea, input[type="text"], .input')
          ?? Array.from(comments.querySelectorAll<HTMLElement>('button')).find((b) => /로그인하면 댓글/.test(b.textContent ?? ''))
          ?? null;
        const hcs = hr ? getComputedStyle(hr) : null;
        return {
          bodyGround: opaque(body), commentsGround: opaque(comments),
          bodyLeft: body.getBoundingClientRect().left, commentsLeft: comments.getBoundingClientRect().left,
          commentsBgSelf: getComputedStyle(comments).backgroundColor,
          hrCount: hr ? 1 : 0, betweenCount: between.length, hrH: hr ? hr.getBoundingClientRect().height : -1,
          hrImage: hcs?.backgroundImage ?? '', hrBorder: hcs?.borderTopWidth ?? '', hrAnims: hr ? hr.getAnimations().length : -1,
          inputBg: input ? getComputedStyle(input).backgroundColor : '',
          totalAuraLines: hrs.length,
        };
      });
      expect(g.bodyGround, '본문 지면을 못 읽었다').not.toBe('');
      // ① 이어지는 지면 — 댓글 section 자신은 배경을 칠하지 않고, 합성 지면이 본문과 같다
      expect(g.commentsBgSelf).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(g.commentsGround, `댓글 면(${g.commentsGround})이 본문 면(${g.bodyGround})과 다르다 — 검은 띠가 돌아왔다`).toBe(g.bodyGround);
      // ② full-bleed 가 아니다 — 본문과 같은 왼쪽 안쪽 선(음수 마진 없음)
      expect(Math.abs(g.commentsLeft - g.bodyLeft), `댓글 구역 왼쪽 ${g.commentsLeft} vs 본문 ${g.bodyLeft} — 화면 끝까지 번진다`).toBeLessThanOrEqual(1);
      // ③ 본문→댓글 경계에 아우라 구분선 하나 — 1px 실체, 그라데이션(양끝 투명), border 아님, 애니메이션 0
      expect(g.hrCount, '댓글 바로 앞에 divider-aura 가 없다').toBe(1);
      expect(g.betweenCount, '본문→댓글 사이 선은 반응 줄 + 댓글 경계 둘').toBe(2);
      expect(g.hrH).toBeGreaterThanOrEqual(0.5);
      expect(g.hrH).toBeLessThanOrEqual(1.5);
      expect(g.hrImage).toMatch(/linear-gradient\(/);
      expect(g.hrImage, '양끝이 투명이 아니다').toMatch(/rgba\(0, 0, 0, 0\)/);
      expect(g.hrBorder).toBe('0px');
      expect(g.hrAnims).toBe(0);
      // ④ 독서 경계 세 곳(작성자→본문 · 반응 줄 · 본문→댓글)이 같은 스타일 하나를 쓴다
      expect(g.totalAuraLines).toBe(3);
      // ⑤ 입력창만 한 단계 다른 면 — 지면과 실제로 다른 색
      expect(g.inputBg, '댓글 입력창을 못 찾았다').not.toBe('');
      expect(g.inputBg, '댓글 입력창이 지면에 흡수됐다').not.toBe(g.commentsGround);
    });
  }

  test('🔴 PC 2-pane 에서 읽기 폭이 600px 이상이다', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await install(page, baseURL);
    await openPost(page);
    const body = page.locator('[data-pd-body]');
    await expect(body).toBeVisible();
    const bb = (await body.boundingBox())!;
    expect(bb.width, `2-pane 본문 읽기 폭 ${bb.width}px — 목록을 남긴 가용 폭을 쓰지 못한다`).toBeGreaterThanOrEqual(600);
    expect(await clippedNodes(page), 'PC 2-pane 에서 잘린 요소가 있다').toEqual([]);
  });

  test('🔴 사진 한 장은 크롭하지 않는다 — 세로 포스터의 아래쪽이 잘리지 않는다', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, baseURL);
    await openPost(page, '세로 포스터가 붙은 글');
    const img = page.locator('[data-pd-root] img[alt="첨부 사진 1"]');
    await expect(img, '첨부 사진이 렌더되지 않았다').toBeVisible({ timeout: 10_000 });
    const fit = await img.evaluate((el) => getComputedStyle(el).objectFit);
    expect(fit, `한 장짜리 첨부가 object-fit:${fit} — 세로 포스터의 글이 잘린다`).toBe('contain');
    // 전체 확인 경로(라이트박스) 는 살아 있다
    await expect(page.getByRole('button', { name: '첨부 사진 1 확대 보기' })).toBeVisible();
  });
});
