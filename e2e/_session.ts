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
    // ⚠ addInitScript 는 **모든 프레임**에서 돈다. gtag 같은 서브프레임에서 pushState 를 하면
    //   최상위 joint history 에 '앱이 모르는 항목' 이 끼어든다. 그 항목을 소비하는 뒤로가기는
    //   최상위 history.state 를 바꾸지 않으므로 앱 입장에선 아무 일도 안 일어난 것처럼 보이고,
    //   '뒤로가기로 모달이 안 닫힌다' 는 간헐 실패가 된다(부하가 걸려 iframe 이 늦게 뜰 때 재현).
    //   이 shim 이 필요한 것은 최상위 문서 하나뿐이다.
    if (window.top !== window) return;
    try { history.pushState({ __e2e: true }, ''); } catch { /* noop */ }
  });
}

/**
 * 진입을 가로막는 모달을 걷어낸다.
 * 실패해도 조용히 넘어간다: 모달이 없는 계정에서도 같은 헬퍼를 쓸 수 있어야 한다.
 *
 * 2026-08-28 정합: 이 헬퍼의 존재 이유였던 첫 진입 온보딩 시트(#29, 700ms 지연 등장)가
 *   오너 지시로 삭제됐다. '지연 등장을 기다려 준 뒤 판단'하던 1.6s 선대기는 이제
 *   기다릴 대상이 없는 죽은 대기라 제거한다(단정 완화 아님 — 앱에 부팅 시 자동 등장
 *   모달이 다시 생기면 그 지연 폭만큼의 선대기도 함께 복원할 것).
 *   현재는 '이미 떠 있는' 모달만 걷어낸다(없으면 즉시 통과).
 *
 * ⚠ 다만 그 1.6s 선대기는 온보딩을 기다리는 동시에 '앱 마운트 안정화' 역할도 겸하고 있었다 —
 *   제거하자 느린 CI 러너에서 아직 마운트 전인 화면을 훑고 지나가 tools·backstack 5건이 깨졌다.
 *   그래서 시간 대기가 아니라 '마운트 마커'를 명시적으로 기다린다(고정 지연보다 정확하고 빠르다).
 */
export async function dismissOverlays(page: Page): Promise<void> {
  // 앱이 실제로 붙을 때까지 — 헤더 알림 버튼이 마운트 마커(다른 스펙들과 같은 계약)
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 }).catch(() => {});
  const dialog = page.locator('[role="dialog"]');
  for (let i = 0; i < 4; i++) {
    if (!(await dialog.count())) return;
    const skip = dialog.getByRole('button', { name: /건너뛰기|닫기|시작하기|확인/ }).first();
    if (!(await skip.count())) return;
    await skip.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
}
