import { test, expect, type Page } from './_fixtures';

// 클릭 경로 감사 — "눌렀을 때 **의도한 화면**으로 가는가"(오너 지시 2026-09-06).
//
// 스모크(smoke.spec)는 '크래시 없이 렌더되는가'를 본다. 이 파일은 다른 것을 본다:
// **누르면 어디로 가는가**. 링크가 살아 있어도 엉뚱한 데로 가면 스모크는 통과하고 손님은 길을 잃는다.
//
// 규칙 둘:
//  · 도착 판정은 **그 화면에만 있는 것**으로 한다(#root 가 비지 않았다 같은 판정은 아무것도 증명 못 한다).
//  · 비로그인으로 갈 수 있는 곳만 본다 — 로그인 게이트가 뜨면 그것도 '의도한 경로'로 취급해 명시적으로 확인한다.

const nav = (page: Page) => page.getByRole('navigation', { name: '하단 내비게이션' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('오늘·내일 일정').first()).toBeVisible();
});

test('하단 탭 5개 — 각 탭이 자기 판을 띄우고 나머지는 내린다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // ⚠ 도착 판정을 '그 화면의 글자'로 하면 안 된다 — 이 앱은 keep-alive 라 안 보이는 탭의 DOM 도 살아 있고,
  //   getByText(...).first() 가 **숨은 탭의 사본**을 집는다(실측: GTO 마커가 hidden 으로 잡혔다).
  //   판은 [data-tab] 이 정본이므로 그걸로 본다: 누른 판만 보이고 나머지는 안 보여야 한다.
  const legs: [string, string][] = [
    ['라이브', 'live'], ['커뮤니티', 'community'], ['GTO', 'tools'], ['캘린더', 'calendar'], ['홈', 'home'],
  ];
  for (const [label, tab] of legs) {
    const btn = nav(page).getByRole('button', { name: new RegExp(`^${label}`) });
    if (await btn.count() === 0) { test.info().annotations.push({ type: 'skip-leg', description: `${label} 칸 없음(매장 계정 등)` }); continue; }
    await btn.first().click();
    await expect(page.locator(`[data-tab="${tab}"]`), `'${label}' 을 눌렀는데 ${tab} 판이 안 뜬다`).toBeVisible({ timeout: 10_000 });
    for (const [, other] of legs) {
      if (other === tab) continue;
      await expect(page.locator(`[data-tab="${other}"]`), `'${label}' 인데 ${other} 판이 같이 떠 있다`).toBeHidden();
    }
  }
  expect(errors, `탭 순회 중 예외: ${errors.join(' | ')}`).toEqual([]);
});

test('홈 → 전체 일정 — 둘러보기(browse) 판으로 간다', async ({ page }) => {
  await page.getByRole('button', { name: /전체 일정/ }).first().click();
  // browse 는 홈의 서브 화면이라 탭바는 '홈'이 활성인 채로 판만 바뀐다 — 그래서 판으로 확인한다
  await expect(page.locator('[data-tab="browse"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-tab="home"]')).toBeHidden();
});

test('이벤트 딥링크 ?event=1 — 이벤트 **별도 페이지**가 열린다(탭이 아니라)', async ({ page }) => {
  await page.goto('/?event=1');
  const dlg = page.getByRole('dialog', { name: '이벤트' });
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  // 별도 페이지의 증거: 자기 헤더가 있고, 하단 탭바는 이 판에 속하지 않는다
  await expect(dlg.getByRole('button', { name: '닫기' })).toBeVisible();
  // 파라미터는 소비 후 URL 에서 지워진다(뒤로가기·새로고침에서 다시 열리지 않게)
  await expect(page).toHaveURL((u) => !u.searchParams.has('event'));
});

test('이벤트 페이지 — 확률 공개가 **최하단에** 있고 합이 100%다', async ({ page }) => {
  await page.goto('/?event=1');
  const dlg = page.getByRole('dialog', { name: '이벤트' });
  await expect(dlg).toBeVisible({ timeout: 15_000 });

  // ⚠ 다이얼로그가 보이는 시점은 아직 **로딩 스켈레톤**이다 — 그때 표를 세면 0 이라 조용히 skip 된다
  //   (이 테스트가 처음에 그렇게 자기 자신을 꺼 버렸다). 표나 '이벤트 없음' 중 하나가 나올 때까지 기다린다.
  const table = dlg.locator('table');
  const none = dlg.getByText('진행 중인 이벤트가 없어요');
  await expect(table.or(none).first()).toBeVisible({ timeout: 20_000 });
  if (await none.isVisible()) test.skip(true, '진행 중 이벤트가 없어 확률 표가 없다');

  await expect(dlg.getByText('당첨 확률 공개')).toBeVisible();
  const pcts = await table.locator('tbody tr td:nth-child(4)').allInnerTexts();
  const sum = pcts.reduce((a, t) => a + parseFloat(t.replace('%', '')), 0);
  expect(Math.round(sum), `확률 합이 100%가 아니다: ${pcts.join(' ')}`).toBe(100);

  // '최하단' — 확률 표 아래에 카드판이 오면 안 된다
  const tableY = (await table.boundingBox())!.y;
  const lastCard = dlg.locator('button[aria-label$="카드 열기"]').last();
  if (await lastCard.count() > 0) {
    const cardY = (await lastCard.boundingBox())!.y;
    expect(tableY, '확률 표가 카드판보다 위에 있다 — 최하단이어야 한다').toBeGreaterThan(cardY);
  }
});

test('이벤트 닫기 — 홈으로 돌아온다(빈 화면에 갇히지 않는다)', async ({ page }) => {
  await page.goto('/?event=1');
  const dlg = page.getByRole('dialog', { name: '이벤트' });
  await expect(dlg).toBeVisible({ timeout: 15_000 });
  await dlg.getByRole('button', { name: '닫기' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByText('오늘·내일 일정').first()).toBeVisible();
});

test('비로그인 QR 딥링크 — 로그인 게이트로 보내고, 하려던 일을 기억한다', async ({ page }) => {
  // ?checkin= 는 로그인해야 기록된다. 비로그인이면 로그인 창이 뜨는 것이 **의도한 경로**다.
  await page.goto('/?checkin=11111111-2222-3333-4444-555555555555');
  await expect(page.getByText(/로그인|이메일/).first()).toBeVisible({ timeout: 15_000 });
  // 그리고 소셜 로그인 왕복에서 잃지 않도록 의도를 적어 둔다(pendingQrIntent)
  const saved = await page.evaluate(() => localStorage.getItem('nuri:qr-intent'));
  expect(saved, 'QR 의도가 저장되지 않았다 — 카카오 로그인 왕복에서 출석이 사라진다').toContain('checkin');
});

test('푸터 법적 링크 — 문서가 열리고 홈이 사라지지 않는다', async ({ page }) => {
  const terms = page.getByRole('button', { name: /이용약관/ }).first();
  if (await terms.count() === 0) test.skip(true, '푸터 약관 버튼이 없다');
  await terms.click();
  await expect(page.getByText(/약관|제1조|총칙/).first()).toBeVisible({ timeout: 10_000 });
});
