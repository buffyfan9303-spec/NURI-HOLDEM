// 조회 실패를 '빈 결과'로 위장하지 않는다 — 실행 명령문 §7-8 게이트.
//
// 왜 이 스펙이 필요한가: 실패를 `[]`·`null`·`{}` 로 접어 반환하면 화면은 '아직 글이 없어요'·'예약 없음'
//   처럼 **사실이 아닌 단정**을 한다. 손님은 그걸 믿고 떠나고, 로그에는 아무것도 남지 않는다.
//   그래서 '오류가 나면 오류라고 말하고 다시 시도할 길을 준다'는 계약을 화면 수준에서 잠근다.
// 로그인 없이 검증할 수 있는 화면(커뮤니티 게시판)을 대표로 잡는다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

test('🔴 게시판 — 목록 조회가 실패하면 빈 상태가 아니라 오류·다시 시도가 보인다', async ({ page }) => {
  // community_posts 조회만 500 으로 떨어뜨린다(다른 화면은 정상이어야 대비가 드러난다).
  await page.route(/\/rest\/v1\/community_posts\?/, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"injected"}' }));

  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);

  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '게시판', exact: true }).first().click();

  // 오류 카드 + 재시도 경로가 보인다
  const retry = page.getByRole('button', { name: /다시 시도/ }).first();
  await expect(retry, '조회 실패인데 재시도 버튼이 없다').toBeVisible({ timeout: 15_000 });

  // 그리고 '아직 글이 없다'는 거짓말을 하지 않는다
  await expect(page.getByText('첫 게시글을 남겨보세요'), '실패를 빈 목록으로 위장했다').toHaveCount(0);
});
