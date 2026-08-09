// E2E 로그인 헬퍼 — 로그인 '화면'을 조작하지 않고 세션을 직접 주입한다.
//
// 왜 UI 로그인을 안 쓰나:
//  · 로그인 모달의 배경 오버레이가 헤더 버튼을 덮어 클릭이 가로채인다(실제로 auth-smoke 가 이 문제로 깨져 있었다).
//  · 로그인 UI 가 바뀔 때마다 '검증하려는 것과 무관한' 테스트가 깨진다.
//  · 매 테스트가 폼을 거치면 느리다.
// supabase-js v2 는 세션을 localStorage 의 `sb-<ref>-auth-token` 한 곳에만 둔다 —
// 앱이 로드되기 전에 그 값을 심으면 앱은 정상 로그인 상태로 시작한다.
import type { Page } from '@playwright/test';

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'https://idsxiqspecrucvfvtgbw.supabase.co';
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? 'sb_publishable_5H0ITdQ27V7EVO9fcfBdew_V9DUF0Kt';

/** 프로젝트 ref — 스토리지 키(sb-<ref>-auth-token)를 만드는 데 쓴다 */
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

export interface E2ESession { access_token: string; refresh_token: string; expires_at: number; user: unknown }

/** 비밀번호 그랜트로 세션을 받아온다(브라우저 없이 HTTP 한 번) */
export async function signIn(email: string, password: string): Promise<E2ESession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok || !body?.access_token) {
    throw new Error(`E2E 로그인 실패(${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body as E2ESession;
}

/** 페이지가 로드되기 전에 세션을 심는다 — 이후 page.goto 는 로그인된 상태로 시작한다 */
export async function injectSession(page: Page, session: E2ESession): Promise<void> {
  const key = `sb-${projectRef}-auth-token`;
  await page.addInitScript(
    ([k, v]) => { try { window.localStorage.setItem(k, v); } catch { /* 스토리지 차단 환경 */ } },
    [key, JSON.stringify(session)] as [string, string],
  );
}

/** signIn + injectSession 을 한 번에 */
export async function loginAs(page: Page, email: string, password: string): Promise<E2ESession> {
  const s = await signIn(email, password);
  await injectSession(page, s);
  return s;
}

/**
 * 백스택 shim — Playwright 전용. 앱 코드는 건드리지 않는다.
 *
 * 왜 필요한가: 이 앱은 모달을 열 때 history.pushState 하고 뒤로가기(popstate)로 닫는다.
 *   그런데 Playwright 가 새로 연 페이지는 history.length === 1 이라 '되돌아갈 곳이 없는' 상태로 보이고,
 *   pushState 직후 popstate 가 즉시 발화해 **모달이 열리자마자 닫힌다**.
 *   실제 사용자 브라우저는 방문 이력이 쌓여 있어 이 조건에 걸리지 않는다 — 프로덕션 영향 없음,
 *   순수하게 테스트 환경에서만 나타나는 현상이라 앱이 아니라 여기서 막는다.
 * 부작용: 이 shim 을 쓴 테스트에서는 '뒤로가기로 모달 닫기' 를 검증할 수 없다(별도 테스트로 다뤄야 한다).
 */
export async function stabilizeBackstack(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { history.pushState({ __e2e: true }, ''); } catch { /* noop */ }
  });
}

/**
 * 진입을 가로막는 모달을 걷어낸다(온보딩 '시작하기' 등).
 * 왜 필요한가: 온보딩을 안 끝낸 계정은 로그인 직후 전체화면 모달이 떠서
 *   하단 탭바 클릭이 전부 오버레이에 가로채인다 — 검증하려는 것과 무관하게 모든 테스트가 죽는다.
 * 실패해도 조용히 넘어간다: 모달이 없는 계정에서도 같은 헬퍼를 쓸 수 있어야 한다.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const dialog = page.locator('[role="dialog"]');
    if (!(await dialog.count())) return;
    const skip = dialog.getByRole('button', { name: /건너뛰기|닫기|시작하기|확인/ }).first();
    if (!(await skip.count())) return;
    await skip.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
}
