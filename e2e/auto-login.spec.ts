// 자동 로그인(로그인 상태 유지) — 오너 #8.
//
// 여기서 재는 것은 "체크박스가 화면에 있다"가 아니라 **토큰이 실제로 어느 저장소에 들어갔는가**다.
// 코드에 존재하는지 확인하는 건 검증이 아니다 — 그래서 세 가지를 런타임으로 잰다:
//   ① 체크 ON  → localStorage 에 세션. 그 storageState 를 새 컨텍스트에 심으면 로그인 상태로 시작한다.
//   ② 체크 OFF → sessionStorage 에만 세션(localStorage 잔존 0). 새 탭은 sessionStorage 를 공유하지
//      않으므로 '탭을 닫으면 해제'와 동치다 — 새 탭에서 비로그인으로 보이는지 확인한다.
//   ③ 로그아웃 → 두 저장소 모두 잔존 0(한쪽만 지우면 '로그아웃했는데 다시 로그인됨' 사고).
//
// ⚠ 이 스펙만 UI 로그인을 거친다(auth-smoke 와 같은 이유로 나머지는 세션 주입을 쓴다).
//   체크박스의 효과는 '로그인 요청을 보내기 전 플래그'라서 세션 주입으로는 잴 수 없기 때문이다.
import { test, expect, type Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, SUPABASE_URL } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const HAS_CREDS = !!EMAIL && !!PASSWORD;

/** supabase-js 세션 키 = `sb-<project-ref>-auth-token`(+ PKCE 검증자 접미사) */
const AUTH_KEY_RE = /^sb-.+-auth-token/;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;

/** 한 저장소의 인증 키 목록 — 하네스가 스스로를 증명하도록 '있음'도 함께 단언한다(0건 = 무효). */
async function authKeys(page: Page, which: 'local' | 'session'): Promise<string[]> {
  return page.evaluate((w) => {
    const s = w === 'local' ? window.localStorage : window.sessionStorage;
    const out: string[] = [];
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && /^sb-.+-auth-token/.test(k)) out.push(k);
      }
    } catch { /* 저장소 차단 */ }
    return out;
  }, which);
}

/** 로그인 모달을 열고 '자동 로그인' 체크를 원하는 상태로 맞춘 뒤 이메일 로그인 */
async function uiLogin(page: Page, keep: boolean): Promise<void> {
  await stabilizeBackstack(page); // 새 페이지는 history.length=1 이라 모달이 열리자마자 닫힌다
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '로그인' }).first().click();

  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const box = dialog.getByTestId('auto-login');
  await expect(box).toBeVisible();
  if (keep) await box.check(); else await box.uncheck();
  await expect(box).toBeChecked({ checked: keep });

  await dialog.locator('input[type="email"]').fill(EMAIL!);
  await dialog.locator('input[type="password"]').first().fill(PASSWORD!);
  await dialog.getByRole('button', { name: /^로그인$/ }).last().click();

  // 로그인 성공 → 헤더 '로그인' 버튼이 사라진다(프로필 아바타로 대체)
  await expect(page.getByRole('button', { name: '로그인' })).toHaveCount(0, { timeout: 20_000 });
}

test.describe('자동 로그인 체크박스', () => {
  test('기본값은 켜짐 — 라이브 사용자의 기존 세션(localStorage)을 끊지 않는다', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.goto('/');
    await dismissOverlays(page);
    await page.getByRole('button', { name: '로그인' }).first().click();

    const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByTestId('auto-login')).toBeChecked();
    // 공용 PC 경고는 체크 여부와 무관하게 상시 노출(국내 관행·고지 의무)
    await expect(dialog.getByText('공용 PC에서는 꼭 해제하세요.')).toBeVisible();
  });

  test('체크 켬 → localStorage 에 세션이 남고, 새 컨텍스트에서도 로그인 상태로 시작한다', async ({ page, browser }) => {
    test.skip(!HAS_CREDS, '자격증명 미설정');
    await uiLogin(page, true);

    // 어느 저장소로 갔는지 직접 확인 — '켜짐'의 정의가 곧 localStorage 다
    expect(await authKeys(page, 'local'), '자동 로그인 ON 인데 localStorage 에 세션이 없다').toContain(AUTH_KEY);
    expect(await authKeys(page, 'session'), '자동 로그인 ON 인데 sessionStorage 에도 세션이 남았다(유령 세션)').toEqual([]);

    // storageState 는 localStorage 만 담는다 — 즉 여기 세션이 있다는 건 '브라우저를 닫아도 남는다'와 동치다.
    const state = await page.context().storageState();
    const origin = state.origins.find((o) => o.localStorage.some((e) => AUTH_KEY_RE.test(e.name)));
    expect(origin, 'storageState 에 인증 토큰이 없다').toBeTruthy();

    // 실제로 새 브라우저 컨텍스트(= 새로 켠 브라우저)에서 로그인 상태로 시작하는지
    const ctx2 = await browser.newContext({ storageState: state });
    const page2 = await ctx2.newPage();
    await page2.goto('/');
    await expect(page2.getByRole('button', { name: '로그인' })).toHaveCount(0, { timeout: 20_000 });
    await ctx2.close();
  });

  test('체크 끔 → sessionStorage 에만 남고, 새 탭은 비로그인이다(탭 종료 = 해제)', async ({ page, context }) => {
    test.skip(!HAS_CREDS, '자격증명 미설정');
    await uiLogin(page, false);

    expect(await authKeys(page, 'session'), '자동 로그인 OFF 인데 sessionStorage 에 세션이 없다').toContain(AUTH_KEY);
    expect(await authKeys(page, 'local'), '자동 로그인 OFF 인데 localStorage 에 세션이 남았다 — 브라우저를 닫아도 살아난다').toEqual([]);

    // storageState(=localStorage+쿠키)에 인증 흔적이 없어야 한다
    const state = await context.storageState();
    const leaked = state.origins.flatMap((o) => o.localStorage.filter((e) => AUTH_KEY_RE.test(e.name)));
    expect(leaked, 'OFF 인데 영속 저장소로 새어 나갔다').toEqual([]);

    // 새 탭은 sessionStorage 를 공유하지 않는다 — 탭을 닫았다 다시 여는 것과 같은 조건.
    const tab2 = await context.newPage();
    await tab2.goto('/');
    await expect(tab2.getByRole('button', { name: '로그인' }).first()).toBeVisible({ timeout: 20_000 });
    expect(await authKeys(tab2, 'session'), '새 탭에 세션이 따라왔다').toEqual([]);
    await tab2.close();
  });

  test('로그아웃 → localStorage·sessionStorage 양쪽 모두 잔존 0', async ({ page }) => {
    test.skip(!HAS_CREDS, '자격증명 미설정');
    await uiLogin(page, true);

    // 이전 세션의 잔재를 일부러 심는다 — 한쪽만 지우는 구현이면 여기서 살아남는다.
    await page.evaluate((k) => {
      const v = window.localStorage.getItem(k);
      if (v) window.sessionStorage.setItem(k, v);
    }, AUTH_KEY);
    expect(await authKeys(page, 'session'), '대조군 주입 실패 — 이 테스트는 무효다').toContain(AUTH_KEY);

    await page.locator('button[aria-label$=" 메뉴"]').first().click();
    await page.getByRole('button', { name: '로그아웃' }).first().click();
    await expect(page.getByRole('button', { name: '로그인' }).first()).toBeVisible({ timeout: 20_000 });

    await expect.poll(() => authKeys(page, 'local'), { timeout: 10_000 }).toEqual([]);
    expect(await authKeys(page, 'session'), '로그아웃 후 sessionStorage 에 세션이 남았다').toEqual([]);

    // 새로고침해도 되살아나지 않는다
    await page.reload();
    await expect(page.getByRole('button', { name: '로그인' }).first()).toBeVisible({ timeout: 20_000 });
  });
});
