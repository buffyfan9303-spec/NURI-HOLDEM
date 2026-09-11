// 도구 탭 — 전체화면 실행·데이터 게이트.
//
// P26 이전의 구조적 결함: 도구 카드를 누르면 패널이 "그 카드 행 아래 인라인"으로 열려
// 위에 런처가 그대로 남았다(중간 도구를 누르면 열린 곳을 찾아 스크롤해야 했다).
// 이제 도구는 앱의 다른 상세 화면과 같은 전체화면 페이지(Modal page)다 — 그 계약을 잰다.
// 데이터 게이트: 레인지·푸시폴드가 실데이터(콤보 가중 %)를 렌더하는지까지.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays, stubLogin } from './_session';

// GTO 도구 실행은 로그인 회원 전용이 됐다(오너 지시 2026-08-27) — 이 스펙은 로그인 후 계약을 잰다.
//
// 2026-09-12: 자격증명 게이트를 걷고 stubLogin(네트워크 0)으로 연다 — 계정 은퇴로 6건이 꺼져 있었다.
//   이 파일은 교체에 특히 안전하다: 여는 도구 셋이 **서버를 안 부른다**(레인지·Nash 는 번들 상수,
//   트레이너 기록은 localStorage). 즉 '목킹이 정의상 통과시키는 서버 응답' 이 이 파일에는 애초에 없고,
//   콤보 가중 %·포지션별 올인 비율·오답 접두 키 단언은 교체 전후로 똑같이 물린다.
//   스텁이 깨져도 조용하지 않다 — ToolsPanel 이 promptLogin() 을 띄워 6건이 다 큰 소리로 실패한다.
//
// ⚠ 두 가지를 알아 둘 것:
//   · stubLogin 은 `/auth/v1/user` 를 라우트하지 않는다. 지금 이 경로의 신원 판정은 전부 로컬 세션
//     읽기(src/api/_session.ts)라 무해하지만, 부팅 경로에 `supabase.auth.getUser()` 가 하나라도
//     들어오면 6건이 동시에 죽고 증상은 '로그인이 안 된다' 로 보인다 — 그때 여길 보라.
//   · 딥링크 테스트의 '라이브 판이 섰다' 단언은 `[data-tab="live"]` 래퍼를 보는데, 그 래퍼는
//     ErrorBoundary **바깥**이다. 즉 라이브 데이터가 깨져도 통과한다 — 교체가 만든 헐거움이 아니라
//     원래 그랬다(이 테스트가 재는 건 데이터가 아니라 '뒤로가기가 어느 판으로 돌아오는가' 다).

async function gotoTools(page: import('@playwright/test').Page) {
  await stabilizeBackstack(page);
  await stubLogin(page);          // ⚠ addInitScript 를 심는다 — goto 보다 먼저여야 한다
  await page.goto('/');
  // 온보딩 시트는 첫 페인트 700ms '뒤에' 뜬다 — 즉시 count 체크는 레이스(홈 전환으로 부팅이
  // 빨라지며 실제로 물렸다). 지연 등장까지 기다려 걷어내는 공용 헬퍼 사용.
  await dismissOverlays(page);
  await page.locator('nav').getByRole('button', { name: 'GTO', exact: true }).first().click();
}

test.describe('도구 탭 — 전체화면 실행', () => {
  test('🔴 도구 카드를 누르면 전체화면 페이지로 열리고, 닫으면 런처로 돌아온다', async ({ page }) => {
    await gotoTools(page);
    // 레인(5갈래)은 접이가 아니라 상시 노출 섹션이다(f511890 이 GTO IA 를 레인·검색·즐겨찾기로 갈았다)
    //   — 펼치는 동작 없이 카드가 바로 보여야 한다.
    // ⚠ .first(): grid() 가 즐겨찾기 행과 레인 섹션 양쪽에서 같은 data-testid 를 찍는다.
    //   nuri:fav-tools 가 비어 오늘은 유일하지만, 기본 즐겨찾기가 생기는 순간 이건 회귀가 아니라
    //   strict mode violation 으로 죽는다.
    const card = page.getByTestId('tool-range').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    // 전체화면 페이지(role=dialog, 제목 = 도구 이름)
    const dialog = page.locator('[role="dialog"]').filter({ has: page.getByTestId('range-guide') }).first();
    await expect(dialog).toBeVisible();
    // 딥링크 해시가 걸린다
    await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('tool=range');

    // 닫기 → 런처 복귀 + 해시 해제
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).not.toContain('tool=');
    await expect(card).toBeVisible();
  });

  test('🔴 프리플랍 레인지 차트 — 13x13 매트릭스와 콤보 가중 %가 실제로 렌더된다', async ({ page }) => {
    await gotoTools(page);
    await page.getByTestId('tool-range').first().click();   // ⚠ 즐겨찾기 중복 — 위 주석 참고
    const dialog = page.locator('[role="dialog"]').filter({ has: page.getByTestId('range-guide') }).first();
    await expect(dialog).toBeVisible();

    // 169셀 — AA와 72o가 다 있다
    await expect(dialog.getByRole('button', { name: 'AA 상세' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '72o 상세' })).toBeVisible();
    // 콤보 가중 요약(오픈 xx.x%)이 0이 아니다
    const summary = await dialog.locator('text=/오픈/').first().textContent();
    expect(summary).toBeTruthy();

    // 셀 탭 → 하단 상세(콤보 수)
    await dialog.getByRole('button', { name: 'AA 상세' }).click();
    // '1326콤보' 각주와의 부분일치를 피해 exact 매치
    await expect(dialog.getByText('6콤보', { exact: true })).toBeVisible();
  });

  test('🔴 푸시폴드 — 자체 Nash 데이터가 포지션·스택별로 바뀐다', async ({ page }) => {
    await gotoTools(page);
    await page.getByRole('button', { name: /푸시 · 폴드 차트/ }).first().click();
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '푸시 · 폴드' }).first();
    await expect(dialog).toBeVisible();

    const pctOf = async () => {
      const t = await dialog.locator('text=/올인 [0-9.]+%/').first().textContent();
      return Number((t ?? '').match(/올인 ([0-9.]+)%/)?.[1] ?? 0);
    };
    // 기본 BTN 10bb — 상식 범위(20~45%)
    const btn10 = await pctOf();
    expect(btn10).toBeGreaterThan(15);
    expect(btn10).toBeLessThan(50);

    // SB로 바꾸면 훨씬 넓어진다
    await dialog.getByRole('button', { name: 'SB', exact: true }).click();
    await expect.poll(pctOf).toBeGreaterThan(btn10);

    // UTG(9인)는 훨씬 좁아진다
    await dialog.getByRole('button', { name: 'UTG(9인)' }).click();
    await expect.poll(pctOf).toBeLessThan(btn10);
  });

  test('프리플랍 트레이너 — 답하면 빈도 게이지가 뜨고 기록이 저장된다', async ({ page }) => {
    await gotoTools(page);
    await page.getByRole('button', { name: /프리플랍 트레이너/ }).first().click();
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '프리플랍 트레이너' }).first();
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '폴드', exact: true }).click();
    // 피드백(정답/아쉬워요 + 빈도 %) — '정답률' 통계와의 부분일치를 피해 느낌표 포함 매치
    await expect(dialog.locator('text=/정답!|아쉬워요/')).toBeVisible();
    await expect(dialog.locator('text=/%/').first()).toBeVisible();
    // 기록 영속
    const saved = await page.evaluate(() => localStorage.getItem('nuri:trainer:preflop:v2'));
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!).total).toBeGreaterThan(0);
  });

  // 모드 확장(2026-09-03): 블라인드 수비·vs 3벳은 3택(폴드 + 3벳/4벳 + 콜). 오답 키 접두('v3b|')가 새 모드로 저장되는지까지.
  // 수비 모드는 SB vs 얼리 스팟이 3벳 단독(2택)이라 비결정 — 10스팟 전부 4벳·콜인 vs 3벳 모드로 검사한다.
  test('프리플랍 트레이너 — vs 3벳 모드는 3택이고 답하면 새 접두 키로 기록된다', async ({ page }) => {
    await gotoTools(page);
    await page.getByRole('button', { name: /프리플랍 트레이너/ }).first().click();
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '프리플랍 트레이너' }).first();
    await expect(dialog).toBeVisible();

    await dialog.getByTestId('preflop-mode').getByRole('button', { name: 'vs 3벳', exact: true }).click();
    const answers = dialog.getByTestId('preflop-quiz-answers');
    await expect(answers.getByRole('button')).toHaveCount(3);
    await expect(answers.getByRole('button', { name: '4벳', exact: true })).toBeVisible();
    await expect(answers.getByRole('button', { name: '콜', exact: true })).toBeVisible();

    await answers.getByRole('button', { name: '콜', exact: true }).click();
    await expect(dialog.locator('text=/정답!|아쉬워요/')).toBeVisible();
    // 액션별 게이지 2줄(4벳·콜)
    const gauges = dialog.getByTestId('preflop-quiz-gauge');
    await expect(gauges).toHaveCount(2);
    await expect(gauges.nth(0)).toContainText('4벳');
    await expect(gauges.nth(1)).toContainText('콜');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nuri:trainer:preflop:v2') || '{}') as { total: number; wrong: string[] });
    expect(saved.total).toBeGreaterThan(0);
    for (const k of saved.wrong) expect(k).toMatch(/^v3b\|/); // 오답이면 새 접두로 큐에 들어간다(오답 노트·드릴·SRS 승계)
  });
});

// 다른 탭에서 도구 열기 계약(nuri:open-tool) — 내 토너 카드의 차트 딥링크가 쓰는 실제 코드 경로.
// 내 토너 계정 없이도 검증되도록 이벤트를 직접 쏜다. 핵심은 '도구 탭 미방문' 상태:
// 2026-09-03 실측 회귀 — 첫 마운트 커밋의 layout 단계 뒤·passive 이펙트 앞에 hashchange 가 도착하면
// 리스너가 아직 없어 카탈로그만 떴다(프로덕션 빌드 x1·x4·x8 모두). keep-alive 만 재면 절대 못 잡는다.
test.describe('도구 딥링크 — 다른 탭에서 열기', () => {
  test('🔴 도구 탭 미방문 상태에서 nuri:open-tool → 차트가 열리고, 뒤로가기 1회 = 닫기 · 2회 = 이전 탭', async ({ page }) => {
    await stabilizeBackstack(page);
    // 프리마운트(idle 마다 live→community→tools 숨김 마운트)가 '미방문' 전제를 깨지 않도록 idle 을 5s 폴백으로 미룬다.
    await page.addInitScript(() => { if (window.top === window) delete (window as unknown as Record<string, unknown>).requestIdleCallback; });
    await stubLogin(page);
    await page.goto('/');
    await dismissOverlays(page);
    await page.locator('nav').getByRole('button', { name: '라이브', exact: true }).first().click();
    await expect(page.locator('[data-tab="live"]')).toBeVisible();
    // 전제: 도구 pane 이 아직 없다(첫 방문 경로)
    await expect(page.locator('[data-tab="tools"]')).toHaveCount(0);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:open-tool', { detail: 'pushfold' })));
    const dialog = page.locator('[role="dialog"]').filter({ hasText: '푸시 · 폴드 차트' }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('tool=pushfold');

    // 뒤로가기 1회 = 도구 닫기(도구 탭 런처에 머문다)
    await page.goBack();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-tab="tools"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).not.toContain('tool=');
    // 뒤로가기 2회 = 이전 탭(라이브) 복귀
    await page.goBack();
    await expect(page.locator('[data-tab="live"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-tab="tools"]')).toBeHidden();
  });
});
