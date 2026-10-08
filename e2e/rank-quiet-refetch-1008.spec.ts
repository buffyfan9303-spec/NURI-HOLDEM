// H03-09 후속(2026-10-08 PR #224 독립 검증 verify-224.md 'P3 후속' 1) — 순위 저장 뒤 조용한 재조회가 편집 중인 줄을 덮지 않는다.
//
// 잠그는 것
//   ① 저장 0.3초 뒤 1위 칸을 고쳤는데, 2.5초 늦게 도착한 재조회가 줄 갈아끼우기 effect 를 다시 돌려 '우승자' 로 되돌렸다(검증자 재현 그대로).
//      그래도 재조회 결과(allEntries)는 반영돼야 한다 — 다른 게임으로 갔다 돌아오면 서버 저장본이 깔린다(H03-09 본래 수정).
//   ② 연속 저장 두 번의 재조회가 역순으로 도착하면(앞 저장 응답이 나중) 앞 저장본이 화면에 깔렸다 — 세대 번호로 낡은 응답을 버린다.
// 서버 흉내: save_venue_rankings 가 받은 명단을 '저장본'으로 들고, venue_rankings_public 은 **요청 시점**의 저장본을 지연해 돌려준다.
// 전부 목킹 — 운영 쓰기 0. 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/rank-quiet-refetch-1008.spec.ts
// 음성 대조: PR #224 판(320059ac) 빌드에서 ①·② FAIL, 이 수정 빌드에서 PASS(보고서 audit12/fix-224-followup.md).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

type Entry = { nickname: string; realName: string };
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** 저장본을 들고 있는 가짜 서버. delayOf(저장 회차) 로 재조회 응답을 늦춘다. */
async function bootRanking(page: Page, delayOf: (version: number) => number) {
  const srv = { version: 0, saved: [] as Entry[], event: '' as string | null, served: [] as number[] };
  await bootOwner(page, {
    extra: async (p) => {
      for (const fn of ['search_ranking_members', 'resolve_ranking_members', 'venue_ranking_real_name_optins', 'ledger_business_date']) {
        await p.route(new RegExp(`/rest/v1/rpc/${fn}`), (r) => r.fulfill(json(fn === 'ledger_business_date' ? MOCK_DAY : [])));
      }
      await p.route(/\/rest\/v1\/rpc\/save_venue_rankings/, (r) => {
        const body = r.request().postDataJSON() as { p_entries: Entry[]; p_event?: string | null };
        srv.saved = body.p_entries; srv.event = body.p_event ?? null; srv.version += 1;
        return r.fulfill({ status: 204, body: '' });
      });
      await p.route(/\/rest\/v1\/rpc\/venue_rankings_public/, async (r) => {
        const v = srv.version;                       // 요청 시점의 저장본(응답은 늦게 와도 내용은 이때 것)
        const rows = srv.saved.map((e, i) => ({ venue_id: MOCK_VENUE, ranking_date: MOCK_DAY, position: i + 1, nickname: e.nickname, real_name: e.realName, prize: null, event_name: srv.event }));
        const ms = v > 0 ? delayOf(v) : 0;
        if (ms) await new Promise((res) => setTimeout(res, ms));
        await r.fulfill(json(rows)).catch(() => {});
        if (v > 0) srv.served.push(v);
      });
    },
  });
  await openMyStore(page);
  await page.locator('[data-mystore-rail] [role=tab]').filter({ hasText: '순위' }).first().evaluate((b) => (b as HTMLElement).click());
  const pane = page.locator('[data-pane="ranking"]');
  const nick = pane.locator('input[placeholder="닉네임 *"]');
  await expect(nick.first(), '순위 입력칸(전제)').toBeVisible({ timeout: 20_000 });
  return { srv, pane, nick };
}

const namesOf = async (page: Page) =>
  page.locator('[data-pane="ranking"] input[placeholder="닉네임 *"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).filter(Boolean));

test('🔴 ① 저장 직후 고친 줄은 늦게 온 조용한 재조회가 되돌리지 않는다 · 재조회 결과는 다른 게임 갔다 오면 깔린다', async ({ page }) => {
  test.setTimeout(90_000);
  const { srv, pane, nick } = await bootRanking(page, () => 2_500);
  while (await nick.count() < 3) await pane.getByRole('button', { name: /줄 추가/ }).click();
  for (const [i, n] of ['우승자', '준우승', '삼등'].entries()) await nick.nth(i).fill(n);
  await pane.getByRole('button', { name: /순위 저장$/ }).click();
  await expect.poll(() => srv.version, { message: '저장 RPC 가 나가지 않았다' }).toBe(1);
  await expect(page.getByText(/순위 저장 완료/)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await nick.nth(0).fill('수정중');                       // 저장 0.3초 뒤 1위를 고친다(아직 저장 안 함)
  await expect.poll(() => srv.served.length, { message: '조용한 재조회가 응답되지 않았다(전제)', timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);                          // 응답 반영 커밋까지
  expect(await nick.nth(0).inputValue(), '저장 뒤 고친 1위가 재조회에 덮여 되돌아갔다(H03-09 후속)').toBe('수정중');

  // 양성 대조 — 재조회 결과(allEntries)는 반영됐다: 다른 게임(B)으로 갔다가 메인으로 오면 서버 저장본이 깔린다.
  page.once('dialog', (d) => void d.accept('B게임'));
  await pane.getByRole('button', { name: /직접 추가/ }).click();
  await expect(pane.getByText('B게임').first()).toBeVisible({ timeout: 5_000 });
  await pane.getByRole('button', { name: /메인\(기본\)/ }).click();
  await expect.poll(() => namesOf(page), { message: '메인으로 돌아왔는데 서버 저장본이 아니다(재조회 결과 미반영)' }).toEqual(['우승자', '준우승', '삼등']);
});

test('🔴 ② 연속 저장 두 번의 재조회가 역순으로 와도 앞 저장본이 깔리지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  // 1차 저장 뒤 재조회는 3초, 2차 저장 뒤 재조회는 0.2초 — 1차 응답(낡은 명단)이 나중에 도착한다
  const { srv, pane, nick } = await bootRanking(page, (v) => (v === 1 ? 3_000 : 200));
  while (await nick.count() < 3) await pane.getByRole('button', { name: /줄 추가/ }).click();
  for (const [i, n] of ['우승자', '준우승', '삼등'].entries()) await nick.nth(i).fill(n);
  const save = pane.getByRole('button', { name: /순위 저장$/ });
  await save.click();
  await expect.poll(() => srv.version).toBe(1);
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await nick.nth(0).fill('역전승');
  await save.click();
  await expect.poll(() => srv.version, { message: '2차 저장이 나가지 않았다' }).toBe(2);
  await expect.poll(() => srv.served.includes(1), { message: '1차 재조회가 응답되지 않았다(전제)', timeout: 10_000 }).toBe(true);
  expect(srv.served.includes(2) && srv.served.indexOf(2) < srv.served.indexOf(1), `2차 재조회가 1차보다 먼저 와야 역순 조건이다(전제) served=${srv.served}`).toBe(true);
  await page.waitForTimeout(800);
  expect(await namesOf(page), '나중에 도착한 1차 재조회(낡은 명단)가 화면을 덮었다').toEqual(['역전승', '준우승', '삼등']);
});
