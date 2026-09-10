// 공지 행은 **정적**이다 — 흐르지 않고, 앞이 잘리지 않는다.
//
// 오너 2026-09-09 스크린샷: 장터·게시판 공지 제목이 전광판(MarqueeText)으로 흐르다
//   "URI HOLDEM 정식 오픈 —" · "OLDEM 커뮤니티 이용 안내" 처럼 **앞이 잘린 채** 보였다.
//   흐르는 글은 어느 순간을 봐도 앞이나 뒤가 없다 — 공지는 첫 글자에서 '무엇에 대한 공지'가 읽혀야 한다.
//   → NoticeRow(NoticeSection.tsx)를 정적 행으로: 모바일 2줄 clamp · PC(lg+) 1줄 말줄임 ·
//     전체 제목은 접근성 이름(aria-label)과 상세 화면에.
//
// 잠그는 것 셋:
//   ① 공지 섹션 안에 transform 애니메이션(.marquee-loop 포함)이 0개
//   ② 긴 제목의 높이가 2줄(모바일) / 1줄(PC) 안에 있고, 제목이 가로로 넘치지 않는다
//   ③ 행 버튼의 aria-label 에 전체 제목이 그대로 있다
// 공지 조회(marketplace_notices)는 page.route 로 응답을 만든다 — 운영 DB 에는 쓰지 않는다(_fixtures 가드).
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

// 제목 안 이모지는 **데이터**다(오너 공지 원문이 그렇다) — UI 이모지 게이트(src/ 만 훑음)와 무관.
const LONG = '🎉 NURI HOLDEM 정식 오픈 — 전국 홀덤 대회 일정과 매장 정보, 커뮤니티를 한 곳에서 확인하고 지금 바로 참가 신청하세요 (필독)';
const row = (i: number, type: 'pinned' | 'event' | 'caution', title: string) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
  type, title, body: '본문', author_name: '운영자', board: 'all', sort_order: 0,
  created_at: new Date(Date.now() - i * 86_400_000).toISOString(),
});
const NOTICES = [
  row(0, 'pinned', LONG),
  row(1, 'pinned', '📌 NURI HOLDEM 커뮤니티 이용 안내 (필독)'),
  row(2, 'caution', '🛒 중고장터 거래 안내 및 주의 (필독)'),
];

/** 게시판까지 들어가 공지 섹션을 돌려준다 */
async function openBoardNotices(page: Page): Promise<Locator> {
  await page.route(/\/rest\/v1\/marketplace_notices\?/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOTICES) }));
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  // '커뮤니티' 는 폭에 따라 role 이 바뀐다 — 모바일 하단 탭바는 button, PC 상단 GNB(lg+)는 role="tab"(하단 탭바는 lg:hidden).
  await page.getByRole('tab', { name: '커뮤니티', exact: true }).or(page.getByRole('button', { name: '커뮤니티', exact: true })).first().click();
  await page.getByRole('tab', { name: '게시판', exact: true }).or(page.getByRole('button', { name: '게시판', exact: true })).first().click();
  const sec = page.locator('section').filter({ has: page.getByRole('heading', { name: '공지사항' }) }).first();
  await expect(sec, '게시판 위 공지 섹션이 없다').toBeVisible({ timeout: 15_000 });
  await expect(sec.getByRole('listitem')).toHaveCount(3);
  return sec;
}

/** 제목 스팬의 실측 — 높이·줄높이·clamp·transform·가로 넘침 */
const measure = (sec: Locator) =>
  sec.getByText(LONG, { exact: true }).evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      h: r.height, lh: parseFloat(cs.lineHeight), clamp: cs.webkitLineClamp, transform: cs.transform,
      overflowX: el.scrollWidth - el.clientWidth,
      rowH: el.closest('li')!.getBoundingClientRect().height,
      // 첫 글자가 행 안쪽에서 시작하는가(음수면 왼쪽으로 밀려 잘린 것)
      startInset: r.left - el.closest('li')!.getBoundingClientRect().left,
    };
  });

/** 섹션 안에서 transform 을 건드리는 애니메이션 수 */
const transformAnims = (sec: Locator) =>
  sec.evaluate((el) => el.getAnimations({ subtree: true })
    .filter((a) => ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some((k) => 'transform' in k)).length);

test('🔴 공지 행(모바일) — 흐르지 않고 2줄 안에서 끝나며 aria-label 에 전체 제목', async ({ page }) => {
  test.setTimeout(60_000);
  const sec = await openBoardNotices(page);

  // ① 애니메이션 0개 — 전광판이 남아 있으면 여기서 잡힌다
  await expect(sec.locator('.marquee-loop')).toHaveCount(0);
  expect(await transformAnims(sec), '공지 섹션에 transform 애니메이션이 남아 있다').toBe(0);

  // ② 2줄 clamp — 긴 제목은 실제로 줄바꿈되고(1줄보다 높고) 2줄을 넘지 않는다
  const m = await measure(sec);
  console.log('[공지 제목 실측 · 모바일]', JSON.stringify(m));
  expect(m.transform).toBe('none');
  expect(m.clamp).toBe('2');
  expect(m.h, '긴 제목이 줄바꿈되지 않았다(clamp 가 안 걸림)').toBeGreaterThan(m.lh + 1);
  expect(m.h, '제목이 2줄을 넘는다').toBeLessThanOrEqual(m.lh * 2 + 1);
  expect(m.overflowX, '제목이 가로로 넘친다').toBeLessThanOrEqual(1);
  expect(m.startInset, '제목 첫 글자가 행 왼쪽 밖으로 밀렸다').toBeGreaterThanOrEqual(0);
  // 행 높이 = 2줄 + 상하 패딩(py-2 = 16px) 이내
  expect(m.rowH, '행이 2줄 clamp 높이를 넘는다').toBeLessThanOrEqual(m.lh * 2 + 16 + 2);

  // ③ 접근성 이름 — 시각적으로 잘려도 이름은 전체 제목
  const btn = sec.getByRole('listitem').first().getByRole('button');
  expect(await btn.getAttribute('aria-label'), 'aria-label 에 전체 제목이 없다').toContain(LONG);
  // 유형 타일(주의)은 그대로 — 정렬 요소가 사라지지 않았다
  await expect(sec.getByRole('listitem').nth(2).locator('.tile-grad')).toHaveCount(1);
});

test('🔴 공지 행(PC lg+) — 1줄 말줄임 · 애니메이션 0개 · 전체 제목은 aria-label', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const sec = await openBoardNotices(page);

  await expect(sec.locator('.marquee-loop')).toHaveCount(0);
  expect(await transformAnims(sec)).toBe(0);

  const m = await measure(sec);
  console.log('[공지 제목 실측 · PC]', JSON.stringify(m));
  expect(m.transform).toBe('none');
  expect(m.clamp).toBe('1');
  expect(m.h, 'PC 에서 제목이 1줄을 넘는다').toBeLessThanOrEqual(m.lh + 1);
  expect(m.overflowX).toBeLessThanOrEqual(1);
  expect(m.startInset).toBeGreaterThanOrEqual(0);

  const btn = sec.getByRole('listitem').first().getByRole('button');
  expect(await btn.getAttribute('aria-label')).toContain(LONG);
  // 호버 툴팁(title)에도 전체 제목 — PC 에서 말줄임된 뒷부분을 읽는 길
  await expect(sec.getByText(LONG, { exact: true })).toHaveAttribute('title', LONG);
});
