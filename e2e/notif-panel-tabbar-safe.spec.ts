// 알림·쪽지 패널 하단이 하단 탭바(플로팅 알약)에 가리지 않는다 (2026-09-19 스윕 [high], team-lead 추가)
//
// 증상: 모바일에서 패널을 열고 **DM 대화 서브뷰**로 들어가면 하단의 입력창+'보내기' 버튼이
//   하단 탭바(`glass-strong`, 불투명)에 가려지거나 탭이 탭바로 가로채였다. 오너가 지적한 적 있는
//   부류다("장부 '장부 시작·저장' 버튼이 하단 탭바에 가려 안 눌리던 것").
// 원인: NotificationPanel 의 max-h 가 `calc(100vh-header-max-1rem)` 뿐이라 하단 탭바 자리
//   (`--tabbar-safe`, src/index.css)를 빼지 않았다.
// 고침: 모바일(`sm:` 미만)에서만 max-h 에 `var(--tabbar-safe)` 를 뺀다. 탭바가 없는 sm 이상은 그대로.
//
// 왜 elementFromPoint 인가: 눈으로는 버튼이 보여도 탭바가 z-순서상 위라 탭이 가로채이는 경우가
//   이 부류의 전형이다(스킬 nuri-e2e ⑧). getBoundingClientRect 만으로는 못 잡는다.
//
// 왜 새 쪽지 검색 경로인가: 스레드 뷰(입력창+보내기가 있는 화면)는 NotificationPanel.openThread 가
//   기존 대화 이력 없이도 연다 — '새 쪽지' → 닉네임 검색 → 결과 클릭 한 번으로 도달한다.
//   find_user_for_transfer 는 e2e/_fixtures.ts 의 READ_ONLY_RPCS 밖(쓰기 취급으로 기본 차단)이라
//   여기서만 페이지 라우트로 풀어준다(페이지 라우트가 컨텍스트 라우트를 이긴다 — 같은 파일 주석).
//
// ⚠ 음성 대조(2026-09-19 실행 예정 — 서버 미기동으로 이 커밋에서는 못 돌렸다. B의 `.hit`+
//   이번 max-h 수정을 되돌리면 `coveredBySelf` 가 false 이거나 `bottom > tabTop` 이 돼야 빨개진다.
//   되돌려서 실제로 확인한 뒤 이 줄을 지워라 — nuri-e2e 스킬의 안전 절차(백업→빌드→즉시 복원→해시 대조)를 쓴다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';

test('🔴 쪽지 DM 서브뷰 — 보내기 버튼이 하단 탭바에 가려지거나 가로채이지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stubLogin(page);
  await stabilizeBackstack(page);

  await page.route('**/rest/v1/rpc/find_user_for_transfer', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: '00000000-0000-4000-8000-0000000000f2', display: 'DM상대', verified: false }]),
    }));

  await page.goto('/?tab=home');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
  await page.evaluate(() => (document.querySelector('button[aria-label^="알림"]') as HTMLElement)?.click());

  const dialog = page.getByRole('dialog', { name: '알림' });
  await expect(dialog, '알림 패널이 열리지 않았다').toBeVisible({ timeout: 10_000 });

  await dialog.getByRole('button', { name: '새 쪽지' }).click();
  await dialog.getByLabel('받는 사람 닉네임 검색').fill('DM상대');
  await dialog.getByRole('button', { name: 'DM상대' }).click(); // 검색 결과 클릭 → openThread (기존 이력 불필요)

  const send = dialog.getByRole('button', { name: '보내기' });
  await expect(send, 'DM 서브뷰(입력창+보내기)로 못 들어갔다').toBeVisible({ timeout: 10_000 });

  const geo = await send.evaluate((btn) => {
    const r = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const tabbar = document.querySelector('nav[aria-label="하단 내비게이션"]');
    return {
      bottom: +r.bottom.toFixed(2),
      tabTop: tabbar ? +tabbar.getBoundingClientRect().top.toFixed(2) : -1, // -1 = 탭바를 못 찾음(그 자체로 아래 단언이 실패해야 한다)
      coveredBySelf: !!hit && (hit === btn || btn.contains(hit)),
      hitTag: hit ? `${hit.tagName}.${String((hit as HTMLElement).className || '').slice(0, 40)}` : null,
    };
  });

  expect(geo.coveredBySelf, `보내기 버튼 중심이 [${geo.hitTag}] 에 가로채였다 — 탭바가 위에 있다`).toBe(true);
  expect(geo.tabTop, '하단 탭바(nav[aria-label="하단 내비게이션"])를 찾지 못했다 — 셀렉터가 낡았는지 확인해라').toBeGreaterThan(0);
  expect(geo.bottom, `보내기 버튼 밑면(${geo.bottom})이 탭바 윗면(${geo.tabTop})보다 아래다 — 겹친다`)
    .toBeLessThanOrEqual(geo.tabTop);
});
