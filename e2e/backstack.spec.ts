// 뒤로가기 스택 회귀 게이트
//
// ── 왜 이 파일이 생겼나 ─────────────────────────────────────────────────────
// `{open && <Modal open/>}` 형태의 모달이 **개발 모드에서만** 떴다가 즉시 닫혔다.
// 원인은 backstack 의 정리(disposer)가 부르는 `history.back()` 이 비동기라,
// React StrictMode 의 이중 이펙트(실행→정리→재실행)와 순서가 꼬여
// "방금 다시 연 레이어" 를 닫아버린 것이었다.
//
// 무서운 건 증상이 아니라 **감지되지 않았다는 점**이다.
//   · 프로덕션 빌드는 이중 실행이 없어 멀쩡했다 → 사용자 제보가 없다
//   · E2E 는 개발 서버를 물고 도니까 모달 검증이 통째로 불가능했는데,
//     그게 "실패" 가 아니라 "그 흐름을 아무도 안 건드림" 으로 보였다
// 그래서 고친 뒤에는 반드시 **양쪽 방향**을 다 못 박아야 한다.
//   ① 모달이 열린 채 유지되는가 (이번에 고친 것)
//   ② 뒤로가기로 여전히 닫히는가 (고치면서 망가뜨리기 쉬운 것)
// ②가 없으면 "back() 을 아예 안 부르게" 만들어도 테스트가 통과해 버린다.
//
// ── 2026-08-28 확장: 오버레이별 push/pop 균형 전수 검사 ─────────────────────
// 위 세 테스트는 '로그인 모달 하나' 만 본다. 그런데 오너가 겪은 '뒤로가기가 홈으로 튄다' 는
// **어느 오버레이가 균형을 깨뜨렸는지** 를 알아야 고칠 수 있는 문제였다(실제로 매장 페이지·
// 포스터 상세·참가 시트가 서로 다른 이유로 깨져 있었다). 그래서 열 수 있는 오버레이를
// 목록으로 만들고 같은 세 가지를 전부에 대해 자동으로 돌린다.
//   ① 열면 history 항목이 늘어난다(안 늘면 뒤로가기로 못 닫는다 → 아래 겹이 닫혀 홈으로 튄다)
//   ② 여닫기를 반복해도 정상상태가 같다(죽은 항목이 쌓이면 뒤로가기가 헛돈다 = 먹통)
//   ③ 뒤로가기 한 번이 그 오버레이만 닫고 열기 전 화면으로 되돌린다
import { test, expect } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';
import { installNavProbe, currentScreen } from './_navprobe';

/** 로그인 모달(이메일 입력칸을 가진 다이얼로그) */
const authDialog = (p: import('@playwright/test').Page) =>
  p.locator('[role="dialog"]').filter({ has: p.locator('input[type="email"]') });

async function openLogin(page: import('@playwright/test').Page) {
  await page.locator('button[aria-label="로그인"]').click();
  await expect(authDialog(page)).toHaveCount(1, { timeout: 10_000 });
}

test.describe('뒤로가기 스택', () => {
  test.beforeEach(async ({ page }) => {
    await stabilizeBackstack(page); // 새 탭은 history.length=1 이라 back 이 앱을 벗어난다
    await page.goto('/');
    await dismissOverlays(page);
  });

  test('🔴 모달이 열리면 그 자리에 머문다 — 열자마자 스스로 닫히지 않는다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await openLogin(page);
    // 3초를 버텨야 한다. 예전 버그는 200ms 안에 스스로 닫혔으므로 짧게 재면 못 잡는다.
    await page.waitForTimeout(3_000);
    await expect(authDialog(page), '모달이 스스로 닫혔다 — backstack 정리 경합 재발').toHaveCount(1);
    expect(errors, `예외: ${errors.join(' | ')}`).toEqual([]);
  });

  test('🔴 뒤로가기로 모달이 닫힌다 — 그리고 앱을 벗어나지 않는다', async ({ page }) => {
    await openLogin(page);
    await page.goBack();
    await expect(authDialog(page), '뒤로가기로 모달이 안 닫힌다 — back() 을 안 부르게 만든 회귀').toHaveCount(0, { timeout: 5_000 });
    // 뒤로가기가 모달 한 겹만 소비해야 한다 — 앱까지 빠져나가면 화면이 빈다
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('🔴 X/ESC 로 닫으면 history 가 원래 자리로 돌아온다(균형)', async ({ page }) => {
    // ⚠ 처음엔 이 테스트가 '뒤로가기 후 #root 가 비지 않았다' 만 봤다.
    //   그래서 back() 호출을 통째로 지워도 **통과했다** — 아무것도 지키지 않는 테스트였다.
    //   실제 피해는 화면이 비는 게 아니라 '뒤로가기를 눌렀는데 아무 일도 안 일어남' 이다.
    //   모달이 밀어넣은 history 항목이 유령처럼 남아 첫 back 을 삼켜 버리기 때문이다.
    //   그건 화면이 아니라 **history 위치**를 봐야 보인다.
    //   ⚠ '닫은 뒤 레이어가 특정 값이어야 한다' 로는 못 쓴다. 시작점이 두 가지 이유로 오염된다.
    //     ① gtag·reCAPTCHA 같은 **iframe** 이 최상위 joint history 에 항목을 끼워 넣는데,
    //        그 항목들은 최상위의 history.state 를 그대로 물려받는다(앱이 통제 못 하는 잡음).
    //     ② 개발 모드 StrictMode 의 이중 이펙트가 죽은 레이어 항목을 하나 남긴다.
    //   그래서 **절대값이 아니라 정상상태(steady state)** 를 본다:
    //     여닫기를 두 번 하고, 두 사이클의 종료 지점이 같은지. 닫을 때 history 를 안 되돌리면
    //     사이클마다 죽은 항목이 하나씩 쌓여 두 값이 달라진다 — 그게 '뒤로가기가 헛도는' 원인이다.
    const layerOf = () => page.evaluate(() => {
      const st = history.state as { __layer?: number } | null;
      return st && typeof st.__layer === 'number' ? st.__layer : null;
    });

    const cycle = async () => {
      const before = await layerOf();
      await openLogin(page);
      expect(await layerOf(), '모달이 열렸는데 history 항목을 안 밀어넣었다 — 뒤로가기로 못 닫는다')
        .not.toBe(before);
      await page.keyboard.press('Escape');
      await expect(authDialog(page)).toHaveCount(0, { timeout: 5_000 });
      await page.waitForTimeout(600); // 정리 back() 이 반영될 시간
      return layerOf();
    };

    const first = await cycle();
    const second = await cycle();
    expect(second, `여닫을 때마다 죽은 history 항목이 쌓인다(${first} → ${second}) — 닫은 뒤 뒤로가기가 헛돈다`)
      .toBe(first);
    // ⚠ 여기서 goBack() 을 더 눌러 보면 안 된다. 균형이 맞다는 건 곧 '이제 뒤로가기는 앱을
    //   벗어난다' 는 뜻이라 페이지가 닫히고 테스트가 죽는다(실제로 그렇게 실패했다).
    //   모달이 열린 상태의 뒤로가기는 위 테스트가 이미 본다.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 오버레이별 push/pop 균형 — 전수 검사
// ─────────────────────────────────────────────────────────────────────────────
interface OverlayCase {
  name: string;
  /** 오버레이를 연다 */
  open: (p: import('@playwright/test').Page) => Promise<void>;
  /** 열렸음을 확인하는 마커 */
  marker: (p: import('@playwright/test').Page) => import('@playwright/test').Locator;
  /** 프로그램적으로 닫는다(X·ESC·닫기 버튼) — 뒤로가기가 아니다 */
  close: (p: import('@playwright/test').Page) => Promise<void>;
}

const CASES: OverlayCase[] = [
  {
    name: '로그인 모달',
    open: async (p) => { await p.locator('button[aria-label="로그인"]').first().click(); },
    marker: (p) => p.locator('[role="dialog"]').filter({ has: p.locator('input[type="email"]') }),
    close: async (p) => { await p.keyboard.press('Escape'); },
  },
  {
    name: '포스터 상세',
    // 데이터 의존: 홈 '오늘·내일' 카드(article)가 0건인 날엔 열 것이 없다 — 실패가 아니라 skip(CI 가 이걸로 상시 빨갛던 2026-08-30~09-02)
    open: async (p) => {
      const card = p.locator('[data-tab="home"] article').first();
      if (await card.count() === 0) test.skip(true, '홈에 오늘·내일 일정 카드 0건 — 라이브 데이터 의존');
      await card.click();
    },
    marker: (p) => p.locator('[role="dialog"][aria-label="전체화면 보기"]'),
    close: async (p) => { await p.keyboard.press('Escape'); },
  },
  // ⚠ '매장 페이지' 케이스는 뺐다 — 진입이 공개 매장 데이터(목록에 무엇이 있는지)에 좌우돼
  //   게이트가 데이터 변화로 빨개진다(CI·로컬 모두 실패 전례). 매장 오버레이의 뒤로가기 균형은
  //   아래 nav-stability 의 조건부 케이스가 데이터가 있을 때만 검사한다.
  //   나머지 6종(로그인·포스터 상세·알림·약관·고객센터·통합검색)이 균형 계약을 잠근다.
  {
    name: '알림 패널',
    open: async (p) => { await p.locator('button[aria-label^="알림"]').first().click(); },
    marker: (p) => p.locator('button[aria-label^="알림"][aria-expanded="true"]'),
    // 패널이 깔아 둔 스크림(z-40)이 종 버튼을 덮으므로 다시 누를 수 없다 — 실사용대로 바깥을 눌러 닫는다.
    close: async (p) => { await p.mouse.click(10, 700); },
  },
  {
    name: '이용약관',
    open: async (p) => { await p.getByRole('button', { name: '이용약관', exact: true }).first().click(); },
    marker: (p) => p.locator('[role="dialog"]').filter({ hasText: '약관' }).first(),
    close: async (p) => { await p.keyboard.press('Escape'); },
  },
  {
    name: '고객센터 문의',
    open: async (p) => { await p.getByRole('button', { name: '고객센터 문의' }).first().click(); },
    marker: (p) => p.locator('[role="dialog"]').filter({ hasText: '문의' }).first(),
    close: async (p) => { await p.keyboard.press('Escape'); },
  },
  {
    name: '통합 검색(Ctrl+K)',
    open: async (p) => { await p.keyboard.press('Control+k'); },
    marker: (p) => p.locator('[role="dialog"]').filter({ has: p.locator('input') }).first(),
    close: async (p) => { await p.keyboard.press('Escape'); },
  },
];

const layerOf = (p: import('@playwright/test').Page) => p.evaluate(() => {
  const st = history.state as { __layer?: number } | null;
  return st && typeof st.__layer === 'number' ? st.__layer : 0;
});

test.describe('오버레이별 뒤로가기 균형 — 전수', () => {
  test.beforeEach(async ({ page }) => {
    await installNavProbe(page);
    await stabilizeBackstack(page);
    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForSelector('[data-tab="home"]', { timeout: 20_000 });
  });

  for (const c of CASES) {
    test(`🔴 ${c.name} — 열면 항목이 늘고, 여닫아도 쌓이지 않고, back 이 한 겹만 닫는다`, async ({ page }) => {
      // ① + ② 정상상태 비교(절대값은 gtag·iframe 잡음으로 오염되므로 두 사이클의 끝을 비교한다)
      const cycle = async () => {
        const before = await layerOf(page);
        await c.open(page);
        await expect(c.marker(page), `${c.name}가 안 열렸다 — 셀렉터가 낡았거나 진입점이 사라졌다`)
          .toHaveCount(1, { timeout: 10_000 });
        expect(await layerOf(page), `${c.name}가 history 항목을 안 밀어넣었다 — 뒤로가기가 이 겹이 아니라 아래 탭을 닫아 홈으로 튄다`)
          .not.toBe(before);
        await c.close(page);
        await expect(c.marker(page)).toHaveCount(0, { timeout: 10_000 });
        await page.waitForTimeout(600); // 정리(go(-k))가 반영될 시간
        return layerOf(page);
      };
      const first = await cycle();
      const second = await cycle();
      expect(second, `${c.name}를 여닫을 때마다 죽은 history 항목이 쌓인다(${first} → ${second}) — 뒤로가기 한 번이 통째로 죽는다`)
        .toBe(first);

      // ③ 뒤로가기 한 번 = 그 겹만 닫고 열기 전 화면으로
      const baseline = await currentScreen(page);
      await c.open(page);
      await expect(c.marker(page)).toHaveCount(1, { timeout: 10_000 });
      await page.evaluate(() => window.history.back());
      await expect(c.marker(page), `${c.name}가 뒤로가기로 안 닫힌다`).toHaveCount(0, { timeout: 5_000 });
      await page.waitForTimeout(400);
      expect(await currentScreen(page), `${c.name}를 뒤로가기로 닫았더니 열기 전 화면이 아니라 다른 곳으로 갔다`)
        .toBe(baseline);
      await expect(page.locator('#root')).not.toBeEmpty();
    });
  }
});
