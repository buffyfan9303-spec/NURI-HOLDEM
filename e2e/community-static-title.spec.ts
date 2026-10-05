// 오너 2026-10-04 15시 — 커뮤니티 목록 제목·외치기 정적화와 외치기 칸 공백.
//
// 이 파일이 보는 것(수정 전 빌드에서 실패한다 — 제목·안내 문구가 전광판(.marquee-loop)으로 흘렀고 외치기 위아래가 12.75px 였다)
//   ① 390·360·320 모아보기: 게시판 행 제목은 흐르지 않는다(애니메이션 0) · 한 줄 말줄임(…) · title 로 전체 제목 · 글씨 13.6px 이하 ·
//      행 높이 44px 이상(히트영역) · 행이 가로로 넘치지 않는다 · 배지·[댓글수]·작성자는 잘리지 않고 남는다.
//   ② 펼쳐보기(카드)도 제목이 같은 규칙.
//   ③ 외치기 칸: 하위 탭 바 ↔ 외치기 ↔ 본문 간격이 7px 이하, 칸 높이 50px 이하.
//      (안내 문구 정적화는 2026-10-05 오너 "외치기가 옆으로 움직이질 않고 고정" 으로 되돌렸다 — 흐름은 shout-marquee-loop ③ 이 본다.)
//      다른 하위 탭(실시간)에서도 같은 칸이다(한 컴포넌트를 공유).
//   ④ 홈 → 커뮤니티 재방문: 레이아웃 이동(CLS) 0, 보기·제목 상태 그대로.
// 게시글은 목킹(24건, 긴 제목 포함) — 운영 글 수·제목 길이에 따라 '넘치는 제목'이 없어 거짓 통과하지 않게.
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const TITLES = [
  '버블 숏스택 푸시 레인지 질문 — 12BB 에서 A9o 는 어떻게 하나요 상대가 루즈하면',
  '어제 데일리 후기 · 강남 홀덤펍 메인 이벤트 파이널 테이블까지 간 이야기',
  '주말 위클리 안내', '토너먼트 ICM 계산기 사용법 정리해 봤습니다(초보용) 질문 환영',
];
const posts = Array.from({ length: 24 }, (_, i) => ({
  id: `st-${i}`, user_id: `u-st-${i}`, user_name: ['누리홀덤', '도토리', '포커왕김씨'][i % 3], user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${i}`, created_at: new Date(Date.UTC(2026, 8, 30, 12) - i * 3600_000).toISOString(),
  like_count: 0, comment_count: i % 2 ? 12 : 0, view_count: 0, category: ['free', 'hand', 'question'][i % 3], title: TITLES[i % TITLES.length], images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
}));

async function openBoard(page: Page, view: 'compact' | 'feed' = 'compact') {
  await page.addInitScript((v) => { try { localStorage.setItem('nuri:board-view', v); } catch { /* noop */ } }, view);
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(/\/rest\/v1\/community_posts\?/, (r) => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(posts) }) : r.fallback());
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await page.locator('[data-testid="sec-tab-board"]').first().waitFor({ timeout: 25_000 });
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
  await expect(page.getByTestId('board-search-open')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

const titles = (page: Page) => page.evaluate(() => {
  const lis = [...document.querySelectorAll<HTMLElement>('[data-sec="board"] [data-board-loaded] li[role="button"]')].filter((x) => x.offsetParent).slice(0, 8);
  return lis.map((li) => {
    const t = li.querySelector<HTMLElement>('[data-post-title]');
    const s = t ? getComputedStyle(t) : null;
    const anim = [...li.querySelectorAll('*')].filter((e) => getComputedStyle(e).animationName !== 'none').length;
    return {
      found: !!t, text: t?.textContent?.trim() ?? '', title: t?.getAttribute('title') ?? null,
      overflow: s?.textOverflow, ws: s?.whiteSpace, ov: s?.overflowX, px: s ? parseFloat(s.fontSize) : 0,
      clipped: t ? t.scrollWidth > t.clientWidth + 1 : false, anim,
      h: li.getBoundingClientRect().height, rowOver: li.scrollWidth > li.clientWidth + 1,
      marquee: li.querySelectorAll('.marquee-loop').length,
    };
  });
});

for (const w of [390, 360, 320]) {
  test(`① ${w} 모아보기: 제목은 정적 한 줄 말줄임 · title 전체 · 13.6px 이하 · 행 44px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await openBoard(page);
    const rows = await titles(page);
    expect(rows.length, '잴 행이 없다').toBeGreaterThan(3);
    expect(rows.filter((r) => !r.found), '행에 [data-post-title] 제목 칸이 없다').toEqual([]);
    expect(rows.filter((r) => r.marquee + r.anim > 0).map((r) => r.text), '제목이 흐른다(전광판·애니메이션)').toEqual([]);
    expect(rows.filter((r) => r.clipped).length, '넘치는 제목이 하나도 없다 — 목킹 긴 제목이 안 먹었다(거짓 통과 방지)').toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.marquee + r.anim, `제목이 흐른다(애니메이션 ${r.anim}·전광판 ${r.marquee}): ${r.text}`).toBe(0);
      expect([r.overflow, r.ws, r.ov], `한 줄 말줄임이 아니다: ${r.text}`).toEqual(['ellipsis', 'nowrap', 'hidden']);
      expect(r.title, '잘린 제목의 전체가 title 에 없다').toBe(r.text);
      expect(r.px, '제목 글씨').toBeLessThanOrEqual(13.6);
      expect(r.px, '제목 글씨가 너무 작다').toBeGreaterThanOrEqual(12.75);
      expect(r.h, '행 높이(히트영역)').toBeGreaterThanOrEqual(44);
      expect(r.rowOver, `행이 가로로 넘친다: ${r.text}`).toBe(false);
    }
    // 배지·[댓글수]·작성자는 제목에 밀려 사라지지 않는다
    const first = page.locator('[data-sec="board"] [data-board-loaded] li[role="button"]').nth(1);
    await expect(first.getByText('[12]')).toBeVisible();
    await expect(first.getByText('도토리')).toBeVisible();
  });
}

test('② 펼쳐보기(카드) 제목도 정적 한 줄 말줄임 · title', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page, 'feed');
  const r = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-sec="board"] [data-board-loaded] li [data-post-title]')].slice(0, 6).map((t) => {
    const s = getComputedStyle(t);
    return { text: t.textContent?.trim(), title: t.getAttribute('title'), te: s.textOverflow, ws: s.whiteSpace, px: parseFloat(s.fontSize), clipped: t.scrollWidth > t.clientWidth + 1, anim: getComputedStyle(t).animationName };
  }));
  expect(r.length, '카드 제목이 없다').toBeGreaterThan(3);
  expect(r.some((x) => x.clipped), '넘치는 카드 제목이 없다(목킹 확인)').toBe(true);
  for (const x of r) {
    expect([x.te, x.ws, x.anim]).toEqual(['ellipsis', 'nowrap', 'none']);
    expect(x.title).toBe(x.text);
    expect(x.px).toBeLessThanOrEqual(13.6);
  }
  await expect(page.locator('[data-sec="board"] .marquee-loop')).toHaveCount(0);
});

for (const w of [390, 320]) {
  test(`③ ${w}: 외치기 칸 — 위아래 간격 7px 이하 · 높이 50px 이하 · 하위 탭 공통`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await openBoard(page);
    const m = () => page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="shout-idle"],[data-testid="shout-live"]')!;
      const wrap = card.parentElement!.parentElement!;
      const bar = document.querySelector('[data-community-secbar]')!.getBoundingClientRect();
      const panel = document.querySelector('[data-community-secpanel]')!.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      return {
        live: card.dataset.testid === 'shout-live', above: wr.top - bar.bottom, below: panel.top - wr.bottom, h: card.getBoundingClientRect().height,
        marquee: card.querySelectorAll('.marquee-loop').length,
      };
    });
    const a = await m();
    expect(a.above, `하위 탭 바 ↔ 외치기 ${a.above}px`).toBeLessThanOrEqual(7);
    expect(a.above).toBeGreaterThanOrEqual(4);
    expect(a.below, `외치기 ↔ 본문 ${a.below}px`).toBeLessThanOrEqual(7);
    expect(a.below).toBeGreaterThanOrEqual(4);
    expect(a.h, '외치기 칸 높이').toBeLessThanOrEqual(50);
    expect(a.h, "외치기 칸이 '외치기' 버튼(34px)보다 얇다").toBeGreaterThanOrEqual(44);
    // 2026-10-05: 안내 문구도 유료 줄과 같은 전광판으로 흐른다(오너 "고정되어 있어") — 흐름·이음새 판정은 shout-marquee-loop ③.
    expect(a.marquee, '외치기 줄이 흐르지 않는다').toBe(1);
    // 실시간 하위 탭에서도 같은 칸 · 같은 간격
    await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-live"]') as HTMLElement).click());
    await page.waitForTimeout(600);
    const b = await m();
    expect(Math.abs(b.above - a.above), '하위 탭마다 외치기 위 간격이 다르다').toBeLessThanOrEqual(0.5);
    expect(Math.abs(b.h - a.h)).toBeLessThanOrEqual(0.5);
  });
}

test('④ 홈 → 커뮤니티 재방문: CLS 0 · 보기·제목 상태 그대로', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  const before = await titles(page);
  await page.locator('nav').getByRole('button', { name: '홈', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift' });
  });
  await page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls, `재방문 CLS ${cls}`).toBeLessThanOrEqual(0.001);
  await expect(page.getByTestId('board-view-toggle')).toHaveAttribute('data-view', 'compact');
  const after = await titles(page);
  expect(after.map((r) => r.text)).toEqual(before.map((r) => r.text));
  expect(after.map((r) => r.h)).toEqual(before.map((r) => r.h));
});
