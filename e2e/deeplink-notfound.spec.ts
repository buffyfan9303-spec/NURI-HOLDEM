// URL 진입이 실패하면 **말한다** — 조용히 홈을 띄우지 않는다.
//
// 왜: ?post= 와 /s/<코드>(?vnf=) 는 못 찾으면 토스트가 있었는데 ?s=<대회> 와 ?v=<매장> 은 else 분기가 없어
//   업주가 승인 전 포스터 링크를 공유하거나 내려간 포스터 링크를 받은 손님이 '눌렀는데 아무 일도 없음' 을 겪었고,
//   파라미터도 안 지워져 새로고침마다 반복됐다(F04). 소셜 로그인의 PKCE 코드 교환 실패도 같은 모양이었다 —
//   서버가 붙인 ?error= 만 읽었고, 클라이언트 측 교환 실패(initialize() 의 { error })와 검증자 유실
//   (카카오톡 인앱 → 외부 크롬 복귀)은 화면에 아무것도 남기지 않았다(AUTH-14).
// 비로그인 · 읽기만(GET) — 운영 DB 에 쓰지 않는다. 교환 요청(POST token?grant_type=pkce)은 route 로 가로챈다.
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const ZERO = '00000000-0000-0000-0000-000000000000';
const noParam = (page: Page, k: string) =>
  expect.poll(() => new URL(page.url()).searchParams.has(k), { message: `?${k}= 가 URL 에 남아 새로고침마다 반복된다`, timeout: 5_000 }).toBe(false);

test('🔴 ?s=<없는 대회> — 안내 토스트가 뜨고 파라미터가 지워진다', async ({ page }) => {
  await page.goto(`/?s=${ZERO}`);
  await expect(page.getByText(/대회 정보를 확인할 수 없/), '없는 대회 링크인데 아무 안내가 없다').toBeVisible({ timeout: 20_000 });
  await noParam(page, 's');
});

test('🔴 ?v=<없는 매장> — /s/<코드> 와 같은 안내 토스트가 뜨고 파라미터가 지워진다', async ({ page }) => {
  await page.goto('/?v=zzzzzzzz');
  await expect(page.getByText(/매장을 찾을 수 없어요/), '없는 매장 링크인데 아무 안내가 없다').toBeVisible({ timeout: 20_000 });
  await noParam(page, 'v');
});

// (PKCE ?code= 복귀 케이스는 두지 않는다 — 이 앱의 supabase-js 는 기본 implicit flow 라 OAuth 복귀가 #access_token= 으로
//  오고 ?code= 교환은 일어나지 않는다. 2026-09-10 e2e 실측: 교환 실패 토스트 경로는 도달 불가라 코드도 걷어냈다.)
