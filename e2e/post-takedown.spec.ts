// 권리침해 임시조치 글의 링크는 '없는 글' 이 아니라 그 자리에 안내를 띄운다 (20261006t · 약관 제5조⑧ · 정보통신망법 §44의2②)
//
// 서버(RLS posts_select)는 임시조치 글을 남·비로그인에게 0행으로 준다. 예전 화면은 그걸 '삭제되었거나 찾을 수 없는 글'로 말해
// 게시물 자리의 공시가 사라졌다. 이제 post_takedown_notice 안내로 자리표시를 열고, 본문·작성자·댓글은 그리지 않는다.
// 비로그인 · 읽기만 — 글 조회와 안내 RPC 를 목으로 고정한다(운영 데이터·마이그레이션 적용 여부와 무관하게 같은 판정).
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { bootOwner, MOCK_UID } from './_mockOwner';
import { postRow } from './_mocks';

const ID = '00000000-0000-4000-8000-0000000000d1';
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function mockTakedown(page: Page, notice: unknown) {
  // 단건 조회(id=eq.ID)만 0행 — 목록 등 다른 조회는 그대로 흘려보낸다.
  await page.route(/\/rest\/v1\/community_posts\?/, (r) =>
    r.request().method() === 'GET' && r.request().url().includes(`id=eq.${ID}`) ? r.fulfill(json([])) : r.fallback());
  await page.route(/\/rest\/v1\/rpc\/post_takedown_notice/, (r) => r.fulfill(json(notice)));
}

test('🔴 ?post=<임시조치 글> — 비로그인에게 임시조치 안내·기간이 뜨고 본문·작성자는 없다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTakedown(page, {
    status: 'active', created_at: '2026-10-06T03:00:00Z', ends_at: '2026-11-05T03:00:00Z', expired: false, mine: false,
  });
  await page.goto(`/?post=${ID}`);
  const notice = page.getByTestId('post-takedown-notice');
  await expect(notice, '임시조치 글 링크인데 자리 안내가 없다').toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText('권리침해 신고로 임시조치된 게시물입니다');
  await expect(notice).toContainText('임시조치 기간: 2026. 11. 5.까지');
  // 남에게는 사유·다시 게시 요청 수단이 없다(서버도 사유를 싣지 않는다)
  await expect(notice.getByTestId('takedown-review-open')).toHaveCount(0);
  await expect(page.locator('[data-pd-body]'), '임시조치 글의 본문 자리가 그려졌다').toHaveCount(0);
  await expect(page.locator('[data-pd-comments]'), '임시조치 글의 댓글 면이 그려졌다').toHaveCount(0);
  await expect(page.getByText('삭제되었거나 찾을 수 없는 글입니다')).toHaveCount(0);
});

// #196 화면 검토 B — 권리침해 소명(최대 1000자)을 길게 써도 '신고 접수' 버튼이 화면 안에 있다(textarea 가 40vh 까지 자라 접힘선 아래로 밀었다).
//   목킹 로그인(계정 없음 · 운영 쓰기 0) + 남의 글 한 건. 취소 후 다시 열면 입력이 비어 있다(P3).
//   재측정 r2(2026-10-06): 360×740 은 긴 소명에서 13px 잘리고 360×640 은 소명 없이도 버튼이 아래였다 → 버튼 줄을 시트 하단 고정.
//   세 크기 모두 '빈 소명'과 '1000자 소명' 두 상태에서 취소·접수 버튼 **전체**가 화면 안이다.
const inView = async (page: import('@playwright/test').Page, testId: string, vh: number, when: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} 가 없다(${when})`).not.toBeNull();
  expect(box!.y, `${testId} 위가 화면 밖(${when})`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${testId} 가 접힘선(${vh}) 아래로 잘렸다 — bottom=${box!.y + box!.height}(${when})`).toBeLessThanOrEqual(vh);
};
for (const { width, height } of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 360, height: 640 }]) {
  test(`권리침해 신고 시트 ${width}×${height} — 빈 소명·1000자 소명 모두 버튼 전체가 보이고, 다시 열면 입력이 비어 있다`, async ({ page }) => {
    await bootOwner(page, { viewport: { width, height }, profile: { role: 'user', venue_id: null }, goto: false });
    const row = postRow(1, { id: ID, user_id: '00000000-0000-4000-8000-0000000000aa', title: '남의 글' });
    await page.route(/\/rest\/v1\/community_posts\?/, (r) =>
      r.request().method() === 'GET' && r.request().url().includes(`id=eq.${ID}`) ? r.fulfill(json([row])) : r.fallback());
    await page.goto(`/?post=${ID}`);
    await page.locator('summary[aria-label="게시글 메뉴"]').click();
    await page.getByRole('button', { name: '신고', exact: true }).click();
    await page.getByTestId('report-reason-rights').click();
    const detail = page.getByTestId('report-detail');
    await expect(detail).toBeVisible();
    await page.waitForTimeout(400);   // 시트 진입 애니(sheet-up 0.26s)가 끝난 자리에서 잰다
    await inView(page, 'report-cancel', height, '빈 소명');
    await inView(page, 'report-submit', height, '빈 소명');
    await detail.fill('가'.repeat(1000));
    await expect(page.getByTestId('report-rights-count')).toContainText('1000/1000');
    await expect(page.getByTestId('report-submit')).toBeEnabled();
    await inView(page, 'report-cancel', height, '1000자 소명');
    await inView(page, 'report-submit', height, '1000자 소명');
    // 취소 → 다시 열기: 앞 소명이 남아 있지 않다
    await page.getByTestId('report-cancel').click();
    await expect(detail).toHaveCount(0);
    await page.locator('summary[aria-label="게시글 메뉴"]').click();
    await page.getByRole('button', { name: '신고', exact: true }).click();
    await expect(page.getByTestId('report-reason-rights')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('report-detail')).toHaveValue('');
  });
}

test('음성 대조 — 안내가 없으면(임시조치 아님) 종전대로 없는 글 안내', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTakedown(page, null);
  await page.goto(`/?post=${ID}`);
  await expect(page.getByText('삭제되었거나 찾을 수 없는 글입니다')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('post-takedown-notice')).toHaveCount(0);
});

// audit10 P3-4(2026-10-07) — 임시조치된 **내 글** 상세에 '끌올' 이 보였다. 서버 bump_post 는 blinded 면 거절한다
//   ('숨김 처리된 글은 끌올할 수 없어요' — 라이브 정의 2026-10-07 확인) → 화면도 숨김 글에는 끌올 줄을 그리지 않는다.
//   양성 대조: 같은 내 글이 숨김이 아니면 끌올 줄이 있다(목 로그인 MOCK_UID = 작성자).
for (const blinded of [true, false]) {
  test(`${blinded ? '🔴 ' : ''}P3-4 내 글 상세 — ${blinded ? '임시조치 글에는 끌올이 없다' : '양성 대조: 숨김 아닌 내 글에는 끌올이 있다'}`, async ({ page }) => {
    await bootOwner(page, { viewport: { width: 390, height: 844 }, profile: { role: 'user', venue_id: null }, goto: false });
    const row = postRow(1, {
      id: ID, user_id: MOCK_UID, title: '내 글',
      ...(blinded ? { blinded: true, blinded_source: 'takedown' } : {}),
    });
    await page.route(/\/rest\/v1\/community_posts\?/, (r) =>
      r.request().method() === 'GET' && r.request().url().includes(`id=eq.${ID}`) ? r.fulfill(json([row])) : r.fallback());
    await page.route(/\/rest\/v1\/rpc\/post_takedown_notice/, (r) => r.fulfill(json(blinded
      ? { status: 'active', created_at: '2026-10-06T03:00:00Z', ends_at: '2026-11-05T03:00:00Z', expired: false, mine: true }
      : null)));
    await page.goto(`/?post=${ID}`);
    if (blinded) {
      await expect(page.getByTestId('post-takedown-notice'), '임시조치 안내가 없다 — 대상 화면이 아니다').toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500);
      await expect(page.locator('[data-pd-bump]'), '임시조치 글에 끌올 줄이 보인다(서버는 거절한다)').toHaveCount(0);
    } else {
      await expect(page.locator('[data-pd-bump]'), '숨김 아닌 내 글에 끌올 줄이 없다').toBeVisible({ timeout: 20_000 });
    }
  });
}
