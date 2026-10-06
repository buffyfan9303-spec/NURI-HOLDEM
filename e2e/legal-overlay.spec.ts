// 전면 오버레이에서도 법정 상시 고지(사업자 정보·만 19세·1336)에 **끝까지 스크롤하면 닿는다** — 2026-09-29 최종 점검 D1.
//
// 왜: BusinessFooter 는 App 문서 끝 한 곳에만 있었다. 매장·그룹·내 정보·이벤트·GTO 도구·게시글/일정 상세는
//   `fixed inset-0` 불투명 판이라 그 푸터를 완전히 덮었고, 판 안에는 고지가 없었다(`?venue=` 딥링크는 첫 화면이 이 판이다).
//   CLAUDE.md: 사업자 정보는 전 화면 하단 상시 노출 — 연결 화면 방식은 인정되지 않는다.
//
// 판정(사람이 보는 것 그대로): 보이는 스크롤 상자를 전부 끝까지 내린 뒤,
//   ① 사업자등록번호 dd 가 뷰포트 안에 있고 그 자리를 **맨 위에서** 누르면 그 dd 가 잡힌다(덮인 뒤 푸터는 탈락),
//   ② 1336 문구, ③ 푸터 마지막 줄(©)도 같은 조건 — 하단 고정 바(탭바·NURI SPOT 단계 이동 바)에 가리면 탈락.
// ⚠ 텍스트 존재만 보면 거짓 통과한다 — 덮인 문서 끝 푸터도 DOM 에는 있다. 그래서 elementFromPoint 로 잰다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { SUPABASE_URL, ANON_KEY, stabilizeBackstack, stubLogin } from './_session';
import { mockGroup, MOCK_GROUP_ID, mockSchedule, MOCK_SCHEDULE_ID } from './_mocks';

const BIZ = '525-20-02937';

async function anyId(q: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: ANON_KEY } });
  const rows = (await res.json()) as { id: string }[];
  return Array.isArray(rows) ? rows[0]?.id ?? null : null;
}

/** 모든 스크롤 상자를 끝까지 내리고 고지 세 곳이 '맨 위에서 보이는가' 를 잰다. */
async function probeLegal(page: Page) {
  return page.evaluate(async (biz) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 4; i++) {
      for (const el of document.querySelectorAll<HTMLElement>('*')) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1 && el.getClientRects().length) el.scrollTop = el.scrollHeight;
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(300);
    }
    const onTop = (el: Element, x: number, y: number) => {
      if (y < 0 || y >= innerHeight || x < 0 || x >= innerWidth) return false;
      const t = document.elementFromPoint(x, y);
      return !!t && (t === el || el.contains(t));
    };
    const rectHit = (el: Element, r: DOMRect) => onTop(el, r.left + Math.min(r.width / 2, 12), r.top + r.height / 2);
    const out = { footers: 0, biz: false, age1336: false, lastLine: false };
    // testid 가 아니라 '사업자번호가 든 footer' 로 찾는다 — 수정 전 빌드에서도 같은 기준으로 재야 음성 대조가 된다.
    for (const f of [...document.querySelectorAll('footer')].filter((x) => x.textContent?.includes(biz))) {
      out.footers++;
      const dd = [...f.querySelectorAll('dd')].find((d) => d.textContent?.includes(biz));
      if (dd && rectHit(dd, dd.getBoundingClientRect())) out.biz = true;
      const p = [...f.querySelectorAll('p')].find((x) => x.textContent?.includes('1336'));
      if (!p) continue;
      const span = [...p.querySelectorAll('span')].find((s) => s.textContent?.includes('1336'));
      if (span && rectHit(span, span.getBoundingClientRect())) out.age1336 = true;
      // 마지막 줄(©) — 텍스트 노드의 줄 상자를 직접 잰다(하단 고정 바에 가리는지)
      const last = [...p.childNodes].reverse().find((n) => n.nodeType === 3 && /©/.test(n.textContent ?? ''));
      if (last) {
        const rg = document.createRange(); rg.selectNodeContents(last);
        const rs = [...rg.getClientRects()]; const r = rs[rs.length - 1];
        if (r && rectHit(p, r)) out.lastLine = true;
      }
    }
    return out;
  }, BIZ);
}

/** 판 안 푸터의 '이용약관' 이 실제로 약관 시트를 판 **위에** 연다 — 콜백이 없으면 죽은 버튼이 된다(FooterActionsContext). */
async function expectTermsOpens(page: Page, dialog: import('@playwright/test').Locator, what: string) {
  await dialog.locator('footer').filter({ hasText: BIZ }).getByRole('button', { name: '이용약관', exact: true }).click();
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '약관 및 정책' }) });
  await expect(sheet, `${what}: 판 안 푸터의 이용약관이 약관 시트를 열지 않는다`).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500); // 시트 올라오는 전환(0.26s)이 끝난 뒤 잰다
  const hit = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((x) => x.textContent === '약관 및 정책');
    if (!h) return 'no-heading';
    const r = h.getBoundingClientRect(); const t = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
    return t && (t === h || h.contains(t)) ? 'ok' : `${t?.tagName}.${String(t?.className).slice(0, 80)} @${Math.round(r.left)},${Math.round(r.top)}`;
  });
  expect(hit, `${what}: 약관 시트가 판 뒤에 깔렸다`).toBe('ok');
}

async function expectLegal(page: Page, what: string) {
  const r = await probeLegal(page);
  expect(r.footers, `${what}: 푸터가 DOM 에 하나도 없다 — 판정 재료가 없다`).toBeGreaterThan(0);
  expect(r, `${what}: 끝까지 스크롤해도 법정 고지가 맨 위에서 보이지 않는다`).toMatchObject({ biz: true, age1336: true, lastLine: true });
}

for (const vp of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
  test.describe(`법정 고지 — 전면 오버레이 ${vp.width}`, () => {
    test.use({ viewport: vp });

    test('🔴 대조: 기본 화면(홈)은 문서 끝 푸터로 닿는다', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('button[aria-label^="알림"]').first()).toBeVisible({ timeout: 20_000 });
      await expectLegal(page, '홈');
    });

    // 반례 — 법정 푸터는 **전체화면 판에만** 붙는다. 뒤 화면·문서 끝 푸터가 그대로 있는 작은 시트에 붙으면 기존 화면이 바뀐다.
    //   (가운데 대화상자·2-pane 인라인은 src/components/atoms/modalLegalFooter.test.tsx 가 변형 분기로 잠근다.)
    test('🔴 작은 시트 3종(로그인 · 약관 보기 · 약관 및 정책)에는 법정 푸터가 없다', async ({ page }) => {
      const topHasFooter = () => page.evaluate((biz) => {
        const ds = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter((d) => d.getClientRects().length);
        const top = ds[ds.length - 1];
        return top ? [...top.querySelectorAll('footer')].some((f) => f.textContent?.includes(biz)) : null;
      }, BIZ);
      await stabilizeBackstack(page);
      await page.goto('/');
      await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 20_000 });
      const login = page.getByRole('dialog').first();
      await expect(login.getByTestId('auth-title-login')).toBeVisible({ timeout: 15_000 });
      expect(await topHasFooter(), '로그인 시트에 법정 푸터가 붙었다').toBe(false);
      await login.getByRole('button', { name: '회원가입', exact: true }).click();
      await login.getByRole('button', { name: '보기', exact: true }).first().click();
      await expect(page.getByRole('dialog').filter({ hasText: '이용약관' }).last()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      expect(await topHasFooter(), '가입 약관 보기 시트에 법정 푸터가 붙었다').toBe(false);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      await page.locator('footer').filter({ hasText: BIZ }).getByRole('button', { name: '이용약관', exact: true }).click();
      await expect(page.getByRole('heading', { name: '약관 및 정책' })).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      expect(await topHasFooter(), '약관 및 정책 시트에 법정 푸터가 붙었다').toBe(false);
    });

    test('🔴 매장 페이지(?v= 딥링크 첫 화면)', async ({ page }) => {
      const vid = await anyId('venues?select=id&approved=eq.true&status=eq.active&kind=eq.venue&limit=1');
      // 오픈 초기화 뒤에도 로티아레나 1곳은 남는다 — 매장이 하나도 없으면 데이터 부재가 아니라 **실패**다(예전엔 skip).
      expect(vid, '공개 매장이 하나도 없다 — 로티아레나가 사라졌거나 조회가 깨졌다').toBeTruthy();
      await stabilizeBackstack(page);
      await page.goto(`/?v=${vid}`);
      await expect(page.getByRole('dialog', { name: /매장 페이지/ })).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await expectLegal(page, '매장 페이지');
      await expectTermsOpens(page, page.getByRole('dialog', { name: /매장 페이지/ }), '매장 페이지');
    });

    test('🔴 그룹 페이지', async ({ page }) => {
      // 그룹은 목으로 고정 — 오픈 초기화 뒤 운영 그룹이 0개여도 같은 판정(예전엔 skip).
      await mockGroup(page);
      await stabilizeBackstack(page);
      await page.goto(`/?v=${MOCK_GROUP_ID}`);
      await expect(page.getByRole('dialog', { name: /그룹 페이지/ })).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await expectLegal(page, '그룹 페이지');
    });

    test('🔴 게시글 상세(?post=) — 딥링크는 전 폭 전체화면', async ({ page }) => {
      // 글 단건은 로컬로 — 운영 글이 지워져도 흔들리지 않게(connectivity-links.spec.ts mockPost 와 같은 행 모양).
      const id = '7e57c0de-0000-4000-8000-00000000d1d1';
      const row = { id, user_id: 'u-d1', user_name: '작성자', user_role: 'user', user_color: '#888', user_avatar: null,
        content: '본문 D1', created_at: '2026-09-02T00:00:00Z', like_count: 0, comment_count: 0, view_count: 0,
        category: 'free', title: '고지 점검 글 D1', images: [], badbeat_count: 0, goodrun_count: 0, blinded: false,
        cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null };
      await page.route(/\/rest\/v1\/community_posts\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        const byId = /[?&]id=eq\./.test(r.request().url());
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(byId ? (single ? row : [row]) : []) });
      });
      await stabilizeBackstack(page);
      await page.goto(`/?post=${id}`);
      await expect(page.getByRole('heading', { name: '고지 점검 글 D1' })).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await expectLegal(page, '게시글 상세');
    });

    test('🔴 일정 상세(?s=)', async ({ page }) => {
      // 일정 한 건은 목으로 고정 — 운영 일정이 비어도 같은 판정(예전엔 skip).
      await mockSchedule(page);
      await stabilizeBackstack(page);
      await page.goto(`/?s=${MOCK_SCHEDULE_ID}`);
      await expect(page.locator('[data-sched-tabbar]')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await expectLegal(page, '일정 상세');
    });

    test('🔴 이벤트 목록 · 이벤트 보드', async ({ page }) => {
      const j = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
      const board = {
        slug: 'legal-e2e', title: '고지 점검', subtitle: null, status: 'live', venueId: '00000000-0000-0000-0000-000000000000',
        startsAt: null, endsAt: null, voucherTitle: '매장이용권',
        cards: [{ idx: 1, opened: true, tier: 1, count: 1, by: '누군가' }], myTickets: 0, remainByTier: {}, totalByTier: { 1: 1 }, voucherByTier: { 1: 1 },
      };
      await page.route(/\/rest\/v1\/event_campaigns\?/, (r) => r.fulfill(j([{ slug: board.slug, title: board.title, subtitle: null, status: 'live', hidden_at: null, starts_at: null, ends_at: null }])));
      await page.route(/\/rest\/v1\/rpc\/event_board/, (r) => r.fulfill(j(board)));
      await page.goto('/');
      await page.getByTestId('home-event-menu').first().click();
      await expect(page.getByTestId('event-list-page')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('event-list-item').first()).toBeVisible({ timeout: 15_000 });
      await expectLegal(page, '이벤트 목록');
      await page.getByTestId('event-list-item').first().click();
      await expect(page.getByRole('dialog', { name: '이벤트', exact: true })).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(600);
      await expectLegal(page, '이벤트 보드');
    });

    test('🔴 내 정보(목킹 로그인) — 대시보드·보안 탭', async ({ page }) => {
      await stubLogin(page);
      await stabilizeBackstack(page);
      await page.goto('/');
      await page.getByRole('button', { name: '검증계정 메뉴' }).click({ timeout: 20_000 });
      await page.getByRole('button', { name: '내 정보 열기' }).click();
      await expect(page.locator('h1', { hasText: '내 정보' })).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await expectLegal(page, '내 정보 · 대시보드');
      await page.locator('[data-profile-tabbar]').getByRole('tab', { name: '보안', exact: true }).click();
      await page.waitForTimeout(800);
      await expectLegal(page, '내 정보 · 보안');
      await expectTermsOpens(page, page.locator('[data-profile-panel]'), '내 정보');
    });

    // NURI SPOT 은 판 안에 하단 고정 단계 이동 바가 있다 — 마지막 줄 가림(③)의 반례다.
    for (const key of ['spot', 'icm', 'bankroll']) {
      test(`🔴 GTO 도구 전체화면(#tool=${key}, 목킹 로그인)`, async ({ page }) => {
        await stubLogin(page);
        await stabilizeBackstack(page);
        await page.goto(`/?tab=tools#tool=${key}`);
        await page.waitForFunction(() => {
          const d = document.querySelector('[role="dialog"][aria-modal="true"]');
          return !!d && !/불러오는 중…/.test(d.textContent ?? '');
        }, undefined, { timeout: 30_000 });
        await expect(page.locator('[role="dialog"][aria-modal="true"]').first()).toBeVisible();
        await page.waitForTimeout(800);
        await expectLegal(page, `도구 ${key}`);
        if (key === 'spot') await expectTermsOpens(page, page.locator('[role="dialog"][aria-modal="true"]').first(), '도구 spot');
      });
    }
  });
}
