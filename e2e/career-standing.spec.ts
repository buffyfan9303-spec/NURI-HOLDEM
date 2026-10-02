// L-09 (audit-link-1002.md#L-09) — 내 정보 '내 대회 전적' 의 '전국 상위 N%' 는 서버가 센 값(my_career_standing)을 쓴다.
//
// 옛 방식은 순위 보드(global_ranking_totals)를 받아 **지금 닉네임으로 찾았다** — 닉네임을 바꾼 사람은 보드에 내 이름이 없어
// 배지가 안 떴다. 이 스펙은 '보드에는 내 닉네임이 없고, 서버는 내 등수를 안다' 를 만들어 두 방식을 가른다:
//   옛 코드 → 배지 없음(FAIL) / 새 코드 → '전국 상위 33%'(1등/모집단 3).
// 운영 DB 에는 쓰지 않는다 — 세션은 route 로 위조하고 모든 REST/RPC 는 페이지 route 가 가로챈다.
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const jwtOf = (sub: string) => [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub, aud: 'authenticated', role: 'authenticated', exp: exp() }), 'e2e'].join('.');
const A = {
  access_token: jwtOf('00000000-0000-4000-8000-00000000cc01'), refresh_token: 'e2e-ccc', token_type: 'bearer', expires_in: 3600, expires_at: exp(),
  user: { id: '00000000-0000-4000-8000-00000000cc01', aud: 'authenticated', role: 'authenticated', email: 'ccc@example.com',
    app_metadata: {}, user_metadata: { name: 'CCC' }, created_at: new Date().toISOString() },
};
const profile = { id: A.user.id, name: 'CCC', nickname: 'CCC', role: 'user', approved: true, status: 'active', activity_points: 0, created_at: A.user.created_at };
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const rpcName = (r: Route) => /\/rpc\/([a-z_0-9]+)/.exec(r.request().url())?.[1] ?? '';

async function boot(page: Page, standing: unknown, calls: string[]) {
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } }, [KEY, JSON.stringify(A)] as [string, string]);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/(?!rpc\/)/, (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.fulfill(json([])) : r.abort()));
  await page.route(/\/rest\/v1\/rpc\//, (r) => {
    const n = rpcName(r); calls.push(n);
    if (n === 'my_ranking_history') return r.fulfill(json([{ ranking_date: '2026-09-20', position: 1, prize: null, venue_name: '테스트 매장' }]));
    if (n === 'my_career_standing') return r.fulfill(json(standing));
    if (n === 'global_ranking_totals') // 보드에 '내 닉네임(CCC)' 이 없다 — 닉네임을 바꾼 사람의 상황
      return r.fulfill(json([{ nickname: '옛이름', moneyin_count: 5, wins: 1, top3: 2, best_position: 1, venues: 1, last_date: '2026-09-20', real_name: '' }]));
    return r.fulfill(json(null));
  });
  await page.route(/\/rest\/v1\/profiles\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(profile)) : r.abort()));
  await page.route(/\/auth\/v1\/user(\?|$)/, (r) => r.fulfill(json(A.user)));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'CCC 메뉴' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'CCC 메뉴' }).click();
  await page.getByRole('button', { name: '내 정보 열기' }).click();
  await expect(page.locator('h1', { hasText: '내 정보' })).toBeVisible();
}

test.describe('L-09 — 전국 상위 % 는 서버가 센 등수', () => {
  test('🔴 보드에 내 닉네임이 없어도 my_career_standing 의 (1등 / 모집단 3) → "전국 상위 33%"', async ({ page }) => {
    const calls: string[] = [];
    await boot(page, [{ my_rank: 1, population: 3 }], calls);
    await expect(page.getByText('내 대회 전적')).toBeVisible({ timeout: 15_000 }); // 대조 유효: 카드는 떴다
    await expect(page.getByText('전국 상위 33%')).toBeVisible();
    expect(calls, '서버 등수를 부르지 않았다').toContain('my_career_standing');
  });

  test('서버가 행을 안 주면(입상 0건) 배지를 숨긴다 — 거짓 숫자 없음', async ({ page }) => {
    const calls: string[] = [];
    await boot(page, [], calls);
    await expect(page.getByText('내 대회 전적')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => calls.includes('my_career_standing')).toBe(true); // 불렀는데도 안 보인다
    await expect(page.getByText(/전국 상위/)).toHaveCount(0);
  });
});
