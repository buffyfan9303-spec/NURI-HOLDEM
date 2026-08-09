// E2E 로그인 헬퍼 — 로그인 '화면'을 조작하지 않고 세션을 직접 주입한다.
//
// 왜 UI 로그인을 안 쓰나:
//  · 로그인 모달의 배경 오버레이가 헤더 버튼을 덮어 클릭이 가로채인다(실제로 auth-smoke 가 이 문제로 깨져 있었다).
//  · 로그인 UI 가 바뀔 때마다 '검증하려는 것과 무관한' 테스트가 깨진다.
//  · 매 테스트가 폼을 거치면 느리다.
// supabase-js v2 는 세션을 localStorage 의 `sb-<ref>-auth-token` 한 곳에만 둔다 —
// 앱이 로드되기 전에 그 값을 심으면 앱은 정상 로그인 상태로 시작한다.
import type { Page } from '@playwright/test';

export const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'https://idsxiqspecrucvfvtgbw.supabase.co';
export const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? 'sb_publishable_5H0ITdQ27V7EVO9fcfBdew_V9DUF0Kt';

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
 * 로그인한 사용자 자격으로 PostgREST 를 호출한다 — **테스트가 자기 픽스처를 직접 심기 위한 통로**.
 *
 * 왜 필요한가: 워치독 테스트는 '러닝 중인 클락' 이 DB 에 있어야 성립하는데,
 *   그걸 사람이 SQL 로 미리 심어 두는 방식이었다. 그 행이 만료되거나 지워지는 순간
 *   테스트는 영구 실패로 바뀌고, 그때부터는 '환경 탓' 으로 치부돼 아무도 안 본다.
 *   테스트는 자기가 필요한 상태를 스스로 만들고 스스로 치워야 재현 가능하다.
 *
 * service key 가 아니라 **로그인 사용자의 토큰**을 쓴다 — 앱이 실제로 쓰는 것과 같은 권한이라
 * RLS 를 우회하지 않고, 비밀 키를 저장소에 둘 필요도 없다.
 */
export async function restAs(
  session: E2ESession,
  path: string,
  init: { method?: string; body?: unknown; prefer?: string } = {},
): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${init.method ?? 'GET'} ${path} 실패(${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
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
 *
 * ⚠ 여기서 한 번 크게 물렸다 — 예전 구현은 호출 즉시 `count()===0` 이면 그대로 반환했다.
 *   그런데 OnboardingSheet 는 **첫 페인트 뒤 700ms 에 일부러 늦게** 뜬다(자연스러운 등장).
 *   즉 goto 직후에는 다이얼로그가 아직 0개라 헬퍼가 "치울 게 없다"며 빠져나가고,
 *   그 직후 모달이 떠서 로그인 버튼 클릭을 가로챘다. 부재를 근거로 한 판단이
 *   '아직 안 나타난 것'과 '영원히 없는 것'을 구분하지 못한 전형적인 경합이다.
 *   그래서 첫 바퀴는 지연 등장 구간(1.6s)을 **기다려 준 뒤** 판단한다.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]');
  // 지연 등장(700ms) + 시트 애니메이션을 넉넉히 덮는다. 안 뜨면 그냥 지나간다.
  await dialog.first().waitFor({ state: 'visible', timeout: 1_600 }).catch(() => {});

  for (let i = 0; i < 4; i++) {
    if (!(await dialog.count())) return;
    const skip = dialog.getByRole('button', { name: /건너뛰기|닫기|시작하기|확인/ }).first();
    if (!(await skip.count())) return;
    await skip.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
}
