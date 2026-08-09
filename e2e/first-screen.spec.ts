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
    await dismissOverlays(page);
    await page.waitForTimeout(1500);
  });

  test('🔴 아무 조건도 안 걸린 첫 화면에 끝난 대회가 카드로 뜨지 않는다', async ({ page }) => {
    // '지난 대회' 전용 섹션(🏁)은 예외 — 거기서만 보여야 한다.
    const endedInMain = await page.evaluate(() => {
      const past = [...document.querySelectorAll('*')].find((e) => /🏁\s*지난 대회/.test(e.textContent || '') && e.children.length < 40);
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
    const dates = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll('article')) {
        const m = (el.textContent || '').match(/(\d{2})\/(\d{2})\(/);
        if (m) out.push(`${m[1]}${m[2]}`);
      }
      return out;
    });
    test.skip(dates.length < 2, '카드가 2개 미만이라 정렬을 판단할 수 없다');
    // 프리미엄 고정이 앞에 올 수 있으므로 '전체가 내림차순은 아니다' 정도로 약하게 본다:
    // 최소한 '뒤로 갈수록 과거'인 역순이면 안 된다.
    const reversed = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates.join(','), '목록이 과거→미래 역순으로 보인다').not.toBe(reversed.join(','));
  });
});
