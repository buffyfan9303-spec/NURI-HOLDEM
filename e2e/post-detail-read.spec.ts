// 게시글 상세 = **읽는 화면** 계약 (실행문 §5, 2026-09-12)
//
// 이 스펙이 잠그는 것 — 전부 "고쳤다"가 아니라 "다시 나빠지면 여기서 걸린다":
//   ① 모바일 상단 조작행이 한 행이다(≤60px). 예전엔 그립 + '게시글' 제목행 + 닫기가 3층으로 90.3px.
//   ② 닫기의 44px 터치 영역은 줄지 않았다(상단을 좁히느라 버튼을 깎지 않았다).
//   ③ 글 제목은 §5-2 규격(20–22px / 행간 1.32–1.48)이고 **최대 줄수로 자르지 않는다**.
//   ④ 본문 행간 1.65–1.75.
//   ⑤ (UI-Aura, 2026-09-14 재교체 — design 실측: compact 셸을 surface-mid 로 고치자 본문·댓글이 전부 투명이라
//      인접 면 대비가 1.00 이었다·오너가 말한 "단색 잔상") 댓글 section 은 이제 **본문과 다른 지면**(테두리
//      있는 우물 — border-strong 2.71:1(다크)/3.16:1(라이트) + bg-surface-base)이고, full-bleed 는 아니다
//      (본문과 같은 좌우 안쪽 선 — §5-1 이 겪은 "화면을 가로지르는 검은 띠"와는 다른 모양). 경계는 이제
//      본문→댓글 hr(border-t border-border-strong, 옛 divider-aura 대체)로도 다시 한 번 말한다. 다크·라이트 둘 다.
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
import { SUPABASE_URL } from './_session';

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

const COMMENTS = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `pd-c${i}`, post_id: 'pd-1', parent_id: null, user_id: `pd-cu${i}`,
    user_name: `댓글쓴이${i}`, user_role: 'user', is_owner: false,
    content: `댓글 예시 ${i}`, created_at: '2026-09-12T09:30:00Z',
  })),
  // P2(2026-09-21): 루트 댓글뿐 아니라 **답글 본문**도 14px 계약 대상이라 답글 1건을 픽스처에 둔다.
  { id: 'pd-c-reply', post_id: 'pd-1', parent_id: 'pd-c0', user_id: 'pd-cu-reply',
    user_name: '답글쓴이', user_role: 'user', is_owner: false,
    content: '답글 예시', created_at: '2026-09-12T09:31:00Z' },
];

/** 세로 포스터(2:5) — 글이 이미지 안에 들어 있는 안내문 대역. 크롭되면 문장이 잘린다. */
const POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1000" viewBox="0 0 400 1000"><rect width="400" height="1000" fill="#1b1030"/><text x="200" y="120" fill="#fff" font-size="46" text-anchor="middle">맨 위 줄</text><text x="200" y="920" fill="#fff" font-size="46" text-anchor="middle">맨 아래 줄</text></svg>`;

/** 🔴 C1(2026-09-20) — 로그인한 **남의 글** 독자. 신고·차단이 실제로 생기는 유일한 조건이라,
 *  이게 없으면 `…` 메뉴 검사가 "메뉴가 없어도 통과"하는 빈 검사가 된다.
 *  ⚠ 여전히 핸들러는 **하나**다(위 주석의 2026-09-12 실사고 — 여러 개를 겹치면 continue 가 실네트워크로 샌다). */
const READER_UID = 'pd-reader-1';
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const READER_SESSION = {
  access_token: [b64u({ alg: 'HS256', typ: 'JWT' }), b64u({ sub: READER_UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.'),
  refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: READER_UID, aud: 'authenticated', role: 'authenticated', email: 'reader@example.com', app_metadata: {}, user_metadata: { name: '읽는사람' }, created_at: '2026-01-01T00:00:00Z' },
};

async function install(page: Page, baseURL: string | undefined, opts: { loggedIn?: boolean } = {}) {
  // Playwright 픽스처의 baseURL 은 `string | undefined` 다. 예전엔 `string` 으로 받아
  //   호출부 6곳이 전부 타입 오류였는데 **e2e 는 tsc 대상이 아니라 아무도 못 봤다**(§0-a22).
  //   없으면 `new URL(undefined)` 가 알 수 없는 TypeError 를 던진다 — 여기서 크게, 말이 되게 실패시킨다.
  if (!baseURL) throw new Error('baseURL 이 없다 — playwright.config 의 use.baseURL 또는 E2E_BASE_URL 을 확인해라');
  const ORIGIN = new URL(baseURL).origin;
  const POSTER = ORIGIN + POSTER_PATH;
  const j = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (opts.loggedIn) {
    // 세션 키 형식은 `_mockOwner` 와 같은 출처(supabase-js v2: `sb-<ref>-auth-token`)를 쓴다.
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 저장소 차단 */ } },
      [`sb-${ref}-auth-token`, JSON.stringify(READER_SESSION)] as [string, string]);
  }
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
    if (opts.loggedIn && /\/rest\/v1\/profiles\?/.test(url) && route.request().method() === 'GET') {
      return j(route, {
        id: READER_UID, name: '읽는사람', nickname: '읽는사람', role: 'user', approved: false, status: 'active',
        venue_id: null, activity_points: 0, created_at: '2026-01-01T00:00:00Z',
      });
    }
    if (/\/auth\/v1\//.test(url)) {
      return opts.loggedIn
        ? j(route, READER_SESSION.user)
        : route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
    }
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

/** 창(시트 또는 2-pane 패널) 안에서 **실제로 감춰진 채 넘친** 요소들 — 가로·세로 둘 다 본다.
 *  P3(2026-09-21): `clippedNodes()`는 원래 의도한 CSS 말줄임도 결함으로 잡았다. `data-pd-nav-text`
 *  (모바일 탐색 제목) **만** computed `overflow-x:hidden`·`white-space:nowrap`·`text-overflow:ellipsis`·
 *  한 줄 높이와 실제 `scrollWidth>clientWidth` 가 **전부** 확인된 경우에 한해 `navEllipsis` 로 분리하고
 *  결함 목록(`out`)에서 뺀다. 다른 노드·세로 잘림은 그대로 `out`에 남아 실패시킨다 — 예외 범위를
 *  넓히지 않는다. */
async function clippedNodes(page: Page) {
  return page.evaluate(() => {
    const article = document.querySelector('[data-pd-root]')!;
    const shell = article.closest('[role="dialog"]') ?? article.parentElement!;
    const out: { cls: string; ox: number; oy: number; t: string }[] = [];
    const navEllipsis: { t: string; ox: number }[] = [];
    for (const el of Array.from(shell.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      const ox = el.scrollWidth - el.clientWidth, oy = el.scrollHeight - el.clientHeight;
      const hidX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const hidY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (!((hidX && ox > 1) || (hidY && oy > 1) || (cs.textOverflow === 'ellipsis' && ox > 1))) continue;
      if (el.hasAttribute('data-pd-nav-text')) {
        const line = parseFloat(cs.lineHeight) || 0;
        const oneLine = oy <= 1 && line > 0 && el.clientHeight <= line + 1;
        const cssEllipsis = hidX && cs.whiteSpace === 'nowrap' && cs.textOverflow === 'ellipsis';
        if (cssEllipsis && oneLine && ox > 1) {
          navEllipsis.push({ t: (el.textContent ?? '').slice(0, 60), ox });
          continue; // 의도한 가로 말줄임 — 결함이 아니다
        }
      }
      out.push({ cls: String((el as HTMLElement).className).slice(0, 60), ox, oy, t: (el.textContent ?? '').slice(0, 20) });
    }
    return { out, navEllipsis };
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
    // 🔴 C1(2026-09-20 오너 시안) — 20~22.5px → **24~28.5px**. 시안의 제목/본문 비가 약 1.7 인데
    //   종전 구현은 1.25 라 "제목처럼" 읽히지 않았다(문서 C1-2-2 의 '390 기준 제목 26~28px').
    //   지금은 `text-2xl` = 25.5px(루트 17px). 아래 행간 비(1.32~1.48)는 **그대로** 지킨다 —
    //   크기만 올리고 행간 규격을 같이 푸는 것은 계약을 느슨하게 만드는 것이라 하지 않는다.
    // 🔴 POST-DETAIL-DENSITY(2026-09-24 오너 "글씨 크기 줄여 한 화면에 더 많이") — 25.5px → **20px**(19.5~21.5).
    //   본문 15px 대비 1.33 배라 제목 위계는 남는다. 행간 비 계약은 그대로다.
    expect(tSize, `제목 ${tSize}px — 모바일 19.5~21.5px 밖`).toBeGreaterThanOrEqual(19.5);
    expect(tSize).toBeLessThanOrEqual(21.5);
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
    expect((await clippedNodes(page)).out, '잘린 요소가 있다').toEqual([]);
  });

  // 🔴 C1(2026-09-20 오너 시안) — **모바일은 두 개의 형제 카드**다(게시글 카드 / 댓글 카드).
  //   종전 이 자리의 계약은 "댓글은 본문과 같은 좌우 안쪽 선에 있는 우물" 이었는데, 그건 본문이
  //   article 직속이던 시절의 수치다. 지금 본문은 카드 **안쪽**이라 좌우가 카드 패딩만큼 더 들어간다 —
  //   옛 단언을 그대로 두면 정상 구현이 빨개진다. 느슨하게 푸는 대신 **새 구조를 더 강하게** 잠근다:
  //     · 두 카드가 서로 **형제**다(댓글이 게시글 카드 안에 있으면 "한 카드 속 우물" = 문서가 못박은 실패)
  //     · 두 카드의 좌우 경계와 반지름이 **같다**
  //     · 두 면이 서로 **다르다**(구분이 없으면 카드가 두 개로 안 읽힌다)
  //   PC 우물 계약은 아래 별도 테스트로 **그대로 남는다** — 이 변경은 모바일 전용이다.
  for (const theme of ['dark', 'light'] as const) {
    test(`🔴 C1 모바일 — 게시글·댓글이 형제 카드고 면이 서로 다르다 (${theme})`, async ({ page, baseURL }) => {
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
        const card = document.querySelector<HTMLElement>('[data-pd-post-card]');
        const comments = document.querySelector<HTMLElement>('[data-pd-comments]');
        const body = document.querySelector<HTMLElement>('[data-pd-body]');
        const nav = document.querySelector<HTMLElement>('[data-pd-nav]');
        const article = document.querySelector<HTMLElement>('[data-pd-root]')!;
        if (!card || !comments || !body || !nav) return null;
        const cs = getComputedStyle(card), ks = getComputedStyle(comments);
        const cr = card.getBoundingClientRect(), kr = comments.getBoundingClientRect();
        const input = comments.querySelector<HTMLElement>('textarea, input[type="text"], .input')
          ?? Array.from(comments.querySelectorAll<HTMLElement>('button')).find((b) => /로그인하면 댓글/.test(b.textContent ?? ''))
          ?? null;
        // P2(2026-09-21): 루트 댓글/답글 본문 <p> — 답글은 `.border-l`(스레드 세로선) 안에 있다.
        const replyP = comments.querySelector<HTMLElement>('.border-l p');
        const rootP = Array.from(comments.querySelectorAll<HTMLElement>('p')).find((p) => p !== replyP) ?? null;
        return {
          카드display: cs.display,
          카드면: cs.backgroundColor, 댓글면: ks.backgroundColor,
          카드지면: opaque(card), 댓글지면: opaque(comments),
          // 셸(창) 지면 — 두 카드가 **그 위에 떠 보이는가**가 진짜 계약이다.
          //   두 카드끼리만 비교하면 안 된다: 라이트에서 둘 다 같은 톤인 것이 시안이고(오너 이미지),
          //   그래도 페이지와 다르면 카드로 읽힌다. 반대로 카드가 셸과 같은 색이면 카드가 사라진다.
          셸지면: opaque((document.querySelector('[data-pd-root]')!.closest('[role="dialog"]') ?? document.querySelector('[data-pd-root]')!.parentElement)),
          카드테두리: cs.borderTopWidth, 카드반지름: parseFloat(cs.borderTopLeftRadius), 댓글반지름: parseFloat(ks.borderTopLeftRadius),
          좌차: +Math.abs(cr.left - kr.left).toFixed(2), 우차: +Math.abs(cr.right - kr.right).toFixed(2),
          // ⚠ 간격은 **rect 로 재면 안 된다.** 댓글 section 은 `.reveal`(스크롤 구동 애니메이션)이라
          //   화면 아래에 있는 동안 `translateY(18px)` 가 걸려 있다 — rect 로는 17px 레이아웃 간격이
          //   34px 로 보인다(실측). transform 을 타지 않는 `offsetTop/offsetHeight` 로 잰다.
          //   (둘의 offsetParent 가 같아야 뺄셈이 성립한다 — 아래에서 함께 확인한다.)
          같은offsetParent: card.offsetParent === comments.offsetParent,
          카드간격: comments.offsetTop - (card.offsetTop + card.offsetHeight),
          // P1(2026-09-21): 댓글→탐색(둘째 간격)도 같은 방식으로 — nav 는 `.reveal` transform 이 없지만
          //   offsetTop/Height 는 애초에 transform 의 영향을 받지 않으므로 같은 계산이 그대로 맞다.
          같은offsetParent2: comments.offsetParent === nav.offsetParent,
          탐색간격: nav.offsetTop - (comments.offsetTop + comments.offsetHeight),
          본문이카드안: card.contains(body),
          댓글이카드안: card.contains(comments),
          // 모바일에서 보이는 독서 경계선 — 시안은 작성자↔본문 한 줄뿐이다(나머지는 max-lg:hidden).
          보이는선: Array.from(article.querySelectorAll<HTMLElement>('hr')).filter((h) => getComputedStyle(h).display !== 'none').length,
          입력면: input ? getComputedStyle(input).backgroundColor : '',
          문서가로넘침: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          // P2(2026-09-21): 본문 16px·루트 댓글/답글 본문 14px — 모바일 computed 값을 좁게 잰다.
          본문글꼴: parseFloat(getComputedStyle(body).fontSize),
          루트댓글글꼴: rootP ? parseFloat(getComputedStyle(rootP).fontSize) : -1,
          답글글꼴: replyP ? parseFloat(getComputedStyle(replyP).fontSize) : -1,
        };
      });
      expect(g, 'data-pd-post-card / data-pd-comments / data-pd-body / data-pd-nav 중 하나를 못 찾았다').not.toBeNull();
      const m = g!;
      // ① 모바일에서는 카드가 **실체**다. `lg:contents` 가 모바일까지 새면 여기서 걸린다.
      expect(m.카드display, '모바일인데 게시글 카드가 display:contents 다 — 카드가 아예 안 그려진다').not.toBe('contents');
      expect(m.카드면, '게시글 카드가 스스로 면을 안 칠한다').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(m.카드테두리, '게시글 카드에 윤곽이 없다').not.toBe('0px');
      expect(m.카드반지름, `게시글 카드 반지름 ${m.카드반지름}px — 시안은 둥근 카드다`).toBeGreaterThanOrEqual(20);
      // ② 두 카드는 **형제**다. 댓글이 카드 안에 들어가면 "한 카드 속 작은 우물"(문서가 실패로 못박음).
      expect(m.본문이카드안, '본문이 게시글 카드 밖에 있다').toBe(true);
      expect(m.댓글이카드안, '댓글이 게시글 카드 **안**에 있다 — 형제 카드가 아니라 우물이다').toBe(false);
      // ③ 좌우 경계와 반지름이 맞는다.
      expect(m.좌차, `두 카드 왼쪽이 ${m.좌차}px 어긋났다`).toBeLessThanOrEqual(1);
      expect(m.우차, `두 카드 오른쪽이 ${m.우차}px 어긋났다`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.카드반지름 - m.댓글반지름), '두 카드 모서리 반지름이 다르다').toBeLessThanOrEqual(1);
      // ④ 세로 간격 — P1(2026-09-21): 첫 간격(카드→댓글) 10~16px, 둘째 간격(댓글→탐색) 14~20px 로 좁게 잰다.
      expect(m.같은offsetParent, '두 카드의 offsetParent 가 달라 간격 뺄셈이 성립하지 않는다 — 이 단언이 무의미해졌다').toBe(true);
      expect(m.카드간격, `카드→댓글 간격이 ${m.카드간격}px 다 — P1 모바일 10~16px 계약 밖`).toBeGreaterThanOrEqual(10);
      expect(m.카드간격, `카드→댓글 간격이 ${m.카드간격}px 다 — P1 모바일 10~16px 계약 밖`).toBeLessThanOrEqual(16);
      expect(m.같은offsetParent2, '댓글과 탐색의 offsetParent 가 달라 간격 뺄셈이 성립하지 않는다').toBe(true);
      expect(m.탐색간격, `댓글→탐색 간격이 ${m.탐색간격}px 다 — P1 모바일 14~20px 계약 밖`).toBeGreaterThanOrEqual(14);
      expect(m.탐색간격, `댓글→탐색 간격이 ${m.탐색간격}px 다 — P1 모바일 14~20px 계약 밖`).toBeLessThanOrEqual(20);
      // P2: 루트 댓글/답글 본문 14px. 본문은 POST-DETAIL-DENSITY(2026-09-24)로 16 → **15px**(오너 하한 15px).
      expect(m.본문글꼴, `본문 글꼴이 ${m.본문글꼴}px 다 — 모바일 15px 계약 밖`).toBeCloseTo(15, 0);
      expect(m.루트댓글글꼴, `루트 댓글 본문을 못 찾았거나 ${m.루트댓글글꼴}px 다 — P2 모바일 14px 계약 밖`).toBeCloseTo(14, 0);
      expect(m.답글글꼴, `답글 본문을 못 찾았거나 ${m.답글글꼴}px 다 — P2 모바일 14px 계약 밖`).toBeCloseTo(14, 0);
      // ⑤ 두 카드가 **셸 위에 떠 보인다.** 카드가 지면과 같은 색이면 카드라는 사실 자체가 사라진다.
      //    ⚠ 라이트는 `surface-low == surface-mid == #FFFFFF` 라 이게 실제로 났었다(댓글 카드가 흰 지면에
      //      흡수). 두 카드끼리만 비교하는 단언으로는 **그때도 통과했다** — 그래서 셸 기준으로 잰다.
      expect(m.셸지면, '셸 지면을 못 읽었다 — 이 단언이 빈 검사가 됐다').not.toBe('');
      expect(m.카드지면, `게시글 카드 면(${m.카드지면})이 셸 지면(${m.셸지면})과 같다 — 카드가 안 보인다`).not.toBe(m.셸지면);
      expect(m.댓글지면, `댓글 카드 면(${m.댓글지면})이 셸 지면(${m.셸지면})과 같다 — 카드가 안 보인다`).not.toBe(m.셸지면);
      // ⑥ 모바일 경계선은 하나뿐 — 카드 경계가 이미 층을 말하므로 선을 더 그으면 중복이다.
      expect(m.보이는선, `모바일에 보이는 구분선이 ${m.보이는선}개다 — 시안은 작성자↔본문 한 줄뿐이다`).toBe(1);
      // ⑦ 입력창은 또 한 단계 다른 면(종전 계약 유지).
      expect(m.입력면, '댓글 입력창을 못 찾았다').not.toBe('');
      expect(m.입력면, '댓글 입력창이 지면에 흡수됐다').not.toBe(m.댓글지면);
      expect(m.문서가로넘침, '카드를 넣으면서 문서가 가로로 넘쳤다').toBeLessThanOrEqual(0);
      expect((await clippedNodes(page)).out, `C1 ${theme} 모바일에서 잘린 요소가 있다`).toEqual([]);
    });
  }

  // PC 계약은 **그대로 남는다** — 2-pane·1280 이상은 이번 시안의 대상이 아니다(문서 C1-1).
  for (const theme of ['dark', 'light'] as const) {
    test(`🔴 PC — 댓글 section 은 본문과 다른 지면(우물) + border-strong 경계선 3곳 (${theme})`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
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
        // 본문과 댓글 사이의 구분선 — 문서 순서상 본문 뒤·댓글 앞에 있는 마지막 border-strong 실선(옛 divider-aura 대체)
        const hrs = Array.from(article.querySelectorAll('hr.border-border-strong'));
        const between = hrs.filter((h) => (body.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) && (h.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING));
        // 본문 뒤에는 반응 줄의 선도 있다 — 댓글 **바로 앞** 형제만 경계선이다
        const hr = between.find((h) => h.nextElementSibling === comments) ?? null;
        // 입력 자리 — 로그인 상태면 .input(textarea), 비로그인(이 픽스처)이면 '로그인하면 댓글을…' CTA(같은 surface-high 면)
        const input = comments.querySelector<HTMLElement>('textarea, input[type="text"], .input')
          ?? Array.from(comments.querySelectorAll<HTMLElement>('button')).find((b) => /로그인하면 댓글/.test(b.textContent ?? ''))
          ?? null;
        const hcs = hr ? getComputedStyle(hr) : null;
        const ccs = getComputedStyle(comments);
        return {
          bodyGround: opaque(body), commentsGround: opaque(comments),
          bodyLeft: body.getBoundingClientRect().left, commentsLeft: comments.getBoundingClientRect().left,
          commentsBgSelf: ccs.backgroundColor,
          commentsBorderW: ccs.borderTopWidth, commentsBorderColor: ccs.borderTopColor,
          hrCount: hr ? 1 : 0, betweenCount: between.length, hrH: hr ? hr.getBoundingClientRect().height : -1,
          hrImage: hcs?.backgroundImage ?? '', hrBorder: hcs?.borderTopWidth ?? '', hrBorderColor: hcs?.borderTopColor ?? '', hrAnims: hr ? hr.getAnimations().length : -1,
          inputBg: input ? getComputedStyle(input).backgroundColor : '',
          totalDividerLines: hrs.length,
        };
      });
      expect(g.bodyGround, '본문 지면을 못 읽었다').not.toBe('');
      // ① UI-Aura(2026-09-14): 댓글 section 은 이제 **자기 배경을 스스로 칠한다**(bg-surface-base) —
      //    본문과 같은 지면이면 인접 면 대비가 1.00(구분 자체가 없음)이라는 design 실측 결함을 이렇게 뒤집었다.
      //    옛 단언("본문과 같다")을 지운 게 아니라 **반대 방향으로 더 강하게** 건다: 다를 것 + 테두리가 있을 것.
      expect(g.commentsBgSelf, '댓글 section 이 스스로 배경을 안 칠한다 — 다시 투명해졌다').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(g.commentsGround, `댓글 면(${g.commentsGround})이 본문 면(${g.bodyGround})과 같다 — 면 구분이 다시 사라졌다`).not.toBe(g.bodyGround);
      expect(g.commentsBorderW, '댓글 section 에 경계 테두리가 없다').not.toBe('0px');
      expect(g.commentsBorderColor, '댓글 section 테두리가 투명하다').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      // ② full-bleed 가 아니다 — 본문과 같은 왼쪽 안쪽 선(음수 마진 없음). 우물이어도 여전히 지켜야 한다.
      expect(Math.abs(g.commentsLeft - g.bodyLeft), `댓글 구역 왼쪽 ${g.commentsLeft} vs 본문 ${g.bodyLeft} — 화면 끝까지 번진다`).toBeLessThanOrEqual(1);
      // ③ 본문→댓글 경계에 border-strong 실선 하나 — 1px 실체, 실제 border(배경 이미지 아님), 애니메이션 0
      expect(g.hrCount, '댓글 바로 앞에 경계선이 없다').toBe(1);
      expect(g.betweenCount, '본문→댓글 사이 선은 반응 줄 + 댓글 경계 둘').toBe(2);
      expect(g.hrH).toBeGreaterThanOrEqual(0.5);
      expect(g.hrH).toBeLessThanOrEqual(1.5);
      expect(g.hrImage, '옛 divider-aura 그라데이션 배경이 남아 있다').toBe('none');
      expect(g.hrBorder, 'border-strong 실선이 아니다(1px 가 아님)').toBe('1px');
      expect(g.hrBorderColor, '경계선 색이 투명하다').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      expect(g.hrAnims).toBe(0);
      // ④ 독서 경계 세 곳(작성자→본문 · 반응 줄 · 본문→댓글)이 같은 스타일 하나를 쓴다
      expect(g.totalDividerLines).toBe(3);
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
    expect((await clippedNodes(page)).out, 'PC 2-pane 에서 잘린 요소가 있다').toEqual([]);
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

  // 🔴 C1(2026-09-20 오너 시안) — 카드 맨 아래의 **외곽선 하나짜리 4등분 반응 트레이**.
  //   시안이 없애려던 것: 셀마다 테두리가 있는 중복 pill · 본문/반응 사이의 군더더기 구분선.
  //   이 검사가 잠그는 것: (a) 네 칸이 다 있다 (b) 서로 겹치지 않는다 (c) 각 칸이 44×44 이상이다
  //   (d) PC 알약 줄과 **동시에** 보이지 않는다 (e) 숫자를 감추거나 글자를 줄여서 맞추지 않았다.
  //   ⚠ `if (!tray) return` 같은 조용한 통로를 두지 않는다 — 트레이가 사라지면 실패여야 한다.
  for (const W of [320, 360, 390, 430] as const) {
    test(`🔴 C1 ${W}px — 반응 트레이 네 칸이 겹침 0·44px 이상이고 PC 알약과 동시에 안 뜬다`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width: W, height: 844 });
      await install(page, baseURL!);
      await openPost(page);

      const m = await page.evaluate(() => {
        const tray = document.querySelector<HTMLElement>('[aria-label="게시글 반응"]');
        if (!tray) return null;
        // ⚠ 히트 테스트 전에 트레이를 화면 안으로 끌어온다. `elementFromPoint` 는 **뷰포트 좌표**라
        //   화면 밖이면 무조건 null 이고, 그러면 "유효 터치 미달" 이라는 **거짓 실패**가 난다
        //   (320·360 에서 정확히 그랬다 — 폭이 좁을수록 본문이 길어져 트레이가 접힌 아래로 내려간다).
        tray.scrollIntoView({ block: 'center' });
        const cells = Array.from(tray.querySelectorAll<HTMLElement>('button'));
        const 겹침: string[] = [];
        for (let i = 0; i < cells.length; i++) {
          for (let k = i + 1; k < cells.length; k++) {
            const a = cells[i].getBoundingClientRect(), b = cells[k].getBoundingClientRect();
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 0.5 && oy > 0.5) 겹침.push(`${cells[i].textContent?.trim()}↔${cells[k].textContent?.trim()}`);
          }
        }
        // 글자가 자기 칸 밖으로 나갔는가 — 큰 카운트에서 충돌하면 여기서 보인다.
        const 글자넘침 = cells.map((c) => {
          const sp = c.querySelector('span');
          if (!sp) return null;
          const sr = sp.getBoundingClientRect(), br = c.getBoundingClientRect();
          const over = Math.max(0, br.left - sr.left) + Math.max(0, sr.right - br.right);
          return over > 0.5 ? `${c.textContent?.trim()}:${over.toFixed(1)}` : null;
        }).filter(Boolean);
        // 실제 히트 — 중심 ±21.5px 의 위·아래가 자기 칸을 맞히는가(높이만 재면 거짓 통과한다).
        const 히트 = cells.map((c) => {
          const r = c.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const at = (y: number) => { const el = document.elementFromPoint(cx, y); return !!el && (c.contains(el) || el === c); };
          return { 칸: (c.textContent || '').trim().slice(0, 4), w: +r.width.toFixed(1), h: +r.height.toFixed(1), 위: at(cy - 21.5), 아래: at(cy + 21.5) };
        });
        // PC 알약 줄(같은 동작의 다른 모양) — 모바일에서 같이 보이면 한 화면에 두 번이다.
        const pill = document.querySelector<HTMLElement>('[data-pd-post-card] .ring-aura.rounded-card');
        return {
          칸수: cells.length, 겹침, 글자넘침, 히트,
          라벨: cells.map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()),
          글꼴: cells.map((c) => parseFloat(getComputedStyle(c).fontSize)),
          누름속성: cells.filter((c) => c.hasAttribute('aria-pressed')).length,
          알약줄보임: !!pill && getComputedStyle(pill.parentElement!).display !== 'none',
          문서가로넘침: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(m, '반응 트레이가 없다 — 모바일 독립 상세에는 반드시 있어야 한다').not.toBeNull();
      const t = m!;
      console.log(`[C1 tray ${W}]`, JSON.stringify(t));
      expect(t.칸수, `트레이가 ${t.칸수}칸이다 — 좋아요·추천·비추천·공유 넷이어야 한다`).toBe(4);
      // 숫자를 감추지 않았다: 좋아요 3(픽스처) 이 라벨에 그대로 있어야 한다.
      expect(t.라벨.join('|'), `라벨에 실제 카운트가 없다: ${t.라벨.join('|')}`).toMatch(/좋아요\s*3/);
      expect(t.누름속성, '좋아요·추천·비추천 셋은 aria-pressed 를 가져야 한다').toBe(3);
      expect(t.겹침, `칸이 서로 겹친다: ${JSON.stringify(t.겹침)}`).toEqual([]);
      expect(t.글자넘침, `라벨이 칸 밖으로 나갔다: ${JSON.stringify(t.글자넘침)}`).toEqual([]);
      expect(t.알약줄보임, 'PC 알약 줄이 모바일에서도 보인다 — 같은 동작이 한 화면에 두 번이다').toBe(false);
      expect(t.문서가로넘침, '트레이 때문에 문서가 가로로 넘쳤다').toBeLessThanOrEqual(0);
      for (const h of t.히트) {
        // POST-DETAIL-DENSITY(2026-09-24): 칸은 아이콘+라벨+숫자 한 줄 44px 실박스다 — 두 줄(68px)로 되부풀면 여기서 걸린다.
        expect(h.h, `«${h.칸}» 칸 높이 ${h.h}px — 한 줄 44px(≤46) 계약 밖`).toBeLessThanOrEqual(46);
        expect(h.w, `«${h.칸}» 칸 폭 ${h.w}px — 44px 미만`).toBeGreaterThanOrEqual(44);
        expect(h.위 && h.아래, `«${h.칸}» 유효 터치 44px 미달(높이 ${h.h}px · 위 ${h.위} · 아래 ${h.아래})`).toBe(true);
      }
      // 폭을 글자 축소로 맞추지 않았다 — 320 에서도 같은 크기다.
      for (const f of t.글꼴) expect(f, `트레이 글자가 ${f}px 로 줄었다`).toBeGreaterThanOrEqual(12.5);
    });
  }

  // 🔴 C1 — 작성자 행의 `…` 메뉴. 모바일은 메뉴 하나로 모으고 PC 는 종전 가로 묶음이다.
  //   ⚠ **로그인한 남의 글** 조건이어야 신고·차단이 생긴다. 비로그인으로 재면 메뉴가 없는 게 정상이라
  //     "메뉴가 없어도 통과"하는 빈 검사가 된다(이 저장소 최다 함정).
  test('🔴 C1 모바일 — 신고·차단이 `…` 메뉴 한 곳에 모이고 PC 가로 묶음은 모바일에서 안 보인다', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, baseURL!, { loggedIn: true });
    await openPost(page);

    // ⚠ `getByRole('button')` 로 못 찾는다 — 이건 `<summary>` 이고 Chromium 은 그것을
    //   `DisclosureTriangle` 로 노출한다(role=button 이 아니다). 실측으로 확인했다.
    const menu = page.locator('summary[aria-label="게시글 메뉴"]');
    await expect(menu, '`…` 메뉴가 없다 — 로그인한 남의 글이라 신고·차단이 있어야 한다').toHaveCount(1);
    // 전제: 접힌 상태에서는 항목이 안 보인다(그래야 아래 '열면 보인다'가 의미를 가진다).
    await expect(page.getByRole('button', { name: '신고', exact: true }).filter({ visible: true }), '메뉴를 열기도 전에 신고가 보인다')
      .toHaveCount(0);
    const box = (await menu.boundingBox())!;
    expect(Math.min(box.width, box.height), `메뉴 버튼이 ${box.width}×${box.height} — 44px 계약 미달`).toBeGreaterThanOrEqual(44);

    await menu.click();
    const 신고 = page.getByRole('button', { name: '신고', exact: true }).filter({ visible: true });
    const 차단 = page.getByRole('button', { name: '차단', exact: true }).filter({ visible: true });
    await expect(신고, '메뉴를 열었는데 신고가 없다').toHaveCount(1);
    await expect(차단, '메뉴를 열었는데 차단이 없다').toHaveCount(1);
    // 같은 동작이 한 화면에 두 번 나오지 않는다 — PC 가로 묶음은 모바일에서 숨어 있어야 한다.
    const dup = await page.evaluate(() => {
      // ⚠ `getComputedStyle(b).display` 로 보면 안 된다 — PC 묶음의 `max-lg:hidden` 은 **부모 div** 에
      //   걸려 있어 버튼 자신의 display 는 여전히 'inline-flex' 다(실측). 조상까지 반영되는
      //   `getClientRects().length` 로 '실제로 그려졌는가' 를 본다.
      const all = Array.from(document.querySelectorAll<HTMLElement>('[data-pd-post-card] button'))
        .filter((b) => (b.textContent ?? '').trim() === '신고' && b.getClientRects().length > 0);
      return all.length;
    });
    expect(dup, `'신고' 버튼이 화면에 ${dup}개 보인다 — 메뉴 안 하나여야 한다`).toBe(1);

    // Escape 는 메뉴만 닫는다 — 글까지 닫히면 읽던 자리를 잃는다.
    await page.keyboard.press('Escape');
    await expect(신고, 'Escape 로 메뉴가 안 닫혔다').toHaveCount(0);
    await expect(page.locator('[data-pd-root]'), 'Escape 가 메뉴를 넘어 글까지 닫았다').toBeVisible();
  });

  test('🔴 C1 — 비로그인·삭제 불가에서는 `…` 메뉴도 PC 묶음도 아예 없다(빈 메뉴를 만들지 않는다)', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await install(page, baseURL!);
    await openPost(page);
    await expect(page.locator('summary[aria-label="게시글 메뉴"]'), '쓸 수 있는 동작이 없는데 메뉴 버튼이 떴다').toHaveCount(0);
    const n = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-pd-post-card] button'))
      .filter((b) => /^(신고|차단|삭제)$/.test((b.textContent ?? '').trim())).length);
    expect(n, `비로그인인데 관리 동작 버튼이 ${n}개 있다`).toBe(0);
  });
});
