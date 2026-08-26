// 첫 화면 게이트 — '앱을 처음 켠 사람이 보는 것'을 못 박는다.
//
// 라이브에서 실제로 이랬다: 승인된 일정 5건이 전부 과거인데 날짜·종료 필터가 없어서,
// 첫 화면이 '종료' 카드 5장이었고 그중 두 달 전 대회가 TOP 에서 '🔥 마감 임박' 배지를 달고 있었다.
// 처음 온 사람은 '여긴 대회가 안 열리는 앱'이라고 판단하고 나간다 — 런칭 첫날의 모습이 앱의 최악 상태였다.
import { test, expect } from '@playwright/test';
import { dismissOverlays } from './_session';

test.describe('첫 화면 — 앱을 막 켠 사람이 보는 것', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // P1: 기본 화면이 홈으로 바뀜 — 이 스펙의 대상(일정 탐색)으로 이동
    await page.getByRole('button', { name: /전체 일정/ }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await dismissOverlays(page);
    await page.waitForTimeout(1500);
  });

  test('🔴 아무 조건도 안 걸린 첫 화면에 끝난 대회가 카드로 뜨지 않는다', async ({ page }) => {
    // '지난 대회' 전용 섹션(🏁)은 예외 — 거기서만 보여야 한다.
    const endedInMain = await page.evaluate(() => {
      // ICON-1: 🏁 이모지 마커가 Icon 글리프로 바뀌어 텍스트 결합 셀렉터를 data-testid 로 교체(동커밋 규칙)
      const past = document.querySelector('[data-testid="past-tournaments"]')?.closest('section, div');
      const out: string[] = [];
      for (const el of document.querySelectorAll('article')) {
        if (past && past.contains(el)) continue;         // 지난 대회 섹션 안은 제외
        if (/종료/.test(el.textContent || '')) out.push((el.textContent || '').replace(/\s+/g, ' ').slice(0, 60));
      }
      return out;
    });
    expect(endedInMain, `첫 화면 목록에 종료된 대회 카드가 있다:\n${endedInMain.join('\n')}`).toEqual([]);
  });

  test('🔴 끝난 대회에 "마감 임박" 배지가 붙지 않는다', async ({ page }) => {
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll('article')) {
        const t = (el.textContent || '').replace(/\s+/g, ' ');
        if (/마감 임박/.test(t) && /종료/.test(t)) out.push(t.slice(0, 80));
      }
      return out;
    });
    expect(bad, `종료된 대회에 '마감 임박'이 붙었다 — 거짓 긴박감:\n${bad.join('\n')}`).toEqual([]);
  });

  test('빈 화면이어도 다음에 누를 것이 있다(막다른 길이 아니다)', async ({ page }) => {
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    // 목록이 비었을 때만 검사한다 — 대회가 있으면 이 테스트는 해당 없음
    const isEmpty = /예정된 대회가 없어요|조건에 맞는 대회가 없어요|팔로우한 매장의 예정 대회가 없어요/.test(body);
    test.skip(!isEmpty, '목록에 대회가 있어 빈 화면이 아니다');
    // 빈 상태라면 반드시 (a) 다음 행동 버튼이 있거나 (b) 지난 대회로 안내해야 한다
    const hasWayOut = /조건 초기화|전체 매장 보기|지난 대회/.test(body);
    expect(hasWayOut, `빈 화면에 다음 행동이 없다 — 막다른 길:\n${body.slice(0, 500)}`).toBe(true);
  });

  test('목록이 시간순으로 정렬된다(업주 진열 순서가 아니라)', async ({ page }) => {
    // ⚠ 첫 화면은 '오늘' 이 기본 선택이라 카드가 0~1장인 날이 많다. 그러면 정렬을 판단할 수 없어
    //   테스트가 매번 skip 됐다 — 게이트가 사실상 꺼져 있었던 것이다.
    //   날짜 조건을 풀어 예정된 대회 전체를 보이게 한 뒤에 정렬을 본다.
    // ⚠ /초기화/ 정규식은 검색창의 '검색어 초기화' X 버튼도 잡는다(그쪽이 DOM 상 먼저) —
    //   전체 초기화만 정확 매칭해야 날짜 필터가 실제로 풀린다.
    const reset = page.getByRole('button', { name: '초기화', exact: true });
    if (await reset.count()) {
      await reset.click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    const dates = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll('article')) {
        const m = (el.textContent || '').match(/(\d{2})\/(\d{2})\(/);
        if (m) out.push(`${m[1]}${m[2]}`);
      }
      return out;
    });
    // 데이터가 없어서 못 도는 것과 코드가 틀린 것은 다르다 — 이유를 정확히 남긴다.
    // (조건을 다 풀었는데도 2장 미만이면 DB 에 예정 대회 자체가 없다는 뜻이다.)
    test.skip(dates.length < 2, `조건을 모두 푼 뒤에도 카드가 ${dates.length}장이라 정렬을 판단할 수 없다`
      + ' — DB 에 예정된 대회가 없는 상태다(코드 문제가 아니라 데이터 문제).');
    // 프리미엄 고정이 앞에 올 수 있으므로 '전체가 내림차순은 아니다' 정도로 약하게 본다:
    // 최소한 '뒤로 갈수록 과거'인 역순이면 안 된다.
    const reversed = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates.join(','), '목록이 과거→미래 역순으로 보인다').not.toBe(reversed.join(','));
  });
});
